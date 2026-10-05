import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ManagementAudit } from "@/components/management/management-audit";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessAuditLogs } from "@/lib/audit/log";
import { displayValue, formatDateTime } from "@/lib/clients/formatters";
import { resolveUserDisplayName } from "@/lib/users/account";
import { getHomeForRole } from "@/lib/workspace";
import type { CompanyAuditLog } from "@/types/audit-log";

type LogsPageProps = {
  searchParams: Promise<{
    action?: string;
    entity?: string;
    user?: string;
    from?: string;
    to?: string;
  }>;
};

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return error?.code === "PGRST205" || error?.message?.toLowerCase().includes("company_audit_logs") || false;
}

export default async function LogsPage({ searchParams }: LogsPageProps) {
  const params = await searchParams;
  const { supabase, companyId, role, businessArea } = await getCurrentUserContext();

  if (!canAccessAuditLogs(role)) {
    redirect(getHomeForRole(role, businessArea));
  }

  let query = supabase
    .from("company_audit_logs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (params.action?.trim()) {
    query = query.ilike("action", `%${params.action.trim()}%`);
  }

  if (params.entity?.trim()) {
    query = query.eq("entity_type", params.entity.trim());
  }

  if (params.user?.trim()) {
    query = query.eq("user_profile_id", params.user.trim());
  }

  if (params.from) {
    query = query.gte("created_at", params.from);
  }

  if (params.to) {
    query = query.lte("created_at", `${params.to}T23:59:59`);
  }

  const { data, error } = await query;
  const logs = (data ?? []) as CompanyAuditLog[];
  const userIds = Array.from(new Set(logs.map((item) => item.user_profile_id).filter(Boolean))) as string[];
  const entityTypes = Array.from(new Set(logs.map((item) => item.entity_type))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const { data: userProfiles } = userIds.length
    ? await supabase
        .from("user_profiles")
        .select("id, full_name, username, email")
        .eq("company_id", companyId)
        .in("id", userIds)
    : { data: [] };

  const users = (userProfiles ?? []) as Array<{
    id: string;
    full_name: string | null;
    username: string | null;
    email: string | null;
  }>;

  return (
    <>
      <PageHeader
        title="Gestão"
        description="Acompanhe quem criou, alterou, gerou ou excluiu registros dentro da empresa."
      />
      <div className="space-y-6 p-6">
        <details open={Boolean(params.action || params.entity || params.user || params.from || params.to)}>
        <summary className="mb-3 text-sm font-semibold text-[var(--ns-primary)]">Filtros da auditoria</summary>
        <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_160px_180px_150px_150px_auto]">
          <input
            name="action"
            defaultValue={params.action ?? ""}
            placeholder="Buscar por ação"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
          />
          <select
            name="entity"
            defaultValue={params.entity ?? ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
          >
            <option value="">Todas as entidades</option>
            {entityTypes.map((entityType) => (
              <option key={entityType} value={entityType}>
                {entityType}
              </option>
            ))}
          </select>
          <select
            name="user"
            defaultValue={params.user ?? ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
          >
            <option value="">Todos os usuários</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {resolveUserDisplayName(user, user.id)}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="from"
            defaultValue={params.from ?? ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
          />
          <input
            type="date"
            name="to"
            defaultValue={params.to ?? ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
          />
          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Filtrar
          </button>
        </form>
        </details>

        {error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {isMissingTableError(error)
              ? "A tabela de logs ainda não existe nesta instância. Rode o SQL da entrega no Supabase e recarregue a página."
              : error.message}
          </div>
        ) : (
          <>
          <ManagementAudit logs={logs} users={users} />
          <details className="management-page rounded-lg border border-[var(--ns-border)] p-4"><summary className="cursor-pointer text-sm font-semibold">Listagem completa</summary>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Data</th>
                    <th className="px-4 py-3 font-semibold">Usuário</th>
                    <th className="px-4 py-3 font-semibold">Ação</th>
                    <th className="px-4 py-3 font-semibold">Entidade</th>
                    <th className="px-4 py-3 font-semibold">Registro</th>
                    <th className="px-4 py-3 font-semibold">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => {
                    const user = users.find((item) => item.id === log.user_profile_id);

                    return (
                      <tr key={log.id} className="align-top transition hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-700">
                          {formatDateTime(log.created_at)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {resolveUserDisplayName(user, "Sistema")}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {log.action}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{log.entity_type}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {displayValue(log.entity_label ?? log.entity_id)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <pre className="max-w-[420px] whitespace-pre-wrap break-words text-xs text-slate-600">
                            {JSON.stringify(log.details ?? {}, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    );
                  })}
                  {!logs.length ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                        Nenhum log encontrado para os filtros atuais.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          </details>
          </>
        )}
      </div>
    </>
  );
}
