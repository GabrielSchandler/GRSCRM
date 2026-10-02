"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Bot, Eye, FileText, Info, MessageSquarePlus, Mic, MoreVertical, Paperclip, RefreshCw, Search, Send, Square, StickyNote, Trash2, Upload, UserPlus, Users2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { definirFoco } from "@/lib/newsec/notificacoes";
import type { ConversaEstado, ConversationStatus, Message, MessageRevision } from "@/types/atendimento";
import { AcoesMensagem, AvisoMensagemApagada, EditorMensagem, HistoricoRevisoes, permissoesDaMensagem } from "./mensagem-revisoes";
import { BarraCitando, BotaoResponder, BuscaNaConversa, CitacaoNaBolha, ehTelaDeCelular, irAteMensagem, Tiques, type ResultadoBusca } from "./chat-comum";
import { VinculoCliente } from "./vinculo-cliente";
import {
  apagarMensagemAction,
  assumirConversaAction,
  concluirConversaAction,
  criarNotaInternaAction,
  despacharPendentesAction,
  editarMensagemAction,
  enviarAnexoAction,
  enviarMensagemAction,
  iniciarConversaAction,
  marcarConversaComoLidaAction,
  reabrirConversaAction,
  obterLinksAnexosAction,
  prepararEnvioAnexoAction,
  reenviarMensagemFalhadaAction,
  transferirConversaAction,
  type AnexoParaExibir,
} from "@/app/(newsec)/atendimento/actions";

const TIPOS_COM_ARQUIVO = new Set(["audio", "imagem", "documento", "video"]);
const POR_PAGINA_LISTA = 50;
const POR_PAGINA_MENSAGENS = 200;
// Sem WhatsApp em tempo real ainda: a tela confere novidades sozinha a cada 15 s (só com a aba
// do navegador visível) — antes, mensagem nova só aparecia clicando em "Atualizar".
const INTERVALO_ATUALIZACAO_MS = 15_000;
// Link assinado do arquivo vale 1 h; renova antes de vencer pra áudio/imagem não quebrarem.
const RENOVAR_LINKS_APOS_MS = 50 * 60 * 1000;
const SELECT_MENSAGEM = "*, author:user_profiles!messages_author_user_profile_id_fkey(id, full_name)";
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
  assigned_user_profile: { id: string; full_name: string | null; business_area?: string | null } | null;
  // Só a última mensagem (sem nota interna) — diz se quem falou por último foi o cliente.
  ultima_mensagem: { direction: "entrada" | "saida" }[] | null;
};

/** Cliente falou por último, o dono já viu (não está mais em "não lidas") e ninguém respondeu. */
function aguardandoResposta(conversa: ConversaLista): boolean {
  return conversa.status !== "encerrada" && conversa.unread_count === 0 && conversa.ultima_mensagem?.[0]?.direction === "entrada";
}

type UsuarioEmpresa = { id: string; full_name: string | null; business_area?: string | null };

const ROTULO_SETOR: Record<string, string> = { commercial: "Comercial", legal: "Jurídico" };

/** Setor da conversa = setor do responsável (pedido do Gabriel, 02/10/2026: transferir pro jurídico muda o setor). */
function setorDaConversa(conversa: { assigned_user_profile: { business_area?: string | null } | null }): string | null {
  const area = conversa.assigned_user_profile?.business_area;
  return area ? (ROTULO_SETOR[area] ?? null) : null;
}

/** Lista de transferência separada por setor — quem é do jurídico, quem é do comercial. */
function ListaTransferencia({
  usuarios,
  responsavelAtual,
  onEscolher,
  grande,
}: {
  usuarios: UsuarioEmpresa[];
  responsavelAtual: string | null;
  onEscolher: (u: UsuarioEmpresa) => void;
  grande?: boolean;
}) {
  const grupos: [string, UsuarioEmpresa[]][] = [
    ["Comercial", usuarios.filter((u) => u.business_area !== "legal")],
    ["Jurídico", usuarios.filter((u) => u.business_area === "legal")],
  ];
  return (
    <>
      {grupos.map(([titulo, lista]) =>
        lista.filter((u) => u.id !== responsavelAtual).length === 0 ? null : (
          <div key={titulo}>
            <p className="px-2.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ns-text-secondary)]">{titulo}</p>
            {lista
              .filter((u) => u.id !== responsavelAtual)
              .map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => onEscolher(u)}
                  className={`block w-full rounded-md px-2.5 text-left text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)] ${grande ? "py-2 text-sm" : "py-1.5 text-xs"}`}
                >
                  {u.full_name ?? u.id}
                </button>
              ))}
          </div>
        ),
      )}
    </>
  );
}

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

/** Prévia da última mensagem na lista, legível: "[audio]" vira "Áudio" e tira a assinatura "*Nome:*" do Totalk. */
function previaLegivel(preview: string | null): string {
  if (!preview) return "—";
  const soTipo = preview.match(/^\[(\w+)\]$/);
  if (soTipo) return ROTULO_TIPO[soTipo[1]] ?? "Arquivo";
  return preview.replace(/^\*[^*\n]{1,60}:\*\s*/, "");
}

