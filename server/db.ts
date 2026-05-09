import pg from "pg";

let pool: pg.Pool | null = null;

export async function initDb(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("No DATABASE_URL set, skipping DB.");
    return;
  }

  try {
    pool = new pg.Pool({ connectionString: url });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS generated_assets (
        id SERIAL PRIMARY KEY,
        mode TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_assets_mode ON generated_assets (mode, created_at DESC)
    `);
    console.log("Database connected.");
  } catch (err) {
    console.error("Database init failed, continuing without DB:", err);
    pool = null;
  }
}

export async function saveAsset(mode: string, payload: object): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      "INSERT INTO generated_assets (mode, payload) VALUES ($1, $2)",
      [mode, JSON.stringify(payload)]
    );
  } catch (err) {
    console.error("Failed to save asset:", err);
  }
}

export async function getRecentAssets(mode: string, limit = 5): Promise<any[]> {
  if (!pool) return [];
  try {
    const res = await pool.query(
      "SELECT payload FROM generated_assets WHERE mode = $1 ORDER BY created_at DESC LIMIT $2",
      [mode, limit]
    );
    return res.rows.map((r) => r.payload);
  } catch (err) {
    console.error("Failed to fetch recent assets:", err);
    return [];
  }
}
