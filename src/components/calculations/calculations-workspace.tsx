"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, MoreHorizontal } from "lucide-react";
import { createSignedCalculationPdfUrlAction } from "@/app/(authenticated)/calculos/actions";
import type { FinancingCalculation } from "@/types/calculation";

type CalculationsWorkspaceProps = {
  calculations: FinancingCalculation[];
  defaultCalculationId: string | null;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function value(value: string | number | null | undefined) {
  return money.format(Number(value ?? 0));
}

function statusLabel(status: FinancingCalculation["status"]) {
  return status === "pdf_gerado" ? "PDF gerado" : "Calculado";
}

export function CalculationsWorkspace({ calculations, defaultCalculationId }: CalculationsWorkspaceProps) {
  const router = useRouter();
  const defaultCalculation = calculations.find((item) => item.id === defaultCalculationId) ?? calculations[0] ?? null;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selected = calculations.find((item) => item.id === hoveredId) ?? defaultCalculation;

  function downloadPdf() {
    if (!selected?.pdf_storage_path) return;
    startTransition(async () => {
      const result = await createSignedCalculationPdfUrlAction(selected.id, "download");
      if (result.ok && result.url) window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_452px]">
      <div className="overflow-hidden rounded-[12px] border border-[var(--ns-border)] bg-[var(--ns-surface)]">
        <div className="border-b border-[var(--ns-border)] px-5 py-4">
          <p className="text-sm font-semibold text-[var(--ns-text-strong)]">{calculations.length} simulações</p>
        </div>
        <div className="overflow-x-auto">
          <table className="calculation-list-table w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="text-xs text-[var(--ns-text-secondary)]">
              <tr className="border-b border-[var(--ns-border)]">
                <th className="px-5 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Banco</th>
                <th className="px-4 py-3 font-semibold">Financiado</th>
                <th className="px-4 py-3 font-semibold">Economia</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {calculations.map((calculation) => {
                const active = selected?.id === calculation.id;
                return (
                  <tr
                    key={calculation.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Abrir análise de ${calculation.client_name || "cliente não informado"}`}
                    onClick={() => router.push(`/calculos/${calculation.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(`/calculos/${calculation.id}`);
                      }
                    }}
                    onMouseEnter={() => setHoveredId(calculation.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onFocus={() => setHoveredId(calculation.id)}
                    onBlur={() => setHoveredId(null)}
                    className={`calculation-preview-row cursor-pointer border-b border-[var(--ns-border)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ns-primary)] ${
                      active ? "is-previewed" : ""
                    }`}
                  >
                    <td className="px-5 py-4 font-semibold text-[var(--ns-text)]">{calculation.client_name || "Não informado"}</td>
                    <td className="px-4 py-4 font-semibold text-[var(--ns-text)]">{calculation.financial_institution ?? "-"}</td>
                    <td className="px-4 py-4 font-semibold text-[var(--ns-text)]">{value(calculation.financed_value)}</td>
                    <td className="px-4 py-4 font-semibold text-[var(--ns-success)]">{value(calculation.estimated_savings)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${calculation.status === "pdf_gerado" ? "border-[color-mix(in_srgb,var(--ns-success)_35%,transparent)] bg-[color-mix(in_srgb,var(--ns-success)_10%,transparent)] text-[var(--ns-success)]" : "border-[color-mix(in_srgb,var(--ns-primary)_25%,transparent)] bg-[color-mix(in_srgb,var(--ns-primary)_12%,transparent)] text-[var(--ns-primary)]"}`}>
                        {statusLabel(calculation.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium text-[var(--ns-text-secondary)]">{dateTime.format(new Date(calculation.created_at))}</td>
                  </tr>
                );
              })}
              {!calculations.length ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-[var(--ns-text-secondary)]">Nenhuma simulação encontrada.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="min-h-[520px] rounded-[12px] border border-[var(--ns-border)] bg-[var(--ns-surface)] p-6 xl:sticky xl:top-4 xl:self-start">
        {selected ? <>
          <div className="flex items-start justify-between gap-4 border-b border-[var(--ns-border)] pb-5">
            <div>
              <h2 className="text-xl font-semibold text-[var(--ns-text-strong)]">{selected.client_name || "Simulação"}</h2>
              <p className="mt-1 text-sm text-[var(--ns-text-secondary)]">{selected.financial_institution ?? "Financeira não informada"} · {selected.simulation_type ?? "Financiamento"}</p>
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${selected.status === "pdf_gerado" ? "border-[color-mix(in_srgb,var(--ns-success)_35%,transparent)] text-[var(--ns-success)]" : "border-[color-mix(in_srgb,var(--ns-primary)_25%,transparent)] text-[var(--ns-primary)]"}`}>{statusLabel(selected.status)}</span>
          </div>
          <h3 className="mt-5 text-sm font-semibold text-[var(--ns-text)]">Resumo da análise</h3>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex justify-between gap-5"><dt className="text-[var(--ns-text-secondary)]">Valor financiado</dt><dd className="font-semibold text-[var(--ns-text)]">{value(selected.financed_value)}</dd></div>
            <div className="flex justify-between gap-5"><dt className="text-[var(--ns-text-secondary)]">Parcela atual</dt><dd className="font-semibold text-[var(--ns-text)]">{value(selected.current_installment_value)}</dd></div>
            <div className="flex justify-between gap-5"><dt className="text-[var(--ns-text-secondary)]">Nova parcela</dt><dd className="font-semibold text-[var(--ns-text)]">{value(selected.corrected_installment_value)}</dd></div>
            <div className="flex justify-between gap-5"><dt className="text-[var(--ns-text-secondary)]">Economia estimada</dt><dd className="font-semibold text-[var(--ns-success)]">{value(selected.estimated_savings)}</dd></div>
            <div className="flex justify-between gap-5"><dt className="text-[var(--ns-text-secondary)]">Redução</dt><dd className="font-semibold text-[var(--ns-primary)]">{selected.installment_reduction_percentage ? `${selected.installment_reduction_percentage}%` : "-"}</dd></div>
          </dl>
          <div className="mt-6 border-t border-[var(--ns-border)] pt-5 text-sm text-[var(--ns-text-secondary)]">
            Criada em {dateTime.format(new Date(selected.created_at))}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link href={`/calculos/${selected.id}`} className="inline-flex items-center justify-center rounded-[10px] bg-[var(--ns-primary)] px-4 py-3 text-sm font-semibold text-[var(--ns-primary-foreground)]">Abrir análise completa</Link>
            <button type="button" disabled={!selected.pdf_storage_path || isPending} onClick={downloadPdf} className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-[var(--ns-border)] px-4 py-3 text-sm font-semibold text-[var(--ns-text)] disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" />{isPending ? "Preparando..." : "Baixar PDF"}</button>
          </div>
          {selected.client_id ? <Link href={`/clientes/${selected.client_id}`} className="mt-3 inline-flex w-full items-center justify-center rounded-[10px] border border-[var(--ns-border)] px-4 py-3 text-sm font-semibold text-[var(--ns-text)]">Ver cliente 360°</Link> : null}
          <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-[var(--ns-text-secondary)]"><MoreHorizontal className="h-4 w-4" /><Link href={`/calculos/${selected.id}/editar`} className="hover:text-[var(--ns-text)]">Editar</Link></div>
        </> : null}
      </aside>
    </section>
  );
}
