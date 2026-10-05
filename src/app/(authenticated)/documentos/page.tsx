import { FileText, Files, AlertTriangle, Users } from "lucide-react";
import { ManagementMetric } from "@/components/management/management-ui";
import { ReferenceActions } from "@/components/newsec/reference-actions";
import { ReferenceCollection } from "@/components/newsec/reference-collection";
import { ReferenceFacts, ReferenceBadge } from "@/components/newsec/reference-ui";
import Link from "next/link";
import { DocumentDeleteButton } from "@/components/documents/document-delete-button";
import { DocumentContentPreview } from "@/components/documents/document-content-preview";
import { DocumentsNav } from "@/components/documents/documents-nav";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { displayValue, formatDateTime } from "@/lib/clients/formatters";
import { listAccessiblePreSaleIdsForCurrentUser } from "@/lib/pre-sales/access";
import { resolveUserDisplayName } from "@/lib/users/account";
import {
  documentStatusLabels,
  documentTemplateTypes,
  type DocumentTemplate,
  type DocumentTemplateType,
  type GeneratedDocument,
} from "@/types/document";
import type { Client } from "@/types/client";
import type { UserProfileOption } from "@/types/pre-sale";

type DocumentosPageProps = {
  searchParams: Promise<{
    type?: string;
    client?: string;
    from?: string;
    to?: string;
  }>;
};

function formatTemplateType(type: DocumentTemplateType | null | undefined) {
  return documentTemplateTypes.find((item) => item.value === type)?.label ?? "-";
}

