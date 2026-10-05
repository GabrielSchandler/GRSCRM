import { RefreshCw } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { displayValue, formatDateTime } from "@/lib/clients/formatters";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserDisplayName } from "@/lib/users/account";
import { LeadSelection, LeadSelectionCheckbox, SelectAllLeadsCheckbox } from "@/components/leads/lead-selection";
import {
  assignSelectedLeadsAction,
  autoDistributeLeadsAction,
  syncDistributedLeadClientsAction,
  verifyLeadSourcesAction,
} from "./actions";

type LeadsPageProps = {
  searchParams: Promise<{
    imported?: string;
    skipped?: string;
    errors?: string;
    assigned?: string;
    auto_assigned?: string;
    synced_clients?: string;
    error?: string;
    error_message?: string;
  }>;
};

type LeadRecord = {
  id: string;
  source_id: string | null;
  source_row_number: number | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  campaign: string | null;
  notes: string | null;
  status: string;
  assigned_to: string | null;
  assigned_at: string | null;
  imported_at: string | null;
  raw_data: Record<string, unknown> | null;
};

type LeadSource = {
  id: string;
  name: string;
  is_active: boolean | null;
  last_checked_at: string | null;
};

type Consultant = {
  id: string;
  full_name: string | null;
  nickname: string | null;
  username: string | null;
  email: string | null;
};

function canManageLeadDistribution(role: string | null, isPlatformOwner: boolean) {
  return isPlatformOwner || role === "admin" || role === "manager";
}

function getBannerMessage(params: Awaited<LeadsPageProps["searchParams"]>) {
  if (params.error) {
    const messages: Record<string, string> = {
      source_query_failed: "Não foi possível carregar as fontes de leads.",
      no_sources: "Cadastre ao menos uma fonte ativa antes de verificar as planilhas.",
      select_leads: "Selecione pelo menos um lead.",
      select_consultant: "Selecione um consultor comercial.",
      select_consultants: "Selecione os consultores que vao receber os leads.",
      invalid_consultant: "Selecione apenas consultores comerciais ativos.",
      assign_failed: "Não foi possível distribuir os leads selecionados.",
      lead_query_failed: "Não foi possível carregar os leads para distribuição.",
      no_new_leads: "Não há leads novos para distribuir.",
      sync_clients_failed: "Não foi possível criar os clientes dos leads distribuidos.",
    };

    return {
      tone: "error" as const,
      text: messages[params.error] ?? "Não foi possível concluir a ação.",
    };
  }

  if (params.imported || params.skipped || params.errors) {
    const errors = Number(params.errors ?? 0);
    const errorSuffix =
      errors > 0 && params.error_message ? ` Detalhe: ${params.error_message}` : "";

    return {
      tone: errors > 0 ? ("error" as const) : ("success" as const),
      text: `${params.imported ?? 0} lead(s) importado(s), ${params.skipped ?? 0} ignorado(s), ${params.errors ?? 0} fonte(s) com erro.${errorSuffix}`,
    };
  }

  if (params.assigned) {
    return {
      tone: "success" as const,
      text: `${params.assigned} lead(s) distribuido(s).`,
    };
  }

  if (params.auto_assigned) {
    return {
      tone: "success" as const,
      text: `${params.auto_assigned} lead(s) distribuidos automaticamente.`,
    };
  }

  if (params.synced_clients) {
    return {
      tone: "success" as const,
      text: `${params.synced_clients} cliente(s) criado(s) a partir de leads já distribuidos.`,
    };
  }

  return null;
}

function formatPhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return displayValue(value);
}

function getSourceName(sourceMap: Map<string, LeadSource>, sourceId: string | null) {
  if (!sourceId) {
    return "Fonte não informada";
  }

  return sourceMap.get(sourceId)?.name ?? "Fonte removida";
}

