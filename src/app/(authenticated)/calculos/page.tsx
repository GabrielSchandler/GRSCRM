import Link from "next/link";
import { redirect } from "next/navigation";
import { CalculationDeleteButton } from "@/components/calculations/calculation-delete-button";
import { CalculationPdfActions } from "@/components/calculations/calculation-pdf-actions";
import { CalculationStatusBadge } from "@/components/calculations/calculation-status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  formatCalculationCurrency,
  formatCalculationDateTime,
  formatCpfDigits,
} from "@/lib/calculations/formatters";
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
      "id, client_name, client_cpf, financial_institution, financed_value, current_installment_value, installment_count, estimated_savings, status, created_at, created_by, pdf_storage_path, pre_sale_id",
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
  const selectedCalculation = calculations[0] ?? null;

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
            <h1 className="text-2xl font-semibold text-[#11182E]">Simulações</h1>
            <p className="mt-1 text-sm text-[#69738A]">Encontre, compare, abra o PDF e crie uma nova análise com poucos cliques.</p>
          </div>
          <Link
            href="/calculos/novo"
            className="inline-flex w-fit items-center justify-center rounded-[10px] bg-[#5267F5] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4053DE]"
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
            <article key={stat.label} className="relative overflow-hidden rounded-[12px] border border-[#DDE2EC] bg-white px-5 py-4">
              <span className="absolute bottom-0 left-0 top-0 w-1" style={{ backgroundColor: stat.tone }} />
              <p className="text-xs font-semibold uppercase text-[#69738A]">{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold text-[#11182E]">{stat.value}</p>
              <p className="mt-1 text-sm text-[#69738A]">{stat.detail}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[12px] border border-[#DDE2EC] bg-white p-4 shadow-none">
          <form className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="q">
                Busca por cliente ou CPF
              </label>
              <input
                id="q"
                name="q"
                defaultValue={params.q ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="status">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={params.status ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              >
                <option value="">Todos</option>
                <option value="calculado">Calculado</option>
                <option value="pdf_gerado">PDF gerado</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="date_from">
                De
              </label>
              <input
                id="date_from"
                name="date_from"
                type="date"
                defaultValue={params.date_from ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="date_to">
                Até
              </label>
              <input
                id="date_to"
                name="date_to"
                type="date"
                defaultValue={params.date_to ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Filtrar
              </button>
              <Link
                href="/calculos"
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              >
                Limpar
              </Link>
            </div>
          </form>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error.message}
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-[12px] border border-[#DDE2EC] bg-white shadow-none">
            <div className="border-b border-[#DDE2EC] px-5 py-4">
              <p className="text-sm font-semibold text-[#11182E]">{calculations.length} simulações</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
                <thead className="bg-[#F8F9FC] text-xs uppercase tracking-wide text-[#69738A]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Financeira</th>
                    <th className="px-4 py-3 font-semibold">Valor financiado</th>
                    <th className="px-4 py-3 font-semibold">Economia estimada</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Criado em</th>
                    <th className="px-4 py-3 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {calculations.map((calculation) => (
                    <tr key={calculation.id} className="align-top transition hover:bg-[#F8F9FC]">
                      <td className="px-4 py-4 font-medium text-[#11182E]">
                        {calculation.client_name || "Não informado"}
                        <p className="mt-1 text-xs font-normal text-[#69738A]">{formatCpfDigits(calculation.client_cpf)}</p>
                      </td>
                      <td className="px-4 py-4 text-[#56627C]">
                        {calculation.financial_institution ?? "Não informado"}
                      </td>
                      <td className="px-4 py-4 text-[#11182E]">
                        {formatCalculationCurrency(calculation.financed_value)}
                      </td>
                      <td className="px-4 py-4 font-semibold text-[#12A976]">
                        {formatCalculationCurrency(calculation.estimated_savings)}
                      </td>
                      <td className="px-4 py-4">
                        <CalculationStatusBadge status={calculation.status} />
                      </td>
                      <td className="px-4 py-4 text-[#56627C]">
                        {formatCalculationDateTime(calculation.created_at)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/calculos/${calculation.id}`}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Ver
                            </Link>
                            <Link
                              href={`/calculos/${calculation.id}/editar`}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Editar
                            </Link>
                            <CalculationDeleteButton
                              calculationId={calculation.id}
                              variant="inline"
                            />
                          </div>
                          <CalculationPdfActions
                            calculationId={calculation.id}
                            hasPdf={Boolean(calculation.pdf_storage_path)}
                            variant="compact"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!calculations.length ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-[#69738A]" colSpan={7}>
                        Nenhuma simulação encontrada.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
          <aside className="rounded-[12px] border border-[#DDE2EC] bg-white p-5">
            {selectedCalculation ? (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-[#DDE2EC] pb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[#11182E]">{selectedCalculation.client_name || "Simulação"}</h2>
                    <p className="mt-1 text-sm text-[#69738A]">{selectedCalculation.financial_institution ?? "Financeira não informada"}</p>
                  </div>
                  <CalculationStatusBadge status={selectedCalculation.status} />
                </div>
                <h3 className="mt-5 text-sm font-semibold text-[#11182E]">Resumo da análise</h3>
                <dl className="mt-4 space-y-4 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-[#69738A]">Valor financiado</dt><dd className="font-semibold text-[#11182E]">{formatCalculationCurrency(selectedCalculation.financed_value)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#69738A]">Parcela atual</dt><dd className="font-semibold text-[#11182E]">{formatCalculationCurrency(selectedCalculation.current_installment_value)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#69738A]">Parcelas</dt><dd className="font-semibold text-[#11182E]">{selectedCalculation.installment_count ?? "-"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#69738A]">Economia estimada</dt><dd className="font-semibold text-[#12A976]">{formatCalculationCurrency(selectedCalculation.estimated_savings)}</dd></div>
                </dl>
                <div className="mt-6 grid gap-2">
                  <Link href={`/calculos/${selectedCalculation.id}`} className="inline-flex justify-center rounded-[10px] bg-[#5267F5] px-4 py-2.5 text-sm font-semibold text-white">Abrir análise completa</Link>
                  <Link href={`/calculos/${selectedCalculation.id}/editar`} className="inline-flex justify-center rounded-[10px] border border-[#DDE2EC] px-4 py-2.5 text-sm font-semibold text-[#11182E]">Editar simulação</Link>
                </div>
              </>
            ) : <p className="text-sm text-[#69738A]">Selecione ou crie uma simulação para ver os detalhes.</p>}
          </aside>
          </div>
        )}
      </div>
    </>
  );
}
