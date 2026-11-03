#!/usr/bin/env node
/**
 * scripts/check-corner-radius.js
 *
 * Scans frontend source files for non-standard Tailwind CSS border-radius utilities
 * (e.g. bare `rounded`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-4xl`,
 * `rounded-xs`, `rounded-[...]`, etc.)
 *
 * Enforces strict usage of canonical design tokens:
 * - `rounded-lg`: 8px (--radius: 0.5rem, cards, dialogs/modals, panels, sheet popups, column wrappers)
 * - `rounded-md`: 6px (--radius-md, form inputs, buttons, search bars, skeletons, popovers, alert callouts)
 * - `rounded-sm`: 4px (--radius-sm, badges, tags, chips, checkboxes, dropdown menu items, kbd)
 * - `rounded-full`: status indicators/dots (8px), circular avatars, pill badges
 * - `rounded-none`: explicit zero-radius / flush edges
 *
 * Usage:
 *   node scripts/check-corner-radius.js [dirs/files...] [options]
 *
 * Options:
 *   --fail          Exit with code 1 if violations found (default: true)
 *   --no-fail       Exit with code 0 even if violations found
 *   --ignore-tests  Skip *.spec.*, *.test.*, and e2e/ files
 *   --json          Output results as JSON
 *   --quiet         Print only filenames and summary
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import process from "node:process";

// Allowed directional prefixes: e.g. t, b, l, r, s, e, ss, se, ee, es
const DIRECTIONAL_PREFIXES = "(?:(?:t|b|l|r|s|e|ss|se|ee|es)-)?";

// Allowed radius utility patterns (none, sm, md, lg, full with optional directional prefixes)
const ALLOWED_RADIUS_REGEX = new RegExp(`^rounded-${DIRECTIONAL_PREFIXES}(none|sm|md|lg|full)$`);

// ReDoS-safe non-backtracking pattern for arbitrary variants and chained pseudo-classes
const variantPrefix = `(?:(?:\\[[^\\]]+\\]|[^\\s:\\[\\]])+:)*`;

// Regex strictly matching a Tailwind corner-radius token (starts with optional variants + rounded)
const RADIUS_TOKEN_REGEX = new RegExp(
  `^!?${variantPrefix}rounded(?:-(?:(?:t|b|l|r|s|e|ss|se|ee|es)-)?[a-zA-Z0-9_\\[\\]/]+)?$`,
);

const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".turbo",
  ".git",
  "coverage",
  ".cache",
]);

/**
 * Builds a 1D index of line starts for O(log N) line/col lookups and line extraction.
 */
function buildLineIndex(source) {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }

  return {
    getLineAndCol(offset) {
      let low = 0;
      let high = lineStarts.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lineStarts[mid] <= offset) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      const line = high + 1;
      const col = offset - lineStarts[high] + 1;
      return { line, col };
    },
    getSourceLine(line) {
      const start = lineStarts[line - 1] ?? 0;
      const end = lineStarts[line] ?? source.length;
      let lineText = source.slice(start, end);
      if (lineText.endsWith("\n")) {
        lineText = lineText.slice(0, -1);
      }
      if (lineText.endsWith("\r")) {
        lineText = lineText.slice(0, -1);
      }
      return lineText;
    },
  };
}

/**
 * Robust lexical scanner that extracts string literals and template literal chunks,
 * correctly ignoring comments and recursively handling nested template expressions ${...}.
 */
