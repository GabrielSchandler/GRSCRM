import { notFound } from "next/navigation";
import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/layout/page-header";
import { updateClientAction } from "@/app/(authenticated)/clientes/actions";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { clientToFormValues } from "@/lib/clients/schema";
import type { Client } from "@/types/client";
import type { UserProfileOption } from "@/types/pre-sale";

type EditarClientePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarClientePage({ params }: EditarClientePageProps) {
  const { id } = await params;
  const { supabase, companyId } = await getCurrentUserContext();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .single();
  const client = data as Client | null;

  if (error || !client) {
    notFound();
  }

  const [{ data: commercialConsultantsData }, { data: legalConsultantsData }] =
    await Promise.all([
      supabase
        .from("user_profiles")
        .select("id, full_name, nickname, username, email, role, business_area, is_active, legal_role")
        .eq("company_id", companyId)
        .eq("business_area", "commercial")
        .eq("role", "seller")
        .eq("is_active", true)
        .order("full_name", { ascending: true }),
      supabase
        .from("user_profiles")
        .select("id, full_name, nickname, username, email, role, business_area, is_active, legal_role")
        .eq("company_id", companyId)
        .eq("business_area", "legal")
        .eq("is_active", true)
        .order("full_name", { ascending: true }),
    ]);
  const commercialConsultants = (commercialConsultantsData ?? []) as UserProfileOption[];
  const legalUsers = (legalConsultantsData ?? []) as UserProfileOption[];
  const legalAdmins = legalUsers.filter((user) => user.legal_role === "admin");
  const legalConsultants = legalUsers.filter(
    (user) => user.legal_role === "consultant" || !user.legal_role,
  );

  return (
    <>
      <PageHeader
        title="Editar cliente"
        description="Atualize os dados do cliente mantendo o vínculo com a empresa autenticada."
      />
      <div className="p-6">
        <div>
          <ClientForm
            submitLabel="Salvar alterações"
            defaultValues={clientToFormValues(client)}
            onSubmitAction={updateClientAction.bind(null, client.id)}
            commercialConsultants={commercialConsultants}
            legalAdmins={legalAdmins}
            legalConsultants={legalConsultants}
            requireChangeNote
          />
        </div>
      </div>
    </>
  );
}
