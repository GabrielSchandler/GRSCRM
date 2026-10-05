import { RecordTabs } from "@/components/newsec/record-tabs";
import { ReferenceFacts } from "@/components/newsec/reference-ui";
import type { ClientTimelineEvent } from "@/types/client-timeline";
import { Edit } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/clients/copy-button";
import { ClientToast } from "@/components/clients/client-toast";
import { WhatsAppLink } from "@/components/clients/whatsapp-link";
import { ClientDocumentsSection } from "@/components/client-documents/client-documents-section";
import { GenerateDocumentModal } from "@/components/documents/generate-document-modal";
import { LegalPaymentsPanel } from "@/components/legal/legal-payments-panel";
import { PageHeader } from "@/components/layout/page-header";
import { PreSaleDeleteButton } from "@/components/pre-sales/pre-sale-delete-button";
import { PreSalesStatusBadge } from "@/components/pre-sales/pre-sales-status-badge";
import { PreSalesStatusSelect } from "@/components/pre-sales/pre-sales-status-select";
import {
  displayCpf,
  displayValue,
  displayPhone,
  formatDate,
  formatDateTime,
} from "@/lib/clients/formatters";
import { formatCnpj } from "@/lib/clients/masks";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  formatBoolean,
  formatCurrency,
  formatPreSaleType,
  formatUserName,
} from "@/lib/pre-sales/formatters";
import { canAccessPreSaleRecord, canEditPreSaleRecord } from "@/lib/pre-sales/access";
import type { DocumentTemplate, GeneratedDocument } from "@/types/document";
import type { LegalPayment, LegalPaymentType } from "@/types/legal-payment";
import type {
  ClientOption,
  PreSale,
  PreSaleClientSnapshot,
  PreSaleDebtHolder,
  PreSaleFinancialCase,
  PreSalePayment,
  UserProfileOption,
} from "@/types/pre-sale";

type PreVendaPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    success?: string;
    legalPaymentSuccess?: string;
    legalPaymentError?: string;
  }>;
};

type DetailSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

