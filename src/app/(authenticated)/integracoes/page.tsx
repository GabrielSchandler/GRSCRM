import Link from "next/link";
import {
  disconnectTotalkIntegrationAction,
  saveTotalkIntegrationAction,
} from "@/app/(authenticated)/integracoes/actions";
import { OutlookDisconnectButton } from "@/components/email/outlook-disconnect-button";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { displayValue, formatDateTime } from "@/lib/clients/formatters";
import { getMicrosoftIntegrationForUser } from "@/lib/email/integrations";
import { getTotalkIntegrationStatus } from "@/lib/totalk/integrations";

type IntegracoesPageProps = {
  searchParams: Promise<{
    outlook?: string;
    totalk?: string;
    error?: string;
    details?: string;
  }>;
};

function canConnectOutlook(
  role: string | null,
  businessArea: string,
  legalRole: string | null,
) {
  return (
    role === "admin" ||
    role === "manager" ||
    (businessArea === "legal" && legalRole === "admin")
  );
}

function canManageTotalk(role: string | null, isPlatformOwner: boolean) {
  return isPlatformOwner || role === "admin" || role === "manager";
}

function getMessage(params: Awaited<IntegracoesPageProps["searchParams"]>) {
  if (params.outlook === "connected") {
    return {
      tone: "success" as const,
      text: "Outlook conectado com sucesso.",
    };
  }

  if (params.totalk === "saved") {
    return {
      tone: "success" as const,
      text: "Totalk conectada com sucesso.",
    };
  }

  if (params.totalk === "disconnected") {
    return {
      tone: "success" as const,
      text: "Integração Totalk desativada.",
    };
  }

  if (params.error === "permission") {
    return {
      tone: "error" as const,
      text: "Apenas administradores, gerentes ou adms jurídicos podem configurar integrações.",
    };
  }

  if (params.error?.startsWith("totalk_")) {
    return {
      tone: "error" as const,
      text: params.details
        ? decodeURIComponent(params.details)
        : "Não foi possível salvar a integração Totalk.",
    };
  }

  if (params.error === "outlook_config") {
    return {
      tone: "error" as const,
      text: "A integração Outlook ainda não está configurada na Vercel. Revise MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET e MICROSOFT_REDIRECT_URI.",
    };
  }

  if (params.error === "invalid_state") {
    return {
      tone: "error" as const,
      text: "A conexão expirou. Clique em Conectar Outlook novamente.",
    };
  }

  if (params.error === "outlook_denied") {
    return {
      tone: "error" as const,
      text: "A Microsoft recusou a autorização. Confirme o consentimento da conta e tente novamente.",
    };
  }

  if (params.error === "connect_failed") {
    return {
      tone: "error" as const,
      text: "Não foi possível finalizar a conexão com a Microsoft. Confira o segredo do aplicativo, a URL de callback e as permissões do Graph.",
    };
  }

  if (params.error) {
    return {
      tone: "error" as const,
      text: "Não foi possível conectar a integração. Revise as permissões e tente novamente.",
    };
  }

  return null;
}

