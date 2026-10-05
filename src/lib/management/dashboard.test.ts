import { describe, expect, it } from "vitest";
import { formatDailyComparison, formatDashboardAction, getDashboardDayRanges } from "./dashboard";

describe("management dashboard", () => {
  it("uses the Brasilia date before UTC midnight rolls over locally", () => {
    expect(getDashboardDayRanges(new Date("2026-10-05T01:00:00Z"))).toEqual({
      yesterdayStart: "2026-10-03T03:00:00.000Z",
      todayStart: "2026-10-04T03:00:00.000Z",
      tomorrowStart: "2026-10-05T03:00:00.000Z",
    });
  });
  it("handles month and year boundaries", () => {
    expect(getDashboardDayRanges(new Date("2026-01-01T15:00:00Z")).yesterdayStart).toBe("2025-12-31T03:00:00.000Z");
  });
  it("does not invent a percentage when yesterday is zero", () => {
    expect(formatDailyComparison(3, 0)).toBe("Ontem: 0 · +3 hoje");
    expect(formatDailyComparison(0, 0)).toBe("Ontem: 0 · Sem variação");
  });
  it("compares increases, decreases and unchanged counts", () => {
    expect(formatDailyComparison(6, 3)).toBe("Ontem: 3 · +100%");
    expect(formatDailyComparison(0, 3)).toBe("Ontem: 3 · -100%");
    expect(formatDailyComparison(3, 3)).toBe("Ontem: 3 · 0%");
  });
  it("translates persisted actions without leaking internal identifiers", () => {
    expect(formatDashboardAction("calculation.created")).toBe("Simulação criada");
    expect(formatDashboardAction("pre_sale.created")).toBe("Pré-venda criada");
    expect(formatDashboardAction("future.action")).toBe("Atividade registrada");
  });
});
