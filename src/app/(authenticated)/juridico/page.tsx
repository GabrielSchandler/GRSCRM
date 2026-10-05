import { LegalKanban, type LegalBoardPreSale } from "@/components/legal/legal-kanban";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  getLegalWorkflowStage,
  legalWorkflowStages,
  mapLegalWorkflowStageRow,
} from "@/lib/legal/workflow";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DocumentTemplate, GeneratedDocument } from "@/types/document";
import type { EmailTemplate } from "@/types/email";
import type {
  ClientOption,
  PreSale,
  PreSaleDebtHolder,
  PreSaleFinancialCase,
  UserProfileOption,
} from "@/types/pre-sale";

function canUseLegalArea(role: string | null, businessArea: string) {
  return role === "admin" || role === "manager" || (role === "seller" && businessArea === "legal");
}

type JuridicoPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

export default async function JuridicoPage({ searchParams }: JuridicoPageProps) {
  const params = (await searchParams) ?? {};
  const {
    supabase,
    companyId,
    role,
    businessArea,
    userProfileId,
    canEditLegalWorkflow,
  } = await getCurrentUserContext();
  const adminClient = createAdminClient();

  if (!canUseLegalArea(role, businessArea)) {
    return null;
  }

  const [
    { data: preSalesData, error: preSalesError },
    { data: clientsData },
    { data: consultantsData },
    { data: templatesData },
    { data: workflowStagesData, error: workflowStagesError },
  ] = await Promise.all([
    supabase
      .from("pre_sales")
      .select("*")
      .eq("company_id", companyId)
      .neq("status", "perdido")
      .order("legal_stage_updated_at", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("clients")
      .select("*")
      .eq("company_id", companyId),
    supabase
      .from("user_profiles")
      .select("id, full_name, nickname, username, email, role, business_area, is_active, legal_role")
      .eq("company_id", companyId),
    supabase
      .from("document_templates")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("legal_workflow_stages")
      .select("id, legacy_key, title, short_title, description, color, expected_documents, position")
      .eq("company_id", companyId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const allPreSales = (preSalesData ?? []) as PreSale[];
  const legalPreSalesBase = allPreSales.filter(
    (preSale) =>
      preSale.status === "aprovado" ||
      Boolean(preSale.legal_stage_id) ||
      Boolean(preSale.legal_stage),
  );
  const generatedPreSaleIds = legalPreSalesBase.map((preSale) => preSale.id);

  const [
    { data: generatedDocumentsData },
    { data: clientDocumentsData },
    { data: financialCasesData },
    { data: debtHoldersData },
    { data: emailTemplatesData },
  ] = await Promise.all([
    generatedPreSaleIds.length
      ? supabase
          .from("generated_documents")
          .select("*")
          .eq("company_id", companyId)
          .in("pre_sale_id", generatedPreSaleIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    clientsData?.length
      ? supabase
          .from("client_documents")
          .select("id, client_id, title, file_name, file_size")
          .eq("company_id", companyId)
          .in(
            "client_id",
            clientsData.map((client) => client.id),
          )
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    generatedPreSaleIds.length
      ? supabase
          .from("pre_sale_financial_cases")
          .select("*")
          .in("pre_sale_id", generatedPreSaleIds)
      : Promise.resolve({ data: [] }),
    generatedPreSaleIds.length
      ? supabase
          .from("pre_sale_debt_holders")
          .select("pre_sale_id, full_name, cpf")
          .in("pre_sale_id", generatedPreSaleIds)
      : Promise.resolve({ data: [] }),
    adminClient
      .from("email_templates")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const clients = (clientsData ?? []) as Array<
    Pick<ClientOption, "id" | "full_name" | "cpf" | "email" | "phone_mobile"> & {
      legal_responsible_user_id: string | null;
      legal_consultant_user_id: string | null;
    }
  >;
  const consultants = (consultantsData ?? []) as Array<
    UserProfileOption & {
      business_area?: string | null;
      is_active?: boolean | null;
    }
  >;
  const legalAdmins = consultants.filter(
    (consultant) =>
      consultant.business_area === "legal" &&
      consultant.is_active !== false &&
      consultant.legal_role === "admin",
  );
  const legalConsultants = consultants.filter(
    (consultant) =>
      consultant.business_area === "legal" &&
      consultant.is_active !== false &&
      (consultant.legal_role === "consultant" || !consultant.legal_role),
  );
  const templates = (templatesData ?? []) as DocumentTemplate[];
  const generatedDocuments = (generatedDocumentsData ?? []) as GeneratedDocument[];
  const emailTemplates = (emailTemplatesData ?? []) as EmailTemplate[];
  const clientDocuments = (clientDocumentsData ?? []) as Array<{
    id: string;
    client_id: string;
    title: string | null;
    file_name: string;
    file_size: number;
  }>;
  const financialCases = (financialCasesData ?? []) as PreSaleFinancialCase[];
  const debtHolders =
    (debtHoldersData ?? []) as Array<
      Pick<PreSaleDebtHolder, "pre_sale_id" | "full_name" | "cpf">
    >;
  const workflowSchemaReady = !workflowStagesError && Boolean(workflowStagesData?.length);
  const workflowStages = workflowSchemaReady
    ? (workflowStagesData ?? []).map(mapLegalWorkflowStageRow)
    : legalWorkflowStages;

  const legalPreSales: LegalBoardPreSale[] = legalPreSalesBase.map((preSale) => {
    const currentLegalStage = getLegalWorkflowStage(
      preSale.legal_stage_id ?? preSale.legal_stage,
      workflowStages,
    );
    const client = clients.find((item) => item.id === preSale.client_id) ?? null;
    const stageUpdatedAt =
      preSale.legal_stage_updated_at ?? preSale.updated_at ?? preSale.created_at;

    return {
      ...preSale,
      client,
      legalResponsibleUserId: client?.legal_responsible_user_id ?? null,
      legalConsultantUserId: client?.legal_consultant_user_id ?? null,
      consultant:
        consultants.find(
          (consultant) =>
            consultant.id === preSale.consultant_user_id ||
            consultant.id === preSale.created_by,
        ) ??
        null,
      currentLegalStageId: currentLegalStage.id,
      stageUpdatedAt,
      financialCase:
        financialCases.find((financialCase) => financialCase.pre_sale_id === preSale.id) ??
        null,
      debtHolder:
        debtHolders.find((debtHolder) => debtHolder.pre_sale_id === preSale.id) ?? null,
      clientDocuments: clientDocuments.filter(
        (document) => document.client_id === preSale.client_id,
      ),
      generatedDocuments: generatedDocuments.filter(
        (document) => document.pre_sale_id === preSale.id,
      ),
    };
  });

  return (
    <>
      <PageHeader
        title="Esteira jurídica"
        description="SLA, responsáveis, documentos e movimentações em um quadro operacional."
      />
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--ns-text)]">Esteira jurídica</h1>
          <p className="mt-1 text-sm text-[var(--ns-muted)]">Priorize pelo tempo parado e faça a movimentação sem perder o histórico.</p>
        </div>
        {preSalesError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {preSalesError.message}
          </div>
        ) : null}
        <LegalKanban
          preSales={legalPreSales}
          templates={templates}
          emailTemplates={emailTemplates}
          legalAdmins={legalAdmins}
          legalConsultants={legalConsultants}
          currentUserId={userProfileId}
          initialSearchTerm={(params.q ?? "").trim()}
          stages={workflowStages}
          canEditWorkflow={canEditLegalWorkflow}
          workflowSchemaReady={workflowSchemaReady}
        />
      </div>
    </>
  );
}