function DetailSection({ title, description, children }: DetailSectionProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

function DetailItem({
  label,
  value,
  className = "",
  copyValue,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  copyValue?: string | null;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap items-start gap-2 text-sm font-medium text-slate-950">
        <div>{value}</div>
        {copyValue ? (
          <CopyButton
            value={copyValue}
            label="Copiar"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
          />
        ) : null}
      </div>
    </div>
  );
}

function copyableValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export default async function PreVendaPage({ params, searchParams }: PreVendaPageProps) {
  const [{ id }, queryParams] = await Promise.all([params, searchParams]);
  const { supabase, companyId, userProfileId, role, businessArea } =
    await getCurrentUserContext();

  const { data, error } = await supabase
    .from("pre_sales")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();
  const preSale = data as PreSale | null;

  if (error || !preSale) {
    notFound();
  }

  if (!canAccessPreSaleRecord(role, businessArea, userProfileId, preSale)) {
    notFound();
  }

  const [
    { data: clientData },
    { data: consultantData },
    { data: creatorData },
    { data: snapshotData },
    { data: debtHolderData },
    { data: financialCaseData },
    { data: paymentsData },
    { data: templatesData },
    { data: legalPaymentTypesData },
    { data: legalPaymentsData },
    { data: legalUsersData },
    { data: receiptDocumentsData },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, full_name, cpf, rg, birth_date, marital_status, profession, email, phone_mobile, phone_secondary, zip_code, street, number, district, city, state")
      .eq("id", preSale.client_id)
      .eq("company_id", companyId)
      .maybeSingle(),
    preSale.consultant_user_id
      ? supabase
          .from("user_profiles")
          .select("id, full_name, nickname, username, email, role")
          .eq("id", preSale.consultant_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("user_profiles")
      .select("id, full_name, nickname, username, email, role")
      .eq("id", preSale.created_by)
      .maybeSingle(),
    supabase
      .from("pre_sale_client_snapshot")
      .select("*")
      .eq("pre_sale_id", preSale.id)
      .maybeSingle(),
    supabase
      .from("pre_sale_debt_holders")
      .select("*")
      .eq("pre_sale_id", preSale.id)
      .maybeSingle(),
    supabase
      .from("pre_sale_financial_cases")
      .select("*")
      .eq("pre_sale_id", preSale.id)
      .maybeSingle(),
    supabase
      .from("pre_sale_payments")
      .select("*")
      .eq("pre_sale_id", preSale.id)
      .order("installment_number", { ascending: true }),
    supabase
      .from("document_templates")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("legal_payment_types")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("legal_payments")
      .select("*")
      .eq("company_id", companyId)
      .eq("pre_sale_id", preSale.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_profiles")
      .select("id, full_name, nickname, username, email, role, business_area, legal_role")
      .eq("company_id", companyId)
      .eq("business_area", "legal")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("generated_documents")
      .select("*")
      .eq("company_id", companyId)
      .eq("pre_sale_id", preSale.id)
      .not("legal_payment_id", "is", null),
  ]);

  const client = clientData as ClientOption | null;
  const consultant =
    (consultantData as UserProfileOption | null) ??
    (creatorData as UserProfileOption | null);
  const creator = creatorData as UserProfileOption | null;
  const snapshot = snapshotData as PreSaleClientSnapshot | null;
  const debtHolder = debtHolderData as PreSaleDebtHolder | null;
  const financialCase = financialCaseData as PreSaleFinancialCase | null;
  const payments = (paymentsData ?? []) as PreSalePayment[];
  const templates = (templatesData ?? []) as DocumentTemplate[];
  const legalPaymentTypes = (legalPaymentTypesData ?? []) as LegalPaymentType[];
  const legalPayments = (legalPaymentsData ?? []) as LegalPayment[];
  const legalUsers = (legalUsersData ?? []) as UserProfileOption[];
  const receiptDocuments = (receiptDocumentsData ?? []) as GeneratedDocument[];
  const legalPaymentTypesById = new Map(
    legalPaymentTypes.map((type) => [type.id, type]),
  );
  const legalUsersById = new Map(legalUsers.map((user) => [user.id, user]));
  const receiptDocumentsByLegalPaymentId = new Map(
    receiptDocuments
      .filter((document) => document.legal_payment_id)
      .map((document) => [document.legal_payment_id as string, document]),
  );
  const legalPaymentsWithRelations = legalPayments.map((payment) => ({
    ...payment,
    type: legalPaymentTypesById.get(payment.legal_payment_type_id) ?? null,
    responsible: payment.responsible_user_id
      ? legalUsersById.get(payment.responsible_user_id) ?? null
      : null,
    receiptDocument: payment.receipt_generated_document_id
      ? receiptDocuments.find(
          (document) => document.id === payment.receipt_generated_document_id,
        ) ?? receiptDocumentsByLegalPaymentId.get(payment.id) ?? null
      : receiptDocumentsByLegalPaymentId.get(payment.id) ?? null,
  }));
  const canEdit = canEditPreSaleRecord(role, businessArea, userProfileId, preSale);
  const canDelete = role === "admin" || role === "manager";
  const canManageLegalPayments =
    role === "admin" || role === "manager" || businessArea === "legal";
  const successMessage =
    queryParams.success === "created"
      ? "Pré-venda cadastrada com sucesso."
      : queryParams.success === "updated"
        ? "Pré-venda atualizada com sucesso."
        : null;


  const { data: activityRows, error: activityError } = await supabase
    .from("client_timeline_events").select("*")
    .eq("company_id", companyId).eq("pre_sale_id", preSale.id)
    .order("created_at", { ascending: false }).limit(8);
  const activities = (activityRows ?? []) as ClientTimelineEvent[];

  return <>
    <PageHeader title="Detalhe da pré-venda" description="Informações, dados financeiros e documentos desta oportunidade comercial." />
    <div className="reference-page space-y-4 p-4 sm:p-6">
      {successMessage ? <ClientToast message={successMessage} /> : null}
      <section className="ns-panel p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs text-[var(--ns-text-secondary)]">{displayValue(preSale.tracking_protocol)}</p><h2 className="text-xl font-semibold">{snapshot?.full_name ?? client?.full_name ?? "Pré-venda"}</h2><p className="mt-1 text-xs text-[var(--ns-text-secondary)]">{displayValue(preSale.service_type)}</p></div><PreSalesStatusBadge status={preSale.status} /></div><div className="mt-4 border-t border-[var(--ns-border)] pt-4">        <div className="flex flex-wrap gap-3">
          {canEdit ? (
            <Link
              href={`/pre-vendas/${preSale.id}/editar`}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              <Edit className="h-4 w-4" />
              Editar
            </Link>
          ) : null}
          {canDelete ? <PreSaleDeleteButton preSaleId={preSale.id} /> : null}
          <Link
            href="/pre-vendas"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Voltar para pré-vendas
          </Link>
          {client ? (
            <Link
              href={`/clientes/${client.id}`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Abrir cliente
            </Link>
          ) : null}
          <Link
            href={`/calculos/novo?preSaleId=${preSale.id}`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Criar simulação
          </Link>
          <GenerateDocumentModal preSaleId={preSale.id} templates={templates} />
          <WhatsAppLink phone={snapshot?.phone_mobile ?? client?.phone_mobile ?? null} />
        </div>

</div><div className="mt-4 grid gap-3 border-t border-[var(--ns-border)] pt-4 sm:grid-cols-2 xl:grid-cols-4">{[
  ["Cliente", snapshot?.full_name ?? client?.full_name ?? "Não informado"],
  ["Origem", displayValue(preSale.media)],
  ["Consultor responsável", formatUserName(consultant)],
  ["Valor do contrato", formatCurrency(preSale.contract_value)]
].map(([label,value]) => <div key={label} className="min-w-0"><p className="text-[10px] text-[var(--ns-text-secondary)]">{label}</p><p className="mt-1 break-words text-xs font-semibold">{value}</p></div>)}</div></section>
      <RecordTabs defaultIndex={queryParams.legalPaymentSuccess || queryParams.legalPaymentError ? 1 : 0} panels={[
        {label:"Resumo",content:<div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px]">
          <div className="space-y-4"><section className="ns-panel p-4"><h2 className="text-sm font-semibold">Dados do cliente</h2><ReferenceFacts items={[["Nome",snapshot?.full_name ?? client?.full_name ?? "Não informado"],["CPF",displayCpf(snapshot?.cpf ?? client?.cpf ?? null)],["E-mail",displayValue(snapshot?.email ?? client?.email ?? null)],["Telefone",displayPhone(snapshot?.phone_mobile ?? client?.phone_mobile ?? null)]]} />{client && <Link href={`/clientes/${client.id}`} className="text-xs font-semibold text-[var(--ns-primary)]">Ver cliente 360°</Link>}</section><section className="ns-panel p-4"><h2 className="text-sm font-semibold">Origem da oportunidade</h2><ReferenceFacts items={[["Mídia",displayValue(preSale.media)],["Tipo",formatPreSaleType(preSale.pre_sale_type)],["Consultor",formatUserName(consultant)]]} /></section></div>
          <div className="space-y-4"><section className="ns-panel p-4"><h2 className="text-sm font-semibold">Informações comerciais</h2><ReferenceFacts items={[["Valor do contrato",formatCurrency(preSale.contract_value)],["Serviço",displayValue(preSale.service_type)],["Financeira",displayValue(financialCase?.financer_name ?? null)],["Valor financiado",formatCurrency(financialCase?.financed_amount ?? null)],["Parcela",formatCurrency(financialCase?.installment_amount ?? null)]]} /></section><section className="ns-panel p-4"><h2 className="text-sm font-semibold">Observações da negociação</h2><p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[var(--ns-text-secondary)]">{preSale.negotiation_details || "Sem observações."}</p></section></div>
          <aside className="ns-panel self-start p-4 xl:sticky xl:top-4"><h2 className="text-sm font-semibold">Situação e registro</h2><div className="mt-4"><PreSalesStatusSelect preSaleId={preSale.id} status={preSale.status} disabled={!canEdit} /></div><ReferenceFacts items={[["Criado por",formatUserName(creator)],["Data de abertura",formatDateTime(preSale.created_at)],["Última atualização",formatDateTime(preSale.updated_at)]]} /><h2 className="mt-5 border-t border-[var(--ns-border)] pt-4 text-sm font-semibold">Timeline e atividades</h2>{activityError ? <p className="mt-3 text-xs text-[var(--ns-danger)]">Histórico indisponível.</p> : activities.length ? <ol className="mt-4 space-y-4 border-l border-[var(--ns-border)] pl-4">{activities.map(event => <li key={event.id} className="relative text-xs"><span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-[var(--ns-primary)]" /><p className="font-semibold">{event.title}</p><p className="mt-1 text-[var(--ns-text-secondary)]">{event.actor_name || "Sistema"}</p><p className="mt-1 text-[10px] text-[var(--ns-text-secondary)]">{formatDateTime(event.created_at)}</p>{event.note && <p className="mt-2 whitespace-pre-wrap break-words text-[var(--ns-text-secondary)]">{event.note}</p>}</li>)}</ol> : <p className="mt-3 text-xs text-[var(--ns-text-secondary)]">Nenhuma atividade registrada para esta pré-venda.</p>}</aside>
        </div>},
        {label:"Dados e pagamentos",content:<div className="reference-detail-sections">        <DetailSection title="Cabecalho">
          <DetailItem
            label="Status"
            value={
              <div className="flex flex-wrap items-center gap-3">
                <PreSalesStatusBadge status={preSale.status} />
                <PreSalesStatusSelect
                  preSaleId={preSale.id}
                  status={preSale.status}
                  disabled={!canEdit}
                />
              </div>
            }
          />
          <DetailItem
            label="Tipo"
            value={formatPreSaleType(preSale.pre_sale_type)}
            copyValue={formatPreSaleType(preSale.pre_sale_type)}
          />
          <DetailItem
            label="Protocolo"
            value={displayValue(preSale.tracking_protocol)}
            copyValue={copyableValue(preSale.tracking_protocol)}
          />
          <DetailItem
            label="Serviço"
            value={displayValue(preSale.service_type)}
            copyValue={copyableValue(preSale.service_type)}
          />
          <DetailItem
            label="Mídia"
            value={displayValue(preSale.media)}
            copyValue={copyableValue(preSale.media)}
          />
          <DetailItem
            label="Consultor"
            value={formatUserName(consultant)}
            copyValue={copyableValue(formatUserName(consultant))}
          />
          <DetailItem
            label="Criado por"
            value={formatUserName(creator)}
            copyValue={copyableValue(formatUserName(creator))}
          />
          <DetailItem
            label="Data de abertura"
            value={formatDateTime(preSale.created_at)}
            copyValue={copyableValue(formatDateTime(preSale.created_at))}
          />
          <DetailItem
            label="Ultima atualizacao"
            value={formatDateTime(preSale.updated_at)}
            copyValue={copyableValue(formatDateTime(preSale.updated_at))}
          />
        </DetailSection>

        <DetailSection
          title="Contratante"
          description="Snapshot preservado para contrato e ordem de serviço."
        >
          <DetailItem label="Nome" value={displayValue(snapshot?.full_name ?? null)} copyValue={copyableValue(snapshot?.full_name ?? null)} />
          <DetailItem label="CPF" value={displayCpf(snapshot?.cpf ?? null)} copyValue={copyableValue(displayCpf(snapshot?.cpf ?? null))} />
          <DetailItem label="RG" value={displayValue(snapshot?.rg ?? null)} copyValue={copyableValue(snapshot?.rg ?? null)} />
          <DetailItem label="Nascimento" value={formatDate(snapshot?.birth_date ?? null)} copyValue={copyableValue(formatDate(snapshot?.birth_date ?? null))} />
          <DetailItem label="Estado civil" value={displayValue(snapshot?.marital_status ?? null)} copyValue={copyableValue(snapshot?.marital_status ?? null)} />
          <DetailItem label="Profissao" value={displayValue(snapshot?.profession ?? null)} copyValue={copyableValue(snapshot?.profession ?? null)} />
          <DetailItem label="Email" value={displayValue(snapshot?.email ?? null)} copyValue={copyableValue(snapshot?.email ?? null)} />
          <DetailItem label="Celular" value={displayPhone(snapshot?.phone_mobile ?? null)} copyValue={copyableValue(displayPhone(snapshot?.phone_mobile ?? null))} />
          <DetailItem label="Telefone secundario" value={displayPhone(snapshot?.phone_secondary ?? null)} copyValue={copyableValue(displayPhone(snapshot?.phone_secondary ?? null))} />
          <DetailItem label="CEP" value={displayValue(snapshot?.zip_code ?? null)} copyValue={copyableValue(snapshot?.zip_code ?? null)} />
          <DetailItem label="Rua" value={displayValue(snapshot?.street ?? null)} copyValue={copyableValue(snapshot?.street ?? null)} />
          <DetailItem label="Número" value={displayValue(snapshot?.number ?? null)} copyValue={copyableValue(snapshot?.number ?? null)} />
          <DetailItem label="Bairro" value={displayValue(snapshot?.district ?? null)} copyValue={copyableValue(snapshot?.district ?? null)} />
          <DetailItem label="Cidade" value={displayValue(snapshot?.city ?? null)} copyValue={copyableValue(snapshot?.city ?? null)} />
          <DetailItem label="Estado" value={displayValue(snapshot?.state ?? null)} copyValue={copyableValue(snapshot?.state ?? null)} />
        </DetailSection>

        <DetailSection title="Titular da dívida">
          <DetailItem label="Nome" value={displayValue(debtHolder?.full_name ?? null)} copyValue={copyableValue(debtHolder?.full_name ?? null)} />
          <DetailItem label="CPF" value={displayCpf(debtHolder?.cpf ?? null)} copyValue={copyableValue(displayCpf(debtHolder?.cpf ?? null))} />
          <DetailItem label="RG" value={displayValue(debtHolder?.rg ?? null)} copyValue={copyableValue(debtHolder?.rg ?? null)} />
          <DetailItem label="Nascimento" value={formatDate(debtHolder?.birth_date ?? null)} copyValue={copyableValue(formatDate(debtHolder?.birth_date ?? null))} />
          <DetailItem label="Estado civil" value={displayValue(debtHolder?.marital_status ?? null)} copyValue={copyableValue(debtHolder?.marital_status ?? null)} />
          <DetailItem label="Profissao" value={displayValue(debtHolder?.profession ?? null)} copyValue={copyableValue(debtHolder?.profession ?? null)} />
          <DetailItem label="Nacionalidade" value={displayValue(debtHolder?.nationality ?? null)} copyValue={copyableValue(debtHolder?.nationality ?? null)} />
          <DetailItem label="Órgão emissor" value={displayValue(debtHolder?.issuer_agency ?? null)} copyValue={copyableValue(debtHolder?.issuer_agency ?? null)} />
          <DetailItem label="Pai" value={displayValue(debtHolder?.father_name ?? null)} copyValue={copyableValue(debtHolder?.father_name ?? null)} />
          <DetailItem label="Mae" value={displayValue(debtHolder?.mother_name ?? null)} copyValue={copyableValue(debtHolder?.mother_name ?? null)} />
          <DetailItem label="Celular" value={displayPhone(debtHolder?.phone_mobile ?? null)} copyValue={copyableValue(displayPhone(debtHolder?.phone_mobile ?? null))} />
          <DetailItem label="Telefone secundario" value={displayPhone(debtHolder?.phone_secondary ?? null)} copyValue={copyableValue(displayPhone(debtHolder?.phone_secondary ?? null))} />
          <DetailItem label="Email" value={displayValue(debtHolder?.email ?? null)} copyValue={copyableValue(debtHolder?.email ?? null)} />
          <DetailItem label="CEP" value={displayValue(debtHolder?.zip_code ?? null)} copyValue={copyableValue(debtHolder?.zip_code ?? null)} />
          <DetailItem label="Rua" value={displayValue(debtHolder?.street ?? null)} copyValue={copyableValue(debtHolder?.street ?? null)} />
          <DetailItem label="Número" value={displayValue(debtHolder?.number ?? null)} copyValue={copyableValue(debtHolder?.number ?? null)} />
          <DetailItem label="Bairro" value={displayValue(debtHolder?.district ?? null)} copyValue={copyableValue(debtHolder?.district ?? null)} />
          <DetailItem label="Cidade" value={displayValue(debtHolder?.city ?? null)} copyValue={copyableValue(debtHolder?.city ?? null)} />
          <DetailItem label="Estado" value={displayValue(debtHolder?.state ?? null)} copyValue={copyableValue(debtHolder?.state ?? null)} />
        </DetailSection>

        <DetailSection title="Dados financeiros">
          <DetailItem label="Financeira" value={displayValue(financialCase?.financer_name ?? null)} copyValue={copyableValue(financialCase?.financer_name ?? null)} />
          <DetailItem
            label="Razao social da financeira"
            value={displayValue(financialCase?.financer_legal_name ?? null)}
            copyValue={copyableValue(financialCase?.financer_legal_name ?? null)}
          />
          <DetailItem
            label="CNPJ da financeira"
            value={financialCase?.financer_cnpj ? formatCnpj(financialCase.financer_cnpj) : "-"}
            copyValue={copyableValue(financialCase?.financer_cnpj ?? null)}
          />
          <DetailItem
            label="Sede / endereço da financeira"
            value={displayValue(financialCase?.financer_address ?? null)}
            copyValue={copyableValue(financialCase?.financer_address ?? null)}
          />
          <DetailItem
            label="Bairro da financeira"
            value={displayValue(financialCase?.financer_district ?? null)}
            copyValue={copyableValue(financialCase?.financer_district ?? null)}
          />
          <DetailItem
            label="CEP da financeira"
            value={displayValue(financialCase?.financer_zip_code ?? null)}
            copyValue={copyableValue(financialCase?.financer_zip_code ?? null)}
          />
          <DetailItem
            label="Cidade da financeira"
            value={displayValue(financialCase?.financer_city ?? null)}
            copyValue={copyableValue(financialCase?.financer_city ?? null)}
          />
          <DetailItem
            label="UF da financeira"
            value={displayValue(financialCase?.financer_state ?? null)}
            copyValue={copyableValue(financialCase?.financer_state ?? null)}
          />
          <DetailItem
            label="Possui contrato de financiamento?"
            value={formatBoolean(financialCase?.has_financing_contract)}
          />
          <DetailItem label="Valor financiado" value={formatCurrency(financialCase?.financed_amount ?? null)} copyValue={copyableValue(formatCurrency(financialCase?.financed_amount ?? null))} />
          <DetailItem label="Valor da parcela" value={formatCurrency(financialCase?.installment_amount ?? null)} copyValue={copyableValue(formatCurrency(financialCase?.installment_amount ?? null))} />
          <DetailItem label="Parcelas pagas" value={displayValue(financialCase?.paid_installments === null || financialCase?.paid_installments === undefined ? null : String(financialCase.paid_installments))} copyValue={copyableValue(financialCase?.paid_installments === null || financialCase?.paid_installments === undefined ? null : String(financialCase.paid_installments))} />
          <DetailItem label="Parcelas em atraso" value={displayValue(financialCase?.overdue_installments === null || financialCase?.overdue_installments === undefined ? null : String(financialCase.overdue_installments))} copyValue={copyableValue(financialCase?.overdue_installments === null || financialCase?.overdue_installments === undefined ? null : String(financialCase.overdue_installments))} />
          <DetailItem label="Dia do vencimento" value={displayValue(financialCase?.due_day === null || financialCase?.due_day === undefined ? null : String(financialCase.due_day))} copyValue={copyableValue(financialCase?.due_day === null || financialCase?.due_day === undefined ? null : String(financialCase.due_day))} />
          <DetailItem label="Número do financiamento" value={displayValue(financialCase?.contract_number ?? null)} copyValue={copyableValue(financialCase?.contract_number ?? null)} />
        </DetailSection>

        <DetailSection
          title="Dados jurídicos"
          description="Informações herdadas do legado e usadas pelo Jurídico."
        >
          <DetailItem label="Departamento jurídico legado" value={displayValue(preSale.legal_department)} copyValue={copyableValue(preSale.legal_department)} />
          <DetailItem label="Status jurídico" value={displayValue(preSale.legal_status_text)} copyValue={copyableValue(preSale.legal_status_text)} />
          <DetailItem label="Status documental jurídico" value={displayValue(preSale.legal_document_status)} copyValue={copyableValue(preSale.legal_document_status)} />
          <DetailItem label="Número do processo" value={displayValue(preSale.legal_case_number)} copyValue={copyableValue(preSale.legal_case_number)} />
          <DetailItem label="Ano do processo" value={displayValue(preSale.legal_case_year)} copyValue={copyableValue(preSale.legal_case_year)} />
          <DetailItem label="Prazo" value={displayValue(preSale.legal_deadline)} copyValue={copyableValue(preSale.legal_deadline)} />
          <DetailItem label="Comarca" value={displayValue(preSale.legal_county)} copyValue={copyableValue(preSale.legal_county)} />
          <DetailItem label="Forum" value={displayValue(preSale.legal_forum)} copyValue={copyableValue(preSale.legal_forum)} />
          <DetailItem label="Vara" value={displayValue(preSale.legal_court_division)} copyValue={copyableValue(preSale.legal_court_division)} />
          <DetailItem label="Operador jurídico legado" value={displayValue(preSale.legal_operator_name)} copyValue={copyableValue(preSale.legal_operator_name)} />
          <DetailItem label="Operador processual legado" value={displayValue(preSale.legal_process_operator_name)} copyValue={copyableValue(preSale.legal_process_operator_name)} />
          <DetailItem label="Protocolo jurídico" value={displayValue(preSale.legal_protocol)} copyValue={copyableValue(preSale.legal_protocol)} />
        </DetailSection>

        {preSale.pre_sale_type === "veiculo" ? (
          <DetailSection title="Dados do veículo">
            <DetailItem label="Veículo" value={displayValue(financialCase?.asset_brand_model ?? null)} copyValue={copyableValue(financialCase?.asset_brand_model ?? null)} />
            <DetailItem label="Cor" value={displayValue(financialCase?.asset_color ?? null)} copyValue={copyableValue(financialCase?.asset_color ?? null)} />
            <DetailItem label="Ano" value={displayValue(financialCase?.asset_year === null || financialCase?.asset_year === undefined ? null : String(financialCase.asset_year))} copyValue={copyableValue(financialCase?.asset_year === null || financialCase?.asset_year === undefined ? null : String(financialCase.asset_year))} />
            <DetailItem label="Placa" value={displayValue(financialCase?.asset_plate ?? null)} copyValue={copyableValue(financialCase?.asset_plate ?? null)} />
          </DetailSection>
        ) : null}

        <DetailSection title="Contratação e negociacao">
          <DetailItem label="Valor do contrato" value={formatCurrency(preSale.contract_value)} copyValue={copyableValue(formatCurrency(preSale.contract_value))} />
          <DetailItem
            label="Descrição de contrato"
            className="md:col-span-2"
            value={
              <p className="whitespace-pre-line">
                {displayValue(preSale.payment_description)}
              </p>
            }
            copyValue={copyableValue(preSale.payment_description)}
          />
          <DetailItem
            label="Descrição livre da contratação / informe"
            className="md:col-span-2"
            value={
              <p className="whitespace-pre-line">
                {displayValue(preSale.negotiation_details)}
              </p>
            }
            copyValue={copyableValue(preSale.negotiation_details)}
          />
        </DetailSection>

        <DetailSection title="Pagamentos previstos">
          {payments.length ? (
            <div className="overflow-x-auto md:col-span-2">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Parcela</th>
                    <th className="px-4 py-3 font-semibold">Valor</th>
                    <th className="px-4 py-3 font-semibold">Forma</th>
                    <th className="px-4 py-3 font-semibold">Meta</th>
                    <th className="px-4 py-3 font-semibold">Data</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((payment, index) => (
                    <tr key={`${payment.installment_number ?? index}-${payment.payment_date ?? ""}`}>
                      <td className="px-4 py-3">
                        {payment.installment_number ?? index + 1}
                      </td>
                      <td className="px-4 py-3">{formatCurrency(payment.amount ?? null)}</td>
                      <td className="px-4 py-3">
                        {displayValue(payment.payment_method)}
                      </td>
                      <td className="px-4 py-3">{formatCurrency(payment.goal_amount ?? null)}</td>
                      <td className="px-4 py-3">{formatDate(payment.payment_date ?? null)}</td>
                      <td className="px-4 py-3">{displayValue(payment.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-600 md:col-span-2">
              Nenhum pagamento previsto cadastrado.
            </p>
          )}
        </DetailSection>

        <LegalPaymentsPanel
          preSaleId={preSale.id}
          legalPayments={legalPaymentsWithRelations}
          legalPaymentTypes={legalPaymentTypes}
          legalUsers={legalUsers}
          templates={templates}
          canManage={canManageLegalPayments}
          successMessage={queryParams.legalPaymentSuccess ?? null}
          errorMessage={queryParams.legalPaymentError ?? null}
        />

</div>},
        {label:"Documentos",content:<div>        <ClientDocumentsSection
          clientId={preSale.client_id}
          preSaleId={preSale.id}
          title="Anexos da operação"
          description="Documentos privados vinculados a esta pré-venda e ao cliente da operação."
        />
</div>}
      ]} />
    </div>
  </>;
}

