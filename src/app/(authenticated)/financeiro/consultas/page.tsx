import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Calculator,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { FinanceNavigation } from "@/components/finance/finance-navigation";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { resolveUserDisplayName } from "@/lib/users/account";
import {
  deleteFinanceChargebackAction,
  deleteFinanceSaleAction,
  deleteFinanceTransactionAction,
} from "../actions";
import type {
  FinanceChargeback,
  FinanceSale,
  FinanceTransaction,
} from "@/types/finance";
import type { LegalCommissionTier } from "@/types/legal-payment";

type ConsultaFinanceiraPageProps = {
  searchParams: Promise<{
    tipo?: string;
    start?: string;
    end?: string;
    consultant?: string;
    status?: string;
    success?: string;
    error?: string;
  }>;
};

type CommercialUser = {
  id: string;
  full_name: string | null;
  nickname: string | null;
  username: string | null;
  role: string | null;
  business_area: string | null;
};

type FinanceRow =
  | { kind: "transaction"; data: FinanceTransaction }
  | { kind: "chargeback"; data: FinanceChargeback };

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR");
const timeZone = "America/Sao_Paulo";

type CommissionBracket = {
  goal: number;
  rate: number;
};

const commissionBrackets: CommissionBracket[] = [
  { goal: 40000, rate: 0.25 },
  { goal: 35000, rate: 0.25 },
  { goal: 30000, rate: 0.25 },
  { goal: 25000, rate: 0.25 },
  { goal: 23000, rate: 0.22 },
  { goal: 20000, rate: 0.2 },
  { goal: 19000, rate: 0.18 },
  { goal: 18000, rate: 0.18 },
  { goal: 17000, rate: 0.18 },
  { goal: 16000, rate: 0.17 },
  { goal: 15000, rate: 0.17 },
  { goal: 14000, rate: 0.16 },
  { goal: 13000, rate: 0.15 },
  { goal: 12000, rate: 0.14 },
  { goal: 11000, rate: 0.1 },
];

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: string | number | null | undefined) {
  return currencyFormatter.format(toNumber(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "-";
}

function getSaoPauloDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "0"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "1"),
  };
}

