import * as esbuild from "esbuild";
import { existsSync, mkdirSync, copyFileSync } from "fs";

const isDev = process.argv.includes("--dev");

if (!existsSync("dist")) mkdirSync("dist", { recursive: true });
if (!existsSync("dist/client")) mkdirSync("dist/client", { recursive: true });

// Copy static files
copyFileSync("client/index.html", "dist/client/index.html");
copyFileSync("client/style.css", "dist/client/style.css");

// Build server
const serverBuild = esbuild.build({
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

// Build client
const clientBuild = esbuild.build({
  entryPoints: ["client/main.ts"],
  bundle: true,
  platform: "browser",
  target: "es2022",
  format: "esm",
  outdir: "dist/client",
  sourcemap: isDev,
});

await Promise.all([serverBuild, clientBuild]);
console.log("Build complete.");

if (isDev) {
  // Watch mode
  const serverCtx = await esbuild.context({
    entryPoints: ["server/main.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outdir: "dist/server",
    packages: "external",
    sourcemap: true,
    banner: {
      js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
    },
  });

  const clientCtx = await esbuild.context({
    entryPoints: ["client/main.ts"],
    bundle: true,
    platform: "browser",
    target: "es2022",
    format: "esm",
    outdir: "dist/client",
    sourcemap: true,
  });

  await Promise.all([serverCtx.watch(), clientCtx.watch()]);
  console.log("Watching for changes...");
}
