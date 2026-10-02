"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, FileText, ImageIcon, LogOut, Mic, Pencil, Paperclip, Plus, Search, Send, Square, Trash2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { definirFoco } from "@/lib/newsec/notificacoes";
import { BarraCitando, BotaoResponder, BuscaNaConversa, CitacaoNaBolha, ehTelaDeCelular, irAteMensagem, Tiques, type ResultadoBusca } from "./chat-comum";
import {
  abrirConversaDiretaAction,
  adicionarMembrosGrupoAction,
  criarGrupoInternoAction,
  enviarMensagemInternaAction,
  marcarConversaInternaLidaAction,
  obterArquivosInternosAction,
  prepararEnvioArquivoAction,
  removerMembroGrupoAction,
  renomearGrupoAction,
  type AnexoParaEnviar,
  type ArquivoInterno,
} from "@/app/(newsec)/chat-interno/actions";

type Membro = { id: string; nome: string | null };
type ConversaInterna = {
  thread_id: string;
  kind: "direto" | "grupo";
  title: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  nao_lidas: number;
  membros: Membro[];
  criado_por?: string | null; // 0011
};
type MensagemInterna = {
  id: string;
  thread_id: string;
  author_user_profile_id: string | null;
  body: string | null;
  created_at: string;
  reply_to_message_id?: string | null; // 0011 — citação
  sistema?: boolean; // 0011 — aviso automático ("Fulano adicionou Beltrano")
};
type Pendente = { id: string; arquivo: File; previa: string | null };

const TAMANHO_MAXIMO = 50 * 1024 * 1024;
const INTERVALO_CONVERSA_MS = 4_000; // conversa aberta: perto do tempo real
const INTERVALO_LISTA_MS = 10_000;

function nomeDaConversa(c: ConversaInterna) {
  if (c.kind === "grupo") return c.title ?? "Grupo";
  return c.membros[0]?.nome ?? "Colega";
}

