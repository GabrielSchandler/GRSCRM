import {
  LogOut,
} from "lucide-react";
import { cookies } from "next/headers";
import packageJson from "../../../package.json";
import { signOut } from "@/app/actions/auth";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  isModuleEnabled,
  loadCompanyPlatformSettings,
} from "@/lib/company/platform-settings";
import {
  getHomeForRole,
  resolveCurrentWorkspace,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspace";
import { SidebarFrame } from "./sidebar-frame";
import { type SidebarNavigationItem } from "./sidebar-nav";

const navigation: SidebarNavigationItem[] = [
  // Chat (01/10/2026, pedido do Gabriel): para todos os usuários, em todas as áreas.
  { href: "/atendimento", label: "Atendimento WhatsApp", icon: "chat" },
  { href: "/chat-interno", label: "Chat interno", icon: "internalChat" },
  { href: "/dashboard", label: "Painel comercial", icon: "dashboard" },
  {
    href: "/aprovacoes",
    label: "Aprovações do cliente",
    icon: "approvals",
    managerOnly: true,
  },
  { href: "/comercial", label: "Painel comercial", icon: "dashboard" },
  { href: "/clientes", label: "Clientes", icon: "clients" },
  { href: "/pre-vendas", label: "Pré-vendas", icon: "preSales" },
  { href: "/calculos", label: "Simulações", icon: "calculations" },
  { href: "/documentos", label: "Documentos", icon: "documents" },
  { href: "/academy", label: "Academy", icon: "academy" },
  {
    href: "/documentos/templates",
    label: "Templates",
    icon: "templates",
    managerOnly: true,
  },
  {
    href: "/emails/templates",
    label: "Templates de email",
    icon: "email",
    managerOnly: true,
  },
  { href: "/integracoes", label: "Integracoes", icon: "integrations" },
  {
    href: "/integracoes/leads",
    label: "Fontes de leads",
    icon: "integrations",
    managerOnly: true,
  },
  { href: "/contratos", label: "Contratos", icon: "contracts" },
  { href: "/usuarios", label: "Usuários", icon: "users" },
  { href: "/empresa", label: "Empresa", icon: "company", adminOnly: true },
  {
    href: "/academy/gestao",
    label: "Academy",
    icon: "academy",
    managerOnly: true,
  },
  { href: "/backups", label: "Backups", icon: "backups", adminOnly: true },
  { href: "/logs", label: "Logs", icon: "logs", adminOnly: true },
  { href: "/juridico", label: "Esteira", icon: "legal" },
  {
    href: "/leads",
    label: "Distribuição de leads",
    icon: "leads",
    managerOnly: true,
  },
  { href: "/financeiro", label: "Lancamentos", icon: "finance", adminOnly: true },
  { href: "/financeiro/consultas", label: "Consultas", icon: "finance", adminOnly: true },
];

function resolveCompanyDisplayName(company: {
  trade_name?: string | null;
  legal_name?: string | null;
} | null) {
  return company?.trade_name?.trim() || company?.legal_name?.trim() || "CRM SaaS";
}

export async function AppSidebar() {
  const { role, supabase, companyId, businessArea, isPlatformOwner } =
    await getCurrentUserContext();
  const cookieStore = await cookies();
  const workspaceCookie = cookieStore.get(WORKSPACE_COOKIE_NAME)?.value ?? null;
  const canManageTemplates = role === "admin" || role === "manager" || isPlatformOwner;
  const canAccessUsers = role === "admin" || role === "manager" || isPlatformOwner;
  const canAccessDashboard = role !== "seller";
  const canAccessAdminOnly = role === "admin" || isPlatformOwner;
  const homeHref = getHomeForRole(role, businessArea, isPlatformOwner);
  const resolvedWorkspace = resolveCurrentWorkspace(role, businessArea, workspaceCookie);
  const { data: companyData } = await supabase
    .from("companies")
    .select("trade_name, legal_name, logo_path")
    .eq("id", companyId)
    .maybeSingle();
  const company = (companyData ?? null) as {
    trade_name?: string | null;
    legal_name?: string | null;
    logo_path?: string | null;
  } | null;
  const companyName = resolveCompanyDisplayName(company);
  const { settings } = await loadCompanyPlatformSettings(supabase, companyId);
  const featureFilteredNavigation = navigation.filter((item) => {
    if (item.href === "/comercial") {
      return isModuleEnabled(settings, "commercial");
    }

    if (item.href === "/juridico") {
      return isModuleEnabled(settings, "legal");
    }

    if (item.href.startsWith("/financeiro")) {
      return isModuleEnabled(settings, "finance");
    }

    if (item.href.startsWith("/academy")) {
      return isModuleEnabled(settings, "academy");
    }

    if (item.href === "/leads" || item.href === "/integracoes/leads") {
      return isModuleEnabled(settings, "lead_distribution");
    }

    if (item.href === "/integracoes") {
      return isModuleEnabled(settings, "outlook_email");
    }

    if (item.href === "/backups") {
      return isModuleEnabled(settings, "backups");
    }

    if (item.href === "/calculos") {
      return isModuleEnabled(settings, "simulations");
    }

    if (item.href === "/documentos" || item.href === "/contratos") {
      return isModuleEnabled(settings, "documents");
    }

    if (item.href === "/documentos/templates" || item.href === "/emails/templates") {
      return isModuleEnabled(settings, "custom_templates");
    }

    return true;
  });
  let companyLogoUrl: string | null = null;

  if (company?.logo_path) {
    const { data: signedData } = await supabase.storage
      .from("documents")
      .createSignedUrl(company.logo_path, 60 * 10);

    companyLogoUrl = signedData?.signedUrl ?? null;
  }

  return (
    <SidebarFrame
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      canManageTemplates={canManageTemplates}
      canAccessUsers={canAccessUsers}
      canAccessDashboard={canAccessDashboard}
      canAccessAdminOnly={canAccessAdminOnly}
      homeHref={homeHref}
      resolvedWorkspace={resolvedWorkspace}
      footer={<>Versao {packageJson.version}</>}
      navigation={featureFilteredNavigation}
      logoutNode={
        <form action={signOut}>
          <button
            type="submit"
            title="Sair"
            className="inline-flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
            {/* No menu do computador o texto só aparece ao abrir; no celular (menu aberto) aparece sempre. */}
            <span className="whitespace-nowrap md:opacity-0 md:transition-opacity md:duration-150 md:group-hover/barra:opacity-100 md:group-focus-within/barra:opacity-100">Sair</span>
          </button>
        </form>
      }
    />
  );
}
