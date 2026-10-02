"use server";

// Sem revalidatePath aqui de propósito: a tela de atendimento busca tudo do lado do cliente, então
// revalidar a rota só fazia o servidor redesenhar a página a cada ação (mais lento, nada muda).
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { acharOuCriarContato, despacharMensagem, despacharPendentes } from "@/lib/atendimento/whatsapp";

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
  "Envio bloqueado: o WhatsApp deste número ainda não está conectado ao CRM. Responda pelo Totalk por enquanto (nota interna funciona).";

/**
 * Canal importado do Totalk (provider="totalk") ainda não tem WhatsApp ligado no CRM. Sem esta
 * trava, a mensagem ficaria na fila (outbound_jobs) e poderia sair de verdade pro cliente no dia
 * em que o número fosse conectado — dias depois, fora de contexto. Liberação da tela pra equipe
 * testar (30/09/2026) tornou isso provável.
 */
async function canalSemWhatsApp(supabase: Awaited<ReturnType<typeof getCurrentUserContext>>["supabase"], conversationId: string) {
  const { data } = await supabase.from("conversations").select("channel:channels(provider)").eq("id", conversationId).maybeSingle();
  const canal = (data as { channel: { provider: string } | null } | null)?.channel;
  // Fail-closed: só canal com WhatsApp conectado pela Evolution envia (02/10/2026).
  return !canal || canal.provider !== "evolution";
}

/**
 * Alguém da equipe escreveu ao cliente numa conversa que estava com a IA: a IA para (o turno dela relê o
 * status antes de responder) e a conversa fica com quem escreveu.
 */
async function equipeAssumeDaIa(conversationId: string, userProfileId: string) {
  await createAdminClient()
    .from("conversations")
    .update({ status: "humano", assigned_user_profile_id: userProfileId })
    .eq("id", conversationId)
    .eq("status", "ia")
    .is("assigned_user_profile_id", null);
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
  // Envia na hora pelo WhatsApp; se falhar, fica pendente e o ciclo da tela tenta de novo.
  if (resultado?.message_id && !resultado.ja_existia) {
    await equipeAssumeDaIa(conversationId, userProfileId);
    await despacharMensagem(resultado.message_id).catch((erro) => console.error("[whatsapp] envio imediato:", erro));
  }
  return { ok: true, message: resultado?.ja_existia ? "Mensagem já enviada." : "Mensagem enviada." };
}

const TAMANHO_MAXIMO_ANEXO = 16 * 1024 * 1024; // limite do WhatsApp pra áudio/vídeo/foto

function nomeArquivoSeguro(nome: string) {
  return nome.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-100) || "arquivo";
}

/**
 * Libera o envio de UM arquivo do navegador direto pro Storage (link de upload assinado, uso único) —
 * arquivo não passa pela função do servidor (limite de ~4,5 MB da Vercel). A conversa é lida com a sessão
 * do usuário: se a RLS não deixa ele ver a conversa, não libera nada.
 */
export async function prepararEnvioAnexoAction(
  conversationId: string,
  nomeArquivo: string,
  tamanho: number,
): Promise<AtendimentoActionState & { caminho?: string; token?: string }> {
  if (tamanho > TAMANHO_MAXIMO_ANEXO) return { ok: false, message: "Arquivo maior que 16 MB (limite do WhatsApp)." };
  const { supabase } = await getCurrentUserContext();
  const { data: conversa } = await supabase.from("conversations").select("id, company_id").eq("id", conversationId).maybeSingle();
  if (!conversa) return { ok: false, message: "Conversa não encontrada." };
  if (await canalSemWhatsApp(supabase, conversationId)) return { ok: false, message: AVISO_SEM_WHATSAPP };

  const caminho = `${conversa.company_id}/${conversa.id}/envio/${crypto.randomUUID()}-${nomeArquivoSeguro(nomeArquivo)}`;
  const { data, error } = await createAdminClient().storage.from("atendimento-anexos").createSignedUploadUrl(caminho);
  if (error || !data) return { ok: false, message: `Não foi possível preparar o envio: ${error?.message ?? "erro"}.` };
  return { ok: true, message: "", caminho: data.path, token: data.token };
}

function tipoMensagemDoArquivo(mime: string) {
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("video/")) return "video";
  return "documento";
}

/**
 * Envia ao cliente um arquivo que o navegador já subiu (prepararEnvioAnexoAction): áudio gravado, foto,
 * vídeo ou documento. Mesma garantia do texto — mensagem + job numa transação (enviar_mensagem_com_job),
 * idempotente pela chave. O anexo é registrado antes do envio imediato.
 */
