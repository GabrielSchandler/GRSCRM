import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCompanyBlocked } from "@/lib/company/lifecycle";
import type { CompanyUserRole } from "@/types/user";
import type { LegalUserRole } from "@/types/user";
import {
  ACTIVE_COMPANY_COOKIE_NAME,
  normalizeBusinessArea,
  type CompanyBusinessArea,
} from "@/lib/workspace";

export class UserProfileContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserProfileContextError";
  }
}

export type CurrentUserProfile = {
  id: string;
  auth_user_id: string;
  company_id: string;
  role: CompanyUserRole | null;
  business_area: CompanyBusinessArea | null;
  legal_role: LegalUserRole | null;
  can_edit_legal_workflow?: boolean | null;
  is_platform_owner?: boolean | null;
  nickname: string | null;
  username: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
};

export type ActiveCompanySummary = {
  id: string;
  legal_name: string | null;
  trade_name: string | null;
};

const loadCurrentUserContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data, error: profileError } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const profile = data as CurrentUserProfile | null;

  if (profileError) {
    throw new UserProfileContextError(
      "Não foi possível carregar o perfil do usuário autenticado.",
    );
  }

  if (!profile) {
    throw new UserProfileContextError(
      "Existe uma sessão autenticada, mas não há perfil vinculado em public.user_profiles.",
    );
  }

  if (!profile.company_id) {
    throw new UserProfileContextError(
      "O perfil do usuário autenticado não possui company_id em public.user_profiles.",
    );
  }

  if (!profile.is_active) {
    redirect("/conta-inativa");
  }

  const isPlatformOwner = Boolean(profile.is_platform_owner);
  if (!isPlatformOwner) {
    const { data: companySettings, error: settingsError } = await supabase.from("company_platform_settings").select("status").eq("company_id", profile.company_id).maybeSingle();
    if (settingsError && !["PGRST205", "42P01"].includes(settingsError.code)) throw new UserProfileContextError("Não foi possível verificar o acesso da empresa.");
    if (isCompanyBlocked(companySettings?.status)) redirect("/conta-inativa?motivo=empresa");
  }
  const cookieStore = await cookies();
  const selectedCompanyId = isPlatformOwner
    ? cookieStore.get(ACTIVE_COMPANY_COOKIE_NAME)?.value ?? null
    : null;
  let activeCompany: ActiveCompanySummary | null = null;
  let activeCompanyId = profile.company_id;

  if (isPlatformOwner && selectedCompanyId) {
    const { data: selectedCompany } = await supabase
      .from("companies")
      .select("id, legal_name, trade_name")
      .eq("id", selectedCompanyId)
      .maybeSingle();

    if (selectedCompany?.id) {
      activeCompany = selectedCompany as ActiveCompanySummary;
      activeCompanyId = selectedCompany.id;
    }
  }

  return {
    supabase,
    user,
    authUserId: user.id,
    userProfileId: profile.id,
    companyId: activeCompanyId,
    profileCompanyId: profile.company_id,
    selectedCompanyId,
    activeCompany,
    isPlatformOwner,
    role: profile.role,
    businessArea: normalizeBusinessArea(profile.business_area),
    legalRole: profile.legal_role,
    canEditLegalWorkflow:
      profile.role === "admin" || Boolean(profile.can_edit_legal_workflow),
    nickname: profile.nickname,
    username: profile.username,
    email: profile.email,
    fullName: profile.full_name,
    phone: profile.phone,
    isActive: profile.is_active,
    profile,
  };
});

export async function getCurrentUserContext() {
  return loadCurrentUserContext();
}
