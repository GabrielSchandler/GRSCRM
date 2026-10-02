import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CONFIANCA_MINIMA,
  CONFIG_IA,
  ESQUEMA_DECISAO,
  lerDecisao,
  montarMensagemUsuario,
  montarPromptSistema,
  notaDeTransferencia,
  type DecisaoIa,
  type TurnoHistorico,
} from "./prompt";

/**
 * O turno da IA (a "Ana") numa conversa de WhatsApp — pedido do Gabriel, 02/10/2026: contato novo cai na
 * aba "IA" e é atendido por ela até passar pra equipe.
 *
 * Proteções (as mesmas do NewSec Chat):
 *  - Espera uns segundos e só responde se a mensagem que chamou ainda for a ÚLTIMA do cliente: quem manda
 *    três mensagens seguidas recebe UMA resposta, à conversa inteira.
 *  - Relê a conversa antes de gravar: se alguém da equipe assumiu (status deixou de ser "ia"), não responde.
 *  - Idempotente pela mensagem que chamou (o aviso da Evolution pode chegar duas vezes).
 *  - Qualquer erro (OpenAI fora, formato estranho) → passa pra equipe em vez de deixar o cliente sem resposta.
 *
 * Desligada sem OPENAI_API_KEY: aí contato novo continua indo pra fila humana (ver iaAtendimentoLigada).
 */

type Admin = ReturnType<typeof createAdminClient>;
const BUCKET = "atendimento-anexos";
const ESPERA_AGRUPAR_MS = 6000;
const MODELO = () => process.env.OPENAI_MODELO_ATENDIMENTO || "gpt-4o-mini";
const AVISO_TRANSFERENCIA_PADRAO = "Combinado! Vou chamar um especialista da nossa equipe, que continua com você por aqui mesmo, neste WhatsApp.";

export function iaAtendimentoLigada() {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.IA_ATENDIMENTO_DESLIGADA !== "sim";
}

class ErroOpenAI extends Error {}

