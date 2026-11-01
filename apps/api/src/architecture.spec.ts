import * as fs from "fs";
import * as path from "path";

describe("Nest Module Architecture Boundaries (10 §4)", () => {
  const expectedModules = [
    "auth",
    "businesses",
    "products",
    "customers",
    "conversations",
    "ai",
    "orders",
    "integrations",
    "analytics",
    "notifications",
    "realtime",
    "platform",
  ];

  it.each(expectedModules)("has module directory and module class for '%s'", (mod: string) => {
    const modDir = path.join(__dirname, mod);
    expect(fs.existsSync(modDir)).toBe(true);

    const modFile = path.join(modDir, `${mod}.module.ts`);
    expect(fs.existsSync(modFile)).toBe(true);
  });

  it("prevents forbidden cross-module private imports", () => {
    // Traverse all src files and ensure modules don't import from internal paths of other domain modules
    const srcDir = __dirname;
    const files = getAllTsFiles(srcDir);

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const relative = path.relative(srcDir, file);
      const modName = relative.split(path.sep)[0];

      if (modName && expectedModules.includes(modName)) {
        for (const otherMod of expectedModules) {
          if (otherMod !== modName && otherMod !== "platform") {
            // Should not do deep internal imports into other domain modules like `../otherMod/internal/...`
            const deepImportPattern = new RegExp(`from\\s+['"]\\.\\./${otherMod}/.+['"]`);
            expect(content).not.toMatch(deepImportPattern);
          }
        }
      }
    }
  });
});

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}
