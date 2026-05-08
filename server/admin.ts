import { Router } from "express";
import * as WordPool from "./WordPool.js";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const key = process.env.ADMIN_KEY;
  if (!key) {
    return res.status(500).json({ error: "ADMIN_KEY not configured" });
  }
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${key}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

router.use(requireAuth);

router.get("/categories", (_req, res) => {
  res.json({ categories: WordPool.getAllCategoryNames() });
});

router.post("/categories", async (req, res) => {
  const { name, words } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Category name required" });
  }
  try {
    const result = await WordPool.addCustomCategory(name, words);
    res.json({ name, words: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/categories/:name", (req, res) => {
  const removed = WordPool.removeCustomCategory(req.params.name);
  if (removed) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Category not found" });
  }
});

router.post("/regenerate", async (_req, res) => {
  try {
    await WordPool.regenerateAll();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
