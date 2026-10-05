import { redirect } from "next/navigation";
import { createPreSaleAction } from "@/app/(authenticated)/pre-vendas/actions";
import { PageHeader } from "@/components/layout/page-header";
import { PreSalesForm } from "@/components/pre-sales/pre-sales-form";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessAllPreSales, canCreatePreSales } from "@/lib/pre-sales/access";
import type { ClientOption, UserProfileOption } from "@/types/pre-sale";

const clientOptionSelect =
  "id, commercial_consultant_user_id, full_name, cpf, rg, birth_date, marital_status, profession, email, phone_mobile, phone_secondary, zip_code, street, number, district, city, state";

export default async function NovaPreVendaPage() {
  const { supabase, companyId, role, businessArea, userProfileId } =
    await getCurrentUserContext();

  if (!canCreatePreSales(role, businessArea)) {
    redirect("/pre-vendas");
  }

  const [{ data: clientsData }, { data: consultantsData }] = await Promise.all([
    supabase
      .from("clients")
      .select(clientOptionSelect)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
    supabase
      .from("user_profiles")
      .select("id, full_name, nickname, username, email, role")
      .eq("company_id", companyId)
      .order("full_name", { ascending: true }),
  ]);
  const consultants = ((consultantsData ?? []) as UserProfileOption[]).filter((consultant) =>
    canAccessAllPreSales(role, businessArea) ? true : consultant.id === userProfileId,
  );

  return (
    <>
      <PageHeader
        title="Nova pré-venda"
        description="Crie uma oportunidade vinculada a um cliente e consultor da empresa."
      />
      <div className="p-6">
        <div>
          <PreSalesForm
            clients={(clientsData ?? []) as ClientOption[]}
            consultants={consultants}
            submitLabel="Cadastrar pré-venda"
            openingDateLabel="Sera definida ao salvar"
            onSubmitAction={createPreSaleAction}
          />
        </div>
      </div>
    </>
  );
}
