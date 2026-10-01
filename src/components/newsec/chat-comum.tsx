"use client";

/**
 * Peças compartilhadas entre o atendimento (WhatsApp) e o chat interno: citar mensagem, busca dentro
 * da conversa, tiques de "visto" e detecção de tela de celular. (01/10/2026)
 */

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, CornerUpLeft, Search, X } from "lucide-react";

/** Tela estreita (< 768 px): lista e conversa viram duas telas, com botão de voltar. */
export function useEhCelular() {
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia("(max-width: 767px)");
    const atualizar = () => setCelular(consulta.matches);
    atualizar();
    consulta.addEventListener("change", atualizar);
    return () => consulta.removeEventListener("change", atualizar);
  }, []);
  return celular;
}

/** Celular e tablet em pé (< 1024 px): lista e conversa em telas separadas — não abre a 1ª conversa sozinho. */
export function ehTelaEstreita() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
}

export function ehTelaDeCelular() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

function resumo(texto: string | null | undefined, tamanho = 90) {
  const limpo = (texto ?? "").replace(/^\*[^*\n]{1,60}:\*\s*/, "").replace(/\s+/g, " ").trim();
  if (!limpo) return "Arquivo";
  return limpo.length > tamanho ? `${limpo.slice(0, tamanho)}…` : limpo;
}

/** A mensagem citada, dentro do balão. Clicar leva até ela na conversa. */
export function CitacaoNaBolha({
  autor,
  texto,
  claro,
  onClick,
}: {
  autor: string;
  texto: string | null | undefined;
  claro: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1.5 block w-full rounded-lg border-l-[3px] px-2 py-1 text-left text-xs ${
        claro ? "border-white/70 bg-white/15" : "border-[var(--ns-primary)] bg-black/5 dark:bg-white/5"
      }`}
    >
      <span className="block font-semibold">{autor}</span>
      <span className="block opacity-80">{resumo(texto)}</span>
    </button>
  );
}

/** Faixa "Respondendo a…" acima da caixa de texto. */
export function BarraCitando({ autor, texto, onCancelar }: { autor: string; texto: string | null | undefined; onCancelar: () => void }) {
  return (
    <div className="mb-2 flex items-start gap-2 rounded-lg border-l-[3px] border-[var(--ns-primary)] bg-[var(--ns-surface-hover)] px-2.5 py-1.5 text-xs">
      <CornerUpLeft aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ns-primary)]" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[var(--ns-text)]">Respondendo a {autor}</span>
        <span className="block truncate text-[var(--ns-text-secondary)]">{resumo(texto, 140)}</span>
      </span>
      <button type="button" onClick={onCancelar} aria-label="Cancelar resposta" className="shrink-0 p-0.5 text-[var(--ns-text-secondary)] hover:text-[var(--ns-text)]">
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Botão "Responder" do balão (sempre visível — no celular não existe passar o mouse). */
export function BotaoResponder({ onClick, claro }: { onClick: () => void; claro: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Responder"
      aria-label="Responder citando esta mensagem"
      className={claro ? "text-[var(--ns-primary-foreground)]/70 hover:text-[var(--ns-primary-foreground)]" : "text-[var(--ns-text-secondary)] hover:text-[var(--ns-text)]"}
    >
      <CornerUpLeft aria-hidden="true" className="h-3 w-3" />
    </button>
  );
}

/**
 * Tiques de envio: ✓ enviada · ✓✓ entregue · ✓✓ azul lida. No chat interno, "parcial" = alguns do
 * grupo já viram (✓✓ cinza) e "lida" = todos viram.
 */
export function Tiques({ estado, claro }: { estado: "enviada" | "entregue" | "parcial" | "lida"; claro: boolean }) {
  const titulo = { enviada: "Enviada", entregue: "Entregue", parcial: "Vista por parte do grupo", lida: "Vista" }[estado];
  if (estado === "enviada") return <Check aria-label={titulo} className="h-3.5 w-3.5" />;
  const azul = estado === "lida";
  return (
    <CheckCheck
      aria-label={titulo}
      className={`h-3.5 w-3.5 ${azul ? (claro ? "text-sky-200" : "text-sky-500") : ""}`}
    />
  );
}

export type ResultadoBusca = { id: string; texto: string; autor: string; quando: string };

/**
 * Busca dentro da conversa (texto das mensagens, no banco — não só no que está carregado).
 * Escolher um resultado chama `onIr`, que leva a conversa até a mensagem.
 */
export function BuscaNaConversa({
  onBuscar,
  onIr,
  onFechar,
}: {
  onBuscar: (termo: string) => Promise<ResultadoBusca[]>;
  onIr: (id: string) => void;
  onFechar: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const pedidoRef = useRef(0);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) {
      setResultados(null);
      return;
    }
    const pedido = ++pedidoRef.current;
    const timer = window.setTimeout(async () => {
      setBuscando(true);
      const achados = await onBuscar(t).catch(() => []);
      if (pedido !== pedidoRef.current) return;
      setResultados(achados);
      setBuscando(false);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [termo, onBuscar]);

  return (
    <div className="relative border-b border-[var(--ns-border)] px-3 py-2">
      <div className="flex items-center gap-2">
        <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--ns-text-secondary)]" />
        <input
          autoFocus
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onFechar()}
          placeholder="Buscar nesta conversa (texto, CPF, valor...)"
          className="min-w-0 flex-1 bg-transparent text-base text-[var(--ns-text)] outline-none placeholder:text-[var(--ns-text-secondary)] md:text-sm"
        />
        <button type="button" onClick={onFechar} aria-label="Fechar busca" className="p-1 text-[var(--ns-text-secondary)] hover:text-[var(--ns-text)]">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {(resultados || buscando) && (
        <div className="absolute inset-x-2 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-1 shadow-lg">
          {buscando && <p className="px-2 py-2 text-xs text-[var(--ns-text-secondary)]">Buscando...</p>}
          {!buscando && resultados?.length === 0 && <p className="px-2 py-2 text-xs text-[var(--ns-text-secondary)]">Nada encontrado.</p>}
          {!buscando &&
            resultados?.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onIr(r.id)}
                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--ns-surface-hover)]"
              >
                <span className="flex justify-between gap-2 text-[11px] text-[var(--ns-text-secondary)]">
                  <span className="truncate font-medium">{r.autor}</span>
                  <span className="shrink-0">{new Date(r.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </span>
                <span className="line-clamp-2 text-xs text-[var(--ns-text)]">{resumo(r.texto, 160)}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/** Leva a área de mensagens até uma mensagem e pisca ela por 2 s. */
export function irAteMensagem(id: string, aoDestacar: (id: string | null) => void) {
  window.requestAnimationFrame(() => {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    aoDestacar(id);
    window.setTimeout(() => aoDestacar(null), 2000);
  });
}
