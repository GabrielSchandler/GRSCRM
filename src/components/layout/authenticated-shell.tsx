"use client";

import { usePathname } from "next/navigation";
import { ThemeScript } from "@/components/newsec/theme-script";

type AuthenticatedShellProps = {
  children: React.ReactNode;
  footer: React.ReactNode;
  sidebar: React.ReactNode;
};

export function AuthenticatedShell({
  children,
  footer,
  sidebar,
}: AuthenticatedShellProps) {
  const pathname = usePathname();
  const hideSidebar = pathname.startsWith("/empresas");
  const managementPage = ["/dashboard", "/usuarios", "/aprovacoes", "/contratos", "/documentos/templates", "/emails/templates", "/empresa", "/integracoes", "/logs", "/backups"].some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));

  const auxiliaryPage = ["/alterar-senha", "/academy/gestao", "/academy/cursos", "/academy/capitulos", "/documentos/gerados", "/documentos/templates/novo", "/documentos/templates/", "/emails/templates", "/integracoes", "/empresa"].some(prefix => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));

  if (hideSidebar) {
    return (
      <div suppressHydrationWarning id="ns-shell-root" className="legacy-newsec ns-shell min-h-screen">
        <ThemeScript />
        <main className="min-w-0 auxiliary-scope">{children}</main>
        <footer>{footer}</footer>
      </div>
    );
  }

  return (
    <div suppressHydrationWarning id="ns-shell-root" className="legacy-newsec ns-shell min-h-screen md:flex">
      <ThemeScript />
      <div className="md:sticky md:top-0 md:z-40 md:h-screen">{sidebar}</div>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className={`min-w-0 flex-1 ${managementPage ? "management-scope" : ""} ${auxiliaryPage ? "auxiliary-scope" : ""}`}>{children}</main>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}
