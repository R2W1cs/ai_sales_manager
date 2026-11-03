#!/usr/bin/env node
/**
 * scripts/find-tailwind-colors.js
 *
 * Scans frontend source files for raw/hardcoded Tailwind CSS color utilities
 * (e.g. `bg-emerald-500`, `text-sky-700`, `border-rose-300`, `hover:bg-amber-500/20`,
 * `bg-black/50`, `text-white`, `border-[#ff0000]`, `[&_svg]:text-amber-400`, etc.)
 *
 * Enforces strict usage of design tokens defined in `apps/web/src/index.css`.
 *
 * Usage:
 *   node scripts/find-tailwind-colors.js [dirs/files...] [options]
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

// 22 standard Tailwind color families
const COLOR_FAMILIES = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

// Tailwind utility prefixes that take colors
const UTILITIES = [
  "bg",
  "text",
  "border(?:-[tbrlsexy])?",
  "ring(?:-offset)?",
  "fill",
  "stroke",
  "outline",
  "from",
  "to",
  "via",
  "divide(?:-[xy])?",
  "accent",
  "caret",
  "shadow",
  "decoration",
  "placeholder",
];

const utilPattern = `(?:${UTILITIES.join("|")})`;
const familyPattern = `(?:${COLOR_FAMILIES.join("|")})`;
const shadePattern = `(?:${SHADES.join("|")})`;
// Opacity suffix: /5, /10, /50, /[0.2], etc.
const opacityPattern = `(?:\\/(?:\\d{1,3}|\\[[^\\]]+\\]))?`;
// Raw single-shade or family-shade colors to flag
const rawColors = `(?:${familyPattern}-${shadePattern}|white|black)`;
// Arbitrary hex, rgb, hsl, hwb, lab, lch, oklab, oklch, color functions in brackets
const arbitraryColorPattern = `\\[(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\([^\\)]+\\))\\]`;

// Variant prefixes: hover:, dark:, group-hover/btn:, peer-checked:, rtl:, @lg:, data-[state=open]:, [&_svg]:, etc.
// ReDoS-safe non-backtracking pattern for arbitrary variants and chained pseudo-classes
const variantPrefix = `(?:(?:\\[[^\\]]+\\]|[^\\s:\\[\\]])+:)*`;

// Full token matcher regex (supports leading/trailing ! important modifiers and opacity on both raw & arbitrary colors)
const CLASS_TOKEN_REGEX = new RegExp(
  `^!?${variantPrefix}!?${utilPattern}-(?:${rawColors}|${arbitraryColorPattern})${opacityPattern}!?$`,
);

// Ignored directories during traversal
const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  "test-results",
  ".turbo",
]);

const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/**
 * Builds a 1D index of line starts for O(log N) line/col lookups and fast line extraction.
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
        const mid = (low + high) >> 1;
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
    getSourceLine(lineNumber) {
      const start = lineStarts[lineNumber - 1];
      if (start === undefined) return "";
      const end = lineStarts[lineNumber] !== undefined ? lineStarts[lineNumber] - 1 : source.length;
      let line = source.slice(start, end);
      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }
      return line;
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
  // Stack tracks nesting of template literals and expressions ${...}
  const stack = [];

  while (i < len) {
    const top = stack.length > 0 ? stack[stack.length - 1] : null;

    if (top && top.type === "template") {
      // Inside a template literal text chunk
      if (source[i] === "\\") {
        i += 2;
        continue;
      }
      if (source[i] === "`") {
        // Closing backtick of template literal
        chunks.push({
          raw: source.slice(top.chunkStart, i),
          index: top.chunkStart,
        });
        stack.pop();
        i++;
        continue;
      }
      if (source[i] === "$" && source[i + 1] === "{") {
        // Start of interpolation expression
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
      if (i < len) i++; // consume closing quote
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

/**
 * Recursively find all source files in directory.
 */
