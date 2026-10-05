"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { CalculationActionState } from "@/app/(authenticated)/calculos/actions";
import {
  formatCurrencyInputValueFromDigits,
  formatNumberForPtBrInput,
  normalizeCurrencyInputValue,
  parseBrazilianDecimalInput,
} from "@/lib/calculations/currency";
import { formatCpf, formatPhone, onlyDigits } from "@/lib/clients/masks";
import { FormFieldLabel } from "@/components/form-field-label";
import { InterestRatePreviewCard } from "@/components/calculations/interest-rate-preview-card";
import { CalculationResultPreview } from "@/components/calculations/calculation-result-preview";
import { TotalkCalculationImportPanel } from "@/components/calculations/totalk-calculation-import-panel";
import {
  financingCalculationDefaultValues,
  financingCalculationFormSchema,
  type FinancingCalculationFormValues,
  type FinancingCalculationPayload,
} from "@/lib/calculations/schema";
import { financingCalculationTypes } from "@/types/calculation";
import type {
  CalculationClientOption,
  CalculationPreSaleOption,
} from "@/types/calculation";

type BaseFormProps = {
  submitLabel: string;
  clients: CalculationClientOption[];
  preSales: CalculationPreSaleOption[];
};

type CreateFormProps = BaseFormProps & {
  mode: "create";
  onSubmitAction: (
    values: FinancingCalculationPayload,
  ) => Promise<CalculationActionState>;
  defaultValues?: FinancingCalculationFormValues;
};

type EditFormProps = BaseFormProps & {
  mode: "edit";
  onSubmitAction: (
    values: FinancingCalculationPayload,
  ) => Promise<CalculationActionState>;
  defaultValues: FinancingCalculationFormValues;
};

type CalculationFormProps = CreateFormProps | EditFormProps;

function handleIntegerMask(event: ChangeEvent<HTMLInputElement>) {
  event.target.value = event.target.value.replace(/\D/g, "");
}

function getCurrencyInputDisplayValue(value: string | number | null | undefined) {
  if (typeof value === "string") {
    return value;
  }

  return formatNumberForPtBrInput(value);
}

function getComputedFinancedDisplayValue(
  cashValue: string | number | null | undefined,
  downPayment: string | number | null | undefined,
  shouldApplyDownPayment: boolean,
  fallbackValue: string | number | null | undefined,
) {
  const parsedCashValue = parseBrazilianDecimalInput(cashValue);
  const parsedDownPayment = shouldApplyDownPayment
    ? parseBrazilianDecimalInput(downPayment)
    : 0;

  if (parsedCashValue !== null && Number.isFinite(parsedCashValue)) {
    return formatNumberForPtBrInput(
      Math.max(parsedCashValue - Math.max(parsedDownPayment ?? 0, 0), 0),
    );
  }

  return formatNumberForPtBrInput(fallbackValue);
}

function handleEnterAsNextField(event: KeyboardEvent<HTMLFormElement>) {
  if (
    event.key !== "Enter" ||
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.nativeEvent.isComposing
  ) {
    return;
  }

  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const tagName = target.tagName.toLowerCase();

  if (tagName === "textarea") {
    return;
  }

  if (tagName !== "input" && tagName !== "select") {
    return;
  }

  if (target instanceof HTMLInputElement) {
    const blockedTypes = new Set([
      "submit",
      "button",
      "checkbox",
      "radio",
      "file",
      "hidden",
    ]);

    if (blockedTypes.has(target.type)) {
      return;
    }
  }

  const form = event.currentTarget;
  const focusableElements = Array.from(
    form.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null);
  const currentIndex = focusableElements.indexOf(target);
  const nextElement = currentIndex >= 0 ? focusableElements[currentIndex + 1] : null;

  if (!nextElement) {
    return;
  }

  event.preventDefault();
  nextElement.focus();

  if (nextElement instanceof HTMLInputElement && nextElement.select) {
    nextElement.select();
  }
}

function CalculationActionMessage({
  state,
}: {
  state: CalculationActionState | null;
}) {
  if (!state) {
    return null;
  }

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        state.ok
          ? "border-teal-200 bg-teal-50 text-teal-800"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {state.message}
    </div>
  );
}

