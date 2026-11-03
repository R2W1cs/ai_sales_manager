export interface DailyPoint {
  date: string;
  messages: number;
  aiTurns: number;
}

export function dayKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Fills one point per local calendar day from `since` through `now`.
 * Counts come from a grouped query, so missing days stay at zero.
 */
export function fillDailySeries(
  since: Date,
  messagesByDay: ReadonlyMap<string, number>,
  aiTurnsByDay: ReadonlyMap<string, number>,
  now = new Date(),
): DailyPoint[] {
  const points: DailyPoint[] = [];
  const cursor = new Date(since);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= end.getTime()) {
    const date = dayKey(cursor);
    points.push({
      date,
      messages: messagesByDay.get(date) ?? 0,
      aiTurns: aiTurnsByDay.get(date) ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

export function toCountMap(
  rows: ReadonlyArray<{ day: string; count: number | bigint }>,
): Map<string, number> {
  return new Map(rows.map((row) => [row.day, Number(row.count)]));
}
