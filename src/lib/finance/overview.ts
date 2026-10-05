import type { FinanceSale, FinanceTransaction } from "../../types/finance";

export function financeNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function financeAmount(row: FinanceTransaction) {
  return financeNumber(row.status === "paid" ? row.amount_paid ?? row.amount_expected : row.amount_expected);
}

export function financeDate(row: FinanceTransaction) {
  return (row.status === "paid" ? row.paid_at ?? row.due_date : row.due_date).slice(0, 10);
}

export function financeToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function financeMonthKey(year: number, month: number) {
  const date = new Date(Date.UTC(year, month, 1));
  return date.toISOString().slice(0, 7);
}

export function summarizeFinanceOverview(transactions: FinanceTransaction[], sales: FinanceSale[], today: string) {
  const month = today.slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const previousMonth = financeMonthKey(year, monthNumber - 2);
  const realized = transactions.filter(row => row.status === "paid" && financeDate(row) <= today);
  const inMonth = (key: string, direction: string) => realized.filter(row => financeDate(row).startsWith(key) && row.direction === direction).reduce((sum, row) => sum + financeAmount(row), 0);
  const income = inMonth(month, "income");
  const expense = inMonth(month, "expense");
  const previousIncome = inMonth(previousMonth, "income");
  const previousExpense = inMonth(previousMonth, "expense");
  const open = transactions.filter(row => row.status === "planned" || row.status === "overdue");
  const receivables = open.filter(row => row.direction === "income");
  const payables = open.filter(row => row.direction === "expense");
  const outstanding = (rows: FinanceTransaction[]) => rows.reduce((sum, row) => sum + Math.max(0, financeNumber(row.amount_expected) - financeNumber(row.amount_paid)), 0);
  const awards = sales.filter(row => row.status === "pending" && financeNumber(row.award_amount) > 0);
  const balanceYear = realized.filter(row => financeDate(row).startsWith(String(year))).reduce((sum, row) => sum + (row.direction === "income" ? 1 : -1) * financeAmount(row), 0);
  return { income, expense, balance: income - expense, previousIncome, previousExpense,
    previousBalance: previousIncome - previousExpense, balanceYear,
    receivables: outstanding(receivables), receivableCount: receivables.length,
    payables: outstanding(payables), payableCount: payables.length,
    awards: awards.reduce((sum, row) => sum + financeNumber(row.award_amount), 0), awardCount: awards.length };
}

export function financeCashFlow(transactions: FinanceTransaction[], today: string, months: number) {
  const [year, month] = today.split("-").map(Number);
  const keys = Array.from({ length: months }, (_, index) => financeMonthKey(year, month - months + index));
  const realized = transactions.filter(row => row.status === "paid" && financeDate(row) <= today);
  let cumulative = realized.filter(row => financeDate(row).slice(0, 7) < keys[0]).reduce((sum, row) => sum + (row.direction === "income" ? 1 : -1) * financeAmount(row), 0);
  return keys.map(key => {
    const rows = realized.filter(row => financeDate(row).startsWith(key));
    const income = rows.filter(row => row.direction === "income").reduce((sum, row) => sum + financeAmount(row), 0);
    const expense = rows.filter(row => row.direction === "expense").reduce((sum, row) => sum + financeAmount(row), 0);
    cumulative += income - expense;
    return { key, income, expense, balance: cumulative };
  });
}

export function financeVariation(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "Sem variação" : "Sem base anterior";
  const change = (current - previous) / Math.abs(previous) * 100;
  return `${change > 0 ? "+" : change < 0 ? "-" : ""}${Math.abs(change).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
