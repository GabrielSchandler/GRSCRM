import Link from "next/link";
import { ThemeScript } from "@/components/newsec/theme-script";
import { NewSecSidebarNav } from "@/components/newsec/sidebar-nav";
import { Notificador } from "@/components/newsec/notificador";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export default async function NewSecLayout({ children }: { children: React.ReactNode }) {
  // Pro avisador de mensagens (som/aviso/título) — roda em todas as telas do shell novo.
  const { userProfileId, companyId } = await getCurrentUserContext();

  return (
    <div
      id="ns-shell-root"
      className="ns-shell fixed inset-0 flex overflow-hidden"
      // O script inline em ThemeScript grava data-theme diretamente no DOM
      // antes da hidratacao (evita flash de tema); isso e uma mutacao fora
      // do controle do React nesse elemento especifico, entao o React nao
      // deve tentar reconciliar esse atributo.
      suppressHydrationWarning
    >
      <ThemeScript />

      {/* No celular a barra lateral vira gaveta (MenuMobile, na barra do topo). */}
      <div className="hidden w-[200px] shrink-0 flex-col border-r border-[var(--ns-border)] bg-[var(--ns-surface)] md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--ns-primary)] text-xs font-bold text-[var(--ns-primary-foreground)]">
            N
          </div>
          <span className="text-sm font-semibold text-[var(--ns-text)]">NewSec</span>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <NewSecSidebarNav />
        </div>
        <div className="border-t border-[var(--ns-border)] px-3 py-3 text-[11px] text-[var(--ns-text-secondary)]">
          <Link href="/dashboard" className="underline decoration-dotted hover:text-[var(--ns-text)]">
            ← voltar ao CRM atual
          </Link>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-[var(--ns-bg)]">{children}</div>
      <Notificador userProfileId={userProfileId} companyId={companyId} />
    </div>
  );
}
