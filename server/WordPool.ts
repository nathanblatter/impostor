import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const WORD_POOL_PATH = join(DATA_DIR, "word-pool.json");
const LOCATION_POOL_PATH = join(DATA_DIR, "location-pool.json");
const CUSTOM_CATEGORIES_PATH = join(DATA_DIR, "custom-categories.json");

const DEFAULT_CATEGORIES = [
  "Animals",
  "Food",
  "Sports",
  "Movies",
  "Countries",
  "Vehicles",
  "Musical Instruments",
  "Clothing",
  "Fruits",
  "Professions",
  "Colors",
  "Furniture",
  "Tools",
  "Desserts",
  "Drinks",
];

export interface WordPool {
  categories: Record<string, string[]>;
}

export interface LocationPool {
  locations: string[];
}

export interface CustomCategories {
  categories: Record<string, string[]>;
}

let wordPool: WordPool = { categories: {} };
let locationPool: LocationPool = { locations: [] };
let customCategories: CustomCategories = { categories: {} };
let roomUsedWords: Map<string, Set<string>> = new Map();
let roomUsedLocations: Map<string, Set<string>> = new Map();

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadFromDisk(): boolean {
  try {
    if (existsSync(WORD_POOL_PATH) && existsSync(LOCATION_POOL_PATH)) {
      wordPool = JSON.parse(readFileSync(WORD_POOL_PATH, "utf-8"));
      locationPool = JSON.parse(readFileSync(LOCATION_POOL_PATH, "utf-8"));
      if (existsSync(CUSTOM_CATEGORIES_PATH)) {
        customCategories = JSON.parse(
          readFileSync(CUSTOM_CATEGORIES_PATH, "utf-8")
        );
      }
      return true;
    }
  } catch {
    // Fall through to generate
  }
  return false;
}

function saveToDisk() {
  ensureDataDir();
  writeFileSync(WORD_POOL_PATH, JSON.stringify(wordPool, null, 2));
  writeFileSync(LOCATION_POOL_PATH, JSON.stringify(locationPool, null, 2));
  writeFileSync(
    CUSTOM_CATEGORIES_PATH,
    JSON.stringify(customCategories, null, 2)
  );
}

async function generateWordPool(): Promise<WordPool> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Generate word lists for a party game. Return ONLY valid JSON, no other text.
For each category, provide 15 single words that are:
- Common enough that most people know them
- Distinct enough within the category to be interesting
- Good for a guessing game where players give 1-word clues

Categories: ${DEFAULT_CATEGORIES.join(", ")}

Format: { "categories": { "Animals": ["Dog", "Cat", ...], ... } }`,
      },
    ],
  });
  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse word pool from AI response");
  return JSON.parse(jsonMatch[0]);
}

async function generateLocationPool(): Promise<LocationPool> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Generate a list of 50 interesting, varied locations for a Spyfall party game. Return ONLY valid JSON, no other text.
Locations should be specific places that are:
- Recognizable to most people
- Varied (mix of indoor, outdoor, public, private, serious, fun)
- Good for a game where players ask questions to find who doesn't know the location

Format: { "locations": ["Beach", "Hospital", "Space Station", ...] }`,
      },
    ],
  });
  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch)
    throw new Error("Failed to parse location pool from AI response");
  return JSON.parse(jsonMatch[0]);
}

export async function init() {
  ensureDataDir();
  if (loadFromDisk()) {
    console.log("Loaded word/location pools from cache.");
    return;
  }
  console.log("Generating word/location pools via AI...");
  try {
    const [wp, lp] = await Promise.all([
      generateWordPool(),
      generateLocationPool(),
    ]);
    wordPool = wp;
    locationPool = lp;
    saveToDisk();
    console.log("Generated and cached word/location pools.");
  } catch (err) {
    console.error("Failed to generate pools via AI, using fallback:", err);
    useFallbackPools();
    saveToDisk();
  }
}

