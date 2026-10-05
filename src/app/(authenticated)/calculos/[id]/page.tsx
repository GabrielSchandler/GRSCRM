import { CalculationDetailSummary } from "@/components/calculations/calculation-detail-summary";
import { RecordTabs } from "@/components/newsec/record-tabs";
import { Edit } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CalculationDeleteButton } from "@/components/calculations/calculation-delete-button";
import { CalculationPdfActions } from "@/components/calculations/calculation-pdf-actions";
import { CalculationStatusBadge } from "@/components/calculations/calculation-status-badge";
import { ClientToast } from "@/components/clients/client-toast";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  formatCalculationCurrency,
  formatCalculationDate,
  formatCalculationDateTime,
  formatCpfDigits,
} from "@/lib/calculations/formatters";
import { assertCalculationAccess, canManageCalculations } from "@/lib/calculations/service";
import { formatPreSaleType } from "@/lib/pre-sales/formatters";
import { resolveUserDisplayName } from "@/lib/users/account";

type CalculoPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; artifacts?: string }>;
};

function DetailSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

function DetailItem({
  label,
  value,
  className = "",
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-1 text-sm font-medium text-slate-950">{value}</div>
    </div>
  );
}

export default async function CalculoPage({
  params,
  searchParams,
}: CalculoPageProps) {
  const { id } = await params;
  const queryParams = await searchParams;
  const { supabase, role } = await getCurrentUserContext();

  if (!canManageCalculations(role)) {
    notFound();
  }

  const calculation = await assertCalculationAccess(id);
  const { data: creatorData } = calculation.created_by
    ? await supabase
        .from("user_profiles")
        .select("full_name, username, email")
        .eq("id", calculation.created_by)
        .maybeSingle()
    : { data: null };
  const creatorName = resolveUserDisplayName(
    creatorData as { full_name?: string | null; username?: string | null; email?: string | null } | null,
    "Não informado",
  );
  const successMessage =
    queryParams.success === "created"
      ? queryParams.artifacts === "generated"
        ? "Simulação salva e arquivos gerados com sucesso."
        : "Simulação salva com sucesso."
      : queryParams.success === "updated"
        ? queryParams.artifacts === "generated"
          ? "Simulação atualizada e arquivos gerados com sucesso."
          : "Simulação atualizada com sucesso."
        : null;


  return <>
    <PageHeader title="Detalhe da simulação" description="Resultados, parâmetros e documentos da análise revisional." />
    <div className="reference-page space-y-4 p-4 sm:p-6">
              {successMessage ? <ClientToast message={successMessage} /> : null}
        {queryParams.artifacts === "failed" ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            A simulação foi salva, mas os arquivos não puderam ser gerados
            automaticamente. Use o botão <strong>Gerar arquivos novamente</strong>
            abaixo.
          </div>
        ) : null}


      <section className="ns-panel flex flex-wrap items-center justify-between gap-4 p-4"><div><h2 className="text-lg font-semibold">{calculation.client_name || "Simulação"}</h2><p className="mt-1 text-xs text-[var(--ns-text-secondary)]">{formatCpfDigits(calculation.client_cpf)} · {calculation.financial_institution ?? "Financeira não informada"} · {calculation.simulation_type ? formatPreSaleType(calculation.simulation_type) : "Tipo não informado"}</p></div><div className="space-y-1"><CalculationStatusBadge status={calculation.status} /><p className="text-xs text-[var(--ns-text-secondary)]">{formatCalculationDateTime(calculation.created_at)}</p></div></section>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"><div className="min-w-0"><RecordTabs panels={[
        {label:"Resumo",content:<div className="space-y-4"><CalculationDetailSummary calculation={calculation} />

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Observação final</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Todos os valores informados nesta simulação foram baseados em taxas
            médias utilizadas pelo mercado na categoria de financiamentos
            bancários. Os verdadeiros valores serão revogados e decididos
            posteriormente a prestação de serviços.
          </p>
        </section>
</div>},
        {label:"Parâmetros",content:<div className="reference-detail-sections">        <DetailSection title="Resumo da simulação">
          <DetailItem label="Status" value={<CalculationStatusBadge status={calculation.status} />} />
          <DetailItem
            label="Tipo da simulação"
            value={calculation.simulation_type ? formatPreSaleType(calculation.simulation_type) : "Não informado"}
          />
          <DetailItem label="Financeira" value={calculation.financial_institution ?? "Não informado"} />
          <DetailItem label="Criado por" value={creatorName} />
          <DetailItem label="Criado em" value={formatCalculationDateTime(calculation.created_at)} />
          <DetailItem label="Data de atendimento" value={formatCalculationDate(calculation.attendance_date)} />
          <DetailItem label="Expira em" value={formatCalculationDate(calculation.expires_in)} />
        </DetailSection>

        <DetailSection title="Dados do cliente">
          <DetailItem label="Nome" value={calculation.client_name || "Não informado"} />
          <DetailItem label="CPF" value={formatCpfDigits(calculation.client_cpf)} />
          <DetailItem label="Telefone" value={calculation.client_phone ?? "Não informado"} />
          <DetailItem label="Especialista" value={calculation.specialist_name ?? "Não informado"} />
          <DetailItem label="Situação" value={calculation.situation ?? "Não informado"} />
          <DetailItem label="Observações" value={calculation.notes ?? "Não informado"} className="md:col-span-2" />
        </DetailSection>

        <DetailSection title="Dados do financiamento">
          <DetailItem label="Valor a vista" value={formatCalculationCurrency(calculation.cash_value)} />
          {calculation.simulation_type === "veiculo" ? (
            <DetailItem label="Entrada" value={formatCalculationCurrency(calculation.down_payment)} />
          ) : null}
          <DetailItem label="Valor financiado" value={formatCalculationCurrency(calculation.financed_value)} />
          <DetailItem label="Valor atual da parcela" value={formatCalculationCurrency(calculation.current_installment_value)} />
          <DetailItem label="Quantidade de parcelas" value={String(calculation.installment_count ?? "Não informado")} />
          <DetailItem label="Parcelas pagas" value={String(calculation.paid_installments ?? "Não informado")} />
          <DetailItem label="Parcelas a pagar" value={String(calculation.remaining_installments ?? "Não informado")} />
          {calculation.simulation_type === "veiculo" ? (
            <>
              <DetailItem label="Modelo e marca" value={calculation.vehicle ?? "Não informado"} />
              <DetailItem label="Ano" value={calculation.vehicle_year ?? "Não informado"} />
            </>
          ) : null}
        </DetailSection>

</div>},
        {label:"Comparativo",content:<div className="space-y-4">        <DetailSection
          title="Resultado da simulação"
          description="Comparativo entre o cenário atual do financiamento e a revisão estimada pela metodologia da planilha."
        >
          <DetailItem
            label="Quanto o cliente paga hoje no total"
            value={formatCalculationCurrency(calculation.current_total_financing)}
          />
          <DetailItem
            label="Quanto deveria pagar desde o comeco"
            value={formatCalculationCurrency(calculation.corrected_total_financing)}
          />
          <DetailItem
            label="Valor cobrado a maior"
            value={formatCalculationCurrency(calculation.estimated_savings)}
          />
          <DetailItem
            label="Valor atualmente para quitação"
            value={formatCalculationCurrency(calculation.remaining_amount_to_pay)}
          />
          <DetailItem
            label="Juros abusivos por parcela"
            value={formatCalculationCurrency(
              calculation.abusive_interest_per_installment,
            )}
          />
          <DetailItem
            label="Juros abusivos já pagos"
            value={formatCalculationCurrency(calculation.abusive_interest_paid)}
          />
          <DetailItem
            label="Dívida real"
            value={formatCalculationCurrency(calculation.real_debt)}
          />
          {calculation.settlement_amount !== null &&
          calculation.settlement_amount !== undefined ? (
            <DetailItem
              label="Valor para quitação"
              value={formatCalculationCurrency(calculation.settlement_amount)}
            />
          ) : null}
          <DetailItem
            label="Redução estimada por parcela restante"
            value={formatCalculationCurrency(
              calculation.installment_reduction_remaining,
            )}
          />
        </DetailSection>

        <DetailSection title="Simulação simplificada">
          <DetailItem
            label="Dívida após redução de 30%"
            value={formatCalculationCurrency(calculation.debt_after_30_discount)}
          />
          <DetailItem
            label="Dívida após redução de 90%"
            value={formatCalculationCurrency(calculation.debt_after_90_discount)}
          />
          <DetailItem
            label="50% de abatimento em 15x"
            value={formatCalculationCurrency(calculation.example_50_discount_15x)}
          />
          <DetailItem
            label="50% de abatimento em 10x"
            value={formatCalculationCurrency(calculation.example_50_discount_10x)}
          />
          <DetailItem
            label="50% de abatimento em 5x"
            value={formatCalculationCurrency(calculation.example_50_discount_5x)}
          />
          <DetailItem
            label="Redução de 30% sobre o saldo restante"
            value={formatCalculationCurrency(calculation.discount_30_value)}
          />
          <DetailItem
            label="Redução de 90% sobre o saldo restante"
            value={formatCalculationCurrency(calculation.discount_90_value)}
          />
        </DetailSection>

</div>},
        {label:"PDF",content:<div>        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">
            Arquivos da simulação
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            O relatório completo em PDF e o resumo visual ficam protegidos no
            armazenamento privado e são liberados por links temporários.
          </p>
          <div className="mt-5">
            <CalculationPdfActions
              calculationId={calculation.id}
              hasPdf={Boolean(calculation.pdf_storage_path)}
            />
          </div>
        </section></div>}
      ]} /></div><aside className="ns-panel self-start space-y-4 p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto"><h2 className="text-sm font-semibold">Ações</h2>        <div className="flex flex-wrap gap-3">
          <Link
            href={`/calculos/${calculation.id}/editar`}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            <Edit className="h-4 w-4" />
            Editar
          </Link>
          <Link
            href="/calculos"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Voltar para simulações
          </Link>
          <CalculationDeleteButton calculationId={calculation.id} />
          {calculation.client_id ? (
            <Link
              href={`/clientes/${calculation.client_id}`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Abrir cliente
            </Link>
          ) : null}
          {calculation.pre_sale_id ? (
            <Link
              href={`/pre-vendas/${calculation.pre_sale_id}`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Abrir pré-venda
            </Link>
          ) : null}
        </div>

<div className="border-t border-[var(--ns-border)] pt-4"><CalculationPdfActions calculationId={calculation.id} hasPdf={Boolean(calculation.pdf_storage_path)} variant="compact" /></div><div className="border-t border-[var(--ns-border)] pt-4"><h3 className="text-xs font-semibold">Observações</h3><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--ns-text-secondary)]">{calculation.notes || "Sem observações."}</p></div></aside></div>
    </div>
  </>;
}

