import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const WORD_POOL_PATH = join(DATA_DIR, "word-pool.json");
const LOCATION_POOL_PATH = join(DATA_DIR, "location-pool.json");

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

export interface WordPoolData {
  categories: Record<string, string[]>;
}

export interface LocationPoolData {
  locations: Record<string, string[]>; // location -> roles
}

let wordPool: WordPoolData = { categories: {} };
let locationPool: LocationPoolData = { locations: {} };
let roomUsedWords: Map<string, Set<string>> = new Map();
let roomUsedLocations: Map<string, Set<string>> = new Map();

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadFromDisk(): boolean {
  try {
    if (existsSync(WORD_POOL_PATH) && existsSync(LOCATION_POOL_PATH)) {
      wordPool = JSON.parse(readFileSync(WORD_POOL_PATH, "utf-8"));
      const raw = JSON.parse(readFileSync(LOCATION_POOL_PATH, "utf-8"));
      // Migrate old format (string[]) to new format (Record<string, string[]>)
      if (Array.isArray(raw.locations)) {
        locationPool = { locations: {} };
        for (const loc of raw.locations) {
          locationPool.locations[loc] = generateFallbackRoles(loc);
        }
        saveToDisk();
      } else {
        locationPool = raw;
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
}

async function generateWordPool(): Promise<WordPoolData> {
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

async function generateLocationPool(): Promise<LocationPoolData> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Generate locations with associated roles/jobs for a Spyfall party game. Return ONLY valid JSON, no other text.

For each location, provide 8 roles that someone might have at that location.
Roles should be diverse, recognizable, and fun for a guessing game.

Generate 40 locations. Mix of indoor, outdoor, public, private, serious, fun.

Format: { "locations": { "Beach": ["Lifeguard", "Surfer", "Ice Cream Vendor", "Tourist", "Photographer", "Scuba Diver", "Sandcastle Builder", "Beachcomber"], ... } }`,
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

function generateFallbackRoles(location: string): string[] {
  // Generic roles that work for most locations
  const GENERIC_ROLES = ["Manager", "Security Guard", "Visitor", "Employee", "Janitor", "Inspector", "Photographer", "Tourist"];
  const LOCATION_ROLES: Record<string, string[]> = {
    "Beach": ["Lifeguard", "Surfer", "Ice Cream Vendor", "Tourist", "Photographer", "Scuba Diver", "Sandcastle Builder", "Beachcomber"],
    "Hospital": ["Doctor", "Nurse", "Patient", "Surgeon", "Receptionist", "Paramedic", "Visitor", "Pharmacist"],
    "Space Station": ["Astronaut", "Mission Control", "Engineer", "Scientist", "Commander", "Pilot", "Medical Officer", "Communications"],
    "Casino": ["Dealer", "Pit Boss", "Bartender", "High Roller", "Security", "Waitress", "Tourist", "Card Counter"],
    "Library": ["Librarian", "Student", "Author", "Book Club Member", "Archivist", "Janitor", "Tutor", "Reader"],
    "Zoo": ["Zookeeper", "Veterinarian", "Tour Guide", "Visitor", "Photographer", "Gift Shop Clerk", "Curator", "Researcher"],
    "Airport": ["Pilot", "Flight Attendant", "Customs Officer", "Passenger", "Baggage Handler", "Air Traffic Controller", "Shop Clerk", "Security"],
    "Submarine": ["Captain", "Navigator", "Sonar Operator", "Engineer", "Cook", "Torpedo Operator", "Radio Operator", "Diver"],
    "Movie Theater": ["Projectionist", "Ticket Seller", "Usher", "Moviegoer", "Popcorn Vendor", "Manager", "Film Critic", "Janitor"],
    "Circus": ["Ringmaster", "Acrobat", "Clown", "Lion Tamer", "Trapeze Artist", "Juggler", "Audience Member", "Magician"],
    "University": ["Professor", "Student", "Dean", "Librarian", "Janitor", "Teaching Assistant", "Researcher", "Admissions Officer"],
    "Bank": ["Teller", "Manager", "Security Guard", "Customer", "Loan Officer", "Accountant", "Vault Guard", "Financial Advisor"],
    "Cruise Ship": ["Captain", "Passenger", "Entertainer", "Chef", "Bartender", "Deckhand", "Tour Director", "Lifeguard"],
    "Police Station": ["Detective", "Officer", "Chief", "Suspect", "Lawyer", "Forensic Analyst", "Dispatcher", "Witness"],
    "Restaurant": ["Chef", "Waiter", "Dishwasher", "Host", "Sommelier", "Food Critic", "Busboy", "Manager"],
    "Museum": ["Curator", "Tour Guide", "Security Guard", "Visitor", "Restorer", "Historian", "Gift Shop Clerk", "Artist"],
    "Amusement Park": ["Ride Operator", "Mascot", "Visitor", "Cotton Candy Vendor", "Roller Coaster Tester", "Clown", "Photographer", "Ticket Taker"],
    "Gym": ["Personal Trainer", "Bodybuilder", "Receptionist", "Yoga Instructor", "Member", "Janitor", "Nutritionist", "Manager"],
    "Supermarket": ["Cashier", "Stocker", "Manager", "Shopper", "Butcher", "Baker", "Cart Collector", "Deli Worker"],
    "Farm": ["Farmer", "Veterinarian", "Farmhand", "Tractor Driver", "Scarecrow Maker", "Egg Collector", "Milkmaid", "Beekeeper"],
    "Cathedral": ["Priest", "Choir Singer", "Organist", "Tourist", "Altar Boy", "Wedding Planner", "Bell Ringer", "Parishioner"],
    "Prison": ["Warden", "Guard", "Inmate", "Visitor", "Lawyer", "Chaplain", "Cook", "Doctor"],
    "Ski Resort": ["Ski Instructor", "Snowboarder", "Lift Operator", "Lodge Manager", "Ski Patrol", "Tourist", "Bartender", "Equipment Rental"],
    "Pirate Ship": ["Captain", "First Mate", "Navigator", "Cannon Operator", "Cook", "Lookout", "Deckhand", "Prisoner"],
    "Opera House": ["Singer", "Conductor", "Audience Member", "Stage Manager", "Musician", "Usher", "Costume Designer", "Critic"],
    "Construction Site": ["Foreman", "Crane Operator", "Electrician", "Plumber", "Architect", "Safety Inspector", "Bricklayer", "Carpenter"],
    "Aquarium": ["Marine Biologist", "Diver", "Tour Guide", "Visitor", "Gift Shop Clerk", "Fish Feeder", "Veterinarian", "Janitor"],
    "Train Station": ["Conductor", "Ticket Agent", "Passenger", "Engineer", "Porter", "Janitor", "Newsstand Vendor", "Security"],
    "Hotel": ["Concierge", "Bellhop", "Housekeeper", "Guest", "Manager", "Chef", "Doorman", "Receptionist"],
    "Vineyard": ["Winemaker", "Sommelier", "Tourist", "Grape Picker", "Tour Guide", "Owner", "Cellar Master", "Bottler"],
    "Haunted House": ["Ghost", "Vampire", "Visitor", "Witch", "Zombie", "Mummy", "Werewolf", "Skeleton"],
    "Bowling Alley": ["Bowler", "Shoe Clerk", "Mechanic", "Manager", "Bartender", "League Captain", "Spectator", "Janitor"],
    "Jungle": ["Explorer", "Tribe Member", "Photographer", "Biologist", "Guide", "Poacher", "Missionary", "Pilot"],
    "Ice Cream Parlor": ["Scooper", "Customer", "Manager", "Delivery Driver", "Taste Tester", "Cleaner", "Cone Maker", "Cashier"],
    "Fire Station": ["Fire Chief", "Firefighter", "Paramedic", "Dalmatian Handler", "Dispatcher", "Trainee", "Inspector", "Cook"],
    "Castle": ["King", "Queen", "Knight", "Jester", "Servant", "Blacksmith", "Archer", "Wizard"],
    "Arcade": ["Gamer", "Technician", "Prize Counter Clerk", "Manager", "Token Seller", "DJ", "Birthday Kid", "Janitor"],
    "Lighthouse": ["Keeper", "Coast Guard", "Fisherman", "Tourist", "Maintenance Worker", "Bird Watcher", "Navigator", "Painter"],
    "Stadium": ["Athlete", "Coach", "Referee", "Spectator", "Commentator", "Vendor", "Mascot", "Groundskeeper"],
    "Bakery": ["Baker", "Cake Decorator", "Customer", "Cashier", "Delivery Driver", "Pastry Chef", "Health Inspector", "Apprentice"],
  };
  return LOCATION_ROLES[location] || GENERIC_ROLES;
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
  locationPool = { locations: {} };
  const fallbackLocations = [
    "Beach", "Hospital", "Space Station", "Casino", "Library", "Zoo", "Airport",
    "Submarine", "Movie Theater", "Circus", "University", "Bank", "Cruise Ship",
    "Police Station", "Restaurant", "Museum", "Amusement Park", "Gym", "Supermarket",
    "Farm", "Cathedral", "Prison", "Ski Resort", "Pirate Ship", "Opera House",
    "Construction Site", "Aquarium", "Train Station", "Hotel", "Vineyard",
    "Haunted House", "Bowling Alley", "Jungle", "Ice Cream Parlor", "Fire Station",
    "Castle", "Arcade", "Lighthouse", "Stadium", "Bakery",
  ];
  for (const loc of fallbackLocations) {
    locationPool.locations[loc] = generateFallbackRoles(loc);
  }
}

export function getWord(roomCode: string): { category: string; word: string } {
  const cats = wordPool.categories;
  const catNames = Object.keys(cats);
  if (catNames.length === 0) throw new Error("No categories available");

  if (!roomUsedWords.has(roomCode)) roomUsedWords.set(roomCode, new Set());
  const used = roomUsedWords.get(roomCode)!;

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

  used.clear();
  const catName = catNames[0];
  const word = cats[catName][0];
  used.add(`${catName}:${word}`);
  return { category: catName, word };
}

export function getLocation(roomCode: string): {
  location: string;
  roles: string[];
  allLocations: string[];
} {
  const locs = locationPool.locations;
  const locNames = Object.keys(locs);
  if (locNames.length === 0) throw new Error("No locations available");

  if (!roomUsedLocations.has(roomCode))
    roomUsedLocations.set(roomCode, new Set());
  const used = roomUsedLocations.get(roomCode)!;

  const available = locNames.filter((l) => !used.has(l));
  const pool = available.length > 0 ? available : locNames;
  if (available.length === 0) used.clear();

  const location = pool[Math.floor(Math.random() * pool.length)];
  used.add(location);
  return {
    location,
    roles: locs[location] || [],
    allLocations: locNames,
  };
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

export function getAllCategoryNames(): string[] {
  return Object.keys(wordPool.categories);
}
