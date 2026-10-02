import "server-only";

/**
 * Cliente da Evolution API (v2) — a MESMA instalação que o NewSec Chat usa (servidor próprio, número
 * conectado por QR Code, conexão do tipo WhatsApp Web). Só este arquivo conhece o formato da Evolution.
 *
 * Configuração (variáveis de ambiente do servidor, nunca do navegador):
 *   EVOLUTION_API_URL   endereço público da Evolution, sem barra no fim
 *   EVOLUTION_API_KEY   chave global da Evolution
 */

const TEMPO_LIMITE_MS = 20_000;

export class ErroEvolution extends Error {
  constructor(
    mensagem: string,
    readonly statusHttp: number | null = null,
  ) {
    super(mensagem);
    this.name = "ErroEvolution";
  }
}

function configuracao() {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const chave = process.env.EVOLUTION_API_KEY;
  if (!url || !chave) {
    throw new ErroEvolution("WhatsApp não configurado no servidor: faltam EVOLUTION_API_URL e EVOLUTION_API_KEY na Vercel.");
  }
  return { url, chave };
}

export function evolutionConfigurada() {
  return Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY);
}

async function chamar<T>(
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown; aceitar404?: boolean; tempoLimiteMs?: number } = {},
): Promise<T | null> {
  const { url, chave } = configuracao();
  const limite = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_MS;
  const controlador = new AbortController();
  const relogio = setTimeout(() => controlador.abort(), limite);
  try {
    const resposta = await fetch(`${url}${caminho}`, {
      method: opcoes.metodo ?? "GET",
      headers: { apikey: chave, "Content-Type": "application/json" },
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
      signal: controlador.signal,
      cache: "no-store",
    });
    if (resposta.status === 404 && opcoes.aceitar404) return null;
    const texto = await resposta.text();
    let dados: unknown = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = texto;
    }
    if (!resposta.ok) {
      const detalhe = typeof dados === "string" ? dados : JSON.stringify(dados);
      throw new ErroEvolution(`Evolution respondeu ${resposta.status} em ${caminho}: ${detalhe.slice(0, 300)}`, resposta.status);
    }
    return dados as T;
  } catch (erro) {
    if (erro instanceof ErroEvolution) throw erro;
    if (erro instanceof Error && erro.name === "AbortError") {
      throw new ErroEvolution(`A Evolution não respondeu em ${limite / 1000}s (${caminho}).`);
    }
    throw new ErroEvolution(`Não foi possível falar com a Evolution (${caminho}): ${erro instanceof Error ? erro.message : String(erro)}`);
  } finally {
    clearTimeout(relogio);
  }
}

