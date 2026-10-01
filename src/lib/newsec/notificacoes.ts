/**
 * Estado compartilhado das notificações do shell NewSec (avisador no layout, sino na barra do topo e
 * as telas de atendimento/chat interno). Módulo simples com assinatura — sem contexto React, porque o
 * avisador e o sino ficam em árvores diferentes (layout × página).
 */

export type AvisoNotificacao = {
  id: string;
  tipo: "whatsapp" | "interno";
  titulo: string;
  texto: string;
  href: string;
  em: number;
};

export type EstadoNotificacoes = {
  /** Avisos no canto da tela agora (somem sozinhos). */
  avisos: AvisoNotificacao[];
  /** Últimos avisos, pro sino da barra do topo. */
  historico: AvisoNotificacao[];
  naoLidasAtendimento: number;
  naoLidasInterno: number;
  somLigado: boolean;
  permissaoNavegador: NotificationPermission | "indisponivel";
};

const CHAVE_SOM = "ns:som-notificacao";

function lerSomLigado() {
  try {
    return globalThis.localStorage?.getItem(CHAVE_SOM) !== "desligado";
  } catch {
    return true;
  }
}

let estado: EstadoNotificacoes = {
  avisos: [],
  historico: [],
  naoLidasAtendimento: 0,
  naoLidasInterno: 0,
  somLigado: true,
  permissaoNavegador: "indisponivel",
};
let iniciado = false;
const ouvintes = new Set<() => void>();

const ESTADO_SERVIDOR: EstadoNotificacoes = { ...estado };

export function assinarNotificacoes(ouvinte: () => void) {
  if (!iniciado && typeof window !== "undefined") {
    iniciado = true;
    estado = {
      ...estado,
      somLigado: lerSomLigado(),
      permissaoNavegador: "Notification" in window ? Notification.permission : "indisponivel",
    };
  }
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function lerNotificacoes() {
  return estado;
}

export function lerNotificacoesNoServidor() {
  return ESTADO_SERVIDOR;
}

export function atualizarNotificacoes(parcial: Partial<EstadoNotificacoes>) {
  estado = { ...estado, ...parcial };
  for (const ouvinte of ouvintes) ouvinte();
}

export function adicionarAviso(aviso: AvisoNotificacao) {
  atualizarNotificacoes({ avisos: [aviso, ...estado.avisos].slice(0, 5), historico: [aviso, ...estado.historico].slice(0, 20) });
}

export function removerAviso(id: string) {
  atualizarNotificacoes({ avisos: estado.avisos.filter((a) => a.id !== id) });
}

export function definirSomLigado(ligado: boolean) {
  try {
    globalThis.localStorage?.setItem(CHAVE_SOM, ligado ? "ligado" : "desligado");
  } catch {
    // navegador sem armazenamento (aba anônima etc.): vale só nesta página
  }
  atualizarNotificacoes({ somLigado: ligado });
}

/**
 * Qual conversa está aberta na tela agora ("c:<id>" atendimento, "t:<id>" chat interno). Mensagem
 * nova NA conversa que a pessoa está olhando não precisa de aviso — ela já está vendo.
 */
let focoAtual: string | null = null;
export function definirFoco(chave: string | null) {
  focoAtual = chave;
}
export function lerFoco() {
  return focoAtual;
}