export async function enviarAnexoAction(
  conversationId: string,
  arquivo: { caminho: string; nome: string; tipo: string; tamanho: number },
  idempotencyKey: string,
  legenda?: string,
  respostaA?: string | null,
): Promise<AtendimentoActionState> {
  const { supabase, userProfileId, companyId } = await getCurrentUserContext();
  // Só aceita caminho que o próprio prepararEnvioAnexoAction gera pra ESTA conversa.
  if (!arquivo.caminho.startsWith(`${companyId}/${conversationId}/envio/`) || arquivo.caminho.includes("..")) {
    return { ok: false, message: "Arquivo inválido." };
  }
  if (await canalSemWhatsApp(supabase, conversationId)) return { ok: false, message: AVISO_SEM_WHATSAPP };

  const tipoMensagem = tipoMensagemDoArquivo(arquivo.tipo);
  const { data, error } = await supabase.rpc("enviar_mensagem_com_job", {
    p_conversation_id: conversationId,
    p_company_id: companyId,
    p_author_user_profile_id: userProfileId,
    p_body: (legenda ?? "").trim(),
    p_message_type: tipoMensagem,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return { ok: false, message: `Não foi possível enviar: ${error.message}.` };

  const resultado = data?.[0];
  if (resultado?.message_id && !resultado.ja_existia) {
    const { error: erroAnexo } = await createAdminClient().from("message_attachments").insert({
      message_id: resultado.message_id,
      company_id: companyId,
      storage_path: arquivo.caminho,
      content_type: arquivo.tipo || "application/octet-stream",
      file_name: nomeArquivoSeguro(arquivo.nome),
      size_bytes: arquivo.tamanho,
    });
    if (erroAnexo) return { ok: false, message: `Não foi possível registrar o arquivo: ${erroAnexo.message}.` };
    if (respostaA) await supabase.rpc("definir_resposta_mensagem", { p_message_id: resultado.message_id, p_reply_to: respostaA });
    await equipeAssumeDaIa(conversationId, userProfileId);
    await despacharMensagem(resultado.message_id).catch((erro) => console.error("[whatsapp] envio imediato:", erro));
  }
  const rotulo = { audio: "Áudio enviado", imagem: "Foto enviada", video: "Vídeo enviado", documento: "Arquivo enviado" }[tipoMensagem];
  return { ok: true, message: resultado?.ja_existia ? "Já tinha sido enviado." : `${rotulo}.` };
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
  const { supabase, userProfileId, companyId, role, isPlatformOwner } = await getCurrentUserContext();
  // Só gerente/administrador/master transfere (pedido do Gabriel, 02/10/2026).
  if (!(role === "admin" || role === "manager" || isPlatformOwner)) {
    return { ok: false, message: "Só gerente transfere conversa." };
  }

  const { data: conversaAtual } = await supabase
    .from("conversations")
    .select("assigned_user_profile_id, unread_count")
    .eq("id", conversationId)
    .maybeSingle();

  // Quem recebe precisa perceber (pedido do Gabriel, 02/10/2026): a conversa sobe pro topo (atividade
  // agora) e fica não lida — isso faz o avisador dele tocar e a lista mostrar "Contato novo".
  const paraOutraPessoa = paraUserProfileId !== userProfileId;
  const { data, error } = await supabase
    .from("conversations")
    .update({
      assigned_user_profile_id: paraUserProfileId,
      ...(paraOutraPessoa ? { last_activity_at: new Date().toISOString(), unread_count: Math.max(conversaAtual?.unread_count ?? 0, 1) } : {}),
    })
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

  // Registro na própria conversa (nota interna — não vai pro cliente): pra quem recebe saber de onde veio.
  const { data: perfis } = await supabase.from("user_profiles").select("id, full_name, business_area").in("id", [paraUserProfileId, userProfileId]);
  const destino = perfis?.find((p) => p.id === paraUserProfileId);
  const quem = perfis?.find((p) => p.id === userProfileId);
  const setor = destino?.business_area === "legal" ? "Jurídico" : destino?.business_area === "commercial" ? "Comercial" : null;
  await supabase.from("messages").insert({
    company_id: companyId,
    conversation_id: conversationId,
    direction: "saida",
    author_type: "sistema",
    author_user_profile_id: userProfileId,
    is_internal_note: true,
    message_type: "nota",
    body: `Conversa transferida para ${destino?.full_name ?? "outro atendente"}${setor ? ` (${setor})` : ""} por ${quem?.full_name ?? "gerente"}.${nota ? ` ${nota}` : ""}`,
    status: "criada",
  });

  return { ok: true, message: setor ? `Conversa transferida para o ${setor}.` : "Conversa transferida." };
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

  await despacharMensagem(messageId).catch((erro) => console.error("[whatsapp] reenvio:", erro));
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

/**
 * Re-tenta mensagens de WhatsApp que ficaram pendentes (queda da Evolution, timeout). Chamado pelo ciclo
 * de atualização da tela de atendimento — substitui o worker separado. Só usuário logado dispara.
 */
export async function despacharPendentesAction(): Promise<number> {
  await getCurrentUserContext();
  return despacharPendentes(5).catch(() => 0);
}

/**
 * Iniciar conversa com um número (contato novo ou que nunca falou pelo CRM) — pedido do Gabriel, 02/10/2026.
 * Quem inicia vira o responsável, e é isso que libera o Comercial a escrever nela (0013).
 *
 * Se o contato já tem conversa ABERTA nesse número com outra pessoa, não toma: o Comercial recebe o aviso
 * e abre só pra ler (transferir é com o gerente); Jurídico e gerente abrem e podem escrever nela.
 * Conversa concluída ou sem responsável passa pra quem iniciou.
 *
 * Gravação com a chave de serviço (consultor não tem permissão de criar conversa no banco), depois de
 * conferir aqui a empresa, o canal e o usuário.
 */
export async function iniciarConversaAction(
  canalId: string,
  telefone: string,
  nome: string,
): Promise<AtendimentoActionState & { conversationId?: string }> {
  const { supabase, userProfileId, companyId, role, isPlatformOwner, businessArea } = await getCurrentUserContext();

  let digitos = telefone.replace(/\D/g, "");
  // Sem código do país (DDD + número): Brasil.
  if (!telefone.trim().startsWith("+") && (digitos.length === 10 || digitos.length === 11)) digitos = `55${digitos}`;
  if (digitos.length < 12 || digitos.length > 15) return { ok: false, message: "Telefone inválido: use DDD + número (ex.: 11 91234-5678)." };

  // Leitura com a sessão do usuário: só acha canal da empresa dele.
  const { data: canal } = await supabase.from("channels").select("id, company_id, provider").eq("id", canalId).eq("company_id", companyId).maybeSingle();
  if (!canal) return { ok: false, message: "Número de WhatsApp não encontrado." };
  if (canal.provider !== "evolution") return { ok: false, message: AVISO_SEM_WHATSAPP };

  const admin = createAdminClient();
  const nomeLimpo = nome.trim().slice(0, 120) || null;
  const contatoId = await acharOuCriarContato(admin, companyId, digitos, nomeLimpo);
  if (nomeLimpo) {
    // Contato que já existia sem nome ganha o nome digitado (não troca nome que já tinha).
    await admin.from("contacts").update({ display_name: nomeLimpo }).eq("id", contatoId).is("display_name", null);
  }

  const { data: existentes } = await admin
    .from("conversations")
    .select("id, status, assigned_user_profile_id, assigned_user_profile:user_profiles!conversations_assigned_user_profile_id_fkey(full_name)")
    .eq("company_id", companyId)
    .eq("channel_id", canal.id)
    .eq("contact_id", contatoId)
    .order("last_activity_at", { ascending: false })
    .limit(1);
  const atual = existentes?.[0] as
    | { id: string; status: string; assigned_user_profile_id: string | null; assigned_user_profile: { full_name: string | null } | null }
    | undefined;
  const agora = new Date().toISOString();

  if (!atual) {
    const { data: nova, error } = await admin
      .from("conversations")
      .insert({ company_id: companyId, channel_id: canal.id, contact_id: contatoId, assigned_user_profile_id: userProfileId, status: "humano", last_activity_at: agora, unread_count: 0 })
      .select("id")
      .single();
    if (error || !nova) return { ok: false, message: `Não foi possível criar a conversa: ${error?.message ?? "erro"}.` };
    await admin.from("conversation_transfers").insert({ conversation_id: nova.id, company_id: companyId, from_user_profile_id: null, to_user_profile_id: userProfileId, transferred_by: userProfileId, note: "Conversa iniciada pelo CRM" });
    return { ok: true, message: "Conversa criada. Escreva a primeira mensagem.", conversationId: nova.id };
  }

  if (atual.assigned_user_profile_id === userProfileId) {
    if (atual.status === "encerrada") await admin.from("conversations").update({ status: "humano", last_activity_at: agora }).eq("id", atual.id);
    return { ok: true, message: "Você já atende este contato — conversa aberta.", conversationId: atual.id };
  }

  const comOutraPessoaAberta = atual.assigned_user_profile_id !== null && atual.status !== "encerrada";
  if (comOutraPessoaAberta) {
    const quem = atual.assigned_user_profile?.full_name ?? "outra pessoa";
    const podeEscrever = role === "admin" || role === "manager" || isPlatformOwner || businessArea === "legal";
    return {
      ok: true,
      message: podeEscrever
        ? `Este contato já está em atendimento com ${quem}. Conversa aberta.`
        : `Este contato já está em atendimento com ${quem}. Você pode ler; para escrever, peça ao gerente para transferir.`,
      conversationId: atual.id,
    };
  }

  // Concluída ou sem responsável: passa pra quem iniciou.
  await admin.from("conversations").update({ assigned_user_profile_id: userProfileId, status: "humano", last_activity_at: agora }).eq("id", atual.id);
  await admin.from("conversation_transfers").insert({
    conversation_id: atual.id,
    company_id: companyId,
    from_user_profile_id: atual.assigned_user_profile_id,
    to_user_profile_id: userProfileId,
    transferred_by: userProfileId,
    note: "Conversa iniciada pelo CRM",
  });
  return { ok: true, message: "Conversa aberta. Escreva a mensagem.", conversationId: atual.id };
}
