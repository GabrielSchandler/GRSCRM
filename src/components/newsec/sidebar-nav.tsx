"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageCircle,
  MessagesSquare,
  Users,
  Briefcase,
  Scale,
  Wallet,
  LayoutDashboard,
  Activity,
  GraduationCap,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Rota já existe e funciona hoje (dentro do novo shell ou no CRM atual). */
  disponivel: boolean;
  /** Abre fora do shell novo, numa rota já existente do CRM (visual antigo, dado real). */
  externo?: boolean;
  /** Grupo no menu: atendimento (shell novo) ou telas do CRM. */
  grupo: "atendimento" | "crm";
};

/**
 * Versão enxuta pro GRSCRM (produção) — diferente da do newseccrm (que lista
 * telas que só existem lá). Aqui só "Atendimento" tem shell novo por enquanto;
 * o resto ou aponta pra tela real já existente no CRM (externo) ou fica
 * marcado como não disponível — nunca um link morto. Ver AGENTS.md/
 * MIGRATION_RULES.md do newseccrm: telas migram uma a uma, nessa ordem.
 */
const ITEMS: NavItem[] = [
  { href: "/atendimento", label: "Atendimento", icon: MessagesSquare, disponivel: true, grupo: "atendimento" },
  { href: "/chat-interno", label: "Chat interno", icon: MessageCircle, disponivel: true, grupo: "atendimento" },
  { href: "/clientes", label: "Clientes", icon: Users, disponivel: true, externo: true, grupo: "crm" },
  { href: "/comercial", label: "Comercial", icon: Briefcase, disponivel: true, externo: true, grupo: "crm" },
  { href: "/juridico", label: "Jurídico", icon: Scale, disponivel: true, externo: true, grupo: "crm" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, disponivel: true, externo: true, grupo: "crm" },
  { href: "/academy", label: "Academia", icon: GraduationCap, disponivel: true, externo: true, grupo: "crm" },
  { href: "/dashboards", label: "Dashboards", icon: LayoutDashboard, disponivel: false, grupo: "crm" },
  { href: "/produtividade", label: "Produtividade", icon: Activity, disponivel: false, grupo: "crm" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, disponivel: false, grupo: "crm" },
];

/** Só o que funciona hoje — item desativado no menu só atrapalha (pedido do Gabriel, 02/10/2026). */
export const ITENS_DISPONIVEIS = ITEMS.filter((item) => item.disponivel);

export function NewSecSidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-0.5 px-2">
      {ITENS_DISPONIVEIS.map((item) => {
        // Esta barra só aparece dentro de /atendimento, que não tem link no menu do CRM antigo.
        const disponivelAgora = item.disponivel;
        const isActive = !item.externo && pathname === item.href;
        const Icon = item.icon;

        if (!disponivelAgora) {
          const motivo = "ainda não migrado pro visual novo";
          return (
            <div
              key={item.href}
              aria-disabled="true"
              title={`${item.label} — ${motivo}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--ns-text-secondary)] opacity-50"
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full border border-[var(--ns-text-secondary)]"
              />
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.externo ? `${item.label} (tela atual do CRM)` : item.label}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)] ${
              isActive
                ? "bg-[var(--ns-primary)] text-[var(--ns-primary-foreground)]"
                : "text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]"
            }`}
          >
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
