"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowDownToLine, ArrowUpFromLine, BadgeDollarSign, Percent, Plus, Search, X, Pencil, Trash2, Save, History, CalendarDays, UserRound, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { createFinanceTransactionAction, updateFinanceTransactionAction, deleteFinanceTransactionAction } from "@/app/(authenticated)/financeiro/actions";
import type { FinanceAccount, FinanceAuditLog, FinanceCategory, FinanceSale, FinanceTransaction } from "@/types/finance";
import { financePaymentMethods } from "@/types/finance";
import { financeAmount, financeCashFlow, financeDate, financeNumber, financeVariation, summarizeFinanceOverview } from "@/lib/finance/overview";
import { resolveUserDisplayName } from "@/lib/users/account";
import { ManagementPagination } from "@/components/management/management-pagination";

type FinanceUser = { id: string; full_name: string | null; nickname: string | null; username: string | null };
type Props = { transactions: FinanceTransaction[]; sales: FinanceSale[]; categories: FinanceCategory[]; accounts: FinanceAccount[]; users: FinanceUser[]; auditLogs: FinanceAuditLog[]; today: string; transactionError: boolean; salesError: boolean };
const money = (value: number | string | null | undefined) => financeNumber(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null | undefined) => value ? value.slice(0, 10).split("-").reverse().join("/") : "Não informado";
const control = "finance-control w-full rounded-md border border-[var(--ns-border)] bg-[var(--ns-surface-hover)] px-3 py-2 text-xs text-[var(--ns-text)] outline-none focus:border-[var(--ns-primary)] focus:ring-2 focus:ring-[var(--ns-primary)]/20 disabled:opacity-100";
const panel = "min-w-0 rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)]";
const secondaryButton = "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--ns-border)] px-3 py-2 text-xs font-semibold hover:bg-[var(--ns-surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ns-primary)]";

function statusLabel(row: Pick<FinanceTransaction, "status" | "direction">) {
  if (row.status === "paid") return row.direction === "income" ? "Recebido" : "Pago";
  return ({ planned: "Pendente", overdue: "Atrasado", canceled: "Cancelado" })[row.status];
}

function StatusBadge({ row }: { row: FinanceTransaction }) {
  const tone = row.status === "paid" ? "success" : row.status === "overdue" ? "danger" : row.status === "planned" ? "warning" : "text-secondary";
  return <span className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ color: `var(--ns-${tone})`, background: `color-mix(in srgb, var(--ns-${tone}) 14%, var(--ns-surface))` }}>{statusLabel(row)}</span>;
}

function FinanceMetric({ title, value, detail, icon: Icon, tone }: { title: string; value: string; detail: string; icon: typeof BadgeDollarSign; tone: string }) {
  const color = tone === "award" ? "#8B5CF6" : `var(--ns-${tone})`;
  return <div className={`${panel} flex items-start gap-3 p-3`} style={{ borderLeft: `3px solid ${color}` }}>
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ color, background: `color-mix(in srgb, ${color} 12%, var(--ns-surface))` }}><Icon className="h-5 w-5" /></span>
    <div className="min-w-0"><p className="text-[10px] font-medium uppercase text-[var(--ns-text-secondary)]">{title}</p><p className="mt-1 break-words text-base font-semibold">{value}</p><p className="mt-1 text-[10px] text-[var(--ns-text-secondary)]">{detail}</p></div>
  </div>;
}

