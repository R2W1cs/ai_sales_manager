// Extracts every ```mermaid block from the design documents into docs/03-design/diagrams/*.mmd
// so the diagram sources are stored as standalone files and stay in sync with the docs.
// Usage: node scripts/extract-diagrams.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, basename } from "node:path";

const designDir = "docs/03-design";
const outDir = join(designDir, "diagrams");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

let count = 0;
for (const file of readdirSync(designDir).filter((f) => f.endsWith(".md"))) {
  const lines = readFileSync(join(designDir, file), "utf8").split("\n");
  const docBase = basename(file, ".md");
  let heading = "diagram";
  let inBlock = false;
  let block = [];
  let index = 0;
  for (const line of lines) {
    if (!inBlock && /^#{2,3} /.test(line)) heading = slug(line.replace(/^#+\s*/, ""));
    if (!inBlock && line.trim() === "```mermaid") {
      inBlock = true;
      block = [];
      continue;
    }
    if (inBlock && line.trim() === "```") {
      inBlock = false;
      index += 1;
      const name = `${docBase}--${String(index).padStart(2, "0")}-${heading}.mmd`;
      writeFileSync(join(outDir, name), block.join("\n") + "\n");
      count += 1;
      continue;
    }
    if (inBlock) block.push(line);
  }
}
console.log(`Extracted ${count} diagrams into ${outDir}`);
