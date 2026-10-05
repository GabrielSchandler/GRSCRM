import { notFound } from "next/navigation";
import { updatePreSaleAction } from "@/app/(authenticated)/pre-vendas/actions";
import { PageHeader } from "@/components/layout/page-header";
import { PreSaleDeleteButton } from "@/components/pre-sales/pre-sale-delete-button";
import { PreSalesForm } from "@/components/pre-sales/pre-sales-form";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { formatDateTime } from "@/lib/clients/formatters";
import {
  canAccessAllPreSales,
  canEditPreSaleRecord,
} from "@/lib/pre-sales/access";
import { preSaleToFormValues } from "@/lib/pre-sales/schema";
import type {
  ClientOption,
  PreSale,
  PreSaleClientSnapshot,
  PreSaleDebtHolder,
  PreSaleFinancialCase,
  PreSalePayment,
  UserProfileOption,
} from "@/types/pre-sale";

type EditarPreVendaPageProps = {
  params: Promise<{ id: string }>;
};

const clientOptionSelect =
  "id, commercial_consultant_user_id, full_name, cpf, rg, birth_date, marital_status, profession, email, phone_mobile, phone_secondary, zip_code, street, number, district, city, state";

export default async function EditarPreVendaPage({ params }: EditarPreVendaPageProps) {
  const { id } = await params;
  const { supabase, companyId, userProfileId, role, businessArea } =
    await getCurrentUserContext();

  const [
    { data, error },
    { data: snapshotData },
    { data: debtHolderData },
    { data: financialCaseData },
    { data: paymentsData },
    { data: clientsData },
    { data: consultantsData },
  ] =
    await Promise.all([
      supabase.from("pre_sales").select("*").eq("id", id).eq("company_id", companyId).single(),
      supabase
        .from("pre_sale_client_snapshot")
        .select("*")
        .eq("pre_sale_id", id)
        .maybeSingle(),
      supabase
        .from("pre_sale_debt_holders")
        .select("*")
        .eq("pre_sale_id", id)
        .maybeSingle(),
      supabase
        .from("pre_sale_financial_cases")
        .select("*")
        .eq("pre_sale_id", id)
        .maybeSingle(),
      supabase
        .from("pre_sale_payments")
        .select("*")
        .eq("pre_sale_id", id)
        .order("installment_number", { ascending: true }),
      supabase
        .from("clients")
        .select(clientOptionSelect)
        .eq("company_id", companyId)
        .order("full_name", { ascending: true }),
      supabase
        .from("user_profiles")
        .select("id, full_name, nickname, username, email, role")
        .eq("company_id", companyId)
        .order("full_name", { ascending: true }),
    ]);
  const preSale = data as PreSale | null;
  const snapshot = snapshotData as PreSaleClientSnapshot | null;
  const debtHolder = debtHolderData as PreSaleDebtHolder | null;
  const financialCase = financialCaseData as PreSaleFinancialCase | null;
  const payments = (paymentsData ?? []) as PreSalePayment[];

  if (error || !preSale) {
    notFound();
  }

  const canEdit = canEditPreSaleRecord(role, businessArea, userProfileId, preSale);
  const canDelete = role === "admin" || role === "manager";

  if (!canEdit) {
    notFound();
  }

  const consultants = ((consultantsData ?? []) as UserProfileOption[]).filter((consultant) =>
    canAccessAllPreSales(role, businessArea) ? true : consultant.id === userProfileId,
  );

  return (
    <>
      <PageHeader
        title="Editar pré-venda"
        description="Atualize os dados e status da oportunidade."
      />
      <div className="space-y-4 p-6">
        {canDelete ? <PreSaleDeleteButton preSaleId={preSale.id} /> : null}
        <div>
          <PreSalesForm
            clients={(clientsData ?? []) as ClientOption[]}
            consultants={consultants}
            submitLabel="Salvar alterações"
            openingDateLabel={formatDateTime(preSale.created_at)}
            defaultValues={preSaleToFormValues(
              preSale,
              snapshot,
              debtHolder,
              financialCase,
              payments,
            )}
            onSubmitAction={updatePreSaleAction.bind(null, preSale.id)}
            requireChangeNote
          />
        </div>
      </div>
    </>
  );
}
