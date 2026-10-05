import { Edit, Eye, Plus, Files, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import { ReferenceActions } from "@/components/newsec/reference-actions";
import { ReferenceCollection } from "@/components/newsec/reference-collection";
import { ReferenceFacts, ReferenceBadge } from "@/components/newsec/reference-ui";
import { ManagementMetric } from "@/components/management/management-ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentTemplateActions } from "@/components/documents/document-template-actions";
import { DocumentsNav } from "@/components/documents/documents-nav";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { formatDateTime } from "@/lib/clients/formatters";
import {
  getLegalWorkflowStage,
  legalWorkflowStages,
  mapLegalWorkflowStageRow,
} from "@/lib/legal/workflow";
import {
  documentTemplateTypes,
  type DocumentTemplate,
  type DocumentTemplateType,
} from "@/types/document";

type TemplatesPageProps = {
  searchParams: Promise<{
    q?: string;
    type?: string;
    active?: string;
  }>;
};

function canManageTemplates(role: string | null) {
  return role === "admin" || role === "manager";
}

function formatTemplateType(type: DocumentTemplate["document_type"]) {
  return documentTemplateTypes.find((item) => item.value === type)?.label ?? type;
}

export default async function TemplatesPage({ searchParams }: TemplatesPageProps) {
  const params = await searchParams;
  const { supabase, companyId, role } = await getCurrentUserContext();

  if (!canManageTemplates(role)) {
    notFound();
  }

  const search = params.q?.trim() ?? "";
  const type = params.type as DocumentTemplateType | undefined;
  const active = params.active ?? "all";
  let query = supabase
    .from("document_templates")
    .select("*")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  if (type && documentTemplateTypes.some((item) => item.value === type)) {
    query = query.eq("document_type", type);
  }

  if (active === "active") {
    query = query.eq("is_active", true);
  } else if (active === "inactive") {
    query = query.eq("is_active", false);
  }

  const { data, error } = await query;
  const templates = (data ?? []) as DocumentTemplate[];
  const { data: stagesData, error: stagesError } = await supabase
    .from("legal_workflow_stages")
    .select("id, legacy_key, title, short_title, description, color, expected_documents, position")
    .eq("company_id", companyId)
    .order("position");
  const workflowStages = !stagesError && stagesData?.length
    ? stagesData.map(mapLegalWorkflowStageRow)
    : legalWorkflowStages;


  return <>
    <PageHeader title="Templates de documentos" description="Contratos e templates operacionais da empresa." />
    <div className="reference-page space-y-4 p-4 sm:p-6"><DocumentsNav />
      {error ? <p role="alert" className="text-sm text-[var(--ns-danger)]">{error.message}</p> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ManagementMetric label="Templates carregados" value={templates.length} icon={Files} />
        <ManagementMetric label="Templates ativos" value={templates.filter(t => t.is_active).length} icon={CheckCircle2} tone="success" />
        <ManagementMetric label="Arquivos vinculados" value={templates.filter(t => t.original_pdf_path || t.original_docx_path).length} icon={FileText} />
        <ManagementMetric label="Modelos padrão" value={templates.filter(t => t.is_default).length} icon={ShieldCheck} tone="warning" />
      </div>
      <details className="ns-panel p-3" open={Boolean(params.q || params.type || (params.active && params.active !== "all"))}><summary className="text-xs font-semibold text-[var(--ns-primary)]">Filtros avançados</summary><div className="pt-3">
          <form className="grid gap-3 md:grid-cols-[1fr_220px_180px_auto]">
            <input
              name="q"
              defaultValue={search}
              placeholder="Buscar por nome"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            />
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
              name="active"
              defaultValue={active}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Filtrar
            </button>
          </form>
          </div></details>
      <ReferenceCollection title="Contratos e templates" detailTitle="Detalhes do template" actions={<Link href="/documentos/templates/novo" className="inline-flex items-center gap-2 rounded-md bg-[var(--ns-primary)] px-3 py-2 text-xs font-semibold text-[var(--ns-primary-foreground)]"><Plus className="h-4 w-4" />Novo template</Link>} columns={["Nome", "Tipo", "Etapa jurídica", "Arquivo", "Status", "Última edição", "Ações"]} rows={templates.map(template => {
        const typeLabel = formatTemplateType(template.document_type);
        const stage = template.legal_stage_id || template.legal_stage ? getLegalWorkflowStage(template.legal_stage_id ?? template.legal_stage, workflowStages).shortLabel : "-";
        const fileLabel = template.original_pdf_path ? "PDF vinculado" : template.original_docx_path ? "DOCX vinculado" : "HTML";
        const links = <div key="actions" className="flex flex-wrap gap-2"><Link href={`/documentos/templates/${template.id}`} title="Visualizar template" className="text-[var(--ns-primary)]"><Eye className="h-4 w-4" /></Link><Link href={`/documentos/templates/${template.id}/editar`} title="Editar template" className="text-[var(--ns-primary)]"><Edit className="h-4 w-4" /></Link><DocumentTemplateActions templateId={template.id} isActive={template.is_active} isDefault={template.is_default} /></div>;
        return { id: template.id, title: template.name, search: [template.name, template.description, typeLabel, stage].join(" "), type: typeLabel, status: template.is_active ? "Ativo" : "Inativo",
          cells: [<div key="name"><p className="line-clamp-2 font-semibold">{template.name}</p><p className="mt-1 line-clamp-1 text-[10px] text-[var(--ns-text-secondary)]">{template.description}</p></div>, typeLabel, stage, fileLabel, <ReferenceBadge key="status" tone={template.is_active ? "success" : "warning"}>{template.is_active ? "Ativo" : "Inativo"}</ReferenceBadge>, formatDateTime(template.updated_at ?? template.created_at), <ReferenceActions key="actions">{links}</ReferenceActions>],
          detail: <div key={template.id} className="space-y-4"><ReferenceBadge tone={template.is_active ? "success" : "warning"}>{template.is_active ? "Ativo" : "Inativo"}</ReferenceBadge><p className="text-xs text-[var(--ns-text-secondary)]">{template.description}</p><ReferenceFacts items={[["Tipo", typeLabel], ["Etapa jurídica", stage], ["Arquivo", fileLabel], ["Última edição", formatDateTime(template.updated_at ?? template.created_at)], ["Modelo padrão", template.is_default ? "Sim" : "Não"]]} /><Link href={`/documentos/templates/${template.id}/editar`} className="inline-flex gap-2 rounded-md bg-[var(--ns-primary)] px-4 py-2 text-xs font-semibold text-[var(--ns-primary-foreground)]"><Edit className="h-4 w-4" />Editar</Link>{links}</div>
        };
      })} />
      </>}
    </div>
  </>;
}

