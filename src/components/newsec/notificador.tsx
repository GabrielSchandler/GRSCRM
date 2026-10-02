"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { BellRing, MessageCircle, MessagesSquare, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import {
  adicionarAviso,
  assinarNotificacoes,
  atualizarNotificacoes,
  lerFoco,
  lerNotificacoes,
  lerNotificacoesNoServidor,
  removerAviso,
  type AvisoNotificacao,
} from "@/lib/newsec/notificacoes";
import { prepararAudio, tocarSomAviso } from "@/lib/newsec/som";

// Roda mesmo com o navegador minimizado — é justamente quando o aviso mais importa.
const INTERVALO_MS = 10_000;
const CHAVE_PEDIDO_DISPENSADO = "ns:pedido-aviso-windows-dispensado";
const AVISO_SOME_EM_MS = 8_000;

type ConversaComNaoLida = { id: string; unread_count: number; last_message_preview: string | null; contact: { display_name: string | null } | null };
type ConversaInterna = { thread_id: string; kind: string; title: string | null; last_message_preview: string | null; nao_lidas: number; membros: { id: string; nome: string | null }[] };

function previa(texto: string | null) {
  if (!texto) return "Nova mensagem";
  const soTipo = texto.match(/^\[(\w+)\]$/);
  if (soTipo) return { audio: "Áudio", imagem: "Foto", documento: "Arquivo", video: "Vídeo" }[soTipo[1]] ?? "Arquivo";
  return texto.replace(/^\*[^*\n]{1,60}:\*\s*/, "").slice(0, 120);
}

/**
 * Roda nas DUAS cascas do sistema: no shell novo (atendimento/chat interno) e no CRM antigo
 * (comercial, jurídico...) — o aviso tem que chegar em qualquer tela (pedido do Gabriel, 01/10/2026).
 * Por isso o visual vem embrulhado em ".ns-shell": no CRM antigo as cores --ns-* não existem.
 *
 * Avisador do shell NewSec: a cada 10 s confere as conversas de WhatsApp do próprio usuário com
 * mensagem não lida e as conversas do chat interno. Quando o número de uma sobe: toca som, mostra o
 * aviso no canto da tela (clicável) e, se a pessoa permitiu, a notificação do sistema. Também põe o
 * total no título da aba do navegador.
 */
