import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export async function GET() {
  const { supabase, companyId, role, isPlatformOwner } = await getCurrentUserContext();
  const headers = { "Cache-Control": "no-store" };
  if (role !== "admin" && role !== "manager" && !isPlatformOwner) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403, headers });
  }
  const users = await supabase.from("user_profiles").select("id").eq("company_id", companyId).eq("is_active", true);
  if (users.error) return NextResponse.json({ error: "Consulta indisponível" }, { status: 503, headers });
  const presence = await supabase.from("user_presence").select("user_profile_id", { count: "exact" })
    .eq("company_id", companyId).gte("last_seen_at", new Date(Date.now() - 90000).toISOString())
    .in("user_profile_id", users.data.map(user => user.id));
  if (presence.error) {
    return NextResponse.json({ error: "Presença indisponível", schemaMissing: ["PGRST205", "42P01"].includes(presence.error.code) }, { status: 503, headers });
  }
  return NextResponse.json({ online: presence.count ?? presence.data.length }, { headers });
}
