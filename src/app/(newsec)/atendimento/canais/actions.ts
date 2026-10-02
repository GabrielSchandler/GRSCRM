"use server";

import { headers } from "next/headers";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  configurarWebhook,
  criarInstancia,
  desconectarInstancia,
  estadoConexao,
  evolutionConfigurada,
  numeroConectado,
  pedirQrCode,
  type EstadoConexao,
} from "@/lib/atendimento/evolution";
import { PREFIXO_CANAL_EXISTENTE } from "@/lib/atendimento/whatsapp";

// Conectar número de WhatsApp ao CRM (02/10/2026). Só administrador da empresa ou master.
// Conectar/trocar os números que hoje estão no Totalk é decisão do Gabriel, no dia que ele escolher.

export type CanalWhatsapp = {
  id: string;
  nome: string;
  area: string;
  provedor: string;
  ativo: boolean;
  estado: EstadoConexao | "historico";
};
type Resultado<T = undefined> = { ok: true; dados: T } | { ok: false; mensagem: string };

async function exigirAdmin() {
  const contexto = await getCurrentUserContext();
  if (!(contexto.role === "admin" || contexto.isPlatformOwner)) throw new Error("Só administrador conecta número de WhatsApp.");
  return contexto;
}

async function urlDoWebhook() {
  const segredo = process.env.ATENDIMENTO_WEBHOOK_SEGREDO ?? "";
  if (segredo.length < 24) throw new Error("Falta ATENDIMENTO_WEBHOOK_SEGREDO (mín. 24 caracteres) na Vercel.");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const protocolo = h.get("x-forwarded-proto") ?? "https";
  return `${protocolo}://${host}/api/whatsapp/evolution/${segredo}`;
}

function formatarNumero(digitos: string) {
  const d = digitos.startsWith("55") ? digitos.slice(2) : digitos;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `+${digitos}`;
}

