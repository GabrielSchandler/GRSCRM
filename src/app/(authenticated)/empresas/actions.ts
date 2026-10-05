"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { onlyDigits } from "@/lib/clients/masks";
import {
  defaultCompanyPlatformSettings,
  isCompanyPlatformSettingsMissingError,
} from "@/lib/company/platform-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { getHomeForRole } from "@/lib/workspace";
import { revalidatePath } from "next/cache";

type LifecycleResult = { error: string; success: string };

export async function changeCompanyLifecycleAction(_previous: LifecycleResult, formData: FormData): Promise<LifecycleResult> {
  const context = await getCurrentUserContext();
  if (!context.isPlatformOwner) return { error: "Acesso exclusivo do operador da plataforma.", success: "" };
  const parsed = z.object({ company_id: z.string().uuid(), operation: z.enum(["block", "unblock", "archive", "restore"]), confirmation: z.string().trim().min(1) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Confira a empresa e a confirmação.", success: "" };
  const { company_id: id, operation, confirmation } = parsed.data;
  const admin = createAdminClient();
  const { data: company, error } = await admin.from("companies").select("id, trade_name, legal_name").eq("id", id).maybeSingle();
  if (error || !company) return { error: "Empresa não encontrada.", success: "" };
  const name = company.trade_name?.trim() || company.legal_name?.trim() || "Empresa sem nome";
  if (confirmation !== name) return { error: "O nome digitado não corresponde ao da empresa.", success: "" };
  const { count: masters, error: ownerError } = await admin.from("user_profiles").select("id", { count: "exact", head: true }).eq("company_id", id).eq("is_platform_owner", true);
  if (ownerError || masters) return { error: "Não é permitido alterar o ciclo de vida da empresa do operador master.", success: "" };
  if (operation === "archive" || operation === "restore") {
    const { error: lifecycleError } = await admin.rpc("set_company_archive", { target_company: id, restore_company: operation === "restore", actor_profile: context.userProfileId });
    if (lifecycleError) return { error: "Não foi possível alterar a empresa. Confirme a aplicação do SQL company-lifecycle e o prazo de recuperação.", success: "" };
  } else {
    const { data: lifecycle, error: lifecycleError } = await admin.from("company_lifecycle").select("company_id").eq("company_id", id).maybeSingle();
    if (lifecycle) return { error: "Use Restaurar empresa para recuperar uma empresa excluída.", success: "" };
    if (lifecycleError && !["PGRST205", "42P01"].includes(lifecycleError.code)) return { error: "Não foi possível verificar o estado de exclusão.", success: "" };
    const { data: existingSettings, error: readError } = await admin.from("company_platform_settings").select("company_id").eq("company_id", id).maybeSingle();
    if (readError) return { error: "Não foi possível consultar as configurações da empresa.", success: "" };
    const statusPayload = { status: operation === "block" ? "suspended" : "active", updated_at: new Date().toISOString(), updated_by: context.userProfileId };
    const { error: statusError } = existingSettings
      ? await admin.from("company_platform_settings").update(statusPayload).eq("company_id", id)
      : await admin.from("company_platform_settings").insert({ ...defaultCompanyPlatformSettings(id), ...statusPayload });
    if (statusError) return { error: "Não foi possível atualizar o bloqueio da empresa.", success: "" };
  }
  revalidatePath("/empresas");
  revalidatePath(`/empresas/${id}`);
  return { error: "", success: operation === "archive" ? "Empresa excluída com recuperação por três meses." : operation === "restore" ? "Empresa restaurada." : operation === "block" ? "Empresa bloqueada." : "Empresa desbloqueada." };
}

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" && value.trim() ? value.trim() : null));

const createCompanySchema = z.object({
  trade_name: z.string().trim().min(2, "Informe o nome fantasia."),
  legal_name: optionalText,
  cnpj: optionalText.transform((value) => (value ? onlyDigits(value) : null)),
  email: optionalText.refine(
    (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Informe um e-mail válido.",
  ),
  phone: optionalText.transform((value) => (value ? onlyDigits(value) : null)),
});

const updatePlatformSettingsSchema = z.object({
  company_id: z.string().uuid(),
  status: z.enum(["active", "trial", "suspended", "cancelled"]),
  user_license_limit: z.coerce.number().int().min(1).max(10000),
  storage_limit_mb: z.coerce.number().int().min(100).max(1024 * 1024),
  notes: optionalText,
  enable_commercial: z.boolean(),
  enable_legal: z.boolean(),
  enable_finance: z.boolean(),
  enable_academy: z.boolean(),
  enable_lead_distribution: z.boolean(),
  enable_client_portal: z.boolean(),
  enable_backups: z.boolean(),
  enable_outlook_email: z.boolean(),
  enable_simulations: z.boolean(),
  enable_documents: z.boolean(),
  enable_custom_templates: z.boolean(),
});

function redirectWithError(error: string): never {
  redirect(`/empresas?error=${encodeURIComponent(error)}`);
}

function redirectSettingsWithError(companyId: string, error: string): never {
  redirect(`/empresas/${companyId}?error=${encodeURIComponent(error)}`);
}

function isChecked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

export async function createPlatformCompanyAction(formData: FormData) {
  const { supabase, role, businessArea, isPlatformOwner } =
    await getCurrentUserContext();

  if (!isPlatformOwner) {
    redirect(getHomeForRole(role, businessArea));
  }

  const parsed = createCompanySchema.safeParse({
    trade_name: formData.get("trade_name"),
    legal_name: formData.get("legal_name"),
    cnpj: formData.get("cnpj"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    redirectWithError("Confira os dados da nova empresa.");
  }

  const tradeName = parsed.data.trade_name;
  const legalName = parsed.data.legal_name || tradeName;
  const { data, error } = await supabase
    .from("companies")
    .insert({
      ...parsed.data,
      legal_name: legalName,
      trade_name: tradeName,
      user_license_limit: 10,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    redirectWithError(error?.message || "Não foi possível criar a empresa.");
  }

  const adminClient = createAdminClient();
  const { error: settingsError } = await adminClient
    .from("company_platform_settings")
    .upsert(defaultCompanyPlatformSettings(data.id), { onConflict: "company_id" });

  if (
    settingsError &&
    !isCompanyPlatformSettingsMissingError(settingsError)
  ) {
    redirectWithError(settingsError.message);
  }

  redirect(`/empresas/select?company=${data.id}`);
}

export async function updateCompanyPlatformSettingsAction(formData: FormData) {
  const { role, businessArea, isPlatformOwner, userProfileId } =
    await getCurrentUserContext();

  if (!isPlatformOwner) {
    redirect(getHomeForRole(role, businessArea));
  }

  const companyId = String(formData.get("company_id") ?? "");
  const parsed = updatePlatformSettingsSchema.safeParse({
    company_id: companyId,
    status: formData.get("status"),
    user_license_limit: formData.get("user_license_limit"),
    storage_limit_mb: formData.get("storage_limit_mb"),
    notes: formData.get("notes"),
    enable_commercial: isChecked(formData, "enable_commercial"),
    enable_legal: isChecked(formData, "enable_legal"),
    enable_finance: isChecked(formData, "enable_finance"),
    enable_academy: isChecked(formData, "enable_academy"),
    enable_lead_distribution: isChecked(formData, "enable_lead_distribution"),
    enable_client_portal: isChecked(formData, "enable_client_portal"),
    enable_backups: isChecked(formData, "enable_backups"),
    enable_outlook_email: isChecked(formData, "enable_outlook_email"),
    enable_simulations: isChecked(formData, "enable_simulations"),
    enable_documents: isChecked(formData, "enable_documents"),
    enable_custom_templates: isChecked(formData, "enable_custom_templates"),
  });

  if (!parsed.success) {
    redirectSettingsWithError(companyId, "Confira limites, status e modulos da empresa.");
  }

  const adminClient = createAdminClient();
  const now = new Date().toISOString();
  const { data: archived, error: archivedError } = await adminClient.from("company_lifecycle").select("company_id").eq("company_id", parsed.data.company_id).maybeSingle();
  if (archived) redirectSettingsWithError(parsed.data.company_id, "Restaure a empresa pelo painel master antes de alterar suas configurações.");
  if (archivedError && !["PGRST205", "42P01"].includes(archivedError.code)) redirectSettingsWithError(parsed.data.company_id, "Não foi possível verificar o estado de exclusão.");
  const { user_license_limit: licenseLimit, ...settingsPayload } = parsed.data;

  const { error: companyError } = await adminClient
    .from("companies")
    .update({
      user_license_limit: licenseLimit,
      updated_at: now,
    })
    .eq("id", parsed.data.company_id);

  if (companyError) {
    redirectSettingsWithError(parsed.data.company_id, companyError.message);
  }

  const { error: settingsError } = await adminClient
    .from("company_platform_settings")
    .upsert(
      {
        ...settingsPayload,
        updated_at: now,
        updated_by: userProfileId,
      },
      { onConflict: "company_id" },
    );

  if (settingsError) {
    const message = isCompanyPlatformSettingsMissingError(settingsError)
      ? "A tabela company_platform_settings ainda não existe. Rode o SQL desta entrega no Supabase."
      : settingsError.message;

    redirectSettingsWithError(parsed.data.company_id, message);
  }

  redirect(`/empresas/${parsed.data.company_id}?success=settings`);
}
