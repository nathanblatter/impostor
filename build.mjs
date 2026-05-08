import * as esbuild from "esbuild";
import { execSync } from "child_process";

const isDev = process.argv.includes("--dev");

// Build server with esbuild
await esbuild.build({
  entryPoints: ["server/main.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outdir: "dist/server",
  packages: "external",
  sourcemap: isDev,
  banner: {
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
});
console.log("Server build complete.");

// Build client with Vite
execSync("npx vite build", { stdio: "inherit" });
console.log("Client build complete.");
