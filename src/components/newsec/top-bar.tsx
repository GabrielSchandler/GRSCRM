import Link from "next/link";
import { Search } from "lucide-react";
import { MenuMobile } from "./menu-mobile";
import { SinoNotificacoes } from "./sino-notificacoes";
import { ThemeToggle } from "./theme-toggle";

export function TopBar({
  companyName,
  links = [],
}: {
  companyName: string;
  /** Links de contexto (ex.: "Supervisão", "← Atendimento") antes da busca. */
  links?: Array<{ href: string; label: string }>;
}) {
  return (
    <header className="flex min-h-[74px] items-center gap-2 border-b border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-3 sm:gap-3 sm:px-6">
      <MenuMobile />
      {links.length > 0 && (
        <nav className="flex shrink-0 items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-[10px] px-2.5 py-1.5 text-sm font-medium text-[var(--ns-text-secondary)] transition hover:bg-[var(--ns-surface-hover)] hover:text-[var(--ns-text)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
      {/* Busca de demonstração: some no celular pra sobrar espaço. */}
      <div className="relative hidden w-full max-w-md sm:block">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ns-text-secondary)]"
        />
        <input
          type="search"
          placeholder="Buscar clientes, conversas, processos... (demonstração)"
          className="w-full rounded-[10px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt,var(--ns-surface-hover))] py-2.5 pl-8 pr-3 text-sm text-[var(--ns-text)] outline-none placeholder:text-[var(--ns-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)]"
          disabled
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <SinoNotificacoes />
        <ThemeToggle />
        <div className="flex items-center gap-2 rounded-[10px] border border-[var(--ns-border)] px-2 py-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ns-primary)]/15 text-[10px] font-semibold text-[var(--ns-primary)]">
            VC
          </div>
          <div className="hidden text-xs leading-tight sm:block">
            <p className="font-medium text-[var(--ns-text)]">Você</p>
            <p className="text-[var(--ns-text-secondary)]">Consultor · {companyName}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
