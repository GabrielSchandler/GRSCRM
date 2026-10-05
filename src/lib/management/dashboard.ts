export const DASHBOARD_TIME_ZONE = "America/Sao_Paulo";

export function getDashboardDayRanges(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: DASHBOARD_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  // Brasilia follows UTC-3; use explicit boundaries, never the server's local timezone.
  const today = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00-03:00`).getTime();
  const day = 24 * 60 * 60 * 1000;
  return {
    yesterdayStart: new Date(today - day).toISOString(),
    todayStart: new Date(today).toISOString(),
    tomorrowStart: new Date(today + day).toISOString(),
  };
}

export function formatDailyComparison(today: number, yesterday: number) {
  if (yesterday === 0) return `Ontem: 0 · ${today ? `+${today} hoje` : "Sem variação"}`;
  const change = (today - yesterday) / yesterday * 100;
  const percentage = Math.abs(change).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `Ontem: ${yesterday} · ${change > 0 ? "+" : change < 0 ? "-" : ""}${percentage}%`;
}

const actionLabels: Record<string, string> = {
  "calculation.created": "Simulação criada",
  "calculation.updated": "Simulação atualizada",
  "calculation.deleted": "Simulação excluída",
  "calculation.pdf_generated": "PDF da simulação gerado",
  "pre_sale.created": "Pré-venda criada",
  "pre_sale.updated": "Pré-venda atualizada",
  "pre_sale.status_updated": "Etapa da pré-venda alterada",
  "pre_sale.deleted": "Pré-venda excluída",
  "client.created": "Cliente cadastrado",
  "client.updated": "Cliente atualizado",
  "client.deleted": "Cliente desativado",
  "client.reactivated": "Cliente reativado",
  "client.timeline_note_added": "Anotação adicionada ao cliente",
  "client.timeline_note_updated": "Anotação do cliente atualizada",
  "client.timeline_note_deleted": "Anotação do cliente excluída",
  "client_document.uploaded": "Documento enviado",
  "client_document.bulk_uploaded": "Documentos enviados",
  "client_document.updated": "Documento atualizado",
  "client_document.deleted": "Documento excluído",
  "client_document.replaced": "Arquivo do documento substituído",
  "client_document.approved_for_portal": "Documento aprovado para o portal",
  "client_document.rejected_for_portal": "Documento devolvido para ajuste",
  "client_tracking.approved_for_portal": "Acompanhamento aprovado para o portal",
  "client_tracking.rejected_for_portal": "Acompanhamento devolvido para ajuste",
  "user.created": "Usuário cadastrado",
  "user.updated": "Usuário atualizado",
  "user.activated": "Usuário ativado",
  "user.deactivated": "Usuário desativado",
  "user.password_changed": "Senha alterada",
  "company.updated": "Dados da empresa atualizados",
  "company.logo_uploaded": "Logo da empresa atualizada",
  "company.logo_removed": "Logo da empresa removida",
  "document_template.created": "Template de documento criado",
  "document_template.updated": "Template de documento atualizado",
  "document_template.deleted": "Template de documento excluído",
  "document_template.duplicated": "Template de documento duplicado",
  "document_template.default_set": "Template padrão definido",
  "document_template.docx_uploaded": "Arquivo DOCX do template enviado",
  "document_template.pdf_uploaded": "Arquivo PDF do template enviado",
  "generated_document.docx_created": "Documento DOCX gerado",
  "generated_document.pdf_created": "Documento PDF gerado",
  "generated_document.html_created": "Documento gerado",
  "generated_document.deleted": "Documento gerado excluído",
  "email_template.created": "Template de e-mail criado",
  "email_template.activated": "Template de e-mail ativado",
  "email_template.deactivated": "Template de e-mail desativado",
  "email.draft_created": "Rascunho de e-mail criado",
  "email.sent": "E-mail enviado",
  "document_template.activated": "Template de documento ativado",
  "document_template.deactivated": "Template de documento desativado",
  "restore_full_backup": "Backup completo restaurado",
  "restore_client_backup": "Backup do cliente restaurado",
  "finance.transaction.created": "Lançamento financeiro criado",
  "finance.transaction.updated": "Lançamento financeiro atualizado",
  "finance.transaction.deleted": "Lançamento financeiro excluído",
  "finance.sale.created": "Venda registrada",
  "finance.sale.updated": "Venda atualizada",
  "finance.sale.deleted": "Venda excluída",
  "finance.chargeback.created": "Estorno registrado",
  "finance.chargeback.updated": "Estorno atualizado",
  "finance.chargeback.deleted": "Estorno excluído",
  "finance.audit.restored": "Registro financeiro restaurado",
  "finance.import.completed": "Importação financeira concluída",
  "leads.imported_from_sheets": "Leads importados",
  "leads.assigned": "Leads atribuídos",
  "leads.auto_distributed": "Leads distribuídos",
  "leads.distributed_clients_synced": "Clientes dos leads sincronizados",
  "legal_payment.created": "Pagamento jurídico registrado",
  "legal_payment.updated": "Pagamento jurídico atualizado",
  "legal_payment.deleted": "Pagamento jurídico excluído",
  "legal_workflow.stage_updated": "Etapa jurídica alterada",
  "legal_workflow.stage_created": "Etapa jurídica criada",
  "legal_workflow.stage_definition_updated": "Configuração da etapa jurídica atualizada",
  "legal_workflow.stage_deleted": "Etapa jurídica excluída",
  "legal_workflow.stages_reordered": "Etapas jurídicas reordenadas",
  "legal_workflow.archive_status_updated": "Arquivamento jurídico alterado",
  "legal_workflow.bulk_moved": "Clientes movidos na esteira jurídica",
  "legal_workflow.bulk_move_undone": "Movimentação jurídica desfeita",
};

export function formatDashboardAction(action: string) {
  return actionLabels[action] ?? "Atividade registrada";
}

export function formatDashboardDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: DASHBOARD_TIME_ZONE, dateStyle: "short", timeStyle: "short",
  }).format(new Date(value));
}
