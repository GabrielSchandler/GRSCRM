"use client";

import Link from "next/link";
import { House } from "lucide-react";
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
      <div className="border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-2 py-2 text-sm font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
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
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 px-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-700">
                  {companyName.slice(0, 2)}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-xs uppercase tracking-wide text-teal-700">
                  {workspaceLabel}
                </span>
                <span className="block truncate">{companyName}</span>
              </span>
            </span>
            <span className="text-xs text-slate-500 group-open:hidden">Menu</span>
            <span className="hidden text-xs text-slate-500 group-open:inline">
              Fechar
            </span>
          </summary>
          <div className="mt-3 space-y-3 pb-2">
            <Link
              href={homeHref}
              onClick={() => {
                document.cookie = `${WORKSPACE_COOKIE_NAME}=${currentWorkspace}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
              }}
              className="inline-flex w-full items-center gap-3 rounded-lg bg-teal-700 px-3 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            >
              <House aria-hidden="true" className="h-4 w-4" />
              Tela inicial
            </Link>
            <SidebarNav
              items={visibleNavigation}
              canManageTemplates={canManageTemplates}
              workspace={currentWorkspace}
            />
            {logoutNode}
          </div>
        </details>
      </div>

      {/* Computador: só ícones; ao passar o mouse abre completo POR CIMA da tela, sem empurrar o
          conteúdo (pedido do Gabriel, 03/10/2026). Pequeno atraso na abertura evita abrir sem querer. */}
      <div className="relative hidden h-screen w-[72px] shrink-0 md:block">
      <aside className="group/barra absolute inset-y-0 left-0 z-40 flex w-[72px] flex-col overflow-hidden border-r border-slate-200 bg-white px-3 py-5 transition-[width,box-shadow] duration-200 ease-out hover:w-72 hover:shadow-[8px_0_32px_-12px_rgba(15,23,42,0.25)] hover:delay-100 focus-within:w-72 focus-within:shadow-[8px_0_32px_-12px_rgba(15,23,42,0.25)]">
        <div className="px-1">
          <div className="flex items-center gap-3">
            {companyLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={companyLogoUrl}
                alt={`Logo da empresa ${companyName}`}
                className="h-10 w-10 shrink-0 rounded-md object-contain"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-center text-xs font-bold uppercase tracking-wide text-slate-700">
                {companyName.slice(0, 2)}
              </div>
            )}
            <div className="min-w-0 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/barra:opacity-100 group-focus-within/barra:opacity-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                {workspaceLabel}
              </p>
              <h1 className="mt-0.5 truncate text-lg font-semibold text-slate-950">
                {companyName}
              </h1>
            </div>
          </div>
        </div>

        <div className="mt-8 flex min-w-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div>
              <Link
                href={homeHref}
                title="Tela inicial"
                onClick={() => {
                  document.cookie = `${WORKSPACE_COOKIE_NAME}=${currentWorkspace}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
                }}
                className="inline-flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
              >
                <House aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/barra:opacity-100 group-focus-within/barra:opacity-100">Tela inicial</span>
              </Link>
            </div>
            <SidebarNav
              items={visibleNavigation}
              canManageTemplates={canManageTemplates}
              workspace={currentWorkspace}
              compacto
            />
          </div>
        </div>

        <div className="px-3 pb-3 text-xs text-slate-400 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/barra:opacity-100 group-focus-within/barra:opacity-100">{footer}</div>

        {logoutNode}
      </aside>
      </div>
    </>
  );
}
