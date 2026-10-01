import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import {
  ACTIVE_COMPANY_COOKIE_NAME,
  classifyWorkspacePath,
  getHomeForRole,
  isSharedOperationalPath,
  normalizeBusinessArea,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspace";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

const protectedRoutes = [
  "/dashboard",
  "/atendimento",
  "/chat-interno",
  "/clientes",
  "/comercial",
  "/pre-vendas",
  "/calculos",
  "/documentos",
  "/contratos",
  "/empresa",
  "/backups",
  "/empresas",
  "/logs",
  "/usuarios",
  "/areas",
  "/juridico",
  "/financeiro",
  "/alterar-senha",
  "/relatorio-conversao-estados",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedRoute = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );
  const isLoginRoute = request.nextUrl.pathname === "/login";
  const isPasswordChangeRoute = request.nextUrl.pathname === "/alterar-senha";
  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");
  const isPublicTrackingRoute = request.nextUrl.pathname.startsWith("/acompanhamento");

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  let profileRole: string | null = null;
  let profileBusinessArea: string | null = null;
  let profilePasswordMustChange = false;
  let profileIsPlatformOwner = false;

  if (user && (isLoginRoute || isDashboardRoute || isProtectedRoute)) {
    let profile:
      | {
          role?: string | null;
          business_area?: string | null;
          password_must_change?: boolean | null;
          is_platform_owner?: boolean | null;
        }
      | null = null;

    const { data, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, business_area, password_must_change, is_platform_owner")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    profile = data;

    if (profileError?.code === "42703") {
      const { data: fallbackProfile } = await supabase
        .from("user_profiles")
        .select("role, business_area, password_must_change")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      profile = fallbackProfile;
    }

    profileRole = profile?.role ?? null;
    profileBusinessArea = profile?.business_area ?? null;
    profilePasswordMustChange = Boolean(profile?.password_must_change);
    profileIsPlatformOwner = Boolean(profile?.is_platform_owner);
  }

  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = profilePasswordMustChange
      ? "/alterar-senha"
      : getHomeForRole(
          profileRole,
          normalizeBusinessArea(profileBusinessArea),
          profileIsPlatformOwner,
        );
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (
    user &&
    profilePasswordMustChange &&
    isProtectedRoute &&
    !isPasswordChangeRoute
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/alterar-senha";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isPasswordChangeRoute && !profilePasswordMustChange) {
    const url = request.nextUrl.clone();
    url.pathname = getHomeForRole(
      profileRole,
      normalizeBusinessArea(profileBusinessArea),
      profileIsPlatformOwner,
    );
    url.search = "";
    return NextResponse.redirect(url);
  }

  const routeWorkspace = classifyWorkspacePath(request.nextUrl.pathname);
  const activeCompanyCookie =
    request.cookies.get(ACTIVE_COMPANY_COOKIE_NAME)?.value ?? null;

  if (
    user &&
    profileIsPlatformOwner &&
    isProtectedRoute &&
    !request.nextUrl.pathname.startsWith("/empresas") &&
    !isPasswordChangeRoute
  ) {
    if (!activeCompanyCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/empresas";
      url.search = "";
      return NextResponse.redirect(url);
    }

    const { data: selectedCompany } = await supabase
      .from("companies")
      .select("id")
      .eq("id", activeCompanyCookie)
      .maybeSingle();

    if (!selectedCompany?.id) {
      const url = request.nextUrl.clone();
      url.pathname = "/empresas";
      url.searchParams.set("error", "empresa_indisponivel");
      return NextResponse.redirect(url);
    }
  }

  if (user && routeWorkspace) {
    if (profileRole === null || profileBusinessArea === null) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role, business_area")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      profileRole = (profile as { role?: string | null } | null)?.role ?? null;
      profileBusinessArea =
        (profile as { business_area?: string | null } | null)?.business_area ?? null;
    }
  }

  if (user && routeWorkspace && profileRole === "seller") {
    const sellerArea = normalizeBusinessArea(profileBusinessArea);

    if (routeWorkspace === "management" || routeWorkspace !== sellerArea) {
      const url = request.nextUrl.clone();
      url.pathname = getHomeForRole(profileRole, sellerArea);
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (
    user &&
    !routeWorkspace &&
    profileRole === "seller" &&
    !isPasswordChangeRoute &&
    !isPublicTrackingRoute
  ) {
    const sellerArea = normalizeBusinessArea(profileBusinessArea);
    const isSharedPath = isSharedOperationalPath(request.nextUrl.pathname);

    if (!isSharedPath) {
      const url = request.nextUrl.clone();
      url.pathname = getHomeForRole(profileRole, sellerArea);
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (user && isDashboardRoute && profileRole === "seller") {
    const url = request.nextUrl.clone();
    url.pathname = getHomeForRole(
      profileRole,
      normalizeBusinessArea(profileBusinessArea),
      profileIsPlatformOwner,
    );
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/areas") {
    const cookieWorkspace = request.cookies.get(WORKSPACE_COOKIE_NAME)?.value ?? null;

    if (profileRole === "seller") {
      const url = request.nextUrl.clone();
      url.pathname = getHomeForRole(
        profileRole,
        normalizeBusinessArea(profileBusinessArea),
        profileIsPlatformOwner,
      );
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (!cookieWorkspace && profileRole && profileRole !== "seller") {
      return supabaseResponse;
    }
  }

  if (user && routeWorkspace && profileRole && profileRole !== "seller") {
    supabaseResponse.cookies.set(WORKSPACE_COOKIE_NAME, routeWorkspace, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return supabaseResponse;
}