function extractStringChunks(source) {
  const chunks = [];
  const len = source.length;
  let i = 0;
  const stack = [];

  while (i < len) {
    const top = stack.length > 0 ? stack[stack.length - 1] : null;

    if (top && top.type === "template") {
      if (source[i] === "\\") {
        i += 2;
        continue;
      }
      if (source[i] === "`") {
        chunks.push({
          raw: source.slice(top.chunkStart, i),
          index: top.chunkStart,
        });
        stack.pop();
        i++;
        continue;
      }
      if (source[i] === "$" && source[i + 1] === "{") {
        chunks.push({
          raw: source.slice(top.chunkStart, i),
          index: top.chunkStart,
        });
        i += 2;
        stack.push({ type: "expr", braceDepth: 1 });
        continue;
      }
      i++;
      continue;
    }

    const ch = source[i];

    // Single-line comment
    if (ch === "/" && source[i + 1] === "/") {
      i += 2;
      while (i < len && source[i] !== "\n") i++;
      continue;
    }

    // Multi-line comment
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < len && !(source[i] === "*" && source[i + 1] === "/")) i++;
      if (i < len) i += 2;
      continue;
    }

    // Regular string literal (single or double quotes)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i + 1;
      i++;
      while (i < len && source[i] !== quote) {
        if (source[i] === "\\") i++;
        i++;
      }
      chunks.push({
        raw: source.slice(start, i),
        index: start,
      });
      if (i < len) i++;
      continue;
    }

    // Start of template literal
    if (ch === "`") {
      i++;
      stack.push({ type: "template", chunkStart: i });
      continue;
    }

    // Interpolation expression brace tracking
    if (top && top.type === "expr") {
      if (ch === "{") {
        top.braceDepth++;
      } else if (ch === "}") {
        top.braceDepth--;
        if (top.braceDepth === 0) {
          stack.pop();
          const parent = stack[stack.length - 1];
          if (parent && parent.type === "template") {
            parent.chunkStart = i + 1;
          }
        }
      }
    }

    i++;
  }

  return chunks;
}

async function collectFiles(paths, ignoreTests) {
  const files = [];

  for (const p of paths) {
    const absPath = resolve(p);
    try {
      const s = await stat(absPath);
      if (s.isDirectory()) {
        await walkDir(absPath, files, ignoreTests);
      } else if (s.isFile()) {
        if (SUPPORTED_EXTENSIONS.has(extname(absPath))) {
          if (!ignoreTests || !isTestFile(absPath)) {
            files.push(absPath);
          }
        }
      }
    } catch {
      // Ignore paths that do not exist
    }
  }

  return files;
}

async function walkDir(dir, files, ignoreTests) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        await walkDir(join(dir, entry.name), files, ignoreTests);
      }
    } else if (entry.isFile()) {
      if (SUPPORTED_EXTENSIONS.has(extname(entry.name))) {
        const fullPath = join(dir, entry.name);
        if (!ignoreTests || !isTestFile(fullPath)) {
          files.push(fullPath);
        }
      }
    }
  }
}

function isTestFile(path) {
  return (
    path.includes(".spec.") ||
    path.includes(".test.") ||
    path.includes("/__tests__/") ||
    path.includes("/e2e/")
  );
}