export function CalculationForm({
  submitLabel,
  onSubmitAction,
  clients,
  preSales,
  defaultValues,
}: CalculationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionState, setActionState] = useState<CalculationActionState | null>(null);
  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<
    FinancingCalculationFormValues,
    undefined,
    FinancingCalculationPayload
  >({
    resolver: zodResolver(financingCalculationFormSchema),
    defaultValues: defaultValues ?? financingCalculationDefaultValues,
  });
  const selectedPreSaleId = watch("pre_sale_id");
  const clientPhone = watch("client_phone");
  const cashValue = watch("cash_value");
  const downPayment = watch("down_payment");
  const installmentCount = watch("installment_count");
  const currentInstallmentValue = watch("current_installment_value");
  const installmentReductionPercentage = watch("installment_reduction_percentage");
  const paidInstallments = watch("paid_installments");
  const financedValue = watch("financed_value");
  const remainingInstallments = watch("remaining_installments");
  const simulationType = watch("simulation_type");
  const vehicle = watch("vehicle");
  const vehicleYear = watch("vehicle_year");
  const administrativeFee = watch("administrative_fee");
  const insuranceValue = watch("insurance_value");
  const isVehicleSimulation = simulationType === "veiculo";
  const isImovelSimulation = simulationType === "imovel";
  const disabled = isPending || isSubmitting;
  const selectedPreSale = preSales.find((preSale) => preSale.id === selectedPreSaleId);
  const computedFinancedValue = getComputedFinancedDisplayValue(
    cashValue,
    downPayment,
    isVehicleSimulation,
    financedValue,
  );

  useEffect(() => {
    const formatted = computedFinancedValue;

    if ((financedValue ?? "") !== formatted) {
      setValue("financed_value", formatted, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [computedFinancedValue, financedValue, setValue]);

  useEffect(() => {
    const totalInstallments = Number(String(installmentCount ?? "").replace(/\D/g, "")) || 0;
    const paid = Number(String(paidInstallments ?? "").replace(/\D/g, "")) || 0;
    const nextRemainingInstallments = Math.max(totalInstallments - paid, 0);
    const formatted = nextRemainingInstallments ? String(nextRemainingInstallments) : "";

    if ((remainingInstallments ?? "") !== formatted) {
      setValue("remaining_installments", formatted, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [installmentCount, paidInstallments, remainingInstallments, setValue]);

  useEffect(() => {
    if (isVehicleSimulation) {
      return;
    }

    if ((downPayment ?? "") !== "") {
      setValue("down_payment", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

    if ((vehicle ?? "") !== "") {
      setValue("vehicle", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

    if ((vehicleYear ?? "") !== "") {
      setValue("vehicle_year", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [downPayment, isVehicleSimulation, setValue, vehicle, vehicleYear]);

  useEffect(() => {
    if (isImovelSimulation) {
      return;
    }

    if ((administrativeFee ?? "") !== "") {
      setValue("administrative_fee", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

    if ((insuranceValue ?? "") !== "") {
      setValue("insurance_value", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [administrativeFee, insuranceValue, isImovelSimulation, setValue]);

  function applyClientSelection(clientId: string) {
    const client = clients.find((item) => item.id === clientId);

    if (!client) {
      return;
    }

    setValue("client_id", client.id, { shouldDirty: true });
    setValue("client_name", client.full_name, { shouldDirty: true });
    setValue("client_cpf", formatCpf(client.cpf), { shouldDirty: true });
    setValue("client_phone", formatPhone(client.phone_mobile), {
      shouldDirty: true,
    });
  }

  function applyPreSaleSelection(preSaleId: string) {
    const preSale = preSales.find((item) => item.id === preSaleId);

    if (!preSale) {
      return;
    }

    setValue("pre_sale_id", preSale.id, { shouldDirty: true });
    setValue("simulation_type", preSale.pre_sale_type, { shouldDirty: true });
    setValue("client_id", preSale.client_id, { shouldDirty: true });
    setValue("client_name", preSale.client_name, { shouldDirty: true });
    setValue("client_cpf", formatCpf(preSale.client_cpf), { shouldDirty: true });
    setValue("client_phone", formatPhone(preSale.client_phone ?? ""), {
      shouldDirty: true,
    });
    setValue("financial_institution", preSale.financial_institution ?? "", {
      shouldDirty: true,
    });
    setValue("vehicle", preSale.vehicle ?? "", { shouldDirty: true });
    setValue("vehicle_year", preSale.vehicle_year ?? "", { shouldDirty: true });
    setValue(
      "financed_value",
      preSale.financed_value === null
        ? ""
        : formatNumberForPtBrInput(preSale.financed_value),
      { shouldDirty: true },
    );
    setValue(
      "down_payment",
      preSale.down_payment === null
        ? ""
        : formatNumberForPtBrInput(preSale.down_payment),
      { shouldDirty: true },
    );
    setValue(
      "current_installment_value",
      preSale.current_installment_value === null
        ? ""
        : formatNumberForPtBrInput(preSale.current_installment_value),
      { shouldDirty: true },
    );
    setValue(
      "paid_installments",
      preSale.paid_installments === null ? "" : String(preSale.paid_installments),
      { shouldDirty: true },
    );
    setValue(
      "remaining_installments",
      preSale.remaining_installments === null
        ? ""
        : String(preSale.remaining_installments),
      { shouldDirty: true },
    );
  }

  function applyTotalkImportedFields(
    fields: Partial<FinancingCalculationFormValues>,
  ) {
    Object.entries(fields).forEach(([fieldName, value]) => {
      if (value === undefined || value === null) {
        return;
      }

      setValue(fieldName as keyof FinancingCalculationFormValues, value, {
        shouldDirty: true,
        shouldValidate: true,
      });
    });
  }

  function onValidSubmit(values: FinancingCalculationPayload) {
    setActionState(null);

    startTransition(async () => {
      const result = await onSubmitAction(values);
      setActionState(result);

      if (result.ok && result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
      }
    });
  }

  return (
    <form
      className="calculation-edit-form grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]"
      onSubmit={handleSubmit(onValidSubmit)}
      onKeyDownCapture={handleEnterAsNextField}
    >
      <input type="hidden" {...register("specialist_name")} />
      <input type="hidden" {...register("situation")} />
      <input type="hidden" {...register("attendance_date")} />

      <div className="min-w-0 space-y-5">
      <div className="border-b border-[var(--ns-border)] pb-3"><h2 className="text-lg font-semibold">Dados do financiamento</h2></div>
      <details className="rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-4">
      <summary className="cursor-pointer text-sm font-semibold">Importar dados da Totalk</summary>
      <TotalkCalculationImportPanel
        disabled={disabled}
        currentPhone={clientPhone ?? ""}
        onApply={applyTotalkImportedFields}
      />
      </details>

      <section className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <div className="space-y-2">
          <FormFieldLabel
            htmlFor="client_id"
            label="Cliente vinculado"
            requirement="optional"
          />
          <select
            id="client_id"
            disabled={disabled}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            {...register("client_id")}
            onChange={(event) => {
              register("client_id").onChange(event);
              if (event.target.value) {
                applyClientSelection(event.target.value);
              }
            }}
          >
            <option value="">Não vincular agora</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.full_name}
              </option>
            ))}
          </select>
          {errors.client_id?.message ? (
            <p className="text-sm text-red-600">{String(errors.client_id.message)}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <FormFieldLabel
            htmlFor="pre_sale_id"
            label="Pré-venda vinculada"
            requirement="optional"
          />
          <select
            id="pre_sale_id"
            disabled={disabled}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            {...register("pre_sale_id")}
            onChange={(event) => {
              register("pre_sale_id").onChange(event);
              if (event.target.value) {
                applyPreSaleSelection(event.target.value);
              }
            }}
          >
            <option value="">Não vincular agora</option>
            {preSales.map((preSale) => (
              <option key={preSale.id} value={preSale.id}>
                {preSale.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            Ao selecionar uma pré-venda, o sistema preenche cliente, financeira e
            dados do financiamento automaticamente.
          </p>
          {errors.pre_sale_id?.message ? (
            <p className="text-sm text-red-600">{String(errors.pre_sale_id.message)}</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Dados do cliente</h2>
          <p className="mt-1 text-sm text-slate-600">
            Você pode manter os dados vinculados ao cadastro ou ajustar manualmente.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <FormFieldLabel
              htmlFor="client_name"
              label="Nome do cliente"
              requirement="optional"
              hint="Se não informar, o documento e a simulação exibem Não informado."
            />
            <input
              id="client_name"
              disabled={disabled}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              {...register("client_name")}
            />
            {errors.client_name?.message ? (
              <p className="text-sm text-red-600">{String(errors.client_name.message)}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <FormFieldLabel
              htmlFor="client_cpf"
              label="CPF"
              requirement="optional"
              hint="Se não informar, o documento e a simulação exibem Não informado."
            />
            <input
              id="client_cpf"
              disabled={disabled}
              maxLength={14}
              inputMode="numeric"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              {...register("client_cpf", {
                onChange: (event) => {
                  event.target.value = formatCpf(onlyDigits(event.target.value));
                },
              })}
            />
            {errors.client_cpf?.message ? (
              <p className="text-sm text-red-600">{String(errors.client_cpf.message)}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <FormFieldLabel htmlFor="client_phone" label="Telefone" requirement="optional" />
            <input
              id="client_phone"
              disabled={disabled}
              maxLength={15}
              inputMode="numeric"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              {...register("client_phone", {
                onChange: (event) => {
                  event.target.value = formatPhone(event.target.value);
                },
              })}
            />
            {errors.client_phone?.message ? (
              <p className="text-sm text-red-600">{String(errors.client_phone.message)}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Dados da operação</h2>
          <p className="mt-1 text-sm text-slate-600">
            O especialista responsável, a situação aprovada e a data do atendimento
            são preenchidos automaticamente na simulação.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <FormFieldLabel
              htmlFor="simulation_type"
              label="Tipo da simulação"
              requirement="required"
            />
            <select
              id="simulation_type"
              disabled={disabled}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              {...register("simulation_type")}
            >
              {financingCalculationTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {errors.simulation_type?.message ? (
              <p className="text-sm text-red-600">{String(errors.simulation_type.message)}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <FormFieldLabel
              htmlFor="financial_institution"
              label="Financeira"
              requirement="optional"
            />
            <input
              id="financial_institution"
              disabled={disabled}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              {...register("financial_institution")}
            />
          </div>
          <div className="space-y-2">
            <FormFieldLabel htmlFor="expires_in" label="Expira em" requirement="optional" />
            <input
              id="expires_in"
              type="date"
              disabled={disabled}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              {...register("expires_in")}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            {isVehicleSimulation ? "Dados do veículo" : "Observações"}
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {isVehicleSimulation ? (
            <>
              <div className="space-y-2">
                <FormFieldLabel
                  htmlFor="vehicle"
                  label="Modelo e marca"
                  requirement="optional"
                />
                <input
                  id="vehicle"
                  disabled={disabled}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  {...register("vehicle")}
                />
              </div>
              <div className="space-y-2">
                <FormFieldLabel htmlFor="vehicle_year" label="Ano" requirement="optional" />
                <input
                  id="vehicle_year"
                  disabled={disabled}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  {...register("vehicle_year")}
                />
              </div>
            </>
          ) : null}
          <div className="space-y-2 md:col-span-2">
            <FormFieldLabel htmlFor="notes" label="Observações" requirement="optional" />
            <textarea
              id="notes"
              rows={4}
              disabled={disabled}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              {...register("notes")}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Dados do financiamento
          </h2>
          {selectedPreSale ? (
            <p className="mt-1 text-sm text-teal-700">
              Dados preenchidos a partir da pré-venda vinculada. Você ainda pode
              ajustar manualmente.
            </p>
          ) : null}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <FormFieldLabel
              htmlFor="cash_value"
              label="Valor a vista"
              requirement="optional"
            />
            <Controller
              control={control}
              name="cash_value"
              render={({ field }) => (
                <input
                  id="cash_value"
                  disabled={disabled}
                  inputMode="decimal"
                  value={getCurrencyInputDisplayValue(field.value)}
                  onChange={(event) => {
                    const nextValue = formatCurrencyInputValueFromDigits(
                      event.target.value,
                    );
                    field.onChange(nextValue);
                  }}
                  onBlur={(event) => {
                    const nextValue = normalizeCurrencyInputValue(
                      event.target.value,
                    );
                    field.onChange(nextValue);
                    field.onBlur();
                  }}
                  ref={field.ref}
                  name={field.name}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                />
              )}
            />
            {errors.cash_value?.message ? (
              <p className="text-sm text-red-600">{String(errors.cash_value.message)}</p>
            ) : null}
          </div>
          {isVehicleSimulation ? (
            <div className="space-y-2">
              <FormFieldLabel
                htmlFor="down_payment"
                label="Entrada"
                requirement="optional"
              />
              <Controller
                control={control}
                name="down_payment"
                render={({ field }) => (
                  <input
                    id="down_payment"
                    disabled={disabled}
                    inputMode="decimal"
                    value={getCurrencyInputDisplayValue(field.value)}
                    onChange={(event) => {
                      const nextValue = formatCurrencyInputValueFromDigits(
                        event.target.value,
                      );
                      field.onChange(nextValue);
                    }}
                    onBlur={(event) => {
                      const nextValue = normalizeCurrencyInputValue(
                        event.target.value,
                      );
                      field.onChange(nextValue);
                      field.onBlur();
                    }}
                    ref={field.ref}
                    name={field.name}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  />
                )}
              />
              {errors.down_payment?.message ? (
                <p className="text-sm text-red-600">
                  {String(errors.down_payment.message)}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-2">
            <FormFieldLabel
              htmlFor="financed_value"
              label="Valor financiado"
              requirement="optional"
            />
            <input type="hidden" {...register("financed_value")} />
            <div
              id="financed_value"
              aria-live="polite"
              className="min-h-[42px] rounded-lg border border-slate-400 bg-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800"
            >
              {computedFinancedValue || "Não informado"}
            </div>
            <p className="text-xs text-slate-500">
              {isVehicleSimulation
                ? "Calculado automaticamente: valor a vista menos entrada."
                : "Calculado automaticamente a partir do valor informado para a operação."}
            </p>
            {errors.financed_value?.message ? (
              <p className="text-sm text-red-600">
                {String(errors.financed_value.message)}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <FormFieldLabel
              htmlFor="current_installment_value"
              label="Valor atual da parcela"
              requirement="optional"
            />
            <Controller
              control={control}
              name="current_installment_value"
              render={({ field }) => (
                <input
                  id="current_installment_value"
                  disabled={disabled}
                  inputMode="decimal"
                  value={getCurrencyInputDisplayValue(field.value)}
                  onChange={(event) => {
                    const nextValue = formatCurrencyInputValueFromDigits(
                      event.target.value,
                    );
                    field.onChange(nextValue);
                  }}
                  onBlur={(event) => {
                    const nextValue = normalizeCurrencyInputValue(
                      event.target.value,
                    );
                    field.onChange(nextValue);
                    field.onBlur();
                  }}
                  ref={field.ref}
                  name={field.name}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                />
              )}
            />
            {errors.current_installment_value?.message ? (
              <p className="text-sm text-red-600">
                {String(errors.current_installment_value.message)}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <FormFieldLabel
              htmlFor="installment_reduction_percentage"
              label="Redução da parcela (%)"
              requirement="optional"
              hint="Padrão de 30%. Reduza para 15, 10 ou 5 quando o juros do cliente for baixo."
            />
            <input
              id="installment_reduction_percentage"
              disabled={disabled}
              inputMode="decimal"
              placeholder="30"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              {...register("installment_reduction_percentage")}
            />
            <div className="flex flex-wrap gap-2">
              {["30", "15", "10", "5"].map((percentage) => (
                <button
                  key={percentage}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setValue("installment_reduction_percentage", percentage, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {percentage}%
                </button>
              ))}
            </div>
            {errors.installment_reduction_percentage?.message ? (
              <p className="text-sm text-red-600">
                {String(errors.installment_reduction_percentage.message)}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <FormFieldLabel
              htmlFor="settlement_discount_percentage"
              label="Quitação (%)"
              requirement="optional"
              hint="Desconto aplicado sobre o saldo devedor pós-correção. Se ficar em branco, o indicador não aparece no PDF."
            />
            <input
              id="settlement_discount_percentage"
              disabled={disabled}
              inputMode="decimal"
              placeholder="Ex.: 30"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              {...register("settlement_discount_percentage")}
            />
            {errors.settlement_discount_percentage?.message ? (
              <p className="text-sm text-red-600">
                {String(errors.settlement_discount_percentage.message)}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <FormFieldLabel
              htmlFor="installment_count"
              label="Quantidade de parcelas"
              requirement="optional"
            />
            <input
              id="installment_count"
              disabled={disabled}
              inputMode="numeric"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              {...register("installment_count", { onChange: handleIntegerMask })}
            />
            {errors.installment_count?.message ? (
              <p className="text-sm text-red-600">
                {String(errors.installment_count.message)}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <FormFieldLabel
              htmlFor="paid_installments"
              label="Parcelas pagas"
              requirement="optional"
            />
            <input
              id="paid_installments"
              disabled={disabled}
              inputMode="numeric"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              {...register("paid_installments", { onChange: handleIntegerMask })}
            />
            {errors.paid_installments?.message ? (
              <p className="text-sm text-red-600">
                {String(errors.paid_installments.message)}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <FormFieldLabel
              htmlFor="remaining_installments"
              label="Parcelas a pagar"
              requirement="optional"
            />
            <input type="hidden" {...register("remaining_installments")} />
            <div
              id="remaining_installments"
              aria-live="polite"
              className="min-h-[42px] rounded-lg border border-slate-400 bg-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800"
            >
              {remainingInstallments || "Não informado"}
            </div>
            <p className="text-xs text-slate-500">
              Calculado automaticamente: total de parcelas menos parcelas pagas.
            </p>
            {errors.remaining_installments?.message ? (
              <p className="text-sm text-red-600">
                {String(errors.remaining_installments.message)}
              </p>
            ) : null}
          </div>
          {isImovelSimulation ? (
            <>
              <div className="space-y-2">
                <FormFieldLabel
                  htmlFor="administrative_fee"
                  label="Tarifa administrativa"
                  requirement="optional"
                />
                <Controller
                  control={control}
                  name="administrative_fee"
                  render={({ field }) => (
                    <input
                      id="administrative_fee"
                      disabled={disabled}
                      inputMode="decimal"
                      value={getCurrencyInputDisplayValue(field.value)}
                      onChange={(event) => {
                        const nextValue = formatCurrencyInputValueFromDigits(
                          event.target.value,
                        );
                        field.onChange(nextValue);
                      }}
                      onBlur={(event) => {
                        const nextValue = normalizeCurrencyInputValue(
                          event.target.value,
                        );
                        field.onChange(nextValue);
                        field.onBlur();
                      }}
                      ref={field.ref}
                      name={field.name}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                    />
                  )}
                />
                {errors.administrative_fee?.message ? (
                  <p className="text-sm text-red-600">
                    {String(errors.administrative_fee.message)}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <FormFieldLabel
                  htmlFor="insurance_value"
                  label="Seguros"
                  requirement="optional"
                />
                <Controller
                  control={control}
                  name="insurance_value"
                  render={({ field }) => (
                    <input
                      id="insurance_value"
                      disabled={disabled}
                      inputMode="decimal"
                      value={getCurrencyInputDisplayValue(field.value)}
                      onChange={(event) => {
                        const nextValue = formatCurrencyInputValueFromDigits(
                          event.target.value,
                        );
                        field.onChange(nextValue);
                      }}
                      onBlur={(event) => {
                        const nextValue = normalizeCurrencyInputValue(
                          event.target.value,
                        );
                        field.onChange(nextValue);
                        field.onBlur();
                      }}
                      ref={field.ref}
                      name={field.name}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                    />
                  )}
                />
                {errors.insurance_value?.message ? (
                  <p className="text-sm text-red-600">
                    {String(errors.insurance_value.message)}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </section>

      <CalculationActionMessage state={actionState} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={disabled}
          className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {disabled ? "Salvando e gerando arquivos..." : submitLabel}
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={() => router.back()}
        >
          Voltar
        </button>
        <Link
          href="/calculos"
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
        >
          Lista de simulações
        </Link>
      </div>
      </div>
      <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto">
        <CalculationResultPreview values={watch()} />
        <details className="calculation-rate-details rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Taxas de juros e limites</summary>
          <InterestRatePreviewCard
            financedValue={computedFinancedValue}
            installmentCount={installmentCount}
            currentInstallmentValue={currentInstallmentValue}
            reductionPercentage={installmentReductionPercentage}
          />
        </details>
        <button type="submit" disabled={disabled} className="w-full rounded-lg bg-[var(--ns-primary)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{disabled ? "Salvando..." : submitLabel}</button>
      </aside>
    </form>
  );
}
