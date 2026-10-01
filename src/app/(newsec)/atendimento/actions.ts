"use server";

// Sem revalidatePath aqui de propósito: a tela de atendimento busca tudo do lado do cliente, então
// revalidar a rota só fazia o servidor redesenhar a página a cada ação (mais lento, nada muda).
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

export type AtendimentoActionState = { ok: boolean; message: string };

export type AnexoParaExibir = { url: string; contentType: string | null; nome: string | null };

/**
 * Links temporários (1h) pros arquivos (áudio/imagem/documento/vídeo) de mensagens.
 *
 * O arquivo fica no bucket PRIVADO "atendimento-anexos". A leitura de message_attachments é
 * feita com a sessão do PRÓPRIO usuário — a RLS (user_can_access_conversation) já descarta o
 * que ele não pode ver. Só depois disso a chave de serviço assina os links, e só dos caminhos
 * que a RLS liberou. Assim não precisa abrir policy nenhuma no Storage.
 */
export async function obterLinksAnexosAction(messageIds: string[]): Promise<Record<string, AnexoParaExibir[]>> {
  if (messageIds.length === 0) return {};
  const { supabase } = await getCurrentUserContext();

  const { data: anexos, error } = await supabase
    .from("message_attachments")
    .select("message_id, storage_path, content_type, file_name")
    .in("message_id", messageIds.slice(0, 300));
  if (error || !anexos || anexos.length === 0) return {};

  const admin = createAdminClient();
  const { data: assinados } = await admin.storage
    .from("atendimento-anexos")
    .createSignedUrls(
      anexos.map((a) => a.storage_path),
      60 * 60,
    );
  const urlPorCaminho = new Map((assinados ?? []).map((s) => [s.path, s.signedUrl]));

  const resultado: Record<string, AnexoParaExibir[]> = {};
  for (const anexo of anexos) {
    const url = urlPorCaminho.get(anexo.storage_path);
    if (!url) continue;
    (resultado[anexo.message_id] ??= []).push({ url, contentType: anexo.content_type, nome: anexo.file_name });
  }
  return resultado;
}

/**
 * Envia mensagem de saída: grava a mensagem (status "pendente") e enfileira
 * o job de envio (outbound_jobs) numa ÚNICA transação, via RPC
 * (enviar_mensagem_com_job — ver 0007_atendimento_confiabilidade.sql).
 * Antes eram dois INSERTs separados: se o segundo falhasse por qualquer
 * motivo, a mensagem ficava presa em "pendente" pra sempre, sem job — bug
 * real encontrado em produção-de-teste (0006). Com a RPC, se o job não
 * puder ser criado, a mensagem também não é — nunca sobra estado órfão.
 * idempotencyKey é gerada no cliente (uma vez por tentativa de envio) —
 * reenviar com a MESMA chave (duplo clique, retry de rede) não duplica, a
 * própria função trata isso como sucesso idempotente.
 */
const AVISO_SEM_WHATSAPP =
  "Envio bloqueado: esta conversa veio do Totalk e o WhatsApp ainda não está conectado ao CRM. Responda pelo Totalk por enquanto (nota interna funciona).";

/**
 * Canal importado do Totalk (provider="totalk") ainda não tem WhatsApp ligado no CRM. Sem esta
 * trava, a mensagem ficaria na fila (outbound_jobs) e poderia sair de verdade pro cliente no dia
 * em que o número fosse conectado — dias depois, fora de contexto. Liberação da tela pra equipe
 * testar (30/09/2026) tornou isso provável.
 */
async function canalSemWhatsApp(supabase: Awaited<ReturnType<typeof getCurrentUserContext>>["supabase"], conversationId: string) {
  const { data } = await supabase.from("conversations").select("channel:channels(provider)").eq("id", conversationId).maybeSingle();
  const canal = (data as { channel: { provider: string } | null } | null)?.channel;
  return !canal || canal.provider === "totalk";
}

export async function enviarMensagemAction(
  conversationId: string,
  texto: string,
  idempotencyKey: string,
  respostaA?: string | null,
): Promise<AtendimentoActionState> {
  const textoLimpo = texto.trim();
  if (!textoLimpo) return { ok: false, message: "Mensagem vazia." };

  const { supabase, userProfileId, companyId } = await getCurrentUserContext();
  if (await canalSemWhatsApp(supabase, conversationId)) return { ok: false, message: AVISO_SEM_WHATSAPP };

  const { data, error } = await supabase.rpc("enviar_mensagem_com_job", {
    p_conversation_id: conversationId,
    p_company_id: companyId,
    p_author_user_profile_id: userProfileId,
    p_body: textoLimpo,
    p_message_type: "texto",
    p_idempotency_key: idempotencyKey,
  });

  if (error) return { ok: false, message: `Não foi possível enviar: ${error.message}.` };

  const resultado = data?.[0];
  // Citação: gravada logo depois do envio (enviar_mensagem_com_job não foi mexida — ver 0011).
  if (respostaA && resultado?.message_id && !resultado.ja_existia) {
    await supabase.rpc("definir_resposta_mensagem", { p_message_id: resultado.message_id, p_reply_to: respostaA });
  }
  return { ok: true, message: resultado?.ja_existia ? "Mensagem já enviada." : "Mensagem enviada." };
}

