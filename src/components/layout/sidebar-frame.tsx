"use client";

import Link from "next/link";
import { House, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  classifyWorkspacePath,
  WORKSPACE_COOKIE_NAME,
  type WorkspaceView,
} from "@/lib/workspace";
import { SidebarNav, type SidebarNavigationItem } from "./sidebar-nav";

type SidebarFrameProps = {
  companyName: string;
  companyLogoUrl: string | null;
  canManageTemplates: boolean;
  canAccessUsers: boolean;
  canAccessDashboard: boolean;
  canAccessAdminOnly: boolean;
  homeHref: string;
  resolvedWorkspace: WorkspaceView;
  footer: React.ReactNode;
  logoutNode: React.ReactNode;
  navigation: SidebarNavigationItem[];
};

export function SidebarFrame({
  companyName,
  companyLogoUrl,
  canManageTemplates,
  canAccessUsers,
  canAccessDashboard,
  canAccessAdminOnly,
  homeHref,
  resolvedWorkspace,
  footer,
  logoutNode,
  navigation,
}: SidebarFrameProps) {
  const pathname = usePathname();
  const [workspacePreference, setWorkspacePreference] =
    useState<WorkspaceView>(resolvedWorkspace);

  useEffect(() => {
    const cookieValue = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${WORKSPACE_COOKIE_NAME}=`))
      ?.split("=")[1];

    if (
      cookieValue === "management" ||
      cookieValue === "commercial" ||
      cookieValue === "legal" ||
      cookieValue === "finance" ||
      cookieValue === "academy"
    ) {
      setWorkspacePreference(cookieValue);
    }
  }, [pathname]);

  const currentWorkspace = useMemo(() => {
    if (pathname === "/areas") return workspacePreference;
    const pathWorkspace = classifyWorkspacePath(pathname);

    if (pathWorkspace) {
      return pathWorkspace;
    }

    if (
      workspacePreference === "commercial" ||
      workspacePreference === "legal" ||
      workspacePreference === "finance" ||
      workspacePreference === "academy"
    ) {
      return workspacePreference;
    }

    return resolvedWorkspace === "legal" ? "legal" : "commercial";
  }, [pathname, resolvedWorkspace, workspacePreference]);

  const visibleNavigation = navigation.filter(
    (item) =>
      (!item.adminOnly || canAccessAdminOnly) &&
      (item.href !== "/usuarios" || canAccessUsers) &&
      (item.href !== "/dashboard" || canAccessDashboard) &&
      // Atendimento e chat interno aparecem em qualquer área (comercial, jurídico, financeiro...).
      (["/atendimento", "/chat-interno"].includes(item.href) ||
        (currentWorkspace === "management" &&
        [
          "/dashboard",
          "/aprovacoes",
          "/documentos/templates",
          "/emails/templates",
          "/integracoes",
          "/integracoes/leads",
          "/contratos",
          "/usuarios",
          "/empresa",
          "/backups",
          "/logs",
          "/academy/gestao",
        ].includes(item.href)) ||
        (currentWorkspace === "finance" &&
          ["/financeiro", "/financeiro/consultas"].includes(item.href)) ||
        (currentWorkspace === "academy" && ["/academy"].includes(item.href)) ||
        (currentWorkspace === "commercial" &&
          [
            "/comercial",
            "/leads",
            "/clientes",
            "/pre-vendas",
            "/calculos",
            "/documentos",
            "/academy",
          ].includes(item.href)) ||
        (currentWorkspace === "legal" &&
          [
            "/juridico",
            "/clientes",
            "/pre-vendas",
            "/documentos",
            "/integracoes",
            "/academy",
          ].includes(item.href))),
  );

  const workspaceLabel =
    currentWorkspace === "management"
      ? "Gestão"
      : currentWorkspace === "finance"
        ? "Financeiro"
        : currentWorkspace === "academy"
          ? "Academy"
          : currentWorkspace === "legal"
            ? "Jurídico"
            : "Comercial";

  return (
    <>
      <div className="border-b border-[#26314A] bg-[#10172F] px-4 py-3 text-[#C8D1E3] md:hidden">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-[10px] px-2 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7385FF]">
            <span className="flex min-w-0 items-center gap-3">
              {companyLogoUrl ? (
                // Logos cadastrados podem vir de buckets privados ou domínios externos.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={companyLogoUrl}
                  alt={`Logo da empresa ${companyName}`}
                  className="h-10 w-10 rounded-md object-contain"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#5267F5] px-2 text-center text-[11px] font-bold uppercase tracking-wide text-white">
                  {companyName.slice(0, 2)}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-xs uppercase tracking-wide text-[#A9B6D0]">
                  {workspaceLabel}
                </span>
                <span className="block truncate">{companyName}</span>
              </span>
            </span>
            <span className="text-xs text-[#A9B6D0] group-open:hidden">Menu</span>
            <span className="hidden text-xs text-[#A9B6D0] group-open:inline">
              Fechar
            </span>
          </summary>
          <div className="mt-3 space-y-3 pb-2">
            <Link
              href={homeHref}
              onClick={() => {
                document.cookie = `${WORKSPACE_COOKIE_NAME}=${currentWorkspace}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
              }}
              className="inline-flex w-full items-center gap-3 rounded-[10px] bg-[#5267F5] px-3 py-3 text-sm font-semibold text-white transition hover:bg-[#4053DE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7385FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#10172F]"
            >
              <House aria-hidden="true" className="h-4 w-4" />
              Tela inicial
            </Link>
            <SidebarNav
              items={visibleNavigation}
              canManageTemplates={canManageTemplates}
              workspace={currentWorkspace}
              tone="dark"
            />
            {logoutNode}
          </div>
        </details>
      </div>

      <div className="hidden h-screen w-[250px] shrink-0 md:block">
      <aside className="flex h-full w-full flex-col overflow-hidden border-r border-[#26314A] bg-[#10172F] px-4 py-6 text-[#C8D1E3]">
        <div className="border-b border-[#26314A] px-4 pb-5">
          <div className="flex items-center gap-2.5">
            {companyLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={companyLogoUrl}
                alt={`Logo da empresa ${companyName}`}
                className="h-8 w-8 shrink-0 rounded-md object-contain"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#5267F5] text-center text-xs font-bold uppercase tracking-wide text-white">
                N
              </div>
            )}
            <div className="min-w-0 whitespace-nowrap">
              <h1 className="text-[29px] font-semibold leading-none text-white">newsec</h1>
            </div>
          </div>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A9B6D0]">CRM • {workspaceLabel}</p>
        </div>

        <Link href="/areas" className="mt-5 flex items-center justify-between rounded-lg bg-white/5 px-4 py-3 text-white transition hover:bg-white/10"><span><span className="block text-[10px] text-[#A9B6D0]">Workspace</span><span className="mt-1 block text-sm font-semibold">{workspaceLabel}</span></span><ChevronDown className="h-4 w-4" /></Link>
        <div className="mt-4 flex min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <Link
                href={homeHref}
                title="Tela inicial"
                onClick={() => {
                  document.cookie = `${WORKSPACE_COOKIE_NAME}=${currentWorkspace}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
                }}
                className={`inline-flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-lg px-4 py-3 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7385FF] ${pathname === homeHref ? "bg-[#5267F5]" : "hover:bg-white/5"}`}
              >
                <House aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate whitespace-nowrap">Tela inicial</span>
              </Link>
            </div>
            <SidebarNav
              items={visibleNavigation}
              canManageTemplates={canManageTemplates}
              workspace={currentWorkspace}
              compacto
              tone="dark"
            />
          </div>
        </div>

        <div className="px-4 pb-3 text-xs text-[#8F9BB3] whitespace-nowrap">{companyName} · {footer}</div>

        {logoutNode}
      </aside>
      </div>
    </>
  );
}
