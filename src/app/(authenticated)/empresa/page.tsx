import { redirect } from "next/navigation";
import { CompanyLogoPanel } from "@/components/company/company-logo-panel";
import { CompanyProfileForm } from "@/components/company/company-profile-form";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { displayValue, formatDateTime } from "@/lib/clients/formatters";
import { formatPhone, formatZipCode } from "@/lib/clients/masks";
import { companyProfileToFormValues } from "@/lib/company/schema";
import { getHomeForRole } from "@/lib/workspace";
import type { CompanyProfile } from "@/types/company";

type EmpresaPageProps = {
  searchParams: Promise<{ success?: string }>;
};

function canManageCompany(role: string | null) {
  return role === "admin";
}

function successMessage(success?: string) {
  if (success === "updated") {
    return "Perfil da empresa atualizado com sucesso.";
  }

  if (success === "logo") {
    return "Logo da empresa atualizada com sucesso.";
  }

  if (success === "logo_removed") {
    return "Logo da empresa removida com sucesso.";
  }

  return null;
}

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || error?.message?.toLowerCase().includes("column") || false;
}

export default async function EmpresaPage({ searchParams }: EmpresaPageProps) {
  const params = await searchParams;
  const { supabase, companyId, role, businessArea } = await getCurrentUserContext();

  if (!canManageCompany(role)) {
    redirect(getHomeForRole(role, businessArea));
  }

  const success = successMessage(params.success);
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, legal_name, trade_name, cnpj, email, phone, website, zip_code, street, number, district, city, state, logo_path, logo_file_name, simulation_guarantee_title, simulation_guarantee_lead, simulation_guarantee_clause_label, simulation_guarantee_clause_text, user_license_limit, created_at, updated_at",
    )
    .eq("id", companyId)
    .single();

  const company = (data ?? null) as CompanyProfile | null;
  const formValues = company ? companyProfileToFormValues(company) : null;
  let logoUrl: string | null = null;

  if (company?.logo_path) {
    const { data: signedData } = await supabase.storage
      .from("documents")
      .createSignedUrl(company.logo_path, 60 * 10);

    logoUrl = signedData?.signedUrl ?? null;
  }

  return (
    <>
      <PageHeader
        title="Gestão"
        description="Configure os dados institucionais da empresa, a identidade visual e as informações usadas nos documentos."
      />
      <div className="management-page space-y-6 p-4 sm:p-6">
        {success ? (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
            {success}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {isMissingColumnError(error)
              ? "A tabela companies desta instância ainda não possui os campos da tela Empresa. Rode o SQL da entrega no Supabase e recarregue a página."
              : error.message}
          </div>
        ) : company && formValues ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <CompanyProfileForm
              defaultValues={{
                legal_name: formValues.legal_name ?? "",
                trade_name: formValues.trade_name ?? "",
                cnpj: formValues.cnpj ?? "",
                email: formValues.email ?? "",
                phone: formatPhone(formValues.phone),
                website: formValues.website ?? "",
                zip_code: formatZipCode(formValues.zip_code),
                street: formValues.street ?? "",
                number: formValues.number ?? "",
                district: formValues.district ?? "",
                city: formValues.city ?? "",
                state: formValues.state ?? "",
                simulation_guarantee_title:
                  formValues.simulation_guarantee_title ?? "",
                simulation_guarantee_lead:
                  formValues.simulation_guarantee_lead ?? "",
                simulation_guarantee_clause_label:
                  formValues.simulation_guarantee_clause_label ?? "",
                simulation_guarantee_clause_text:
                  formValues.simulation_guarantee_clause_text ?? "",
              }}
            />

            <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
              <CompanyLogoPanel
                logoUrl={logoUrl}
                logoFileName={company.logo_file_name}
              />

              <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-950">Resumo atual</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-slate-500">ID da empresa</dt>
                    <dd className="max-w-[220px] break-all text-right font-mono text-xs text-slate-900">
                      {company.id}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-slate-500">Licencas contratadas</dt>
                    <dd className="font-medium text-slate-900">
                      {company.user_license_limit ?? 0}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-slate-500">Nome exibido</dt>
                    <dd className="text-right font-medium text-slate-900">
                      {displayValue(company.trade_name ?? company.legal_name)}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-slate-500">Ultima atualizacao</dt>
                    <dd className="text-right font-medium text-slate-900">
                      {formatDateTime(company.updated_at ?? company.created_at)}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
