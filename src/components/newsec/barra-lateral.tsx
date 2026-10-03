"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ArrowLeftRight } from "lucide-react";
import { assinarNotificacoes, lerNotificacoes, lerNotificacoesNoServidor } from "@/lib/newsec/notificacoes";
import { ITENS_DISPONIVEIS, type NavItem } from "./sidebar-nav";

/**
 * Menu lateral do shell novo (computador): só os ícones; ao passar o mouse (ou navegar pelo teclado)
 * abre completo POR CIMA da tela, sem empurrar o conteúdo — pedido do Gabriel, 02/10/2026.
 * Um pequeno atraso na abertura evita abrir sem querer quando o mouse só passa pela borda.
 * No celular o menu continua sendo a gaveta da barra do topo (MenuMobile).
 */
const LARGURA_FECHADA = "w-[68px]";

export function BarraLateral() {
  const pathname = usePathname();
  const avisos = useSyncExternalStore(assinarNotificacoes, lerNotificacoes, lerNotificacoesNoServidor);
  const contagem: Record<string, number> = {
    "/atendimento": avisos.naoLidasAtendimento,
    "/chat-interno": avisos.naoLidasInterno,
  };

  const grupos: { titulo: string; itens: NavItem[] }[] = [
    { titulo: "Atendimento", itens: ITENS_DISPONIVEIS.filter((i) => i.grupo === "atendimento") },
    { titulo: "CRM", itens: ITENS_DISPONIVEIS.filter((i) => i.grupo === "crm") },
  ];

  return (
    <div className={`relative hidden ${LARGURA_FECHADA} shrink-0 md:block`}>
      <nav
        aria-label="Navegação principal"
        className={`group/barra absolute inset-y-0 left-0 z-40 flex ${LARGURA_FECHADA} flex-col overflow-hidden border-r border-[var(--ns-border)] bg-[var(--ns-surface)] transition-[width,box-shadow] duration-200 ease-out hover:w-[244px] hover:shadow-[8px_0_32px_-12px_rgba(15,23,42,0.25)] hover:delay-100 focus-within:w-[244px] focus-within:shadow-[8px_0_32px_-12px_rgba(15,23,42,0.25)]`}
      >
        {/* Marca */}
        <div className="flex h-16 shrink-0 items-center gap-3 px-[18px]">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--ns-primary)] to-violet-500 text-sm font-bold text-white shadow-sm">
            N
          </span>
          <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-[var(--ns-text)] opacity-0 transition-opacity duration-150 group-hover/barra:opacity-100 group-focus-within/barra:opacity-100">
            NewSec
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-2.5 pb-3 pt-1">
          {grupos.map((grupo, indice) => (
            <div key={grupo.titulo} className="flex flex-col gap-1">
              {/* Título do grupo aparece aberto; fechado vira uma linha fina separando os grupos. */}
              <div className="relative h-4">
                {indice > 0 && (
                  <span className="absolute left-2 right-2 top-1/2 h-px bg-[var(--ns-border)] transition-opacity group-hover/barra:opacity-0 group-focus-within/barra:opacity-0" />
                )}
                <span className="absolute left-3 top-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ns-text-secondary)] opacity-0 transition-opacity duration-150 group-hover/barra:opacity-100 group-focus-within/barra:opacity-100">
                  {grupo.titulo}
                </span>
              </div>
              {grupo.itens.map((item) => {
                const ativo = !item.externo && (pathname === item.href || pathname.startsWith(`${item.href}/`));
                const Icone = item.icon;
                const naoLidas = contagem[item.href] ?? 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={ativo ? "page" : undefined}
                    className={`relative flex h-10 items-center gap-3 rounded-xl px-[14px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)] ${
                      ativo
                        ? "bg-[var(--ns-primary)]/10 text-[var(--ns-primary)]"
                        : "text-[var(--ns-text-secondary)] hover:bg-[var(--ns-surface-hover)] hover:text-[var(--ns-text)]"
                    }`}
                  >
                    {ativo && <span aria-hidden="true" className="absolute -left-2.5 top-2 bottom-2 w-[3px] rounded-r-full bg-[var(--ns-primary)]" />}
                    <span className="relative shrink-0">
                      <Icone aria-hidden="true" className="h-5 w-5" strokeWidth={ativo ? 2.25 : 1.9} />
                      {naoLidas > 0 && (
                        <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ns-danger)] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-[var(--ns-surface)]">
                          {naoLidas > 99 ? "99+" : naoLidas}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/barra:opacity-100 group-focus-within/barra:opacity-100">
                      {item.label}
                    </span>
                    {item.externo && (
                      <span className="whitespace-nowrap text-[10px] font-normal text-[var(--ns-text-secondary)] opacity-0 transition-opacity duration-150 group-hover/barra:opacity-70 group-focus-within/barra:opacity-70">
                        CRM
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-[var(--ns-border)] px-2.5 py-2.5">
          <Link
            href="/dashboard"
            className="flex h-10 items-center gap-3 rounded-xl px-[14px] text-sm text-[var(--ns-text-secondary)] transition-colors hover:bg-[var(--ns-surface-hover)] hover:text-[var(--ns-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)]"
          >
            <ArrowLeftRight aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={1.9} />
            <span className="whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/barra:opacity-100 group-focus-within/barra:opacity-100">
              Ir para o CRM clássico
            </span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
