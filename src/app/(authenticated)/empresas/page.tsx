import Link from "next/link";
import { Building2, Users, ShieldCheck, Lock } from "lucide-react";
import { ManagementMetric } from "@/components/management/management-ui";
import { ReferenceCollection } from "@/components/newsec/reference-collection";
import { ReferenceFacts, ReferenceBadge } from "@/components/newsec/reference-ui";
import { CompanyLifecycleControls } from "@/components/company/company-lifecycle-controls";
import { RevealDetailsButton } from "@/components/newsec/reveal-details-button";
import { redirect } from "next/navigation";
import { createPlatformCompanyAction } from "@/app/(authenticated)/empresas/actions";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { displayValue, formatDateTime } from "@/lib/clients/formatters";
import {
  companyModuleDefinitions,
  defaultCompanyPlatformSettings,
  getCompanyPlatformStatusMeta,
  isCompanyPlatformSettingsMissingError,
  mergeCompanyPlatformSettings,
} from "@/lib/company/platform-settings";
import { getHomeForRole } from "@/lib/workspace";
import type { CompanyPlatformSettings, CompanyProfile } from "@/types/company";
import type { CompanyUserProfile } from "@/types/user";

type EmpresasPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

function companyDisplayName(company: Pick<CompanyProfile, "trade_name" | "legal_name">) {
  return company.trade_name?.trim() || company.legal_name?.trim() || "Empresa sem nome";
}

function errorMessage(error?: string) {
  if (!error) {
    return null;
  }

  if (error === "empresa_indisponivel") {
    return "A empresa selecionada não está disponível. Escolha outra empresa para continuar.";
  }

  return decodeURIComponent(error);
}

function settingsForCompany(
  companyId: string,
  settingsMap: Map<string, CompanyPlatformSettings>,
) {
  return settingsMap.get(companyId) ?? defaultCompanyPlatformSettings(companyId);
}


