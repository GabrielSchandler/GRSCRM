import { criarProvedorSimulado } from "./provedor-simulado";
import type { ProvedorAtendimento } from "./provedor";

/**
 * Seleção explícita do provedor ativo por variável de ambiente
 * (ATENDIMENTO_PROVEDOR) — nunca cai num fallback silencioso: se alguém
 * configurar um provedor real que ainda não existe, isso precisa quebrar
 * alto, não virar "simulado" por baixo dos panos sem ninguém perceber.
 */
export function obterProvedorAtivo(): ProvedorAtendimento {
  const modo = process.env.ATENDIMENTO_PROVEDOR ?? "simulado";

  if (modo === "simulado") return criarProvedorSimulado();

  throw new Error(
    `ATENDIMENTO_PROVEDOR="${modo}" não implementado nesta entrega — só "simulado" existe até um adaptador real (WhatsApp de teste) ser integrado.`,
  );
}
