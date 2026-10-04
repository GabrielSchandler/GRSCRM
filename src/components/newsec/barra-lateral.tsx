"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ArrowLeftRight } from "lucide-react";
import { assinarNotificacoes, lerNotificacoes, lerNotificacoesNoServidor } from "@/lib/newsec/notificacoes";
import { ITENS_DISPONIVEIS, type NavItem } from "./sidebar-nav";

/**
 * Menu lateral do shell novo. No celular o menu continua sendo a gaveta da
 * barra do topo (MenuMobile), preservando a navegacao existente.
 */
const LARGURA_LATERAL = "w-[250px]";

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
    <div className={`hidden ${LARGURA_LATERAL} shrink-0 md:block`}>
      <nav
        aria-label="Navegação principal"
        className="flex h-full w-full flex-col overflow-hidden border-r border-[#26314A] bg-[#10172F] text-[#C8D1E3]"
      >
        {/* Marca */}
        <div className="flex h-[94px] shrink-0 flex-col justify-center border-b border-[#26314A] px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--ns-primary)] text-xs font-bold text-white">
              N
            </span>
            <span className="whitespace-nowrap text-[29px] font-semibold leading-none tracking-normal text-white">
              newsec
            </span>
          </div>
          <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A9B6D0]">
            CRM • Produtividade
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-4 py-5">
          {grupos.map((grupo) => (
            <div key={grupo.titulo} className="flex flex-col gap-1.5">
              <div className="px-3">
                <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8F9BB3]">
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
                    className={`relative flex h-12 items-center gap-3 rounded-[10px] px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#10172F] ${
                      ativo
                        ? "bg-[var(--ns-primary)] text-[var(--ns-primary-foreground)]"
                        : "text-[#C8D1E3] hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="relative shrink-0">
                      <Icone aria-hidden="true" className="h-5 w-5" strokeWidth={ativo ? 2.25 : 1.9} />
                      {naoLidas > 0 && (
                        <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ns-danger)] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-[#10172F]">
                          {naoLidas > 99 ? "99+" : naoLidas}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate whitespace-nowrap">
                      {item.label}
                    </span>
                    {item.externo && (
                      <span className="whitespace-nowrap text-[10px] font-medium text-[#8F9BB3]">
                        CRM
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-[#26314A] px-4 py-4">
          <Link
            href="/dashboard"
            className="flex h-11 items-center gap-3 rounded-[10px] px-4 text-sm font-medium text-[#C8D1E3] transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#10172F]"
          >
            <ArrowLeftRight aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={1.9} />
            <span className="whitespace-nowrap">
              Ir para o CRM clássico
            </span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