function iniciais(nome: string) {
  return nome
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function tipoDoArquivo(mime: string) {
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "documento";
}

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function horaCurta(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function quandoNaLista(iso: string | null) {
  if (!iso) return "";
  const data = new Date(iso);
  if (data.toDateString() === new Date().toDateString()) return horaCurta(iso);
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function rotuloDia(iso: string) {
  const data = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  if (data.toDateString() === hoje.toDateString()) return "Hoje";
  if (data.toDateString() === ontem.toDateString()) return "Ontem";
  return data.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function ChatInternoWorkspace({
  userProfileId,
  podeGerenciarGrupos,
}: {
  userProfileId: string;
  /** Gerente, administrador ou master: cria grupo e altera nome/participantes (regra no banco, 0012). */
  podeGerenciarGrupos: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [conversas, setConversas] = useState<ConversaInterna[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemInterna[] | null>(null);
  const [arquivos, setArquivos] = useState<Record<string, ArquivoInterno[]>>({});
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [modal, setModal] = useState<null | "direta" | "grupo">(null);
  const [gravandoDesde, setGravandoDesde] = useState<number | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [arrastando, setArrastando] = useState(false);
  const [respondendo, setRespondendo] = useState<MensagemInterna | null>(null);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [destaqueId, setDestaqueId] = useState<string | null>(null);
  const [participantesAberto, setParticipantesAberto] = useState(false);
  // Quando cada participante leu a conversa pela última vez — base do "visto".
  const [leituras, setLeituras] = useState<Record<string, string>>({});

  const conversaPedidaRef = useRef<string | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const grudadoNoFimRef = useRef(true);
  const gravadorRef = useRef<{ gravador: MediaRecorder; cancelar: boolean } | null>(null);
  const entradaArquivoRef = useRef<HTMLInputElement | null>(null);
  const entradaFotoRef = useRef<HTMLInputElement | null>(null);

  const conversa = conversas?.find((c) => c.thread_id === selecionadaId) ?? null;
  const nomePorId = useMemo(() => new Map((conversa?.membros ?? []).map((m) => [m.id, m.nome ?? "Colega"])), [conversa]);

  const carregarConversas = useCallback(async () => {
    const { data, error } = await supabase.rpc("listar_conversas_internas");
    if (error) {
      // PGRST202 = função não existe: a migração 0010 ainda não foi aplicada neste banco.
      setErroLista(
        error.code === "PGRST202"
          ? "O chat interno ainda não foi ativado neste sistema (falta rodar o SQL do chat interno no banco)."
          : `Não foi possível carregar o chat interno: ${error.message}`,
      );
      return;
    }
    setErroLista(null);
    setConversas((data ?? []) as ConversaInterna[]);
  }, [supabase]);

  const buscarArquivos = useCallback(async (threadId: string, lista: MensagemInterna[]) => {
    if (lista.length === 0) return;
    const links = await obterArquivosInternosAction(lista.map((m) => m.id)).catch(() => ({}));
    if (conversaPedidaRef.current === threadId) setArquivos((atual) => ({ ...atual, ...links }));
  }, []);

  const marcarLida = useCallback((threadId: string) => {
    setConversas((atual) => atual?.map((c) => (c.thread_id === threadId ? { ...c, nao_lidas: 0 } : c)) ?? atual);
    void marcarConversaInternaLidaAction(threadId);
  }, []);

  const carregarLeituras = useCallback(
    async (threadId: string) => {
      const { data } = await supabase.from("internal_thread_members").select("user_profile_id, last_read_at").eq("thread_id", threadId);
      if (conversaPedidaRef.current !== threadId) return;
      setLeituras(Object.fromEntries((data ?? []).map((l) => [l.user_profile_id as string, l.last_read_at as string])));
    },
    [supabase],
  );

  const abrirConversa = useCallback(
    async (threadId: string) => {
      conversaPedidaRef.current = threadId;
      grudadoNoFimRef.current = true;
      setSelecionadaId(threadId);
      setMensagens(null);
      setArquivos({});
      setRespondendo(null);
      setBuscaAberta(false);
      setParticipantesAberto(false);
      setLeituras({});
      void carregarLeituras(threadId);
      marcarLida(threadId);
      const { data } = await supabase
        .from("internal_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (conversaPedidaRef.current !== threadId) return;
      const lista = ((data ?? []) as MensagemInterna[]).reverse();
      setMensagens(lista);
      await buscarArquivos(threadId, lista);
    },
    [supabase, buscarArquivos, marcarLida, carregarLeituras],
  );

  function voltarParaLista() {
    conversaPedidaRef.current = null;
    setSelecionadaId(null);
    setMensagens(null);
  }

  const buscarNaConversa = useCallback(
    async (termo: string): Promise<ResultadoBusca[]> => {
      const threadId = conversaPedidaRef.current;
      if (!threadId) return [];
      const { data } = await supabase
        .from("internal_messages")
        .select("*")
        .eq("thread_id", threadId)
        .ilike("body", `%${termo.replace(/[%_]/g, "")}%`)
        .order("created_at", { ascending: false })
        .limit(30);
      return ((data ?? []) as MensagemInterna[]).map((m) => ({
        id: m.id,
        texto: m.body ?? "",
        autor: m.author_user_profile_id === userProfileId ? "Você" : (nomePorId.get(m.author_user_profile_id ?? "") ?? "Ex-participante"),
        quando: m.created_at,
      }));
    },
    [supabase, userProfileId, nomePorId],
  );

  async function irPara(id: string) {
    const threadId = conversaPedidaRef.current;
    if (!threadId) return;
    setBuscaAberta(false);
    grudadoNoFimRef.current = false;
    if (!mensagens?.some((m) => m.id === id)) {
      const { data: alvo } = await supabase.from("internal_messages").select("created_at").eq("id", id).maybeSingle();
      if (!alvo) return;
      const [antes, depois] = await Promise.all([
        supabase.from("internal_messages").select("*").eq("thread_id", threadId).lt("created_at", alvo.created_at).order("created_at", { ascending: false }).limit(50),
        supabase.from("internal_messages").select("*").eq("thread_id", threadId).gte("created_at", alvo.created_at).order("created_at", { ascending: true }).limit(400),
      ]);
      if (conversaPedidaRef.current !== threadId) return;
      const lista = [...((antes.data ?? []) as MensagemInterna[]).reverse(), ...((depois.data ?? []) as MensagemInterna[])];
      setMensagens(lista);
      await buscarArquivos(threadId, lista);
    }
    irAteMensagem(id, setDestaqueId);
  }

  function autorDe(m: MensagemInterna) {
    return m.author_user_profile_id === userProfileId ? "Você" : (nomePorId.get(m.author_user_profile_id ?? "") ?? "Ex-participante");
  }

  /** ✓ ninguém viu · ✓✓ cinza parte do grupo viu · ✓✓ azul todos viram. */
  function estadoVisto(m: MensagemInterna): "enviada" | "parcial" | "lida" {
    const outros = Object.entries(leituras).filter(([id]) => id !== userProfileId);
    if (outros.length === 0) return "enviada";
    const viram = outros.filter(([, lido]) => lido >= m.created_at).length;
    if (viram === 0) return "enviada";
    return viram === outros.length ? "lida" : "parcial";
  }

  // Só o que chegou depois da última mensagem da tela.
  const buscarNovas = useCallback(async () => {
    const threadId = conversaPedidaRef.current;
    if (!threadId || !mensagens) return;
    const ultima = mensagens.at(-1)?.created_at ?? "1970-01-01T00:00:00Z";
    const { data } = await supabase
      .from("internal_messages")
      .select("*")
      .eq("thread_id", threadId)
      .gt("created_at", ultima)
      .order("created_at", { ascending: true });
    if (conversaPedidaRef.current !== threadId || !data || data.length === 0) return;
    const novas = data as MensagemInterna[];
    setMensagens((atual) => {
      const vistos = new Set((atual ?? []).map((m) => m.id));
      return [...(atual ?? []), ...novas.filter((m) => !vistos.has(m.id))];
    });
    await buscarArquivos(threadId, novas);
    if (document.visibilityState === "visible" && novas.some((m) => m.author_user_profile_id !== userProfileId)) marcarLida(threadId);
  }, [supabase, mensagens, buscarArquivos, marcarLida, userProfileId]);

  useEffect(() => {
    void carregarConversas();
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") void carregarConversas();
    }, INTERVALO_LISTA_MS);
    return () => window.clearInterval(intervalo);
  }, [carregarConversas]);

  const buscarNovasRef = useRef(buscarNovas);
  buscarNovasRef.current = buscarNovas;
  const carregarLeiturasRef = useRef(carregarLeituras);
  carregarLeiturasRef.current = carregarLeituras;
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void buscarNovasRef.current();
      if (conversaPedidaRef.current) void carregarLeiturasRef.current(conversaPedidaRef.current);
    }, INTERVALO_CONVERSA_MS);
    return () => window.clearInterval(intervalo);
  }, []);

  // Clique num aviso (/chat-interno?t=<id>) abre a conversa.
  const pedidaNaUrl = useSearchParams().get("t");
  useEffect(() => {
    if (pedidaNaUrl) void abrirConversa(pedidaNaUrl);
  }, [pedidaNaUrl, abrirConversa]);

  useEffect(() => {
    definirFoco(selecionadaId ? `t:${selecionadaId}` : null);
    return () => definirFoco(null);
  }, [selecionadaId]);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (area && grudadoNoFimRef.current) area.scrollTop = area.scrollHeight;
  }, [mensagens, arquivos]);

  useEffect(() => {
    if (gravandoDesde === null) return;
    const t = window.setInterval(() => setAgora(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [gravandoDesde]);

  function adicionarArquivos(lista: FileList | File[]) {
    const novos: Pendente[] = [];
    for (const arquivo of Array.from(lista)) {
      if (arquivo.size > TAMANHO_MAXIMO) {
        setStatus(`"${arquivo.name}" passa de 50 MB e não foi adicionado.`);
        continue;
      }
      novos.push({
        id: crypto.randomUUID(),
        arquivo,
        previa: arquivo.type.startsWith("image/") || arquivo.type.startsWith("audio/") ? URL.createObjectURL(arquivo) : null,
      });
    }
    setPendentes((atual) => [...atual, ...novos].slice(0, 10));
  }

  function removerPendente(id: string) {
    setPendentes((atual) => {
      const item = atual.find((p) => p.id === id);
      if (item?.previa) URL.revokeObjectURL(item.previa);
      return atual.filter((p) => p.id !== id);
    });
  }

  async function iniciarGravacao() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("Este navegador não grava áudio.");
      return;
    }
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const formato = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((f) => MediaRecorder.isTypeSupported(f));
      const gravador = new MediaRecorder(fluxo, formato ? { mimeType: formato } : undefined);
      const pedacos: Blob[] = [];
      const controle = { gravador, cancelar: false };
      gravador.ondataavailable = (e) => {
        if (e.data.size > 0) pedacos.push(e.data);
      };
      gravador.onstop = () => {
        fluxo.getTracks().forEach((t) => t.stop());
        setGravandoDesde(null);
        gravadorRef.current = null;
        if (controle.cancelar || pedacos.length === 0) return;
        const tipo = gravador.mimeType.split(";")[0] || "audio/webm";
        const extensao = tipo.includes("ogg") ? "ogg" : tipo.includes("mp4") ? "m4a" : "webm";
        const hora = new Date().toLocaleTimeString("pt-BR").replace(/:/g, "-");
        adicionarArquivos([new File(pedacos, `audio-${hora}.${extensao}`, { type: tipo })]);
      };
      gravadorRef.current = controle;
      gravador.start();
      setGravandoDesde(Date.now());
      setAgora(Date.now());
    } catch {
      setStatus("Sem permissão pro microfone — libere no cadeado ao lado do endereço do site.");
    }
  }

  function pararGravacao(cancelar: boolean) {
    const atual = gravadorRef.current;
    if (!atual) return;
    atual.cancelar = cancelar;
    atual.gravador.stop();
  }

  async function enviar() {
    const threadId = selecionadaId;
    if (!threadId || enviando) return;
    const texto = (rascunhos[threadId] ?? "").trim();
    if (!texto && pendentes.length === 0) return;

    setEnviando(true);
    const chave = crypto.randomUUID();
    const anexos: AnexoParaEnviar[] = [];
    try {
      for (const [indice, item] of pendentes.entries()) {
        setStatus(`Enviando arquivo ${indice + 1} de ${pendentes.length}...`);
        const preparo = await prepararEnvioArquivoAction(threadId, item.arquivo.name, item.arquivo.size);
        if (!preparo.ok) throw new Error(preparo.mensagem);
        const tipo = item.arquivo.type || "application/octet-stream";
        const { error } = await supabase.storage
          .from("chat-interno")
          .uploadToSignedUrl(preparo.dados.caminho, preparo.dados.token, item.arquivo, { contentType: tipo });
        if (error) throw new Error(`"${item.arquivo.name}": ${error.message}`);
        anexos.push({ storage_path: preparo.dados.caminho, content_type: tipo, file_name: item.arquivo.name, size_bytes: item.arquivo.size, kind: tipoDoArquivo(tipo) });
      }
      setStatus(null);
      const resultado = await enviarMensagemInternaAction(threadId, texto, anexos, chave, respondendo?.id ?? null);
      if (!resultado.ok) throw new Error(resultado.mensagem);

      setRascunhos((atual) => ({ ...atual, [threadId]: "" }));
      pendentes.forEach((p) => p.previa && URL.revokeObjectURL(p.previa));
      setPendentes([]);
      setRespondendo(null);
      grudadoNoFimRef.current = true;
      await Promise.all([buscarNovas(), carregarConversas()]);
    } catch (erro) {
      setStatus(`Não enviou: ${erro instanceof Error ? erro.message : "erro"}`);
    } finally {
      setEnviando(false);
    }
  }

  async function iniciarConversaDireta(colegaId: string) {
    const r = await abrirConversaDiretaAction(colegaId);
    if (!r.ok) return setStatus(r.mensagem);
    setModal(null);
    await carregarConversas();
    await abrirConversa(r.dados.id);
  }

  async function criarGrupo(titulo: string, membros: string[]) {
    const r = await criarGrupoInternoAction(titulo, membros);
    if (!r.ok) return r.mensagem;
    setModal(null);
    await carregarConversas();
    await abrirConversa(r.dados.id);
    return null;
  }

  const conversasFiltradas = (conversas ?? []).filter((c) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    return nomeDaConversa(c).toLowerCase().includes(termo) || c.membros.some((m) => m.nome?.toLowerCase().includes(termo));
  });

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* Lista de conversas */}
      {/* Celular: lista e conversa são duas telas, com "voltar". */}
      <div className={`${conversa ? "hidden lg:flex" : "flex"} h-full w-full shrink-0 flex-col border-r border-[var(--ns-border)] lg:w-[300px]`}>
        <div className="space-y-3 border-b border-[var(--ns-border)] p-3">
          <div className="flex items-center justify-between">
            <h1 className="whitespace-nowrap text-lg font-semibold text-[var(--ns-text)]">Chat interno</h1>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setModal("direta")}
                title="Nova conversa"
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--ns-primary)] px-2 text-xs font-medium text-[var(--ns-primary-foreground)] hover:opacity-90"
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Nova
              </button>
              {podeGerenciarGrupos && (
                <button
                  type="button"
                  onClick={() => setModal("grupo")}
                  title="Novo grupo"
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--ns-border)] px-2 text-xs font-medium text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]"
                >
                  <Users aria-hidden="true" className="h-3.5 w-3.5" /> Grupo
                </button>
              )}
            </div>
          </div>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar conversa ou pessoa..."
            className="w-full rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-2 text-sm text-[var(--ns-text)] outline-none placeholder:text-[var(--ns-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)]"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {erroLista && <p className="m-3 rounded-lg bg-[var(--ns-danger)]/10 p-2.5 text-xs text-[var(--ns-danger)]">{erroLista}</p>}
          {conversas === null && !erroLista && <p className="p-4 text-sm text-[var(--ns-text-secondary)]">Carregando...</p>}
          {conversas?.length === 0 && (
            <p className="p-6 text-center text-sm text-[var(--ns-text-secondary)]">
              Nenhuma conversa ainda. Comece com <strong>+ Conversa</strong> ou crie um <strong>Grupo</strong>.
            </p>
          )}
          {conversasFiltradas.map((c) => {
            const nome = nomeDaConversa(c);
            return (
              <button
                key={c.thread_id}
                type="button"
                onClick={() => void abrirConversa(c.thread_id)}
                className={`flex w-full items-center gap-3 border-b border-[var(--ns-border)] px-3 py-3 text-left transition ${
                  c.thread_id === selecionadaId ? "bg-[var(--ns-primary)]/10" : "hover:bg-[var(--ns-surface-hover)]"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    c.kind === "grupo" ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "bg-[var(--ns-primary)]/15 text-[var(--ns-primary)]"
                  }`}
                >
                  {c.kind === "grupo" ? <Users aria-hidden="true" className="h-4 w-4" /> : iniciais(nome)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm text-[var(--ns-text)] ${c.nao_lidas > 0 ? "font-bold" : "font-semibold"}`}>{nome}</span>
                    <span className="shrink-0 text-[11px] text-[var(--ns-text-secondary)]">{quandoNaLista(c.last_message_at)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-[var(--ns-text-secondary)]">{c.last_message_preview ?? (c.kind === "grupo" ? `${c.membros.length + 1} pessoas` : "Sem mensagens")}</span>
                    {c.nao_lidas > 0 && (
                      <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ns-primary)] px-1 text-[11px] font-semibold text-[var(--ns-primary-foreground)]">
                        {c.nao_lidas}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversa aberta */}
      <div
        className={`${conversa ? "flex" : "hidden lg:flex"} relative h-full min-w-0 flex-1 flex-col lg:min-w-[420px]`}
        onDragOver={(e) => {
          if (!conversa || !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setArrastando(false);
        }}
        onDrop={(e) => {
          if (!conversa) return;
          e.preventDefault();
          setArrastando(false);
          adicionarArquivos(e.dataTransfer.files);
        }}
      >
        {arrastando && (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--ns-primary)] bg-[var(--ns-primary)]/10 text-sm font-medium text-[var(--ns-primary)]">
            Solte aqui pra anexar
          </div>
        )}
        {!conversa ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--ns-text-secondary)]">
            Escolha uma conversa ou comece uma nova. Dá pra mandar texto, fotos, áudios e arquivos.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--ns-border)] px-2 py-2 sm:gap-3 sm:px-4 sm:py-3">
              <button
                type="button"
                onClick={voltarParaLista}
                aria-label="Voltar para a lista"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)] lg:hidden"
              >
                <ArrowLeft aria-hidden="true" className="h-5 w-5" />
              </button>
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  conversa.kind === "grupo" ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "bg-[var(--ns-primary)]/15 text-[var(--ns-primary)]"
                }`}
              >
                {conversa.kind === "grupo" ? <Users aria-hidden="true" className="h-4 w-4" /> : iniciais(nomeDaConversa(conversa))}
              </span>
              <button
                type="button"
                disabled={conversa.kind !== "grupo"}
                onClick={() => setParticipantesAberto(true)}
                className="min-w-0 flex-1 text-left disabled:cursor-default"
                title={conversa.kind === "grupo" ? "Ver e editar participantes" : undefined}
              >
                <p className="truncate text-sm font-semibold text-[var(--ns-text)]">{nomeDaConversa(conversa)}</p>
                <p className="truncate text-xs text-[var(--ns-text-secondary)]">
                  {conversa.kind === "grupo" ? `Você, ${conversa.membros.map((m) => m.nome).join(", ")}` : "Conversa privada entre vocês dois"}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setBuscaAberta((v) => !v)}
                title="Buscar nesta conversa"
                aria-label="Buscar nesta conversa"
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--ns-border)] text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)] ${buscaAberta ? "bg-[var(--ns-surface-hover)]" : ""}`}
              >
                <Search aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
              {conversa.kind === "grupo" && (
                <button
                  type="button"
                  onClick={() => setParticipantesAberto(true)}
                  title="Participantes"
                  aria-label="Participantes"
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--ns-border)] px-2 text-xs font-medium text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]"
                >
                  <Users aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{conversa.membros.length + 1}</span>
                </button>
              )}
            </div>
            {buscaAberta && <BuscaNaConversa onBuscar={buscarNaConversa} onIr={(id) => void irPara(id)} onFechar={() => setBuscaAberta(false)} />}

            <div
              ref={areaRef}
              onScroll={(e) => {
                const a = e.currentTarget;
                grudadoNoFimRef.current = a.scrollHeight - a.scrollTop - a.clientHeight < 80;
              }}
              onLoadCapture={() => {
                const a = areaRef.current;
                if (a && grudadoNoFimRef.current) a.scrollTop = a.scrollHeight;
              }}
              className="flex-1 space-y-2 overflow-y-auto px-2 py-3 sm:px-4 sm:py-4"
            >
              {mensagens === null && <p className="text-center text-sm text-[var(--ns-text-secondary)]">Carregando mensagens...</p>}
              {mensagens?.length === 0 && <p className="text-center text-sm text-[var(--ns-text-secondary)]">Nenhuma mensagem ainda — diga oi.</p>}
              {mensagens?.map((m, i) => {
                const minha = m.author_user_profile_id === userProfileId;
                const anterior = i > 0 ? mensagens[i - 1] : null;
                const novoDia = !anterior || new Date(anterior.created_at).toDateString() !== new Date(m.created_at).toDateString();
                const mostrarAutor =
                  conversa.kind === "grupo" && !minha && (novoDia || anterior?.sistema || anterior?.author_user_profile_id !== m.author_user_profile_id);
                const citada = m.reply_to_message_id ? (mensagens.find((x) => x.id === m.reply_to_message_id) ?? null) : null;
                const destacada = destaqueId === m.id ? "ring-2 ring-[var(--ns-primary)] ring-offset-2 ring-offset-[var(--ns-bg)]" : "";
                const separador = novoDia && (
                  <div className="sticky top-0 z-[1] flex justify-center py-1">
                    <span className="rounded-full bg-[var(--ns-surface-hover)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ns-text-secondary)] shadow-sm">
                      {rotuloDia(m.created_at)}
                    </span>
                  </div>
                );
                if (m.sistema) {
                  return (
                    <Fragment key={m.id}>
                      {separador}
                      <p id={`msg-${m.id}`} className="mx-auto w-fit max-w-[90%] rounded-full bg-[var(--ns-surface-hover)] px-3 py-1 text-center text-[11px] text-[var(--ns-text-secondary)]">
                        {m.body} · {horaCurta(m.created_at)}
                      </p>
                    </Fragment>
                  );
                }
                // "Visto por …" só embaixo da MINHA última mensagem de um grupo (como no WhatsApp).
                const ultimaMinha = minha && conversa.kind === "grupo" && !mensagens.slice(i + 1).some((x) => x.author_user_profile_id === userProfileId && !x.sistema);
                const quemViu = ultimaMinha
                  ? Object.entries(leituras)
                      .filter(([id, lido]) => id !== userProfileId && lido >= m.created_at)
                      .map(([id]) => nomePorId.get(id)?.split(" ")[0] ?? "alguém")
                  : [];
                return (
                  <Fragment key={m.id}>
                    {separador}
                    <div className={`flex flex-col ${minha ? "items-end" : "items-start"}`}>
                      {mostrarAutor && (
                        <span className="mb-0.5 px-1 text-[10px] font-medium text-[var(--ns-text-secondary)]">
                          {nomePorId.get(m.author_user_profile_id ?? "") ?? "Ex-participante"}
                        </span>
                      )}
                      <div
                        id={`msg-${m.id}`}
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm transition md:max-w-[70%] ${destacada} ${
                          minha ? "bg-[var(--ns-primary)] text-[var(--ns-primary-foreground)]" : "bg-[var(--ns-surface-hover)] text-[var(--ns-text)]"
                        }`}
                      >
                        {m.reply_to_message_id && (
                          <CitacaoNaBolha
                            autor={citada ? autorDe(citada) : "Mensagem anterior"}
                            texto={citada ? (citada.body ?? "Arquivo") : "Toque para ver"}
                            claro={minha}
                            onClick={() => void irPara(m.reply_to_message_id!)}
                          />
                        )}
                        {(arquivos[m.id] ?? []).length > 0 && (
                          <div className="mb-1 flex flex-col gap-1.5">
                            {arquivos[m.id].map((a) => (
                              <ArquivoInternoView key={a.url} arquivo={a} />
                            ))}
                          </div>
                        )}
                        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                        <p className={`mt-0.5 flex items-center justify-end gap-1.5 text-[10px] ${minha ? "text-[var(--ns-primary-foreground)]/70" : "text-[var(--ns-text-secondary)]"}`}>
                          <BotaoResponder claro={minha} onClick={() => setRespondendo(m)} />
                          {horaCurta(m.created_at)}
                          {minha && <Tiques estado={estadoVisto(m)} claro />}
                        </p>
                      </div>
                      {quemViu.length > 0 && (
                        <span className="mt-0.5 px-1 text-[10px] text-[var(--ns-text-secondary)]">
                          Visto por {quemViu.length === conversa.membros.length ? "todos" : quemViu.join(", ")}
                        </span>
                      )}
                    </div>
                  </Fragment>
                );
              })}
            </div>

            {/* Compositor */}
            <div className="border-t border-[var(--ns-border)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3">
              {status && <p className="mb-2 text-xs text-[var(--ns-text-secondary)]" role="status">{status}</p>}
              {respondendo && <BarraCitando autor={autorDe(respondendo)} texto={respondendo.body} onCancelar={() => setRespondendo(null)} />}
              {pendentes.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendentes.map((p) => (
                    <div key={p.id} className="flex max-w-[260px] items-center gap-2 rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-1.5 text-xs text-[var(--ns-text)]">
                      {p.arquivo.type.startsWith("image/") && p.previa ? (
                        // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) antes do envio
                        <img src={p.previa} alt="" className="h-10 w-10 rounded object-cover" />
                      ) : p.arquivo.type.startsWith("audio/") && p.previa ? (
                        <audio controls src={p.previa} className="h-8 w-44" />
                      ) : (
                        <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--ns-text-secondary)]" />
                      )}
                      {!p.arquivo.type.startsWith("audio/") && (
                        <span className="min-w-0">
                          <span className="block truncate">{p.arquivo.name}</span>
                          <span className="text-[10px] text-[var(--ns-text-secondary)]">{tamanhoLegivel(p.arquivo.size)}</span>
                        </span>
                      )}
                      <button type="button" onClick={() => removerPendente(p.id)} aria-label="Tirar arquivo" className="shrink-0 text-[var(--ns-text-secondary)] hover:text-[var(--ns-danger)]">
                        <X aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {gravandoDesde !== null ? (
                <div className="flex items-center gap-3 rounded-lg border border-[var(--ns-danger)]/40 bg-[var(--ns-danger)]/10 px-3 py-2 text-sm text-[var(--ns-text)]">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--ns-danger)]" />
                  Gravando {Math.floor((agora - gravandoDesde) / 60000)}:{String(Math.floor(((agora - gravandoDesde) / 1000) % 60)).padStart(2, "0")}
                  <button type="button" onClick={() => pararGravacao(true)} className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--ns-text-secondary)] hover:text-[var(--ns-danger)]">
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" /> Descartar
                  </button>
                  <button
                    type="button"
                    onClick={() => pararGravacao(false)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--ns-danger)] px-2.5 py-1 text-xs font-medium text-white"
                  >
                    <Square aria-hidden="true" className="h-3 w-3" /> Parar
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void enviar();
                  }}
                  className="flex items-end gap-2"
                >
                  <input ref={entradaArquivoRef} type="file" multiple hidden onChange={(e) => e.target.files && (adicionarArquivos(e.target.files), (e.target.value = ""))} />
                  <input ref={entradaFotoRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => e.target.files && (adicionarArquivos(e.target.files), (e.target.value = ""))} />
                  <button type="button" onClick={() => entradaArquivoRef.current?.click()} title="Anexar arquivo" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--ns-border)] text-[var(--ns-text-secondary)] hover:bg-[var(--ns-surface-hover)]">
                    <Paperclip aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => entradaFotoRef.current?.click()} title="Foto ou vídeo" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--ns-border)] text-[var(--ns-text-secondary)] hover:bg-[var(--ns-surface-hover)]">
                    <ImageIcon aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <textarea
                    value={rascunhos[conversa.thread_id] ?? ""}
                    onChange={(e) => setRascunhos((atual) => ({ ...atual, [conversa.thread_id]: e.target.value }))}
                    onKeyDown={(e) => {
                      // No celular, Enter pula linha; envia pelo botão.
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !ehTelaDeCelular()) {
                        e.preventDefault();
                        void enviar();
                      }
                    }}
                    onPaste={(e) => {
                      const colados = Array.from(e.clipboardData.files);
                      if (colados.length > 0) {
                        e.preventDefault();
                        adicionarArquivos(colados);
                      }
                    }}
                    rows={Math.min(5, Math.max(1, (rascunhos[conversa.thread_id] ?? "").split("\n").length))}
                    placeholder="Mensagem"
                    title="Enter envia · Shift+Enter pula linha · dá pra colar ou arrastar imagens"
                    className="min-w-0 flex-1 resize-none rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-2 text-base md:text-sm text-[var(--ns-text)] outline-none placeholder:text-[var(--ns-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)]"
                  />
                  {(rascunhos[conversa.thread_id] ?? "").trim() || pendentes.length > 0 ? (
                    <button
                      type="submit"
                      disabled={enviando}
                      title="Enviar"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ns-primary)] text-[var(--ns-primary-foreground)] hover:opacity-90 disabled:opacity-50"
                    >
                      <Send aria-hidden="true" className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void iniciarGravacao()}
                      title="Gravar áudio"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ns-primary)] text-[var(--ns-primary-foreground)] hover:opacity-90"
                    >
                      <Mic aria-hidden="true" className="h-4 w-4" />
                    </button>
                  )}
                </form>
              )}
            </div>
          </>
        )}
      </div>

      {participantesAberto && conversa?.kind === "grupo" && (
        <ModalParticipantes
          conversa={conversa}
          userProfileId={userProfileId}
          podeGerenciar={podeGerenciarGrupos}
          onFechar={() => setParticipantesAberto(false)}
          onAlterado={async (saiu) => {
            await carregarConversas();
            if (saiu) {
              setParticipantesAberto(false);
              voltarParaLista();
            } else {
              await buscarNovas();
            }
          }}
        />
      )}
      {modal && (
        <ModalNovaConversa
          tipo={modal}
          onFechar={() => setModal(null)}
          onEscolherColega={iniciarConversaDireta}
          onCriarGrupo={criarGrupo}
        />
      )}
    </div>
  );
}

