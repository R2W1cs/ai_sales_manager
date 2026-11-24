#!/usr/bin/env node
/**
 * CI helper: validate pilot CSV fixtures used by commercial launch gate.
 * Fails closed on missing files or wrong headers.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dir = path.join(root, "fixtures", "pilot");
const REQUIRED = ["sku", "name", "description", "price_tnd", "stock", "size", "color", "category"];
const FILES = ["sara-stores.csv", "azalee-rose.csv", "magasin-tpl.csv"];

let failed = false;

for (const file of FILES) {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) {
    console.error(`FAIL missing fixture: ${file}`);
    failed = true;
    continue;
  }
  const header = fs.readFileSync(full, "utf8").split(/\r?\n/)[0]?.trim().split(",") ?? [];
  const missing = REQUIRED.filter((c) => !header.includes(c));
  const rows = fs
    .readFileSync(full, "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => l.trim());
  if (missing.length) {
    console.error(`FAIL ${file}: missing columns ${missing.join(", ")}`);
    failed = true;
  } else if (rows.length < 20) {
    console.error(`FAIL ${file}: need ≥20 catalog rows for pilot readiness (got ${rows.length})`);
    failed = true;
  } else {
    console.log(`OK  ${file}: ${rows.length} rows, headers valid`);
  }
}

if (failed) {
  process.exit(1);
}
console.log("Pilot fixtures valid.");