export function Notificador({
  userProfileId,
  companyId,
  oferecerAvisoWindows = false,
  supervisiona = false,
  iaLigada = true,
}: {
  userProfileId: string;
  companyId: string;
  /** No CRM antigo não há o sino da barra do topo — mostra um botão próprio pra ativar o aviso do Windows. */
  oferecerAvisoWindows?: boolean;
  /** Gerente/admin/master: também é avisado quando um cliente cai na fila sem responsável (ex.: a IA passou pra equipe). */
  supervisiona?: boolean;
  /** IA do atendimento ligada? Desligada, a aba IA também conta como fila pros gerentes. */
  iaLigada?: boolean;
}) {
  const [pedidoDispensado, setPedidoDispensado] = useState(true);
  useEffect(() => {
    try {
      setPedidoDispensado(localStorage.getItem(CHAVE_PEDIDO_DISPENSADO) === "sim");
    } catch {
      setPedidoDispensado(false);
    }
  }, []);
  function dispensarPedido() {
    setPedidoDispensado(true);
    try {
      localStorage.setItem(CHAVE_PEDIDO_DISPENSADO, "sim");
    } catch {
      // sem armazenamento: some só nesta página
    }
  }
  async function pedirPermissao() {
    if (!("Notification" in window)) return;
    const resposta = await Notification.requestPermission();
    atualizarNotificacoes({ permissaoNavegador: resposta });
    dispensarPedido();
  }
  const router = useRouter();
  const estado = useSyncExternalStore(assinarNotificacoes, lerNotificacoes, lerNotificacoesNoServidor);
  const anteriorRef = useRef<{ whatsapp: Map<string, number>; interno: Map<string, number>; fila: Set<string>; em: number } | null>(null);

  // O navegador só deixa tocar som depois de um clique/tecla na página: prepara o áudio no 1º gesto.
  useEffect(() => {
    const preparar = () => prepararAudio();
    window.addEventListener("pointerdown", preparar);
    window.addEventListener("keydown", preparar);
    return () => {
      window.removeEventListener("pointerdown", preparar);
      window.removeEventListener("keydown", preparar);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelado = false;

    async function conferir() {
      const [whatsapp, interno, fila] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, unread_count, last_message_preview, contact:contacts(display_name)", { count: "exact" })
          .eq("company_id", companyId)
          .eq("assigned_user_profile_id", userProfileId)
          .gt("unread_count", 0)
          .order("last_activity_at", { ascending: false })
          .limit(30),
        // Se a migração do chat interno ainda não estiver aplicada, só não conta (erro ignorado).
        supabase.rpc("listar_conversas_internas"),
        // Fila sem responsável (a IA passou pra equipe, ou chegou contato sem IA): quem supervisiona distribui.
        supervisiona
          ? supabase
              .from("conversations")
              .select("id, status, unread_count, last_message_preview, contact:contacts(display_name)")
              .eq("company_id", companyId)
              // IA desligada: contato novo fica na aba IA sem ninguém respondendo — também é fila.
              .in("status", iaLigada ? ["aguardando_humano"] : ["aguardando_humano", "ia"])
              .is("assigned_user_profile_id", null)
              .gt("unread_count", 0)
              .order("last_activity_at", { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [] as unknown[], error: null }),
      ]);
      if (cancelado) return;

      const listaWhatsapp = (whatsapp.data ?? []) as unknown as ConversaComNaoLida[];
      const listaInterno = ((interno.data ?? []) as ConversaInterna[]).filter((t) => t.nao_lidas > 0);
      const atual = {
        whatsapp: new Map(listaWhatsapp.map((c) => [c.id, c.unread_count])),
        interno: new Map(listaInterno.map((t) => [t.thread_id, t.nao_lidas])),
        fila: new Set(((fila.data ?? []) as unknown as ConversaComNaoLida[]).map((c) => c.id)),
        em: Date.now(),
      };
      atualizarNotificacoes({
        naoLidasAtendimento: whatsapp.error ? lerNotificacoes().naoLidasAtendimento : (whatsapp.count ?? listaWhatsapp.length),
        naoLidasInterno: interno.error ? lerNotificacoes().naoLidasInterno : listaInterno.length,
      });

      const anterior = anteriorRef.current;
      anteriorRef.current = atual;
      if (!anterior) return; // 1ª leitura só marca o ponto de partida — não avisa o que já estava lá

      const novos: AvisoNotificacao[] = [];
      const subiram = listaWhatsapp.filter((c) => c.unread_count > (anterior.whatsapp.get(c.id) ?? 0));
      // Conversa que acabou de ser transferida pra mim vira aviso de "Contato novo" (pedido do Gabriel, 02/10/2026).
      const transferidasAgora = new Map<string, string | null>();
      const recemChegadas = subiram.filter((c) => !anterior.whatsapp.has(c.id));
      if (recemChegadas.length > 0) {
        const { data: transferencias } = await supabase
          .from("conversation_transfers")
          .select("conversation_id, by:user_profiles!conversation_transfers_transferred_by_fkey(full_name)")
          .in(
            "conversation_id",
            recemChegadas.map((c) => c.id),
          )
          .eq("to_user_profile_id", userProfileId)
          .gte("created_at", new Date(anterior.em - 60_000).toISOString());
        for (const t of (transferencias ?? []) as unknown as { conversation_id: string; by: { full_name: string | null } | null }[]) {
          transferidasAgora.set(t.conversation_id, t.by?.full_name?.trim().split(/\s+/)[0] ?? null);
        }
        if (cancelado) return;
      }
      for (const c of subiram) {
        const transferida = transferidasAgora.has(c.id);
        const quem = transferidasAgora.get(c.id);
        novos.push({
          id: `c:${c.id}:${Date.now()}`,
          tipo: "whatsapp",
          titulo: transferida ? `Contato novo · ${c.contact?.display_name ?? "Cliente"}` : (c.contact?.display_name ?? "Cliente"),
          texto: transferida ? `Transferido para você${quem ? ` por ${quem}` : ""}` : previa(c.last_message_preview),
          href: `/atendimento?c=${c.id}`,
          em: Date.now(),
        });
      }
      for (const c of (fila.data ?? []) as unknown as ConversaComNaoLida[]) {
        if (anterior.fila.has(c.id)) continue;
        const naAbaIa = (c as { status?: string }).status === "ia";
        novos.push({
          id: `c:${c.id}:${Date.now()}`,
          tipo: "whatsapp",
          titulo: `${naAbaIa ? "Contato novo na aba IA" : "Cliente esperando atendimento"} · ${c.contact?.display_name ?? "Cliente"}`,
          texto: naAbaIa ? "IA desligada: ninguém respondeu ainda — abra para assumir." : "Sem responsável — abra para assumir ou transferir.",
          href: `/atendimento?c=${c.id}`,
          em: Date.now(),
        });
      }
      for (const t of listaInterno) {
        if (t.nao_lidas > (anterior.interno.get(t.thread_id) ?? 0)) {
          const nome = t.kind === "grupo" ? (t.title ?? "Grupo") : (t.membros[0]?.nome ?? "Colega");
          novos.push({
            id: `t:${t.thread_id}:${Date.now()}`,
            tipo: "interno",
            titulo: nome,
            texto: previa(t.last_message_preview),
            href: `/chat-interno?t=${t.thread_id}`,
            em: Date.now(),
          });
        }
      }

      // "Olhando a tela" = aba visível E janela do navegador em primeiro plano. Minimizado, atrás de
      // outro programa ou em outra aba: aviso do Windows (se a pessoa ativou).
      const olhando = document.visibilityState === "visible" && document.hasFocus();
      for (const aviso of novos) {
        const chaveFoco = aviso.id.split(":").slice(0, 2).join(":");
        // Já está olhando essa conversa: não precisa de aviso.
        if (olhando && lerFoco() === chaveFoco) continue;
        adicionarAviso(aviso);
        window.setTimeout(() => removerAviso(aviso.id), AVISO_SOME_EM_MS);
        if (lerNotificacoes().somLigado) tocarSomAviso(aviso.tipo);
        if (!olhando && "Notification" in window && Notification.permission === "granted") {
          try {
            const n = new Notification(aviso.tipo === "interno" ? `Chat interno · ${aviso.titulo}` : `WhatsApp · ${aviso.titulo}`, {
              body: aviso.texto,
              tag: chaveFoco, // agrupa avisos da mesma conversa...
              renotify: true, // ...mas avisa de novo a cada mensagem nova
            } as NotificationOptions);
            n.onclick = () => {
              window.focus();
              router.push(aviso.href);
              n.close();
            };
          } catch {
            // alguns navegadores só permitem notificação via service worker: fica o aviso na tela
          }
        }
      }
    }

    void conferir();
    // O relógio roda num Web Worker: com o navegador minimizado, Chrome/Edge seguram o setInterval
    // da página pra no máximo 1 vez por minuto, mas não seguram mensagem vinda de um worker.
    let relogio: Worker | null = null;
    let intervalo: number | undefined;
    try {
      const codigo = `setInterval(() => postMessage(0), ${INTERVALO_MS});`;
      relogio = new Worker(URL.createObjectURL(new Blob([codigo], { type: "text/javascript" })));
      relogio.onmessage = () => void conferir();
    } catch {
      intervalo = window.setInterval(() => void conferir(), INTERVALO_MS);
    }
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void conferir();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      cancelado = true;
      relogio?.terminate();
      if (intervalo !== undefined) window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [companyId, userProfileId, router, supervisiona, iaLigada]);

  // Total no título da aba do navegador.
  const total = estado.naoLidasAtendimento + estado.naoLidasInterno;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = total > 0 ? `(${total}) ${base}` : base;
  }, [total]);

  const mostrarPedido = oferecerAvisoWindows && !pedidoDispensado && estado.permissaoNavegador === "default";
  if (estado.avisos.length === 0 && !mostrarPedido) return null;
  return (
    <div
      className="ns-shell pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2"
      style={{ background: "transparent" }}
      aria-live="polite"
    >
      {mostrarPedido && (
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-[var(--ns-border)] bg-[var(--ns-surface)] p-2.5 text-xs text-[var(--ns-text)] shadow-lg">
          <BellRing aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--ns-primary)]" />
          <span className="flex-1">Receber aviso de mensagem nova mesmo com outra aba ou programa aberto?</span>
          <button type="button" onClick={pedirPermissao} className="rounded-md bg-[var(--ns-primary)] px-2 py-1 font-medium text-[var(--ns-primary-foreground)]">
            Ativar
          </button>
          <button type="button" onClick={dispensarPedido} aria-label="Agora não" className="text-[var(--ns-text-secondary)] hover:text-[var(--ns-text)]">
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {estado.avisos.slice(0, 3).map((aviso) => (
        <div
          key={aviso.id}
          className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-[var(--ns-border)] bg-[var(--ns-surface)] p-3 shadow-lg"
        >
          <span
            className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
              aviso.tipo === "interno" ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "bg-[var(--ns-primary)]/15 text-[var(--ns-primary)]"
            }`}
          >
            {aviso.tipo === "interno" ? <MessageCircle aria-hidden="true" className="h-4 w-4" /> : <MessagesSquare aria-hidden="true" className="h-4 w-4" />}
          </span>
          <button
            type="button"
            onClick={() => {
              removerAviso(aviso.id);
              router.push(aviso.href);
            }}
            className="min-w-0 flex-1 text-left"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ns-text-secondary)]">
              {aviso.tipo === "interno" ? "Chat interno" : "WhatsApp"}
            </p>
            <p className="truncate text-sm font-semibold text-[var(--ns-text)]">{aviso.titulo}</p>
            <p className="line-clamp-2 text-xs text-[var(--ns-text-secondary)]">{aviso.texto}</p>
          </button>
          <button
            type="button"
            onClick={() => removerAviso(aviso.id)}
            aria-label="Fechar aviso"
            className="shrink-0 rounded p-0.5 text-[var(--ns-text-secondary)] hover:text-[var(--ns-text)]"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