export default async function EmpresasPage({ searchParams }: EmpresasPageProps) {
  const params = await searchParams;
  const {
    supabase,
    role,
    businessArea,
    companyId,
    selectedCompanyId,
    isPlatformOwner,
    profileCompanyId,
  } = await getCurrentUserContext();

  if (!isPlatformOwner) {
    redirect(getHomeForRole(role, businessArea));
  }

  const [{ data: companyRows, error: companiesError }, { data: userRows }] =
    await Promise.all([
      supabase
        .from("companies")
        .select(
          "id, legal_name, trade_name, cnpj, email, phone, user_license_limit, created_at, updated_at",
        )
        .order("created_at", { ascending: false }),
      supabase.from("user_profiles").select("id, company_id, is_active, is_platform_owner"),
    ]);

  const { data: rawSettingsRows, error: settingsError } = await supabase
    .from("company_platform_settings")
    .select("*");
  const settingsTableReady = !isCompanyPlatformSettingsMissingError(settingsError);
  const settingsWarning =
    settingsError && settingsTableReady
      ? `Não foi possível carregar configurações SaaS: ${settingsError.message}`
      : null;

  const companies = (companyRows ?? []) as CompanyProfile[];
  const settingsRows = settingsTableReady
    ? ((rawSettingsRows ?? []) as CompanyPlatformSettings[])
    : [];
  const settingsMap = new Map(
    settingsRows.map((settings) => [
      settings.company_id,
      mergeCompanyPlatformSettings(settings.company_id, settings),
    ]),
  );
  const usersByCompany = new Map<string, { total: number; active: number }>();

  ((userRows ?? []) as Pick<CompanyUserProfile, "id" | "company_id" | "is_active">[]).forEach(
    (user) => {
      const current = usersByCompany.get(user.company_id) ?? { total: 0, active: 0 };
      current.total += 1;
      current.active += user.is_active ? 1 : 0;
      usersByCompany.set(user.company_id, current);
    },
  );

  const activeCompanyId = selectedCompanyId || companyId;
  const activeUsers = Array.from(usersByCompany.values()).reduce(
    (total, item) => total + item.active,
    0,
  );
  const contractedUsers = companies.reduce(
    (total, company) => total + Number(company.user_license_limit ?? 0),
    0,
  );
  const activeSettingsCount = companies.filter(
    (company) => settingsForCompany(company.id, settingsMap).status === "active",
  ).length;
  const trialSettingsCount = companies.filter(
    (company) => settingsForCompany(company.id, settingsMap).status === "trial",
  ).length;

  const pageError = errorMessage(params.error);


  const { data: lifecycleRows, error: lifecycleError } = await supabase.from("company_lifecycle").select("company_id, deleted_at, purge_after");
  const lifecycleMap = new Map((lifecycleRows ?? []).map(row => [row.company_id, row]));
  const protectedIds = new Set((userRows ?? []).filter(row => row.is_platform_owner).map(row => row.company_id));
  const blockedCount = companies.filter(company => ["suspended", "cancelled"].includes(settingsForCompany(company.id, settingsMap).status ?? "active")).length;

  return <>
    <PageHeader title="Master da plataforma" description="Empresas, licenças e controle de acesso ao CRM." />
    <div className="reference-page mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      {(pageError || companiesError || settingsWarning) && <p role="alert" className="ns-panel p-4 text-sm text-[var(--ns-danger)]">{pageError || companiesError?.message || settingsWarning}</p>}
      {!settingsTableReady && <p role="alert" className="ns-panel p-4 text-xs text-[var(--ns-warning)]">Configurações da plataforma indisponíveis. Bloqueio exige o SQL company-platform-settings.</p>}
      {lifecycleError && <p role="alert" className="ns-panel p-4 text-xs text-[var(--ns-text-secondary)]">Exclusão recuperável ainda não habilitada: aplique o SQL company-lifecycle e configure a rotina de limpeza. Bloqueio continua disponível.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ManagementMetric label="Empresas cadastradas" value={companies.length} detail={`${activeSettingsCount} ativas · ${trialSettingsCount} em teste`} icon={Building2} />
        <ManagementMetric label="Acesso bloqueado" value={blockedCount} icon={Lock} tone="danger" />
        <ManagementMetric label="Contas ativas" value={activeUsers} detail="Perfis não desativados" icon={Users} tone="success" />
        <ManagementMetric label="Licenças contratadas" value={contractedUsers} icon={ShieldCheck} />
      </div>
      <ReferenceCollection title="Empresas" detailTitle="Detalhes da empresa" columns={["Empresa", "Status", "Usuários", "Licenças", "Criada em", "Ações"]} actions={<RevealDetailsButton targetId="criar-empresa" className="rounded-md bg-[var(--ns-primary)] px-3 py-2 text-xs font-semibold text-[var(--ns-primary-foreground)]">Nova empresa</RevealDetailsButton>} rows={companies.map(company => {
        const name = companyDisplayName(company);
        const settings = settingsForCompany(company.id, settingsMap);
        const lifecycle = lifecycleMap.get(company.id);
        const counts = usersByCompany.get(company.id) ?? { total: 0, active: 0 };
        const meta = getCompanyPlatformStatusMeta(settings.status);
        const status = lifecycle ? "Excluída" : meta.label;
        const badge = <ReferenceBadge key="status" tone={lifecycle ? "danger" : meta.tone === "info" ? "primary" : meta.tone}>{status}</ReferenceBadge>;
        const modules = companyModuleDefinitions.filter(module => settings[module.field] !== false);
        return { id: company.id, title: name, search: [name, company.legal_name, company.cnpj, company.email].join(" "), status,
          cells: [<div key="name"><p className="font-semibold">{name}</p><p className="mt-1 text-[10px] text-[var(--ns-text-secondary)]">{displayValue(company.cnpj)}</p>{company.id === activeCompanyId && <span className="text-[10px] text-[var(--ns-primary)]">Selecionada</span>}</div>, badge, `${counts.active} de ${counts.total} ativos`, company.user_license_limit ?? "Sem limite", formatDateTime(company.created_at), <Link key="settings" href={`/empresas/${company.id}`} className="text-[var(--ns-primary)]">Configurar</Link>],
          detail: <div key={company.id} className="space-y-4">{badge}<ReferenceFacts items={[["Razão social", displayValue(company.legal_name)], ["CNPJ", displayValue(company.cnpj)], ["E-mail", displayValue(company.email)], ["Telefone", displayValue(company.phone)], ["Usuários ativos", counts.active], ["Licenças", company.user_license_limit ?? "Sem limite"], ["Criada em", formatDateTime(company.created_at)]]} />
          <div><h3 className="mb-2 text-xs font-semibold">Módulos contratados</h3><div className="flex flex-wrap gap-2">{modules.map(module => <ReferenceBadge key={module.key}>{module.shortLabel}</ReferenceBadge>)}</div></div>
          <div className="flex flex-wrap gap-2">{!lifecycle && <Link href={`/empresas/select?company=${company.id}`} className="rounded-md bg-[var(--ns-primary)] px-3 py-2 text-xs font-semibold text-[var(--ns-primary-foreground)]">Acessar ambiente</Link>}<Link href={`/empresas/${company.id}`} className="rounded-md border border-[var(--ns-border)] px-3 py-2 text-xs">Configurar</Link></div>
          <CompanyLifecycleControls companyId={company.id} name={name} status={settings.status ?? "active"} deletedAt={lifecycle?.deleted_at} deadline={lifecycle?.purge_after} archiveReady={!lifecycleError} protectedCompany={protectedIds.has(company.id) || company.id === profileCompanyId} />
          </div>
        };
      })} />
      <details id="criar-empresa" className="ns-panel p-4"><summary className="text-sm font-semibold text-[var(--ns-primary)]">Cadastrar empresa</summary>          <form
            id="nova-empresa"
            action={createPlatformCompanyAction}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
              Nova empresa
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Criar ambiente no CRM
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ao criar, a empresa recebe o conjunto padrão de modulos. Depois você pode ajustar
              plano, limites e recursos.
            </p>

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Nome fantasia
                <input
                  name="trade_name"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  placeholder="Ex.: Kairos Solucoes"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Razao social
                <input
                  name="legal_name"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  placeholder="Opcional"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                CNPJ
                <input
                  name="cnpj"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  placeholder="Opcional"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                E-mail
                <input
                  name="email"
                  type="email"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  placeholder="Opcional"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Telefone
                <input
                  name="phone"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  placeholder="Opcional"
                />
              </label>
            </div>

            <button
              type="submit"
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              Criar e acessar empresa
            </button>
          </form></details>
    </div>
  </>;
}

