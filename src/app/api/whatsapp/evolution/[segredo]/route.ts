import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processarEventoEvolution } from "@/lib/atendimento/whatsapp";

/**
 * Entrada dos avisos da Evolution (mensagem recebida, status entregue/lida, conexão).
 * O segredo na URL (ATENDIMENTO_WEBHOOK_SEGREDO) é o que impede qualquer um de "inventar" mensagem.
 * Fora de /atendimento e /chat-interno, então o middleware de login não intercepta.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function segredoConfere(recebido: string) {
  const esperado = process.env.ATENDIMENTO_WEBHOOK_SEGREDO ?? "";
  if (esperado.length < 24) return false; // sem segredo forte configurado: porta fechada
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request, { params }: { params: Promise<{ segredo: string }> }) {
  const { segredo } = await params;
  if (!segredoConfere(segredo)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  let carga: unknown;
  try {
    carga = await request.json();
  } catch {
    return NextResponse.json({ resultado: "ignorado: corpo inválido" });
  }

  try {
    const resultado = await processarEventoEvolution(carga);
    return NextResponse.json({ resultado });
  } catch (erro) {
    // 500 faz a Evolution tentar de novo; a gravação é idempotente pelo id da mensagem.
    console.error("[whatsapp] falha ao processar aviso:", erro instanceof Error ? erro.message : String(erro));
    return NextResponse.json({ erro: "falha ao processar" }, { status: 500 });
  }
}
