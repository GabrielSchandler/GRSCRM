import Link from "next/link";
import { Clock3, Users, Calculator, Database, FileText, ShieldCheck, Activity } from "lucide-react";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/layout/page-header";
import { resolveUserDisplayName } from "@/lib/users/account";
import { formatDailyComparison, formatDashboardAction, formatDashboardDateTime, getDashboardDayRanges } from "@/lib/management/dashboard";
import { ManagementMetric, ManagementPanel } from "./management-ui";
import { OnlineUsersMetric } from "./online-users-metric";

export async function ManagementOverview() {
  const { supabase, companyId } = await getCurrentUserContext();
  const { yesterdayStart, todayStart, tomorrowStart } = getDashboardDayRanges();
  const dailyCount = (table: "financing_calculations" | "pre_sales", start: string, end: string) =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", start).lt("created_at", end);
  const [users, clients, sales, tracking, documents, backup, events, calculationsToday, calculationsYesterday, salesToday, salesYesterday] = await Promise.all([
    supabase.from("user_profiles").select("id,business_area,role,is_active,full_name,nickname,username,email").eq("company_id", companyId),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("pre_sales").select("id", { count: "exact", head: true }).eq("company_id", companyId).in("status", ["lead", "pre_venda", "em_contato", "em_negociacao"]),
    supabase.from("client_tracking_updates").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("approval_status", "pending").is("deleted_at", null),
    supabase.from("client_documents").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("document_type", "extrajudicial").eq("client_access_status", "pending").is("deleted_at", null),
    supabase.from("backup_jobs").select("started_at,status").eq("company_id", companyId).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("company_audit_logs").select("id,action,entity_label,created_at,user_profile_id").eq("company_id", companyId)
      .not("action", "like", "totalk.%").not("action", "like", "email.outlook_%").order("created_at", { ascending: false }).limit(5),
    dailyCount("financing_calculations", todayStart, tomorrowStart),
    dailyCount("financing_calculations", yesterdayStart, todayStart),
    dailyCount("pre_sales", todayStart, tomorrowStart),
    dailyCount("pre_sales", yesterdayStart, todayStart),
  ]);
  const active = users.error ? null : users.data?.filter(user => user.is_active === true).length ?? 0;
  const pending = tracking.error || documents.error ? null : (tracking.count ?? 0) + (documents.count ?? 0);
  const unavailable = "Indisponível";
  const comparison = (today: typeof calculationsToday, yesterday: typeof calculationsYesterday) =>
    today.error || yesterday.error ? "Comparação indisponível" : formatDailyComparison(today.count ?? 0, yesterday.count ?? 0);
  const backupStatus = ({ completed: "Concluído", failed: "Falhou", running: "Em execução", pending: "Pendente" } as Record<string, string>)[backup.data?.status ?? ""] ?? "Status não informado";
  const areas = [
    { label: "Comercial", filter: (user: { role: string | null; business_area: string | null }) => user.role === "seller" && user.business_area !== "legal" },
    { label: "Jurídico", filter: (user: { role: string | null; business_area: string | null }) => user.role === "seller" && user.business_area === "legal" },
    { label: "Gestão", filter: (user: { role: string | null }) => user.role === "admin" || user.role === "manager" },
  ];
  const attention = [
    { label: "Acompanhamentos para revisão", value: tracking.error ? unavailable : tracking.count ?? 0, href: "/aprovacoes", Icon: Clock3 },
    { label: "Documentos para aprovação", value: documents.error ? unavailable : documents.count ?? 0, href: "/aprovacoes", Icon: FileText },
    { label: "Usuários inativos", value: users.error ? unavailable : users.data?.filter(user => !user.is_active).length ?? 0, href: "/usuarios?status=inactive", Icon: Users },
  ];

  return <>
    <PageHeader title="Gestão" description="Central de comando da empresa e das áreas administrativas." />
    <div className="management-page dashboard-contrast space-y-4 p-4 sm:p-6 lg:px-9">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ManagementMetric label="Aprovações pendentes" value={pending ?? unavailable} icon={Clock3} tone="danger" detail="Acompanhamentos e documentos" />
        <OnlineUsersMetric key={companyId} activeCount={active} />
        <ManagementMetric label="Simulações criadas hoje" value={calculationsToday.error ? unavailable : calculationsToday.count ?? 0} icon={Calculator} tone="success" detail={comparison(calculationsToday, calculationsYesterday)} />
        <ManagementMetric label="Pré-vendas criadas hoje" value={salesToday.error ? unavailable : salesToday.count ?? 0} icon={FileText} tone="warning" detail={comparison(salesToday, salesYesterday)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
        <ManagementPanel title="Requer sua atenção" href="/aprovacoes">
          <div className="divide-y divide-[var(--ns-border)]">{attention.map(({ label, value, href, Icon }) =>
            <Link key={label} href={href} className="flex items-center gap-3 py-4 hover:bg-[var(--ns-surface-hover)]">
              <Icon className="h-5 w-5 shrink-0 text-[var(--ns-primary)]" /><span className="flex-1 text-sm">{label}</span><strong>{value}</strong>
            </Link>)}
          </div>
        </ManagementPanel>
        <ManagementPanel title="Equipe por área" href="/usuarios">{areas.map(area => {
          const members = users.data?.filter(area.filter) ?? [];
          const pct = members.length ? Math.round(members.filter(user => user.is_active).length / members.length * 100) : 0;
          return <div key={area.label} className="border-b border-[var(--ns-border)] py-4 last:border-0">
            <div className="flex justify-between text-sm"><span>{area.label}</span><strong>{users.error ? "—" : members.length}</strong><span>{users.error ? "—" : `${pct}% ativos`}</span></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--ns-surface-hover)]"><div className="h-full bg-[var(--ns-primary)]" style={{ width: `${pct}%` }} /></div>
          </div>;
        })}</ManagementPanel>
        <ManagementPanel title="Operação" href="/dashboard?view=commercial">
          <Link href="/clientes" className="flex justify-between border-b border-[var(--ns-border)] py-5 text-sm"><span>Clientes cadastrados</span><strong>{clients.error ? unavailable : clients.count}</strong></Link>
          <Link href="/pre-vendas" className="flex justify-between py-5 text-sm"><span>Pré-vendas em andamento</span><strong>{sales.error ? unavailable : sales.count}</strong></Link>
        </ManagementPanel>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ManagementPanel title="Controle da empresa" href="/backups">
          <Link href="/backups" className="flex items-center gap-3 border-b border-[var(--ns-border)] py-4 text-sm">
            <Database className="h-5 w-5 shrink-0 text-[var(--ns-primary)]" />
            <span className="min-w-0"><strong className="block">Último backup</strong><span className="text-xs text-[var(--ns-text-secondary)]">{backup.error ? unavailable : backup.data ? `${formatDashboardDateTime(backup.data.started_at)} · ${backupStatus}` : "Sem registro"}</span></span>
          </Link>
          <Link href="/aprovacoes" className="flex items-center gap-3 border-b border-[var(--ns-border)] py-4 text-sm"><FileText className="h-5 w-5 text-[var(--ns-primary)]" />Central de aprovações</Link>
          <Link href="/logs" className="flex items-center gap-3 py-4 text-sm"><ShieldCheck className="h-5 w-5 text-[var(--ns-success)]" />Auditoria da empresa</Link>
        </ManagementPanel>
        <ManagementPanel title="Atividade recente" href="/logs">
          {events.error ? <p className="text-sm text-[var(--ns-text-secondary)]">Não foi possível consultar a auditoria.</p> : events.data?.length ? events.data.map(event => {
            const author = event.user_profile_id ? resolveUserDisplayName(users.data?.find(user => user.id === event.user_profile_id), "Usuário não identificado") : "Sistema";
            return <div key={event.id} className="flex items-start gap-3 border-b border-[var(--ns-border)] py-3 last:border-0">
              <Activity className="mt-1 h-4 w-4 shrink-0 text-[var(--ns-primary)]" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">{formatDashboardAction(event.action)}</p>
                <p className="mt-1 break-words text-xs text-[var(--ns-text-secondary)]">{author}{event.entity_label ? ` · ${event.entity_label}` : ""}</p>
                <time dateTime={event.created_at} className="mt-1 block text-xs text-[var(--ns-text-secondary)]">{formatDashboardDateTime(event.created_at)}</time>
              </div>
            </div>;
          }) : <p className="text-sm text-[var(--ns-text-secondary)]">Sem eventos registrados.</p>}
        </ManagementPanel>
      </div>
    </div>
  </>;
}