export async function listarCanaisAction(): Promise<Resultado<{ canais: CanalWhatsapp[]; configurado: boolean }>> {
  try {
    const { companyId } = await exigirAdmin();
    const admin = createAdminClient();
    const { data } = await admin
      .from("channels")
      .select("id, name, business_area, provider, provider_channel_external_id, status")
      .eq("company_id", companyId)
      .order("created_at");
    const canais = await Promise.all(
      (data ?? []).map(async (c) => ({
        id: c.id as string,
        nome: c.name as string,
        area: c.business_area as string,
        provedor: c.provider as string,
        ativo: c.status === "active",
        estado:
          c.provider === "evolution" && c.provider_channel_external_id && evolutionConfigurada()
            ? await estadoConexao(c.provider_channel_external_id).catch(() => "desconectado" as const)
            : ("historico" as const),
      })),
    );
    return { ok: true, dados: { canais, configurado: evolutionConfigurada() } };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
}

/** Cria um canal novo (número novo) e já devolve o QR Code pra ler no celular. */
export async function criarCanalAction(nome: string, area: "commercial" | "legal"): Promise<Resultado<{ canalId: string; qrCode: string | null }>> {
  try {
    const { companyId } = await exigirAdmin();
    if (!evolutionConfigurada()) throw new Error("WhatsApp não configurado no servidor (EVOLUTION_API_URL/EVOLUTION_API_KEY).");
    const webhook = await urlDoWebhook();
    const instancia = `grscrm-${companyId.slice(0, 8)}-${Date.now().toString(36)}`;
    const admin = createAdminClient();
    const { data: canal, error } = await admin
      .from("channels")
      .insert({
        company_id: companyId,
        name: nome.trim().slice(0, 80) || "WhatsApp",
        business_area: area,
        provider: "evolution",
        provider_channel_external_id: instancia,
        status: "inactive", // vira ativo quando o celular conectar
      })
      .select("id")
      .single();
    if (error || !canal) throw new Error(`Não foi possível criar o canal: ${error?.message}`);
    await criarInstancia(instancia, webhook);
    const { qrCode } = await pedirQrCode(instancia);
    return { ok: true, dados: { canalId: canal.id as string, qrCode } };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
}

async function instanciaDoCanal(canalId: string) {
  const { companyId } = await exigirAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("channels")
    .select("id, name, provider, provider_channel_external_id, status")
    .eq("id", canalId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) throw new Error("Canal não encontrado.");
  if (data.provider === "evolution" && data.provider_channel_external_id) {
    return { admin, canal: data, instancia: data.provider_channel_external_id as string };
  }
  // Canal do Totalk sendo conectado: a instância leva o id do canal no nome.
  if (data.provider === "totalk" && numeroDoNome(data.name as string)) {
    return { admin, canal: data, instancia: `${PREFIXO_CANAL_EXISTENTE}${data.id}` };
  }
  throw new Error("Este canal não tem um número de WhatsApp para conectar.");
}

/** "WhatsApp (11) 93916-2511" -> "11939162511". */
function numeroDoNome(nome: string) {
  const d = nome.replace(/\D/g, "");
  return d.length >= 10 ? d : null;
}

/**
 * Conecta, no MESMO canal, um número que era do Totalk: o histórico e o dono de cada conversa ficam
 * onde estão. Só vira canal "evolution" quando o celular conecta E o número confere com o do canal.
 */
export async function conectarCanalExistenteAction(canalId: string): Promise<Resultado<{ qrCode: string | null }>> {
  try {
    const { canal, instancia } = await instanciaDoCanal(canalId);
    if (canal.provider !== "totalk") throw new Error("Este canal já é do WhatsApp do CRM — use \"Ler QR Code\".");
    if (!evolutionConfigurada()) throw new Error("WhatsApp não configurado no servidor (EVOLUTION_API_URL/EVOLUTION_API_KEY).");
    const webhook = await urlDoWebhook();
    if ((await estadoConexao(instancia)) === "desconectado") {
      await criarInstancia(instancia, webhook).catch(async () => configurarWebhook(instancia, webhook)); // já existia: só reaponta o aviso
    } else {
      await configurarWebhook(instancia, webhook);
    }
    const { qrCode } = await pedirQrCode(instancia);
    return { ok: true, dados: { qrCode } };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
}

export async function qrCodeAction(canalId: string): Promise<Resultado<{ estado: EstadoConexao; qrCode: string | null }>> {
  try {
    const { instancia } = await instanciaDoCanal(canalId);
    await configurarWebhook(instancia, await urlDoWebhook()); // garante o aviso apontando pra este site
    return { ok: true, dados: await pedirQrCode(instancia) };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
}

/** Confere a conexão; ao conectar, ativa o canal e põe o número no nome. */
export async function statusCanalAction(canalId: string): Promise<Resultado<{ estado: EstadoConexao; numero: string | null }>> {
  try {
    const { admin, canal, instancia } = await instanciaDoCanal(canalId);
    const estado = await estadoConexao(instancia);
    let numero: string | null = null;
    if (estado === "conectado") {
      numero = await numeroConectado(instancia).catch(() => null);
      if (canal.provider === "totalk") {
        // Trava: o celular que leu o QR tem que ser o número DESTE canal.
        const esperado = numeroDoNome(canal.name as string)!;
        const lido = (numero ?? "").replace(/^55/, "");
        const confere = lido === esperado || lido === esperado.slice(0, 2) + esperado.slice(3) || lido.slice(0, 2) + "9" + lido.slice(2) === esperado;
        if (!confere) {
          await desconectarInstancia(instancia).catch(() => undefined);
          throw new Error(`O celular que leu o QR Code é o número +${numero ?? "?"}, não o deste canal (${canal.name}). A conexão foi desfeita.`);
        }
        await admin
          .from("channels")
          .update({ provider: "evolution", provider_channel_external_id: instancia, status: "active", updated_at: new Date().toISOString() })
          .eq("id", canalId);
        return { ok: true, dados: { estado, numero } };
      }
      if (canal.status !== "active") {
        await admin
          .from("channels")
          .update({ status: "active", ...(numero ? { name: `WhatsApp ${formatarNumero(numero)}` } : {}), updated_at: new Date().toISOString() })
          .eq("id", canalId);
      }
    }
    return { ok: true, dados: { estado, numero } };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
}

export async function desconectarCanalAction(canalId: string): Promise<Resultado> {
  try {
    const { admin, instancia } = await instanciaDoCanal(canalId);
    await desconectarInstancia(instancia);
    await admin.from("channels").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("id", canalId);
    return { ok: true, dados: undefined };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
}