/** Lê um caminho aninhado devolvendo texto, ou null. */
export function lerTexto(objeto: unknown, caminho: string[]): string | null {
  let atual: unknown = objeto;
  for (const parte of caminho) {
    if (!atual || typeof atual !== "object") return null;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return typeof atual === "string" ? atual : null;
}

// Eventos que o CRM assina. Mídia NÃO vem embutida (base64: false): a Vercel recusa corpo acima de
// ~4,5 MB, e um vídeo dentro do aviso derrubaria a mensagem inteira. O arquivo é baixado depois.
const EVENTOS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"];

export async function criarInstancia(instancia: string, urlWebhook: string) {
  await chamar("/instance/create", {
    metodo: "POST",
    corpo: {
      instanceName: instancia,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: { url: urlWebhook, byEvents: false, base64: false, events: EVENTOS },
    },
  });
}

export async function configurarWebhook(instancia: string, urlWebhook: string) {
  await chamar(`/webhook/set/${encodeURIComponent(instancia)}`, {
    metodo: "POST",
    corpo: { webhook: { enabled: true, url: urlWebhook, byEvents: false, base64: false, events: EVENTOS } },
  });
}

export type EstadoConexao = "conectado" | "conectando" | "desconectado";

function traduzirEstado(estado: string | null): EstadoConexao {
  switch ((estado ?? "").toLowerCase()) {
    case "open":
    case "connected":
      return "conectado";
    case "connecting":
      return "conectando";
    default:
      return "desconectado";
  }
}

/** QR Code (imagem data:) para ler no celular, ou o estado se já estiver conectado. */
export async function pedirQrCode(instancia: string): Promise<{ estado: EstadoConexao; qrCode: string | null }> {
  const resposta = await chamar<Record<string, unknown>>(`/instance/connect/${encodeURIComponent(instancia)}`);
  const base64 = lerTexto(resposta, ["base64"]) ?? lerTexto(resposta, ["qrcode", "base64"]);
  const estado = lerTexto(resposta, ["instance", "state"]);
  return {
    estado: estado ? traduzirEstado(estado) : "conectando",
    qrCode: base64 ? (base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`) : null,
  };
}

export async function estadoConexao(instancia: string): Promise<EstadoConexao> {
  const resposta = await chamar<Record<string, unknown>>(`/instance/connectionState/${encodeURIComponent(instancia)}`, { aceitar404: true });
  if (!resposta) return "desconectado";
  return traduzirEstado(lerTexto(resposta, ["instance", "state"]) ?? lerTexto(resposta, ["state"]));
}

/** Número (só dígitos) do WhatsApp conectado na instância, se já estiver conectado. */
export async function numeroConectado(instancia: string): Promise<string | null> {
  const lista = await chamar<unknown[]>(`/instance/fetchInstances?instanceName=${encodeURIComponent(instancia)}`, { aceitar404: true });
  const item = Array.isArray(lista) ? (lista[0] as Record<string, unknown> | undefined) : null;
  const jid = (item?.ownerJid as string | undefined) ?? (item?.number as string | undefined) ?? null;
  return jid ? jid.replace(/@.*$/, "").replace(/\D/g, "") : null;
}

export async function desconectarInstancia(instancia: string) {
  await chamar(`/instance/logout/${encodeURIComponent(instancia)}`, { metodo: "DELETE", aceitar404: true });
}

export async function enviarTexto(instancia: string, telefone: string, texto: string): Promise<string | null> {
  const resposta = await chamar<Record<string, unknown>>(`/message/sendText/${encodeURIComponent(instancia)}`, {
    metodo: "POST",
    corpo: { number: telefone, text: texto },
  });
  return lerTexto(resposta, ["key", "id"]);
}

// Mídia: a Evolution baixa o arquivo do link (assinado, curto) e manda pro WhatsApp. Pode demorar
// mais que um texto (conversão do áudio, vídeo grande), por isso o tempo limite maior.
const TEMPO_LIMITE_MIDIA_MS = 55_000;

/**
 * Áudio como "mensagem de voz" (a bolinha com o microfone, não um arquivo). `encoding: true` faz a
 * própria Evolution converter pra ogg/opus — o navegador grava em webm/mp4, que o WhatsApp não toca
 * como voz. O servidor da Evolution tem o ffmpeg (conferido em 02/10/2026).
 */
export async function enviarAudio(instancia: string, telefone: string, urlAudio: string): Promise<string | null> {
  const resposta = await chamar<Record<string, unknown>>(`/message/sendWhatsAppAudio/${encodeURIComponent(instancia)}`, {
    metodo: "POST",
    corpo: { number: telefone, audio: urlAudio, encoding: true },
    tempoLimiteMs: TEMPO_LIMITE_MIDIA_MS,
  });
  return lerTexto(resposta, ["key", "id"]);
}

/** Foto, vídeo ou documento, com legenda opcional. */
export async function enviarMidia(
  instancia: string,
  telefone: string,
  midia: { tipo: "image" | "video" | "document"; url: string; mimetype: string; nomeArquivo: string; legenda: string },
): Promise<string | null> {
  const resposta = await chamar<Record<string, unknown>>(`/message/sendMedia/${encodeURIComponent(instancia)}`, {
    metodo: "POST",
    corpo: {
      number: telefone,
      mediatype: midia.tipo,
      mimetype: midia.mimetype,
      media: midia.url,
      fileName: midia.nomeArquivo,
      caption: midia.legenda,
    },
    tempoLimiteMs: TEMPO_LIMITE_MIDIA_MS,
  });
  return lerTexto(resposta, ["key", "id"]);
}

/** Conteúdo de uma mídia recebida, já descriptografado pela Evolution. */
export async function baixarMidia(instancia: string, idMensagem: string): Promise<{ base64: string; mimetype: string | null; nome: string | null }> {
  const resposta = await chamar<Record<string, unknown>>(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instancia)}`, {
    metodo: "POST",
    corpo: { message: { key: { id: idMensagem } }, convertToMp4: false },
  });
  const base64 = lerTexto(resposta, ["base64"]) ?? lerTexto(resposta, ["media"]);
  if (!base64) throw new ErroEvolution("A Evolution não devolveu o conteúdo da mídia (pode ter expirado no WhatsApp).");
  return {
    base64: base64.replace(/^data:[^;]+;base64,/, ""),
    mimetype: lerTexto(resposta, ["mimetype"]),
    nome: lerTexto(resposta, ["fileName"]),
  };
}
