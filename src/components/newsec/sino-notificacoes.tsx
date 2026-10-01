"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, BellRing, Volume2, VolumeX } from "lucide-react";
import {
  assinarNotificacoes,
  atualizarNotificacoes,
  definirSomLigado,
  lerNotificacoes,
  lerNotificacoesNoServidor,
} from "@/lib/newsec/notificacoes";

function haQuanto(em: number) {
  const minutos = Math.round((Date.now() - em) / 60000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min`;
  return new Date(em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Sino da barra do topo: total de não lidas, últimos avisos, som liga/desliga e notificação do sistema. */
export function SinoNotificacoes() {
  const estado = useSyncExternalStore(assinarNotificacoes, lerNotificacoes, lerNotificacoesNoServidor);
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const total = estado.naoLidasAtendimento + estado.naoLidasInterno;

  useEffect(() => {
    if (!aberto) return;
    const fechar = (evento: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(evento.target as Node)) setAberto(false);
    };
    const esc = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  async function pedirPermissao() {
    if (!("Notification" in window)) return;
    const resposta = await Notification.requestPermission();
    atualizarNotificacoes({ permissaoNavegador: resposta });
  }

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title={total > 0 ? `${total} conversa(s) com mensagem não lida` : "Notificações"}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--ns-border)] text-[var(--ns-text-secondary)] transition hover:bg-[var(--ns-surface-hover)]"
      >
        {total > 0 ? <BellRing aria-hidden="true" className="h-4 w-4 text-[var(--ns-primary)]" /> : <Bell aria-hidden="true" className="h-4 w-4" />}
        {total > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ns-danger)] px-1 text-[10px] font-semibold text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 z-40 mt-1 w-80 rounded-xl border border-[var(--ns-border)] bg-[var(--ns-surface)] p-2 shadow-lg">
          <div className="mb-1 grid grid-cols-2 gap-1.5 text-xs">
            <Link href="/atendimento" onClick={() => setAberto(false)} className="rounded-lg bg-[var(--ns-surface-hover)] px-2.5 py-2 text-[var(--ns-text)]">
              <span className="block text-[11px] text-[var(--ns-text-secondary)]">WhatsApp não lidas</span>
              <span className="text-base font-semibold">{estado.naoLidasAtendimento}</span>
            </Link>
            <Link href="/chat-interno" onClick={() => setAberto(false)} className="rounded-lg bg-[var(--ns-surface-hover)] px-2.5 py-2 text-[var(--ns-text)]">
              <span className="block text-[11px] text-[var(--ns-text-secondary)]">Chat interno não lidas</span>
              <span className="text-base font-semibold">{estado.naoLidasInterno}</span>
            </Link>
          </div>

          <p className="px-1.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ns-text-secondary)]">Últimos avisos</p>
          {estado.historico.length === 0 ? (
            <p className="px-1.5 pb-2 text-xs text-[var(--ns-text-secondary)]">Nenhum aviso desde que a página abriu.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {estado.historico.map((aviso) => (
                <li key={aviso.id}>
                  <Link
                    href={aviso.href}
                    onClick={() => setAberto(false)}
                    className="block rounded-lg px-1.5 py-1.5 hover:bg-[var(--ns-surface-hover)]"
                  >
                    <span className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--ns-text)]">
                      <span className="truncate">
                        {aviso.tipo === "interno" ? "Interno · " : "WhatsApp · "}
                        {aviso.titulo}
                      </span>
                      <span className="shrink-0 text-[10px] font-normal text-[var(--ns-text-secondary)]">{haQuanto(aviso.em)}</span>
                    </span>
                    <span className="block truncate text-[11px] text-[var(--ns-text-secondary)]">{aviso.texto}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-1 space-y-1 border-t border-[var(--ns-border)] pt-2">
            <button
              type="button"
              onClick={() => definirSomLigado(!estado.somLigado)}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-xs text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]"
            >
              {estado.somLigado ? <Volume2 aria-hidden="true" className="h-3.5 w-3.5" /> : <VolumeX aria-hidden="true" className="h-3.5 w-3.5" />}
              Som de aviso: {estado.somLigado ? "ligado" : "desligado"}
            </button>
            {estado.permissaoNavegador === "default" && (
              <button
                type="button"
                onClick={pedirPermissao}
                className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-xs font-medium text-[var(--ns-primary)] hover:bg-[var(--ns-surface-hover)]"
              >
                <BellRing aria-hidden="true" className="h-3.5 w-3.5" />
                Ativar avisos do Windows (mesmo com outra aba aberta)
              </button>
            )}
            {estado.permissaoNavegador === "denied" && (
              <p className="px-1.5 text-[11px] text-[var(--ns-text-secondary)]">
                Avisos do Windows bloqueados neste navegador — libere no cadeado ao lado do endereço do site.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
