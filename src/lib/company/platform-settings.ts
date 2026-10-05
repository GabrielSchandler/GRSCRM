import type {
  CompanyPlatformSettings,
  CompanyPlatformStatus,
} from "@/types/company";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCompanyBlocked } from "@/lib/company/lifecycle";

export type CompanyModuleKey =
  | "commercial"
  | "legal"
  | "finance"
  | "academy"
  | "lead_distribution"
  | "client_portal"
  | "backups"
  | "outlook_email"
  | "simulations"
  | "documents"
  | "custom_templates";

export type CompanyModuleDefinition = {
  key: CompanyModuleKey;
  field: keyof Pick<
    CompanyPlatformSettings,
    | "enable_commercial"
    | "enable_legal"
    | "enable_finance"
    | "enable_academy"
    | "enable_lead_distribution"
    | "enable_client_portal"
    | "enable_backups"
    | "enable_outlook_email"
    | "enable_simulations"
    | "enable_documents"
    | "enable_custom_templates"
  >;
  label: string;
  shortLabel: string;
  description: string;
  group: "operacao" | "gestao" | "crescimento";
  preparedOnly?: boolean;
};

export const defaultStorageLimitMb = 10 * 1024;

export const companyPlatformStatusOptions: Array<{
  value: CompanyPlatformStatus;
  label: string;
  description: string;
  tone: "success" | "info" | "warning" | "danger";
}> = [
  {
    value: "active",
    label: "Ativa",
    description: "Empresa operando normalmente.",
    tone: "success",
  },
  {
    value: "trial",
    label: "Teste",
    description: "Empresa em avaliação comercial ou onboarding.",
    tone: "info",
  },
  {
    value: "suspended",
    label: "Suspensa",
    description: "Acesso deve ser revisado antes de continuar usando.",
    tone: "warning",
  },
  {
    value: "cancelled",
    label: "Cancelada",
    description: "Conta encerrada, mantida apenas para histórico.",
    tone: "danger",
  },
];

export const companyModuleDefinitions: CompanyModuleDefinition[] = [
  {
    key: "commercial",
    field: "enable_commercial",
    label: "Comercial",
    shortLabel: "Comercial",
    description: "Clientes, pré-vendas, simulações, documentos e painel comercial.",
    group: "operacao",
  },
  {
    key: "legal",
    field: "enable_legal",
    label: "Jurídico",
    shortLabel: "Jurídico",
    description: "Esteira jurídica, documentos jurídicos, emails e acompanhamento.",
    group: "operacao",
  },
  {
    key: "finance",
    field: "enable_finance",
    label: "Financeiro",
    shortLabel: "Financeiro",
    description: "Lancamentos, consultas, importação de planilhas e resultados.",
    group: "operacao",
  },
  {
    key: "academy",
    field: "enable_academy",
    label: "Plataforma de curso",
    shortLabel: "Academia",
    description: "Treinamentos, trilhas, provas e acompanhamento de progresso.",
    group: "crescimento",
  },
  {
    key: "lead_distribution",
    field: "enable_lead_distribution",
    label: "Distribuição de leads",
    shortLabel: "Leads",
    description: "Conexão com planilhas e distribuição manual ou automática.",
    group: "crescimento",
  },
  {
    key: "client_portal",
    field: "enable_client_portal",
    label: "Portal do cliente",
    shortLabel: "Portal",
    description: "Consulta pública de andamento por CPF e protocolo.",
    group: "crescimento",
  },
  {
    key: "backups",
    field: "enable_backups",
    label: "Backups",
    shortLabel: "Backups",
    description: "Rotina de backup, histórico de pacotes e restauração.",
    group: "gestao",
  },
  {
    key: "outlook_email",
    field: "enable_outlook_email",
    label: "Emails Outlook",
    shortLabel: "Outlook",
    description: "Integração Microsoft para emails do jurídico.",
    group: "gestao",
  },
  {
    key: "simulations",
    field: "enable_simulations",
    label: "Simulações",
    shortLabel: "Simulações",
    description: "Análise de correção de juros e geração de PDF.",
    group: "operacao",
  },
  {
    key: "documents",
    field: "enable_documents",
    label: "Documentos",
    shortLabel: "Docs",
    description: "Templates, documentos gerados e anexos dos clientes.",
    group: "operacao",
  },
  {
    key: "custom_templates",
    field: "enable_custom_templates",
    label: "Templates customizados",
    shortLabel: "Templates",
    description: "Templates de contrato, recibo, jurídico e email por empresa.",
    group: "gestao",
  },
];

export function defaultCompanyPlatformSettings(
  companyId: string,
): CompanyPlatformSettings {
  return {
    company_id: companyId,
    status: "active",
    storage_limit_mb: defaultStorageLimitMb,
    enable_commercial: true,
    enable_legal: true,
    enable_finance: true,
    enable_academy: true,
    enable_lead_distribution: true,
    enable_client_portal: true,
    enable_backups: true,
    enable_outlook_email: true,
    enable_simulations: true,
    enable_documents: true,
    enable_custom_templates: true,
    notes: null,
    created_at: null,
    updated_at: null,
  };
}

export function mergeCompanyPlatformSettings(
  companyId: string,
  settings?: Partial<CompanyPlatformSettings> | null,
): CompanyPlatformSettings {
  return {
    ...defaultCompanyPlatformSettings(companyId),
    ...(settings ?? {}),
    company_id: companyId,
  };
}

export async function loadCompanyPlatformSettings(
  supabase: SupabaseClient,
  companyId: string,
) {
  const { data, error } = await supabase
    .from("company_platform_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    if (isCompanyPlatformSettingsMissingError(error)) {
      return {
        settings: defaultCompanyPlatformSettings(companyId),
        tableReady: false,
        errorMessage: null,
      };
    }

    return {
      settings: defaultCompanyPlatformSettings(companyId),
      tableReady: true,
      errorMessage: error.message,
    };
  }

  return {
    settings: mergeCompanyPlatformSettings(
      companyId,
      data as Partial<CompanyPlatformSettings> | null,
    ),
    tableReady: true,
    errorMessage: null,
  };
}

export function isCompanyPlatformSettingsMissingError(error: {
  code?: string;
  message?: string;
} | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes("company_platform_settings") ||
    message.includes("could not find the table")
  );
}

export function isModuleEnabled(
  settings: CompanyPlatformSettings,
  module: CompanyModuleKey,
) {
  if (isCompanyBlocked(settings.status)) return false;
  const definition = companyModuleDefinitions.find((item) => item.key === module);

  if (!definition) {
    return true;
  }

  return settings[definition.field] !== false;
}

export function getCompanyPlatformStatusMeta(status: string | null | undefined) {
  return (
    companyPlatformStatusOptions.find((item) => item.value === status) ??
    companyPlatformStatusOptions[0]
  );
}

export function formatStorageLimit(limitMb: number | null | undefined) {
  const safeLimit = Number(limitMb ?? 0);

  if (!Number.isFinite(safeLimit) || safeLimit <= 0) {
    return "Sem limite definido";
  }

  if (safeLimit >= 1024) {
    const gb = safeLimit / 1024;
    return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
  }

  return `${safeLimit.toFixed(0)} MB`;
}

export function formatBytes(value: number | null | undefined) {
  const bytes = Number(value ?? 0);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unitIndex = 0;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
}

export function getStorageUsagePercent(usedBytes: number, limitMb: number | null) {
  const limitBytes = Number(limitMb ?? 0) * 1024 * 1024;

  if (!Number.isFinite(limitBytes) || limitBytes <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((usedBytes / limitBytes) * 100));
}
