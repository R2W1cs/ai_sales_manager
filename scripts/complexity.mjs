/**
 * McCabe-style cyclomatic complexity for TypeScript.
 *
 * A function starts at 1. Each decision adds 1:
 * if, for, for-of, for-in, while, do, case, catch, ?:, &&, ||.
 * else does not add a decision. Nested functions are counted separately.
 *
 * This is a static source metric, not a runtime profile.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error("usage: node scripts/complexity.mjs <dir> [dir...]");
  process.exit(1);
}

const decisions = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
]);

function walkFiles(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".next") continue;
      walkFiles(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.(spec|test)\.(ts|tsx)$/.test(entry)) out.push(full);
  }
}

function functionName(node) {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionExpression(node)
  ) {
    return node.name?.getText() ?? "(anonymous)";
  }
  if (ts.isArrowFunction(node) || ts.isConstructorDeclaration(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
    if (ts.isMethodDeclaration(parent) && parent.name) return parent.name.getText();
    if (ts.isConstructorDeclaration(node)) return "constructor";
    return "(arrow)";
  }
  return "(function)";
}

function complexityOf(node) {
  let score = 1;
  function visit(current) {
    if (current !== node && ts.isFunctionLike(current)) return;
    if (
      decisions.has(current.kind) ||
      (ts.isBinaryExpression(current) &&
        (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          current.operatorToken.kind === ts.SyntaxKind.BarBarToken))
    ) {
      if (current !== node) score += 1;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return score;
}

const files = [];
for (const root of roots) walkFiles(root, files);

const functions = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  function visit(node) {
    if (ts.isFunctionLike(node) && node.body) {
      functions.push({
        file: path.relative(process.cwd(), file).replaceAll("\\", "/"),
        name: functionName(node),
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        complexity: complexityOf(node),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

functions.sort((a, b) => b.complexity - a.complexity);
const total = functions.reduce((sum, item) => sum + item.complexity, 0);
const over10 = functions.filter((item) => item.complexity > 10);
const over20 = functions.filter((item) => item.complexity > 20);
const summary = {
  files: files.length,
  functions: functions.length,
  totalComplexity: total,
  mean: functions.length ? Number((total / functions.length).toFixed(2)) : 0,
  max: functions[0]?.complexity ?? 0,
  over10: over10.length,
  over20: over20.length,
  top: functions.slice(0, 25),
  hot: functions.filter((item) => item.complexity >= 15),
};
console.log(JSON.stringify(summary, null, 2));
