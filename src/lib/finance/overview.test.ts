import { describe, expect, it } from "vitest";
import type { FinanceSale, FinanceTransaction } from "../../types/finance";
import { financeAmount, financeCashFlow, financeDate, financeToday, financeVariation, summarizeFinanceOverview } from "./overview";

const transaction = (overrides: Partial<FinanceTransaction> = {}): FinanceTransaction => ({
  id: "row", company_id: "tenant", direction: "income", status: "paid", due_date: "2026-10-01", paid_at: "2026-10-03",
  description: "Test", counterparty: null, category_id: null, account_id: null, amount_expected: 100,
  amount_paid: 80, payment_method: null, source: "manual", source_hash: null, notes: null, created_at: "2026-10-01T12:00:00Z", ...overrides,
});

describe("finance overview", () => {
  it("uses actual payments and excludes pending, canceled and future payments from cash", () => {
    const rows = [transaction(), transaction({ direction: "expense", amount_paid: 20 }), transaction({ status: "planned", amount_paid: 10, amount_expected: 100 }), transaction({ status: "canceled", amount_paid: 500 }), transaction({ paid_at: "2026-10-10", amount_paid: 1000 })];
    const summary = summarizeFinanceOverview(rows, [], "2026-10-05");
    expect(summary.income).toBe(80);
    expect(summary.expense).toBe(20);
    expect(summary.balance).toBe(60);
    expect(summary.receivables).toBe(90);
    expect(summary.receivableCount).toBe(1);
  });
  it("does not substitute expected amount when an actual payment is zero", () => {
    expect(financeAmount(transaction({ amount_paid: 0 }))).toBe(0);
    expect(financeAmount(transaction({ amount_paid: null }))).toBe(100);
    expect(financeDate(transaction())).toBe("2026-10-03");
    expect(financeDate(transaction({ status: "planned" }))).toBe("2026-10-01");
  });
  it("uses the previous month across year boundaries and calculates only current year cash", () => {
    const rows = [transaction({ paid_at: "2025-12-15", amount_paid: 200 }), transaction({ paid_at: "2026-01-01", amount_paid: 100 })];
    const summary = summarizeFinanceOverview(rows, [], "2026-01-05");
    expect(summary.previousIncome).toBe(200);
    expect(summary.balanceYear).toBe(100);
    expect(financeCashFlow(rows, "2026-01-05", 3).map(point => point.key)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
  it("carries forward earlier cash in the cumulative chart", () => {
    const rows = [transaction({ paid_at: "2025-10-01", amount_paid: 100 }), transaction({ paid_at: "2026-01-01", direction: "expense", amount_paid: 20 })];
    expect(financeCashFlow(rows, "2026-01-05", 3).map(point => point.balance)).toEqual([100, 100, 80]);
  });
  it("does not invent a growth percentage when the previous value is zero", () => {
    expect(financeVariation(0, 0)).toBe("Sem variação");
    expect(financeVariation(10, 0)).toBe("Sem base anterior");
    expect(financeVariation(150, 100)).toBe("+50%");
    expect(financeVariation(-50, -100)).toBe("+50%");
  });
  it("uses Brasilia dates, not UTC dates", () => {
    expect(financeToday(new Date("2026-10-05T01:00:00Z"))).toBe("2026-10-04");
  });
  it("counts awards only on pending sales and does not treat them as paid cash", () => {
    const sales = [{ status: "pending", award_amount: 30 }, { status: "confirmed", award_amount: 50 }, { status: "canceled", award_amount: 60 }] as FinanceSale[];
    const summary = summarizeFinanceOverview([], sales, "2026-10-05");
    expect(summary.awards).toBe(30);
    expect(summary.awardCount).toBe(1);
    expect(summary.income).toBe(0);
  });
});
