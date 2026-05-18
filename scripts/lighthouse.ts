#!/usr/bin/env node
/**
 * Ejecuta Lighthouse (CLI) sobre las paginas de supermercado ECI.
 * Genera reportes HTML y JSON en reports/lighthouse.
 *
 * Uso:
 *   npm run lighthouse      // usa .env.local
 *   npm run lighthouse:ci   // usa .env.ci
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const projectRoot = path.resolve(__dirname, "..");

const env = process.env.ENV || "local";
const envFileName = `.env.${env}`;
const envFilePath = path.join(projectRoot, envFileName);
if (fs.existsSync(envFilePath)) {
  dotenv.config({ path: envFilePath, override: true });
}

const defaultBaseUrl = "https://www.izertis.com/es/";
const baseUrl = (process.env.BASE_URL_SUPERMERCADO || defaultBaseUrl).replace(/\/$/, "");

const urls: string[] = [
  `${baseUrl}/`
];


const reportsDir = path.join(projectRoot, "reports", "lighthouse");
fs.rmSync(reportsDir, { recursive: true, force: true });
fs.mkdirSync(reportsDir, { recursive: true });

function safeName(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

const npxCommand = "npx";
const useShell = process.platform === "win32";

console.log("===========================================================");
console.log("  Lighthouse - ECI");
console.log(`  Reportes: ${path.relative(projectRoot, reportsDir)}`);
console.log("===========================================================");
console.log(`  BASE_URL: ${baseUrl}`);
console.log(`  URLs a auditar: ${urls.length}`);

for (const url of urls) {
  const name = safeName(url);
  const outputPath = path.join(reportsDir, name);

  console.log("\nAuditoria:", url);

  const result = spawnSync(
    npxCommand,
    [
      "lighthouse",
      url,
      "--only-categories=accessibility,performance,best-practices",
      "--output=html",
      "--output=json",
      `--output-path=${outputPath}`,
      "--chrome-flags=--headless --no-sandbox --disable-gpu",
      "--quiet",
    ],
    {
      cwd: projectRoot,
      stdio: "inherit",
      shell: useShell,
      env: process.env,
    },
  );

  if (result.error) {
    console.error(`  Error lanzando Lighthouse para ${url}:`, result.error.message);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    console.warn(`  Lighthouse finalizo con codigo ${result.status} para ${url}. Continuando...`);
  }

  console.log(`  ${path.relative(projectRoot, outputPath)}.html`);
  console.log(`  ${path.relative(projectRoot, outputPath)}.json`);
}

console.log("\nProceso finalizado. Reportes en reports/lighthouse\n");
