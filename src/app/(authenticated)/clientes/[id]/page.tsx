import { Edit } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DeleteClientButton } from "@/components/clients/delete-client-button";
import { ClientStatusBadge } from "@/components/clients/client-status-badge";
import { ClientToast } from "@/components/clients/client-toast";
import { CopyButton } from "@/components/clients/copy-button";
import {
  ClientDetailTabs,
  ClientTabPanel,
} from "@/components/clients/client-detail-tabs";
import { ReactivateClientButton } from "@/components/clients/reactivate-client-button";
import { WhatsAppLink } from "@/components/clients/whatsapp-link";
import { ClientDocumentsSection } from "@/components/client-documents/client-documents-section";
import { ClientTimelineSection } from "@/components/clients/client-timeline-section";
import { ClientTrackingSection } from "@/components/clients/client-tracking-section";
import {
  SendClientEmailModal,
  type EmailAttachmentOption,
} from "@/components/email/send-client-email-modal";
import { ClientCalculationsSection } from "@/components/calculations/client-calculations-section";
import { PageHeader } from "@/components/layout/page-header";
import { PreSalesStatusBadge } from "@/components/pre-sales/pre-sales-status-badge";
import {
  displayCpf,
  displayPhone,
  displayValue,
  formatDate,
  formatDateTime,
} from "@/lib/clients/formatters";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { listClientTimelineEvents } from "@/lib/client-timeline/service";
import { formatPreSaleType, formatUserName } from "@/lib/pre-sales/formatters";
import { listAccessiblePreSaleIdsForCurrentUser } from "@/lib/pre-sales/access";
import { resolveUserDisplayName } from "@/lib/users/account";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Client, ClientAuditUser } from "@/types/client";
import {
  documentStatusLabels,
  documentTemplateTypes,
  type DocumentTemplate,
  type DocumentTemplateType,
  type GeneratedDocument,
} from "@/types/document";
import { isDeletedClient } from "@/lib/clients/status";
import type { EmailTemplate } from "@/types/email";
import type { ClientTrackingUpdate } from "@/types/client-tracking";
import type { PreSale, PreSaleFinancialCase } from "@/types/pre-sale";

type ClientePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string }>;
};

const personalDetails = [
  ["CPF", "cpf"],
  ["RG", "rg"],
  ["Nacionalidade", "nationality"],
  ["Nascimento", "birth_date"],
  ["Estado civil", "marital_status"],
  ["Profissao", "profession"],
] as const;

const contactDetails = [
  ["Email", "email"],
  ["Celular", "phone_mobile"],
  ["Telefone secundario", "phone_secondary"],
] as const;

const addressDetails = [
  ["CEP", "zip_code"],
  ["Rua", "street"],
  ["Número", "number"],
  ["Bairro", "district"],
  ["Cidade", "city"],
  ["Estado", "state"],
] as const;

function formatTemplateType(type: DocumentTemplateType | null | undefined) {
  return documentTemplateTypes.find((item) => item.value === type)?.label ?? "-";
}

function copyableValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function renderCopyableValue(display: string, copyValue?: string | null) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {display}
      {copyValue ? <CopyButton value={copyValue} label="Copiar" /> : null}
    </span>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt)] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ns-muted)]">
        {label}
      </p>
      <div className="mt-1 text-sm font-semibold text-[var(--ns-text)]">{value}</div>
      {detail ? <p className="mt-1 text-xs text-[var(--ns-muted)]">{detail}</p> : null}
    </div>
  );
}