function useFallbackPools() {
  wordPool = {
    categories: {
      Animals: ["Dog", "Cat", "Eagle", "Shark", "Elephant", "Snake", "Penguin", "Horse", "Dolphin", "Bear", "Tiger", "Rabbit", "Wolf", "Owl", "Frog"],
      Food: ["Pizza", "Sushi", "Taco", "Burger", "Pasta", "Steak", "Salad", "Soup", "Sandwich", "Curry", "Ramen", "Bread", "Rice", "Cheese", "Chocolate"],
      Sports: ["Soccer", "Tennis", "Basketball", "Swimming", "Boxing", "Golf", "Cricket", "Rugby", "Hockey", "Volleyball", "Baseball", "Skiing", "Surfing", "Wrestling", "Archery"],
      Movies: ["Titanic", "Avatar", "Jaws", "Rocky", "Inception", "Frozen", "Matrix", "Gladiator", "Alien", "Bambi", "Shrek", "Psycho", "Cars", "Grease", "Moana"],
      Countries: ["Japan", "Brazil", "Egypt", "Canada", "Italy", "Australia", "Mexico", "India", "France", "Kenya", "Norway", "Peru", "Greece", "Thailand", "Iceland"],
      Vehicles: ["Bicycle", "Helicopter", "Submarine", "Motorcycle", "Tractor", "Canoe", "Ambulance", "Skateboard", "Train", "Yacht", "Scooter", "Jet", "Bus", "Truck", "Gondola"],
      "Musical Instruments": ["Piano", "Guitar", "Drums", "Violin", "Trumpet", "Flute", "Harp", "Saxophone", "Cello", "Banjo", "Tuba", "Harmonica", "Ukulele", "Accordion", "Xylophone"],
      Clothing: ["Jacket", "Sandals", "Tie", "Scarf", "Boots", "Gloves", "Hat", "Dress", "Shorts", "Hoodie", "Vest", "Socks", "Belt", "Skirt", "Sweater"],
      Fruits: ["Apple", "Banana", "Mango", "Grape", "Kiwi", "Peach", "Pear", "Cherry", "Lemon", "Orange", "Watermelon", "Coconut", "Pineapple", "Strawberry", "Blueberry"],
      Professions: ["Doctor", "Pilot", "Chef", "Teacher", "Astronaut", "Firefighter", "Detective", "Farmer", "Nurse", "Architect", "Mechanic", "Lawyer", "Artist", "Plumber", "Journalist"],
      Colors: ["Red", "Blue", "Green", "Purple", "Orange", "Pink", "Turquoise", "Gold", "Silver", "Crimson", "Teal", "Ivory", "Maroon", "Lavender", "Indigo"],
      Furniture: ["Chair", "Table", "Sofa", "Bookshelf", "Desk", "Wardrobe", "Bed", "Dresser", "Ottoman", "Cabinet", "Stool", "Bench", "Hammock", "Crib", "Nightstand"],
      Tools: ["Hammer", "Screwdriver", "Wrench", "Drill", "Saw", "Pliers", "Level", "Chisel", "Clamp", "Sandpaper", "Shovel", "Rake", "Axe", "Tape", "Ladder"],
      Desserts: ["Tiramisu", "Brownie", "Cheesecake", "Cookie", "Donut", "Pudding", "Waffle", "Crepe", "Macaron", "Gelato", "Cupcake", "Flan", "Mousse", "Pie", "Sorbet"],
      Drinks: ["Coffee", "Tea", "Lemonade", "Smoothie", "Milkshake", "Espresso", "Juice", "Cocoa", "Cider", "Water", "Soda", "Kombucha", "Matcha", "Mojito", "Cappuccino"],
    },
  };
  locationPool = {
    locations: [
      "Beach", "Hospital", "Space Station", "Casino", "Library", "Zoo", "Airport",
      "Submarine", "Movie Theater", "Circus", "University", "Bank", "Cruise Ship",
      "Police Station", "Restaurant", "Museum", "Amusement Park", "Gym", "Supermarket",
      "Farm", "Cathedral", "Prison", "Ski Resort", "Pirate Ship", "Opera House",
      "Construction Site", "Aquarium", "Train Station", "Hotel", "Vineyard",
      "Haunted House", "Bowling Alley", "Jungle", "Ice Cream Parlor", "Fire Station",
      "Castle", "Desert Oasis", "Arcade", "Lighthouse", "Stadium", "Wedding",
      "Funeral Home", "Laundromat", "Bakery", "Car Wash", "Yoga Studio",
      "Tattoo Parlor", "Escape Room", "Planetarium", "Treehouse",
    ],
  };
}

