"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Clock, FileText, MessageCircle, Pencil, Play, Trophy, Users } from "lucide-react";
import { displayCpf, displayPhone, formatDate } from "@/lib/clients/formatters";
import type { ClientListItem } from "@/types/client";

type PreviewClient = ClientListItem & {
  email: string | null;
  consultant: string | null;
  sale: { id: string; status: string; pre_sale_type: string; media: string | null; created_at: string; updated_at: string | null } | null;
  documents: { id: string; title: string; created_at: string }[];
  calculation: { id: string; financial_institution: string | null; estimated_savings: number | string | null; installment_reduction_percentage: number | string | null; created_at: string } | null;
};

const labels: Record<string, string> = { aprovado: "Aprovado", lead: "Lead", pre_venda: "Pré-venda", em_contato: "Em contato", em_negociacao: "Em negociação", perdido: "Perdido", inativo: "Inativo", distrato: "Distrato", veiculo: "Veículo", imovel: "Imóvel", emprestimo: "Empréstimo" };
const currency = (value: number | string | null) => Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("");

export function ClientsWorkspace({ clients, total, children }: { clients: PreviewClient[]; total: number; children: React.ReactNode }) {
  const router = useRouter();
  const [previewId, setPreviewId] = useState(clients[0]?.id);
  const [tab, setTab] = useState("Resumo");
  const selected = clients.find((client) => client.id === previewId) ?? clients[0];
  const stats = [
    { label: "Total de clientes", value: total, detail: "clientes nesta consulta", icon: Users, color: "var(--ns-primary)" },
    { label: "Sem pré-venda", value: clients.filter((client) => !client.sale).length, detail: "nesta página", icon: Clock, color: "var(--ns-danger)" },
    { label: "Em andamento", value: clients.filter((client) => client.sale && ["lead", "pre_venda", "em_contato", "em_negociacao"].includes(client.sale.status)).length, detail: "nesta página", icon: Play, color: "var(--ns-success)" },
    { label: "Aprovados", value: clients.filter((client) => client.sale?.status === "aprovado").length, detail: "nesta página", icon: Trophy, color: "var(--ns-warning)" },
  ];
  const status = (client: PreviewClient) => client.deleted_at ? "Inativo" : client.sale ? labels[client.sale.status] ?? client.sale.status : "Ativo";
  const linkClass = "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--ns-border)] px-3 py-2 text-xs font-semibold text-[var(--ns-text)] transition hover:bg-[var(--ns-surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ns-primary)]";

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo dos clientes">
        {stats.map(({ icon: Icon, ...stat }) => <article key={stat.label} className="relative flex gap-4 overflow-hidden rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-5">
          <span className="absolute inset-y-0 left-0 w-1" style={{ background: stat.color }} />
          <Icon className="h-9 w-9 shrink-0 rounded-lg p-2" style={{ color: stat.color, background: `color-mix(in srgb, ${stat.color} 12%, transparent)` }} />
          <div><p className="text-[11px] font-semibold uppercase text-[var(--ns-text-secondary)]">{stat.label}</p><p className="mt-1 text-2xl font-semibold">{stat.value}</p><p className="mt-1 text-xs text-[var(--ns-text-secondary)]">{stat.detail}</p></div>
        </article>)}
      </section>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 overflow-hidden rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)]">
          <div className="flex items-center justify-between px-4 py-4"><h2 className="text-sm font-semibold">{total} clientes</h2><span className="text-xs text-[var(--ns-text-secondary)]">{clients.length} nesta página</span></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead className="bg-[var(--ns-surface-hover)] text-[var(--ns-text-secondary)]"><tr>{["Cliente", "Contato", "Responsável", "Etapa / Status", "Atualização", "Docs", "Ações"].map((title) => <th key={title} className="px-3 py-3 font-semibold">{title}</th>)}</tr></thead>
              <tbody>{clients.map((client) => <tr key={client.id} tabIndex={0} onMouseEnter={() => setPreviewId(client.id)} onFocus={() => setPreviewId(client.id)} onClick={(event) => { if (!(event.target as HTMLElement).closest("a,button")) router.push(`/clientes/${client.id}`); }} onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === "Enter") router.push(`/clientes/${client.id}`); }} className={`client-preview-row cursor-pointer border-t border-[var(--ns-border)] outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-[var(--ns-primary)] ${selected?.id === client.id ? "is-preview" : ""}`}>
                <td className="px-3 py-4"><div className="flex items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ns-surface-hover)] text-[10px] font-semibold">{initials(client.full_name)}</span><div><Link className="font-semibold" href={`/clientes/${client.id}`}>{client.full_name}</Link><p className="mt-1 text-[10px] text-[var(--ns-text-secondary)]">{client.sale ? labels[client.sale.pre_sale_type] ?? client.sale.pre_sale_type : displayCpf(client.cpf)}</p></div></div></td>
                <td className="px-3 py-4"><p>{displayPhone(client.phone_mobile)}</p><p className="mt-1 max-w-36 truncate text-[10px] text-[var(--ns-text-secondary)]">{client.email ?? "Sem e-mail"}</p></td>
                <td className="px-3 py-4">{client.consultant ?? "Não atribuído"}</td>
                <td className="px-3 py-4"><span className="inline-flex rounded-full bg-[color-mix(in_srgb,var(--ns-primary)_12%,transparent)] px-3 py-1.5 text-[10px] font-semibold text-[var(--ns-primary)]">{status(client)}</span></td>
                <td className="px-3 py-4 text-[var(--ns-text-secondary)]">{formatDate(client.sale?.updated_at ?? client.created_at)}</td>
                <td className="px-3 py-4 font-semibold text-[var(--ns-success)]">{client.documents.length}</td>
                <td className="px-3 py-4"><Link href={`/clientes/${client.id}/editar`} title={`Editar ${client.full_name}`} aria-label={`Editar ${client.full_name}`} className="inline-flex rounded p-2 hover:bg-[var(--ns-surface-hover)]"><Pencil className="h-4 w-4" /></Link></td>
              </tr>)}</tbody>
            </table>
            {!clients.length && <p className="p-10 text-center text-sm text-[var(--ns-text-secondary)]">Nenhum cliente encontrado.</p>}
          </div>
          {children}
        </section>
        {selected && <aside className="clients-preview sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-4" aria-label="Prévia do cliente">
          <div className="flex items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--ns-primary)] font-semibold text-[var(--ns-primary-foreground)]">{initials(selected.full_name)}</span><div className="min-w-0"><h2 className="break-words text-base font-semibold">{selected.full_name}</h2><p className="mt-1 text-xs text-[var(--ns-text-secondary)]">CPF {displayCpf(selected.cpf)}</p><p className="mt-1 text-xs text-[var(--ns-text-secondary)]">{status(selected)}</p></div></div>
          <div className="my-4 grid grid-cols-4 border-b border-[var(--ns-border)]" role="tablist" aria-label="Prévia"><>{["Resumo", "Documentos", "Simulações", "Histórico"].map((title) => <button key={title} role="tab" aria-selected={tab === title} onClick={() => setTab(title)} className={`cursor-pointer border-b-2 px-1 py-2 text-[10px] font-semibold ${tab === title ? "border-[var(--ns-primary)] text-[var(--ns-primary)]" : "border-transparent text-[var(--ns-text-secondary)]"}`}>{title}</button>)}</></div>
          <div className="space-y-4" role="tabpanel">
            {tab === "Resumo" && <><section><h3 className="text-xs font-semibold">Contato</h3><p className="mt-2 text-sm">{displayPhone(selected.phone_mobile)}</p><p className="mt-1 break-all text-xs text-[var(--ns-text-secondary)]">{selected.email ?? "Sem e-mail cadastrado"}</p><Link className={`${linkClass} mt-3 w-full bg-[var(--ns-primary)] text-[var(--ns-primary-foreground)]`} href={`/atendimento?telefone=${selected.phone_mobile.replace(/\D/g, "")}`}><MessageCircle className="h-4 w-4" />Abrir atendimento</Link></section><section className="border-t border-[var(--ns-border)] pt-4"><h3 className="text-xs font-semibold">Documentos</h3><p className="mt-2 text-xs text-[var(--ns-text-secondary)]">{selected.documents.length} documento(s) anexado(s)</p></section></>}
            {(tab === "Resumo" || tab === "Simulações") && <section className="border-t border-[var(--ns-border)] pt-4"><h3 className="text-xs font-semibold">Última simulação</h3>{selected.calculation ? <><div className="my-3 flex gap-5"><div><p className="text-[10px] text-[var(--ns-text-secondary)]">Economia estimada</p><p className="mt-1 text-lg font-semibold text-[var(--ns-success)]">{currency(selected.calculation.estimated_savings)}</p></div><div><p className="text-[10px] text-[var(--ns-text-secondary)]">Redução</p><p className="mt-1 text-lg font-semibold text-[var(--ns-primary)]">{Number(selected.calculation.installment_reduction_percentage ?? 0).toLocaleString("pt-BR")}%</p></div></div><Link className={linkClass} href={`/calculos/${selected.calculation.id}`}>Ver simulação</Link></> : <p className="mt-3 text-xs text-[var(--ns-text-secondary)]">Nenhuma simulação vinculada.</p>}</section>}
            {tab === "Documentos" && <>{selected.documents.length ? selected.documents.map((document) => <Link key={document.id} href={`/clientes/${selected.id}#documentacao`} className="flex items-center gap-2 border-b border-[var(--ns-border)] py-3 text-xs"><FileText className="h-4 w-4 shrink-0" />{document.title}</Link>) : <p className="text-xs text-[var(--ns-text-secondary)]">Nenhum documento anexado.</p>}</>}
            {tab === "Histórico" && <div className="text-xs"><p>Cliente cadastrado</p><p className="mt-1 text-[var(--ns-text-secondary)]">{formatDate(selected.created_at)}</p>{selected.sale && <><p className="mt-4">Pré-venda mais recente</p><Link className="mt-1 inline-block text-[var(--ns-primary)]" href={`/pre-vendas/${selected.sale.id}`}>{formatDate(selected.sale.created_at)}</Link></>}</div>}
            <section className="border-t border-[var(--ns-border)] pt-4"><h3 className="mb-3 text-xs font-semibold">Ações rápidas</h3><div className="grid gap-2"><Link className={linkClass} href={`/clientes/${selected.id}`}><Users className="h-4 w-4" />Abrir cliente 360°</Link>{selected.sale && <Link className={linkClass} href={`/pre-vendas/${selected.sale.id}`}>Abrir pré-venda</Link>}<Link className={linkClass} href="/calculos/novo">Nova simulação</Link></div></section>
          </div>
        </aside>}
      </div>
    </>
  );
}
