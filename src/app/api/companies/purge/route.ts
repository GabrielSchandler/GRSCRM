import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Explicit activation follows migration/schema and external-backup verification.
  if (process.env.COMPANY_PURGE_ENABLED !== "true") return NextResponse.json({ enabled: false });
  const admin = createAdminClient();
  const { data: companies, error } = await admin.from("company_lifecycle").select("company_id").lte("purge_after", new Date().toISOString()).order("purge_after").limit(5);
  if (error) return NextResponse.json({ error: "Lifecycle configuration unavailable" }, { status: 503 });
  const results: { companyId: string; purged: boolean }[] = [];
  for (const company of companies ?? []) {
    try {
      const { data: objects, error: claimError } = await admin.rpc("claim_company_purge", { target_company: company.company_id });
      if (claimError) throw claimError;
      const buckets = new Map<string, string[]>();
      for (const object of (objects ?? []) as { bucket_id: string; name: string }[]) {
        if (!object.name.startsWith(`${company.company_id}/`)) throw new Error("Unexpected storage prefix");
        buckets.set(object.bucket_id, [...(buckets.get(object.bucket_id) ?? []), object.name]);
      }
      for (const [bucket, paths] of buckets) for (let offset = 0; offset < paths.length; offset += 100) {
        const { error: storageError } = await admin.storage.from(bucket).remove(paths.slice(offset, offset + 100));
        if (storageError) throw storageError;
      }
      const { error: purgeError } = await admin.rpc("purge_company_database", { target_company: company.company_id });
      if (purgeError) throw purgeError;
      results.push({ companyId: company.company_id, purged: true });
    } catch {
      await admin.from("company_lifecycle").update({ purge_error: "Limpeza não concluída. Verificar schema, backups externos e armazenamento." }).eq("company_id", company.company_id);
      results.push({ companyId: company.company_id, purged: false });
    }
  }
  return NextResponse.json({ results }, { status: results.some(result => !result.purged) ? 503 : 200 });
}