/**
 * Dono da conversa abriu: zera as não lidas. O filtro por responsável fica na própria query — se
 * quem chamou não é o dono, não atualiza nada (a regra vale mesmo chamando a action direto).
 */
export async function marcarConversaComoLidaAction(conversationId: string): Promise<AtendimentoActionState> {
  const { supabase, userProfileId } = await getCurrentUserContext();
  const { error } = await supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId)
    .eq("assigned_user_profile_id", userProfileId);
  if (error) return { ok: false, message: `Não foi possível marcar como lida: ${error.message}.` };
  return { ok: true, message: "Conversa marcada como lida." };
}

/**
 * Editar / apagar para todos (0009). Toda regra (quem pode, 15 min / 48 h, Totalk bloqueado) fica
 * no banco — aqui só traduz o resultado. Mensagem de WhatsApp volta "aguardando": só muda de
 * verdade quando o WhatsApp confirmar.
 */
export async function editarMensagemAction(messageId: string, novoTexto: string): Promise<AtendimentoActionState> {
  const { supabase } = await getCurrentUserContext();
  const { data, error } = await supabase.rpc("editar_mensagem", { p_message_id: messageId, p_novo_texto: novoTexto });
  if (error) return { ok: false, message: error.message };
  const status = (data as { whatsapp_status: string }[] | null)?.[0]?.whatsapp_status;
  return { ok: true, message: status === "aguardando" ? "Edição enviada — aguardando o WhatsApp confirmar." : "Mensagem editada." };
}

export async function apagarMensagemAction(messageId: string): Promise<AtendimentoActionState> {
  const { supabase } = await getCurrentUserContext();
  const { data, error } = await supabase.rpc("apagar_mensagem", { p_message_id: messageId });
  if (error) return { ok: false, message: error.message };
  const status = (data as { whatsapp_status: string }[] | null)?.[0]?.whatsapp_status;
  return { ok: true, message: status === "aguardando" ? "Exclusão enviada — aguardando o WhatsApp confirmar." : "Mensagem apagada." };
}

/** Nota interna — nunca gera outbound_jobs (bloqueado estruturalmente por trigger, além de nunca ser chamado aqui). */
export async function criarNotaInternaAction(
  conversationId: string,
  texto: string,
  respostaA?: string | null,
): Promise<AtendimentoActionState> {
  const textoLimpo = texto.trim();
  if (!textoLimpo) return { ok: false, message: "Nota vazia." };

  const { supabase, userProfileId, companyId } = await getCurrentUserContext();

  const { error } = await supabase.from("messages").insert({
    company_id: companyId,
    conversation_id: conversationId,
    direction: "saida",
    author_type: "humano",
    author_user_profile_id: userProfileId,
    is_internal_note: true,
    message_type: "nota",
    body: textoLimpo,
    status: "criada",
    // Só manda o campo quando cita algo (a coluna vem da migração 0011; o banco confere que é da mesma conversa).
    ...(respostaA ? { reply_to_message_id: respostaA } : {}),
  });

  if (error) return { ok: false, message: `Não foi possível salvar a nota: ${error.message}.` };

  return { ok: true, message: "Nota salva." };
}

/**
 * Assumir conversa — claim atômico via UPDATE ... WHERE assigned IS NULL.
 * Duas pessoas tentando assumir a mesma conversa: só a primeira UPDATE
 * afeta 1 linha; a segunda afeta 0 e recebe mensagem clara em vez de
 * "roubar" silenciosamente a atribuição.
 */
export async function assumirConversaAction(conversationId: string): Promise<AtendimentoActionState> {
  const { supabase, userProfileId, companyId } = await getCurrentUserContext();

  const { data, error } = await supabase
    .from("conversations")
    .update({ assigned_user_profile_id: userProfileId, status: "humano" })
    .eq("id", conversationId)
    .is("assigned_user_profile_id", null)
    .select("id");

  if (error) return { ok: false, message: `Não foi possível assumir: ${error.message}.` };
  if (!data || data.length === 0) {
    return { ok: false, message: "Esta conversa já foi assumida por outra pessoa." };
  }

  await supabase.from("conversation_transfers").insert({
    conversation_id: conversationId,
    company_id: companyId,
    from_user_profile_id: null,
    to_user_profile_id: userProfileId,
    transferred_by: userProfileId,
    note: "Assumida da fila",
  });

  return { ok: true, message: "Conversa assumida." };
}

