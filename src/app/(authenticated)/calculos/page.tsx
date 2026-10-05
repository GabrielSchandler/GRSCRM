import Link from "next/link";
import { redirect } from "next/navigation";
import { CalculationsWorkspace } from "@/components/calculations/calculations-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { formatCalculationCurrency } from "@/lib/calculations/formatters";
import { canManageCalculations } from "@/lib/calculations/service";
import { onlyDigits } from "@/lib/clients/masks";
import { listAccessiblePreSaleIdsForCurrentUser } from "@/lib/pre-sales/access";
import { getHomeForRole } from "@/lib/workspace";
import type { FinancingCalculation } from "@/types/calculation";

type CalculosPageProps = {
  searchParams: Promise<{
    success?: string;
    q?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
  }>;
};

function successMessage(success?: string) {
  if (success === "created") {
    return "Simulação criada com sucesso.";
  }

  if (success === "updated") {
    return "Simulação atualizada com sucesso.";
  }

  if (success === "deleted") {
    return "Simulação excluída com sucesso.";
  }

  return null;
}

function asNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export default async function CalculosPage({ searchParams }: CalculosPageProps) {
  const params = await searchParams;
  const { supabase, companyId, role, userProfileId, businessArea } =
    await getCurrentUserContext();

  if (!canManageCalculations(role)) {
    redirect(getHomeForRole(role, businessArea));
  }

  let query = supabase
    .from("financing_calculations")
    .select(
      "id, client_id, pre_sale_id, simulation_type, client_name, client_cpf, financial_institution, financed_value, current_installment_value, corrected_installment_value, installment_count, installment_reduction_percentage, estimated_savings, status, created_at, created_by, pdf_storage_path",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const trimmedQuery = params.q?.trim();
  const cpfDigits = onlyDigits(trimmedQuery ?? "");

  if (trimmedQuery) {
    if (cpfDigits) {
      query = query.or(
        `client_name.ilike.%${trimmedQuery}%,client_cpf.ilike.%${cpfDigits}%`,
      );
    } else {
      query = query.ilike("client_name", `%${trimmedQuery}%`);
    }
  }

  if (params.status) {
    query = query.eq("status", params.status);
  }

  if (params.date_from) {
    query = query.gte("created_at", `${params.date_from}T00:00:00`);
  }

  if (params.date_to) {
    query = query.lte("created_at", `${params.date_to}T23:59:59`);
  }

  const { data, error } = await query;
  let calculations = (data ?? []) as FinancingCalculation[];

  if (role === "seller") {
    const accessiblePreSaleIds = new Set(
      (await listAccessiblePreSaleIdsForCurrentUser()) ?? [],
    );
    calculations = calculations.filter(
      (calculation) =>
        calculation.created_by === userProfileId ||
        (calculation.pre_sale_id
          ? accessiblePreSaleIds.has(calculation.pre_sale_id)
          : false),
    );
  }
  const bannerMessage = successMessage(params.success);
  const today = new Date().toISOString().slice(0, 10);
  const createdToday = calculations.filter((calculation) => calculation.created_at.slice(0, 10) === today).length;
  const pdfGenerated = calculations.filter((calculation) => Boolean(calculation.pdf_storage_path)).length;
  const totalSavings = calculations.reduce(
    (total, calculation) => total + asNumber(calculation.estimated_savings),
    0,
  );
  const defaultCalculationId =
    calculations.find((calculation) => calculation.created_by === userProfileId)?.id ??
    calculations[0]?.id ??
    null;

  return (
    <>
      <PageHeader
        title="Simulações"
        description="Histórico e criação de análises revisionais sem perder contexto."
      />
      <div className="space-y-6 p-6">
        {bannerMessage ? (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
            {bannerMessage}
          </div>
        ) : null}

        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-semibold text-[var(--ns-text)]">Simulações</h1>
            <p className="mt-1 text-sm text-[var(--ns-text-secondary)]">Encontre, compare, abra o PDF e crie uma nova análise com poucos cliques.</p>
          </div>
          <Link
            href="/calculos/novo"
            className="inline-flex w-fit items-center justify-center rounded-[10px] bg-[var(--ns-primary)] px-5 py-3 text-sm font-semibold text-[var(--ns-primary-foreground)] transition hover:opacity-90"
          >
            Nova simulação
          </Link>
        </div>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Hoje", value: String(createdToday), detail: "simulações criadas", tone: "#5267F5" },
            { label: "Economia média", value: formatCalculationCurrency(calculations.length ? totalSavings / calculations.length : 0), detail: "nas análises exibidas", tone: "#12A976" },
            { label: "Em análise", value: String(calculations.filter((item) => !item.pdf_storage_path).length), detail: "aguardando PDF", tone: "#E7A11F" },
            { label: "Total no período", value: String(calculations.length), detail: `${pdfGenerated} PDFs gerados`, tone: "#FF7A45" },
          ].map((stat) => (
            <article key={stat.label} className="relative overflow-hidden rounded-[12px] border border-[var(--ns-border)] bg-[var(--ns-surface)] px-5 py-4">
              <span className="absolute bottom-0 left-0 top-0 w-1" style={{ backgroundColor: stat.tone }} />
              <p className="text-xs font-semibold uppercase text-[var(--ns-text-secondary)]">{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ns-text)]">{stat.value}</p>
              <p className="mt-1 text-sm text-[var(--ns-text-secondary)]">{stat.detail}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[12px] border border-[var(--ns-border)] bg-[var(--ns-surface)] p-4 shadow-none">
          <form className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
            <div className="space-y-2">
              <label className="sr-only" htmlFor="q">
                Busca por cliente ou CPF
              </label>
              <input
                id="q"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Cliente, CPF ou banco"
                className="w-full rounded-[10px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt)] px-3 py-2.5 text-sm text-[var(--ns-text)] outline-none transition focus:border-[var(--ns-primary)] focus:ring-2 focus:ring-[var(--ns-primary)]/15"
              />
            </div>
            <div className="space-y-2">
              <label className="sr-only" htmlFor="status">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={params.status ?? ""}
                className="w-full rounded-[10px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt)] px-3 py-2.5 text-sm font-semibold text-[var(--ns-text)] outline-none transition focus:border-[var(--ns-primary)] focus:ring-2 focus:ring-[var(--ns-primary)]/15"
              >
                <option value="">Todos</option>
                <option value="calculado">Calculado</option>
                <option value="pdf_gerado">PDF gerado</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="sr-only" htmlFor="date_from">
                De
              </label>
              <input
                id="date_from"
                name="date_from"
                type="date"
                defaultValue={params.date_from ?? ""}
                className="w-full rounded-[10px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt)] px-3 py-2.5 text-sm text-[var(--ns-text)] outline-none transition focus:border-[var(--ns-primary)] focus:ring-2 focus:ring-[var(--ns-primary)]/15"
              />
            </div>
            <div className="space-y-2">
              <label className="sr-only" htmlFor="date_to">
                Até
              </label>
              <input
                id="date_to"
                name="date_to"
                type="date"
                defaultValue={params.date_to ?? ""}
                className="w-full rounded-[10px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt)] px-3 py-2.5 text-sm text-[var(--ns-text)] outline-none transition focus:border-[var(--ns-primary)] focus:ring-2 focus:ring-[var(--ns-primary)]/15"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-[10px] border border-[var(--ns-border)] bg-[var(--ns-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--ns-text)] transition hover:bg-[var(--ns-surface-hover)]"
              >
                Filtrar
              </button>
              <Link
                href="/calculos"
                className="rounded-[10px] px-4 py-2.5 text-sm font-semibold text-[var(--ns-text-secondary)] transition hover:bg-[var(--ns-surface-hover)] hover:text-[var(--ns-text)]"
              >
                Limpar
              </Link>
            </div>
          </form>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</div>
        ) : <CalculationsWorkspace calculations={calculations} defaultCalculationId={defaultCalculationId} />}
      </div>
    </>
  );
}
