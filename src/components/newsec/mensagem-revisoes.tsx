"use client";

import { useState } from "react";
import { Clock, Pencil, ShieldCheck, Trash2, XCircle } from "lucide-react";
import type { Message, MessageRevision } from "@/types/atendimento";

// Limites do próprio WhatsApp — os mesmos que o banco confere (0009). Aqui só decidem se o botão aparece.
const LIMITE_EDICAO_MS = 15 * 60 * 1000;
const LIMITE_EXCLUSAO_MS = 48 * 60 * 60 * 1000;
const STATUS_JA_NO_WHATSAPP = new Set(["enviada", "entregue", "lida"]);

function hora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Espelho das regras do banco (validar_revisao_mensagem) — o banco é quem decide de verdade. */
export function permissoesDaMensagem(
  mensagem: Message,
  { userProfileId, podeApagarDeOutros, canalProvider }: { userProfileId: string; podeApagarDeOutros: boolean; canalProvider: string | null },
) {
  if (mensagem.deleted_at) return { podeEditar: false, podeApagar: false };
  const minha = mensagem.author_user_profile_id === userProfileId;
  if (mensagem.is_internal_note) return { podeEditar: minha, podeApagar: minha || podeApagarDeOutros };

  const noWhatsApp =
    canalProvider !== "totalk" &&
    mensagem.direction === "saida" &&
    (mensagem.author_type === "humano" || mensagem.author_type === "ia") &&
    STATUS_JA_NO_WHATSAPP.has(mensagem.status) &&
    Boolean(mensagem.external_id);
  if (!noWhatsApp) return { podeEditar: false, podeApagar: false };

  const idade = Date.now() - new Date(mensagem.sent_at ?? mensagem.created_at).getTime();
  return {
    podeEditar: minha && mensagem.message_type === "texto" && idade < LIMITE_EDICAO_MS,
    podeApagar: (minha || podeApagarDeOutros) && idade < LIMITE_EXCLUSAO_MS,
  };
}

function SeloWhatsApp({ revisao }: { revisao: MessageRevision }) {
  if (revisao.whatsapp_status === "nao_se_aplica") return <span>só no CRM (nota interna)</span>;
  if (revisao.whatsapp_status === "confirmado")
    return (
      <span className="inline-flex items-center gap-0.5">
        <ShieldCheck aria-hidden="true" className="h-3 w-3" /> confirmado no WhatsApp
      </span>
    );
  if (revisao.whatsapp_status === "aguardando")
    return (
      <span className="inline-flex items-center gap-0.5">
        <Clock aria-hidden="true" className="h-3 w-3" /> aguardando o WhatsApp
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5" title={revisao.whatsapp_error ?? undefined}>
      <XCircle aria-hidden="true" className="h-3 w-3" /> WhatsApp recusou{revisao.whatsapp_error ? `: ${revisao.whatsapp_error}` : ""}
    </span>
  );
}

function quemFez(revisao: MessageRevision) {
  if (revisao.origin === "cliente") return "pelo cliente";
  return revisao.requested_by?.full_name ? `por ${revisao.requested_by.full_name}` : "";
}

/** Faixa "Mensagem apagada" — a equipe continua lendo o texto; só muda cor e ganha o aviso. */
export function AvisoMensagemApagada({ mensagem, revisoes }: { mensagem: Message; revisoes: MessageRevision[] }) {
  const exclusao = revisoes.filter((r) => r.kind === "exclusao" && r.whatsapp_status !== "recusado").at(-1);
  return (
    <p className="mb-1 flex flex-wrap items-center gap-1 text-[11px] font-medium text-[var(--ns-danger)]">
      <Trash2 aria-hidden="true" className="h-3 w-3" />
      Mensagem apagada {exclusao ? quemFez(exclusao) : ""} · {hora(mensagem.deleted_at ?? mensagem.updated_at)}
      {exclusao && (
        <span className="font-normal opacity-80">
          · <SeloWhatsApp revisao={exclusao} />
        </span>
      )}
    </p>
  );
}

/**
 * Rodapé de revisões: "editada" (abre o histórico com o texto anterior) e pedidos ainda
 * aguardando/recusados pelo WhatsApp — pra ninguém achar que mudou no celular do cliente sem ter mudado.
 */