/**
 * Transferir conversa — RLS decide quem pode (admin/manager da empresa,
 * supervisor da equipe, ou o próprio responsável atual). Se a policy
 * bloquear, o UPDATE afeta 0 linhas silenciosamente — aqui isso vira
 * mensagem de erro explícita em vez de reportar sucesso falso.
 */
export async function transferirConversaAction(
  conversationId: string,
  paraUserProfileId: string,
  nota: string | null,
): Promise<AtendimentoActionState> {
  const { supabase, userProfileId, companyId } = await getCurrentUserContext();

  const { data: conversaAtual } = await supabase
    .from("conversations")
    .select("assigned_user_profile_id")
    .eq("id", conversationId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("conversations")
    .update({ assigned_user_profile_id: paraUserProfileId })
    .eq("id", conversationId)
    .select("id");

  if (error) return { ok: false, message: `Não foi possível transferir: ${error.message}.` };
  if (!data || data.length === 0) {
    return { ok: false, message: "Você não tem permissão para transferir esta conversa." };
  }

  await supabase.from("conversation_transfers").insert({
    conversation_id: conversationId,
    company_id: companyId,
    from_user_profile_id: conversaAtual?.assigned_user_profile_id ?? null,
    to_user_profile_id: paraUserProfileId,
    transferred_by: userProfileId,
    note: nota,
  });

  return { ok: true, message: "Conversa transferida." };
}

export async function concluirConversaAction(conversationId: string): Promise<AtendimentoActionState> {
  const { supabase } = await getCurrentUserContext();

  const { data, error } = await supabase
    .from("conversations")
    .update({ status: "encerrada" })
    .eq("id", conversationId)
    .select("id");

  if (error) return { ok: false, message: `Não foi possível concluir: ${error.message}.` };
  if (!data || data.length === 0) return { ok: false, message: "Você não tem acesso a esta conversa." };

  return { ok: true, message: "Conversa concluída." };
}

/**
 * Tenta reenviar uma mensagem que falhou — RESETA o job existente (via RPC
 * reenviar_mensagem_falhada), não cria um novo. outbound_jobs tem
 * message_id único (0004): criar um segundo job pro mesmo message_id
 * quebrava com um bug real (23505) sempre que o usuário tentasse reenviar
 * de verdade. A RPC roda como SECURITY DEFINER (UPDATE de outbound_jobs é
 * restrito por RLS a admin/manager, ver 0006) mas checa autorização
 * explicitamente antes de tocar em qualquer coisa — é o único caminho
 * controlado pra um usuário comum resetar o próprio job.
 */
export async function reenviarMensagemFalhadaAction(messageId: string, conversationId: string): Promise<AtendimentoActionState> {
  const { supabase } = await getCurrentUserContext();
  if (await canalSemWhatsApp(supabase, conversationId)) return { ok: false, message: AVISO_SEM_WHATSAPP };

  const { data, error } = await supabase.rpc("reenviar_mensagem_falhada", {
    p_message_id: messageId,
    p_conversation_id: conversationId,
  });

  if (error) return { ok: false, message: `Não foi possível reenfileirar: ${error.message}.` };

  const resultado = data?.[0];
  if (!resultado?.ok) return { ok: false, message: resultado?.mensagem ?? "Não foi possível reenfileirar." };

  return { ok: true, message: resultado.mensagem };
}

export async function reabrirConversaAction(conversationId: string): Promise<AtendimentoActionState> {
  const { supabase } = await getCurrentUserContext();

  const { data, error } = await supabase
    .from("conversations")
    .update({ status: "aguardando_humano" })
    .eq("id", conversationId)
    .select("id");

  if (error) return { ok: false, message: `Não foi possível reabrir: ${error.message}.` };
  if (!data || data.length === 0) return { ok: false, message: "Você não tem acesso a esta conversa." };

  return { ok: true, message: "Conversa reaberta." };
}

/** Liga (ou desliga, com null) a conversa — e todas do mesmo contato — ao cadastro do cliente. Regras no banco (0011). */
export async function vincularClienteConversaAction(conversationId: string, clientId: string | null): Promise<AtendimentoActionState> {
  const { supabase } = await getCurrentUserContext();
  const { error } = await supabase.rpc("vincular_cliente_conversa", { p_conversation_id: conversationId, p_client_id: clientId });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: clientId ? "Conversa ligada ao cadastro do cliente." : "Vínculo com o cliente desfeito." };
}