export default async function IntegracoesPage({
  searchParams,
}: IntegracoesPageProps) {
  const params = await searchParams;
  const {
    companyId,
    userProfileId,
    role,
    businessArea,
    legalRole,
    isPlatformOwner,
  } = await getCurrentUserContext();
  const integration = await getMicrosoftIntegrationForUser(
    companyId,
    userProfileId,
  );
  const totalkIntegration = await getTotalkIntegrationStatus(companyId);
  const canConnect = canConnectOutlook(role, businessArea, legalRole);
  const canManageTotalkIntegration = canManageTotalk(role, isPlatformOwner);
  const message = getMessage(params);

  return (
    <>
      <PageHeader
        title="Gestão"
        description="Conecte canais externos usados pelo CRM para email, WhatsApp, importação de dados e envio de análises."
      />
      <div className="space-y-6 p-6">
        {message ? (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              message.tone === "success"
                ? "border-teal-200 bg-teal-50 text-teal-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Outlook do Adm jurídico
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                O email enviado no cliente sai pela conta Outlook do Adm
                responsável. Cada Adm jurídico conecta a própria conta uma vez.
              </p>
            </div>
            {canConnect ? (
              <Link
                href="/integracoes/outlook/connect"
                className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
              >
                {integration ? "Reconectar Outlook" : "Conectar Outlook"}
              </Link>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {integration ? "Conectado" : "Não conectado"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Email conectado
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {displayValue(integration?.email ?? null)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Último uso
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {formatDateTime(integration?.last_used_at ?? null)}
              </p>
            </div>
          </div>

          {!canConnect ? (
            <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Este usuário não está marcado como Adm jurídico. A conexão oficial
              do Outlook deve ser feita pelo Adm responsável.
            </p>
          ) : null}

          {integration ? (
            <div className="mt-6">
              <OutlookDisconnectButton />
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Totalk para simulações
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                A Totalk permite importar a anotação interna do contato pelo
                telefone e enviar o PDF da análise pelo WhatsApp oficial da
                empresa.
              </p>
            </div>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                totalkIntegration?.isActive
                  ? "border-teal-200 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {totalkIntegration?.isActive ? "Ativa" : "Não configurada"}
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Base da API
              </p>
              <p className="mt-2 break-all text-sm font-semibold text-slate-950">
                {displayValue(totalkIntegration?.apiBaseUrl ?? null)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Remetente
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {displayValue(totalkIntegration?.defaultSenderPhone ?? null)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Última importação
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {formatDateTime(totalkIntegration?.lastImportAt ?? null)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Último envio
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {formatDateTime(totalkIntegration?.lastSentAt ?? null)}
              </p>
            </div>
          </div>

          {!totalkIntegration ? (
            <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Se a tabela ainda não existir, rode o SQL{" "}
              <code className="font-semibold">docs/sql/totalk-integracao.sql</code>{" "}
              no Supabase antes de salvar o token.
            </p>
          ) : null}

          {canManageTotalkIntegration ? (
            <form
              action={saveTotalkIntegrationAction}
              className="mt-6 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2"
            >
              <div className="space-y-2">
                <label
                  htmlFor="api_base_url"
                  className="text-sm font-semibold text-slate-800"
                >
                  Endereço base da API
                </label>
                <input
                  id="api_base_url"
                  name="api_base_url"
                  defaultValue={
                    totalkIntegration?.apiBaseUrl ?? "https://api.app.totalk.chat"
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="api_token"
                  className="text-sm font-semibold text-slate-800"
                >
                  Token permanente
                </label>
                <input
                  id="api_token"
                  name="api_token"
                  type="password"
                  placeholder={
                    totalkIntegration
                      ? "Deixe em branco para manter o token atual"
                      : "Cole o token pn_..."
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="default_sender_phone"
                  className="text-sm font-semibold text-slate-800"
                >
                  Telefone/canal remetente
                </label>
                <input
                  id="default_sender_phone"
                  name="default_sender_phone"
                  defaultValue={totalkIntegration?.defaultSenderPhone ?? ""}
                  placeholder="Ex.: 5511999999999"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label
                  htmlFor="default_send_message"
                  className="text-sm font-semibold text-slate-800"
                >
                  Mensagem padrão para envio da análise
                </label>
                <textarea
                  id="default_send_message"
                  name="default_send_message"
                  rows={3}
                  defaultValue={totalkIntegration?.defaultSendMessage ?? ""}
                  placeholder="Use {{nome_cliente}} e {{protocolo}} se quiser personalizar."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                />
              </div>

              <div className="flex flex-wrap gap-2 md:col-span-2">
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
                >
                  Salvar Totalk
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Apenas administradores e gerentes podem configurar o token da
              Totalk.
            </p>
          )}

          {canManageTotalkIntegration && totalkIntegration?.isActive ? (
            <form action={disconnectTotalkIntegrationAction} className="mt-4">
              <button
                type="submit"
                className="rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
              >
                Desativar Totalk
              </button>
            </form>
          ) : null}
        </section>
      </div>
    </>
  );
}
