import {
  LAUNCH_GATE_MIN_INTERACTIONS,
  LAUNCH_GATE_MIN_MERCHANTS,
  evaluateLaunchGate,
  evaluateMerchantGate,
} from "./gate";

function okMerchant(overrides: Partial<Parameters<typeof evaluateMerchantGate>[0]> = {}) {
  return {
    slug: "sara-stores",
    name: "Sara Stores",
    vertical: "fashion",
    interactions: LAUNCH_GATE_MIN_INTERACTIONS,
    pendingOrders: 2,
    confirmedOrders: 1,
    igConnected: true,
    messengerConnected: true,
    criticalFailures: 0,
    ...overrides,
  };
}

describe("commercial launch gate", () => {
  it("requires at least 20 interactions per merchant", () => {
    expect(LAUNCH_GATE_MIN_INTERACTIONS).toBe(20);
    const result = evaluateMerchantGate(okMerchant({ interactions: 19 }));
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("interactions_below_20");
  });

  it("passes a fully ready merchant", () => {
    expect(evaluateMerchantGate(okMerchant()).passed).toBe(true);
  });

  it("fails closed on critical AI failures", () => {
    const result = evaluateMerchantGate(okMerchant({ criticalFailures: 1 }));
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("critical_failures");
  });

  it("requires three design partners for the launch gate", () => {
    expect(LAUNCH_GATE_MIN_MERCHANTS).toBe(3);
    const two = evaluateLaunchGate([okMerchant(), okMerchant({ slug: "azalee-rose" })]);
    expect(two.passed).toBe(false);
    expect(two.reasons).toContain("need_3_merchants");

    const three = evaluateLaunchGate([
      okMerchant(),
      okMerchant({ slug: "azalee-rose", name: "Azalee Rose", vertical: "cosmetics" }),
      okMerchant({ slug: "magasin-tpl", name: "Magasin TPL", vertical: "electronics" }),
    ]);
    expect(three.passed).toBe(true);
  });

  it("requires Instagram and Messenger on each merchant", () => {
    const result = evaluateMerchantGate(
      okMerchant({ igConnected: false, messengerConnected: false }),
    );
    expect(result.reasons).toEqual(
      expect.arrayContaining(["instagram_not_connected", "messenger_not_connected"]),
    );
  });
});
