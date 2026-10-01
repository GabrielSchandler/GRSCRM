"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NewSecSidebarNav } from "./sidebar-nav";

/**
 * Celular/tela estreita: a barra lateral fixa de 200 px some (comia metade da tela) e vira uma gaveta
 * aberta pelo botão ☰ na barra do topo. Fecha ao navegar, ao tocar fora ou no Esc.
 */
export function MenuMobile() {
  const [aberto, setAberto] = useState(false);
  const caminho = usePathname();

  useEffect(() => setAberto(false), [caminho]);
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aberto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--ns-border)] text-[var(--ns-text)] md:hidden"
      >
        <Menu aria-hidden="true" className="h-4 w-4" />
      </button>
      {aberto && (
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" onClick={() => setAberto(false)} className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-[var(--ns-border)] bg-[var(--ns-surface)] shadow-xl">
            <div className="flex items-center justify-between px-4 py-4">
              <span className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--ns-primary)] text-xs font-bold text-[var(--ns-primary-foreground)]">N</span>
                <span className="text-sm font-semibold text-[var(--ns-text)]">NewSec</span>
              </span>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar menu" className="p-1 text-[var(--ns-text-secondary)]">
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <NewSecSidebarNav />
            </div>
            <div className="border-t border-[var(--ns-border)] px-4 py-3 text-xs text-[var(--ns-text-secondary)]">
              <Link href="/dashboard" className="underline decoration-dotted">
                ← voltar ao CRM atual
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
