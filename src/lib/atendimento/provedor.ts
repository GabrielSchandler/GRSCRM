import type { MessageType } from "@/types/atendimento";

/**
 * Interface de provedor de canal de atendimento (WhatsApp etc). Qualquer
 * adaptador real (Cloud API, Evolution API, etc.) implementa isto — o
 * resto do sistema (worker, webhook, actions) nunca fala com o provedor
 * diretamente, só através desta interface.
 */
export type EnviarMensagemInput = {
  canalExternalId: string;
  destinatarioTelefone: string;
  tipo: MessageType;
  texto: string | null;
};

export type EnviarMensagemResultado =
  | { status: "enviada"; externalId: string }
  | { status: "falha"; erro: string };

export type EventoWebhookNormalizado = {
  externalEventId: string;
  canalExternalId: string;
  contatoTelefone: string;
  contatoNome: string | null;
  tipo: MessageType;
  texto: string | null;
  externalMessageId: string;
  timestamp: string;
};

export interface ProvedorAtendimento {
  nome: string;
  enviar(input: EnviarMensagemInput): Promise<EnviarMensagemResultado>;
  /** Converte o payload bruto do webhook do provedor pro formato normalizado interno. Retorna null se o payload não for um evento de mensagem reconhecível (ex: evento de outro tipo). */
  normalizarEventoWebhook(payloadBruto: unknown): EventoWebhookNormalizado | null;
}