export default async function ClientePage({
  params,
  searchParams,
}: ClientePageProps) {
  const [{ id }, queryParams] = await Promise.all([params, searchParams]);
  const { supabase, companyId, role, businessArea, userProfileId } =
    await getCurrentUserContext();
  const adminClient = createAdminClient();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();
  const client = data as Client | null;

  if (error || !client) {
    notFound();
  }

  const accessiblePreSaleIds =
    role === "seller" && businessArea !== "legal"
      ? new Set((await listAccessiblePreSaleIdsForCurrentUser()) ?? [])
      : null;

  const [
    { data: createdByProfileData },
    { data: commercialConsultantProfileData },
    { data: legalResponsibleProfileData },
    { data: legalConsultantProfileData },
  ] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("id, full_name, nickname, username, email")
      .eq("id", client.created_by)
      .maybeSingle(),
    client.commercial_consultant_user_id
      ? supabase
          .from("user_profiles")
          .select("id, full_name, nickname, username, email")
          .eq("id", client.commercial_consultant_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    client.legal_responsible_user_id
      ? supabase
          .from("user_profiles")
          .select("id, full_name, nickname, username, email")
          .eq("id", client.legal_responsible_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    client.legal_consultant_user_id
      ? supabase
          .from("user_profiles")
          .select("id, full_name, nickname, username, email")
          .eq("id", client.legal_consultant_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const createdByProfile = createdByProfileData as ClientAuditUser | null;
  const commercialConsultantProfile = commercialConsultantProfileData as ClientAuditUser | null;
  const legalResponsibleProfile = legalResponsibleProfileData as ClientAuditUser | null;
  const legalConsultantProfile = legalConsultantProfileData as ClientAuditUser | null;

  const { data: generatedDocumentsData, error: generatedDocumentsError } = await supabase
    .from("generated_documents")
    .select(
      "id, title, document_type, template_id, status, render_source, created_at, pre_sale_id, client_id, pdf_error_message, created_by, company_id",
    )
    .eq("company_id", companyId)
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });
  let generatedDocuments = (generatedDocumentsData ?? []) as GeneratedDocument[];

  if (accessiblePreSaleIds) {
    generatedDocuments = generatedDocuments.filter(
      (document) =>
        document.pre_sale_id ? accessiblePreSaleIds.has(document.pre_sale_id) : false,
    );
  }

  const templateIds = Array.from(
    new Set(generatedDocuments.map((document) => document.template_id).filter(Boolean)),
  );
  const preSaleIds = Array.from(
    new Set(generatedDocuments.map((document) => document.pre_sale_id).filter(Boolean)),
  );

  const { data: clientPreSalesData, error: clientPreSalesError } = await supabase
    .from("pre_sales")
    .select("id, status, pre_sale_type, service_type, media, consultant_user_id, created_at, updated_at, created_by, legal_stage, legal_stage_updated_at, company_id, client_id, contract_value, payment_description, negotiation_details, tracking_protocol")
    .eq("company_id", companyId)
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });
  let clientPreSales = (clientPreSalesData ?? []) as PreSale[];

  if (accessiblePreSaleIds) {
    clientPreSales = clientPreSales.filter((preSale) => accessiblePreSaleIds.has(preSale.id));
  }

  const timelineEvents = await listClientTimelineEvents(companyId, client.id);
  const { data: trackingUpdatesData } = await adminClient
    .from("client_tracking_updates")
    .select("*")
    .eq("company_id", companyId)
    .eq("client_id", client.id)
    .is("deleted_at", null)
    .order("event_at", { ascending: false })
    .order("created_at", { ascending: false });
  const trackingUpdates = (trackingUpdatesData ?? []) as ClientTrackingUpdate[];
  const primaryEmailPreSale = clientPreSales[0] ?? null;
  const [
    { data: emailTemplatesData },
    { data: clientEmailDocumentsData },
    { data: emailFinancialCaseData },
  ] = await Promise.all([
      adminClient
        .from("email_templates")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("client_documents")
        .select("id, title, file_name, file_size")
        .eq("company_id", companyId)
        .eq("client_id", client.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      primaryEmailPreSale
        ? supabase
            .from("pre_sale_financial_cases")
            .select("*")
            .eq("pre_sale_id", primaryEmailPreSale.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
  ]);
  const emailTemplates = (emailTemplatesData ?? []) as EmailTemplate[];
  const clientEmailDocuments = (clientEmailDocumentsData ?? []) as EmailAttachmentOption[];
  const emailFinancialCase = emailFinancialCaseData as PreSaleFinancialCase | null;

  const consultantIds = Array.from(
    new Set(
      clientPreSales
        .flatMap((preSale) => [preSale.consultant_user_id, preSale.created_by])
        .filter(Boolean),
    ),
  );

  const [{ data: templatesData }, { data: preSalesData }, { data: consultantsData }] = await Promise.all([
    templateIds.length
      ? supabase
          .from("document_templates")
          .select("id, name")
          .eq("company_id", companyId)
          .in("id", templateIds)
      : Promise.resolve({ data: [] }),
    preSaleIds.length
      ? supabase
          .from("pre_sales")
          .select("id, status")
          .eq("company_id", companyId)
          .in("id", preSaleIds)
      : Promise.resolve({ data: [] }),
    consultantIds.length
      ? supabase
          .from("user_profiles")
          .select("id, full_name, username, email, role, nickname")
          .eq("company_id", companyId)
          .in("id", consultantIds)
      : Promise.resolve({ data: [] }),
  ]);
  const templates = (templatesData ?? []) as Pick<DocumentTemplate, "id" | "name">[];
  const preSales = (preSalesData ?? []) as Array<{ id: string; status: string | null }>;
  const consultants = (consultantsData ?? []) as Array<{
    id: string;
    full_name: string | null;
    username: string | null;
    email: string | null;
    role: string | null;
    nickname?: string | null;
  }>;

  const successMessage =
    queryParams.success === "created"
      ? "Cliente cadastrado com sucesso."
      : queryParams.success === "updated"
        ? "Cliente atualizado com sucesso."
        : queryParams.success === "reactivated"
          ? "Cliente reativado com sucesso."
          : null;
  const canUseLegalEmail = role !== "seller" || businessArea === "legal";
  const generatedDocumentsCount = generatedDocuments.length;
  const attachedDocumentsCount = clientEmailDocuments.length;
  const trackingUpdatesCount = trackingUpdates.length;
  const timelineEventsCount = timelineEvents.length;
  const latestPreSale = clientPreSales[0] ?? null;

  return (
    <>
      <PageHeader
        title="Cliente 360°"
        description={
          isDeletedClient(client)
            ? "Este cliente está excluído e não aparece na listagem padrão."
            : "Dados, contrato, documentos, simulações e histórico no mesmo contexto."
        }
      />
      <div className="space-y-6 p-6">
        {successMessage ? <ClientToast message={successMessage} /> : null}

        <section className="rounded-[12px] border border-[var(--ns-border)] bg-[var(--ns-surface)] px-6 py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#5267F5] text-base font-semibold text-white">
                {client.full_name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold text-[var(--ns-text)]">{client.full_name}</h1>
                <p className="mt-1 truncate text-sm text-[var(--ns-muted)]">
                  CPF {displayCpf(client.cpf)} · {displayPhone(client.phone_mobile)} · {displayValue(client.email)}
                </p>
                <div className="mt-3"><ClientStatusBadge client={client} /></div>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <div className="text-sm text-[var(--ns-muted)] lg:text-right">
                <p className="text-xs font-semibold uppercase tracking-wide">Consultor</p>
                <p className="mt-1 font-semibold text-[var(--ns-text)]">
                  {displayValue(resolveUserDisplayName(commercialConsultantProfile, ""))}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {isDeletedClient(client) ? null : (
                  <Link
                    href={`/clientes/${client.id}/editar`}
                    className="inline-flex items-center gap-2 rounded-[8px] bg-[var(--ns-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    <Edit className="h-4 w-4" />
                    Editar
                  </Link>
                )}
                <Link
                  href="/clientes"
                  className="rounded-[8px] border border-[var(--ns-border)] bg-[var(--ns-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--ns-text)] transition hover:bg-[var(--ns-surface-alt)]"
                >
                  Voltar
                </Link>
                <WhatsAppLink phone={client.phone_mobile} />
                {!isDeletedClient(client) && canUseLegalEmail ? (
                  <SendClientEmailModal
                    clientId={client.id}
                    preSaleId={primaryEmailPreSale?.id ?? null}
                    clientEmail={client.email}
                    bankName={emailFinancialCase?.financer_name ?? null}
                    templates={emailTemplates}
                    documents={clientEmailDocuments}
                    variables={{
                      nome_cliente: client.full_name,
                      cpf: client.cpf,
                      email_cliente: client.email ?? "Não informado",
                      telefone_cliente: client.phone_mobile,
                      banco: emailFinancialCase?.financer_name ?? "Não informado",
                      financeira: emailFinancialCase?.financer_name ?? "Não informado",
                      financeira_razao_social:
                        emailFinancialCase?.financer_legal_name ?? "Não informado",
                      financeira_cnpj: emailFinancialCase?.financer_cnpj ?? "Não informado",
                      numero_contrato: primaryEmailPreSale?.tracking_protocol ?? "Não informado",
                      numero_protocolo: primaryEmailPreSale?.tracking_protocol ?? "Não informado",
                      protocolo: primaryEmailPreSale?.tracking_protocol ?? "Não informado",
                      numero_contrato_financiamento:
                        emailFinancialCase?.contract_number ?? "Não informado",
                    }}
                  />
                ) : null}
                {!isDeletedClient(client) ? <DeleteClientButton clientId={client.id} /> : null}
                {role === "admin" && isDeletedClient(client) ? (
                  <ReactivateClientButton clientId={client.id} />
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <ClientDetailTabs
          tabs={[
            {
              id: "resumo",
              label: "Resumo",
              description: "Visão rapida do atendimento.",
            },
            {
              id: "dados",
              label: "Dados pessoais",
              description: "Cadastro, contato e responsáveis.",
            },
            {
              id: "acompanhamento",
              label: "Acompanhamento",
              description: "Portal e linha do tempo.",
              count: trackingUpdatesCount + timelineEventsCount,
            },
            {
              id: "documentacao",
              label: "Documentação",
              description: "Anexos e documentos emitidos.",
              count: attachedDocumentsCount + generatedDocumentsCount,
            },
            {
              id: "pre-vendas",
              label: "Pré-vendas",
              description: "Oportunidades do cliente.",
              count: clientPreSales.length,
            },
            {
              id: "simulacoes",
              label: "Simulações",
              description: "Análises revisionais.",
            },
          ]}
        >
          <ClientTabPanel id="resumo">
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
              <div className="rounded-[12px] border border-[var(--ns-border)] bg-[var(--ns-surface)] p-6 shadow-none">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <ClientStatusBadge client={client} />
                  <h2 className="mt-4 text-xl font-semibold text-[var(--ns-text)]">
                    Visão geral
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ns-muted)]">
                    Centralize a leitura principal do cliente antes de acessar dados,
                    documentos, pré-vendas ou histórico completo.
                  </p>
                </div>
                <div className="rounded-[8px] border border-[var(--ns-border)] bg-[color-mix(in_srgb,var(--ns-primary)_8%,var(--ns-surface))] px-4 py-3 text-sm text-[var(--ns-text)]">
                  <span className="font-semibold">Ultima atualizacao:</span>{" "}
                  {formatDateTime(client.updated_at)}
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2">
                <SummaryMetric
                  label="CPF"
                  value={renderCopyableValue(
                    displayCpf(client.cpf),
                    copyableValue(displayCpf(client.cpf)),
                  )}
                />
                <SummaryMetric
                  label="Celular"
                  value={renderCopyableValue(
                    displayPhone(client.phone_mobile),
                    client.phone_mobile ? displayPhone(client.phone_mobile) : null,
                  )}
                />
                <SummaryMetric
                  label="Pré-vendas"
                  value={clientPreSales.length}
                  detail={
                    latestPreSale
                      ? `Mais recente: ${formatDateTime(latestPreSale.created_at)}`
                      : "Nenhuma oportunidade vinculada."
                  }
                />
                <SummaryMetric
                  label="Documentos"
                  value={`${attachedDocumentsCount} anexado(s) / ${generatedDocumentsCount} gerado(s)`}
                  detail="Arquivos do cliente e documentos emitidos."
                />
                <SummaryMetric
                  label="Consultor comercial"
                  value={displayValue(
                    resolveUserDisplayName(commercialConsultantProfile, ""),
                  )}
                />
                <SummaryMetric
                  label="Adm jurídico"
                  value={displayValue(
                    resolveUserDisplayName(legalResponsibleProfile, ""),
                  )}
                />
                <SummaryMetric
                  label="Consultor jurídico"
                  value={displayValue(
                    resolveUserDisplayName(legalConsultantProfile, ""),
                  )}
                />
                <SummaryMetric
                  label="Acompanhamento"
                  value={`${trackingUpdatesCount} público(s) / ${timelineEventsCount} interno(s)`}
                  detail="Movimentações do portal e histórico interno."
                />
              </div>

              <div className="mt-6 rounded-[8px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ns-muted)]">
                  Observações
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--ns-text)]">
                  {displayValue(client.notes)}
                </p>
              </div>
              </div>
              <aside className="rounded-[12px] border border-[var(--ns-border)] bg-[var(--ns-surface)] p-6 shadow-none xl:sticky xl:top-4 xl:self-start">
                <h2 className="text-lg font-semibold text-[var(--ns-text)]">Linha do tempo</h2>
                <p className="mt-1 text-sm text-[var(--ns-muted)]">Tudo que aconteceu com este cliente</p>
                <div className="mt-5 space-y-4">
                  {timelineEvents.slice(0, 5).map((event) => (
                    <div key={event.id} className="border-l-2 border-[color-mix(in_srgb,var(--ns-primary)_35%,var(--ns-border))] pl-4">
                      <p className="text-xs font-semibold text-[var(--ns-muted)]">{formatDateTime(event.created_at)}</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--ns-text)]">{event.title}</p>
                      {event.note ? <p className="mt-1 text-sm text-[var(--ns-muted)]">{event.note}</p> : null}
                    </div>
                  ))}
                  {!timelineEvents.length ? <p className="text-sm text-[var(--ns-muted)]">Nenhuma movimentação registrada.</p> : null}
                </div>
              </aside>
            </section>
          </ClientTabPanel>

          <ClientTabPanel id="dados">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <ClientStatusBadge client={client} />
          </div>
          <div className="space-y-8">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Dados pessoais</h2>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                {personalDetails.map(([label, key]) => (
                  <div key={key}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-950">
                      {key === "birth_date" ? formatDate(client[key]) : null}
                      {key === "cpf" ? (
                        renderCopyableValue(
                          displayCpf(client[key]),
                          copyableValue(displayCpf(client[key])),
                        )
                      ) : null}
                      {key === "rg" || key === "nationality" || key === "marital_status" || key === "profession"
                        ? renderCopyableValue(displayValue(client[key]), copyableValue(displayValue(client[key])))
                        : null}
                      {key === "birth_date"
                        ? renderCopyableValue(
                            formatDate(client[key]),
                            copyableValue(formatDate(client[key])),
                          )
                        : null}
                      {key !== "birth_date" && key !== "cpf" && key !== "rg" && key !== "nationality" && key !== "marital_status" && key !== "profession"
                        ? displayValue(client[key])
                        : null}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-950">Contato</h2>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                {contactDetails.map(([label, key]) => (
                  <div key={key}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-950">
                      {key === "phone_mobile" || key === "phone_secondary" ? (
                        renderCopyableValue(
                          displayPhone(client[key]),
                          client[key] ? displayPhone(client[key]) : null,
                        )
                      ) : key === "email" ? (
                        renderCopyableValue(
                          displayValue(client[key]),
                          copyableValue(client[key]),
                        )
                      ) : (
                        displayValue(client[key])
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-950">Endereço</h2>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                {addressDetails.map(([label, key]) => (
                  <div key={key}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-950">
                      {renderCopyableValue(
                        displayValue(client[key]),
                        copyableValue(client[key]),
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-950">Auditoria</h2>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Criado em
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-950">
                    {formatDateTime(client.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Criado por
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-950">
                    {displayValue(resolveUserDisplayName(createdByProfile, ""))}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ultima atualizacao
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-950">
                    {formatDateTime(client.updated_at)}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-950">Comercial</h2>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Consultor comercial responsável
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-950">
                    {displayValue(resolveUserDisplayName(commercialConsultantProfile, ""))}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-950">Jurídico</h2>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Adm responsável
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-950">
                    {displayValue(resolveUserDisplayName(legalResponsibleProfile, ""))}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Consultor responsável
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-950">
                    {displayValue(resolveUserDisplayName(legalConsultantProfile, ""))}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-950">Observações</h2>
              <p className="mt-3 whitespace-pre-line text-sm font-medium text-slate-950">
                {displayValue(client.notes)}
              </p>
            </div>
          </div>
        </section>
          </ClientTabPanel>

          <ClientTabPanel id="acompanhamento">
            <div className="space-y-6">
              <ClientTrackingSection
                clientId={client.id}
                preSales={clientPreSales.map((preSale) => ({
                  id: preSale.id,
                  status: preSale.status,
                  pre_sale_type: preSale.pre_sale_type,
                  service_type: preSale.service_type,
                  tracking_protocol: preSale.tracking_protocol,
                  created_at: preSale.created_at,
                }))}
                updates={trackingUpdates}
              />

              <ClientTimelineSection
                clientId={client.id}
                events={timelineEvents}
                currentUserProfileId={userProfileId}
                canEditOwnNotes={businessArea === "legal"}
                canManageAllNotes={role === "admin" || role === "manager"}
              />
            </div>
          </ClientTabPanel>

          <ClientTabPanel id="documentacao">
            <div className="space-y-6">
              <ClientDocumentsSection
                clientId={client.id}
                title="Documentos do cliente"
                description="Anexe e consulte documentos vinculados a este cliente usando links temporarios e bucket privado."
                preSales={clientPreSales.map((preSale) => ({
                  id: preSale.id,
                  tracking_protocol: preSale.tracking_protocol,
                  service_type: preSale.service_type,
                  created_at: preSale.created_at,
                }))}
              />

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-950">
              Documentos gerados deste cliente
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Contratos, recibos e outros documentos emitidos a partir das pré-vendas
              vinculadas a este cliente.
            </p>
          </div>

          {generatedDocumentsError ? (
            <div className="px-6 py-4 text-sm text-red-700">
              {generatedDocumentsError.message}
            </div>
          ) : generatedDocuments.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Documento</th>
                    <th className="px-6 py-3 font-semibold">Tipo</th>
                    <th className="px-6 py-3 font-semibold">Template</th>
                    <th className="px-6 py-3 font-semibold">Pré-venda</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold">Data</th>
                    <th className="px-6 py-3 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {generatedDocuments.map((document) => {
                    const template = templates.find((item) => item.id === document.template_id);
                    const preSale = preSales.find((item) => item.id === document.pre_sale_id);

                    return (
                      <tr key={document.id} className="transition hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-950">
                          {displayValue(document.title)}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {formatTemplateType(document.document_type)}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {displayValue(template?.name ?? null)}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {document.pre_sale_id ? (
                            <Link
                              href={`/pre-vendas/${document.pre_sale_id}`}
                              className="font-semibold text-teal-700 transition hover:text-teal-800"
                            >
                              Ver pré-venda
                            </Link>
                          ) : (
                            "Não vinculada"
                          )}
                          {preSale?.status ? (
                            <p className="mt-1 text-xs text-slate-500">
                              Status: {preSale.status}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {document.pdf_error_message
                            ? "DOCX gerado, PDF pendente"
                            : documentStatusLabels[document.status] ?? document.status}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {formatDateTime(document.created_at)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/documentos/gerados/${document.id}`}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Visualizar
                            </Link>
                            {document.render_source === "html" ? (
                              <Link
                                href={`/documentos/gerados/${document.id}/imprimir?print=1`}
                                target="_blank"
                                className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 transition hover:bg-teal-100"
                              >
                                PDF HTML
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-6 text-sm text-slate-500">
              Nenhum documento gerado encontrado para este cliente.
            </div>
          )}
        </section>
            </div>
          </ClientTabPanel>

          <ClientTabPanel id="pre-vendas">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-950">
              Pré-vendas deste cliente
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Histórico comercial com acesso rapido as oportunidades abertas para este cliente.
            </p>
          </div>

          {clientPreSalesError ? (
            <div className="px-6 py-4 text-sm text-red-700">
              {clientPreSalesError.message}
            </div>
          ) : clientPreSales.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Tipo</th>
                    <th className="px-6 py-3 font-semibold">Serviço</th>
                    <th className="px-6 py-3 font-semibold">Mídia</th>
                    <th className="px-6 py-3 font-semibold">Protocolo</th>
                    <th className="px-6 py-3 font-semibold">Consultor</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold">Criada em</th>
                    <th className="px-6 py-3 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clientPreSales.map((preSale) => {
                    const consultant =
                      consultants.find(
                        (item) =>
                          item.id === preSale.consultant_user_id ||
                          item.id === preSale.created_by,
                      ) ??
                      null;

                    return (
                      <tr key={preSale.id} className="transition hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-950">
                          {formatPreSaleType(preSale.pre_sale_type)}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {displayValue(preSale.service_type)}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {displayValue(preSale.media)}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {renderCopyableValue(
                            displayValue(preSale.tracking_protocol),
                            copyableValue(preSale.tracking_protocol),
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {formatUserName(consultant)}
                        </td>
                        <td className="px-6 py-4">
                          <PreSalesStatusBadge status={preSale.status} />
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {formatDateTime(preSale.created_at)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/pre-vendas/${preSale.id}`}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Visualizar
                            </Link>
                            <Link
                              href={`/calculos/novo?preSaleId=${preSale.id}`}
                              className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 transition hover:bg-teal-100"
                            >
                              Simulação
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-6 text-sm text-slate-500">
              Nenhuma pré-venda encontrada para este cliente.
            </div>
          )}
        </section>
          </ClientTabPanel>

          <ClientTabPanel id="simulacoes">
            <ClientCalculationsSection clientId={client.id} />
          </ClientTabPanel>
        </ClientDetailTabs>
      </div>
    </>
  );
}