function getAllCategories(): Record<string, string[]> {
  return { ...wordPool.categories, ...customCategories.categories };
}

export function getWord(roomCode: string): { category: string; word: string } {
  const cats = getAllCategories();
  const catNames = Object.keys(cats);
  if (catNames.length === 0) throw new Error("No categories available");

  if (!roomUsedWords.has(roomCode)) roomUsedWords.set(roomCode, new Set());
  const used = roomUsedWords.get(roomCode)!;

  // Pick a random category, then a random unused word
  for (let attempt = 0; attempt < 50; attempt++) {
    const catName = catNames[Math.floor(Math.random() * catNames.length)];
    const words = cats[catName];
    const available = words.filter((w) => !used.has(`${catName}:${w}`));
    if (available.length === 0) continue;
    const word = available[Math.floor(Math.random() * available.length)];
    used.add(`${catName}:${word}`);
    refreshIfNeeded(catName, available.length - 1);
    return { category: catName, word };
  }

  // If all used, reset tracking
  used.clear();
  const catName = catNames[0];
  const word = cats[catName][0];
  used.add(`${catName}:${word}`);
  return { category: catName, word };
}

export function getLocation(roomCode: string): {
  location: string;
  allLocations: string[];
} {
  const locs = locationPool.locations;
  if (locs.length === 0) throw new Error("No locations available");

  if (!roomUsedLocations.has(roomCode))
    roomUsedLocations.set(roomCode, new Set());
  const used = roomUsedLocations.get(roomCode)!;

  const available = locs.filter((l) => !used.has(l));
  const pool = available.length > 0 ? available : locs;
  if (available.length === 0) used.clear();

  const location = pool[Math.floor(Math.random() * pool.length)];
  used.add(location);
  return { location, allLocations: locs };
}

export function clearRoomTracking(roomCode: string) {
  roomUsedWords.delete(roomCode);
  roomUsedLocations.delete(roomCode);
}

async function refreshIfNeeded(category: string, remaining: number) {
  if (remaining >= 3) return;
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Generate 10 more words for the "${category}" category in a party guessing game.
Words should be common, distinct, and good for 1-word clue giving.
Avoid these existing words: ${(wordPool.categories[category] || []).join(", ")}
Return ONLY a JSON array of strings, no other text. Example: ["Word1", "Word2", ...]`,
        },
      ],
    });
    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const newWords: string[] = JSON.parse(jsonMatch[0]);
      if (!wordPool.categories[category])
        wordPool.categories[category] = [];
      wordPool.categories[category].push(...newWords);
      saveToDisk();
      console.log(`Refreshed category "${category}" with ${newWords.length} new words.`);
    }
  } catch (err) {
    console.error(`Failed to refresh category "${category}":`, err);
  }
}

export async function regenerateAll() {
  const [wp, lp] = await Promise.all([
    generateWordPool(),
    generateLocationPool(),
  ]);
  wordPool = wp;
  locationPool = lp;
  saveToDisk();
}

export function getCustomCategories(): CustomCategories {
  return customCategories;
}

export function getAllCategoryNames(): string[] {
  return [
    ...Object.keys(wordPool.categories),
    ...Object.keys(customCategories.categories),
  ];
}

export async function addCustomCategory(
  name: string,
  words?: string[]
): Promise<string[]> {
  if (words && words.length > 0) {
    customCategories.categories[name] = words;
    saveToDisk();
    return words;
  }
  // Generate words via AI
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Generate 15 words for the "${name}" category in a party guessing game.
Words should be common, distinct, and good for 1-word clue giving.
Return ONLY a JSON array of strings, no other text. Example: ["Word1", "Word2", ...]`,
      },
    ],
  });
  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch)
    throw new Error("Failed to generate words for custom category");
  const generated: string[] = JSON.parse(jsonMatch[0]);
  customCategories.categories[name] = generated;
  saveToDisk();
  return generated;
}

export function removeCustomCategory(name: string): boolean {
  if (customCategories.categories[name]) {
    delete customCategories.categories[name];
    saveToDisk();
    return true;
  }
  return false;
}
