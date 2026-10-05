import { Link2, FileSpreadsheet, Users, Activity } from "lucide-react";
import { ManagementMetric } from "@/components/management/management-ui";
import { RevealDetailsButton } from "@/components/newsec/reveal-details-button";
import { ReferenceCollection } from "@/components/newsec/reference-collection";
import { ReferenceFacts, ReferenceBadge, ReferenceTabs } from "@/components/newsec/reference-ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { displayValue, formatDateTime } from "@/lib/clients/formatters";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createLeadSourceAction,
  deleteLeadSourceAction,
  toggleLeadSourceAction,
  updateLeadSourceAction,
} from "./actions";

type LeadSourcesPageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
  }>;
};

type LeadSource = {
  id: string;
  name: string;
  sheet_url: string;
  sheet_gid: string | null;
  start_row: number | null;
  name_column: string | null;
  phone_column: string | null;
  email_column: string | null;
  cpf_column: string | null;
  campaign_column: string | null;
  notes_column: string | null;
  is_active: boolean | null;
  last_checked_at: string | null;
  created_at: string | null;
};

function canManageLeadSources(role: string | null, isPlatformOwner: boolean) {
  return isPlatformOwner || role === "admin" || role === "manager";
}

function getBannerMessage(params: Awaited<LeadSourcesPageProps["searchParams"]>) {
  if (params.success === "created") {
    return { tone: "success" as const, text: "Fonte de leads cadastrada." };
  }

  if (params.success === "updated") {
    return { tone: "success" as const, text: "Fonte de leads atualizada." };
  }

  if (params.success === "deleted") {
    return { tone: "success" as const, text: "Fonte de leads removida." };
  }

  const errorMessages: Record<string, string> = {
    required: "Informe nome e link da planilha.",
    invalid_sheet: "Use um link válido do Google Sheets.",
    duplicated: "Já existe uma fonte com este nome nesta empresa.",
    missing_source: "Fonte de leads não encontrada.",
    save_failed: "Não foi possível salvar a fonte de leads.",
    delete_failed: "Não foi possível remover a fonte de leads.",
  };

  if (params.error) {
    return {
      tone: "error" as const,
      text: errorMessages[params.error] ?? "Não foi possível concluir a ação.",
    };
  }

  return null;
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required = false,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="space-y-2 text-sm font-medium text-slate-700">
      <span>
        {label}
        {required ? (
          <span className="ml-2 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
            Obrigatório
          </span>
        ) : null}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
      />
    </label>
  );
}

