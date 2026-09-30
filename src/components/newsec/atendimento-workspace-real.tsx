"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bot, Check, FileText, Phone, RefreshCw, Send, StickyNote, UserPlus, Users2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import type { ConversaEstado, ConversationStatus, Message, MessageRevision } from "@/types/atendimento";
import { AcoesMensagem, AvisoMensagemApagada, EditorMensagem, HistoricoRevisoes, permissoesDaMensagem } from "./mensagem-revisoes";
import {
  apagarMensagemAction,
  assumirConversaAction,
  concluirConversaAction,
  criarNotaInternaAction,
  editarMensagemAction,
  enviarMensagemAction,
  marcarConversaComoLidaAction,
  reabrirConversaAction,
  obterLinksAnexosAction,
  reenviarMensagemFalhadaAction,
  transferirConversaAction,
  type AnexoParaExibir,
} from "@/app/(newsec)/atendimento/actions";

const TIPOS_COM_ARQUIVO = new Set(["audio", "imagem", "documento", "video"]);
const ROTULO_TIPO: Record<string, string> = { audio: "Áudio", imagem: "Imagem", documento: "Documento", video: "Vídeo" };
import { EstadoBadge } from "./estado-badge";

type TelefoneContato = { phone_e164: string; is_primary: boolean };

type ConversaLista = {
  id: string;
  status: ConversationStatus;
  created_at: string;
  last_activity_at: string;
  last_message_preview: string | null;
  unread_count: number;
  assigned_user_profile_id: string | null;
  client_id: string | null;
  team_id: string | null;
  external_id: string | null;
  contact: { id: string; display_name: string | null; contact_phone_numbers: TelefoneContato[] } | null;
  channel: { id: string; name: string; provider: string } | null;
  team: { id: string; name: string } | null;
  assigned_user_profile: { id: string; full_name: string | null } | null;
  // Só a última mensagem (sem nota interna) — diz se quem falou por último foi o cliente.
  ultima_mensagem: { direction: "entrada" | "saida" }[] | null;
};

/** Cliente falou por último, o dono já viu (não está mais em "não lidas") e ninguém respondeu. */
function aguardandoResposta(conversa: ConversaLista): boolean {
  return conversa.status !== "encerrada" && conversa.unread_count === 0 && conversa.ultima_mensagem?.[0]?.direction === "entrada";
}

type UsuarioEmpresa = { id: string; full_name: string | null };

type MensagemComAutor = Message & { author: { id: string; full_name: string | null } | null };

/**
 * O Totalk (histórico importado) assinava toda mensagem de saída com um prefixo tipo
 * "*Ana:*" ou "*GRS Soluções:*" dentro do próprio texto — sem negrito de verdade (o "*" é
 * literal), só feio agora que a tela já mostra quem respondeu de forma própria, em cima do
 * balão (ver `remetenteDe`). Só afeta a EXIBIÇÃO: o `body` guardado no banco nunca é alterado.
 */
function corpoSemAssinaturaAntiga(mensagem: MensagemComAutor): string | null {
  if (!mensagem.body || mensagem.direction !== "saida") return mensagem.body;
  return mensagem.body.replace(/^\*[^*\n]{1,60}:\*\s*/, "");
}

/** Rótulo de quem mandou uma mensagem de saída — nunca deixa "quem enviou" implícito. */
function remetenteDe(mensagem: MensagemComAutor): string {
  switch (mensagem.author_type) {
    case "ia":
      return "IA";
    case "humano":
      return mensagem.author?.full_name ?? "Equipe (usuário removido)";
    case "sistema":
      return "Sistema";
    default:
      return "Equipe";
  }
}

const STATUS_PARA_BADGE: Record<ConversationStatus, ConversaEstado> = {
  ia: "IA",
  aguardando_humano: "AGUARDANDO_HUMANO",
  humano: "HUMANO",
  aguardando_cliente: "AGUARDANDO_CLIENTE",
  encerrada: "ENCERRADA",
};

type Aba = "meus" | "outros" | "ia";
type SubFiltro = "todas" | "nao_lidas" | "aguardando_resposta";

const SUB_FILTROS: { id: SubFiltro; rotulo: string; ajuda: string }[] = [
  { id: "todas", rotulo: "Todas", ajuda: "Todas as conversas deste escopo." },
  { id: "nao_lidas", rotulo: "Não lidas", ajuda: "O cliente mandou mensagem que ainda não foi vista." },
  { id: "aguardando_resposta", rotulo: "Aguardando resposta", ajuda: "O cliente mandou a última mensagem, o responsável já viu e ainda não respondeu." },
];