async function findFiles(dir, ignoreTests = false) {
  const files = [];

  async function walk(currentDir) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (ignoreTests && entry.name === "e2e") continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (!ALLOWED_EXTENSIONS.has(ext)) continue;

        if (ignoreTests) {
          if (
            entry.name.includes(".spec.") ||
            entry.name.includes(".test.") ||
            fullPath.includes("/e2e/") ||
            fullPath.includes("/__tests__/")
          ) {
            continue;
          }
        }

        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

/**
 * Scan a single file for raw Tailwind color violations.
 */
async function scanFile(filePath) {
  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch (err) {
    return { file: filePath, error: err.message, violations: [] };
  }

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
      // Clean boundary punctuation (preserve brackets/quotes inside arbitrary selectors/classes)
      const leadingTrim = rawWord.match(/^[("'"`]+/);
      const leadingOffset = leadingTrim ? leadingTrim[0].length : 0;
      const cleaned = rawWord.replace(/^[("'"`]+|[)"'`,;]+$/g, "");

      if (!cleaned) continue;

      if (CLASS_TOKEN_REGEX.test(cleaned)) {
        const matchIndexInSource = chunk.index + match.index + leadingOffset;
        const { line, col } = lineIndex.getLineAndCol(matchIndexInSource);
        const dedupeKey = `${line}:${col}:${cleaned}`;

        if (!seenMatches.has(dedupeKey)) {
          seenMatches.add(dedupeKey);
          violations.push({
            line,
            col,
            className: cleaned,
            snippet: lineIndex.getSourceLine(line).trim(),
          });
        }
      }
    }
  }

  return {
    file: filePath,
    violations,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let failOnError = true;
  let ignoreTests = false;
  let jsonOutput = false;
  let quiet = false;
  const targetPaths = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
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

  // Default target path: apps/web/src
  if (targetPaths.length === 0) {
    targetPaths.push("apps/web/src");
  }

  const allFiles = [];
  for (const target of targetPaths) {
    const resolved = resolve(process.cwd(), target);
    let stats;
    try {
      stats = await stat(resolved);
    } catch {
      console.error(`\x1b[31mError:\x1b[0m Target path does not exist: "${target}" (${resolved})`);
      process.exit(1);
    }

    if (stats.isDirectory()) {
      const files = await findFiles(resolved, ignoreTests);
      allFiles.push(...files);
    } else if (stats.isFile()) {
      allFiles.push(resolved);
    }
  }

  // Scan files in parallel for optimal throughput
  const reports = await Promise.all(allFiles.map(scanFile));
  const scannedReports = [];
  let totalViolations = 0;

  for (const report of reports) {
    if (report.violations.length > 0) {
      scannedReports.push(report);
      totalViolations += report.violations.length;
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
  console.log(` Tailwind CSS Color & Design Token Audit`);
  console.log(` Scanned: ${allFiles.length} file(s) across [${targetPaths.join(", ")}]`);
  console.log(`======================================================\n`);

  if (totalViolations === 0) {
    console.log(`✓ 0 raw Tailwind color classes detected.`);
    console.log(`✓ All styles strictly adhere to semantic design tokens!\n`);
    process.exit(0);
  }

  console.error(
    `✗ Found ${totalViolations} raw Tailwind color violation(s) in ${scannedReports.length} file(s):\n`,
  );

  for (const { file, violations } of scannedReports) {
    const rel = relative(process.cwd(), file);
    console.error(`\x1b[4m${rel}\x1b[0m`);
    for (const { line, col, className, snippet } of violations) {
      console.error(`  \x1b[31m✕\x1b[0m Line ${line}:${col}  \x1b[33m${className}\x1b[0m`);
      if (!quiet) {
        console.error(`    \x1b[90m${snippet}\x1b[0m`);
      }
    }
    console.error("");
  }

  console.error(
    `\x1b[31mFAIL:\x1b[0m Replace the raw color utilities above with design tokens from index.css`,
  );
  console.error(
    `(e.g., bg-primary, text-foreground, bg-warning, bg-destructive, bg-success, border-border, etc.)\n`,
  );

  if (failOnError) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