export default async function LeadSourcesPage({ searchParams }: LeadSourcesPageProps) {
  const params = await searchParams;
  const { companyId, role, isPlatformOwner } = await getCurrentUserContext();

  if (!canManageLeadSources(role, isPlatformOwner)) {
    redirect("/areas");
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("lead_sources")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  const sources = (data ?? []) as LeadSource[];
  const banner = getBannerMessage(params);


  const queueResult = await adminClient.from("leads").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "novo");
  return <>
    <PageHeader title="Leads" description="Fontes de captação, distribuição e conexões com Google Sheets." />
    <div className="reference-page space-y-4 p-4 sm:p-6">
      <ReferenceTabs items={[{label:"Distribuição",href:"/leads"},{label:"Fontes",href:"/integracoes/leads",active:true},{label:"Google Sheets",href:"#conexoes"}]} />
      {banner && <p role="status" className={banner.tone === "error" ? "text-[var(--ns-danger)]" : "text-[var(--ns-success)]"}>{banner.text}</p>}
      {error ? <p role="alert" className="text-[var(--ns-danger)]">{error.message}</p> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ManagementMetric label="Fontes cadastradas" value={sources.length} icon={Link2} />
        <ManagementMetric label="Fontes ativas" value={sources.filter(s => s.is_active).length} icon={Activity} tone="success" />
        <ManagementMetric label="Planilhas configuradas" value={sources.filter(s => Boolean(s.sheet_url)).length} icon={FileSpreadsheet} tone="success" />
        <ManagementMetric label="Leads na fila" value={queueResult.error ? "Indisponível" : queueResult.count ?? 0} icon={Users} tone="warning" />
      </div>
      <ReferenceCollection title="Fontes de leads" detailTitle="Conexão e distribuição" columns={["Nome da fonte", "Tipo", "Distribuição", "Status", "Última verificação", "Ações"]} actions={<RevealDetailsButton targetId="nova-fonte" className="rounded-md bg-[var(--ns-primary)] px-4 py-2 text-xs font-semibold text-[var(--ns-primary-foreground)]">+ Nova fonte</RevealDetailsButton>} rows={sources.map(source => ({
        id: source.id, title: source.name, search: source.name, type:"Google Sheets", status:source.is_active ? "Ativa" : "Pausada",
        cells:[<span key="name" className="font-semibold">{source.name}</span>, "Google Sheets", <Link key="distribution" href="/leads" className="text-[var(--ns-primary)]">Ver distribuição</Link>, <ReferenceBadge key="status" tone={source.is_active ? "success" : "warning"}>{source.is_active ? "Ativa" : "Pausada"}</ReferenceBadge>, formatDateTime(source.last_checked_at), <a key="connection" href="#conexoes" className="text-[var(--ns-primary)]">Conexão</a>],
        detail: <div key={source.id} className="space-y-4"><ReferenceBadge tone={source.is_active ? "success" : "warning"}>{source.is_active ? "Ativa" : "Pausada"}</ReferenceBadge><ReferenceFacts items={[["Planilha",<a key="sheet" href={source.sheet_url} target="_blank" rel="noreferrer" className="break-all text-[var(--ns-primary)]">{source.sheet_url}</a>],["Aba",source.sheet_gid ? `GID ${source.sheet_gid}` : "Automática"],["Primeira linha",source.start_row ?? 2],["Coluna do nome",source.name_column ?? "A"],["Coluna do telefone",displayValue(source.phone_column)],["Última verificação",formatDateTime(source.last_checked_at)]]} /><div className="flex flex-wrap gap-2">                    <form action={toggleLeadSourceAction}>
                      <input type="hidden" name="source_id" value={source.id} />
                      <input
                        type="hidden"
                        name="next_active"
                        value={source.is_active ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        {source.is_active ? "Pausar" : "Ativar"}
                      </button>
                    </form>
                    <form action={deleteLeadSourceAction}>
                      <input type="hidden" name="source_id" value={source.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                      >
                        Excluir
                      </button>
                    </form>
</div>                    <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                        Editar conexão
                      </summary>
                      <form
                        action={updateLeadSourceAction}
                        className="mt-4 grid gap-4 lg:grid-cols-2"
                      >
                        <input type="hidden" name="source_id" value={source.id} />
                        <Field
                          label="Nome da fonte"
                          name="name"
                          required
                          defaultValue={source.name}
                        />
                        <Field
                          label="Link da planilha"
                          name="sheet_url"
                          required
                          defaultValue={source.sheet_url}
                        />
                        <Field
                          label="Primeira linha com lead"
                          name="start_row"
                          type="number"
                          defaultValue={source.start_row ?? 2}
                        />
                        <Field
                          label="ID numérico da aba"
                          name="sheet_gid"
                          defaultValue={source.sheet_gid ?? ""}
                          placeholder="Opcional. Não use o nome da aba."
                        />
                        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
                          <Field
                            label="Coluna do nome"
                            name="name_column"
                            defaultValue={source.name_column ?? "A"}
                            required
                          />
                          <Field
                            label="Coluna do telefone"
                            name="phone_column"
                            defaultValue={source.phone_column ?? "B"}
                          />
                          <Field
                            label="Coluna do email"
                            name="email_column"
                            defaultValue={source.email_column ?? ""}
                            placeholder="Ex.: C"
                          />
                          <Field
                            label="Coluna do CPF"
                            name="cpf_column"
                            defaultValue={source.cpf_column ?? ""}
                            placeholder="Ex.: D"
                          />
                          <Field
                            label="Coluna da campanha"
                            name="campaign_column"
                            defaultValue={source.campaign_column ?? ""}
                            placeholder="Ex.: E"
                          />
                          <Field
                            label="Coluna de observações"
                            name="notes_column"
                            defaultValue={source.notes_column ?? ""}
                            placeholder="Ex.: F"
                          />
                        </div>
                        <p className="text-sm leading-6 text-slate-600 lg:col-span-2">
                          Se você colocou o nome da aba no campo ID, deixe em branco
                          e salve. O CRM vai tentar identificar a aba pelo link.
                        </p>
                        <div className="lg:col-span-2">
                          <button
                            type="submit"
                            className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
                          >
                            Salvar alterações
                          </button>
                        </div>
                      </form>
                    </details></div>
      }))}>
        <section id="conexoes" className="ns-panel p-4"><h2 className="mb-3 text-sm font-semibold">Distribuição de leads</h2><p className="text-xs text-[var(--ns-text-secondary)]">A distribuição manual e por rotação utiliza os consultores selecionados na fila.</p><Link href="/leads" className="mt-3 inline-flex text-xs font-semibold text-[var(--ns-primary)]">Ver fila e distribuir</Link></section>
      </ReferenceCollection>
      </>}
      <details id="nova-fonte" className="ns-panel p-4"><summary className="text-sm font-semibold">Nova fonte do Google Sheets</summary>          <form action={createLeadSourceAction} className="grid gap-4 p-6 lg:grid-cols-2">
            <Field
              label="Nome da fonte"
              name="name"
              required
              placeholder="Ex.: Trafego Kairos - Veiculos"
            />
            <Field
              label="Link da planilha"
              name="sheet_url"
              required
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
            <Field
              label="Primeira linha com lead"
              name="start_row"
              type="number"
              defaultValue={2}
              placeholder="2"
            />
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                Configuração avancada da aba
              </summary>
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,360px)_1fr]">
                <Field
                  label="ID numérico da aba"
                  name="sheet_gid"
                  placeholder="Opcional. Ex.: 0 ou 123456789"
                />
                <p className="text-sm leading-6 text-slate-600">
                  Este campo não é o nome da página/aba. Ele é o número que aparece
                  no final do link como <span className="font-mono">#gid=...</span>.
                  Se ficar em branco, o CRM usa a primeira aba ou a aba que já está
                  no link informado.
                </p>
              </div>
            </details>
            <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
              <Field label="Coluna do nome" name="name_column" defaultValue="A" required />
              <Field label="Coluna do telefone" name="phone_column" defaultValue="B" />
              <Field label="Coluna do email" name="email_column" placeholder="Ex.: C" />
              <Field label="Coluna do CPF" name="cpf_column" placeholder="Ex.: D" />
              <Field label="Coluna da campanha" name="campaign_column" placeholder="Ex.: E" />
              <Field label="Coluna de observações" name="notes_column" placeholder="Ex.: F" />
            </div>
            <p className="text-sm leading-6 text-slate-600 lg:col-span-2">
              Dica: se a planilha tiver cabecalhos como Nome, Telefone, Mídia e
              Observação, o CRM tenta identificar as colunas automaticamente,
              mesmo que a configuração acima esteja diferente.
            </p>
            <div className="lg:col-span-2">
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
              >
                Cadastrar fonte
              </button>
            </div>
          </form></details>
    </div>
  </>;
}

