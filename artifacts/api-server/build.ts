import path from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowlist = [
  "@google/generative-ai", "axios", "connect-pg-simple",
  "cors", "date-fns", "drizzle-orm", "drizzle-zod", "express",
  "express-rate-limit", "express-session", "jsonwebtoken",
  "memorystore", "nanoid", "nodemailer", "passport", "passport-local",
  "pg", "stripe", "uuid", "web-push", "ws", "xlsx", "zod", "zod-validation-error",
];

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");
  await rm(distDir, { recursive: true, force: true });

  console.log("building server...");
  const pkgPath = path.resolve(__dirname, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter(
    (dep) =>
      !allowlist.includes(dep) &&
      !(pkg.dependencies?.[dep]?.startsWith("workspace:")),
  );

  await esbuild({
    entryPoints: [path.resolve(__dirname, "src/entry.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: path.resolve(distDir, "index.mjs"),
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  console.log("build done");

  // Remove source files to prevent Vercel from compiling them.
  // The bundle is self-contained — all deps are inlined.
  const srcDir = path.resolve(__dirname, "src");
  await rm(srcDir, { recursive: true, force: true });
  console.log("source removed");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