function iniciaisDe(nome: string | null) {
  if (!nome) return "?";
  return nome
    .split(" ")
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

/** Telefone principal do contato (ou o primeiro, se nenhum estiver marcado como principal). */
// Conversa vinda do Totalk (tem external_id) sem responsável = o atendente de lá não tem login no CRM.
function nomeResponsavel(conversa: ConversaLista, semResponsavel: string): string {
  if (conversa.assigned_user_profile?.full_name) return conversa.assigned_user_profile.full_name;
  return conversa.external_id ? "Atendente não localizado" : semResponsavel;
}

function telefoneDoContato(contact: ConversaLista["contact"]): string | null {
  const telefones = contact?.contact_phone_numbers ?? [];
  return telefones.find((t) => t.is_primary)?.phone_e164 ?? telefones[0]?.phone_e164 ?? null;
}

/** Formata um telefone em E.164 sem "+" (só dígitos, com DDI 55) pro padrão brasileiro de leitura. */
function formatarTelefone(e164: string | null): string | null {
  if (!e164) return null;
  const digitos = e164.replace(/\D/g, "");
  const semDDI = digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
  if (semDDI.length === 11) return `(${semDDI.slice(0, 2)}) ${semDDI.slice(2, 7)}-${semDDI.slice(7)}`;
  if (semDDI.length === 10) return `(${semDDI.slice(0, 2)}) ${semDDI.slice(2, 6)}-${semDDI.slice(6)}`;
  return `+${digitos}`;
}

/**
 * Hora se for hoje; senão a data (e a hora, se `comHora`). Antes a lista mostrava só "14:23"
 * mesmo pra conversa de meses atrás — com o histórico do Totalk importado, parecia que tudo
 * era de hoje e não dava pra saber de quando era cada conversa/mensagem.
 */
function horaOuData(iso: string, comHora = false) {
  const data = new Date(iso);
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (data.toDateString() === new Date().toDateString()) return hora;
  const dia = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  return comHora ? `${dia} ${hora}` : dia;
}

function formatarDataHora(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AtendimentoWorkspaceReal({
  companyId,
  userProfileId,
  isAdminOuManager,
  isPlatformOwner,
}: {
  companyId: string;
  userProfileId: string;
  isAdminOuManager: boolean;
  isPlatformOwner: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  // A aba "IA" (conversas sem responsável, só a IA atendendo) é visível pra quem supervisiona —
  // mesmo corte de "isAdminOuManager" usado no resto da tela pra "ver toda a empresa".
  const podeVerIA = isAdminOuManager || isPlatformOwner;
  const [aba, setAba] = useState<Aba>("meus");
  const [subFiltro, setSubFiltro] = useState<SubFiltro>("todas");
  const [busca, setBusca] = useState("");
  // Versão "assentada" da busca (400ms depois da última tecla) — é ela que dispara a consulta ao
  // banco, pra não fazer uma consulta por letra digitada.
  const [buscaAplicada, setBuscaAplicada] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setBuscaAplicada(busca), 400);
    return () => window.clearTimeout(timer);
  }, [busca]);
  const [conversas, setConversas] = useState<ConversaLista[] | null>(null);
  const [contagensAbas, setContagensAbas] = useState<Record<Aba, number | null>>({ meus: null, outros: null, ia: null });
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(true);

  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemComAutor[] | null>(null);
  const [anexosPorMensagem, setAnexosPorMensagem] = useState<Record<string, AnexoParaExibir[]>>({});
  const [revisoesPorMensagem, setRevisoesPorMensagem] = useState<Record<string, MessageRevision[]>>({});
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erroMensagens, setErroMensagens] = useState<string | null>(null);

  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [modoNota, setModoNota] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [usuariosEmpresa, setUsuariosEmpresa] = useState<UsuarioEmpresa[]>([]);
  const [transferenciaAberta, setTransferenciaAberta] = useState(false);

  // Qual conversa a tela quer mostrar AGORA. Toda resposta de mensagens que chegar de uma
  // conversa diferente desta é descartada — sem isso, clicar rápido em duas conversas fazia
  // a resposta mais lenta chegar por último e pintar as mensagens de uma pessoa embaixo do
  // nome/telefone de outra (bug real relatado pelo Gabriel em produção, 29/09/2026).
  // Mesmo princípio pra lista (trocar de aba rápido).
  const conversaPedidaRef = useRef<string | null>(null);
  const pedidoListaRef = useRef(0);

  // Conversa abre já na ÚLTIMA mensagem (pedido do Gabriel, 30/09/2026) — sem precisar rolar o
  // histórico todo. "Grudado no fim" acompanha se a pessoa subiu pra ler: se subiu, foto/áudio
  // terminando de carregar não a arrasta de volta pro fim.
  const areaMensagensRef = useRef<HTMLDivElement | null>(null);
  const grudadoNoFimRef = useRef(true);
  function rolarParaOFim() {
    const area = areaMensagensRef.current;
    if (area && grudadoNoFimRef.current) area.scrollTop = area.scrollHeight;
  }

  const SELECT_CONVERSAS =
    "id, status, created_at, last_activity_at, last_message_preview, unread_count, assigned_user_profile_id, client_id, team_id, external_id, " +
    "contact:contacts(id, display_name, contact_phone_numbers(phone_e164, is_primary)), channel:channels(id, name, provider), team:teams(id, name), " +
    "assigned_user_profile:user_profiles!conversations_assigned_user_profile_id_fkey(id, full_name), " +
    "ultima_mensagem:messages(direction)";

  /**
   * Aplica o escopo da aba (quem atende) — company_id sempre explícito: RLS libera platform owner pra
   * ver todas as empresas, mas aqui o recorte é sempre a empresa ativa (ver AGENTS.md §9).
   *
   * Tipado como `any` de propósito: encadear `.eq()`/`.neq()` genericamente sobre o tipo do
   * PostgrestFilterBuilder do Supabase estoura profundidade de instanciação do TypeScript
   * (TS2589) — o retorno de cada chamador já é tipado explicitamente onde importa.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function comEscopoDaAba(query: any, valorAba: Aba): any {
    let escopado = query.eq("company_id", companyId);
    if (valorAba === "meus") {
      escopado = escopado.eq("assigned_user_profile_id", userProfileId);
    } else if (valorAba === "ia") {
      escopado = escopado.eq("status", "ia");
    } else {
      // "Outros" = atendimento humano de outro login — atribuído a outra pessoa, ou ainda sem
      // ninguém (fila). Nunca repete o que já está em "Meus" (por isso o `.neq`, não só excluir
      // a IA) — `.or()` cobre o nulo porque `assigned_user_profile_id <> meuId` sozinho descarta
      // linha nula em SQL (NULL <> x nunca é verdadeiro).
      escopado = escopado.neq("status", "ia").or(`assigned_user_profile_id.is.null,assigned_user_profile_id.neq.${userProfileId}`);
    }
    return escopado;
  }

  const carregarConversas = useCallback(async () => {
    const pedido = ++pedidoListaRef.current;
    setCarregandoLista(true);
    setErroLista(null);

    // Busca vai no BANCO, não só nas 50 conversas já carregadas — antes, procurar um telefone
    // de alguém fora da lista inicial não achava nada (relatado pelo Gabriel, 30/09/2026). Com
    // busca ativa, procura em todas as abas (RLS continua limitando o que cada um pode ver).
    const termo = buscaAplicada.trim();
    let query = supabase.from("conversations").select(SELECT_CONVERSAS);
    if (termo.length >= 2) {
      const digitos = termo.replace(/\D/g, "");
      const contatoIds = new Set<string>();
      const { data: porNome } = await supabase
        .from("contacts")
        .select("id")
        .eq("company_id", companyId)
        .ilike("display_name", `%${termo}%`)
        .limit(200);
      for (const c of porNome ?? []) contatoIds.add(c.id);
      if (digitos.length >= 4) {
        const { data: porTelefone } = await supabase
          .from("contact_phone_numbers")
          .select("contact_id")
          .eq("company_id", companyId)
          .ilike("phone_e164", `%${digitos}%`)
          .limit(200);
        for (const t of porTelefone ?? []) contatoIds.add(t.contact_id);
      }
      if (pedido !== pedidoListaRef.current) return;
      if (contatoIds.size === 0) {
        setConversas([]);
        setCarregandoLista(false);
        return;
      }
      query = query.eq("company_id", companyId).in("contact_id", [...contatoIds]);
    } else {
      query = comEscopoDaAba(query, aba);
    }

    const { data, error } = await query
      .eq("ultima_mensagem.is_internal_note", false)
      .order("created_at", { referencedTable: "ultima_mensagem", ascending: false })
      .limit(1, { referencedTable: "ultima_mensagem" })
      .order("last_activity_at", { ascending: false })
      .limit(50);

    // Mesma proteção das mensagens: se o usuário já trocou de aba, esta resposta é velha.
    if (pedido !== pedidoListaRef.current) return;

    if (error) {
      setErroLista(`Não foi possível carregar as conversas: ${error.message}`);
      setConversas(null);
    } else {
      setConversas((data ?? []) as unknown as ConversaLista[]);
    }
    setCarregandoLista(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, aba, userProfileId, companyId, buscaAplicada]);

  /** Contagem total de cada aba (independente da aba selecionada), pro numerinho ao lado do rótulo. */
  const carregarContagensAbas = useCallback(async () => {
    const abasParaContar: Aba[] = podeVerIA ? ["meus", "outros", "ia"] : ["meus", "outros"];
    const resultados = await Promise.all(
      abasParaContar.map((valorAba) =>
        comEscopoDaAba(supabase.from("conversations").select("id", { count: "exact", head: true }), valorAba),
      ),
    );
    setContagensAbas((atual) => {
      const novo = { ...atual };
      abasParaContar.forEach((valorAba, indice) => {
        novo[valorAba] = resultados[indice].count ?? 0;
      });
      return novo;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, userProfileId, companyId, podeVerIA]);

  const carregarMensagens = useCallback(
    async (conversationId: string, { limpar = true }: { limpar?: boolean } = {}) => {
      conversaPedidaRef.current = conversationId;
      setErroMensagens(null);
      // Troca de conversa: esvazia na hora, pra nunca mostrar mensagens da conversa anterior
      // com o cabeçalho da nova enquanto a resposta não chega. Recarregar a MESMA conversa
      // (depois de enviar/assumir) não esvazia, pra não piscar a tela.
      if (limpar) {
        grudadoNoFimRef.current = true;
        setMensagens(null);
        setAnexosPorMensagem({});
        setRevisoesPorMensagem({});
        setEditandoId(null);
      }

      // As 200 MAIS RECENTES (desc + inverte), não as 200 mais antigas: em conversa longa a
      // tela mostrava o começo da conversa e nunca chegava nas últimas mensagens — que são
      // justamente as da prévia na lista.
      const { data, error } = await supabase
        .from("messages")
        .select("*, author:user_profiles!messages_author_user_profile_id_fkey(id, full_name)")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (conversaPedidaRef.current !== conversationId) return;

      if (error) {
        setErroMensagens(`Não foi possível carregar as mensagens: ${error.message}`);
        setMensagens(null);
      } else {
        const lista = ((data ?? []) as unknown as MensagemComAutor[]).reverse();
        setMensagens(lista);
        // Edições/exclusões (0009). Erro aqui (ex: migração ainda não aplicada) não derruba a conversa.
        if (lista.length > 0) {
          void supabase
            .from("message_revisions")
            .select(
              "id, message_id, kind, origin, body_before, body_after, whatsapp_status, whatsapp_error, created_at, confirmed_at, " +
                "requested_by:user_profiles!message_revisions_requested_by_user_profile_id_fkey(full_name)",
            )
            .in("message_id", lista.map((m) => m.id))
            .order("created_at", { ascending: true })
            .then(({ data: revisoes }) => {
              if (conversaPedidaRef.current !== conversationId) return;
              const agrupadas: Record<string, MessageRevision[]> = {};
              for (const rev of (revisoes ?? []) as unknown as MessageRevision[]) (agrupadas[rev.message_id] ??= []).push(rev);
              setRevisoesPorMensagem(agrupadas);
            });
        }
        // Arquivos (áudio/imagem/documento/vídeo): links assinados pedidos ao servidor só pras
        // mensagens de mídia desta conversa. Mesma proteção de corrida das mensagens.
        const idsMidia = lista.filter((m) => TIPOS_COM_ARQUIVO.has(m.message_type)).map((m) => m.id);
        if (idsMidia.length > 0) {
          const links = await obterLinksAnexosAction(idsMidia).catch(() => ({}));
          if (conversaPedidaRef.current === conversationId) setAnexosPorMensagem(links);
        } else {
          setAnexosPorMensagem({});
        }
      }
    },
    [supabase],
  );

  useEffect(() => {
    carregarConversas();
  }, [carregarConversas]);

  useEffect(() => {
    carregarContagensAbas();
  }, [carregarContagensAbas]);

  // A aba "IA" não tem os sub-filtros de "quem precisa de humano" — se o usuário
  // trocar de aba com um sub-filtro selecionado, volta pra "Todas" em vez de aplicar
  // um filtro que não faz sentido ali (nunca some silenciosamente, nunca fica preso).
  useEffect(() => {
    if (aba === "ia") setSubFiltro("todas");
  }, [aba]);

  useLayoutEffect(() => {
    rolarParaOFim();
  }, [mensagens, anexosPorMensagem]);

  useEffect(() => {
    if (selecionadaId) carregarMensagens(selecionadaId);
  }, [selecionadaId, carregarMensagens]);

  useEffect(() => {
    if (!selecionadaId && conversas && conversas.length > 0) {
      setSelecionadaId(conversas[0].id);
    }
  }, [conversas, selecionadaId]);

  useEffect(() => {
    supabase
      .from("user_profiles")
      .select("id, full_name")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .then(({ data }) => setUsuariosEmpresa((data ?? []) as UsuarioEmpresa[]));
  }, [supabase, companyId]);

  /**
   * Regra do Gabriel (30/09/2026): só o DONO da conversa (responsável) abrir marca como lida. Outra
   * pessoa (supervisor, master, colega) pode abrir, ler e até responder — pro dono continua não lida.
   * Só no clique: a conversa que a tela seleciona sozinha ao carregar não conta como "abriu".
   */
  function abrirConversa(conversa: ConversaLista) {
    setSelecionadaId(conversa.id);
    if (conversa.assigned_user_profile_id !== userProfileId || conversa.unread_count === 0) return;
    setConversas((atual) => atual?.map((c) => (c.id === conversa.id ? { ...c, unread_count: 0 } : c)) ?? atual);
    void marcarConversaComoLidaAction(conversa.id);
  }

  const conversaSelecionada = conversas?.find((c) => c.id === selecionadaId) ?? null;

  /** Contagem de cada sub-filtro dentro da aba atual — computada da lista já carregada, sem round-trip novo. */
  const contagensSubFiltro = useMemo(() => {
    const lista = conversas ?? [];
    return {
      todas: lista.length,
      nao_lidas: lista.filter((c) => c.unread_count > 0).length,
      aguardando_resposta: lista.filter(aguardandoResposta).length,
    };
  }, [conversas]);

  const conversasFiltradas = useMemo(() => {
    if (!conversas) return [];
    let lista = conversas;

    if (aba !== "ia") {
      if (subFiltro === "nao_lidas") lista = lista.filter((c) => c.unread_count > 0);
      else if (subFiltro === "aguardando_resposta") lista = lista.filter(aguardandoResposta);
    }

    const termo = busca.trim().toLowerCase();
    if (!termo) return lista;
    const digitosBusca = termo.replace(/\D/g, "");
    return lista.filter((c) => {
      const nomeBate = c.contact?.display_name?.toLowerCase().includes(termo);
      const telefoneBate = digitosBusca.length >= 3 && (telefoneDoContato(c.contact) ?? "").includes(digitosBusca);
      return nomeBate || telefoneBate;
    });
  }, [conversas, busca, subFiltro, aba]);

  async function handleEditarMensagem(messageId: string, texto: string) {
    if (!selecionadaId) return;
    const resultado = await editarMensagemAction(messageId, texto);
    mostrarAviso(resultado.message);
    if (resultado.ok) {
      setEditandoId(null);
      await carregarMensagens(selecionadaId, { limpar: false });
    }
  }

  async function handleApagarMensagem(mensagem: Message) {
    if (!selecionadaId) return;
    const pergunta = mensagem.is_internal_note
      ? "Apagar esta nota interna? A equipe continua vendo, marcada como apagada."
      : "Apagar para todos? Some do WhatsApp do cliente (depois que o WhatsApp confirmar). Aqui a equipe continua vendo, marcada como apagada.";
    if (!window.confirm(pergunta)) return;
    const resultado = await apagarMensagemAction(mensagem.id);
    mostrarAviso(resultado.message);
    if (resultado.ok) await carregarMensagens(selecionadaId, { limpar: false });
  }

  function mostrarAviso(texto: string) {
    setAviso(texto);
    window.setTimeout(() => setAviso(null), 4000);
  }

  async function handleEnviar(event: React.FormEvent) {
    event.preventDefault();
    if (!selecionadaId) return;
    const texto = rascunhos[selecionadaId] ?? "";
    if (!texto.trim()) return;

    setEnviando(true);
    const resultado = modoNota
      ? await criarNotaInternaAction(selecionadaId, texto)
      : await enviarMensagemAction(selecionadaId, texto, crypto.randomUUID());
    setEnviando(false);
    mostrarAviso(resultado.message);

    if (resultado.ok) {
      setRascunhos((atual) => ({ ...atual, [selecionadaId]: "" }));
      await carregarMensagens(selecionadaId, { limpar: false });
      await carregarConversas();
      await carregarContagensAbas();
    }
  }

  async function handleAssumir() {
    if (!selecionadaId) return;
    const resultado = await assumirConversaAction(selecionadaId);
    mostrarAviso(resultado.message);
    await carregarConversas();
    await carregarContagensAbas();
  }

  async function handleTransferir(paraUserProfileId: string) {
    if (!selecionadaId) return;
    const resultado = await transferirConversaAction(selecionadaId, paraUserProfileId, null);
    mostrarAviso(resultado.message);
    setTransferenciaAberta(false);
    await carregarConversas();
    await carregarContagensAbas();
  }

  async function handleConcluirOuReabrir() {
    if (!selecionadaId || !conversaSelecionada) return;
    const resultado =
      conversaSelecionada.status === "encerrada"
        ? await reabrirConversaAction(selecionadaId)
        : await concluirConversaAction(selecionadaId);
    mostrarAviso(resultado.message);
    await carregarConversas();
    await carregarContagensAbas();
  }

  async function handleReenviar(messageId: string) {
    if (!selecionadaId) return;
    const resultado = await reenviarMensagemFalhadaAction(messageId, selecionadaId);
    mostrarAviso(resultado.message);
    await carregarMensagens(selecionadaId, { limpar: false });
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex h-full w-[300px] shrink-0 flex-col border-r border-[var(--ns-border)]">
        <div className="border-b border-[var(--ns-border)] px-3 pt-3">
          <h1 className="text-lg font-semibold text-[var(--ns-text)]">Atendimento</h1>
          <p className="mb-3 text-xs text-[var(--ns-text-secondary)]">Conversas reais — sem dado fictício.</p>
        </div>
        <div className="flex flex-col gap-3 border-b border-[var(--ns-border)] p-3">
          <input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-2 text-sm text-[var(--ns-text)] outline-none placeholder:text-[var(--ns-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)]"
          />
          {buscaAplicada.trim().length >= 2 && (
            <p className="-mt-1 text-[11px] text-[var(--ns-text-secondary)]">
              Buscando em todas as conversas (todas as abas), não só nas carregadas.
            </p>
          )}
          {/* Pergunta 1: de quem é a conversa? "Outros" é o atendimento humano de outro login (atribuído a
              outra pessoa, ou ainda sem ninguém) — não é "a equipe" no sentido de departamento/`teams`,
              porque quem supervisiona pode ver conversa de qualquer equipe aqui, não só a própria. "IA" só
              existe pra quem supervisiona — quem atende comum não vê conversa de ninguém além da própria
              (RLS já garante isso; aqui é só não oferecer a aba). */}
          <div className="flex gap-1 rounded-lg bg-[var(--ns-surface-hover)] p-1 text-sm">
            {(podeVerIA ? (["meus", "outros", "ia"] as const) : (["meus", "outros"] as const)).map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => setAba(valor)}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 font-medium transition ${
                  aba === valor ? "bg-[var(--ns-surface)] text-[var(--ns-text)] shadow-sm" : "text-[var(--ns-text-secondary)] hover:text-[var(--ns-text)]"
                }`}
              >
                {valor === "ia" && <Bot aria-hidden="true" className="h-3.5 w-3.5" />}
                {valor === "meus" ? "Meus" : valor === "outros" ? "Outros" : "IA"}
                {contagensAbas[valor] !== null && (
                  <span className="text-[11px] font-normal text-[var(--ns-text-secondary)]">{contagensAbas[valor]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Pergunta 2: o que falta fazer? Não existe pra "IA" — lá ninguém da equipe "lê" ou "responde". */}
          {aba !== "ia" && (
            <div className="flex gap-1 rounded-lg bg-[var(--ns-surface-hover)] p-1 text-xs">
              {SUB_FILTROS.map((filtro) => (
                <button
                  key={filtro.id}
                  type="button"
                  title={filtro.ajuda}
                  onClick={() => setSubFiltro(filtro.id)}
                  className={`flex-1 rounded-md px-1.5 py-1 font-medium transition ${
                    subFiltro === filtro.id ? "bg-[var(--ns-surface)] text-[var(--ns-text)] shadow-sm" : "text-[var(--ns-text-secondary)] hover:text-[var(--ns-text)]"
                  }`}
                >
                  {filtro.rotulo}
                  <span className="ml-1 text-[10px] font-normal text-[var(--ns-text-secondary)]">
                    {contagensSubFiltro[filtro.id]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {carregandoLista && <p className="p-4 text-sm text-[var(--ns-text-secondary)]">Carregando...</p>}
          {erroLista && (
            <p className="m-3 rounded-lg border border-[var(--ns-danger)]/40 bg-[var(--ns-danger)]/10 p-2.5 text-xs text-[var(--ns-danger)]">
              {erroLista}
            </p>
          )}
          {!carregandoLista && !erroLista && conversasFiltradas.length === 0 && (
            <p className="p-6 text-center text-sm text-[var(--ns-text-secondary)]">Nenhuma conversa nesse filtro.</p>
          )}
          {conversasFiltradas.map((conversa) => {
            const telefone = formatarTelefone(telefoneDoContato(conversa.contact));
            return (
              <button
                key={conversa.id}
                type="button"
                onClick={() => abrirConversa(conversa)}
                className={`flex w-full flex-col gap-1 border-b border-[var(--ns-border)] px-3 py-3 text-left transition ${
                  conversa.id === selecionadaId ? "bg-[var(--ns-primary)]/10" : "hover:bg-[var(--ns-surface-hover)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-[var(--ns-text)]">
                    {conversa.contact?.display_name ?? "Contato sem nome"}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--ns-text-secondary)]">
                    {horaOuData(conversa.last_activity_at)}
                  </span>
                </div>
                <span className="truncate text-xs text-[var(--ns-text-secondary)]">{conversa.last_message_preview ?? "—"}</span>
                <div className="flex items-center gap-2">
                  <EstadoBadge estado={STATUS_PARA_BADGE[conversa.status]} />
                  <span className="truncate text-[11px] text-[var(--ns-text-secondary)]">{telefone ?? conversa.channel?.name ?? "Canal"}</span>
                  {conversa.unread_count > 0 && (
                    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--ns-primary)] px-1 text-[11px] font-semibold text-[var(--ns-primary-foreground)]">
                      {conversa.unread_count}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex h-full min-w-[420px] flex-1 flex-col">
        {!conversaSelecionada ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--ns-text-secondary)]">
            Selecione uma conversa.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--ns-border)] px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ns-primary)]/15 text-sm font-semibold text-[var(--ns-primary)]">
                  {iniciaisDe(conversaSelecionada.contact?.display_name ?? null)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--ns-text)]">
                    {conversaSelecionada.contact?.display_name ?? "Contato sem nome"}
                  </p>
                  <p className="truncate text-xs text-[var(--ns-text-secondary)]">
                    {formatarTelefone(telefoneDoContato(conversaSelecionada.contact)) ?? "Número privado"}
                    {" · "}
                    {conversaSelecionada.channel?.name ?? "Canal"} ·{" "}
                    {nomeResponsavel(conversaSelecionada, "sem responsável")}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <EstadoBadge estado={STATUS_PARA_BADGE[conversaSelecionada.status]} />
                {!conversaSelecionada.assigned_user_profile_id && (
                  <button
                    type="button"
                    onClick={handleAssumir}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ns-border)] px-3 py-1.5 text-xs font-medium text-[var(--ns-text)] transition hover:bg-[var(--ns-surface-hover)]"
                  >
                    <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
                    Assumir
                  </button>
                )}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTransferenciaAberta((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ns-border)] px-3 py-1.5 text-xs font-medium text-[var(--ns-text)] transition hover:bg-[var(--ns-surface-hover)]"
                  >
                    <Users2 aria-hidden="true" className="h-3.5 w-3.5" />
                    Transferir
                  </button>
                  {transferenciaAberta && (
                    <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-1.5 shadow-lg">
                      {usuariosEmpresa
                        .filter((u) => u.id !== conversaSelecionada.assigned_user_profile_id)
                        .map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => handleTransferir(u.id)}
                            className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]"
                          >
                            {u.full_name ?? u.id}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleConcluirOuReabrir}
                  className="rounded-lg bg-[var(--ns-primary)] px-3 py-1.5 text-xs font-medium text-[var(--ns-primary-foreground)] transition hover:opacity-90"
                >
                  {conversaSelecionada.status === "encerrada" ? "Reabrir" : "Concluir"}
                </button>
              </div>
            </div>

            <div
              ref={areaMensagensRef}
              onScroll={(evento) => {
                const area = evento.currentTarget;
                grudadoNoFimRef.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
              }}
              // "load" de imagem/vídeo não borbulha — captura pega quando a mídia termina e muda a altura.
              onLoadCapture={rolarParaOFim}
              onLoadedMetadataCapture={rolarParaOFim}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            >
              {erroMensagens && (
                <p className="mx-auto max-w-md rounded-lg border border-[var(--ns-danger)]/40 bg-[var(--ns-danger)]/10 px-3 py-2 text-xs text-[var(--ns-danger)]">
                  {erroMensagens}
                </p>
              )}
              {mensagens?.length === 0 && (
                <p className="text-center text-sm text-[var(--ns-text-secondary)]">Nenhuma mensagem ainda.</p>
              )}
              {mensagens?.map((mensagem) => {
                const revisoes = revisoesPorMensagem[mensagem.id] ?? [];
                const apagada = Boolean(mensagem.deleted_at);
                const { podeEditar, podeApagar } = permissoesDaMensagem(mensagem, {
                  userProfileId,
                  podeApagarDeOutros: isAdminOuManager || isPlatformOwner,
                  canalProvider: conversaSelecionada?.channel?.provider ?? null,
                });
                const editando = editandoId === mensagem.id;

                if (mensagem.is_internal_note) {
                  return (
                    <div
                      key={mensagem.id}
                      className={`mx-auto flex max-w-md items-start gap-2 rounded-lg border px-3 py-2 text-xs text-[var(--ns-text)] ${
                        apagada ? "border-[var(--ns-danger)]/40 bg-[var(--ns-danger)]/10" : "border-[var(--ns-warning)]/40 bg-[var(--ns-warning)]/10"
                      }`}
                    >
                      <StickyNote aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ns-warning)]" />
                      <div className="min-w-0 flex-1">
                        {apagada && <AvisoMensagemApagada mensagem={mensagem} revisoes={revisoes} />}
                        <p className="flex items-center justify-between gap-2 font-medium">
                          Nota interna — nunca vai para o cliente
                          <AcoesMensagem
                            podeEditar={podeEditar && !editando}
                            podeApagar={podeApagar && !editando}
                            ehNota
                            claro={false}
                            onEditar={() => setEditandoId(mensagem.id)}
                            onApagar={() => handleApagarMensagem(mensagem)}
                          />
                        </p>
                        {editando ? (
                          <EditorMensagem
                            textoInicial={mensagem.body ?? ""}
                            onSalvar={(texto) => handleEditarMensagem(mensagem.id, texto)}
                            onCancelar={() => setEditandoId(null)}
                          />
                        ) : (
                          <p className={`text-[var(--ns-text-secondary)] ${apagada ? "italic opacity-80" : ""}`}>{corpoSemAssinaturaAntiga(mensagem)}</p>
                        )}
                        <HistoricoRevisoes revisoes={revisoes} claro={false} />
                      </div>
                    </div>
                  );
                }

                const doCliente = mensagem.direction === "entrada";
                return (
                  <div key={mensagem.id} className={`flex flex-col ${doCliente ? "items-start" : "items-end"}`}>
                    {/* Quem enviou — nunca fica implícito: nome de quem atendeu, ou "IA" quando foi o
                        assistente. Cliente não precisa de rótulo: só existe uma pessoa do lado esquerdo. */}
                    {!doCliente && (
                      <span className="mb-0.5 flex items-center gap-1 px-1 text-[10px] font-medium text-[var(--ns-text-secondary)]">
                        {mensagem.author_type === "ia" && <Bot aria-hidden="true" className="h-3 w-3" />}
                        {remetenteDe(mensagem)}
                      </span>
                    )}
                    <div
                      className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                        apagada
                          ? "border border-dashed border-[var(--ns-danger)]/60 bg-[var(--ns-danger)]/10 text-[var(--ns-text)]"
                          : doCliente
                            ? "bg-[var(--ns-surface-hover)] text-[var(--ns-text)]"
                            : "bg-[var(--ns-primary)] text-[var(--ns-primary-foreground)]"
                      }`}
                    >
                      {apagada && <AvisoMensagemApagada mensagem={mensagem} revisoes={revisoes} />}
                      {TIPOS_COM_ARQUIVO.has(mensagem.message_type) && (
                        <ArquivoDaMensagem
                          tipo={mensagem.message_type}
                          anexos={anexosPorMensagem[mensagem.id] ?? []}
                          doCliente={doCliente}
                        />
                      )}
                      {editando ? (
                        <EditorMensagem
                          textoInicial={mensagem.body ?? ""}
                          onSalvar={(texto) => handleEditarMensagem(mensagem.id, texto)}
                          onCancelar={() => setEditandoId(null)}
                        />
                      ) : (
                        corpoSemAssinaturaAntiga(mensagem) && (
                          <p
                            className={`whitespace-pre-wrap ${TIPOS_COM_ARQUIVO.has(mensagem.message_type) ? "mt-1" : ""} ${apagada ? "italic opacity-80" : ""}`}
                          >
                            {corpoSemAssinaturaAntiga(mensagem)}
                          </p>
                        )
                      )}
                      <HistoricoRevisoes revisoes={revisoes} claro={!doCliente && !apagada} />
                      <div
                        className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${
                          doCliente ? "text-[var(--ns-text-secondary)]" : "text-[var(--ns-primary-foreground)]/70"
                        }`}
                      >
                        {!doCliente && mensagem.status === "falha" && (
                          <button
                            type="button"
                            onClick={() => handleReenviar(mensagem.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--ns-danger)]/20 px-1.5 py-0.5 text-[var(--ns-danger)]"
                            title={mensagem.failed_reason ?? "Falha no envio"}
                          >
                            <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                            Falhou — tentar de novo
                          </button>
                        )}
                        {!doCliente && mensagem.status === "pendente" && <span>enviando...</span>}
                        {!doCliente && (mensagem.status === "enviada" || mensagem.status === "entregue" || mensagem.status === "lida") && (
                          <Check aria-hidden="true" className="h-3 w-3" />
                        )}
                        <AcoesMensagem
                          podeEditar={podeEditar && !editando}
                          podeApagar={podeApagar && !editando}
                          ehNota={false}
                          claro={!doCliente && !apagada}
                          onEditar={() => setEditandoId(mensagem.id)}
                          onApagar={() => handleApagarMensagem(mensagem)}
                        />
                        <span>{horaOuData(mensagem.created_at, true)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {aviso && (
              <div className="px-4 pb-1 text-xs text-[var(--ns-text-secondary)]" role="status">
                {aviso}
              </div>
            )}

            <form onSubmit={handleEnviar} className="border-t border-[var(--ns-border)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModoNota(false)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium ${!modoNota ? "bg-[var(--ns-primary)]/15 text-[var(--ns-primary)]" : "text-[var(--ns-text-secondary)]"}`}
                >
                  Mensagem
                </button>
                <button
                  type="button"
                  onClick={() => setModoNota(true)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium ${modoNota ? "bg-[var(--ns-warning)]/15 text-[var(--ns-warning)]" : "text-[var(--ns-text-secondary)]"}`}
                >
                  Nota interna
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Registrar ligação (ainda não implementado nesta entrega)"
                  disabled
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--ns-border)] text-[var(--ns-text-secondary)] opacity-50"
                >
                  <Phone aria-hidden="true" className="h-4 w-4" />
                </button>
                <input
                  type="text"
                  value={rascunhos[selecionadaId ?? ""] ?? ""}
                  onChange={(event) =>
                    setRascunhos((atual) => ({ ...atual, [selecionadaId ?? ""]: event.target.value }))
                  }
                  placeholder={modoNota ? "Escreva uma nota interna..." : "Digite uma mensagem..."}
                  className="flex-1 rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-2 text-sm text-[var(--ns-text)] outline-none placeholder:text-[var(--ns-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)]"
                />
                <button
                  type="submit"
                  disabled={enviando}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ns-primary)] text-[var(--ns-primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
                >
                  <Send aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      <aside className="hidden h-full w-[320px] shrink-0 flex-col overflow-y-auto border-l border-[var(--ns-border)] lg:flex">
        {!conversaSelecionada ? (
          <p className="p-4 text-sm text-[var(--ns-text-secondary)]">Selecione uma conversa.</p>
        ) : (
          <>
            <div className="border-b border-[var(--ns-border)] px-4 py-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--ns-primary)]/15 text-sm font-semibold text-[var(--ns-primary)]">
                  {iniciaisDe(conversaSelecionada.contact?.display_name ?? null)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--ns-text)]">
                    {conversaSelecionada.contact?.display_name ?? "Contato sem nome"}
                  </p>
                  <p className="truncate text-xs tabular-nums text-[var(--ns-text-secondary)]">
                    {formatarTelefone(telefoneDoContato(conversaSelecionada.contact)) ?? "Número privado"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    conversaSelecionada.client_id
                      ? "bg-[var(--ns-success)]/15 text-[var(--ns-success)]"
                      : "bg-[var(--ns-warning)]/15 text-[var(--ns-warning)]"
                  }`}
                >
                  {conversaSelecionada.client_id ? "Cliente cadastrado" : "Cadastro pendente"}
                </span>
                {conversaSelecionada.external_id && (
                  <span
                    className="rounded-full bg-[var(--ns-surface-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--ns-text-secondary)]"
                    title="Histórico trazido pelo importador do Totalk, não uma conversa iniciada aqui."
                  >
                    Importado do Totalk
                  </span>
                )}
              </div>
              {conversaSelecionada.client_id && (
                <a
                  href={`/clientes/${conversaSelecionada.client_id}`}
                  className="mt-3 inline-block text-xs font-medium text-[var(--ns-primary)] hover:underline"
                >
                  Ver perfil completo do cliente →
                </a>
              )}
            </div>

            <section className="border-b border-[var(--ns-border)] px-4 py-3.5">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ns-text-secondary)]">Atendimento</h3>
              <dl className="space-y-1.5">
                <LinhaFicha rotulo="Status" valor={<EstadoBadge estado={STATUS_PARA_BADGE[conversaSelecionada.status]} />} />
                <LinhaFicha rotulo="Equipe" valor={conversaSelecionada.team?.name ?? "Sem equipe"} />
                <LinhaFicha rotulo="Responsável" valor={nomeResponsavel(conversaSelecionada, "Sem responsável")} />
                <LinhaFicha rotulo="Canal" valor={conversaSelecionada.channel?.name ?? "—"} />
                <LinhaFicha rotulo="Iniciada em" valor={formatarDataHora(conversaSelecionada.created_at)} />
                <LinhaFicha rotulo="Última atividade" valor={formatarDataHora(conversaSelecionada.last_activity_at)} />
              </dl>
            </section>

            <section className="border-b border-[var(--ns-border)] px-4 py-3.5">
              <button
                type="button"
                onClick={() => carregarConversas()}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--ns-border)] px-3 py-2 text-xs font-medium text-[var(--ns-text)] transition hover:bg-[var(--ns-surface-hover)]"
              >
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                Atualizar
              </button>
            </section>

            <div className="px-4 py-3.5 text-xs leading-relaxed text-[var(--ns-text-secondary)]">
              Resumo automático da IA, etiquetas, pré-venda, pós-venda e ações de cadastro/análise ainda não estão
              integrados nesta entrega (dependem da Entrega D — ações do CRM no atendimento, e da IA com credencial
              por empresa). Tudo o que aparece acima é dado real do banco, sem dado fictício.
            </div>

            {isAdminOuManager && (
              <p className="px-4 pb-4 text-xs text-[var(--ns-text-secondary)]">
                Você vê todas as conversas da empresa (admin/gerente), inclusive em &quot;Outros&quot;. Consultores
                veem só as próprias em &quot;Meus&quot; + o que está sem responsável ou com outra pessoa em
                &quot;Outros&quot;.
              </p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

/**
 * Arquivo de uma mensagem. Sem arquivo ainda (a cópia do Totalk pro Storage roda em paralelo à
 * importação, ver copiar-anexos.mjs), mostra que é um áudio/imagem/etc. e que ainda está chegando —
 * nunca um balão vazio, que parecia mensagem perdida.
 */
function ArquivoDaMensagem({ tipo, anexos, doCliente }: { tipo: string; anexos: AnexoParaExibir[]; doCliente: boolean }) {
  if (anexos.length === 0) {
    return (
      <p className={`flex items-center gap-1.5 text-xs italic ${doCliente ? "text-[var(--ns-text-secondary)]" : "opacity-80"}`}>
        <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {ROTULO_TIPO[tipo] ?? "Arquivo"} — arquivo ainda sendo copiado do Totalk
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {anexos.map((anexo) => {
        const mime = anexo.contentType ?? "";
        if (tipo === "audio" || mime.startsWith("audio/")) {
          return <audio key={anexo.url} controls preload="none" src={anexo.url} className="h-10 w-64 max-w-full" />;
        }
        if (tipo === "imagem" || mime.startsWith("image/")) {
          return (
            <a key={anexo.url} href={anexo.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- link assinado temporário do Storage, não passa pelo otimizador de imagem */}
              <img src={anexo.url} alt={anexo.nome ?? "Imagem"} className="max-h-64 max-w-full rounded-lg" loading="lazy" />
            </a>
          );
        }
        if (tipo === "video" || mime.startsWith("video/")) {
          return <video key={anexo.url} controls preload="none" src={anexo.url} className="max-h-64 max-w-full rounded-lg" />;
        }
        return (
          <a key={anexo.url} href={anexo.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline">
            <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="truncate">{anexo.nome ?? "Documento"}</span>
          </a>
        );
      })}
    </div>
  );
}

function LinhaFicha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <dt className="shrink-0 text-[12px] text-[var(--ns-text-secondary)]">{rotulo}</dt>
      <dd className="min-w-0 truncate text-right text-[12.5px] text-[var(--ns-text)]">{valor}</dd>
    </div>
  );
}
