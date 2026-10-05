"use client";

import { useRef, useState, type ReactNode } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { getCollectionWindow } from "@/lib/ui/reference-collection";

export type ReferenceRow = {
  id: string;
  title: string;
  search: string;
  type?: string;
  status?: string;
  cells: ReactNode[];
  detail: ReactNode;
};

// Server-rendered cells retain the module's existing actions and access checks.
export function ReferenceCollection({ title, columns, rows, actions, children, detailTitle = "Detalhes", empty = "Nenhum registro encontrado." }: {
  title: string; columns: string[]; rows: ReferenceRow[]; actions?: ReactNode;
  children?: ReactNode; detailTitle?: string; empty?: string;
}) {
  const detailRef = useRef<HTMLElement>(null);
  function previewRow(id: string) {
    const detail = detailRef.current;
    if (detail?.contains(document.activeElement) || detail?.querySelector("details[open] form")) return;
    setSelectedId(id);
  }
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const types = [...new Set(rows.map(row => row.type).filter(Boolean))] as string[];
  const statuses = [...new Set(rows.map(row => row.status).filter(Boolean))] as string[];
  const { filtered, pages, currentPage, visible, selected } = getCollectionWindow(rows, { query, type, status, page, selectedId });
  return <div className="reference-collection grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="min-w-0 space-y-4">
      <section className="ns-panel overflow-hidden reference-list-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4"><h2 className="text-sm font-semibold">{title} <span className="text-[var(--ns-text-secondary)]">({filtered.length})</span></h2>{actions}</div>
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          <label className="relative min-w-[180px] flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--ns-text-secondary)]" /><input aria-label={`Buscar ${title.toLowerCase()}`} placeholder="Buscar por nome ou conteúdo..." value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} className="w-full pl-9!" /></label>
          {types.length > 0 && <select aria-label="Filtrar por tipo" value={type} onChange={event => { setType(event.target.value); setPage(0); }}><option value="">Todos os tipos</option>{types.map(value => <option key={value}>{value}</option>)}</select>}
          {statuses.length > 0 && <select aria-label="Filtrar por status" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="">Todos os status</option>{statuses.map(value => <option key={value}>{value}</option>)}</select>}
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr>{columns.map(column => <th key={column} className="px-3 py-3 font-medium">{column}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={row.id} aria-selected={selected?.id === row.id} tabIndex={0} className="cursor-pointer" onMouseEnter={() => previewRow(row.id)} onFocus={() => setSelectedId(row.id)} onClick={event => { if (!(event.target as HTMLElement).closest("a,button,input,select,summary")) setSelectedId(row.id); }} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedId(row.id); } }}>{row.cells.map((cell, index) => <td key={index} className="border-b border-[var(--ns-border)] px-3 py-3">{cell}</td>)}</tr>)}{!visible.length && <tr><td colSpan={columns.length} className="p-8 text-center text-[var(--ns-text-secondary)]">{empty}</td></tr>}</tbody></table></div>
        {pages > 1 && <div className="flex items-center justify-between gap-3 p-3"><button title="Página anterior" aria-label="Página anterior" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></button><span className="text-xs text-[var(--ns-text-secondary)]">{currentPage + 1} de {pages}</span><button title="Próxima página" aria-label="Próxima página" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></button></div>}
      </section>
      {children}
    </div>
    <aside ref={detailRef} aria-label={detailTitle} className="ns-panel self-start p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{selected?.title ?? detailTitle}</h2>{selected && <button aria-label="Fechar detalhes" title="Fechar detalhes" onClick={() => setSelectedId(null)}><X className="h-4 w-4" /></button>}</div>{selected ? selected.detail : <p className="text-xs text-[var(--ns-text-secondary)]">Selecione um registro para consultar.</p>}</aside>
  </div>;
}
