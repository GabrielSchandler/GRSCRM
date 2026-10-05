export type FinanceDirection = "income" | "expense";
export type FinanceTransactionStatus = "planned" | "paid" | "overdue" | "canceled";
export type FinanceSaleStatus = "confirmed" | "pending" | "canceled";
export type FinanceChargebackStatus = "pending" | "charged" | "lost" | "canceled";

export type FinanceCategory = {
  id: string;
  company_id: string;
  name: string;
  kind: "income" | "expense" | "both";
  is_active: boolean | null;
};

export type FinanceAccount = {
  id: string;
  company_id: string;
  name: string;
  account_type: "bank" | "cash" | "platform" | "card" | "other";
  is_active: boolean | null;
};

export type FinanceTransaction = {
  id: string;
  company_id: string;
  direction: FinanceDirection;
  status: FinanceTransactionStatus;
  due_date: string;
  paid_at: string | null;
  description: string;
  counterparty: string | null;
  category_id: string | null;
  account_id: string | null;
  amount_expected: number | string | null;
  amount_paid: number | string | null;
  payment_method: string | null;
  source: "manual" | "excel_import" | "pre_sale" | "adjustment" | string;
  source_hash: string | null;
  notes: string | null;
  created_at: string;
  created_by?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
};

export type FinanceSale = {
  id: string;
  company_id: string;
  sale_date: string;
  client_name: string;
  client_cpf: string | null;
  consultant_user_id: string | null;
  consultant_name: string | null;
  modality: string | null;
  platform: string | null;
  installment_count: string | null;
  gross_amount: number | string | null;
  goal_amount: number | string | null;
  debtor_amount: number | string | null;
  award_amount: number | string | null;
  report_amount: number | string | null;
  status: FinanceSaleStatus;
  source: "manual" | "excel_import" | "pre_sale" | string;
  source_hash: string | null;
  notes: string | null;
  created_at: string;
};

export type FinanceChargeback = {
  id: string;
  company_id: string;
  chargeback_date: string;
  client_name: string;
  client_cpf: string | null;
  amount: number | string | null;
  charged_at: string | null;
  status: FinanceChargebackStatus;
  source: "manual" | "excel_import" | string;
  source_hash: string | null;
  notes: string | null;
  created_at: string;
};

export type FinanceImportBatch = {
  id: string;
  company_id: string;
  file_name: string;
  file_size_bytes: number | string | null;
  status: "completed" | "partial" | "failed";
  summary: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

export type FinanceAuditLog = {
  id: string;
  company_id: string;
  entity_type: "transaction" | "sale" | "chargeback";
  entity_id: string;
  action_type: "create" | "update" | "delete" | "restore";
  entity_label: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  changed_by: string | null;
  restored_at: string | null;
  restored_by: string | null;
  created_at: string;
};

export const financePaymentMethods = [
  "Pix",
  "Boleto",
  "Cartao",
  "Dinheiro",
  "Transferencia",
  "PayUp",
  "Outros",
] as const;

export const financeModalityOptions = [
  "Veículo",
  "Imóvel",
  "Empréstimo",
  "Outros",
] as const;