export default async function DocumentosPage({ searchParams }: DocumentosPageProps) {
  const params = await searchParams;
  const { supabase, companyId, role, businessArea, userProfileId } =
    await getCurrentUserContext();
  const canDeleteDocuments = role === "admin" || role === "manager";
  const type = params.type as DocumentTemplateType | undefined;
  let query = supabase
    .from("generated_documents")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (type && documentTemplateTypes.some((item) => item.value === type)) {
    query = query.eq("document_type", type);
  }

  if (params.client?.trim()) {
    query = query.eq("client_id", params.client.trim());
  }

  if (params.from) {
    query = query.gte("created_at", params.from);
  }

  if (params.to) {
    query = query.lte("created_at", `${params.to}T23:59:59`);
  }

  const { data, error } = await query;
  let documents = (data ?? []) as GeneratedDocument[];

  if (role === "seller" && businessArea !== "legal") {
    const accessiblePreSaleIds = new Set(
      (await listAccessiblePreSaleIdsForCurrentUser()) ?? [],
    );
    documents = documents.filter(
      (document) =>
        document.created_by === userProfileId ||
        (document.pre_sale_id ? accessiblePreSaleIds.has(document.pre_sale_id) : false),
    );
  }
  const templateIds = Array.from(new Set(documents.map((document) => document.template_id)));
  const clientIds = Array.from(
    new Set(documents.map((document) => document.client_id).filter(Boolean)),
  ) as string[];
  const creatorIds = Array.from(
    new Set(documents.map((document) => document.created_by).filter(Boolean)),
  ) as string[];

  const [
    { data: templatesData },
    { data: clientsData },
    { data: creatorsData },
    { data: clientOptionsData },
  ] = await Promise.all([
    templateIds.length
      ? supabase.from("document_templates").select("*").in("id", templateIds)
      : Promise.resolve({ data: [] }),
    clientIds.length
      ? supabase
          .from("clients")
          .select("id, full_name")
          .eq("company_id", companyId)
          .in("id", clientIds)
      : Promise.resolve({ data: [] }),
    creatorIds.length
      ? supabase
          .from("user_profiles")
          .select("id, full_name, username, email, role")
          .eq("company_id", companyId)
          .in("id", creatorIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("clients")
      .select("id, full_name")
      .eq("company_id", companyId)
      .order("full_name", { ascending: true }),
  ]);
  const templates = (templatesData ?? []) as DocumentTemplate[];
  const clients = (clientsData ?? []) as Pick<Client, "id" | "full_name">[];
  const creators = (creatorsData ?? []) as UserProfileOption[];
  const clientOptions = (clientOptionsData ?? []) as Pick<Client, "id" | "full_name">[];
  const templatesMap = new Map(templates.map((template) => [template.id, template]));
  const clientsMap = new Map(clients.map((client) => [client.id, client]));
  const creatorsMap = new Map(creators.map((creator) => [creator.id, creator]));


  return <>
    <PageHeader title="Documentos" description="Documentos gerados, templates e arquivos operacionais da empresa." />
    <div className="reference-page space-y-4 p-4 sm:p-6"><DocumentsNav />
      {error ? <p role="alert" className="text-sm text-[var(--ns-danger)]">{error.message}</p> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ManagementMetric label="Documentos carregados" value={documents.length} icon={FileText} />
        <ManagementMetric label="Templates utilizados" value={templates.length} icon={Files} tone="success" />
        <ManagementMetric label="PDFs pendentes / erros" value={documents.filter(d => d.pdf_error_message || d.status === "erro" || d.status === "pdf_error").length} icon={AlertTriangle} tone="danger" />
        <ManagementMetric label="Clientes vinculados" value={clientIds.length} icon={Users} tone="success" />
      </div>
      <details className="ns-panel p-3" open={Boolean(params.type || params.client || params.from || params.to)}><summary className="text-xs font-semibold text-[var(--ns-primary)]">Filtros por cliente e período</summary><form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[220px_1fr_160px_160px_auto]">
          <select
            name="type"
            defaultValue={params.type ?? ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
          >
            <option value="">Todos os tipos</option>
            {documentTemplateTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            name="client"
            defaultValue={params.client ?? ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
          >
            <option value="">Todos os clientes</option>
            {clientOptions.map((client) => (
              <option key={client.id} value={client.id}>
                {client.full_name}
              </option>
            ))}
          </select>
          <input
            name="from"
            type="date"
            defaultValue={params.from ?? ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
          />
          <input
            name="to"
            type="date"
            defaultValue={params.to ?? ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
          />
          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Filtrar
          </button>
        </form></details>


      <ReferenceCollection title="Documentos gerados" detailTitle="Detalhes do documento" columns={["Nome", "Cliente", "Tipo", "Criado por", "Data de criação", "Status", "Ações"]}
        rows={documents.map(document => {
          const typeLabel = formatTemplateType(document.document_type);
          const statusLabel = document.pdf_error_message ? "DOCX gerado, PDF pendente" : documentStatusLabels[document.status];
          const clientName = displayValue(clientsMap.get(document.client_id ?? "")?.full_name ?? null);
          const creatorName = resolveUserDisplayName(creatorsMap.get(document.created_by ?? ""));
          const links = <div className="flex flex-col items-start gap-2"><Link href={`/documentos/gerados/${document.id}`} className="text-[var(--ns-primary)] font-semibold">Visualizar</Link>{document.render_source === "html" && <Link href={`/documentos/gerados/${document.id}/imprimir?print=1`} target="_blank" className="text-[var(--ns-primary)]">PDF HTML</Link>}{canDeleteDocuments && <DocumentDeleteButton documentId={document.id} variant="inline" />}</div>;
          return { id: document.id, title: document.title, search: [document.title, clientName, creatorName].join(" "), type: typeLabel, status: statusLabel,
            cells: [<span key="name" className="line-clamp-2 font-semibold">{document.title}</span>, clientName, typeLabel, creatorName, <span key="date" className="whitespace-nowrap">{formatDateTime(document.created_at)}</span>, <ReferenceBadge key="status" tone={document.status === "gerado" && !document.pdf_error_message ? "success" : "warning"}>{statusLabel}</ReferenceBadge>, <ReferenceActions key="actions">{links}</ReferenceActions>],
            detail: <div key={document.id} className="space-y-4"><ReferenceBadge tone={document.status === "gerado" && !document.pdf_error_message ? "success" : "warning"}>{statusLabel}</ReferenceBadge>{document.render_source === "html" ? <DocumentContentPreview html={document.rendered_content_html} /> : <p className="text-xs text-[var(--ns-text-secondary)]">Arquivo {document.render_source?.toUpperCase() ?? "original"} disponível na visualização do documento.</p>}<ReferenceFacts items={[["Nome", document.title], ["Cliente", clientName], ["Tipo", typeLabel], ["Template", displayValue(templatesMap.get(document.template_id)?.name ?? null)], ["Criado por", creatorName], ["Data de criação", formatDateTime(document.created_at)], ["Formato", document.render_source?.toUpperCase() ?? "HTML"]]} />{links}</div>
          };
        })} />
      </>}
    </div>
  </>;
}