export function HistoricoRevisoes({ revisoes, claro }: { revisoes: MessageRevision[]; claro: boolean }) {
  const [aberto, setAberto] = useState(false);
  const edicoesFeitas = revisoes.filter((r) => r.kind === "edicao" && (r.whatsapp_status === "confirmado" || r.whatsapp_status === "nao_se_aplica"));
  const pendentes = revisoes.filter((r) => r.whatsapp_status === "aguardando" || r.whatsapp_status === "recusado");
  if (edicoesFeitas.length === 0 && pendentes.length === 0) return null;

  const corTexto = claro ? "text-[var(--ns-primary-foreground)]/80" : "text-[var(--ns-text-secondary)]";
  return (
    <div className={`mt-1 space-y-0.5 text-[10px] ${corTexto}`}>
      {pendentes.map((r) => (
        <p key={r.id} className={r.whatsapp_status === "recusado" ? "font-medium text-[var(--ns-danger)]" : ""}>
          {r.kind === "edicao" ? "Edição" : "Exclusão"} pedida {quemFez(r)} às {hora(r.created_at)} · <SeloWhatsApp revisao={r} />
        </p>
      ))}
      {edicoesFeitas.length > 0 && (
        <button type="button" onClick={() => setAberto((v) => !v)} className="inline-flex items-center gap-0.5 underline decoration-dotted">
          <Pencil aria-hidden="true" className="h-3 w-3" />
          editada{edicoesFeitas.length > 1 ? ` ${edicoesFeitas.length}x` : ""} — {aberto ? "esconder" : "ver o que era antes"}
        </button>
      )}
      {aberto &&
        edicoesFeitas.map((r) => (
          <div key={r.id} className="rounded-md bg-black/10 px-2 py-1">
            <p>
              {hora(r.confirmed_at ?? r.created_at)} {quemFez(r)} · <SeloWhatsApp revisao={r} />
            </p>
            <p className="whitespace-pre-wrap line-through opacity-80">{r.body_before ?? "(vazio)"}</p>
            <p className="whitespace-pre-wrap">→ {r.body_after}</p>
          </div>
        ))}
    </div>
  );
}

/** Botões de editar/apagar (aparecem só quando as regras permitem) + caixa de edição no lugar do texto. */
export function AcoesMensagem({
  podeEditar,
  podeApagar,
  ehNota,
  onEditar,
  onApagar,
  claro,
}: {
  podeEditar: boolean;
  podeApagar: boolean;
  ehNota: boolean;
  onEditar: () => void;
  onApagar: () => void;
  claro: boolean;
}) {
  if (!podeEditar && !podeApagar) return null;
  const cor = claro ? "text-[var(--ns-primary-foreground)]/70 hover:text-[var(--ns-primary-foreground)]" : "text-[var(--ns-text-secondary)] hover:text-[var(--ns-text)]";
  return (
    <span className="inline-flex items-center gap-1">
      {podeEditar && (
        <button type="button" onClick={onEditar} className={cor} title="Editar mensagem" aria-label="Editar mensagem">
          <Pencil aria-hidden="true" className="h-3 w-3" />
        </button>
      )}
      {podeApagar && (
        <button type="button" onClick={onApagar} className={cor} title={ehNota ? "Apagar nota" : "Apagar para todos"} aria-label={ehNota ? "Apagar nota" : "Apagar para todos"}>
          <Trash2 aria-hidden="true" className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function EditorMensagem({
  textoInicial,
  onSalvar,
  onCancelar,
}: {
  textoInicial: string;
  onSalvar: (texto: string) => Promise<void>;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const [salvando, setSalvando] = useState(false);
  return (
    <div className="space-y-1">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={Math.min(6, Math.max(2, texto.split("\n").length))}
        className="w-full resize-none rounded-md border border-[var(--ns-border)] bg-[var(--ns-surface)] px-2 py-1 text-sm text-[var(--ns-text)]"
        autoFocus
      />
      <div className="flex justify-end gap-2 text-xs">
        <button type="button" onClick={onCancelar} className="rounded px-2 py-0.5 opacity-80 hover:opacity-100">
          Cancelar
        </button>
        <button
          type="button"
          disabled={salvando || !texto.trim() || texto.trim() === textoInicial.trim()}
          onClick={async () => {
            setSalvando(true);
            await onSalvar(texto);
            setSalvando(false);
          }}
          className="rounded bg-[var(--ns-surface)] px-2 py-0.5 font-medium text-[var(--ns-text)] disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