function scanContent(content) {
  const lineIndex = buildLineIndex(content);
  const chunks = extractStringChunks(content);
  const violations = [];
  const seenMatches = new Set();
  const WORD_REGEX = /[^\s]+/g;

  for (const chunk of chunks) {
    WORD_REGEX.lastIndex = 0;
    let match;

    while ((match = WORD_REGEX.exec(chunk.raw)) !== null) {
      const rawWord = match[0];
      const leadingTrim = rawWord.match(/^[("'"`]+/);
      const leadingOffset = leadingTrim ? leadingTrim[0].length : 0;
      const cleaned = rawWord.replace(/^[("'"`]+|[)"'`,;]+$/g, "");

      if (!cleaned) continue;

      if (RADIUS_TOKEN_REGEX.test(cleaned)) {
        const baseCls = cleaned.split(":").pop().replace(/^!/, "");

        if (!ALLOWED_RADIUS_REGEX.test(baseCls)) {
          const matchIndexInSource = chunk.index + match.index + leadingOffset;
          const { line, col } = lineIndex.getLineAndCol(matchIndexInSource);
          const dedupeKey = `${line}:${col}:${cleaned}`;

          if (!seenMatches.has(dedupeKey)) {
            seenMatches.add(dedupeKey);

            let suggestion = "rounded-lg";
            if (baseCls === "rounded") {
              suggestion =
                "rounded-sm (for badges/chips/checkboxes) or rounded-md (for buttons/inputs)";
            } else if (baseCls.includes("xl") || baseCls.includes("2xl")) {
              suggestion = baseCls.replace(/(?:xl|2xl|3xl|4xl)/, "lg");
            } else if (baseCls.includes("xs")) {
              suggestion = baseCls.replace("xs", "sm");
            }

            violations.push({
              line,
              col,
              fullToken: cleaned,
              baseCls,
              suggestion,
              snippet: lineIndex.getSourceLine(line).trim(),
            });
          }
        }
      }
    }
  }

  return violations;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  let failOnError = true;
  let ignoreTests = false;
  let jsonOutput = false;
  let quiet = false;
  const targetPaths = [];

  for (const arg of rawArgs) {
    if (arg === "--fail") {
      failOnError = true;
    } else if (arg === "--no-fail") {
      failOnError = false;
    } else if (arg === "--ignore-tests") {
      ignoreTests = true;
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (arg === "--quiet") {
      quiet = true;
    } else if (!arg.startsWith("--")) {
      targetPaths.push(arg);
    }
  }

  if (targetPaths.length === 0) {
    targetPaths.push("apps/web/src");
  }

  const allFiles = await collectFiles(targetPaths, ignoreTests);

  const scannedReports = [];
  let totalViolations = 0;

  for (const file of allFiles) {
    try {
      const content = await readFile(file, "utf8");
      const violations = scanContent(content);
      if (violations.length > 0) {
        scannedReports.push({ file, violations });
        totalViolations += violations.length;
      }
    } catch (err) {
      console.error(`Error reading ${file}:`, err);
    }
  }

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          scannedFiles: allFiles.length,
          violationsCount: totalViolations,
          filesWithViolations: scannedReports.length,
          reports: scannedReports,
        },
        null,
        2,
      ),
    );
    if (failOnError && totalViolations > 0) process.exit(1);
    return;
  }

  console.log(`\n======================================================`);
  console.log(` Tailwind CSS Corner Radius & Design Token Audit`);
  console.log(` Scanned: ${allFiles.length} file(s) across [${targetPaths.join(", ")}]`);
  console.log(`======================================================\n`);

  if (totalViolations === 0) {
    console.log(`✓ 0 non-standard corner radius classes detected.`);
    console.log(`✓ All components strictly adhere to canonical radius tokens:\n`);
    console.log(`    • rounded-lg (8px: cards, dialogs, panels, columns)`);
    console.log(`    • rounded-md (6px: buttons, inputs, skeletons, popovers)`);
    console.log(`    • rounded-sm (4px: badges, tags, chips, checkboxes, kbd)`);
    console.log(`    • rounded-full (8px unread dot, status dots, circular avatars)`);
    console.log(`    • rounded-none (explicit zero-radius)\n`);
    process.exit(0);
  }

  console.error(
    `✗ Found ${totalViolations} non-standard border radius violation(s) in ${scannedReports.length} file(s):\n`,
  );

  for (const { file, violations } of scannedReports) {
    const rel = relative(process.cwd(), file);
    console.error(`\x1b[4m${rel}\x1b[0m`);
    for (const { line, col, fullToken, suggestion, snippet } of violations) {
      console.error(
        `  \x1b[31m✕\x1b[0m Line ${line}:${col}  \x1b[33m${fullToken}\x1b[0m → suggest: \x1b[32m${suggestion}\x1b[0m`,
      );
      if (!quiet) {
        console.error(`    \x1b[90m${snippet}\x1b[0m`);
      }
    }
    console.error("");
  }

  console.error(
    `\x1b[31mFAIL:\x1b[0m Replace the non-standard radius utilities above with canonical tokens from index.css`,
  );
  console.error(
    `(e.g., rounded-lg for cards/dialogs, rounded-md for inputs/buttons, rounded-sm for badges/chips)\n`,
  );

  if (failOnError) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
