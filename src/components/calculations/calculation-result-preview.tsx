import { Calculator, Coins, FileText, TrendingDown, Wallet } from "lucide-react";
import { calculateFinancingRevision } from "@/lib/calculations/financing-calculation";
import { parseBrazilianDecimalInput } from "@/lib/calculations/currency";
import type { FinancingCalculationFormValues } from "@/lib/calculations/schema";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function CalculationResultPreview({ values }: { values: FinancingCalculationFormValues }) {
  const current = parseBrazilianDecimalInput(values.current_installment_value) ?? 0;
  const count = Number(values.installment_count) || 0;
  const ready = current > 0 && count > 0;
  const result = calculateFinancingRevision(values);
  const reduction = parseBrazilianDecimalInput(values.installment_reduction_percentage) ?? 30;
  const metrics = [
    { label: "Economia estimada", value: currency.format(result.estimated_savings), icon: Coins, color: "var(--ns-success)" },
    { label: "Nova parcela", value: currency.format(result.corrected_installment_value), icon: FileText, color: "var(--ns-primary)" },
    { label: "Redução", value: `${ready ? reduction.toLocaleString("pt-BR") : 0}%`, icon: TrendingDown, color: "#a78bfa" },
    { label: "Total analisado", value: currency.format(result.current_total_financing), icon: Wallet, color: "var(--ns-warning)" },
  ];

  return (
    <section className="rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Resultado da simulação</h2>
        <span className="rounded-full bg-[var(--ns-surface-hover)] px-3 py-1 text-xs text-[var(--ns-text-secondary)]">{ready ? "Prévia atualizada" : "Aguardando dados"}</span>
      </div>
      {!ready && <div className="py-8 text-center"><Calculator className="mx-auto mb-4 h-10 w-10 text-[var(--ns-primary)]" /><p className="text-sm font-semibold">Preencha os dados do financiamento</p></div>}
      <dl className="mt-5 grid grid-cols-2 gap-3">
        {metrics.map(({ label, value, icon: Icon, color }) => <div key={label} className="min-w-0 rounded-lg border border-[var(--ns-border)] p-3" style={{ background: `color-mix(in srgb, ${color} 7%, var(--ns-surface))` }}><Icon className="mb-2 h-5 w-5" style={{ color }} /><dt className="text-xs text-[var(--ns-text-secondary)]">{label}</dt><dd className="mt-1 break-words text-lg font-bold" style={{ color }}>{value}</dd></div>)}
      </dl>
      <figure className="mt-5 border-t border-[var(--ns-border)] pt-4">
        <figcaption className="text-sm font-semibold">Comparativo de parcelas</figcaption>
        <div className="mt-4 flex h-36 items-end justify-center gap-8 border-b border-[var(--ns-border)]">
          {[{ label: "Parcela atual", value: ready ? current : 0, color: "var(--ns-text-secondary)" }, { label: "Nova parcela", value: ready ? result.corrected_installment_value : 0, color: "var(--ns-primary)" }].map(item => <div key={item.label} className="flex h-full w-28 flex-col items-center justify-end"><span className="mb-2 text-xs">{currency.format(item.value)}</span><div className="w-14 rounded-t" style={{ height: `${ready ? Math.max(2, item.value / current * 85) : 4}%`, background: item.color }} /><span className="mt-2 text-xs text-[var(--ns-text-secondary)]">{item.label}</span></div>)}
        </div>
      </figure>
    </section>
  );
}