/** Rótulo de quem mandou uma mensagem de saída — nunca deixa "quem enviou" implícito. */
function remetenteDe(mensagem: MensagemComAutor): string {
  switch (mensagem.author_type) {
    case "ia":
      return "IA";
    case "humano":
      if (mensagem.author?.full_name) return mensagem.author.full_name;
      return mensagem.external_id ? "Atendente não localizado" : "Equipe (usuário removido)";
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

function horaCurta(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Rótulo do separador de dia na conversa: "Hoje", "Ontem" ou a data. */
function rotuloDia(iso: string) {
  const data = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  if (data.toDateString() === hoje.toDateString()) return "Hoje";
  if (data.toDateString() === ontem.toDateString()) return "Ontem";
  return data.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
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
  areaJuridica = false,
}: {
  companyId: string;
  userProfileId: string;
  isAdminOuManager: boolean;
  isPlatformOwner: boolean;
  /** Usuário do Jurídico: escreve em qualquer conversa (0013). Comercial só nas dele. */
  areaJuridica?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  // A aba "IA" (conversas sem responsável, só a IA atendendo) é visível pra quem supervisiona —
  // mesmo corte de "isAdminOuManager" usado no resto da tela pra "ver toda a empresa".
  const podeVerIA = isAdminOuManager || isPlatformOwner;
  // Transferir conversa (e com isso mudar o setor): só gerente/administrador/master. O banco também
  // barra consultor (política conversations_update só aceita o próprio usuário como responsável).
  const podeTransferir = isAdminOuManager || isPlatformOwner;
  // Consultor vê só "Meus" (pedido do Gabriel): "Outros" e "IA" são de quem supervisiona.
  const abasVisiveis: Aba[] = podeVerIA ? ["meus", "outros", "ia"] : ["meus"];
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
  const [limiteLista, setLimiteLista] = useState(POR_PAGINA_LISTA);
  const [temMaisConversas, setTemMaisConversas] = useState(false);
  const [naoLidasPorAba, setNaoLidasPorAba] = useState<Record<Aba, number | null>>({ meus: null, outros: null, ia: null });
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemComAutor[] | null>(null);
  const [anexosPorMensagem, setAnexosPorMensagem] = useState<Record<string, AnexoParaExibir[]>>({});
  const [revisoesPorMensagem, setRevisoesPorMensagem] = useState<Record<string, MessageRevision[]>>({});
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erroMensagens, setErroMensagens] = useState<string | null>(null);
  const [temMensagensAnteriores, setTemMensagensAnteriores] = useState(false);
  const [respondendo, setRespondendo] = useState<MensagemComAutor | null>(null);
  const [buscaNaConversaAberta, setBuscaNaConversaAberta] = useState(false);
  const [destaqueId, setDestaqueId] = useState<string | null>(null);
  // Painel do cliente (direita): fixo em tela larga; em tela menor abre por cima, pelo botão (i).
  const [painelAberto, setPainelAberto] = useState(false);
  const [menuMaisAberto, setMenuMaisAberto] = useState(false);
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false);

  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [modoNota, setModoNota] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [contatosNovos, setContatosNovos] = useState<Set<string>>(new Set());
  const [novaConversaAberta, setNovaConversaAberta] = useState(false);
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);
  // Áudio gravado no navegador e arquivos (foto/vídeo/documento) pro cliente.
  const [gravandoDesde, setGravandoDesde] = useState<number | null>(null);
  const [relogioGravacao, setRelogioGravacao] = useState(0);
  const [statusEnvio, setStatusEnvio] = useState<string | null>(null);
  const gravadorRef = useRef<{ gravador: MediaRecorder; cancelar: boolean } | null>(null);
  const entradaArquivoRef = useRef<HTMLInputElement | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [usuariosEmpresa, setUsuariosEmpresa] = useState<UsuarioEmpresa[]>([]);
  const [transferenciaAberta, setTransferenciaAberta] = useState(false);
  const transferenciaRef = useRef<HTMLDivElement | null>(null);

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
  // "Carregar anteriores" coloca mensagens EM CIMA: guarda a posição pra tela não pular.
  const ajusteRolagemRef = useRef<{ altura: number; topo: number } | null>(null);
  // Maior updated_at já visto na conversa aberta — a atualização automática só pede o que mudou depois.
  const sincronizadoAteRef = useRef<string | null>(null);
  const linksAssinadosEmRef = useRef(0);
  // Conversa que o DONO abriu clicando: enquanto estiver aberta, mensagem nova que chegar já conta como vista.
  const abertaPeloDonoRef = useRef<string | null>(null);
  function rolarParaOFim() {
    const area = areaMensagensRef.current;
    if (area && grudadoNoFimRef.current) area.scrollTop = area.scrollHeight;
  }

  function registrarSincronizacao(lista: { updated_at: string }[]) {
    for (const m of lista) {
      if (!sincronizadoAteRef.current || m.updated_at > sincronizadoAteRef.current) sincronizadoAteRef.current = m.updated_at;
    }
  }

  const SELECT_CONVERSAS =
    "id, status, created_at, last_activity_at, last_message_preview, unread_count, assigned_user_profile_id, client_id, team_id, external_id, " +
    "contact:contacts(id, display_name, contact_phone_numbers(phone_e164, is_primary)), channel:channels(id, name, provider), team:teams(id, name), " +
    "assigned_user_profile:user_profiles!conversations_assigned_user_profile_id_fkey(id, full_name, business_area), " +
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

  /**
   * "Contato novo" = conversa transferida pro responsável atual que ele ainda não abriu (continua não
   * lida) nem respondeu depois da transferência. Calculado da tabela de transferências — sem coluna nova.
   */
  const detectarContatosNovos = useCallback(
    async (lista: ConversaLista[]) => {
      const candidatas = lista.filter((c) => c.unread_count > 0 && c.assigned_user_profile_id && c.status !== "encerrada");
      if (candidatas.length === 0) return setContatosNovos(new Set());
      const { data: transferencias } = await supabase
        .from("conversation_transfers")
        .select("conversation_id, to_user_profile_id, created_at")
        .in(
          "conversation_id",
          candidatas.map((c) => c.id),
        )
        .order("created_at", { ascending: false })
        .limit(500);
      const ultima = new Map<string, { to_user_profile_id: string | null; created_at: string }>();
      for (const t of transferencias ?? []) if (!ultima.has(t.conversation_id)) ultima.set(t.conversation_id, t);
      const transferidas = candidatas.filter((c) => ultima.get(c.id)?.to_user_profile_id === c.assigned_user_profile_id);
      if (transferidas.length === 0) return setContatosNovos(new Set());

      const desde = transferidas.map((c) => ultima.get(c.id)!.created_at).sort()[0];
      const { data: respostas } = await supabase
        .from("messages")
        .select("conversation_id, author_user_profile_id, created_at")
        .in(
          "conversation_id",
          transferidas.map((c) => c.id),
        )
        .eq("direction", "saida")
        .eq("author_type", "humano")
        .gte("created_at", desde)
        .limit(1000);
      const novos = transferidas.filter(
        (c) =>
          !(respostas ?? []).some(
            (m) => m.conversation_id === c.id && m.author_user_profile_id === c.assigned_user_profile_id && m.created_at > ultima.get(c.id)!.created_at,
          ),
      );
      setContatosNovos(new Set(novos.map((c) => c.id)));
    },
    [supabase],
  );

  const carregarConversas = useCallback(async ({ silencioso = false }: { silencioso?: boolean } = {}) => {
    const pedido = ++pedidoListaRef.current;
    if (!silencioso) setCarregandoLista(true);
    setErroLista(null);

    // Busca vai no BANCO, não só nas 50 conversas já carregadas — antes, procurar um telefone
    // de alguém fora da lista inicial não achava nada (relatado pelo Gabriel, 30/09/2026). Com busca
    // ativa, abas e filtros SOMEM e a busca vale pra todas as conversas que a pessoa pode ver (pedido do
    // Gabriel, 02/10/2026). Consultor continua vendo só as dele: quem garante é a RLS do banco.
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
      // Sub-filtros no BANCO (antes filtravam só as 50 já carregadas — "Não lidas 17" eram 17 de 50).
      if (aba !== "ia" && subFiltro === "nao_lidas") query = query.gt("unread_count", 0);
      if (aba !== "ia" && subFiltro === "aguardando_resposta") query = query.eq("unread_count", 0).neq("status", "encerrada");
    }

    // "Aguardando resposta" ainda depende de quem falou por último (conferido na tela), então pede uma janela maior.
    const limite = termo.length < 2 && aba !== "ia" && subFiltro === "aguardando_resposta" ? Math.max(limiteLista, 200) : limiteLista;
    const { data, error } = await query
      .eq("ultima_mensagem.is_internal_note", false)
      .order("created_at", { referencedTable: "ultima_mensagem", ascending: false })
      .limit(1, { referencedTable: "ultima_mensagem" })
      .order("last_activity_at", { ascending: false })
      .limit(limite);

    // Mesma proteção das mensagens: se o usuário já trocou de aba, esta resposta é velha.
    if (pedido !== pedidoListaRef.current) return;

    if (error) {
      // Atualização automática que falha (rede caiu um instante) não apaga a lista que já está na tela.
      if (!silencioso) {
        setErroLista(`Não foi possível carregar as conversas: ${error.message}`);
        setConversas(null);
      }
    } else {
      setConversas((data ?? []) as unknown as ConversaLista[]);
      void detectarContatosNovos((data ?? []) as unknown as ConversaLista[]);
      setTemMaisConversas((data?.length ?? 0) === limite);
      setAtualizadoEm(new Date());
    }
    setCarregandoLista(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, aba, subFiltro, limiteLista, userProfileId, companyId, buscaAplicada, detectarContatosNovos]);

  /** Contagem total de cada aba (independente da aba selecionada), pro numerinho ao lado do rótulo. */
  const carregarContagensAbas = useCallback(async () => {
    const abasParaContar: Aba[] = podeVerIA ? ["meus", "outros", "ia"] : ["meus"];
    const [totais, naoLidas] = await Promise.all([
      Promise.all(
        abasParaContar.map((valorAba) =>
          comEscopoDaAba(supabase.from("conversations").select("id", { count: "exact", head: true }), valorAba),
        ),
      ),
      Promise.all(
        abasParaContar.map((valorAba) =>
          comEscopoDaAba(supabase.from("conversations").select("id", { count: "exact", head: true }), valorAba).gt("unread_count", 0),
        ),
      ),
    ]);
    setContagensAbas((atual) => {
      const novo = { ...atual };
      abasParaContar.forEach((valorAba, indice) => {
        if (totais[indice].count !== null) novo[valorAba] = totais[indice].count;
      });
      return novo;
    });
    setNaoLidasPorAba((atual) => {
      const novo = { ...atual };
      abasParaContar.forEach((valorAba, indice) => {
        if (naoLidas[indice].count !== null) novo[valorAba] = naoLidas[indice].count;
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
        sincronizadoAteRef.current = null;
        setTemMensagensAnteriores(false);
        setMensagens(null);
        setAnexosPorMensagem({});
        setRevisoesPorMensagem({});
        setEditandoId(null);
        setRespondendo(null);
        setBuscaNaConversaAberta(false);
        setPainelAberto(false);
      }

      // As 200 MAIS RECENTES (desc + inverte), não as 200 mais antigas: em conversa longa a
      // tela mostrava o começo da conversa e nunca chegava nas últimas mensagens — que são
      // justamente as da prévia na lista.
      const { data, error } = await supabase
        .from("messages")
        .select(SELECT_MENSAGEM)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(POR_PAGINA_MENSAGENS);

      if (conversaPedidaRef.current !== conversationId) return;

      if (error) {
        setErroMensagens(`Não foi possível carregar as mensagens: ${error.message}`);
        setMensagens(null);
      } else {
        const lista = ((data ?? []) as unknown as MensagemComAutor[]).reverse();
        setMensagens(lista);
        setTemMensagensAnteriores(lista.length === POR_PAGINA_MENSAGENS);
        registrarSincronizacao(lista);
        // Revisões e arquivos em paralelo (antes os arquivos esperavam a resposta anterior).
        linksAssinadosEmRef.current = Date.now();
        await carregarExtras(conversationId, lista, { substituir: true });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase],
  );

  /**
   * Revisões (editada/apagada) e links dos arquivos de um conjunto de mensagens. "substituir" na
   * carga completa; senão MESCLA — reassinar link de mídia que já está na tela faz áudio/imagem recarregar.
   */
  async function carregarExtras(
    conversationId: string,
    lista: Message[],
    { substituir = false, pularMidiaComLink = false }: { substituir?: boolean; pularMidiaComLink?: boolean } = {},
  ) {
    if (lista.length === 0) {
      if (substituir) {
        setRevisoesPorMensagem({});
        setAnexosPorMensagem({});
      }
      return;
    }
    const ids = lista.map((m) => m.id);
    const idsMidia = lista
      .filter((m) => TIPOS_COM_ARQUIVO.has(m.message_type) && !(pularMidiaComLink && anexosPorMensagem[m.id]))
      .map((m) => m.id);
    const [revisoesResp, links] = await Promise.all([
      // Erro aqui (ex: migração 0009 ausente) não derruba a conversa.
      supabase
        .from("message_revisions")
        .select(
          "id, message_id, kind, origin, body_before, body_after, whatsapp_status, whatsapp_error, created_at, confirmed_at, " +
            "requested_by:user_profiles!message_revisions_requested_by_user_profile_id_fkey(full_name)",
        )
        .in("message_id", ids)
        .order("created_at", { ascending: true }),
      idsMidia.length > 0 ? obterLinksAnexosAction(idsMidia).catch(() => ({}) as Record<string, AnexoParaExibir[]>) : Promise.resolve({}),
    ]);
    if (conversaPedidaRef.current !== conversationId) return;

    const agrupadas: Record<string, MessageRevision[]> = {};
    for (const id of ids) agrupadas[id] = [];
    for (const rev of (revisoesResp.data ?? []) as unknown as MessageRevision[]) agrupadas[rev.message_id]?.push(rev);
    setRevisoesPorMensagem((atual) => (substituir ? agrupadas : { ...atual, ...agrupadas }));
    setAnexosPorMensagem((atual) => (substituir ? links : { ...atual, ...links }));
  }

  /** Só o que mudou desde a última leitura (mensagem nova, status de envio, edição, exclusão). */
  async function carregarNovidadesDaConversa(conversationId: string) {
    const desde = sincronizadoAteRef.current;
    if (!desde || Date.now() - linksAssinadosEmRef.current > RENOVAR_LINKS_APOS_MS) {
      await carregarMensagens(conversationId, { limpar: false });
      return;
    }
    const { data } = await supabase
      .from("messages")
      .select(SELECT_MENSAGEM)
      .eq("conversation_id", conversationId)
      .gt("updated_at", desde)
      .order("created_at", { ascending: true })
      .limit(500);
    if (conversaPedidaRef.current !== conversationId || !data || data.length === 0) return;

    const mudadas = data as unknown as MensagemComAutor[];
    registrarSincronizacao(mudadas);
    setMensagens((atual) => {
      const porId = new Map((atual ?? []).map((m) => [m.id, m]));
      for (const m of mudadas) porId.set(m.id, m);
      return [...porId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
    // Arquivo só das mensagens que ainda não têm link — as que já têm continuam tocando sem recarregar.
    await carregarExtras(conversationId, mudadas, { pularMidiaComLink: true });
  }

  const buscarNaConversa = useCallback(
    async (termo: string): Promise<ResultadoBusca[]> => {
      if (!selecionadaId) return [];
      const { data } = await supabase
        .from("messages")
        .select(SELECT_MENSAGEM)
        .eq("conversation_id", selecionadaId)
        .ilike("body", `%${termo.replace(/[%_]/g, "")}%`)
        .order("created_at", { ascending: false })
        .limit(30);
      return ((data ?? []) as unknown as MensagemComAutor[]).map((m) => ({
        id: m.id,
        texto: m.body ?? "",
        autor: m.direction === "entrada" ? "Cliente" : m.is_internal_note ? `Nota · ${remetenteDe(m)}` : remetenteDe(m),
        quando: m.created_at,
      }));
    },
    [supabase, selecionadaId],
  );

  /** Leva a conversa até uma mensagem; se ela é antiga e não está carregada, carrega a partir dela. */
  async function irPara(id: string) {
    const conversationId = selecionadaId;
    if (!conversationId) return;
    setBuscaNaConversaAberta(false);
    grudadoNoFimRef.current = false;
    if (!mensagens?.some((m) => m.id === id)) {
      const { data: alvo } = await supabase.from("messages").select("created_at").eq("id", id).maybeSingle();
      if (!alvo) return;
      const [antes, depois] = await Promise.all([
        supabase.from("messages").select(SELECT_MENSAGEM).eq("conversation_id", conversationId).lt("created_at", alvo.created_at).order("created_at", { ascending: false }).limit(50),
        supabase.from("messages").select(SELECT_MENSAGEM).eq("conversation_id", conversationId).gte("created_at", alvo.created_at).order("created_at", { ascending: true }).limit(400),
      ]);
      if (conversaPedidaRef.current !== conversationId) return;
      const lista = [
        ...(((antes.data ?? []) as unknown as MensagemComAutor[]).reverse()),
        ...((depois.data ?? []) as unknown as MensagemComAutor[]),
      ];
      setMensagens(lista);
      setTemMensagensAnteriores((antes.data?.length ?? 0) === 50);
      registrarSincronizacao(lista);
      linksAssinadosEmRef.current = Date.now();
      await carregarExtras(conversationId, lista, { substituir: true });
    }
    irAteMensagem(id, setDestaqueId);
  }

  function autorDaMensagem(m: MensagemComAutor) {
    if (m.direction === "entrada") return conversaSelecionada?.contact?.display_name ?? "Cliente";
    return m.is_internal_note ? `${remetenteDe(m)} (nota)` : remetenteDe(m);
  }

  async function carregarMensagensAnteriores() {
    const conversationId = selecionadaId;
    const primeira = mensagens?.[0];
    if (!conversationId || !primeira || carregandoAnteriores) return;
    setCarregandoAnteriores(true);
    const { data, error } = await supabase
      .from("messages")
      .select(SELECT_MENSAGEM)
      .eq("conversation_id", conversationId)
      .lt("created_at", primeira.created_at)
      .order("created_at", { ascending: false })
      .limit(POR_PAGINA_MENSAGENS);
    setCarregandoAnteriores(false);
    if (conversaPedidaRef.current !== conversationId) return;
    if (error) {
      mostrarAviso(`Não foi possível carregar as mensagens anteriores: ${error.message}`);
      return;
    }
    const antigas = ((data ?? []) as unknown as MensagemComAutor[]).reverse();
    const area = areaMensagensRef.current;
    if (area) ajusteRolagemRef.current = { altura: area.scrollHeight, topo: area.scrollTop };
    grudadoNoFimRef.current = false;
    setMensagens((atual) => [...antigas, ...(atual ?? [])]);
    setTemMensagensAnteriores(antigas.length === POR_PAGINA_MENSAGENS);
    registrarSincronizacao(antigas);
    await carregarExtras(conversationId, antigas);
  }

  useEffect(() => {
    setLimiteLista(POR_PAGINA_LISTA);
  }, [aba, subFiltro, buscaAplicada]);

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
    const ajuste = ajusteRolagemRef.current;
    const area = areaMensagensRef.current;
    if (ajuste && area) {
      area.scrollTop = ajuste.topo + (area.scrollHeight - ajuste.altura);
      ajusteRolagemRef.current = null;
      return;
    }
    rolarParaOFim();
  }, [mensagens, anexosPorMensagem]);

  useEffect(() => {
    if (selecionadaId) carregarMensagens(selecionadaId);
  }, [selecionadaId, carregarMensagens]);

  // Não abre conversa sozinho ao entrar ou recarregar (pedido do Gabriel, 02/10/2026: consultores viam a
  // 1ª conversa aberta e achavam que ela tinha sido lida). Conversa só abre com clique (ou link de aviso).

  function voltarParaLista() {
    abertaPeloDonoRef.current = null;
    conversaPedidaRef.current = null;
    setSelecionadaId(null);
  }

  // Atualização automática. A função mais nova fica num ref, então o intervalo não precisa ser
  // recriado a cada mudança de tela.
  const atualizarAgoraRef = useRef<() => Promise<void>>(async () => {});
  atualizarAgoraRef.current = async () => {
    if (editandoId) return; // não mexe na conversa enquanto alguém edita uma mensagem
    await Promise.all([
      carregarConversas({ silencioso: true }),
      carregarContagensAbas(),
      // Fila de envio do WhatsApp: o que falhou na hora é re-tentado aqui (não há worker separado).
      despacharPendentesAction().catch(() => 0),
      selecionadaId ? carregarNovidadesDaConversa(selecionadaId) : Promise.resolve(),
    ]);
  };
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void atualizarAgoraRef.current();
    };
    const intervalo = window.setInterval(tick, INTERVALO_ATUALIZACAO_MS);
    // Voltou pra aba do navegador: atualiza na hora, sem esperar o próximo ciclo.
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // Conversa aberta agora — o avisador não apita mensagem nova da conversa que a pessoa já está vendo.
  useEffect(() => {
    definirFoco(selecionadaId ? `c:${selecionadaId}` : null);
    return () => definirFoco(null);
  }, [selecionadaId]);

  useEffect(() => {
    if (!transferenciaAberta) return;
    const fecharSeFora = (evento: MouseEvent) => {
      if (transferenciaRef.current && !transferenciaRef.current.contains(evento.target as Node)) setTransferenciaAberta(false);
    };
    const fecharNoEsc = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setTransferenciaAberta(false);
    };
    document.addEventListener("mousedown", fecharSeFora);
    document.addEventListener("keydown", fecharNoEsc);
    return () => {
      document.removeEventListener("mousedown", fecharSeFora);
      document.removeEventListener("keydown", fecharNoEsc);
    };
  }, [transferenciaAberta]);

  useEffect(() => {
    supabase
      .from("user_profiles")
      .select("id, full_name, business_area")
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
    abertaPeloDonoRef.current = conversa.assigned_user_profile_id === userProfileId ? conversa.id : null;
    if (conversa.assigned_user_profile_id !== userProfileId || conversa.unread_count === 0) return;
    setConversas((atual) => atual?.map((c) => (c.id === conversa.id ? { ...c, unread_count: 0 } : c)) ?? atual);
    void marcarConversaComoLidaAction(conversa.id);
  }

  // A conversa aberta pode sair da lista (ex: filtro "Não lidas" depois de lida, ou busca apagada):
  // o painel continua mostrando ela em vez de ficar em branco.
  const [conversaFixada, setConversaFixada] = useState<ConversaLista | null>(null);
  const conversaDaLista = conversas?.find((c) => c.id === selecionadaId) ?? null;
  useEffect(() => {
    if (conversaDaLista) setConversaFixada(conversaDaLista);
  }, [conversaDaLista]);
  const conversaSelecionada = conversaDaLista ?? (conversaFixada?.id === selecionadaId ? conversaFixada : null);

  // Clique num aviso (/atendimento?c=<id>): abre aquela conversa, mesmo que não esteja na lista carregada.
  // Conta como "o dono abriu" — a pessoa clicou pra ver.
  const conversaPedidaNaUrl = useSearchParams().get("c");
  async function abrirConversaPorId(id: string, deveContinuar: () => boolean = () => true) {
    const { data } = await supabase
      .from("conversations")
      .select(SELECT_CONVERSAS)
      .eq("id", id)
      .eq("ultima_mensagem.is_internal_note", false)
      .order("created_at", { referencedTable: "ultima_mensagem", ascending: false })
      .limit(1, { referencedTable: "ultima_mensagem" })
      .maybeSingle();
    if (!deveContinuar() || !data) return;
    const conversa = data as unknown as ConversaLista;
    setConversaFixada(conversa);
    abrirConversa(conversa);
  }
  useEffect(() => {
    if (!conversaPedidaNaUrl) return;
    let cancelado = false;
    void abrirConversaPorId(conversaPedidaNaUrl, () => !cancelado);
    // Tira o "?c=" do endereço: recarregar a página depois não reabre (nem marca como lida) essa conversa.
    const url = new URL(window.location.href);
    url.searchParams.delete("c");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaPedidaNaUrl]);
  // Conversa do Totalk (canal sem WhatsApp ligado ao CRM): o envio é bloqueado no servidor; a tela já
  // deixa só "Nota interna", pra ninguém digitar uma resposta e só depois descobrir que não sai.
  const semWhatsApp = conversaSelecionada ? conversaSelecionada.channel?.provider !== "evolution" : false;
  const emModoNota = modoNota || semWhatsApp;
  // Quem pode escrever (mensagem e nota): gerente/admin/master, Jurídico, o responsável — ou conversa sem
  // responsável (aí o banco decide pela equipe). Comercial lendo conversa de outro (pela busca) só lê.
  const podeEscrever = conversaSelecionada
    ? isAdminOuManager ||
      isPlatformOwner ||
      areaJuridica ||
      conversaSelecionada.assigned_user_profile_id === null ||
      conversaSelecionada.assigned_user_profile_id === userProfileId
    : false;

  useEffect(() => {
    if (gravandoDesde === null) return;
    const id = window.setInterval(() => setRelogioGravacao(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [gravandoDesde]);

  // Dono com a conversa aberta: mensagem nova que a atualização automática trouxe já conta como vista.
  useEffect(() => {
    const c = conversaDaLista;
    if (!c || abertaPeloDonoRef.current !== c.id || c.assigned_user_profile_id !== userProfileId || c.unread_count === 0) return;
    if (document.visibilityState !== "visible") return;
    setConversas((atual) => atual?.map((x) => (x.id === c.id ? { ...x, unread_count: 0 } : x)) ?? atual);
    void marcarConversaComoLidaAction(c.id);
  }, [conversaDaLista, userProfileId]);

  /** Contagem de cada sub-filtro dentro da aba atual — computada da lista já carregada, sem round-trip novo. */
  const contagensSubFiltro: Record<SubFiltro, number | null> = {
    todas: contagensAbas[aba],
    nao_lidas: naoLidasPorAba[aba],
    // Só dá pra contar olhando quem falou por último — mostra quando o filtro está aberto.
    aguardando_resposta: subFiltro === "aguardando_resposta" && conversas ? conversas.filter(aguardandoResposta).length : null,
  };

  const ehContatoNovo = useCallback((c: ConversaLista) => c.unread_count > 0 && contatosNovos.has(c.id), [contatosNovos]);

  const conversasFiltradas = useMemo(() => {
    if (!conversas) return [];
    // Conversa recém-transferida fica no topo até o responsável abrir (pedido do Gabriel, 02/10/2026).
    let lista = contatosNovos.size === 0 ? conversas : [...conversas.filter(ehContatoNovo), ...conversas.filter((c) => !ehContatoNovo(c))];

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
  }, [conversas, busca, subFiltro, aba, contatosNovos.size, ehContatoNovo]);

  async function handleEditarMensagem(messageId: string, texto: string) {
    if (!selecionadaId) return;
    const resultado = await editarMensagemAction(messageId, texto);
    mostrarAviso(resultado.message);
    if (resultado.ok) {
      setEditandoId(null);
      await Promise.all([carregarNovidadesDaConversa(selecionadaId), carregarExtras(selecionadaId, mensagens?.filter((m) => m.id === messageId) ?? [])]);
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
    if (resultado.ok) {
      await Promise.all([carregarNovidadesDaConversa(selecionadaId), carregarExtras(selecionadaId, [mensagem])]);
    }
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
    const resultado = emModoNota
      ? await criarNotaInternaAction(selecionadaId, texto, respondendo?.id ?? null)
      : await enviarMensagemAction(selecionadaId, texto, crypto.randomUUID(), respondendo?.id ?? null);
    setEnviando(false);
    mostrarAviso(resultado.message);

    if (resultado.ok) {
      setRascunhos((atual) => ({ ...atual, [selecionadaId]: "" }));
      setRespondendo(null);
      grudadoNoFimRef.current = true;
      // Tudo ao mesmo tempo (antes: uma consulta esperando a outra, ~3x mais lento).
      await Promise.all([carregarNovidadesDaConversa(selecionadaId), carregarConversas({ silencioso: true }), carregarContagensAbas()]);
    }
  }

  /** Sobe o arquivo direto do navegador pro Storage e manda pro cliente pelo WhatsApp. */
  async function enviarArquivo(conversationId: string, arquivo: File, legenda = "") {
    setEnviando(true);
    setStatusEnvio(arquivo.type.startsWith("audio/") ? "Enviando áudio..." : `Enviando "${arquivo.name}"...`);
    try {
      const preparo = await prepararEnvioAnexoAction(conversationId, arquivo.name, arquivo.size);
      if (!preparo.ok || !preparo.caminho || !preparo.token) throw new Error(preparo.message);
      const tipo = arquivo.type || "application/octet-stream";
      const { error } = await supabase.storage
        .from("atendimento-anexos")
        .uploadToSignedUrl(preparo.caminho, preparo.token, arquivo, { contentType: tipo });
      if (error) throw new Error(error.message);
      const resultado = await enviarAnexoAction(
        conversationId,
        { caminho: preparo.caminho, nome: arquivo.name, tipo, tamanho: arquivo.size },
        crypto.randomUUID(),
        legenda,
        respondendo?.id ?? null,
      );
      mostrarAviso(resultado.message);
      if (!resultado.ok) return false;
      setRespondendo(null);
      grudadoNoFimRef.current = true;
      await Promise.all([carregarNovidadesDaConversa(conversationId), carregarConversas({ silencioso: true })]);
      return true;
    } catch (erro) {
      mostrarAviso(`Não enviou: ${erro instanceof Error ? erro.message : "erro"}`);
      return false;
    } finally {
      setEnviando(false);
      setStatusEnvio(null);
    }
  }

  async function handleArquivosEscolhidos(lista: FileList | File[]) {
    const conversationId = selecionadaId;
    if (!conversationId || lista.length === 0) return;
    if (!podeEscrever) return mostrarAviso("Você só pode ler esta conversa.");
    if (emModoNota) {
      return mostrarAviso(semWhatsApp ? "WhatsApp ainda não ligado a este número: não dá pra enviar arquivo." : "Arquivo vai pro cliente: troque para \"Mensagem\" antes.");
    }
    const arquivos = Array.from(lista);
    // O texto digitado vai junto, como legenda do primeiro arquivo (igual ao WhatsApp).
    const legenda = (rascunhos[conversationId] ?? "").trim();
    const nomes = arquivos.map((a) => a.name).join(", ");
    if (!window.confirm(`Enviar para o cliente: ${nomes}?${legenda ? `\n\nCom a legenda: "${legenda}"` : ""}`)) return;
    // A legenda sai do campo na hora (como no WhatsApp); se o 1º arquivo falhar, volta pro campo.
    if (legenda) setRascunhos((atual) => ({ ...atual, [conversationId]: "" }));
    for (const [indice, arquivo] of arquivos.entries()) {
      const ok = await enviarArquivo(conversationId, arquivo, indice === 0 ? legenda : "");
      if (!ok) {
        if (indice === 0 && legenda) setRascunhos((atual) => ({ ...atual, [conversationId]: atual[conversationId] || legenda }));
        break;
      }
    }
  }

  async function iniciarGravacao() {
    const conversationId = selecionadaId;
    if (!conversationId) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      mostrarAviso("Este navegador não grava áudio.");
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
        // Vai pra conversa onde a gravação começou, mesmo que a pessoa tenha trocado de conversa.
        void enviarArquivo(conversationId, new File(pedacos, `audio-${hora}.${extensao}`, { type: tipo }));
      };
      gravadorRef.current = controle;
      gravador.start();
      setGravandoDesde(Date.now());
      setRelogioGravacao(Date.now());
    } catch {
      mostrarAviso("Sem permissão pro microfone — libere no cadeado ao lado do endereço do site.");
    }
  }

  function pararGravacao(cancelar: boolean) {
    const atual = gravadorRef.current;
    if (!atual) return;
    atual.cancelar = cancelar;
    atual.gravador.stop();
  }

  async function atualizarListaEContagens() {
    await Promise.all([carregarConversas({ silencioso: true }), carregarContagensAbas()]);
  }

  async function handleAssumir() {
    if (!selecionadaId) return;
    const resultado = await assumirConversaAction(selecionadaId);
    mostrarAviso(resultado.message);
    await atualizarListaEContagens();
  }

  async function handleTransferir(usuario: UsuarioEmpresa) {
    if (!selecionadaId) return;
    setTransferenciaAberta(false);
    const setorDestino = usuario.business_area ? ROTULO_SETOR[usuario.business_area] : null;
    if (!window.confirm(`Transferir esta conversa para ${usuario.full_name ?? "este usuário"}${setorDestino ? ` (${setorDestino})` : ""}?`)) return;
    const resultado = await transferirConversaAction(selecionadaId, usuario.id, null);
    mostrarAviso(resultado.message);
    await atualizarListaEContagens();
  }

  async function handleConcluirOuReabrir() {
    if (!selecionadaId || !conversaSelecionada) return;
    const resultado =
      conversaSelecionada.status === "encerrada"
        ? await reabrirConversaAction(selecionadaId)
        : await concluirConversaAction(selecionadaId);
    mostrarAviso(resultado.message);
    await atualizarListaEContagens();
  }

  async function handleReenviar(messageId: string) {
    if (!selecionadaId) return;
    const resultado = await reenviarMensagemFalhadaAction(messageId, selecionadaId);
    mostrarAviso(resultado.message);
    await carregarNovidadesDaConversa(selecionadaId);
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* Celular: lista e conversa são duas telas (abre a conversa → some a lista; "voltar" → lista). */}
      <div className={`${conversaSelecionada ? "hidden lg:flex" : "flex"} h-full w-full shrink-0 flex-col border-r border-[var(--ns-border)] lg:w-[300px]`}>
        <div className="border-b border-[var(--ns-border)] px-3 pt-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-[var(--ns-text)]">Atendimento</h1>
            <button
              type="button"
              onClick={() => setNovaConversaAberta(true)}
              title="Nova conversa: iniciar com um número"
              aria-label="Nova conversa"
              className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--ns-primary)] px-2 py-1 text-xs font-medium text-[var(--ns-primary-foreground)] hover:opacity-90"
            >
              <MessageSquarePlus aria-hidden="true" className="h-3.5 w-3.5" /> Nova
            </button>
            <button
              type="button"
              onClick={() => void atualizarAgoraRef.current()}
              title={atualizadoEm ? `Atualiza sozinho a cada 15 s · última vez às ${horaCurta(atualizadoEm.toISOString())}` : "Atualizar"}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-[var(--ns-text-secondary)] transition hover:bg-[var(--ns-surface-hover)] hover:text-[var(--ns-text)]"
            >
              <RefreshCw aria-hidden="true" className="h-3 w-3" />
              {atualizadoEm ? horaCurta(atualizadoEm.toISOString()) : "Atualizar"}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-b border-[var(--ns-border)] p-3">
          <input
            type="search"
            value={busca}
            onChange={(event) => {
              // Começou a buscar: zera os filtros (eles somem enquanto houver busca).
              if (!busca.trim() && event.target.value.trim()) setSubFiltro("todas");
              setBusca(event.target.value);
            }}
            placeholder="Buscar por nome ou telefone..."
            className="w-full rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-2 text-sm text-[var(--ns-text)] outline-none placeholder:text-[var(--ns-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)]"
          />
          {buscaAplicada.trim().length >= 2 && (
            <p className="-mt-1 text-[11px] text-[var(--ns-text-secondary)]">
              Buscando em todas as conversas, sem filtro. Apague a busca para voltar às abas.
            </p>
          )}
          {/* Pergunta 1: de quem é a conversa? "Outros" é o atendimento humano de outro login (atribuído a
              outra pessoa, ou ainda sem ninguém) — não é "a equipe" no sentido de departamento/`teams`,
              porque quem supervisiona pode ver conversa de qualquer equipe aqui, não só a própria. "IA" só
              existe pra quem supervisiona — quem atende comum não vê conversa de ninguém além da própria
              (RLS já garante isso; aqui é só não oferecer a aba). */}
          {!busca.trim() && abasVisiveis.length > 1 && (
          <div className="flex gap-1 rounded-lg bg-[var(--ns-surface-hover)] p-1 text-sm">
            {abasVisiveis.map((valor) => (
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
          )}

          {/* Pergunta 2: o que falta fazer? Não existe pra "IA" — lá ninguém da equipe "lê" ou "responde". */}
          {!busca.trim() && aba !== "ia" && (
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
                  {contagensSubFiltro[filtro.id] !== null && (
                    <span className="ml-1 text-[10px] font-normal text-[var(--ns-text-secondary)]">{contagensSubFiltro[filtro.id]}</span>
                  )}
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
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-[var(--ns-text)]">
                      {conversa.contact?.display_name ?? "Contato sem nome"}
                    </span>
                    {ehContatoNovo(conversa) && (
                      <span className="shrink-0 rounded-full bg-[var(--ns-warning)]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ns-warning)]">
                        Contato novo
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--ns-text-secondary)]">
                    {horaOuData(conversa.last_activity_at)}
                  </span>
                </div>
                <span className="truncate text-xs text-[var(--ns-text-secondary)]">{previaLegivel(conversa.last_message_preview)}</span>
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
          {temMaisConversas && !carregandoLista && (
            <button
              type="button"
              onClick={() => setLimiteLista((atual) => atual + POR_PAGINA_LISTA)}
              className="w-full px-3 py-3 text-center text-xs font-medium text-[var(--ns-primary)] hover:bg-[var(--ns-surface-hover)]"
            >
              Carregar mais conversas
            </button>
          )}
        </div>
      </div>

      <div
        className={`${conversaSelecionada ? "flex" : "hidden lg:flex"} @container relative h-full min-w-0 flex-1 flex-col lg:min-w-[420px]`}
        onDragOver={(event) => {
          if (!conversaSelecionada || !event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setArrastandoArquivo(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setArrastandoArquivo(false);
        }}
        onDrop={(event) => {
          if (!conversaSelecionada || event.dataTransfer.files.length === 0) return;
          event.preventDefault();
          setArrastandoArquivo(false);
          void handleArquivosEscolhidos(Array.from(event.dataTransfer.files));
        }}
      >
        {arrastandoArquivo && (
          <div className="pointer-events-none absolute inset-2 z-40 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--ns-primary)] bg-[var(--ns-surface)]/90 text-sm font-medium text-[var(--ns-primary)]">
            <Upload aria-hidden="true" className="h-6 w-6" />
            {podeEscrever && !emModoNota ? "Solte aqui para enviar ao cliente" : "Não dá pra enviar arquivo nesta conversa"}
          </div>
        )}
        {!conversaSelecionada ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--ns-text-secondary)]">
            Selecione uma conversa.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-[var(--ns-border)] px-2 py-2 @lg:gap-3 @lg:px-4 @lg:py-3">
              <div className="flex min-w-0 flex-1 items-center gap-2 @lg:gap-3">
                <button
                  type="button"
                  onClick={voltarParaLista}
                  aria-label="Voltar para a lista"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)] lg:hidden"
                >
                  <ArrowLeft aria-hidden="true" className="h-5 w-5" />
                </button>
                <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ns-primary)]/15 text-sm font-semibold text-[var(--ns-primary)] @lg:flex">
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
                    {setorDaConversa(conversaSelecionada) ? ` · ${setorDaConversa(conversaSelecionada)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 @lg:gap-2">
                <span className="hidden @3xl:inline-flex">
                  <EstadoBadge estado={STATUS_PARA_BADGE[conversaSelecionada.status]} />
                </span>
                <button
                  type="button"
                  onClick={() => setBuscaNaConversaAberta((v) => !v)}
                  title="Buscar nesta conversa"
                  aria-label="Buscar nesta conversa"
                  className={`hidden h-8 w-8 items-center justify-center rounded-lg border border-[var(--ns-border)] text-[var(--ns-text)] transition hover:bg-[var(--ns-surface-hover)] @md:inline-flex ${buscaNaConversaAberta ? "bg-[var(--ns-surface-hover)]" : ""}`}
                >
                  <Search aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
                {!conversaSelecionada.assigned_user_profile_id && (
                  <button
                    type="button"
                    onClick={handleAssumir}
                    title="Assumir"
                    className="hidden h-8 items-center gap-1.5 rounded-lg border border-[var(--ns-border)] px-2 text-xs font-medium text-[var(--ns-text)] transition hover:bg-[var(--ns-surface-hover)] @md:inline-flex @4xl:px-3"
                  >
                    <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
                    <span className="hidden @4xl:inline">Assumir</span>
                  </button>
                )}
                {podeTransferir && (
                <div className="relative hidden @md:block" ref={transferenciaRef}>
                  <button
                    type="button"
                    onClick={() => setTransferenciaAberta((v) => !v)}
                    title="Transferir"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ns-border)] px-2 text-xs font-medium text-[var(--ns-text)] transition hover:bg-[var(--ns-surface-hover)] @4xl:px-3"
                  >
                    <Users2 aria-hidden="true" className="h-3.5 w-3.5" />
                    <span className="hidden @4xl:inline">Transferir</span>
                  </button>
                  {transferenciaAberta && (
                    <div className="absolute right-0 z-30 mt-1 max-h-[60vh] w-56 overflow-y-auto rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-1.5 shadow-lg">
                      <ListaTransferencia
                        usuarios={usuariosEmpresa}
                        responsavelAtual={conversaSelecionada.assigned_user_profile_id}
                        onEscolher={(u) => void handleTransferir(u)}
                      />
                    </div>
                  )}
                </div>
                )}
                <button
                  type="button"
                  onClick={handleConcluirOuReabrir}
                  className="h-8 shrink-0 rounded-lg bg-[var(--ns-primary)] px-2.5 text-xs font-medium text-[var(--ns-primary-foreground)] transition hover:opacity-90 @lg:px-3"
                >
                  {conversaSelecionada.status === "encerrada" ? "Reabrir" : "Concluir"}
                </button>
                <div className="relative @md:hidden">
                  <button
                    type="button"
                    onClick={() => setMenuMaisAberto((v) => !v)}
                    aria-label="Mais ações"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ns-border)] text-[var(--ns-text)]"
                  >
                    <MoreVertical aria-hidden="true" className="h-4 w-4" />
                  </button>
                  {menuMaisAberto && (
                    <>
                      <button type="button" aria-label="Fechar menu" onClick={() => setMenuMaisAberto(false)} className="fixed inset-0 z-30 cursor-default" />
                      <div className="absolute right-0 z-40 mt-1 max-h-[70vh] w-60 overflow-y-auto rounded-xl border border-[var(--ns-border)] bg-[var(--ns-surface)] p-1.5 text-sm shadow-xl">
                        <button
                          type="button"
                          onClick={() => {
                            setMenuMaisAberto(false);
                            setBuscaNaConversaAberta(true);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]"
                        >
                          <Search aria-hidden="true" className="h-4 w-4" /> Buscar nesta conversa
                        </button>
                        {!conversaSelecionada.assigned_user_profile_id && (
                          <button
                            type="button"
                            onClick={() => {
                              setMenuMaisAberto(false);
                              void handleAssumir();
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]"
                          >
                            <UserPlus aria-hidden="true" className="h-4 w-4" /> Assumir conversa
                          </button>
                        )}
                        {podeTransferir && (
                          <>
                            <p className="flex items-center gap-2 px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ns-text-secondary)]">
                              <Users2 aria-hidden="true" className="h-3.5 w-3.5" /> Transferir para
                            </p>
                            <ListaTransferencia
                              grande
                              usuarios={usuariosEmpresa}
                              responsavelAtual={conversaSelecionada.assigned_user_profile_id}
                              onEscolher={(u) => {
                                setMenuMaisAberto(false);
                                void handleTransferir(u);
                              }}
                            />
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPainelAberto(true)}
                  title="Dados do cliente e do atendimento"
                  aria-label="Dados do cliente e do atendimento"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ns-border)] text-[var(--ns-text)] transition hover:bg-[var(--ns-surface-hover)] xl:hidden"
                >
                  <Info aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {buscaNaConversaAberta && (
              <BuscaNaConversa onBuscar={buscarNaConversa} onIr={(id) => void irPara(id)} onFechar={() => setBuscaNaConversaAberta(false)} />
            )}

            <div
              ref={areaMensagensRef}
              onScroll={(evento) => {
                const area = evento.currentTarget;
                grudadoNoFimRef.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
              }}
              // "load" de imagem/vídeo não borbulha — captura pega quando a mídia termina e muda a altura.
              onLoadCapture={rolarParaOFim}
              onLoadedMetadataCapture={rolarParaOFim}
              className="flex-1 space-y-3 overflow-y-auto px-2 py-3 sm:px-4 sm:py-4"
            >
              {erroMensagens && (
                <p className="mx-auto max-w-md rounded-lg border border-[var(--ns-danger)]/40 bg-[var(--ns-danger)]/10 px-3 py-2 text-xs text-[var(--ns-danger)]">
                  {erroMensagens}
                </p>
              )}
              {mensagens === null && !erroMensagens && (
                <p className="text-center text-sm text-[var(--ns-text-secondary)]">Carregando mensagens...</p>
              )}
              {mensagens?.length === 0 && (
                <p className="text-center text-sm text-[var(--ns-text-secondary)]">Nenhuma mensagem ainda.</p>
              )}
              {temMensagensAnteriores && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={carregarMensagensAnteriores}
                    disabled={carregandoAnteriores}
                    className="rounded-full border border-[var(--ns-border)] px-3 py-1 text-xs text-[var(--ns-text-secondary)] transition hover:bg-[var(--ns-surface-hover)] disabled:opacity-50"
                  >
                    {carregandoAnteriores ? "Carregando..." : "Carregar mensagens anteriores"}
                  </button>
                </div>
              )}
              {mensagens?.map((mensagem, indice) => {
                const anterior = indice > 0 ? mensagens[indice - 1] : null;
                const separadorDia =
                  !anterior || new Date(anterior.created_at).toDateString() !== new Date(mensagem.created_at).toDateString() ? (
                    <div className="sticky top-0 z-[1] flex justify-center py-1">
                      <span className="rounded-full bg-[var(--ns-surface-hover)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ns-text-secondary)] shadow-sm">
                        {rotuloDia(mensagem.created_at)}
                      </span>
                    </div>
                  ) : null;
                const revisoes = revisoesPorMensagem[mensagem.id] ?? [];
                const apagada = Boolean(mensagem.deleted_at);
                const { podeEditar, podeApagar } = permissoesDaMensagem(mensagem, {
                  userProfileId,
                  podeApagarDeOutros: isAdminOuManager || isPlatformOwner,
                  canalProvider: conversaSelecionada?.channel?.provider ?? null,
                });
                const editando = editandoId === mensagem.id;
                const citada = mensagem.reply_to_message_id ? (mensagens.find((m) => m.id === mensagem.reply_to_message_id) ?? null) : null;
                const destacada = destaqueId === mensagem.id ? "ring-2 ring-[var(--ns-primary)] ring-offset-2 ring-offset-[var(--ns-bg)]" : "";

                if (mensagem.is_internal_note) {
                  return (
                    <Fragment key={mensagem.id}>
                    {separadorDia}
                    <div
                      id={`msg-${mensagem.id}`}
                      className={`mx-auto flex max-w-md items-start gap-2 rounded-lg border px-3 py-2 text-xs text-[var(--ns-text)] transition ${destacada} ${
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
                        {mensagem.reply_to_message_id && (
                          <CitacaoNaBolha
                            autor={citada ? autorDaMensagem(citada) : "Mensagem anterior"}
                            texto={citada?.body ?? "Toque para ver"}
                            claro={false}
                            onClick={() => void irPara(mensagem.reply_to_message_id!)}
                          />
                        )}
                        {editando ? (
                          <EditorMensagem
                            textoInicial={mensagem.body ?? ""}
                            onSalvar={(texto) => handleEditarMensagem(mensagem.id, texto)}
                            onCancelar={() => setEditandoId(null)}
                          />
                        ) : (
                          <p className={`whitespace-pre-wrap break-words text-[var(--ns-text-secondary)] ${apagada ? "italic opacity-80" : ""}`}>{corpoSemAssinaturaAntiga(mensagem)}</p>
                        )}
                        <HistoricoRevisoes revisoes={revisoes} claro={false} />
                        <p className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] text-[var(--ns-text-secondary)]">
                          {!apagada && <BotaoResponder claro={false} onClick={() => setRespondendo(mensagem)} />}
                          {remetenteDe(mensagem)} · {horaCurta(mensagem.created_at)}
                        </p>
                      </div>
                    </div>
                    </Fragment>
                  );
                }

                const doCliente = mensagem.direction === "entrada";
                return (
                  <Fragment key={mensagem.id}>
                  {separadorDia}
                  <div className={`flex flex-col ${doCliente ? "items-start" : "items-end"}`}>
                    {/* Quem enviou — nunca fica implícito: nome de quem atendeu, ou "IA" quando foi o
                        assistente. Cliente não precisa de rótulo: só existe uma pessoa do lado esquerdo. */}
                    {!doCliente && (
                      <span className="mb-0.5 flex items-center gap-1 px-1 text-[10px] font-medium text-[var(--ns-text-secondary)]">
                        {mensagem.author_type === "ia" && <Bot aria-hidden="true" className="h-3 w-3" />}
                        {remetenteDe(mensagem)}
                      </span>
                    )}
                    <div
                      id={`msg-${mensagem.id}`}
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm transition md:max-w-[70%] ${destacada} ${
                        apagada
                          ? "border border-dashed border-[var(--ns-danger)]/60 bg-[var(--ns-danger)]/10 text-[var(--ns-text)]"
                          : doCliente
                            ? "bg-[var(--ns-surface-hover)] text-[var(--ns-text)]"
                            : "bg-[var(--ns-primary)] text-[var(--ns-primary-foreground)]"
                      }`}
                    >
                      {apagada && <AvisoMensagemApagada mensagem={mensagem} revisoes={revisoes} />}
                      {mensagem.reply_to_message_id && (
                        <CitacaoNaBolha
                          autor={citada ? autorDaMensagem(citada) : "Mensagem anterior"}
                          texto={citada?.body ?? "Toque para ver"}
                          claro={!doCliente && !apagada}
                          onClick={() => void irPara(mensagem.reply_to_message_id!)}
                        />
                      )}
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
                            className={`whitespace-pre-wrap break-words ${TIPOS_COM_ARQUIVO.has(mensagem.message_type) ? "mt-1" : ""} ${apagada ? "italic opacity-80" : ""}`}
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
                        {!apagada && <BotaoResponder claro={!doCliente} onClick={() => setRespondendo(mensagem)} />}
                        <AcoesMensagem
                          podeEditar={podeEditar && !editando}
                          podeApagar={podeApagar && !editando}
                          ehNota={false}
                          claro={!doCliente && !apagada}
                          onEditar={() => setEditandoId(mensagem.id)}
                          onApagar={() => handleApagarMensagem(mensagem)}
                        />
                        <span>{horaCurta(mensagem.created_at)}</span>
                        {/* ✓ enviada · ✓✓ entregue · ✓✓ azul lida pelo cliente (status que o WhatsApp devolve) */}
                        {!doCliente && (mensagem.status === "enviada" || mensagem.status === "entregue" || mensagem.status === "lida") && (
                          <Tiques estado={mensagem.status} claro={!apagada} />
                        )}
                      </div>
                    </div>
                  </div>
                  </Fragment>
                );
              })}
            </div>

            {aviso && (
              <div className="px-4 pb-1 text-xs text-[var(--ns-text-secondary)]" role="status">
                {aviso}
              </div>
            )}

            {!podeEscrever ? (
              <div className="flex items-center gap-2 border-t border-[var(--ns-border)] bg-[var(--ns-surface-hover)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-xs text-[var(--ns-text-secondary)]">
                <Eye aria-hidden="true" className="h-4 w-4 shrink-0" />
                Somente leitura: esta conversa é de {nomeResponsavel(conversaSelecionada, "outra pessoa")}. Para escrever, peça ao gerente para transferir.
              </div>
            ) : (
            <form onSubmit={handleEnviar} className="border-t border-[var(--ns-border)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3">
              {respondendo && (
                <BarraCitando autor={autorDaMensagem(respondendo)} texto={respondendo.body} onCancelar={() => setRespondendo(null)} />
              )}
              {semWhatsApp && (
                <p className="mb-2 rounded-lg bg-[var(--ns-surface-hover)] px-2.5 py-1.5 text-[11px] text-[var(--ns-text-secondary)]">
                  WhatsApp ainda não ligado ao CRM: aqui só nota interna. Responda o cliente pelo Totalk.
                </p>
              )}
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModoNota(false)}
                  disabled={semWhatsApp}
                  title={semWhatsApp ? "WhatsApp ainda não conectado ao CRM" : undefined}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${!emModoNota ? "bg-[var(--ns-primary)]/15 text-[var(--ns-primary)]" : "text-[var(--ns-text-secondary)]"}`}
                >
                  Mensagem
                </button>
                <button
                  type="button"
                  onClick={() => setModoNota(true)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium ${emModoNota ? "bg-[var(--ns-warning)]/15 text-[var(--ns-warning)]" : "text-[var(--ns-text-secondary)]"}`}
                >
                  Nota interna
                </button>
                <span className="ml-auto hidden text-[10px] text-[var(--ns-text-secondary)] md:inline">Enter envia · Shift+Enter pula linha</span>
              </div>
              {statusEnvio && <p className="mb-2 text-xs text-[var(--ns-text-secondary)]" role="status">{statusEnvio}</p>}
              {gravandoDesde !== null ? (
                <div className="flex items-center gap-3 rounded-lg border border-[var(--ns-danger)]/40 bg-[var(--ns-danger)]/10 px-3 py-2 text-sm text-[var(--ns-text)]">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--ns-danger)]" />
                  Gravando {Math.floor(Math.max(0, relogioGravacao - gravandoDesde) / 60000)}:
                  {String(Math.floor((Math.max(0, relogioGravacao - gravandoDesde) / 1000) % 60)).padStart(2, "0")}
                  <button
                    type="button"
                    onClick={() => pararGravacao(true)}
                    className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--ns-text-secondary)] hover:text-[var(--ns-danger)]"
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" /> Descartar
                  </button>
                  <button
                    type="button"
                    onClick={() => pararGravacao(false)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--ns-primary)] px-2.5 py-1.5 text-xs font-medium text-[var(--ns-primary-foreground)]"
                  >
                    <Square aria-hidden="true" className="h-3 w-3" /> Parar e enviar
                  </button>
                </div>
              ) : (
              <div className="flex items-end gap-2">
                {!emModoNota && (
                  <>
                    <input
                      ref={entradaArquivoRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(e) => {
                        if (e.target.files) void handleArquivosEscolhidos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => entradaArquivoRef.current?.click()}
                      disabled={enviando}
                      title="Enviar foto, vídeo ou arquivo"
                      aria-label="Enviar foto, vídeo ou arquivo"
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--ns-border)] text-[var(--ns-text-secondary)] hover:bg-[var(--ns-surface-hover)] disabled:opacity-50 md:h-9 md:w-9"
                    >
                      <Paperclip aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </>
                )}
                <textarea
                  value={rascunhos[selecionadaId ?? ""] ?? ""}
                  onChange={(event) =>
                    setRascunhos((atual) => ({ ...atual, [selecionadaId ?? ""]: event.target.value }))
                  }
                  onPaste={(event) => {
                    // Imagem/arquivo copiado (print, arquivo do Explorer): envia como no WhatsApp.
                    const colados = Array.from(event.clipboardData.files);
                    if (colados.length === 0) return;
                    event.preventDefault();
                    void handleArquivosEscolhidos(colados);
                  }}
                  onKeyDown={(event) => {
                    // No celular, Enter pula linha (o teclado do celular não tem Shift fácil) — envia pelo botão.
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !ehTelaDeCelular()) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={Math.min(5, Math.max(1, (rascunhos[selecionadaId ?? ""] ?? "").split("\n").length))}
                  placeholder={emModoNota ? "Escreva uma nota interna..." : "Digite uma mensagem..."}
                  className={`min-w-0 flex-1 resize-none rounded-lg border bg-[var(--ns-surface)] px-3 py-2 text-base text-[var(--ns-text)] md:text-sm outline-none placeholder:text-[var(--ns-text-secondary)] focus-visible:ring-2 ${
                    emModoNota ? "border-[var(--ns-warning)]/50 focus-visible:ring-[var(--ns-warning)]" : "border-[var(--ns-border)] focus-visible:ring-[var(--ns-primary)]"
                  }`}
                />
                {!emModoNota && !(rascunhos[selecionadaId ?? ""] ?? "").trim() ? (
                  // Campo vazio: o botão vira microfone (como no WhatsApp).
                  <button
                    type="button"
                    onClick={() => void iniciarGravacao()}
                    disabled={enviando}
                    title="Gravar áudio"
                    aria-label="Gravar áudio"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--ns-primary)] text-[var(--ns-primary-foreground)] transition hover:opacity-90 disabled:opacity-50 md:h-9 md:w-9"
                  >
                    <Mic aria-hidden="true" className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={enviando || !(rascunhos[selecionadaId ?? ""] ?? "").trim()}
                    aria-label="Enviar"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--ns-primary)] text-[var(--ns-primary-foreground)] transition hover:opacity-90 disabled:opacity-50 md:h-9 md:w-9"
                  >
                    <Send aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}
              </div>
              )}
            </form>
            )}
          </>
        )}
      </div>

      {novaConversaAberta && (
        <ModalNovaConversa
          supabase={supabase}
          companyId={companyId}
          onFechar={() => setNovaConversaAberta(false)}
          onCriada={async (conversationId, mensagem) => {
            setNovaConversaAberta(false);
            mostrarAviso(mensagem);
            await abrirConversaPorId(conversationId);
            await atualizarListaEContagens();
          }}
        />
      )}

      {painelAberto && (
        <button type="button" aria-label="Fechar painel" onClick={() => setPainelAberto(false)} className="fixed inset-0 z-[64] bg-black/40 xl:hidden" />
      )}
      <aside
        className={`${
          painelAberto ? "fixed inset-y-0 right-0 z-[65] flex w-[min(92vw,360px)] bg-[var(--ns-surface)] shadow-xl" : "hidden"
        } h-full shrink-0 flex-col overflow-y-auto border-l border-[var(--ns-border)] xl:static xl:z-auto xl:flex xl:w-[320px] xl:bg-transparent xl:shadow-none`}
      >
        <div className="flex justify-end px-2 pt-2 xl:hidden">
          <button type="button" onClick={() => setPainelAberto(false)} aria-label="Fechar painel" className="p-1.5 text-[var(--ns-text-secondary)]">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
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
                {conversaSelecionada.external_id && (
                  <span
                    className="rounded-full bg-[var(--ns-surface-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--ns-text-secondary)]"
                    title="Histórico trazido pelo importador do Totalk, não uma conversa iniciada aqui."
                  >
                    Importado do Totalk
                  </span>
                )}
              </div>
              <VinculoCliente
                conversationId={conversaSelecionada.id}
                companyId={companyId}
                clientId={conversaSelecionada.client_id}
                nomeContato={conversaSelecionada.contact?.display_name ?? null}
                telefoneContato={telefoneDoContato(conversaSelecionada.contact)}
                onAlterado={(mensagem) => {
                  mostrarAviso(mensagem);
                  void atualizarListaEContagens();
                }}
              />
            </div>

            <section className="border-b border-[var(--ns-border)] px-4 py-3.5">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ns-text-secondary)]">Atendimento</h3>
              <dl className="space-y-1.5">
                <LinhaFicha rotulo="Status" valor={<EstadoBadge estado={STATUS_PARA_BADGE[conversaSelecionada.status]} />} />
                <LinhaFicha rotulo="Equipe" valor={conversaSelecionada.team?.name ?? "Sem equipe"} />
                <LinhaFicha rotulo="Responsável" valor={nomeResponsavel(conversaSelecionada, "Sem responsável")} />
                <LinhaFicha rotulo="Setor" valor={setorDaConversa(conversaSelecionada) ?? "—"} />
                <LinhaFicha rotulo="Canal" valor={conversaSelecionada.channel?.name ?? "—"} />
                {/* Conversa do Totalk: created_at é o dia da IMPORTAÇÃO, não do atendimento — não mostrar como início. */}
                {!conversaSelecionada.external_id && (
                  <LinhaFicha rotulo="Iniciada em" valor={formatarDataHora(conversaSelecionada.created_at)} />
                )}
                <LinhaFicha rotulo="Última atividade" valor={formatarDataHora(conversaSelecionada.last_activity_at)} />
              </dl>
            </section>


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
        {ROTULO_TIPO[tipo] ?? "Arquivo"} — arquivo não disponível
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

/** Iniciar conversa com um número que ainda não está no CRM (ou que nunca falou por ele). */
function ModalNovaConversa({
  supabase,
  companyId,
  onFechar,
  onCriada,
}: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  onFechar: () => void;
  onCriada: (conversationId: string, mensagem: string) => void | Promise<void>;
}) {
  const [canais, setCanais] = useState<{ id: string; name: string }[] | null>(null);
  const [canalId, setCanalId] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void supabase
      .from("channels")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("provider", "evolution")
      .order("name")
      .then(({ data }) => {
        setCanais(data ?? []);
        if (data?.length) setCanalId(data[0].id);
      });
  }, [supabase, companyId]);

  async function criar(event: React.FormEvent) {
    event.preventDefault();
    if (!canalId || salvando) return;
    setSalvando(true);
    setErro(null);
    const resultado = await iniciarConversaAction(canalId, telefone, nome).catch((e: unknown) => ({
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao iniciar a conversa.",
      conversationId: undefined,
    }));
    setSalvando(false);
    if (!resultado.ok || !resultado.conversationId) return setErro(resultado.message);
    await onCriada(resultado.conversationId, resultado.message);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onFechar}>
      <form
        onSubmit={criar}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-[var(--ns-surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--ns-text)]">Nova conversa</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 text-[var(--ns-text-secondary)] hover:bg-[var(--ns-surface-hover)]">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        {canais !== null && canais.length === 0 ? (
          <p className="text-sm text-[var(--ns-text-secondary)]">Nenhum número de WhatsApp conectado ao CRM ainda.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {canais && canais.length > 1 && (
              <label className="flex flex-col gap-1 text-xs font-medium text-[var(--ns-text-secondary)]">
                Enviar pelo número
                <select
                  value={canalId}
                  onChange={(event) => setCanalId(event.target.value)}
                  className="rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-2 text-base text-[var(--ns-text)] md:text-sm"
                >
                  {canais.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--ns-text-secondary)]">
              Celular (com DDD)
              <input
                type="tel"
                inputMode="tel"
                autoFocus
                required
                value={telefone}
                onChange={(event) => setTelefone(event.target.value)}
                placeholder="11 91234-5678"
                className="rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-2 text-base text-[var(--ns-text)] md:text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--ns-text-secondary)]">
              Nome do contato (opcional)
              <input
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Ex.: Maria Souza"
                className="rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-2 text-base text-[var(--ns-text)] md:text-sm"
              />
            </label>
            {erro && <p className="rounded-lg bg-[var(--ns-danger)]/10 px-2.5 py-1.5 text-xs text-[var(--ns-danger)]">{erro}</p>}
            <button
              type="submit"
              disabled={salvando || !canalId || !telefone.trim()}
              className="mt-1 rounded-lg bg-[var(--ns-primary)] px-3 py-2 text-sm font-medium text-[var(--ns-primary-foreground)] hover:opacity-90 disabled:opacity-50"
            >
              {salvando ? "Abrindo..." : "Iniciar conversa"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
