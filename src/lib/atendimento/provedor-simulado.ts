import crypto from "node:crypto";
import type { EnviarMensagemInput, EnviarMensagemResultado, EventoWebhookNormalizado, ProvedorAtendimento } from "./provedor";
import type { MessageType } from "@/types/atendimento";

/**
 * Adaptador simulado — não fala com nenhum WhatsApp de verdade. É o que
 * permite testar o pipeline inteiro (recepção → persistência → fila →
 * conversa → resposta humana → job → "envio" → confirmação) sem token real
 * nem número real, conforme a especificação da Entrega C pede
 * explicitamente ("adapter de teste precisa ser explicitamente selecionado
 * por configuração e não operar como fallback silencioso").
 *
 * Taxa de falha configurável via ATENDIMENTO_SIMULADO_TAXA_FALHA (0 a 1,
 * default 0.1) — existe pra poder testar de propósito o caminho de retry
 * do worker; passar 0 pra rodar determinístico num teste automatizado.
 */
export function criarProvedorSimulado(): ProvedorAtendimento {
  const taxaFalha = Number(process.env.ATENDIMENTO_SIMULADO_TAXA_FALHA ?? "0.1");

  return {
    nome: "simulado",

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- assinatura da interface exige o parâmetro; o adaptador simulado não fala com nenhum provedor real, então não usa os dados de envio.
    async enviar(_input: EnviarMensagemInput): Promise<EnviarMensagemResultado> {
      if (Math.random() < taxaFalha) {
        return { status: "falha", erro: "Falha simulada (ATENDIMENTO_SIMULADO_TAXA_FALHA) — nenhuma chamada real foi feita." };
      }

      return { status: "enviada", externalId: `sim_${crypto.randomUUID()}` };
    },

    normalizarEventoWebhook(payloadBruto: unknown): EventoWebhookNormalizado | null {
      if (typeof payloadBruto !== "object" || payloadBruto === null) return null;
      const payload = payloadBruto as Record<string, unknown>;

      if (typeof payload.eventoId !== "string" || typeof payload.canalExternalId !== "string" || typeof payload.telefone !== "string") {
        return null;
      }

      const tipoValido: MessageType[] = ["texto", "documento", "audio", "imagem", "video"];
      const tipo = tipoValido.includes(payload.tipo as MessageType) ? (payload.tipo as MessageType) : "texto";

      return {
        externalEventId: payload.eventoId,
        canalExternalId: payload.canalExternalId,
        contatoTelefone: payload.telefone,
        contatoNome: typeof payload.nome === "string" ? payload.nome : null,
        tipo,
        texto: typeof payload.texto === "string" ? payload.texto : null,
        externalMessageId: typeof payload.mensagemId === "string" ? payload.mensagemId : `sim_in_${crypto.randomUUID()}`,
        timestamp: typeof payload.timestamp === "string" ? payload.timestamp : new Date().toISOString(),
      };
    },
  };
}
