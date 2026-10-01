"use server";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

// Chat interno entre funcionários (0010). Toda regra de quem participa/escreve fica no banco (RLS +
// funções security definer). Aqui só entra a chave de serviço pra ASSINAR links do Storage — e
// sempre depois de a sessão do próprio usuário provar, pela RLS, que ele participa da conversa.

const BUCKET = "chat-interno";
const TAMANHO_MAXIMO = 50 * 1024 * 1024;

export type ResultadoAcao<T = undefined> = { ok: true; dados: T } | { ok: false; mensagem: string };
export type ArquivoInterno = { url: string; contentType: string | null; nome: string | null; tipo: string };
export type AnexoParaEnviar = { storage_path: string; content_type: string; file_name: string; size_bytes: number; kind: string };

function nomeSeguro(nome: string) {
  const limpo = nome.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-100);
  return limpo || "arquivo";
}

/**
 * Libera o envio de UM arquivo direto do navegador pro Storage (link de upload assinado, uso único).
 * Assim arquivo grande não passa pela função do servidor (limite de ~4,5 MB na Vercel).
 */
export async function prepararEnvioArquivoAction(
  threadId: string,
  nomeArquivo: string,
  tamanho: number,
): Promise<ResultadoAcao<{ caminho: string; token: string }>> {
  if (tamanho > TAMANHO_MAXIMO) return { ok: false, mensagem: "Arquivo maior que 50 MB." };
  const { supabase } = await getCurrentUserContext();
  // RLS: só devolve a conversa se o usuário participa dela.
  const { data: conversa } = await supabase.from("internal_threads").select("id, company_id").eq("id", threadId).maybeSingle();
  if (!conversa) return { ok: false, mensagem: "Conversa não encontrada." };

  const caminho = `${conversa.company_id}/${conversa.id}/${crypto.randomUUID()}-${nomeSeguro(nomeArquivo)}`;
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error || !data) return { ok: false, mensagem: `Não foi possível preparar o envio: ${error?.message ?? "erro"}` };
  return { ok: true, dados: { caminho: data.path, token: data.token } };
}

export async function enviarMensagemInternaAction(
  threadId: string,
  corpo: string,
  anexos: AnexoParaEnviar[],
  chave: string,
): Promise<ResultadoAcao<{ id: string }>> {
  const { supabase } = await getCurrentUserContext();
  const { data, error } = await supabase.rpc("enviar_mensagem_interna", {
    p_thread_id: threadId,
    p_corpo: corpo,
    p_anexos: anexos,
    p_chave: chave,
  });
  if (error) return { ok: false, mensagem: error.message };
  return { ok: true, dados: { id: data as string } };
}

/** Links temporários (1 h) dos arquivos das mensagens — só das que a RLS deixou o usuário ver. */
export async function obterArquivosInternosAction(messageIds: string[]): Promise<Record<string, ArquivoInterno[]>> {
  if (messageIds.length === 0) return {};
  const { supabase } = await getCurrentUserContext();
  const { data: anexos } = await supabase
    .from("internal_message_attachments")
    .select("message_id, storage_path, content_type, file_name, kind")
    .in("message_id", messageIds.slice(0, 300));
  if (!anexos || anexos.length === 0) return {};

  const { data: assinados } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrls(
      anexos.map((a) => a.storage_path),
      60 * 60,
    );
  const urlPorCaminho = new Map((assinados ?? []).map((s) => [s.path, s.signedUrl]));
  const resultado: Record<string, ArquivoInterno[]> = {};
  for (const anexo of anexos) {
    const url = urlPorCaminho.get(anexo.storage_path);
    if (!url) continue;
    (resultado[anexo.message_id] ??= []).push({ url, contentType: anexo.content_type, nome: anexo.file_name, tipo: anexo.kind });
  }
  return resultado;
}

export async function abrirConversaDiretaAction(colegaId: string): Promise<ResultadoAcao<{ id: string }>> {
  const { supabase } = await getCurrentUserContext();
  const { data, error } = await supabase.rpc("abrir_conversa_interna_direta", { p_outro: colegaId });
  if (error) return { ok: false, mensagem: error.message };
  return { ok: true, dados: { id: data as string } };
}

export async function criarGrupoInternoAction(titulo: string, membros: string[]): Promise<ResultadoAcao<{ id: string }>> {
  const { supabase } = await getCurrentUserContext();
  const { data, error } = await supabase.rpc("criar_grupo_interno", { p_titulo: titulo, p_membros: membros });
  if (error) return { ok: false, mensagem: error.message };
  return { ok: true, dados: { id: data as string } };
}

export async function marcarConversaInternaLidaAction(threadId: string): Promise<void> {
  const { supabase } = await getCurrentUserContext();
  await supabase.rpc("marcar_conversa_interna_lida", { p_thread_id: threadId });
}
