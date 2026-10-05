"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export function ManagementPagination({ page, count, pageSize, onChange }: {
  page: number;
  count: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return <div className="flex items-center justify-between gap-3 border-t border-[var(--ns-border)] px-3 py-3 text-xs">
    <button type="button" aria-label="Página anterior" disabled={page === 1} onClick={() => onChange(page - 1)} className="rounded border border-[var(--ns-border)] p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
    <span>{count ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} de ${count}` : "0 registros"} · Página {page} de {pages}</span>
    <button type="button" aria-label="Próxima página" disabled={page === pages} onClick={() => onChange(page + 1)} className="rounded border border-[var(--ns-border)] p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
  </div>;
}
