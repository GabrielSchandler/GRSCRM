"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export type AtendimentoActionState = { ok: boolean; message: string };

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
export async function enviarMensagemAction(
  conversationId: string,
  texto: string,
  idempotencyKey: string,
): Promise<AtendimentoActionState> {
  const textoLimpo = texto.trim();
  if (!textoLimpo) return { ok: false, message: "Mensagem vazia." };

  const { supabase, userProfileId, companyId } = await getCurrentUserContext();

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
  revalidatePath("/atendimento");
  return { ok: true, message: resultado?.ja_existia ? "Mensagem já enviada." : "Mensagem enviada." };
}

/** Nota interna — nunca gera outbound_jobs (bloqueado estruturalmente por trigger, além de nunca ser chamado aqui). */
export async function criarNotaInternaAction(conversationId: string, texto: string): Promise<AtendimentoActionState> {
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
  });

  if (error) return { ok: false, message: `Não foi possível salvar a nota: ${error.message}.` };

  revalidatePath("/atendimento");
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

  revalidatePath("/atendimento");
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

  revalidatePath("/atendimento");
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

  revalidatePath("/atendimento");
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

  const { data, error } = await supabase.rpc("reenviar_mensagem_falhada", {
    p_message_id: messageId,
    p_conversation_id: conversationId,
  });

  if (error) return { ok: false, message: `Não foi possível reenfileirar: ${error.message}.` };

  const resultado = data?.[0];
  if (!resultado?.ok) return { ok: false, message: resultado?.mensagem ?? "Não foi possível reenfileirar." };

  revalidatePath("/atendimento");
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

  revalidatePath("/atendimento");
  return { ok: true, message: "Conversa reaberta." };
}
