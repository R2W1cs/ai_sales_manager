/**
 * T-BOOT-01/c — reject forbidden BFS addons as direct workspace dependencies.
 * Transitive lockfile entries (e.g. tooling) are not flagged.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Package name substrings forbidden as direct workspace deps (11 §2.1 / T-BOOT-01/c). */
const FORBIDDEN_PATTERNS = ["storybook", "biome", "zustand", "vitest", "msw", "stripe"];

/** Direct @radix-ui/* UI addon packages (not transitive shadcn/base-ui peers). */
const FORBIDDEN_RADIX_PREFIX = "@radix-ui/";

function workspacePackageJsonPaths() {
  const paths = [];
  for (const scope of ["apps", "packages"]) {
    const scopeDir = join(root, scope);
    for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      paths.push(join(scopeDir, entry.name, "package.json"));
    }
  }
  paths.push(join(root, "package.json"));
  return paths;
}

function directDependencyNames(pkgJson) {
  const names = [];
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const deps = pkgJson[section];
    if (deps && typeof deps === "object") {
      names.push(...Object.keys(deps));
    }
  }
  return names;
}

function isForbidden(name) {
  const lower = name.toLowerCase();
  if (FORBIDDEN_PATTERNS.some((p) => lower.includes(p))) {
    return true;
  }
  if (name.startsWith(FORBIDDEN_RADIX_PREFIX)) {
    return true;
  }
  return false;
}

const violations = [];

for (const path of workspacePackageJsonPaths()) {
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  for (const dep of directDependencyNames(pkg)) {
    if (isForbidden(dep)) {
      violations.push({ file: path.replace(root + "/", ""), package: dep });
    }
  }
}

if (violations.length > 0) {
  console.error("Forbidden direct workspace dependencies found:");
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.package}`);
  }
  process.exit(1);
}

console.log("No forbidden direct workspace dependencies.");
