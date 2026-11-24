/**
 * Default AI disclosure + human-escalation copy for Tunisian social commerce (INPDP transparency).
 * Merchants may customize via ai_agents.greeting_template / fallback_template.
 */

export const DEFAULT_AI_GREETING_FR = `Bonjour ! Je suis l'assistant de vente automatisé de la boutique. Je peux vous aider sur les produits, les prix (TND) et le stock. Pour parler à un conseiller humain, écrivez « agent » ou « humain ».`;

export const DEFAULT_AI_FALLBACK_FR = `Je transfère votre demande à un conseiller humain de la boutique. Un instant s'il vous plaît.`;

export const DEFAULT_AI_GREETING_ARABIZI = `3aslema! Ena l'assistant automatique mte3 el boutique. Najem n3awnek 3al produits, el soum (TND) w el stock. Bech ta7ki m3a agent humain, ekteb « agent » wala « humain ».`;

export const DEFAULT_AI_FALLBACK_ARABIZI = `Tawa n7awel el conversation l conseiller humain mte3 el boutique. Wa7da sgheira.`;

/** Prompt contract appended so the model never hides that it is automated. */
export const AI_TRANSPARENCY_PROMPT_BLOCK = `=== AI TRANSPARENCY & HUMAN ESCALATION (INPDP / Law 2004-63) ===
- You ARE an automated sales assistant. If the shopper asks whether you are a bot/AI/robot, answer honestly in one short sentence and continue helping.
- Never pretend to be a physical human employee.
- If the shopper asks for a human, agent, conseiller, or writes phrases like "agent", "humain", "conseiller", "kallamni m3a 7aja", treat it as an immediate human handoff (do not stall).
- On first contact, prefer the merchant greeting_template when provided; it must disclose the automated assistant and how to reach a human.`;
