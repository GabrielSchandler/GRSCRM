import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { baixarMidia, enviarAudio, enviarMidia, enviarTexto, ErroEvolution, lerTexto } from "./evolution";
import { CONFIG_IA } from "./ia/prompt";
import { executarTurnoIa } from "./ia/turno";

/**
 * Conversa sem responsável vai SEMPRE pra aba "IA", mesmo com a IA desligada (pedido do Gabriel,
 * 02/10/2026). Desligada, ninguém responde sozinho: os gerentes recebem o aviso (Notificador) pra assumir.
 */
const statusSemDono = () => "ia";

/**
 * WhatsApp real no atendimento do CRM (Evolution API, mesma instalação do NewSec Chat).
 *
 * ENTRADA — `processarEventoEvolution`: aviso que a Evolution manda a cada mensagem/status.
 *   - Canal achado por provider="evolution" + provider_channel_external_id = nome da instância.
 *   - Contato achado pelo telefone (com e sem o 9º dígito — o WhatsApp às vezes manda sem).
 *   - Conversa: a mais recente desse contato NESSE canal (o cliente continua na mesma conversa e com o
 *     mesmo dono); concluída é reaberta. Sem conversa no canal, cria — herdando o responsável da última
 *     conversa do contato em qualquer canal.
 *   - Mensagem deduplicada pelo id do WhatsApp (o mesmo aviso pode chegar duas vezes, e a mensagem que o
 *     próprio CRM enviou volta como "fromMe" — essa é ignorada).
 *
 * SAÍDA — `despacharMensagem` / `despacharPendentes`: consome outbound_jobs (criados por
 *   enviar_mensagem_com_job) sem worker separado: tenta na hora do envio e, se falhar, a tela de
 *   atendimento aberta re-tenta a cada ciclo. Fail-closed: só canal com provider="evolution" envia.
 *
 * Roda com a chave de serviço (é chamado pelo aviso da Evolution e por server actions já autenticadas).
 */

type Admin = ReturnType<typeof createAdminClient>;
const BUCKET = "atendimento-anexos";
const PROVEDOR = "evolution";

// ---------------------------------------------------------------------------------------------
// Telefone
// ---------------------------------------------------------------------------------------------

/** Variações do mesmo celular brasileiro: com e sem o 9 depois do DDD. */
export function variacoesTelefone(digitos: string): string[] {
  const d = digitos.replace(/\D/g, "");
  const lista = new Set([d]);
  if (d.startsWith("55") && d.length === 12 && /[6-9]/.test(d[4])) lista.add(`${d.slice(0, 4)}9${d.slice(4)}`);
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") lista.add(`${d.slice(0, 4)}${d.slice(5)}`);
  return [...lista];
}

/** Forma guardada no banco: 55 + DDD + número, com o 9 dos celulares. */
function telefoneCanonico(digitos: string) {
  const v = variacoesTelefone(digitos);
  return v.find((x) => x.length === 13) ?? v[0];
}

function telefoneDoJid(jid: string | null | undefined): string | null {
  if (!jid || !jid.endsWith("@s.whatsapp.net")) return null;
  const d = jid.replace(/@.*$/, "").replace(/\D/g, "");
  return d.length >= 10 ? d : null;
}

// ---------------------------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------------------------

type ConteudoMensagem = { tipo: "texto" | "imagem" | "audio" | "video" | "documento"; texto: string | null; temMidia: boolean; nomeArquivo: string | null; mimetype: string | null };

