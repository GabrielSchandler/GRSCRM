import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/layout/page-header";
import { createClientAction } from "@/app/(authenticated)/clientes/actions";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import type { UserProfileOption } from "@/types/pre-sale";

export default async function NovoClientePage({
  searchParams,
}: {
  // Vindo do atendimento ("Cadastrar cliente" na conversa): nome e celular já preenchidos.
  searchParams?: Promise<{ nome?: string; celular?: string }>;
}) {
  const parametros = (await searchParams) ?? {};
  const nomeInicial = typeof parametros.nome === "string" ? parametros.nome.slice(0, 200) : "";
  const celularInicial = typeof parametros.celular === "string" ? parametros.celular.replace(/D/g, "").slice(0, 11) : "";
  const { role, businessArea, userProfileId, supabase, companyId } =
    await getCurrentUserContext();
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
  const defaultCommercialConsultantId =
    role === "seller" &&
    businessArea === "commercial" &&
    commercialConsultants.some((consultant) => consultant.id === userProfileId)
      ? userProfileId
      : "";

  return (
    <>
      <PageHeader
        title="Novo cliente"
        description="Cadastre os dados basicos do cliente. O vínculo com a empresa vem do usuário autenticado."
      />
      <div className="p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <ClientForm
            submitLabel="Cadastrar cliente"
            defaultValues={{
              commercial_consultant_user_id: defaultCommercialConsultantId,
              ...(nomeInicial ? { full_name: nomeInicial } : {}),
              ...(celularInicial ? { phone_mobile: celularInicial } : {}),
            }}
            onSubmitAction={createClientAction}
            canReactivateDeletedClient={role === "admin"}
            commercialConsultants={commercialConsultants}
            legalAdmins={legalAdmins}
            legalConsultants={legalConsultants}
          />
        </div>
      </div>
    </>
  );
}