function getLeadClientId(lead: Pick<LeadRecord, "raw_data">) {
  const value = lead.raw_data?.crm_client_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams;
  const { companyId, role, isPlatformOwner } = await getCurrentUserContext();

  if (!canManageLeadDistribution(role, isPlatformOwner)) {
    redirect("/areas");
  }

  const adminClient = createAdminClient();
  const [
    sourcesResult,
    newLeadsResult,
    distributedLeadsResult,
    consultantsResult,
  ] = await Promise.all([
    adminClient
      .from("lead_sources")
      .select("id, name, is_active, last_checked_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    adminClient
      .from("leads")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "novo")
      .order("imported_at", { ascending: true }),
    adminClient
      .from("leads")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "distribuido")
      .order("assigned_at", { ascending: false })
      .limit(40),
    adminClient
      .from("user_profiles")
      .select("id, full_name, nickname, username, email")
      .eq("company_id", companyId)
      .eq("business_area", "commercial")
      .eq("role", "seller")
      .eq("is_active", true)
      .order("full_name", { ascending: true, nullsFirst: false }),
  ]);

  const sources = (sourcesResult.data ?? []) as LeadSource[];
  const newLeads = (newLeadsResult.data ?? []) as LeadRecord[];
  const distributedLeads = (distributedLeadsResult.data ?? []) as LeadRecord[];
  const consultants = (consultantsResult.data ?? []) as Consultant[];
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const consultantMap = new Map(consultants.map((consultant) => [consultant.id, consultant]));
  const activeSources = sources.filter((source) => source.is_active).length;
  const distributedByConsultant = distributedLeads.reduce<Record<string, number>>(
    (accumulator, lead) => {
      if (lead.assigned_to) {
        accumulator[lead.assigned_to] = (accumulator[lead.assigned_to] ?? 0) + 1;
      }

      return accumulator;
    },
    {},
  );
  const banner = getBannerMessage(params);
  const pageError =
    sourcesResult.error ??
    newLeadsResult.error ??
    distributedLeadsResult.error ??
    consultantsResult.error;

  return (
    <>
      <PageHeader
        title="Distribuição de leads"
        description="Verifique planilhas conectadas, importe novos leads e distribua para os consultores comerciais."
      />
      <div className="space-y-6 p-6">
        {banner ? (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              banner.tone === "success"
                ? "border-teal-200 bg-teal-50 text-teal-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {banner.text}
          </div>
        ) : null}

        {pageError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError.message}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                Entrada de leads
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">
                {newLeads.length} lead(s) aguardando distribuição
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {activeSources} fonte(s) ativa(s). A verificacao importa apenas
                linhas novas das planilhas cadastradas em Gestão.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={syncDistributedLeadClientsAction}>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 transition hover:bg-teal-100"
                >
                  Sincronizar clientes
                </button>
              </form>
              <form action={verifyLeadSourcesAction}>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
                >
                  <RefreshCw className="h-4 w-4" />
                  Verificar planilhas
                </button>
              </form>
            </div>
          </div>
        </section>

        <form className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-base font-semibold text-slate-950">
                Leads novos
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Selecione um ou mais leads. Se nenhum lead for selecionado na
                distribuição automática, todos os leads novos entram na divisão.
              </p>
            </div>

            {newLeads.length ? (
              <LeadSelection leadIds={newLeads.map(lead => lead.id)}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-12 px-4 py-3"><SelectAllLeadsCheckbox /></th>
                      <th className="px-4 py-3">Lead</th>
                      <th className="px-4 py-3">Contato</th>
                      <th className="px-4 py-3">Campanha</th>
                      <th className="px-4 py-3">Fonte</th>
                      <th className="px-4 py-3">Importado em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {newLeads.map((lead) => (
                      <tr key={lead.id} className="align-top transition hover:bg-slate-50">
                        <td className="px-4 py-4">
                          <LeadSelectionCheckbox id={lead.id} name={lead.full_name} />
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-950">
                            {lead.full_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            CPF: {displayValue(lead.cpf)}
                          </p>
                          {lead.notes ? (
                            <p className="mt-2 max-w-md text-xs leading-5 text-slate-600">
                              {lead.notes}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          <p>{formatPhone(lead.phone)}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {displayValue(lead.email)}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {displayValue(lead.campaign)}
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          <p>{getSourceName(sourceMap, lead.source_id)}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Linha {lead.source_row_number ?? "-"}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {formatDateTime(lead.imported_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </LeadSelection>
            ) : (
              <div className="p-6">
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                  Nenhum lead novo aguardando distribuição.
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">
                Distribuir selecionados
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Envie os leads marcados para um consultor comercial específico.
              </p>
              <select
                name="manual_consultant_id"
                className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              >
                <option value="">Selecione o consultor</option>
                {consultants.map((consultant) => (
                  <option key={consultant.id} value={consultant.id}>
                    {resolveUserDisplayName(consultant, "Sem nome")}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                formAction={assignSelectedLeadsAction}
                className="mt-3 w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
              >
                Distribuir para consultor
              </button>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">
                Distribuição automática
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Dívida de forma igual entre os consultores escolhidos.
              </p>
              <div className="mt-4 space-y-2">
                {consultants.map((consultant) => (
                  <label
                    key={consultant.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-700">
                      {resolveUserDisplayName(consultant, "Sem nome")}
                    </span>
                    <input
                      type="checkbox"
                      name="auto_consultant_id"
                      value={consultant.id}
                      className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    />
                  </label>
                ))}
              </div>
              <button
                type="submit"
                formAction={autoDistributeLeadsAction}
                className="mt-3 w-full rounded-lg border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 transition hover:bg-teal-100"
              >
                Distribuir automaticamente
              </button>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">
                Ultimas distribuicoes
              </h2>
              <div className="mt-4 space-y-3">
                {consultants.map((consultant) => (
                  <div
                    key={consultant.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-700">
                      {resolveUserDisplayName(consultant, "Sem nome")}
                    </span>
                    <span className="font-semibold text-slate-950">
                      {distributedByConsultant[consultant.id] ?? 0}
                    </span>
                  </div>
                ))}
                {!consultants.length ? (
                  <p className="text-sm text-slate-500">
                    Nenhum consultor comercial ativo encontrado.
                  </p>
                ) : null}
              </div>
            </section>
          </aside>
        </form>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-base font-semibold text-slate-950">
              Leads distribuidos recentemente
            </h2>
          </div>
          {distributedLeads.length ? (
            <div className="divide-y divide-slate-100">
              {distributedLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="grid gap-3 p-4 text-sm md:grid-cols-[1.2fr_1fr_1fr_auto_auto]"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{lead.full_name}</p>
                    <p className="text-xs text-slate-500">
                      {getSourceName(sourceMap, lead.source_id)}
                    </p>
                  </div>
                  <p className="text-slate-700">{formatPhone(lead.phone)}</p>
                  <p className="text-slate-700">
                    {resolveUserDisplayName(
                      consultantMap.get(lead.assigned_to ?? ""),
                      "Consultor não informado",
                    )}
                  </p>
                  <p className="text-slate-500">{formatDateTime(lead.assigned_at)}</p>
                  {getLeadClientId(lead) ? (
                    <a
                      href={`/clientes/${getLeadClientId(lead)}`}
                      className="inline-flex items-center justify-center rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 transition hover:bg-teal-100"
                    >
                      Abrir cliente
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">Cliente pendente</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-500">
              Nenhum lead distribuido recentemente.
            </div>
          )}
        </section>
      </div>
    </>
  );
}