function CashFlowChart({ transactions, today }: { transactions: FinanceTransaction[]; today: string }) {
  const [months, setMonths] = useState(6);
  const points = financeCashFlow(transactions, today, months);
  const max = Math.max(1, ...points.flatMap(point => [point.income, point.expense, Math.abs(point.balance)]));
  const left = 60, right = 610, top = 20, bottom = 210;
  const y = (value: number) => top + (max - value) / (max * 2) * (bottom - top);
  const step = (right - left) / points.length;
  const x = (index: number) => left + step * (index + 0.5);
  const barWidth = Math.min(18, step * 0.22);
  const label = (key: string) => new Date(`${key}-01T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", month: "short" }).replace(".", "");
  return <section className={`${panel} p-4`}>
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Fluxo de caixa</h2><select aria-label="Período do fluxo de caixa" value={months} onChange={event => setMonths(Number(event.target.value))} className={`${control} w-auto!`}><option value={3}>Últimos 3 meses</option><option value={6}>Últimos 6 meses</option><option value={12}>Últimos 12 meses</option></select></div>
    <div className="my-4 flex flex-wrap gap-4 text-[10px] text-[var(--ns-text-secondary)]">{[{ label: "Entradas", color: "var(--ns-success)" }, { label: "Saídas", color: "var(--ns-danger)" }, { label: "Saldo acumulado", color: "var(--ns-primary)" }].map(item => <span key={item.label} className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: item.color }} />{item.label}</span>)}</div>
    <svg viewBox="0 0 640 245" className="block aspect-[640/245] w-full" role="img" aria-label="Fluxo de caixa: entradas e saídas pagas e saldo acumulado dos lançamentos">
      {[max, max / 2, 0, -max / 2, -max].map(value => <g key={value}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="var(--ns-border)" /><text x={left - 8} y={y(value) + 3} textAnchor="end" fill="var(--ns-text-secondary)" fontSize={9}>{value.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })}</text></g>)}
      {points.map((point, index) => <g key={point.key}>
        <rect x={x(index) - barWidth - 2} y={y(point.income)} width={barWidth} height={y(0) - y(point.income)} fill="var(--ns-success)"><title>{point.key}: entradas {money(point.income)}</title></rect>
        <rect x={x(index) + 2} y={y(0)} width={barWidth} height={y(-point.expense) - y(0)} fill="var(--ns-danger)"><title>{point.key}: saídas {money(point.expense)}</title></rect>
        <text x={x(index)} y={234} textAnchor="middle" fill="var(--ns-text-secondary)" fontSize={10}>{label(point.key)}</text>
      </g>)}
      <polyline points={points.map((point, index) => `${x(index)},${y(point.balance)}`).join(" ")} fill="none" stroke="var(--ns-primary)" strokeWidth={3} />
      {points.map((point, index) => <circle key={point.key} cx={x(index)} cy={y(point.balance)} r={3} stroke="var(--ns-primary)" strokeWidth={2} fill="var(--ns-surface)"><title>{point.key}: saldo acumulado {money(point.balance)}</title></circle>)}
    </svg>
    {!points.some(point => point.income || point.expense) && <p className="mt-2 text-xs text-[var(--ns-text-secondary)]">Sem pagamentos registrados neste período.</p>}
  </section>;
}

function SaveTransactionButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-[var(--ns-primary)] px-3 py-2 text-xs font-semibold text-[var(--ns-primary-foreground)] disabled:cursor-wait disabled:opacity-60"><Save className="h-4 w-4" />{pending ? "Salvando..." : "Salvar lançamento"}</button>;
}

function TransactionDetails({ row, editing, onEdit, onCancel, onClose, categories, accounts, users, auditLogs, today }: { row: FinanceTransaction | null; editing: boolean; onEdit: () => void; onCancel: () => void; onClose: () => void; categories: FinanceCategory[]; accounts: FinanceAccount[]; users: FinanceUser[]; auditLogs: FinanceAuditLog[]; today: string }) {
  const [tab, setTab] = useState("data");
  const author = resolveUserDisplayName(users.find(user => user.id === row?.created_by), "Não informado");
  const history = auditLogs.filter(log => log.entity_type === "transaction" && log.entity_id === row?.id);
  const action = row ? updateFinanceTransactionAction.bind(null, row.id) : createFinanceTransactionAction;
  return <aside className={`${panel} self-start p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto`} aria-label="Detalhes do lançamento">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{row ? "Detalhes do lançamento" : "Novo lançamento"}</h2><button type="button" title="Fechar detalhes" aria-label="Fechar detalhes do lançamento" onClick={onClose} className="cursor-pointer rounded p-1 hover:bg-[var(--ns-surface-hover)]"><X className="h-4 w-4" /></button></div>
    {row && <><div className="mt-4 flex items-center justify-between"><span className="text-xs font-medium" style={{ color: row.direction === "income" ? "var(--ns-success)" : "var(--ns-danger)" }}>{row.direction === "income" ? "Receita" : "Despesa"}</span><StatusBadge row={row} /></div><p className="mt-3 break-words text-xs font-semibold">{row.description}</p><p className="mt-1 text-xl font-semibold">{money(financeAmount(row))}</p></>}
    <div role="tablist" aria-label="Detalhes financeiros" className="mt-4 flex border-b border-[var(--ns-border)]">{[{ id: "data", label: "Dados" }, { id: "history", label: "Histórico" }].map(item => <button key={item.id} role="tab" aria-selected={tab === item.id} type="button" disabled={editing && item.id === "history"} onClick={() => setTab(item.id)} className={`cursor-pointer border-b-2 px-4 py-2.5 text-xs font-semibold disabled:opacity-50 ${tab === item.id ? "border-[var(--ns-primary)] text-[var(--ns-primary)]" : "border-transparent text-[var(--ns-text-secondary)]"}`}>{item.label}</button>)}</div>
    {tab === "data" ? <form key={`${row?.id ?? "new"}-${editing}`} action={action} className="mt-4 space-y-3">
      <fieldset disabled={!editing} className="space-y-3">
        <div className="grid grid-cols-2 gap-3"><label className="finance-field">Vencimento<input name="due_date" type="date" required defaultValue={row?.due_date ?? today} className={control} /></label><label className="finance-field">Tipo<select name="direction" defaultValue={row?.direction ?? "income"} className={control}><option value="income">Receita</option><option value="expense">Despesa</option></select></label></div>
        <label className="finance-field">Categoria<select name="category_id" defaultValue={row?.category_id ?? ""} className={control}><option value="">Sem categoria</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="finance-field">Cliente / origem<input name="counterparty" defaultValue={row?.counterparty ?? ""} className={control} /></label>
        {row && <div className="finance-field">Registrado por<div className={`${control} flex items-center gap-2`}><UserRound className="h-4 w-4 shrink-0 text-[var(--ns-primary)]" /><span className="break-words">{author}</span></div></div>}
        <label className="finance-field">Descrição<textarea name="description" required rows={3} defaultValue={row?.description ?? ""} className={control} /></label>
        <div className="grid grid-cols-2 gap-3"><label className="finance-field">Valor previsto<input name="amount_expected" inputMode="decimal" required defaultValue={row?.amount_expected ?? ""} className={control} /></label><label className="finance-field">Valor pago<input name="amount_paid" inputMode="decimal" defaultValue={row?.amount_paid ?? ""} className={control} /></label></div>
        <div className="grid grid-cols-2 gap-3"><label className="finance-field">Status<select name="status" defaultValue={row?.status ?? "planned"} className={control}><option value="planned">Pendente</option><option value="paid">Pago / recebido</option><option value="overdue">Atrasado</option><option value="canceled">Cancelado</option></select></label><label className="finance-field">Pagamento<input name="paid_at" type="date" defaultValue={row?.paid_at ?? ""} className={control} /></label></div>
        <label className="finance-field">Conta / banco<select name="account_id" defaultValue={row?.account_id ?? ""} className={control}><option value="">Sem conta</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label className="finance-field">Forma de pagamento<select name="payment_method" defaultValue={row?.payment_method ?? ""} className={control}><option value="">Não informado</option>{row?.payment_method && !(financePaymentMethods as readonly string[]).includes(row.payment_method) && <option value={row.payment_method}>{row.payment_method}</option>}{financePaymentMethods.map(method => <option key={method} value={method}>{method}</option>)}</select></label>
        <label className="finance-field">Observações<textarea name="notes" rows={2} defaultValue={row?.notes ?? ""} className={control} /></label>
      </fieldset>
      {editing ? <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--ns-border)] pt-3"><button type="button" onClick={onCancel} className={secondaryButton}>Cancelar</button><SaveTransactionButton /></div> : <button type="button" onClick={onEdit} className={`${secondaryButton} w-full`}><Pencil className="h-4 w-4" />Editar lançamento</button>}
    </form> : <div role="tabpanel" className="mt-4 space-y-4">{history.length ? history.map(log => <div key={log.id} className="border-b border-[var(--ns-border)] pb-3 text-xs"><p className="font-medium">{({ create: "Lançamento criado", update: "Lançamento atualizado", delete: "Lançamento removido", restore: "Lançamento restaurado" })[log.action_type]}</p><p className="mt-1 text-[var(--ns-text-secondary)]">{resolveUserDisplayName(users.find(user => user.id === log.changed_by), log.changed_by ? "Usuário não identificado" : "Sistema")}</p><time className="mt-1 block text-[var(--ns-text-secondary)]">{new Date(log.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</time></div>) : <p className="text-xs text-[var(--ns-text-secondary)]">Sem alterações no histórico recente carregado.</p>}</div>}
    {row && !editing && <form action={deleteFinanceTransactionAction.bind(null, row.id)} onSubmit={event => { if (!window.confirm(`Remover o lançamento “${row.description}”?`)) event.preventDefault(); }} className="mt-4 border-t border-[var(--ns-border)] pt-3"><button type="submit" className={`${secondaryButton} text-[var(--ns-danger)]`}><Trash2 className="h-4 w-4" />Excluir</button></form>}
  </aside>;
}

export function FinanceOverview({ transactions, sales, categories, accounts, users, auditLogs, today, transactionError, salesError }: Props) {
  const summary = summarizeFinanceOverview(transactions, sales, today);
  const sorted = [...transactions].sort((a, b) => financeDate(b).localeCompare(financeDate(a)) || b.created_at.localeCompare(a.created_at));
  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [showDates, setShowDates] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pageState, setPage] = useState({ number: 1, filter: "" });
  const filter = `${query}|${direction}|${category}|${status}|${start}|${end}`;
  const filtered = sorted.filter(row => (!query || `${row.description} ${row.counterparty ?? ""}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))) && (!direction || row.direction === direction) && (!category || row.category_id === category) && (!status || row.status === status) && (!start || financeDate(row) >= start) && (!end || financeDate(row) <= end));
  const page = pageState.filter === filter ? Math.min(pageState.number, Math.max(1, Math.ceil(filtered.length / 8))) : 1;
  const visible = filtered.slice((page - 1) * 8, page * 8);
  const selected = transactions.find(row => row.id === selectedId) ?? null;
  const select = (row: FinanceTransaction) => { if (!editing) { setSelectedId(row.id); setCreating(false); } };
  const allChecked = visible.length > 0 && visible.every(row => checked.has(row.id));
  const total = (value: number) => transactionError ? "Indisponível" : money(value);
  return <div className="finance-workspace p-4 sm:p-6">
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FinanceMetric title="Saldo do mês" value={total(summary.balance)} detail={transactionError ? "Consulta indisponível" : `${financeVariation(summary.balance, summary.previousBalance)} vs. mês anterior`} icon={BadgeDollarSign} tone="success" />
          <FinanceMetric title="A receber" value={total(summary.receivables)} detail={transactionError ? "Consulta indisponível" : `${summary.receivableCount} títulos pendentes`} icon={ArrowDownToLine} tone="primary" />
          <FinanceMetric title="A pagar" value={total(summary.payables)} detail={transactionError ? "Consulta indisponível" : `${summary.payableCount} títulos pendentes`} icon={ArrowUpFromLine} tone="danger" />
          <FinanceMetric title="Premiações previstas" value={salesError ? "Indisponível" : money(summary.awards)} detail={salesError ? "Consulta indisponível" : `${summary.awardCount} vendas pendentes`} icon={Percent} tone="award" />
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(250px,1fr)]">
          {transactionError ? <section className={`${panel} p-4 text-sm`}>Fluxo de caixa indisponível.</section> : <CashFlowChart transactions={transactions} today={today} />}
          <section className={`${panel} p-4`}><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Resumo financeiro</h2><Link href="/financeiro/consultas?tipo=financeiro" className={`${secondaryButton} text-[var(--ns-primary)]`}>Ver relatório</Link></div>
            {[{ label: "Entradas no mês", value: summary.income, previous: summary.previousIncome, tone: "success", Icon: BadgeDollarSign }, { label: "Saídas no mês", value: summary.expense, previous: summary.previousExpense, tone: "danger", Icon: ArrowUpFromLine }, { label: "Saldo do mês", value: summary.balance, previous: summary.previousBalance, tone: "success", Icon: BadgeDollarSign }, { label: "Saldo de lançamentos no ano", value: summary.balanceYear, tone: "primary", Icon: BadgeDollarSign }].map(item => <div key={item.label} className="flex items-center gap-3 border-b border-[var(--ns-border)] py-3 last:border-0"><item.Icon className="h-5 w-5 shrink-0" style={{ color: `var(--ns-${item.tone})` }} /><div className="min-w-0 flex-1"><p className="text-[10px] text-[var(--ns-text-secondary)]">{item.label}</p><strong className="text-xs">{total(item.value)}</strong></div>{item.previous !== undefined && !transactionError && <span className="text-[10px] text-[var(--ns-text-secondary)]">{financeVariation(item.value, item.previous)}</span>}</div>)}
          </section>
        </div>
        <section className={panel} aria-label="Lançamentos financeiros">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4"><h2 className="text-sm font-semibold">Lançamentos <span className="ml-1 rounded-full bg-[var(--ns-surface-hover)] px-2 py-1 text-[10px] text-[var(--ns-primary)]">{filtered.length}</span>{checked.size > 0 && <span className="ml-2 text-xs font-normal text-[var(--ns-text-secondary)]">{checked.size} selecionados</span>}</h2><button type="button" disabled={editing} onClick={() => { setCreating(true); setSelectedId(null); setEditing(true); }} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[var(--ns-primary)] px-3 py-2 text-xs font-semibold text-[var(--ns-primary-foreground)] disabled:opacity-50"><Plus className="h-4 w-4" />Novo lançamento</button></div>
          <div className="flex flex-wrap gap-2 p-4"><label className="relative min-w-44 flex-1"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--ns-text-secondary)]" /><input aria-label="Buscar lançamentos" placeholder="Buscar por descrição, cliente..." value={query} onChange={event => setQuery(event.target.value)} className={`${control} pl-8!`} /></label><select aria-label="Tipo do lançamento" value={direction} onChange={event => setDirection(event.target.value)} className={`${control} w-auto!`}><option value="">Todos os tipos</option><option value="income">Receita</option><option value="expense">Despesa</option></select><select aria-label="Categoria do lançamento" value={category} onChange={event => setCategory(event.target.value)} className={`${control} w-auto! max-w-40`}><option value="">Todas as categorias</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Status do lançamento" value={status} onChange={event => setStatus(event.target.value)} className={`${control} w-auto!`}><option value="">Todos os status</option><option value="planned">Pendente</option><option value="paid">Pago / recebido</option><option value="overdue">Atrasado</option><option value="canceled">Cancelado</option></select><button type="button" aria-label="Filtrar por datas" aria-expanded={showDates} title="Filtrar por datas" onClick={() => setShowDates(!showDates)} className={secondaryButton}><CalendarDays className="h-4 w-4" /></button>
            {showDates && <div className="flex w-full flex-wrap items-end gap-3"><label className="finance-field">De<input type="date" aria-label="Data inicial" value={start} onChange={event => setStart(event.target.value)} className={control} /></label><label className="finance-field">Até<input type="date" aria-label="Data final" value={end} min={start || undefined} onChange={event => setEnd(event.target.value)} className={control} /></label><button type="button" onClick={() => { setStart(""); setEnd(""); }} className={secondaryButton}>Limpar período</button></div>}
          </div>
          <div className="overflow-x-auto"><table className="finance-overview-table w-full min-w-[720px] text-left text-[11px]">