function ArquivoInternoView({ arquivo }: { arquivo: ArquivoInterno }) {
  const mime = arquivo.contentType ?? "";
  if (arquivo.tipo === "audio" || mime.startsWith("audio/")) {
    return <audio controls preload="metadata" src={arquivo.url} className="h-10 w-64 max-w-full" />;
  }
  if (arquivo.tipo === "imagem" || mime.startsWith("image/")) {
    return (
      <a href={arquivo.url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- link assinado temporário do Storage */}
        <img src={arquivo.url} alt={arquivo.nome ?? "Foto"} className="max-h-64 max-w-full rounded-lg" loading="lazy" />
      </a>
    );
  }
  if (arquivo.tipo === "video" || mime.startsWith("video/")) {
    return <video controls preload="metadata" src={arquivo.url} className="max-h-64 max-w-full rounded-lg" />;
  }
  return (
    <a href={arquivo.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline">
      <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="truncate">{arquivo.nome ?? "Arquivo"}</span>
    </a>
  );
}

function ModalNovaConversa({
  tipo,
  onFechar,
  onEscolherColega,
  onCriarGrupo,
}: {
  tipo: "direta" | "grupo";
  onFechar: () => void;
  onEscolherColega: (id: string) => Promise<void>;
  onCriarGrupo: (titulo: string, membros: string[]) => Promise<string | null>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [colegas, setColegas] = useState<Membro[] | null>(null);
  const [filtro, setFiltro] = useState("");
  const [titulo, setTitulo] = useState("");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.rpc("listar_colegas_chat_interno").then(({ data, error }) => {
      if (error) setErro(error.message);
      setColegas(((data ?? []) as { id: string; nome: string | null }[]).map((c) => ({ id: c.id, nome: c.nome })));
    });
  }, [supabase]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onFechar]);

  const visiveis = (colegas ?? []).filter((c) => (c.nome ?? "").toLowerCase().includes(filtro.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-xl border border-[var(--ns-border)] bg-[var(--ns-surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--ns-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--ns-text)]">{tipo === "grupo" ? "Novo grupo" : "Nova conversa"}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-[var(--ns-text-secondary)] hover:text-[var(--ns-text)]">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2 p-3">
          {tipo === "grupo" && (
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={80}
              placeholder="Nome do grupo (ex: Comercial)"
              className="w-full rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-2 text-sm text-[var(--ns-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)]"
            />
          )}
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar pessoa..."
            autoFocus
            className="w-full rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-2 text-sm text-[var(--ns-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)]"
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {colegas === null && <li className="p-3 text-sm text-[var(--ns-text-secondary)]">Carregando...</li>}
          {visiveis.map((c) => (
            <li key={c.id}>
              {tipo === "direta" ? (
                <button
                  type="button"
                  disabled={salvando}
                  onClick={async () => {
                    setSalvando(true);
                    await onEscolherColega(c.id);
                    setSalvando(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ns-primary)]/15 text-[10px] font-semibold text-[var(--ns-primary)]">
                    {iniciais(c.nome ?? "?")}
                  </span>
                  {c.nome}
                </button>
              ) : (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]">
                  <input
                    type="checkbox"
                    checked={escolhidos.has(c.id)}
                    onChange={(e) =>
                      setEscolhidos((atual) => {
                        const novo = new Set(atual);
                        if (e.target.checked) novo.add(c.id);
                        else novo.delete(c.id);
                        return novo;
                      })
                    }
                  />
                  {c.nome}
                </label>
              )}
            </li>
          ))}
        </ul>
        {erro && <p className="px-4 pb-2 text-xs text-[var(--ns-danger)]">{erro}</p>}
        {tipo === "grupo" && (
          <div className="border-t border-[var(--ns-border)] p-3">
            <button
              type="button"
              disabled={salvando || !titulo.trim() || escolhidos.size === 0}
              onClick={async () => {
                setSalvando(true);
                setErro(await onCriarGrupo(titulo, [...escolhidos]));
                setSalvando(false);
              }}
              className="w-full rounded-lg bg-[var(--ns-primary)] px-3 py-2 text-sm font-medium text-[var(--ns-primary-foreground)] disabled:opacity-50"
            >
              Criar grupo{escolhidos.size > 0 ? ` (${escolhidos.size + 1} pessoas)` : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Participantes de um grupo: adicionar (qualquer um), remover (só quem criou) e sair do grupo. */
function ModalParticipantes({
  conversa,
  userProfileId,
  podeGerenciar,
  onFechar,
  onAlterado,
}: {
  conversa: ConversaInterna;
  userProfileId: string;
  podeGerenciar: boolean;
  onFechar: () => void;
  onAlterado: (saiu: boolean) => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [adicionando, setAdicionando] = useState(false);
  const [colegas, setColegas] = useState<Membro[] | null>(null);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const souCriador = conversa.criado_por === userProfileId;
  const [editandoNome, setEditandoNome] = useState(false);
  const [nome, setNome] = useState(conversa.title ?? "");

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onFechar]);

  useEffect(() => {
    if (!adicionando || colegas) return;
    supabase.rpc("listar_colegas_chat_interno").then(({ data }) => {
      const jaEstao = new Set(conversa.membros.map((m) => m.id));
      setColegas(((data ?? []) as Membro[]).filter((c) => !jaEstao.has(c.id)));
    });
  }, [adicionando, colegas, supabase, conversa.membros]);

  async function executar(acao: () => Promise<{ ok: boolean; mensagem?: string }>, saiu = false) {
    setSalvando(true);
    setErro(null);
    const r = await acao();
    setSalvando(false);
    if (!r.ok) return setErro(r.mensagem ?? "Não deu certo.");
    await onAlterado(saiu);
    setAdicionando(false);
    setEscolhidos(new Set());
    setColegas(null);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-[var(--ns-border)] bg-[var(--ns-surface)] shadow-xl sm:max-w-sm sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--ns-border)] px-4 py-3">
          {editandoNome ? (
            <form
              className="flex min-w-0 flex-1 items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void executar(() => renomearGrupoAction(conversa.thread_id, nome).then((r) => (r.ok ? { ok: true } : r))).then(() => setEditandoNome(false));
              }}
            >
              <input
                autoFocus
                value={nome}
                maxLength={80}
                onChange={(e) => setNome(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-[var(--ns-border)] bg-[var(--ns-surface)] px-2 py-1 text-base text-[var(--ns-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)] md:text-sm"
              />
              <button type="submit" disabled={salvando || !nome.trim()} aria-label="Salvar nome" className="p-1 text-[var(--ns-primary)] disabled:opacity-50">
                <Check aria-hidden="true" className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[var(--ns-text)]">
              <span className="truncate">{conversa.title ?? "Grupo"} · {conversa.membros.length + 1} pessoas</span>
              {podeGerenciar && (
                <button type="button" onClick={() => setEditandoNome(true)} aria-label="Mudar o nome do grupo" title="Mudar o nome do grupo" className="shrink-0 p-0.5 text-[var(--ns-text-secondary)] hover:text-[var(--ns-text)]">
                  <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              )}
            </h2>
          )}
          <button type="button" onClick={onFechar} aria-label="Fechar" className="p-1 text-[var(--ns-text-secondary)]">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <li className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--ns-text)]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ns-primary)]/15 text-[10px] font-semibold text-[var(--ns-primary)]">EU</span>
            <span className="flex-1">Você{souCriador ? " · criou o grupo" : ""}</span>
          </li>
          {conversa.membros.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--ns-text)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ns-primary)]/15 text-[10px] font-semibold text-[var(--ns-primary)]">
                {iniciais(m.nome ?? "?")}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {m.nome}
                {conversa.criado_por === m.id ? " · criou o grupo" : ""}
              </span>
              {podeGerenciar && (
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() =>
                    window.confirm(`Remover ${m.nome ?? "esta pessoa"} do grupo?`) &&
                    void executar(() => removerMembroGrupoAction(conversa.thread_id, m.id).then((r) => (r.ok ? { ok: true } : r)))
                  }
                  title="Remover do grupo"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-[var(--ns-text-secondary)] hover:text-[var(--ns-danger)]"
                >
                  <UserMinus aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Remover</span>
                </button>
              )}
            </li>
          ))}
        </ul>

        {adicionando && (
          <div className="max-h-56 overflow-y-auto border-t border-[var(--ns-border)] px-2 py-2">
            {colegas === null && <p className="px-2 py-2 text-xs text-[var(--ns-text-secondary)]">Carregando...</p>}
            {colegas?.length === 0 && <p className="px-2 py-2 text-xs text-[var(--ns-text-secondary)]">Todo mundo da empresa já está no grupo.</p>}
            {colegas?.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]">
                <input
                  type="checkbox"
                  checked={escolhidos.has(c.id)}
                  onChange={(e) =>
                    setEscolhidos((atual) => {
                      const novo = new Set(atual);
                      if (e.target.checked) novo.add(c.id);
                      else novo.delete(c.id);
                      return novo;
                    })
                  }
                />
                {c.nome}
              </label>
            ))}
          </div>
        )}

        {erro && <p className="px-4 pb-2 text-xs text-[var(--ns-danger)]">{erro}</p>}
        <div className="flex flex-wrap gap-2 border-t border-[var(--ns-border)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {!podeGerenciar ? (
            <p className="flex-1 self-center text-xs text-[var(--ns-text-secondary)]">
              Só supervisor (gerente ou administrador) altera nome e participantes do grupo.
            </p>
          ) : adicionando ? (
            <button
              type="button"
              disabled={salvando || escolhidos.size === 0}
              onClick={() =>
                void executar(() =>
                  adicionarMembrosGrupoAction(conversa.thread_id, [...escolhidos]).then((r) => (r.ok ? { ok: true } : r)),
                )
              }
              className="flex-1 rounded-lg bg-[var(--ns-primary)] px-3 py-2 text-sm font-medium text-[var(--ns-primary-foreground)] disabled:opacity-50"
            >
              Adicionar {escolhidos.size > 0 ? `(${escolhidos.size})` : ""}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAdicionando(true)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--ns-primary)] px-3 py-2 text-sm font-medium text-[var(--ns-primary-foreground)]"
            >
              <UserPlus aria-hidden="true" className="h-4 w-4" /> Adicionar pessoas
            </button>
          )}
          <button
            type="button"
            disabled={salvando}
            onClick={() =>
              window.confirm("Sair deste grupo? Você deixa de ver as mensagens dele.") &&
              void executar(() => removerMembroGrupoAction(conversa.thread_id, userProfileId).then((r) => (r.ok ? { ok: true } : r)), true)
            }
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--ns-border)] px-3 py-2 text-sm text-[var(--ns-danger)] hover:bg-[var(--ns-danger)]/10"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" /> Sair
          </button>
        </div>
      </div>
    </div>
  );
}