function toYmd(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function currentMonthRange() {
  const today = getSaoPauloDateParts();
  const nextMonth = today.month === 12 ? 1 : today.month + 1;
  const nextMonthYear = today.month === 12 ? today.year + 1 : today.year;
  const monthEnd = new Date(Date.UTC(nextMonthYear, nextMonth - 1, 1));
  monthEnd.setUTCDate(monthEnd.getUTCDate() - 1);

  return {
    start: toYmd(today.year, today.month, 1),
    end: toYmd(
      monthEnd.getUTCFullYear(),
      monthEnd.getUTCMonth() + 1,
      monthEnd.getUTCDate(),
    ),
  };
}

function normalizeRange(start: string | undefined, end: string | undefined) {
  const month = currentMonthRange();
  const safeStart = start?.match(/^\d{4}-\d{2}-\d{2}$/) ? start : month.start;
  const safeEnd = end?.match(/^\d{4}-\d{2}-\d{2}$/) ? end : month.end;

  if (safeStart > safeEnd) {
    return { start: safeEnd, end: safeStart };
  }

  return { start: safeStart, end: safeEnd };
}

function isDateInRange(value: string | null | undefined, start: string, end: string) {
  const date = value?.slice(0, 10);
  return Boolean(date && date >= start && date <= end);
}

function transactionEffectiveDate(transaction: FinanceTransaction) {
  return transaction.status === "paid" && transaction.paid_at
    ? transaction.paid_at
    : transaction.due_date;
}

function transactionAmount(transaction: FinanceTransaction) {
  return toNumber(transaction.amount_paid ?? transaction.amount_expected);
}

function saleGoalAmount(sale: FinanceSale) {
  return toNumber(sale.goal_amount || sale.gross_amount);
}

function isLegalSale(sale: FinanceSale) {
  const source = sale.source?.toLowerCase() ?? "";
  const modality = sale.modality?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() ?? "";

  return source === "legal_payment" || modality.includes("juridico");
}

function normalizeLegalCommissionBrackets(
  tiers: LegalCommissionTier[],
): CommissionBracket[] {
  return tiers
    .filter((tier) => tier.is_active !== false)
    .map((tier) => ({
      goal: toNumber(tier.min_goal_amount),
      rate: toNumber(tier.commission_percent) / 100,
    }))
    .filter((tier) => tier.goal > 0 && tier.rate > 0)
    .sort((a, b) => b.goal - a.goal);
}

function commissionRate(goalAmount: number, brackets: CommissionBracket[]) {
  return brackets.find((bracket) => goalAmount >= bracket.goal)?.rate ?? 0;
}

function calculateCommission(
  sales: FinanceSale[],
  legalCommissionBrackets: CommissionBracket[],
) {
  const grouped = new Map<string, { area: "commercial" | "legal"; goalAmount: number }>();

  sales.forEach((sale) => {
    const area = isLegalSale(sale) ? "legal" : "commercial";
    const key = `${area}:${sale.consultant_name?.trim() || sale.consultant_user_id || "sem-consultor"}`;
    const current = grouped.get(key) ?? { area, goalAmount: 0 };

    grouped.set(key, {
      area,
      goalAmount: current.goalAmount + saleGoalAmount(sale),
    });
  });

  let total = 0;

  grouped.forEach((group) => {
    const brackets = group.area === "legal" ? legalCommissionBrackets : commissionBrackets;
    total += group.goalAmount * commissionRate(group.goalAmount, brackets);
  });

  return total;
}

function summarizeSales(
  sales: FinanceSale[],
  legalCommissionBrackets: CommissionBracket[],
) {
  const goalTotal = sales.reduce((total, sale) => total + saleGoalAmount(sale), 0);
  const grossTotal = sales.reduce((total, sale) => total + toNumber(sale.gross_amount), 0);

  return {
    goalTotal,
    grossTotal,
    commissionTotal: calculateCommission(sales, legalCommissionBrackets),
    count: sales.length,
  };
}

function summarizeFinance(rows: FinanceRow[]) {
  return rows.reduce(
    (summary, row) => {
      if (row.kind === "chargeback") {
        if (row.data.status !== "canceled") {
          summary.expense += toNumber(row.data.amount);
          summary.chargebacks += 1;
        }

        return summary;
      }

      const amount = transactionAmount(row.data);

      if (row.data.direction === "income") {
        if (row.data.status === "paid") {
          summary.income += amount;
        } else if (row.data.status !== "canceled") {
          summary.pendingIncome += toNumber(row.data.amount_expected);
        }
      }

      if (row.data.direction === "expense") {
        if (row.data.status === "paid") {
          summary.expense += amount;
        } else if (row.data.status !== "canceled") {
          summary.pendingExpense += toNumber(row.data.amount_expected);
        }
      }

      summary.transactions += 1;
      return summary;
    },
    {
      income: 0,
      expense: 0,
      pendingIncome: 0,
      pendingExpense: 0,
      chargebacks: 0,
      transactions: 0,
    },
  );
}

function DeleteButton() {
  return (
    <button
      type="submit"
      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      Remover
    </button>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "warning" | "danger";
  icon: typeof Banknote;
}) {
  const toneClasses = {
    default: "border-slate-200 bg-white",
    success: "border-emerald-200 bg-emerald-50",
    warning: "border-amber-200 bg-amber-50",
    danger: "border-red-200 bg-red-50",
  }[tone];

  return (
    <section className={`rounded-lg border p-5 shadow-sm ${toneClasses}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
        </div>
        <span className="rounded-lg bg-white/80 p-2 text-teal-700">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-5 text-slate-600">{detail}</p>
    </section>
  );
}

export default async function ConsultaFinanceiraPage({
  searchParams,
}: ConsultaFinanceiraPageProps) {
  const params = await searchParams;
  const { supabase, companyId, role } = await getCurrentUserContext();

  if (role !== "admin") {
    redirect("/areas");
  }

  const range = normalizeRange(params.start, params.end);
  const queryType = params.tipo === "financeiro" ? "financeiro" : "vendas";
  const selectedConsultant = params.consultant ?? "todos";
  const selectedStatus = params.status ?? "todos";

  const [
    salesResult,
    transactionsResult,
    chargebacksResult,
    usersResult,
    legalCommissionTiersResult,
  ] =
    await Promise.all([
      supabase
        .from("finance_sales")
        .select("*")
        .eq("company_id", companyId)
        .order("sale_date", { ascending: false })
        .limit(5000),
      supabase
        .from("finance_transactions")
        .select("*")
        .eq("company_id", companyId)
        .order("due_date", { ascending: false })
        .limit(5000),
      supabase
        .from("finance_chargebacks")
        .select("*")
        .eq("company_id", companyId)
        .order("chargeback_date", { ascending: false })
        .limit(2000),
      supabase
        .from("user_profiles")
        .select("id, full_name, nickname, username, role, business_area")
        .eq("company_id", companyId)
        .order("full_name", { ascending: true }),
      supabase
        .from("legal_commission_tiers")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("min_goal_amount", { ascending: false }),
    ]);

  const firstError = [
    salesResult.error,
    transactionsResult.error,
    chargebacksResult.error,
    usersResult.error,
  ].find(Boolean);
  const sales = (salesResult.data ?? []) as FinanceSale[];
  const transactions = (transactionsResult.data ?? []) as FinanceTransaction[];
  const chargebacks = (chargebacksResult.data ?? []) as FinanceChargeback[];
  const legalCommissionTiers = legalCommissionTiersResult.error
    ? []
    : ((legalCommissionTiersResult.data ?? []) as LegalCommissionTier[]);
  const legalCommissionBrackets =
    normalizeLegalCommissionBrackets(legalCommissionTiers);
  const users = ((usersResult.data ?? []) as CommercialUser[]).filter(
    (user) => user.business_area === "commercial" && user.role === "seller",
  );
  const usersById = new Map(users.map((user) => [user.id, user]));
  const salesConsultants = Array.from(
    new Set(
      sales
        .map((sale) => sale.consultant_name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const normalizedSelectedConsultant = selectedConsultant.trim().toUpperCase();
  const filteredSales = sales.filter((sale) => {
    const inRange = isDateInRange(sale.sale_date, range.start, range.end);
    const saleConsultantName = sale.consultant_name?.trim().toUpperCase() ?? "";
    const consultantMatches =
      selectedConsultant === "todos" ||
      saleConsultantName === normalizedSelectedConsultant;
    const statusMatches = selectedStatus === "todos" || sale.status === selectedStatus;

    return inRange && consultantMatches && statusMatches;
  });
  const filteredFinanceRows: FinanceRow[] = [
    ...transactions
      .filter((transaction) => {
        const inRange = isDateInRange(
          transactionEffectiveDate(transaction),
          range.start,
          range.end,
        );
        const statusMatches =
          selectedStatus === "todos" || transaction.status === selectedStatus;

        return inRange && statusMatches;
      })
      .map((transaction) => ({ kind: "transaction" as const, data: transaction })),
    ...chargebacks
      .filter((chargeback) => {
        const inRange = isDateInRange(chargeback.chargeback_date, range.start, range.end);
        const statusMatches =
          selectedStatus === "todos" || chargeback.status === selectedStatus;

        return inRange && statusMatches;
      })
      .map((chargeback) => ({ kind: "chargeback" as const, data: chargeback })),
  ].sort((a, b) => {
    const dateA =
      a.kind === "transaction"
        ? transactionEffectiveDate(a.data)
        : a.data.chargeback_date;
    const dateB =
      b.kind === "transaction"
        ? transactionEffectiveDate(b.data)
        : b.data.chargeback_date;

    return dateB.localeCompare(dateA);
  });
  const salesSummary = summarizeSales(filteredSales, legalCommissionBrackets);
  const financeSummary = summarizeFinance(filteredFinanceRows);
  const currentQuery = new URLSearchParams({
    tipo: queryType,
    start: range.start,
    end: range.end,
    consultant: selectedConsultant,
    status: selectedStatus,
  });
  const currentPath = `/financeiro/consultas?${currentQuery.toString()}`;

  return (
    <>
      <PageHeader
        title="Consultas financeiras"
        description="Análise vendas por meta, comissoes, caixa financeiro e registros filtrados."
      />
      <FinanceNavigation active={params.tipo === "vendas" ? "commissions" : "queries"} />
      <div className="finance-workspace space-y-6 p-6">
        {params.success ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {params.success}
          </div>
        ) : null}
        {params.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {params.error}
          </div>
        ) : null}
        {firstError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Não foi possível carregar a consulta financeira. Confirme se o SQL do financeiro foi rodado.
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-teal-700">
                Consulta consolidada
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                {queryType === "vendas" ? "Vendas por meta" : "Financeiro por caixa"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Venda usa o valor da meta para resultado comercial e comissão.
                Entrada de caixa fica separada em financeiro, evitando duplicidade.
              </p>
            </div>
            <Link
              href="/financeiro"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Voltar aos lançamentos
            </Link>
          </div>

          <form className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_160px_160px_220px_180px_auto]">
            <select
              name="tipo"
              defaultValue={queryType}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            >
              <option value="vendas">Vendas</option>
              <option value="financeiro">Financeiro</option>
            </select>
            <input
              type="date"
              name="start"
              defaultValue={range.start}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            />
            <input
              type="date"
              name="end"
              defaultValue={range.end}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            />
            <select
              name="consultant"
              defaultValue={selectedConsultant}
              disabled={queryType === "financeiro"}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            >
              <option value="todos">Todos os consultores</option>
              {salesConsultants.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={selectedStatus}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            >
              <option value="todos">Todos os status</option>
              {queryType === "vendas" ? (
                <>
                  <option value="confirmed">Confirmada</option>
                  <option value="pending">Pendente</option>
                  <option value="canceled">Cancelada</option>
                </>
              ) : (
                <>
                  <option value="planned">Previsto</option>
                  <option value="paid">Pago</option>
                  <option value="overdue">Atrasado</option>
                  <option value="canceled">Cancelado</option>
                  <option value="charged">Chargeback cobrado</option>
                  <option value="lost">Chargeback perdido</option>
                </>
              )}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              Consultar
            </button>
          </form>
        </section>

        {queryType === "vendas" ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={Banknote}
                label="Venda pela meta"
                value={formatCurrency(salesSummary.goalTotal)}
                detail="Base correta para comissão, já líquida taxas e descontos."
                tone="success"
              />
              <StatCard
                icon={Calculator}
                label="Comissão estimada"
                value={formatCurrency(salesSummary.commissionTotal)}
                detail="Calculada por faixa e por consultor."
                tone="warning"
              />
              <StatCard
                icon={ArrowUpRight}
                label="Valor contrato"
                value={formatCurrency(salesSummary.grossTotal)}
                detail="Valor bruto informado, antes de desconto da plataforma."
              />
              <StatCard
                icon={Banknote}
                label="Registros"
                value={numberFormatter.format(salesSummary.count)}
                detail={`${formatDate(range.start)} a ${formatDate(range.end)}.`}
              />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-950">
                  Vendas consultadas
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Data</th>
                      <th className="px-5 py-3 font-semibold">Cliente</th>
                      <th className="px-5 py-3 font-semibold">Consultor</th>
                      <th className="px-5 py-3 font-semibold">Contrato</th>
                      <th className="px-5 py-3 font-semibold">Meta</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSales.map((sale) => (
                      <tr key={sale.id} className="transition hover:bg-slate-50">
                        <td className="px-5 py-3">{formatDate(sale.sale_date)}</td>
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-950">{sale.client_name}</p>
                          <p className="text-xs text-slate-500">{sale.client_cpf ?? "-"}</p>
                        </td>
                        <td className="px-5 py-3">
                          {sale.consultant_name?.trim() ||
                            resolveUserDisplayName(
                              usersById.get(sale.consultant_user_id ?? "") ?? null,
                              "Sem consultor",
                            )}
                        </td>
                        <td className="px-5 py-3">{formatCurrency(sale.gross_amount)}</td>
                        <td className="px-5 py-3 font-semibold">{formatCurrency(saleGoalAmount(sale))}</td>
                        <td className="px-5 py-3">{sale.status}</td>
                        <td className="px-5 py-3">
                          <div className="flex gap-2">
                            <Link
                              href={`/financeiro?editSale=${sale.id}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              Editar
                            </Link>
                            <form action={deleteFinanceSaleAction.bind(null, sale.id)}>
                              <input type="hidden" name="redirect_to" value={currentPath} />
                              <DeleteButton />
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredSales.length ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                          Nenhuma venda encontrada para os filtros selecionados.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard
                icon={ArrowUpRight}
                label="Entradas pagas"
                value={formatCurrency(financeSummary.income)}
                detail="Somente lançamentos financeiros pagos."
                tone="success"
              />
              <StatCard
                icon={ArrowDownRight}
                label="Saidas pagas"
                value={formatCurrency(financeSummary.expense)}
                detail="Despesas pagas e chargebacks não cancelados."
                tone={financeSummary.expense > 0 ? "warning" : "success"}
              />
              <StatCard
                icon={Calculator}
                label="Resultado"
                value={formatCurrency(financeSummary.income - financeSummary.expense)}
                detail="Entradas financeiras menos saidas financeiras."
                tone={financeSummary.income - financeSummary.expense >= 0 ? "success" : "danger"}
              />
              <StatCard
                icon={Banknote}
                label="A receber"
                value={formatCurrency(financeSummary.pendingIncome)}
                detail="Receitas previstas ainda não pagas."
                tone={financeSummary.pendingIncome > 0 ? "warning" : "success"}
              />
              <StatCard
                icon={Banknote}
                label="A pagar"
                value={formatCurrency(financeSummary.pendingExpense)}
                detail="Despesas previstas ainda não pagas."
                tone={financeSummary.pendingExpense > 0 ? "warning" : "success"}
              />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-950">
                  Financeiro consultado
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Data</th>
                      <th className="px-5 py-3 font-semibold">Tipo</th>
                      <th className="px-5 py-3 font-semibold">Descrição</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Valor</th>
                      <th className="px-5 py-3 font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFinanceRows.map((row) => {
                      const isTransaction = row.kind === "transaction";
                      const key = `${row.kind}-${row.data.id}`;
                      const date = isTransaction
                        ? transactionEffectiveDate(row.data)
                        : row.data.chargeback_date;
                      const description = isTransaction
                        ? row.data.description
                        : `Chargeback - ${row.data.client_name}`;
                      const status = row.data.status;
                      const value = isTransaction
                        ? transactionAmount(row.data)
                        : toNumber(row.data.amount);

                      return (
                        <tr key={key} className="transition hover:bg-slate-50">
                          <td className="px-5 py-3">{formatDate(date)}</td>
                          <td className="px-5 py-3">
                            {isTransaction
                              ? row.data.direction === "income"
                                ? "Entrada"
                                : "Saida"
                              : "Chargeback"}
                          </td>
                          <td className="px-5 py-3">
                            <p className="font-semibold text-slate-950">{description}</p>
                            <p className="text-xs text-slate-500">
                              {isTransaction ? row.data.counterparty ?? "-" : row.data.client_cpf ?? "-"}
                            </p>
                          </td>
                          <td className="px-5 py-3">{status}</td>
                          <td className="px-5 py-3 font-semibold">{formatCurrency(value)}</td>
                          <td className="px-5 py-3">
                            <div className="flex gap-2">
                              <Link
                                href={
                                  isTransaction
                                    ? `/financeiro?editTransaction=${row.data.id}`
                                    : `/financeiro?editChargeback=${row.data.id}`
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                Editar
                              </Link>
                              <form
                                action={
                                  isTransaction
                                    ? deleteFinanceTransactionAction.bind(null, row.data.id)
                                    : deleteFinanceChargebackAction.bind(null, row.data.id)
                                }
                              >
                                <input type="hidden" name="redirect_to" value={currentPath} />
                                <DeleteButton />
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredFinanceRows.length ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                          Nenhum registro financeiro encontrado para os filtros selecionados.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
