import { defineConfig } from "vitest/config";

// Standalone vitest config so tests don't inherit vite.config.ts (rooted at client/).
export default defineConfig({
  test: {
    include: ["server/**/*.test.ts", "shared/**/*.test.ts"],
    environment: "node",
  },
});