function extrairConteudo(mensagem: Record<string, unknown>): ConteudoMensagem | null {
  if (typeof mensagem.conversation === "string") return { tipo: "texto", texto: mensagem.conversation, temMidia: false, nomeArquivo: null, mimetype: null };
  const estendida = mensagem.extendedTextMessage as Record<string, unknown> | undefined;
  if (typeof estendida?.text === "string") return { tipo: "texto", texto: estendida.text, temMidia: false, nomeArquivo: null, mimetype: null };

  const mapa: [string, ConteudoMensagem["tipo"]][] = [
    ["imageMessage", "imagem"],
    ["stickerMessage", "imagem"],
    ["audioMessage", "audio"],
    ["videoMessage", "video"],
    ["documentMessage", "documento"],
    ["documentWithCaptionMessage", "documento"],
  ];
  for (const [campo, tipo] of mapa) {
    let bruto = mensagem[campo] as Record<string, unknown> | undefined;
    if (!bruto) continue;
    if (campo === "documentWithCaptionMessage") {
      bruto = ((bruto.message as Record<string, unknown> | undefined)?.documentMessage as Record<string, unknown> | undefined) ?? bruto;
    }
    return {
      tipo,
      texto: typeof bruto.caption === "string" ? bruto.caption : null,
      temMidia: true,
      nomeArquivo: typeof bruto.fileName === "string" ? bruto.fileName : null,
      mimetype: typeof bruto.mimetype === "string" ? bruto.mimetype : null,
    };
  }
  const localizacao = mensagem.locationMessage as Record<string, unknown> | undefined;
  if (localizacao) {
    return { tipo: "texto", texto: `📍 Localização: https://maps.google.com/?q=${localizacao.degreesLatitude},${localizacao.degreesLongitude}`, temMidia: false, nomeArquivo: null, mimetype: null };
  }
  const contato = mensagem.contactMessage as Record<string, unknown> | undefined;
  if (contato) {
    return { tipo: "texto", texto: `👤 Contato enviado: ${typeof contato.displayName === "string" ? contato.displayName : "sem nome"}`, temMidia: false, nomeArquivo: null, mimetype: null };
  }
  return null; // reação, protocolo, enquete... nada a guardar
}

/** Instância criada pra conectar um canal que JÁ existia (número do Totalk): "grscrm-ch-<id do canal>". */
export const PREFIXO_CANAL_EXISTENTE = "grscrm-ch-";

async function acharCanal(admin: Admin, instancia: string) {
  if (instancia.startsWith(PREFIXO_CANAL_EXISTENTE)) {
    // Achado pelo id no nome da instância — funciona já no segundo em que o celular conecta, antes
    // de a tela virar o canal para "evolution" (assim nenhuma mensagem desse intervalo se perde).
    const { data } = await admin.from("channels").select("id, company_id, name").eq("id", instancia.slice(PREFIXO_CANAL_EXISTENTE.length)).maybeSingle();
    return data;
  }
  const { data } = await admin
    .from("channels")
    .select("id, company_id, name")
    .eq("provider", PROVEDOR)
    .eq("provider_channel_external_id", instancia)
    .maybeSingle();
  return data;
}

export async function acharOuCriarContato(admin: Admin, companyId: string, telefone: string, nome: string | null) {
  const { data: existentes } = await admin
    .from("contact_phone_numbers")
    .select("contact_id, phone_e164")
    .eq("company_id", companyId)
    .in("phone_e164", variacoesTelefone(telefone))
    .limit(1);
  if (existentes?.[0]) return existentes[0].contact_id as string;

  const { data: contato, error } = await admin.from("contacts").insert({ company_id: companyId, display_name: nome }).select("id").single();
  if (error || !contato) throw new Error(`criar contato: ${error?.message}`);
  const { error: erroTel } = await admin
    .from("contact_phone_numbers")
    .insert({ contact_id: contato.id, company_id: companyId, phone_e164: telefoneCanonico(telefone), is_primary: true });
  if (erroTel?.code === "23505") {
    // outro aviso criou o mesmo contato no mesmo instante
    await admin.from("contacts").delete().eq("id", contato.id);
    const { data: recuperado } = await admin.from("contact_phone_numbers").select("contact_id").eq("company_id", companyId).eq("phone_e164", telefoneCanonico(telefone)).single();
    return recuperado!.contact_id as string;
  }
  if (erroTel) throw new Error(`gravar telefone: ${erroTel.message}`);
  return contato.id as string;
}

