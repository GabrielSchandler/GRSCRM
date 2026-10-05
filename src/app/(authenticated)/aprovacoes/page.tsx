import { Clock3, FileText, MessageSquareText, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import {
  type DocumentApprovalQueueItem,
  type TrackingApprovalQueueItem,
} from "@/components/approvals/client-approval-queue";
import { PageHeader } from "@/components/layout/page-header";
import { ManagementApprovals } from "@/components/management/management-approvals";
import { ManagementMetric } from "@/components/management/management-ui";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { formatDateTime } from "@/lib/clients/formatters";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserDisplayName } from "@/lib/users/account";
import type { ClientDocument } from "@/types/client-document";
import type { ClientTrackingUpdate } from "@/types/client-tracking";

type ClientSummary = { id: string; full_name: string };
type PreSaleSummary = {
  id: string;
  tracking_protocol: string | null;
  service_type: string | null;
};
type UserSummary = {
  id: string;
  full_name: string | null;
  nickname: string | null;
  username: string | null;
  email: string | null;
};

export default async function ClientApprovalsPage() {
  const context = await getCurrentUserContext();
  const canReview =
    context.isPlatformOwner || context.role === "admin" || context.role === "manager";

  if (!canReview) redirect("/areas");
  if (context.isPlatformOwner && !context.activeCompany) redirect("/empresas");

  const adminSupabase = createAdminClient();
  const [trackingResult, documentResult] = await Promise.all([
    adminSupabase
      .from("client_tracking_updates")
      .select("*")
      .eq("company_id", context.companyId)
      .eq("approval_status", "pending")
      .is("deleted_at", null)
      .order("approval_requested_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(100),
    adminSupabase
      .from("client_documents")
      .select("*")
      .eq("company_id", context.companyId)
      .eq("document_type", "extrajudicial")
      .eq("client_access_status", "pending")
      .is("deleted_at", null)
      .order("client_access_requested_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  if (trackingResult.error) throw new Error(trackingResult.error.message);
  if (documentResult.error) throw new Error(documentResult.error.message);

  const trackingUpdates = (trackingResult.data ?? []) as ClientTrackingUpdate[];
  const documents = (documentResult.data ?? []) as ClientDocument[];
  const clientIds = Array.from(
    new Set([...trackingUpdates.map((item) => item.client_id), ...documents.map((item) => item.client_id)]),
  );
  const preSaleIds = Array.from(
    new Set([
      ...trackingUpdates.map((item) => item.pre_sale_id),
      ...documents.map((item) => item.pre_sale_id).filter(Boolean),
    ]),
  ) as string[];
  const userIds = Array.from(
    new Set([
      ...trackingUpdates.map((item) => item.approval_requested_by ?? item.created_by),
      ...documents.map((item) => item.client_access_requested_by ?? item.uploaded_by),
    ].filter(Boolean)),
  ) as string[];

  const [clientsResult, preSalesResult, usersResult] = await Promise.all([
    clientIds.length
      ? adminSupabase.from("clients").select("id, full_name").eq("company_id", context.companyId).in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
    preSaleIds.length
      ? adminSupabase.from("pre_sales").select("id, tracking_protocol, service_type").eq("company_id", context.companyId).in("id", preSaleIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? adminSupabase.from("user_profiles").select("id, full_name, nickname, username, email").eq("company_id", context.companyId).in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (clientsResult.error) throw new Error(clientsResult.error.message);
  if (preSalesResult.error) throw new Error(preSalesResult.error.message);
  if (usersResult.error) throw new Error(usersResult.error.message);

  const clients = new Map((clientsResult.data as ClientSummary[]).map((item) => [item.id, item]));
  const preSales = new Map((preSalesResult.data as PreSaleSummary[]).map((item) => [item.id, item]));
  const users = new Map((usersResult.data as UserSummary[]).map((item) => [item.id, item]));
  const getUserName = (id: string | null) =>
    id ? resolveUserDisplayName(users.get(id) ?? null, "Usuário não identificado") : "Usuário não identificado";

  const trackingItems: TrackingApprovalQueueItem[] = trackingUpdates.map((item) => {
    const preSale = preSales.get(item.pre_sale_id);
    return {
      id: item.id,
      clientId: item.client_id,
      clientName: clients.get(item.client_id)?.full_name ?? "Cliente não identificado",
      preSaleId: item.pre_sale_id,
      protocol: preSale?.tracking_protocol ?? null,
      serviceType: preSale?.service_type ?? null,
      title: item.title,
      description: item.description,
      trackingStatus: item.status,
      eventAt: item.event_at,
      requestedAt: item.approval_requested_at ?? item.created_at,
      requestedBy: getUserName(item.approval_requested_by ?? item.created_by),
    };
  });
  const documentItems: DocumentApprovalQueueItem[] = documents.map((item) => {
    const preSale = item.pre_sale_id ? preSales.get(item.pre_sale_id) : null;
    return {
      id: item.id,
      clientId: item.client_id,
      clientName: clients.get(item.client_id)?.full_name ?? "Cliente não identificado",
      preSaleId: item.pre_sale_id,
      protocol: preSale?.tracking_protocol ?? null,
      serviceType: preSale?.service_type ?? null,
      title: item.title || item.file_name,
      description: item.description,
      fileName: item.file_name,
      fileSize: item.file_size,
      requestedAt: item.client_access_requested_at ?? item.created_at,
      requestedBy: getUserName(item.client_access_requested_by ?? item.uploaded_by),
      visibilityRequested: item.client_visibility_requested,
      downloadRequested: item.client_download_requested,
    };
  });
  const oldestRequest = [...trackingItems, ...documentItems]
    .map((item) => item.requestedAt)
    .sort()[0] ?? null;

  return (
    <>
      <PageHeader
        title="Gestão"
        description="Revise tudo o que poderá ser exibido ou baixado no portal de acompanhamento."
      />
      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ManagementMetric label="Aprovações pendentes" value={trackingItems.length + documentItems.length} icon={ShieldCheck} tone="danger" />
            <ManagementMetric label="Acompanhamentos" value={trackingItems.length} icon={MessageSquareText} />
            <ManagementMetric label="Documentos" value={documentItems.length} icon={FileText} tone="success" />
            <ManagementMetric label="Solicitação mais antiga" value={oldestRequest ? new Date(oldestRequest).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Fila vazia"} detail={oldestRequest ? formatDateTime(oldestRequest) : undefined} icon={Clock3} tone="warning" />
          </section>
          <ManagementApprovals trackingItems={trackingItems} documentItems={documentItems} />
        </div>
      </div>
    </>
  );
}
