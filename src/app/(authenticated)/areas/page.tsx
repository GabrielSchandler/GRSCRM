import { cookies } from "next/headers";
import { Building2, Users, Scale, Settings, Wallet, ChevronRight } from "lucide-react";
import { ReferenceFacts, ReferenceBadge, ReferenceTabs } from "@/components/newsec/reference-ui";
import { WORKSPACE_COOKIE_NAME, resolveCurrentWorkspace } from "@/lib/workspace";
import { companyUserRoles } from "@/types/user";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  isModuleEnabled,
  loadCompanyPlatformSettings,
} from "@/lib/company/platform-settings";
import { getSellerHome, workspaceOptions } from "@/lib/workspace";

export default async function AreasPage() {
  const { role, businessArea, isPlatformOwner, activeCompany, companyId, supabase, fullName, username } =
    await getCurrentUserContext();
  const { settings } = await loadCompanyPlatformSettings(supabase, companyId);
  const visibleWorkspaces = workspaceOptions.filter((workspace) => {
    if (workspace.value === "commercial") {
      return isModuleEnabled(settings, "commercial");
    }

    if (workspace.value === "legal") {
      return isModuleEnabled(settings, "legal");
    }

    if (workspace.value === "finance") {
      return (role === "admin" || isPlatformOwner) && isModuleEnabled(settings, "finance");
    }
    return true;
  });
  if (role === "seller") redirect(getSellerHome(businessArea));
  if (isPlatformOwner && !activeCompany) redirect("/empresas");

  const { data: company, error: companyError } = await supabase.from("companies").select("id, legal_name, trade_name, cnpj, email, phone, street, number, district, city, state").eq("id", companyId).maybeSingle();
  const cookieStore = await cookies();
  const workspace = resolveCurrentWorkspace(role, businessArea, cookieStore.get(WORKSPACE_COOKIE_NAME)?.value);
  const roleName = companyUserRoles.find(item => item.value === role)?.label ?? "Não informado";
  const icons = {management:Settings,commercial:Users,legal:Scale,finance:Wallet,academy:Users};
  const address = company ? [company.street,company.number,company.district,company.city,company.state].filter(Boolean).join(", ") : "";
  return <>
    <PageHeader title="Conta e contexto" description="Empresa selecionada, áreas de trabalho e informações da sua conta." />
    <div className="reference-page mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6">
      <ReferenceTabs items={[{label:"Empresas e áreas",href:"/areas",active:true},...(role === "admin" || role === "manager" ? [{label:"Detalhes da empresa",href:"/empresa"}] : []),{label:"Segurança",href:"/alterar-senha"}]} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_300px]">
        <section className="ns-panel p-5"><h2 className="text-sm font-semibold">Seleção de empresa e área</h2><div className="my-4 flex items-center gap-3 rounded-md border border-[var(--ns-border)] p-3"><Building2 className="h-6 w-6 text-[var(--ns-primary)]" /><span className="text-sm font-semibold">{company?.trade_name || company?.legal_name || "Empresa selecionada"}</span>{isPlatformOwner && <Link href="/empresas" className="ml-auto text-xs text-[var(--ns-primary)]">Trocar empresa</Link>}</div><h3 className="mb-3 text-xs font-semibold">Áreas disponíveis</h3><div className="space-y-3">{visibleWorkspaces.map(item => {const Icon = icons[item.value];return <Link key={item.value} href={`/areas/select?workspace=${item.value}`} className="flex items-center gap-3 rounded-md border border-[var(--ns-border)] p-3 transition hover:bg-[var(--ns-surface-hover)]" style={workspace === item.value ? {borderColor:"var(--ns-primary)"} : undefined}><Icon className="h-6 w-6 shrink-0 text-[var(--ns-primary)]" /><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{item.label}</h3><p className="mt-1 text-xs leading-5 text-[var(--ns-text-secondary)]">{item.description}</p></div>{workspace === item.value && <ReferenceBadge tone="success">Área atual</ReferenceBadge>}<ChevronRight className="h-4 w-4 shrink-0 text-[var(--ns-text-secondary)]" /></Link>;})}</div></section>
        <section className="ns-panel p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Detalhes da empresa</h2>{(role === "admin" || role === "manager") && <Link href="/empresa" className="text-xs font-semibold text-[var(--ns-primary)]">Editar</Link>}</div>{companyError ? <p role="alert" className="mt-4 text-xs text-[var(--ns-danger)]">Não foi possível carregar os dados da empresa.</p> : <ReferenceFacts items={[["Razão social",company?.legal_name ?? "Não informada"],["Nome fantasia",company?.trade_name ?? "Não informado"],["CNPJ",company?.cnpj ?? "Não informado"],["Telefone",company?.phone ?? "Não informado"],["E-mail",company?.email ?? "Não informado"],["Endereço",address || "Não informado"]]} />}</section>
        <div className="space-y-4"><section className="ns-panel p-5"><h2 className="text-sm font-semibold">Meu contexto atual</h2><ReferenceFacts items={[["Usuário",fullName || username || "Não informado"],["Empresa",company?.trade_name || company?.legal_name || "Não informada"],["Área atual",visibleWorkspaces.find(item => item.value === workspace)?.label ?? workspace],["Perfil de acesso",roleName]]} /></section><section className="ns-panel p-5"><h2 className="mb-4 text-sm font-semibold">Segurança</h2><Link href="/alterar-senha" className="flex items-center justify-between rounded-md border border-[var(--ns-border)] p-3 text-xs font-semibold text-[var(--ns-primary)]">Alterar senha<ChevronRight className="h-4 w-4" /></Link></section></div>
      </div>
    </div>
  </>;
}

