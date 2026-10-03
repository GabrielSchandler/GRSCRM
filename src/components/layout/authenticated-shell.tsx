"use client";

import { usePathname } from "next/navigation";

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
  const hideSidebar = pathname === "/areas" || pathname.startsWith("/empresas");

  if (hideSidebar) {
    return (
      <div className="min-h-screen bg-slate-100">
        <main className="min-w-0">{children}</main>
        <footer>{footer}</footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      {/* z-40: o menu, quando abre por cima, fica acima do conteúdo da página. */}
      <div className="md:sticky md:top-0 md:z-40 md:h-screen">{sidebar}</div>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1">{children}</main>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}