async function chamarOpenAI(caminho: string, corpo: BodyInit, json: boolean): Promise<unknown> {
  for (let tentativa = 1; ; tentativa++) {
    // OPENAI_API_URL só existe pra teste (servidor falso local); em produção fica o endereço oficial.
    const resposta = await fetch(`${process.env.OPENAI_API_URL || "https://api.openai.com/v1"}/${caminho}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...(json ? { "Content-Type": "application/json" } : {}) },
      body: corpo,
      signal: AbortSignal.timeout(45_000),
    });
    if (resposta.ok) return resposta.json();
    // 429 (limite por minuto) e 5xx: uma nova tentativa curta resolve quase sempre.
    if ((resposta.status === 429 || resposta.status >= 500) && tentativa < 3) {
      await new Promise((fim) => setTimeout(fim, 2000 * tentativa));
      continue;
    }
    throw new ErroOpenAI(`OpenAI ${resposta.status}: ${(await resposta.text()).slice(0, 200)}`);
  }
}

async function decidir(historico: TurnoHistorico[]): Promise<DecisaoIa> {
  const dados = (await chamarOpenAI(
    "chat/completions",
    JSON.stringify({
      model: MODELO(),
      temperature: 0.4,
      max_tokens: 1200,
      messages: [
        { role: "system", content: montarPromptSistema() },
        { role: "user", content: montarMensagemUsuario(historico) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "decisao_atendimento", strict: true, schema: ESQUEMA_DECISAO } },
    }),
    true,
  )) as { choices?: { message?: { content?: string } }[] };
  const texto = dados.choices?.[0]?.message?.content ?? "";
  const decisao = lerDecisao(JSON.parse(texto || "null"));
  if (!decisao) throw new ErroOpenAI("A IA devolveu uma resposta fora do formato.");
  return decisao;
}

/** Áudio do cliente vira texto (whisper) pra IA entender — não muda nada do que a equipe vê. */
async function transcrever(admin: Admin, mensagemId: string): Promise<string | null> {
  const { data: anexo } = await admin.from("message_attachments").select("storage_path, content_type, file_name").eq("message_id", mensagemId).limit(1).maybeSingle();
  if (!anexo) return null;
  const { data: arquivo } = await admin.storage.from(BUCKET).download(anexo.storage_path);
  if (!arquivo || arquivo.size > 24 * 1024 * 1024) return null;
  const formulario = new FormData();
  formulario.append("file", arquivo, anexo.file_name ?? "audio.ogg");
  formulario.append("model", process.env.OPENAI_MODELO_TRANSCRICAO || "whisper-1");
  formulario.append("language", "pt");
  const r = (await chamarOpenAI("audio/transcriptions", formulario, false)) as { text?: string };
  return r.text?.trim() || null;
}

const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

type MensagemBanco = { id: string; direction: string; author_type: string; message_type: string; body: string | null; created_at: string; is_internal_note: boolean };

async function montarHistorico(admin: Admin, mensagens: MensagemBanco[]): Promise<TurnoHistorico[]> {
  // Transcreve só os áudios do cliente das últimas mensagens (custo e tempo controlados).
  const audiosRecentes = new Set(mensagens.filter((m) => m.direction === "entrada" && m.message_type === "audio").slice(-3).map((m) => m.id));
  const historico: TurnoHistorico[] = [];
  for (const m of mensagens) {
    if (m.is_internal_note || m.author_type === "sistema") continue;
    const autor = m.direction === "entrada" ? "cliente" : m.author_type === "ia" ? "ia" : "atendente";
    let texto = (m.body ?? "").replace(/^\*[^*\n]{1,60}:\*\s*/, "").trim();
    if (m.message_type === "audio") {
      const transcricao = audiosRecentes.has(m.id) ? await transcrever(admin, m.id).catch(() => null) : null;
      texto = transcricao ? `(áudio) ${transcricao}` : "(mandou um áudio que não deu pra ouvir — se for importante, peça para escrever)";
    } else if (m.message_type === "imagem") texto = `(mandou uma imagem)${texto ? ` ${texto}` : ""}`;
    else if (m.message_type === "documento") texto = `(mandou um documento)${texto ? ` ${texto}` : ""}`;
    else if (m.message_type === "video") texto = `(mandou um vídeo)${texto ? ` ${texto}` : ""}`;
    if (texto) historico.push({ autor, texto, quando: horaCurta(m.created_at) });
  }
  return historico;
}

async function enviarComoIa(admin: Admin, conversa: { id: string; company_id: string }, texto: string, chave: string): Promise<string | null> {
  const { data: msg, error } = await admin
    .from("messages")
    .insert({ company_id: conversa.company_id, conversation_id: conversa.id, direction: "saida", author_type: "ia", message_type: "texto", body: texto, status: "pendente", idempotency_key: chave })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null; // já respondida (aviso repetido)
    throw new Error(`gravar resposta da IA: ${error.message}`);
  }
  await admin.from("outbound_jobs").insert({ company_id: conversa.company_id, conversation_id: conversa.id, message_id: msg.id, idempotency_key: chave });
  await admin.from("conversations").update({ last_activity_at: new Date().toISOString(), last_message_preview: texto.slice(0, 200) }).eq("id", conversa.id);
  return msg.id as string;
}

async function passarParaEquipe(admin: Admin, conversa: { id: string; company_id: string }, nota: string) {
  // Só sai da IA se AINDA estiver nela (alguém pode ter assumido nesse meio-tempo).
  const { data } = await admin
    .from("conversations")
    .update({ status: "aguardando_humano", last_activity_at: new Date().toISOString(), unread_count: 1 })
    .eq("id", conversa.id)
    .eq("status", "ia")
    .select("id");
  if (!data?.length) return;
  await admin.from("messages").insert({
    company_id: conversa.company_id,
    conversation_id: conversa.id,
    direction: "saida",
    author_type: "sistema",
    is_internal_note: true,
    message_type: "nota",
    body: nota,
    status: "criada",
  });
}

/**
 * Roda o turno da IA pra mensagem `gatilhoId` do cliente. Devolve o que aconteceu (pra log).
 * `enviar` é o despacho na hora (o mesmo do envio humano), injetado pra evitar import circular.
 */
export async function executarTurnoIa(conversaId: string, gatilhoId: string, enviar: (messageId: string) => Promise<void>): Promise<string> {
  if (!iaAtendimentoLigada()) return "ia desligada";
  const admin = createAdminClient();
  await new Promise((fim) => setTimeout(fim, ESPERA_AGRUPAR_MS));

  const { data: conversa } = await admin.from("conversations").select("id, company_id, status, assigned_user_profile_id, contact_id").eq("id", conversaId).maybeSingle();
  if (!conversa || conversa.status !== "ia" || conversa.assigned_user_profile_id) return "conversa não está com a IA";

  const { data: recentes } = await admin
    .from("messages")
    .select("id, direction, author_type, message_type, body, created_at, is_internal_note")
    .eq("conversation_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(40);
  const mensagens = ((recentes ?? []) as MensagemBanco[]).reverse();
  const ultimaDoCliente = [...mensagens].reverse().find((m) => m.direction === "entrada");
  if (ultimaDoCliente?.id !== gatilhoId) return "chegou mensagem mais nova — ela responde";

  const chave = `ia:${gatilhoId}`;
  let decisao: DecisaoIa;
  try {
    decisao = await decidir(await montarHistorico(admin, mensagens));
  } catch (erro) {
    console.error(`[ia] conversa ${conversaId}:`, erro);
    const id = await enviarComoIa(admin, conversa, AVISO_TRANSFERENCIA_PADRAO, chave);
    if (id) await enviar(id).catch(() => undefined);
    await passarParaEquipe(admin, conversa, `${CONFIG_IA.nome} (IA) não conseguiu responder e passou a conversa para a equipe.\nMotivo técnico: ${erro instanceof Error ? erro.message.slice(0, 200) : "erro"}`);
    return "erro na IA — passou pra equipe";
  }

  const passa = decisao.precisa_humano || decisao.confianca < CONFIANCA_MINIMA;
  let texto = decisao.resposta ?? (passa ? AVISO_TRANSFERENCIA_PADRAO : null);
  // Primeira fala da Ana na conversa sem se apresentar: o sistema garante a apresentação.
  const jaFalou = mensagens.some((m) => m.author_type === "ia");
  if (texto && !jaFalou && !/\bAna\b/.test(texto)) texto = `Aqui é a ${CONFIG_IA.nome}, da GRS Soluções. ${texto}`;

  // Relê na última hora: se a equipe assumiu enquanto a IA pensava, fica quieta.
  const { data: agora } = await admin.from("conversations").select("status, assigned_user_profile_id").eq("id", conversaId).single();
  if (agora?.status !== "ia" || agora.assigned_user_profile_id) return "equipe assumiu durante a resposta";

  if (texto) {
    const id = await enviarComoIa(admin, conversa, texto, chave);
    if (!id) return "já respondida";
    await enviar(id).catch((erro) => console.error("[ia] envio:", erro));
  }

  // Nome que a pessoa disse vira o nome do contato, se ele ainda não tinha.
  const nome = decisao.dados.find((d) => d.campo === "nome")?.valor;
  if (nome && conversa.contact_id) {
    await admin.from("contacts").update({ display_name: nome.slice(0, 120) }).eq("id", conversa.contact_id).is("display_name", null);
  }

  if (passa) {
    await passarParaEquipe(
      admin,
      conversa,
      notaDeTransferencia(decisao, decisao.motivo_humano ?? (decisao.confianca < CONFIANCA_MINIMA ? "a IA não teve segurança para responder" : "a IA pediu atendimento humano")),
    );
    return "respondeu e passou pra equipe";
  }
  return "respondeu";
}