async function acharOuCriarConversa(admin: Admin, companyId: string, canalId: string, contatoId: string, entrada: boolean) {
  const { data: noCanal } = await admin
    .from("conversations")
    .select("id, status, assigned_user_profile_id")
    .eq("company_id", companyId)
    .eq("channel_id", canalId)
    .eq("contact_id", contatoId)
    .order("last_activity_at", { ascending: false })
    .limit(1);
  const atual = noCanal?.[0];
  if (atual) {
    // Cliente voltou a escrever numa conversa concluída: reabre com o mesmo dono.
    if (entrada && atual.status === "encerrada") {
      await admin.from("conversations").update({ status: atual.assigned_user_profile_id ? "humano" : statusSemDono() }).eq("id", atual.id);
    }
    return atual.id as string;
  }

  // Primeira conversa neste canal: herda o responsável da última conversa do contato (ex.: histórico do Totalk).
  const { data: anterior } = await admin
    .from("conversations")
    .select("assigned_user_profile_id, client_id")
    .eq("company_id", companyId)
    .eq("contact_id", contatoId)
    .order("last_activity_at", { ascending: false })
    .limit(1);
  const dono = anterior?.[0]?.assigned_user_profile_id ?? null;
  const { data: nova, error } = await admin
    .from("conversations")
    .insert({
      company_id: companyId,
      channel_id: canalId,
      contact_id: contatoId,
      client_id: anterior?.[0]?.client_id ?? null,
      assigned_user_profile_id: dono,
      status: dono ? "humano" : statusSemDono(),
      last_activity_at: new Date().toISOString(),
      unread_count: 0,
    })
    .select("id")
    .single();
  if (error || !nova) throw new Error(`criar conversa: ${error?.message}`);
  return nova.id as string;
}

