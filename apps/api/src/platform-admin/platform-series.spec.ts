import { fillDailySeries, toCountMap } from "./platform-series";

describe("fillDailySeries", () => {
  it("places grouped counts on local calendar days and keeps empty days", () => {
    const since = new Date(2026, 9, 29, 8, 0, 0);
    const now = new Date(2026, 9, 31, 18, 30, 0);

    const series = fillDailySeries(
      since,
      new Map([["2026-10-30", 4]]),
      new Map([["2026-10-31", 2]]),
      now,
    );

    expect(series).toEqual([
      { date: "2026-10-29", messages: 0, aiTurns: 0 },
      { date: "2026-10-30", messages: 4, aiTurns: 0 },
      { date: "2026-10-31", messages: 0, aiTurns: 2 },
    ]);
  });

  it("ignores counts that fall outside the window", () => {
    const since = new Date(2026, 9, 31, 0, 0, 0);
    const now = new Date(2026, 9, 31, 12, 0, 0);

    const series = fillDailySeries(
      since,
      new Map([
        ["2026-10-30", 9],
        ["2026-10-31", 3],
      ]),
      new Map(),
      now,
    );

    expect(series).toEqual([{ date: "2026-10-31", messages: 3, aiTurns: 0 }]);
  });

  it("coerces database counts, including bigint, into numbers", () => {
    expect(toCountMap([{ day: "2026-10-31", count: 4n }])).toEqual(new Map([["2026-10-31", 4]]));
  });
});
