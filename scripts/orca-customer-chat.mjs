#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { stdin as input, stdout as output } from "node:process";
/**
 * Interactive customer chat (you = customer, model = shop assistant).
 * Prefers Groq, then OrcaRouter.
 *
 *   node scripts/orca-customer-chat.mjs
 *
 * Env (from apps/api/.env): GROQ_API_KEY / GROQ_MODEL or ORCA_API_KEY / ORCA_MODEL
 */
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(root, "apps/api/.env"));
loadEnvFile(resolve(root, ".env"));

const groqKey = process.env.GROQ_API_KEY;
const orcaKey = process.env.ORCA_API_KEY;

const apiKey = groqKey || orcaKey;
const baseURL = (
  groqKey
    ? process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"
    : process.env.ORCA_BASE_URL || "https://api.orcarouter.ai/v1"
).replace(/\/$/, "");
const model = groqKey
  ? process.env.GROQ_MODEL || "openai/gpt-oss-120b"
  : process.env.ORCA_MODEL || "orcarouter/auto";
const providerLabel = groqKey ? "groq" : "orcarouter";

if (!apiKey) {
  console.error("Missing GROQ_API_KEY or ORCA_API_KEY. Set it in apps/api/.env");
  process.exit(1);
}

const SYSTEM = `You are a Tunisian ecommerce WhatsApp sales assistant for a small clothing/shoes shop.
Reply in Tunisian Derja (Arabic script or latinized as the customer uses). Be warm, concise, sales-oriented.
Ask clarifying questions (size, color, budget). Never invent stock you don't know — say you'll check.
Shop currency: TND. Do not mention you are an AI unless asked.`;

const messages = [{ role: "system", content: SYSTEM }];

async function chat(userText) {
  messages.push({ role: "user", content: userText });
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
    }),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${raw.slice(0, 300)}`);
  }
  if (!res.ok) {
    const msg = data?.error?.message || raw.slice(0, 400);
    throw new Error(`${res.status}: ${msg}`);
  }
  const reply = data.choices?.[0]?.message?.content ?? "(empty)";
  messages.push({ role: "assistant", content: reply });
  return reply;
}

const rl = readline.createInterface({ input, output });
console.log(`Customer chat  provider=${providerLabel}  model=${model}`);
console.log("Type as a customer. Commands: /quit  /reset\n");

while (true) {
  const line = (await rl.question("You (customer): ")).trim();
  if (!line) continue;
  if (line === "/quit" || line === "/exit") break;
  if (line === "/reset") {
    messages.length = 0;
    messages.push({ role: "system", content: SYSTEM });
    console.log("(conversation reset)\n");
    continue;
  }
  try {
    const reply = await chat(line);
    console.log(`\nShop AI: ${reply}\n`);
  } catch (err) {
    console.error(`\nError: ${err.message}\n`);
    messages.pop();
  }
}

rl.close();
console.log("Bye.");