async function guardarMidia(admin: Admin, instancia: string, idWhatsapp: string, companyId: string, conversaId: string, mensagemId: string, conteudo: ConteudoMensagem) {
  try {
    const midia = await baixarMidia(instancia, idWhatsapp);
    const tipo = midia.mimetype ?? conteudo.mimetype ?? "application/octet-stream";
    const extensao = tipo.split("/")[1]?.split(";")[0]?.replace("mpeg", "mp3") ?? "bin";
    const nome = (conteudo.nomeArquivo ?? midia.nome ?? `${conteudo.tipo}.${extensao}`).normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-100);
    const caminho = `${companyId}/${conversaId}/${mensagemId}/0-${nome}`;
    const bytes = Buffer.from(midia.base64, "base64");
    const { error } = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: tipo, upsert: true });
    if (error) throw new Error(error.message);
    await admin.from("message_attachments").insert({ message_id: mensagemId, company_id: companyId, storage_path: caminho, content_type: tipo, file_name: nome, size_bytes: bytes.length });
  } catch (erro) {
    // A mensagem fica (aparece "arquivo não disponível"); o erro vai pro log da Vercel.
    console.error(`[whatsapp] mídia ${idWhatsapp}: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

const ORDEM_STATUS: Record<string, number> = { pendente: 0, enviada: 1, entregue: 2, lida: 3 };

export async function processarEventoEvolution(carga: unknown): Promise<string> {
  const envelope = (carga ?? {}) as { event?: string; instance?: string; data?: unknown };
  const evento = (envelope.event ?? "").toLowerCase().replace(/_/g, ".");
  const instancia = envelope.instance ?? "";
  const admin = createAdminClient();

  if (evento === "messages.update") {
    const lista = Array.isArray(envelope.data) ? envelope.data : [envelope.data];
    for (const item of lista as Record<string, unknown>[]) {
      const id = lerTexto(item, ["keyId"]) ?? lerTexto(item, ["key", "id"]);
      const bruto = String(item?.status ?? "").toUpperCase();
      const novo = { SERVER_ACK: "enviada", DELIVERY_ACK: "entregue", READ: "lida", PLAYED: "lida" }[bruto];
      if (!id || !novo) continue;
      const canal = await acharCanal(admin, instancia);
      if (!canal) continue;
      const { data: msg } = await admin.from("messages").select("id, status").eq("company_id", canal.company_id).eq("external_id", id).maybeSingle();
      // Nunca volta pra trás (um "entregue" atrasado não desfaz o "lida").
      if (msg && (ORDEM_STATUS[novo] ?? 0) > (ORDEM_STATUS[msg.status as string] ?? -1)) {
        await admin.from("messages").update({ status: novo, ...(novo === "entregue" ? { delivered_at: new Date().toISOString() } : {}), ...(novo === "lida" ? { read_at: new Date().toISOString() } : {}) }).eq("id", msg.id);
      }
    }
    return "status";
  }

  if (evento !== "messages.upsert") return `ignorado: ${evento || "sem nome"}`;

  const dados = (Array.isArray(envelope.data) ? envelope.data[0] : envelope.data) as Record<string, unknown> | undefined;
  if (!dados) return "ignorado: sem dados";
  const chave = (dados.key ?? {}) as Record<string, unknown>;
  const idWhatsapp = typeof chave.id === "string" ? chave.id : null;
  const doProprioNumero = chave.fromMe === true;
  // Conversa de grupo, lista de transmissão e status não entram no atendimento.
  const jid = String(chave.remoteJid ?? "");
  const telefone =
    telefoneDoJid(jid) ?? telefoneDoJid(chave.remoteJidAlt as string) ?? telefoneDoJid(chave.senderPn as string) ?? null;
  if (!idWhatsapp || !telefone) return "ignorado: não é contato individual";

  const conteudo = extrairConteudo((dados.message ?? {}) as Record<string, unknown>);
  if (!conteudo) return "ignorado: sem conteúdo";

  const canal = await acharCanal(admin, instancia);
  if (!canal) return `ignorado: instância ${instancia} não é de nenhum canal`;

  // Já existe (aviso repetido, ou eco de mensagem enviada pelo próprio CRM).
  const jaGravada = async () =>
    (await admin.from("messages").select("id").eq("company_id", canal.company_id).eq("external_id", idWhatsapp).maybeSingle()).data;
  if (await jaGravada()) return "repetida";
  // Eco do que o CRM enviou pode chegar ANTES de o envio terminar de gravar o id do WhatsApp (com foto e
  // áudio isso é comum). Espera um pouco e confere de novo, pra não aparecer a mesma mensagem duas vezes.
  if (doProprioNumero) {
    await new Promise((fim) => setTimeout(fim, 3000));
    if (await jaGravada()) return "repetida";
  }

  const nomeContato = !doProprioNumero && typeof dados.pushName === "string" ? dados.pushName : null;
  const contatoId = await acharOuCriarContato(admin, canal.company_id, telefone, nomeContato);
  const conversaId = await acharOuCriarConversa(admin, canal.company_id, canal.id, contatoId, !doProprioNumero);
  const quando = Number(dados.messageTimestamp ?? 0) ? new Date(Number(dados.messageTimestamp) * 1000).toISOString() : new Date().toISOString();

  const { data: inserida, error } = await admin
    .from("messages")
    .insert({
      company_id: canal.company_id,
      conversation_id: conversaId,
      // Mensagem mandada direto pelo celular (fora do CRM) também entra no histórico, como saída.
      direction: doProprioNumero ? "saida" : "entrada",
      author_type: doProprioNumero ? "humano" : "cliente",
      is_internal_note: false,
      message_type: conteudo.tipo,
      body: conteudo.texto,
      status: doProprioNumero ? "enviada" : "recebida",
      external_id: idWhatsapp,
      created_at: quando,
      ...(doProprioNumero ? { sent_at: quando } : {}),
    })
    .select("id")
    .single();
  if (error?.code === "23505") return "repetida";
  if (error || !inserida) throw new Error(`gravar mensagem: ${error?.message}`);

  const previa = conteudo.texto?.slice(0, 200) ?? `[${conteudo.tipo}]`;
  const { data: conversa } = await admin.from("conversations").select("unread_count, status").eq("id", conversaId).single();
  await admin
    .from("conversations")
    .update({
      last_activity_at: quando,
      last_message_preview: previa,
      ...(doProprioNumero ? {} : { unread_count: (conversa?.unread_count ?? 0) + 1 }),
    })
    .eq("id", conversaId);

  if (conteudo.temMidia) await guardarMidia(admin, instancia, idWhatsapp, canal.company_id, conversaId, inserida.id, conteudo);

  // Conversa com a IA: ela responde DEPOIS de a Evolution receber o "ok" (after), pra o aviso não ficar
  // esperando a OpenAI. O turno espera uns segundos pra juntar mensagens seguidas do cliente.
  if (!doProprioNumero && conversa?.status === "ia") {
    const mensagemId = inserida.id as string;
    after(() =>
      executarTurnoIa(conversaId, mensagemId, despacharMensagem)
        .then((resultado) => console.log(`[ia] ${conversaId}: ${resultado}`))
        .catch((erro) => console.error(`[ia] ${conversaId}:`, erro)),
    );
  }
  return "gravada";
}

// ---------------------------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------------------------

type Job = { id: string; message_id: string; conversation_id: string; attempts: number; max_attempts: number };

/**
 * Exceção à assinatura pelo primeiro nome: quem atende o cliente com outro nome. Só o que sai pro
 * WhatsApp muda; dentro do CRM continua o nome do cadastro. (Pedido do Gabriel, 02/10/2026.)
 */
const NOME_NA_ASSINATURA: Record<string, string> = {
  "4a6dc2cb-6a67-4147-8cfb-3d2a16c57312": "Alice", // Verônica Silva
};

async function processarJob(admin: Admin, job: Job) {
  const { data: conversa } = await admin
    .from("conversations")
    .select("channel:channels(provider, provider_channel_external_id), contact:contacts(contact_phone_numbers(phone_e164, is_primary))")
    .eq("id", job.conversation_id)
    .single();
  const canal = (conversa as unknown as { channel: { provider: string; provider_channel_external_id: string | null } | null })?.channel;
  const telefones = (conversa as unknown as { contact: { contact_phone_numbers: { phone_e164: string; is_primary: boolean }[] } | null })?.contact?.contact_phone_numbers ?? [];
  const telefone = telefones.find((t) => t.is_primary)?.phone_e164 ?? telefones[0]?.phone_e164 ?? null;

  const falhaDefinitiva = async (motivo: string) => {
    await admin.from("outbound_jobs").update({ status: "falha", last_error: motivo, updated_at: new Date().toISOString() }).eq("id", job.id);
    await admin.from("messages").update({ status: "falha", failed_reason: motivo }).eq("id", job.message_id);
  };

  // Fail-closed: canal que não é WhatsApp conectado (ex.: histórico do Totalk) nunca envia.
  if (canal?.provider !== PROVEDOR || !canal.provider_channel_external_id) return falhaDefinitiva("Este canal não tem WhatsApp conectado ao CRM.");
  if (!telefone) return falhaDefinitiva("Contato sem telefone (número privado): não dá pra enviar pelo WhatsApp.");

  const { data: mensagem } = await admin
    .from("messages")
    .select("body, message_type, author_type, author_user_profile_id, author:user_profiles!messages_author_user_profile_id_fkey(full_name)")
    .eq("id", job.message_id)
    .single();
  const autor = (mensagem as unknown as { author: { full_name: string | null } | null })?.author;
  const autorId = (mensagem as { author_user_profile_id?: string | null } | null)?.author_user_profile_id;
  const tipo = (mensagem as { message_type?: string } | null)?.message_type ?? "texto";
  // Primeiro nome do campo "Nome" do cadastro, como era no Totalk ("*Mariza:*"). O apelido não serve:
  // em alguns cadastros ele é igual ao login (ex.: "gabriel.schandler").
  // Resposta da IA sai assinada com o nome dela ("*Ana:*").
  const daIa = (mensagem as { author_type?: string } | null)?.author_type === "ia";
  const nome = daIa ? CONFIG_IA.nome : (NOME_NA_ASSINATURA[autorId ?? ""] ?? (autor?.full_name?.trim().split(/\s+/)[0] || null));
  // Mesmo formato que o cliente já via no Totalk e que o NewSec Chat usa: nome em negrito em cima.
  const texto = nome ? `*${nome}:*\n${mensagem?.body ?? ""}` : (mensagem?.body ?? "");

  try {
    const instancia = canal.provider_channel_external_id;
    let idWhatsapp: string | null;
    if (tipo === "texto") {
      idWhatsapp = await enviarTexto(instancia, telefone, texto);
    } else {
      // Áudio/foto/vídeo/documento enviados pelo CRM: o arquivo já está no Storage (subiu direto do navegador).
      const { data: anexo } = await admin
        .from("message_attachments")
        .select("storage_path, content_type, file_name")
        .eq("message_id", job.message_id)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      // Sem anexo ainda (a action grava logo depois de criar a mensagem): passageiro, tenta de novo.
      if (!anexo) throw new Error("Arquivo da mensagem ainda não registrado.");
      const { data: link, error: erroLink } = await admin.storage.from(BUCKET).createSignedUrl(anexo.storage_path, 15 * 60);
      if (erroLink || !link) throw new Error(`Não foi possível ler o arquivo: ${erroLink?.message ?? "sem link"}`);
      if (tipo === "audio") {
        // Mensagem de voz não tem legenda: vai sem o nome (a voz já identifica quem fala).
        idWhatsapp = await enviarAudio(instancia, telefone, link.signedUrl);
      } else {
        const legenda = (mensagem?.body ?? "").trim();
        idWhatsapp = await enviarMidia(instancia, telefone, {
          tipo: tipo === "imagem" ? "image" : tipo === "video" ? "video" : "document",
          url: link.signedUrl,
          mimetype: anexo.content_type ?? "application/octet-stream",
          nomeArquivo: anexo.file_name ?? "arquivo",
          legenda: nome ? `*${nome}:*${legenda ? `\n${legenda}` : ""}` : legenda,
        });
      }
    }
    await admin.from("messages").update({ status: "enviada", external_id: idWhatsapp, sent_at: new Date().toISOString(), failed_reason: null }).eq("id", job.message_id);
    await admin.from("outbound_jobs").update({ status: "enviado", last_error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    // 400 da Evolution = número sem WhatsApp / pedido inválido: repetir não resolve.
    const permanente = erro instanceof ErroEvolution && erro.statusHttp === 400;
    const esgotou = permanente || job.attempts >= job.max_attempts;
    await admin
      .from("outbound_jobs")
      .update({
        status: esgotou ? "falha" : "pendente",
        last_error: motivo,
        next_attempt_at: new Date(Date.now() + Math.min(2 ** job.attempts * 5000, 300_000)).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await admin.from("messages").update({ status: esgotou ? "falha" : "pendente", failed_reason: motivo }).eq("id", job.message_id);
  }
}

/** Envia na hora uma mensagem recém-criada (chamado logo depois de enviar_mensagem_com_job). */
export async function despacharMensagem(messageId: string) {
  const admin = createAdminClient();
  const { data: job } = await admin.from("outbound_jobs").select("id, attempts").eq("message_id", messageId).eq("status", "pendente").maybeSingle();
  if (!job) return;
  // Reserva atômica: só um processo envia (o mesmo job pode estar sendo pego pelo ciclo de pendentes).
  const { data: reservado } = await admin
    .from("outbound_jobs")
    .update({ status: "processando", locked_at: new Date().toISOString(), locked_by: "envio-imediato", attempts: job.attempts + 1, updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "pendente")
    .select("id, message_id, conversation_id, attempts, max_attempts")
    .maybeSingle();
  if (reservado) await processarJob(admin, reservado as Job);
}

/** Re-tenta o que ficou pendente (chamado pelo ciclo da tela de atendimento). */
export async function despacharPendentes(limite = 5) {
  const admin = createAdminClient();
  const { data: jobs } = await admin.rpc("claim_outbound_jobs", { p_limit: limite, p_worker_id: "ciclo-tela", p_lease_minutes: 2 });
  for (const job of (jobs ?? []) as Job[]) await processarJob(admin, job);
  return (jobs ?? []).length;
}
