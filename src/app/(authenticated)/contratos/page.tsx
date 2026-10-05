import Link from "next/link";
import { FileText, Users, Files, Braces } from "lucide-react";
import { ManagementMetric } from "@/components/management/management-ui";
import { ReferenceCollection } from "@/components/newsec/reference-collection";
import { ReferenceFacts, ReferenceBadge } from "@/components/newsec/reference-ui";
import { documentVariableCatalog } from "@/lib/documents/template-engine";
import { documentStatusLabels, documentTemplateTypes } from "@/types/document";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { displayValue, formatDateTime } from "@/lib/clients/formatters";
import type { Client } from "@/types/client";
import type { DocumentTemplate, GeneratedDocument } from "@/types/document";

export default async function ContratosPage() {
  const { supabase, companyId, role } = await getCurrentUserContext();
  const { data, error } = await supabase
    .from("generated_documents")
    .select("*")
    .eq("company_id", companyId)
    .eq("document_type", "contrato")
    .order("created_at", { ascending: false });
  const contracts = (data ?? []) as GeneratedDocument[];
  const clientIds = Array.from(
    new Set(contracts.map((contract) => contract.client_id).filter(Boolean)),
  ) as string[];
  const templateIds = Array.from(
    new Set(contracts.map((contract) => contract.template_id).filter(Boolean)),
  );
  const [{ data: clientsData }, { data: templatesData }] = await Promise.all([
    clientIds.length
      ? supabase
          .from("clients")
          .select("id, full_name")
          .eq("company_id", companyId)
          .in("id", clientIds)
      : Promise.resolve({ data: [] }),
    templateIds.length
      ? supabase
          .from("document_templates")
          .select("id, name")
          .eq("company_id", companyId)
          .in("id", templateIds)
      : Promise.resolve({ data: [] }),
  ]);
  const clients = (clientsData ?? []) as Pick<Client, "id" | "full_name">[];
  const templates = (templatesData ?? []) as Pick<DocumentTemplate, "id" | "name">[];


  const canManage = role === "admin" || role === "manager";
  const { data: allTemplateRows, error: templatesError } = canManage
    ? await supabase.from("document_templates").select("*").eq("company_id",companyId).order("updated_at",{ascending:false})
    : { data: [], error: null };
  const allTemplates = (allTemplateRows ?? []) as DocumentTemplate[];
  const variables = documentVariableCatalog.flatMap(group => group.variables);
  const rows = [
    ...contracts.map(contract => {
      const client = clients.find(item => item.id === contract.client_id);
      const template = templates.find(item => item.id === contract.template_id);
      const link = <Link key="actions" href={`/documentos/gerados/${contract.id}`} className="font-semibold text-[var(--ns-primary)]">Visualizar</Link>;
      return {id:contract.id,title:contract.title,search:[contract.title,client?.full_name,template?.name].join(" "),type:"Contrato",status:documentStatusLabels[contract.status],
        cells:[<span key="title" className="font-semibold">{displayValue(contract.title)}</span>,"Contrato",displayValue(client?.full_name ?? null),formatDateTime(contract.created_at),<ReferenceBadge key="status">{documentStatusLabels[contract.status]}</ReferenceBadge>,link],
        detail:<div key={contract.id} className="space-y-4"><ReferenceBadge>Contrato gerado</ReferenceBadge><ReferenceFacts items={[["Nome",contract.title],["Cliente",displayValue(client?.full_name ?? null)],["Template",displayValue(template?.name ?? null)],["Data",formatDateTime(contract.created_at)],["Status",documentStatusLabels[contract.status]]]} />{link}</div>};
    }),
    ...allTemplates.map(template => {
      const typeLabel = documentTemplateTypes.find(item => item.value === template.document_type)?.label ?? template.document_type;
      const links = <div key="actions" className="flex flex-wrap gap-3"><Link href={`/documentos/templates/${template.id}`} className="font-semibold text-[var(--ns-primary)]">Visualizar</Link>{canManage && <Link href={`/documentos/templates/${template.id}/editar`} className="font-semibold text-[var(--ns-primary)]">Editar</Link>}</div>;
      return {id:template.id,title:template.name,search:[template.name,template.description,typeLabel].join(" "),type:"Template",status:template.is_active ? "Ativo" : "Inativo",
        cells:[<div key="title"><p className="font-semibold">{template.name}</p><p className="mt-1 text-[10px] text-[var(--ns-text-secondary)]">{template.description}</p></div>,"Template",typeLabel,formatDateTime(template.updated_at ?? template.created_at),<ReferenceBadge key="status" tone={template.is_active ? "success" : "warning"}>{template.is_active ? "Ativo" : "Inativo"}</ReferenceBadge>,links],
        detail:<div key={template.id} className="space-y-4"><ReferenceBadge>Template</ReferenceBadge><p className="text-xs text-[var(--ns-text-secondary)]">{template.description}</p><ReferenceFacts items={[["Tipo",typeLabel],["Status",template.is_active ? "Ativo" : "Inativo"],["Última edição",formatDateTime(template.updated_at ?? template.created_at)],["Arquivo",template.original_pdf_filename ?? template.original_docx_filename ?? "HTML"],["Modelo padrão",template.is_default ? "Sim" : "Não"]]} />{links}</div>};
    })
  ];
  return <>
    <PageHeader title="Gestão" description="Contratos e templates da operação." />
    <div className="reference-page space-y-4 p-4 sm:p-6">
      {(error || templatesError) && <p role="alert" className="text-sm text-[var(--ns-danger)]">Não foi possível carregar todos os contratos e templates. Os dados abaixo podem estar incompletos.</p>}
      {!error && !templatesError && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><ManagementMetric label="Contratos gerados" value={contracts.length} icon={FileText} tone="success" /><ManagementMetric label="Templates ativos" value={allTemplates.filter(template => template.is_active).length} icon={Files} /><ManagementMetric label="Clientes vinculados" value={clientIds.length} icon={Users} tone="warning" /><ManagementMetric label="Variáveis disponíveis" value={variables.length} icon={Braces} /></div>}
      <ReferenceCollection title="Contratos e templates" detailTitle="Detalhes do contrato ou template" columns={["Nome","Tipo","Cliente / modelo","Última edição","Status","Ações"]} rows={rows} actions={canManage ? <Link href="/documentos/templates/novo" className="rounded-md bg-[var(--ns-primary)] px-4 py-2 text-xs font-semibold text-[var(--ns-primary-foreground)]">+ Novo template</Link> : undefined}>
        <section className="ns-panel p-4"><h2 className="text-sm font-semibold">Organização e variáveis</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{canManage && <Link href="/documentos/templates" className="rounded-md border border-[var(--ns-border)] p-3 text-xs font-semibold text-[var(--ns-primary)]">Gerenciar templates</Link>}<details className="rounded-md border border-[var(--ns-border)] p-3"><summary className="text-xs font-semibold text-[var(--ns-primary)]">Variáveis dinâmicas</summary><div className="mt-3 max-h-60 overflow-y-auto space-y-2">{documentVariableCatalog.map(group => <div key={group.group}><h3 className="text-xs font-semibold">{group.group}</h3><p className="mt-1 break-words font-mono text-[10px] text-[var(--ns-text-secondary)]">{group.variables.map(variable => `{{${variable}}}`).join(" · ")}</p></div>)}</div></details></div></section>
      </ReferenceCollection>
    </div>
  </>;
}

