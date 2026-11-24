/**
 * Commercial launch-gate evaluator for Tunisia design-partner pilots.
 * Gate criteria (product): 3 merchants, ≥20 successful interactions each,
 * IG + Messenger connected, ≥1 confirmed COD order, zero critical failures.
 */

export const LAUNCH_GATE_MIN_MERCHANTS = 3;
export const LAUNCH_GATE_MIN_INTERACTIONS = 20;

export type MerchantGateRow = {
  slug: string;
  name: string;
  vertical: string;
  interactions: number;
  pendingOrders: number;
  confirmedOrders: number;
  igConnected: boolean;
  messengerConnected: boolean;
  criticalFailures: number;
};

export type MerchantGateResult = MerchantGateRow & {
  passed: boolean;
  reasons: string[];
};

export type LaunchGateResult = {
  passed: boolean;
  reasons: string[];
  merchants: MerchantGateResult[];
};

export function evaluateMerchantGate(row: MerchantGateRow): MerchantGateResult {
  const reasons: string[] = [];

  if (row.interactions < LAUNCH_GATE_MIN_INTERACTIONS) {
    reasons.push(`interactions_below_${LAUNCH_GATE_MIN_INTERACTIONS}`);
  }
  if (!row.igConnected) {
    reasons.push("instagram_not_connected");
  }
  if (!row.messengerConnected) {
    reasons.push("messenger_not_connected");
  }
  if (row.criticalFailures > 0) {
    reasons.push("critical_failures");
  }
  if (row.confirmedOrders < 1) {
    reasons.push("no_confirmed_cod_order");
  }

  return { ...row, passed: reasons.length === 0, reasons };
}

export function evaluateLaunchGate(merchants: MerchantGateRow[]): LaunchGateResult {
  const reasons: string[] = [];

  if (merchants.length < LAUNCH_GATE_MIN_MERCHANTS) {
    reasons.push(`need_${LAUNCH_GATE_MIN_MERCHANTS}_merchants`);
  }

  const results = merchants.map(evaluateMerchantGate);
  if (results.some((r) => !r.passed)) {
    reasons.push("one_or_more_merchants_failed");
  }

  return {
    passed: reasons.length === 0 && results.every((r) => r.passed),
    reasons,
    merchants: results,
  };
}
