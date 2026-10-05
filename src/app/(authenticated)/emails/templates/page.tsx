import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { displayValue, formatDateTime } from "@/lib/clients/formatters";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getLegalWorkflowStage,
  legalWorkflowStages,
  mapLegalWorkflowStageRow,
} from "@/lib/legal/workflow";
import {
  emailRecipientModes,
  formatEmailRecipientMode,
  type EmailTemplate,
} from "@/types/email";
import {
  createEmailTemplateAction,
  toggleEmailTemplateStatusAction,
} from "@/app/(authenticated)/emails/templates/actions";

type EmailTemplatesPageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

function canManageEmailTemplates(role: string | null) {
  return role === "admin" || role === "manager";
}

function getLegalStageLabel(
  stage: string | null,
  stages: typeof legalWorkflowStages,
) {
  return stage ? getLegalWorkflowStage(stage, stages).shortLabel : "Geral";
}

function getBanner(params: { success?: string; error?: string }) {
  if (params.success === "created") {
    return {
      tone: "success" as const,
      text: "Template de email criado.",
    };
  }

  if (params.error === "permission") {
    return {
      tone: "error" as const,
      text: "Você não tem permissão para gerenciar templates de email.",
    };
  }

  if (params.error) {
    const decodedError = decodeURIComponent(params.error);

    return {
      tone: "error" as const,
      text:
        decodedError === "invalid"
          ? "Preencha nome, assunto e corpo do email."
          : decodedError,
    };
  }

  return null;
}

export default async function EmailTemplatesPage({
  searchParams,
}: EmailTemplatesPageProps) {
  const params = await searchParams;
  const { companyId, role, businessArea } = await getCurrentUserContext();

  if (!canManageEmailTemplates(role)) {
    redirect(businessArea === "legal" ? "/juridico" : "/pre-vendas");
  }

  const adminClient = createAdminClient();
  const [
    { data, error },
    { data: stagesData, error: stagesError },
  ] = await Promise.all([
    adminClient
      .from("email_templates")
      .select("*")
      .eq("company_id", companyId)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true }),
    adminClient
      .from("legal_workflow_stages")
      .select("id, legacy_key, title, short_title, description, color, expected_documents, position")
      .eq("company_id", companyId)
      .order("position"),
  ]);
  const templates = (data ?? []) as EmailTemplate[];
  const workflowStages = !stagesError && stagesData?.length
    ? stagesData.map(mapLegalWorkflowStageRow)
    : legalWorkflowStages;
  const banner = getBanner(params);

  return (
    <>
      <PageHeader
        title="Gestão"
        description="Cadastre os assuntos e corpos usados pelo jurídico nos emails para clientes e bancos."
      />
      <div className="space-y-6 p-6">
        {banner ? (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              banner.tone === "success"
                ? "border-teal-200 bg-teal-50 text-teal-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {banner.text}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Novo template</h2>
          <form action={createEmailTemplateAction} className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="name">
                Nome do template
              </label>
              <input
                id="name"
                name="name"
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                placeholder="Ex.: Notificacao extrajudicial ao banco"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="legal_stage">
                Etapa jurídica
              </label>
              <select
                id="legal_stage"
                name="legal_stage"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              >
                <option value="">Geral</option>
                {workflowStages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="recipient_mode">
                Destinatario padrão
              </label>
              <select
                id="recipient_mode"
                name="recipient_mode"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              >
                {emailRecipientModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="subject_template">
                Assunto
              </label>
              <input
                id="subject_template"
                name="subject_template"
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                placeholder="Ex.: {{nome_cliente}} - Notificacao extrajudicial"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="cc_template">
                Cc padrão
              </label>
              <input
                id="cc_template"
                name="cc_template"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                placeholder="Opcional"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="bcc_template">
                Cco padrão
              </label>
              <input
                id="bcc_template"
                name="bcc_template"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                placeholder="Opcional"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="body_template">
                Corpo do email
              </label>
              <textarea
                id="body_template"
                name="body_template"
                rows={8}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                placeholder="Use tags como {{nome_cliente}}, {{cpf}}, {{banco}}, {{numero_contrato}}."
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
              >
                Cadastrar template
              </button>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-950">
              Templates cadastrados
            </h2>
          </div>
          {error ? (
            <div className="px-6 py-4 text-sm text-red-700">{error.message}</div>
          ) : templates.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Nome</th>
                    <th className="px-6 py-3 font-semibold">Etapa</th>
                    <th className="px-6 py-3 font-semibold">Destinatario</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold">Criado em</th>
                    <th className="px-6 py-3 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {templates.map((template) => (
                    <tr key={template.id} className="transition hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-950">{template.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {displayValue(template.subject_template)}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {getLegalStageLabel(
                          template.legal_stage_id ?? template.legal_stage,
                          workflowStages,
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {formatEmailRecipientMode(template.recipient_mode)}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {template.is_active ? "Ativo" : "Inativo"}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {formatDateTime(template.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <form
                          action={toggleEmailTemplateStatusAction.bind(
                            null,
                            template.id,
                            !template.is_active,
                          )}
                        >
                          <button
                            type="submit"
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            {template.is_active ? "Desativar" : "Ativar"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-6 text-sm text-slate-500">
              Nenhum template de email cadastrado.
            </div>
          )}
        </section>
      </div>
    </>
  );
}