<thead><tr><th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Selecionar lançamentos da página" disabled={visible.length === 0} checked={allChecked} onChange={event => setChecked(previous => { const next = new Set(previous); visible.forEach(row => event.target.checked ? next.add(row.id) : next.delete(row.id)); return next; })} className="cursor-pointer accent-[var(--ns-primary)]" /></th>{["Data", "Tipo", "Categoria", "Cliente / descrição", "Registrado por", "Valor", "Status", "Ações"].map(label => <th key={label} className="px-2 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody>{visible.map(row => <tr key={row.id} tabIndex={0} aria-label={`Ver lançamento ${row.description}`} onMouseEnter={() => select(row)} onFocus={() => select(row)} onClick={() => select(row)} onKeyDown={event => { if (event.target === event.currentTarget && event.key === "Enter") select(row); }} className={`cursor-pointer border-t border-[var(--ns-border)] ${selectedId === row.id ? "finance-selected" : ""}`}>
              <td className="px-3 py-3"><input type="checkbox" aria-label={`Selecionar lançamento ${row.description}`} checked={checked.has(row.id)} onClick={event => event.stopPropagation()} onChange={event => setChecked(previous => { const next = new Set(previous); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} className="cursor-pointer accent-[var(--ns-primary)]" /></td>
              <td className="whitespace-nowrap px-2 py-3 text-[var(--ns-text-secondary)]">{date(financeDate(row))}</td><td className="px-2 py-3"><span className="inline-flex items-center gap-1 font-medium" style={{ color: row.direction === "income" ? "var(--ns-success)" : "var(--ns-danger)" }}>{row.direction === "income" ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}{row.direction === "income" ? "Receita" : "Despesa"}</span></td>
              <td className="px-2 py-3 text-[var(--ns-text-secondary)]">{categories.find(item => item.id === row.category_id)?.name ?? "Sem categoria"}</td><td className="max-w-52 px-2 py-3"><p className="break-words font-medium">{row.counterparty ?? row.description}</p>{row.counterparty && <p className="mt-1 break-words text-[10px] text-[var(--ns-text-secondary)]">{row.description}</p>}</td><td className="px-2 py-3 text-[var(--ns-text-secondary)]">{resolveUserDisplayName(users.find(user => user.id === row.created_by), "Não informado")}</td><td className="whitespace-nowrap px-2 py-3 font-medium" style={{ color: row.direction === "expense" ? "var(--ns-danger)" : "var(--ns-text)" }}>{money(financeAmount(row))}</td><td className="px-2 py-3"><StatusBadge row={row} /></td><td className="px-2 py-3"><button type="button" aria-label={`Detalhes de ${row.description}`} title="Ver detalhes" className="cursor-pointer rounded p-1 hover:bg-[var(--ns-surface-hover)]" onClick={event => { event.stopPropagation(); select(row); }}><History className="h-4 w-4 text-[var(--ns-text-secondary)]" /></button></td>
            </tr>)}{!visible.length && <tr><td colSpan={9} className="p-8 text-center text-xs text-[var(--ns-text-secondary)]">{transactionError ? "Não foi possível carregar os lançamentos." : "Nenhum lançamento encontrado."}</td></tr>}</tbody>
          </table></div>
          <ManagementPagination page={page} count={filtered.length} pageSize={8} onChange={number => setPage({ number, filter })} />
        </section>
      </div>
      {(selected || creating) ? <TransactionDetails key={selected?.id ?? "new"} row={selected} editing={editing} categories={categories} accounts={accounts} users={users} auditLogs={auditLogs} today={today} onEdit={() => setEditing(true)} onCancel={() => { setEditing(false); setCreating(false); if (!selected) setSelectedId(sorted[0]?.id ?? null); }} onClose={() => { if (!editing || window.confirm("Descartar as alterações não salvas?")) { setSelectedId(null); setCreating(false); setEditing(false); } }} /> : <aside className={`${panel} p-4 xl:sticky xl:top-4`} aria-label="Detalhes do lançamento"><h2 className="text-sm font-semibold">Detalhes do lançamento</h2><p className="my-6 text-xs text-[var(--ns-text-secondary)]">{transactions.length ? "Nenhum lançamento selecionado." : "Nenhum lançamento cadastrado."}</p><button type="button" onClick={() => { setCreating(true); setEditing(true); }} className={`${secondaryButton} text-[var(--ns-primary)]`}><Plus className="h-4 w-4" />Novo lançamento</button></aside>}
    </div>
  </div>;
}
