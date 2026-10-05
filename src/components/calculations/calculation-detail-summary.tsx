import { Coins, Calculator, TrendingDown } from "lucide-react";
import { ManagementMetric } from "@/components/management/management-ui";
import { ReferenceFacts } from "@/components/newsec/reference-ui";
import { formatCalculationCurrency } from "@/lib/calculations/formatters";
import type { FinancingCalculation } from "@/types/calculation";

export function CalculationDetailSummary({ calculation: c }: { calculation: FinancingCalculation }) {
  const current = c.current_installment_value === null ? null : Number(c.current_installment_value);
  const corrected = c.corrected_installment_value === null ? null : Number(c.corrected_installment_value);
  const ready = current !== null && corrected !== null && Number.isFinite(current) && Number.isFinite(corrected) && current > 0 && corrected >= 0;
  const max = Math.max(current ?? 0, corrected ?? 0, 1);
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3"><ManagementMetric label="Economia estimada" value={formatCalculationCurrency(c.estimated_savings)} icon={Coins} tone="success" /><ManagementMetric label="Nova parcela" value={formatCalculationCurrency(c.corrected_installment_value)} icon={Calculator} /><ManagementMetric label="Redução escolhida" value={c.installment_reduction_percentage === null ? "Não informada" : `${Number(c.installment_reduction_percentage).toLocaleString("pt-BR")}%`} icon={TrendingDown} tone="warning" /></div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <figure className="ns-panel p-4"><figcaption className="text-sm font-semibold">Comparativo de parcelas</figcaption>{ready ? <div className="mt-6 flex h-64 items-end justify-center gap-10 border-b border-[var(--ns-border)] pb-6">{[{label:"Parcela atual",value:current,color:"var(--ns-text-secondary)"},{label:"Nova parcela",value:corrected,color:"var(--ns-primary)"}].map(item => <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"><span className="mb-2 text-xs font-semibold" style={{color:item.color}}>{formatCalculationCurrency(item.value)}</span><div className="w-16 rounded-t" style={{height:`${item.value / max * 75}%`,background:item.color}} /><span className="mt-2 text-xs text-[var(--ns-text-secondary)]">{item.label}</span></div>)}</div> : <p className="py-12 text-center text-xs text-[var(--ns-text-secondary)]">Dados insuficientes para o comparativo.</p>}</figure>
      <section className="ns-panel p-4"><h2 className="text-sm font-semibold">Resumo da análise</h2><ReferenceFacts items={[["Valor financiado",formatCalculationCurrency(c.financed_value)],["Quantidade de parcelas",c.installment_count ?? "Não informada"],["Parcelas restantes",c.remaining_installments ?? "Não informada"],["Parcela atual",formatCalculationCurrency(c.current_installment_value)],["Nova parcela",formatCalculationCurrency(c.corrected_installment_value)],["Total atual",formatCalculationCurrency(c.current_total_financing)],["Total corrigido",formatCalculationCurrency(c.corrected_total_financing)],["Economia estimada",formatCalculationCurrency(c.estimated_savings)]]} /></section>
    </div>
  </div>;
}
