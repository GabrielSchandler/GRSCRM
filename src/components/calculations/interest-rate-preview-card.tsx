import { AlertTriangle, Calculator, CheckCircle2, Info } from "lucide-react";
import { parseBrazilianDecimalInput } from "@/lib/calculations/currency";
import { calculateInterestRateComparison } from "@/lib/calculations/interest-rate-preview";

type InterestRatePreviewCardProps = {
  financedValue: string | number | null | undefined;
  installmentCount: string | number | null | undefined;
  currentInstallmentValue: string | number | null | undefined;
  reductionPercentage: string | number | null | undefined;
};

const percentageFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPercentage(value: number | null) {
  return value === null ? "Não calculável" : `${percentageFormatter.format(value)}%`;
}

function parseInstallmentCount(value: InterestRatePreviewCardProps["installmentCount"]) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const digits = String(value).replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export function InterestRatePreviewCard({
  financedValue,
  installmentCount,
  currentInstallmentValue,
  reductionPercentage,
}: InterestRatePreviewCardProps) {
  const parsedFinancedValue = parseBrazilianDecimalInput(financedValue);
  const parsedCurrentInstallment = parseBrazilianDecimalInput(currentInstallmentValue);
  const parsedReduction = parseBrazilianDecimalInput(reductionPercentage);
  const comparison = calculateInterestRateComparison({
    financedValue: parsedFinancedValue ?? 0,
    installmentCount: parseInstallmentCount(installmentCount),
    currentInstallmentValue: parsedCurrentInstallment ?? 0,
    reductionPercentage: parsedReduction ?? 30,
  });
  const hasNegativeReducedInterest =
    comparison !== null && comparison.reduced.totalInterestPercentage < -0.005;
  const hasNonPositiveCurrentInterest =
    comparison !== null && comparison.current.totalInterestPercentage <= 0.005;

  return (
    <section
      aria-labelledby="interest-rate-preview-title"
      className="interest-rate-preview overflow-hidden rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)]"
    >
      <div className="flex flex-col gap-3 border-b border-[var(--ns-border)] bg-[var(--ns-surface-hover)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--ns-primary)] text-white">
            <Calculator aria-hidden="true" size={20} />
          </span>
          <div>
            <h2
              id="interest-rate-preview-title"
              className="text-base font-semibold text-[var(--ns-text)]"
            >
              Prévia das taxas de juros
            </h2>
            <p className="mt-1 text-sm text-[var(--ns-text-secondary)]">
              Compare o contrato atual com a redução escolhida antes de salvar.
            </p>
          </div>
        </div>
        <span className="w-fit rounded-full border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-1 text-xs font-semibold text-[var(--ns-primary)]">
          Atualização automática
        </span>
      </div>

      {comparison ? (
        <div className="space-y-5 p-5">
          <dl className="grid grid-cols-2 border-y border-[var(--ns-border)] bg-[var(--ns-surface-hover)]">
            <div className="min-w-0 border-b border-r border-slate-200 px-3 py-3 sm:border-b-0">
              <dt className="text-xs font-medium text-slate-500">Parcela atual</dt>
              <dd className="mt-1 break-words text-base font-bold text-slate-950">
                {currencyFormatter.format(comparison.current.installmentValue)}
              </dd>
            </div>
            <div className="min-w-0 border-b border-slate-200 px-3 py-3 sm:border-b-0 sm:border-r">
              <dt className="text-xs font-medium text-slate-500">Parcela corrigida</dt>
              <dd
                className={`mt-1 break-words text-base font-bold ${
                  hasNegativeReducedInterest ? "text-red-700" : "text-teal-800"
                }`}
              >
                {currencyFormatter.format(comparison.reduced.installmentValue)}
              </dd>
            </div>
            <div className="min-w-0 border-r border-slate-200 px-3 py-3">
              <dt className="text-xs font-medium text-slate-500">
                Valor total da dívida
              </dt>
              <dd className="mt-1 break-words text-base font-bold text-slate-950">
                {currencyFormatter.format(comparison.current.totalPaid)}
              </dd>
            </div>
            <div className="min-w-0 px-3 py-3">
              <dt className="text-xs font-medium text-slate-500">
                Valor total da dívida corrigida
              </dt>
              <dd
                className={`mt-1 break-words text-base font-bold ${
                  hasNegativeReducedInterest ? "text-red-700" : "text-teal-800"
                }`}
              >
                {currencyFormatter.format(comparison.reduced.totalPaid)}
              </dd>
            </div>
          </dl>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="w-[40%] px-3 py-3 font-semibold">Indicador</th>
                    <th className="w-[30%] px-3 py-3 text-right font-semibold">
                      Contrato atual
                    </th>
                    <th className="w-[30%] px-3 py-3 text-right font-semibold">
                      Após redução de {percentageFormatter.format(comparison.reductionPercentage)}%
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <th className="px-3 py-3 font-medium text-slate-700">Juros totais</th>
                    <td className="px-3 py-3 text-right font-semibold text-slate-950">
                      {formatPercentage(comparison.current.totalInterestPercentage)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-semibold ${
                        hasNegativeReducedInterest ? "text-red-700" : "text-teal-800"
                      }`}
                    >
                      {formatPercentage(comparison.reduced.totalInterestPercentage)}
                    </td>
                  </tr>
                  <tr>
                    <th className="px-3 py-3 font-medium text-slate-700">Juros ao mês</th>
                    <td className="px-3 py-3 text-right font-semibold text-slate-950">
                      {formatPercentage(comparison.current.monthlyInterestPercentage)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-semibold ${
                        hasNegativeReducedInterest ? "text-red-700" : "text-teal-800"
                      }`}
                    >
                      {formatPercentage(comparison.reduced.monthlyInterestPercentage)}
                    </td>
                  </tr>
                  <tr>
                    <th className="px-3 py-3 font-medium text-slate-700">
                      Juros ao ano
                    </th>
                    <td className="px-3 py-3 text-right font-semibold text-slate-950">
                      {formatPercentage(comparison.current.annualInterestPercentage)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-semibold ${
                        hasNegativeReducedInterest ? "text-red-700" : "text-teal-800"
                      }`}
                    >
                      {formatPercentage(comparison.reduced.annualInterestPercentage)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-200 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Limite sem juros negativos
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-950">
                {percentageFormatter.format(
                  comparison.maximumReductionWithoutNegativeInterest,
                )}
                %
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Maior redução matemática para o total das parcelas não ficar abaixo do
                valor financiado.
              </p>
            </div>
          </div>

          <div
            aria-live="polite"
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
              hasNegativeReducedInterest || hasNonPositiveCurrentInterest
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {hasNegativeReducedInterest || hasNonPositiveCurrentInterest ? (
              <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
            ) : (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
            )}
            <p>
              {hasNonPositiveCurrentInterest
                ? "Os dados atuais já resultam em juros totais iguais ou inferiores a zero. Confira o valor financiado, a parcela e o prazo."
                : hasNegativeReducedInterest
                  ? `A redução de ${percentageFormatter.format(comparison.reductionPercentage)}% faz o total das parcelas ficar abaixo do valor financiado. Diminua o percentual antes de apresentar este cenário ao cliente.`
                  : "Com o percentual informado, o total das parcelas permanece acima do valor financiado."}
            </p>
          </div>

          <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
            <Info aria-hidden="true" className="mt-0.5 shrink-0" size={15} />
            Taxas implícitas estimadas para parcelas mensais fixas. O cálculo não inclui
            tarifas, seguros, tributos ou outros componentes do CET e não altera o resultado
            da simulação.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 px-5 py-5 text-sm text-slate-600">
          <Info aria-hidden="true" className="mt-0.5 shrink-0 text-teal-700" size={18} />
          <p>
            Preencha valor financiado, valor atual da parcela e quantidade de parcelas para
            visualizar a comparação das taxas.
          </p>
        </div>
      )}
    </section>
  );
}
