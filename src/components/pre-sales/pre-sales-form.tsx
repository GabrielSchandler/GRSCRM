"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { CheckCircle2, Circle, ClipboardList, FileText, Users } from "lucide-react";
import type {
  FieldErrors,
  RegisterOptions,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import type { PreSaleActionState } from "@/app/(authenticated)/pre-vendas/actions";
import { FormFieldLabel } from "@/components/form-field-label";
import { ChangeNoteModal } from "@/components/shared/change-note-modal";
import {
  formatCurrencyInputValueFromDigits,
  normalizeCurrencyInputValue,
} from "@/lib/calculations/currency";
import { displayCpf, displayPhone } from "@/lib/clients/formatters";
import {
  formatCnpj,
  formatCpf,
  formatPhone,
  formatZipCode,
} from "@/lib/clients/masks";
import {
  preSaleDefaultValues,
  preSaleFormSchema,
  type PreSaleFormValues,
  type PreSalePayload,
} from "@/lib/pre-sales/schema";
import { resolveUserDisplayName } from "@/lib/users/account";
import {
  leadMediaOptions,
  preSaleStatuses,
  preSaleTypes,
  type ClientOption,
  type UserProfileOption,
} from "@/types/pre-sale";

type PreSalesFormProps = {
  defaultValues?: Partial<PreSaleFormValues>;
  clients: ClientOption[];
  consultants: UserProfileOption[];
  submitLabel: string;
  openingDateLabel?: string;
  onSubmitAction: (
    values: PreSalePayload,
    changeNote?: string | null,
  ) => Promise<PreSaleActionState>;
  requireChangeNote?: boolean;
};

type FormSectionProps = {
  title: string;
  description: string;
  children: ReactNode;
};

type TextFieldProps = {
  name: keyof PreSaleFormValues;
  label: string;
  register: UseFormRegister<PreSaleFormValues>;
  errors: FieldErrors<PreSaleFormValues>;
  disabled: boolean;
  type?: string;
  inputMode?: "numeric" | "decimal";
  requirement?: "required" | "optional" | "conditional" | "legal";
  placeholder?: string;
  className?: string;
  hint?: string;
  registerOptions?: RegisterOptions<PreSaleFormValues, keyof PreSaleFormValues>;
};

const paymentStatusOptions = [
  "previsto",
  "pago",
  "atrasado",
  "cancelado",
] as const;

const paymentMethodOptions = ["Pix", "Boleto", "Cartao"] as const;

function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-4">
      <div className="mb-4 flex items-start gap-3">
        <FileText className="h-8 w-8 shrink-0 rounded-lg bg-[color-mix(in_srgb,var(--ns-primary)_12%,transparent)] p-2 text-[var(--ns-primary)]" />
        <div><h2 className="text-sm font-semibold text-[var(--ns-text)]">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--ns-text-secondary)]">{description}</p></div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

function getErrorMessage(
  errors: FieldErrors<PreSaleFormValues>,
  name: keyof PreSaleFormValues,
) {
  const error = errors[name];
  return error && "message" in error ? String(error.message) : null;
}

function TextField({
  name,
  label,
  register,
  errors,
  disabled,
  type = "text",
  inputMode,
  requirement = "optional",
  placeholder,
  className = "",
  hint,
  registerOptions,
}: TextFieldProps) {
  const message = getErrorMessage(errors, name);

  return (
    <div className={`space-y-2 ${className}`}>
      <FormFieldLabel
        htmlFor={String(name)}
        label={label}
        requirement={requirement}
        hint={hint}
      />
      <input
        id={name}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
        disabled={disabled}
        {...register(name, registerOptions)}
      />
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </div>
  );
}

function maskCpf(event: ChangeEvent<HTMLInputElement>) {
  event.target.value = formatCpf(event.target.value);
}

function maskPhone(event: ChangeEvent<HTMLInputElement>) {
  event.target.value = formatPhone(event.target.value);
}

function maskZipCode(event: ChangeEvent<HTMLInputElement>) {
  event.target.value = formatZipCode(event.target.value);
}

function getPaymentErrorMessage(
  errors: FieldErrors<PreSaleFormValues>,
  index: number,
  field: "amount" | "goal_amount" | "payment_method" | "payment_date" | "status",
) {
  const paymentsError = errors.payments;

  if (!Array.isArray(paymentsError)) {
    return null;
  }

  const fieldError = paymentsError[index]?.[field];
  return fieldError && "message" in fieldError ? String(fieldError.message) : null;
}

function maskCnpj(event: ChangeEvent<HTMLInputElement>) {
  event.target.value = formatCnpj(event.target.value);
}

function handleCurrencyMask(event: ChangeEvent<HTMLInputElement>) {
  event.target.value = formatCurrencyInputValueFromDigits(event.target.value);
}

function handleCurrencyBlur(event: ChangeEvent<HTMLInputElement>) {
  event.target.value = normalizeCurrencyInputValue(event.target.value);
}

function isAutomaticGoalPaymentMethod(value: string | null | undefined) {
  return value === "Pix" || value === "Boleto";
}

function handleIntegerMask(event: ChangeEvent<HTMLInputElement>) {
  event.target.value = event.target.value.replace(/\D/g, "");
}

function copyClientToSnapshot(
  client: ClientOption,
  setValue: UseFormSetValue<PreSaleFormValues>,
) {
  setValue("snapshot_full_name", client.full_name, { shouldDirty: true });
  setValue("snapshot_cpf", formatCpf(client.cpf), { shouldDirty: true });
  setValue("snapshot_rg", client.rg ?? "", { shouldDirty: true });
  setValue("snapshot_birth_date", client.birth_date ?? "", { shouldDirty: true });
  setValue("snapshot_marital_status", client.marital_status ?? "", {
    shouldDirty: true,
  });
  setValue("snapshot_profession", client.profession ?? "", { shouldDirty: true });
  setValue("snapshot_email", client.email ?? "", { shouldDirty: true });
  setValue("snapshot_phone_mobile", formatPhone(client.phone_mobile), {
    shouldDirty: true,
  });
  setValue("snapshot_phone_secondary", formatPhone(client.phone_secondary), {
    shouldDirty: true,
  });
  setValue("snapshot_zip_code", formatZipCode(client.zip_code), { shouldDirty: true });
  setValue("snapshot_street", client.street ?? "", { shouldDirty: true });
  setValue("snapshot_number", client.number ?? "", { shouldDirty: true });
  setValue("snapshot_district", client.district ?? "", { shouldDirty: true });
  setValue("snapshot_city", client.city ?? "", { shouldDirty: true });
  setValue("snapshot_state", client.state ?? "", { shouldDirty: true });
}

function copySnapshotToDebtHolder(
  values: PreSaleFormValues,
  setValue: UseFormSetValue<PreSaleFormValues>,
) {
  setValue("debt_holder_full_name", values.snapshot_full_name, { shouldDirty: true });
  setValue("debt_holder_cpf", values.snapshot_cpf, { shouldDirty: true });
  setValue("debt_holder_rg", values.snapshot_rg ?? "", { shouldDirty: true });
  setValue("debt_holder_birth_date", values.snapshot_birth_date ?? "", {
    shouldDirty: true,
  });
  setValue("debt_holder_marital_status", values.snapshot_marital_status ?? "", {
    shouldDirty: true,
  });
  setValue("debt_holder_profession", values.snapshot_profession ?? "", {
    shouldDirty: true,
  });
  setValue("debt_holder_phone_mobile", values.snapshot_phone_mobile, {
    shouldDirty: true,
  });
  setValue("debt_holder_phone_secondary", values.snapshot_phone_secondary ?? "", {
    shouldDirty: true,
  });
  setValue("debt_holder_email", values.snapshot_email ?? "", { shouldDirty: true });
  setValue("debt_holder_zip_code", values.snapshot_zip_code ?? "", {
    shouldDirty: true,
  });
  setValue("debt_holder_street", values.snapshot_street ?? "", { shouldDirty: true });
  setValue("debt_holder_number", values.snapshot_number ?? "", { shouldDirty: true });
  setValue("debt_holder_district", values.snapshot_district ?? "", {
    shouldDirty: true,
  });
  setValue("debt_holder_city", values.snapshot_city ?? "", { shouldDirty: true });
  setValue("debt_holder_state", values.snapshot_state ?? "", { shouldDirty: true });
}

export function PreSalesForm({
  defaultValues,
  clients,
  consultants,
  submitLabel,
  openingDateLabel = "Sera definida ao salvar",
  onSubmitAction,
  requireChangeNote = false,
}: PreSalesFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isChangeNoteModalOpen, setIsChangeNoteModalOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<PreSalePayload | null>(null);

  const {
    control,
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<PreSaleFormValues, undefined, PreSalePayload>({
    resolver: zodResolver(preSaleFormSchema),
    defaultValues: {
      ...preSaleDefaultValues,
      ...defaultValues,
      payments: defaultValues?.payments ?? preSaleDefaultValues.payments,
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "payments",
  });
  const selectedPreSaleType = watch("pre_sale_type");
  const watchedPayments = watch("payments");
  const disabled = isSubmitting || isPending;
  const summaryValues = watch();
  const selectedClient = clients.find((client) => client.id === summaryValues.client_id);
  const selectedConsultant = consultants.find((consultant) => consultant.id === summaryValues.consultant_user_id);
  const statusIndex = ["lead", "pre_venda", "em_contato", "em_negociacao", "aprovado"].indexOf(summaryValues.status);
  const checklist = [
    { label: "Selecionar cliente", done: Boolean(summaryValues.client_id) },
    { label: "Definir tipo de serviço", done: Boolean(summaryValues.service_type?.trim()) },
    { label: "Informar financeira", done: Boolean(summaryValues.financer_name?.trim()) },
    { label: "Adicionar valor do contrato", done: Boolean(summaryValues.contract_value && summaryValues.contract_value !== "0,00") },
    { label: "Registrar negociação", done: Boolean(summaryValues.negotiation_details?.trim()) },
  ];
  const completed = checklist.filter((item) => item.done).length;

  useEffect(() => {
    watchedPayments?.forEach((payment, index) => {
      if (!isAutomaticGoalPaymentMethod(payment.payment_method)) {
        return;
      }

      const amount = payment.amount ?? "";

      if (payment.goal_amount !== amount) {
        setValue(`payments.${index}.goal_amount`, amount, {
          shouldDirty: false,
          shouldValidate: false,
        });
      }
    });
  }, [setValue, watchedPayments]);

  function syncPaymentGoalWithAmount(index: number, amount?: string | number | null) {
    setValue(`payments.${index}.goal_amount`, amount ?? "", {
      shouldDirty: true,
      shouldValidate: false,
    });
  }

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function confirmNavigation() {
    return !isDirty || window.confirm("Existem alterações não salvas. Deseja sair mesmo assim?");
  }

  function submitValues(values: PreSalePayload, changeNote?: string | null) {
    setMessage(null);

    startTransition(async () => {
      const result = await onSubmitAction(values, changeNote);

      if (!result.ok) {
        setMessage(result.message);
      }
    });
  }

  function onValidSubmit(values: PreSalePayload) {
    if (requireChangeNote) {
      setPendingValues(values);
      setIsChangeNoteModalOpen(true);
      return;
    }

    submitValues(values);
  }

  function handleClientChange(event: ChangeEvent<HTMLSelectElement>) {
    const client = clients.find((item) => item.id === event.target.value);

    if (client) {
      copyClientToSnapshot(client, setValue);

      if (
        client.commercial_consultant_user_id &&
        consultants.some((consultant) => consultant.id === client.commercial_consultant_user_id)
      ) {
        setValue("consultant_user_id", client.commercial_consultant_user_id, {
          shouldDirty: true,
        });
      }
    }
  }

  function handleDebtHolderCopyChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.checked) {
      copySnapshotToDebtHolder(getValues(), setValue);
    }
  }

  return (
    <form className="pre-sale-edit-form grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]" onSubmit={handleSubmit(onValidSubmit)}>
      <div className="min-w-0 space-y-4">
      <ol className="flex items-start justify-between gap-2 rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-5" aria-label="Etapas comerciais">
        {["Novo lead", "Pré-venda", "Contato", "Negociação", "Aprovado"].map((label, index) => <li key={label} className="flex flex-1 flex-col items-center gap-2 text-center text-[10px] text-[var(--ns-text-secondary)]"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${index <= statusIndex ? "bg-[var(--ns-primary)] text-[var(--ns-primary-foreground)]" : "bg-[var(--ns-surface-hover)]"}`}>{index < statusIndex ? <CheckCircle2 className="h-4 w-4" /> : index + 1}</span>{label}</li>)}
      </ol>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Obrigatoriedade alinhada com os contratos e recibos atuais enviados. Campos marcados como obrigatórios
        são usados diretamente nos documentos; os condicionais dependem do tipo da operação ou do bloco preenchido.
      </div>
      <FormSection
        title="Informações principais"
        description="Identifique a operação, origem comercial e responsável pelo atendimento."
      >
        <div className="space-y-2 md:col-span-2">
          <FormFieldLabel
            htmlFor="client_id"
            label="Cliente"
            requirement="required"
          />
          <select
            id="client_id"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            disabled={disabled}
            {...register("client_id", { onChange: handleClientChange })}
          >
            <option value="">Selecione um cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.full_name} - {displayCpf(client.cpf)} -{" "}
                {displayPhone(client.phone_mobile)}
              </option>
            ))}
          </select>
          {errors.client_id?.message ? (
            <p className="text-sm text-red-600">{errors.client_id.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <FormFieldLabel label="Data de abertura" requirement="optional" />
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700">
            {openingDateLabel}
          </div>
        </div>

        <div className="space-y-2">
          <FormFieldLabel
            htmlFor="consultant_user_id"
            label="Consultor"
            requirement="optional"
          />
          <select
            id="consultant_user_id"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            disabled={disabled}
            {...register("consultant_user_id")}
          >
            <option value="">Sem consultor</option>
            {consultants.map((consultant) => (
              <option key={consultant.id} value={consultant.id}>
                {resolveUserDisplayName(consultant, "Sem nome")}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <FormFieldLabel
            htmlFor="media"
            label="Mídia"
            requirement="optional"
            hint="Selecione a origem principal do lead."
          />
          <select
            id="media"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            disabled={disabled}
            {...register("media")}
          >
            <option value="">Não informado</option>
            {leadMediaOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.media?.message ? (
            <p className="text-sm text-red-600">{errors.media.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <FormFieldLabel
            htmlFor="pre_sale_type"
            label="Tipo de pré-venda"
            requirement="required"
          />
          <select
            id="pre_sale_type"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            disabled={disabled}
            {...register("pre_sale_type")}
          >
            {preSaleTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          {errors.pre_sale_type?.message ? (
            <p className="text-sm text-red-600">{errors.pre_sale_type.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <FormFieldLabel htmlFor="status" label="Status" requirement="required" />
          <select
            id="status"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            disabled={disabled}
            {...register("status")}
          >
            {preSaleStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        <TextField
          name="service_type"
          label="Tipo de serviço"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="optional"
        />
      </FormSection>

      <FormSection
        title="Contratante"
        description="Snapshot usado futuramente por contrato e ordem de serviço, sem alterar o cadastro mestre do cliente."
      >
        <TextField name="snapshot_full_name" label="Nome" register={register} errors={errors} disabled={disabled} requirement="required" />
          <TextField name="snapshot_cpf" label="CPF" register={register} errors={errors} disabled={disabled} requirement="required" inputMode="numeric" registerOptions={{ onChange: maskCpf }} />
        <TextField name="snapshot_rg" label="RG" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="snapshot_birth_date" label="Data de nascimento" register={register} errors={errors} disabled={disabled} type="date" requirement="optional" />
        <TextField name="snapshot_marital_status" label="Estado civil" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="snapshot_profession" label="Profissao" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="snapshot_email" label="Email" register={register} errors={errors} disabled={disabled} type="email" requirement="optional" />
          <TextField name="snapshot_phone_mobile" label="Celular" register={register} errors={errors} disabled={disabled} requirement="optional" inputMode="numeric" registerOptions={{ onChange: maskPhone }} />
          <TextField name="snapshot_phone_secondary" label="Telefone secundario" register={register} errors={errors} disabled={disabled} requirement="optional" inputMode="numeric" registerOptions={{ onChange: maskPhone }} />
          <TextField name="snapshot_zip_code" label="CEP" register={register} errors={errors} disabled={disabled} requirement="optional" inputMode="numeric" registerOptions={{ onChange: maskZipCode }} />
        <TextField name="snapshot_street" label="Rua" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="snapshot_number" label="Número" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="snapshot_district" label="Bairro" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="snapshot_city" label="Cidade" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="snapshot_state" label="Estado" register={register} errors={errors} disabled={disabled} requirement="optional" />
      </FormSection>

      <FormSection
        title="Titular da dívida"
        description="Use quando o financiado tiver dados diferentes do contratante."
      >
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 md:col-span-2">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            disabled={disabled}
            onChange={handleDebtHolderCopyChange}
          />
          <span>
            Cliente e o titular da dívida
            <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">
              Ao marcar, os dados do contratante são copiados para este bloco e podem
              ser ajustados manualmente depois.
            </span>
          </span>
        </label>
        <TextField name="debt_holder_full_name" label="Nome" register={register} errors={errors} disabled={disabled} requirement="optional" />
          <TextField name="debt_holder_cpf" label="CPF" register={register} errors={errors} disabled={disabled} requirement="optional" inputMode="numeric" registerOptions={{ onChange: maskCpf }} />
        <TextField name="debt_holder_rg" label="RG" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="debt_holder_birth_date" label="Data de nascimento" register={register} errors={errors} disabled={disabled} type="date" requirement="optional" />
        <TextField name="debt_holder_marital_status" label="Estado civil" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="debt_holder_profession" label="Profissao" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="debt_holder_nationality" label="Nacionalidade" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="debt_holder_issuer_agency" label="Órgão emissor" register={register} errors={errors} disabled={disabled} requirement="conditional" hint="Obrigatório quando houver titular da dívida preenchido e o contrato usar a tag {{titular_orgao_emissor}}." />
        <TextField name="debt_holder_father_name" label="Pai" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="debt_holder_mother_name" label="Mae" register={register} errors={errors} disabled={disabled} requirement="optional" />
          <TextField name="debt_holder_phone_mobile" label="Celular" register={register} errors={errors} disabled={disabled} requirement="optional" inputMode="numeric" registerOptions={{ onChange: maskPhone }} />
          <TextField name="debt_holder_phone_secondary" label="Telefone secundario" register={register} errors={errors} disabled={disabled} requirement="optional" inputMode="numeric" registerOptions={{ onChange: maskPhone }} />
        <TextField name="debt_holder_email" label="Email" register={register} errors={errors} disabled={disabled} type="email" requirement="optional" />
          <TextField name="debt_holder_zip_code" label="CEP" register={register} errors={errors} disabled={disabled} requirement="optional" inputMode="numeric" registerOptions={{ onChange: maskZipCode }} />
        <TextField name="debt_holder_street" label="Rua" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="debt_holder_number" label="Número" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="debt_holder_district" label="Bairro" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="debt_holder_city" label="Cidade" register={register} errors={errors} disabled={disabled} requirement="optional" />
        <TextField name="debt_holder_state" label="Estado" register={register} errors={errors} disabled={disabled} requirement="optional" />
      </FormSection>

      <FormSection
        title="Dados financeiros"
        description="Dados da operação, financiamento e contrato existente."
      >
        <TextField name="financer_name" label="Financeira" register={register} errors={errors} disabled={disabled} requirement="required" hint="Usado diretamente no contrato atual." />
        <TextField
          name="financer_legal_name"
          label="Razao social da financeira"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
          hint="Importante para notificacao extrajudicial e qualificação completa da instituição financeira."
        />
        <TextField
          name="financer_cnpj"
          label="CNPJ da financeira"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
          inputMode="numeric"
          registerOptions={{ onChange: maskCnpj }}
        />
        <TextField
          name="financer_address"
          label="Sede / endereço da financeira"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <TextField
          name="financer_district"
          label="Bairro da financeira"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <TextField
          name="financer_zip_code"
          label="CEP da financeira"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
          inputMode="numeric"
          registerOptions={{ onChange: maskZipCode }}
        />
        <TextField
          name="financer_city"
          label="Cidade da financeira"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <TextField
          name="financer_state"
          label="UF da financeira"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <div className="space-y-2">
          <FormFieldLabel
            htmlFor="has_financing_contract"
            label="Possui contrato de financiamento?"
            requirement="optional"
          />
          <select
            id="has_financing_contract"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            disabled={disabled}
            {...register("has_financing_contract")}
          >
            <option value="">Não informado</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </div>
          <TextField name="financed_amount" label="Valor da operação / financiado" register={register} errors={errors} disabled={disabled} requirement="optional" inputMode="decimal" placeholder="0,00" registerOptions={{ onChange: handleCurrencyMask, onBlur: handleCurrencyBlur }} />
          <TextField name="installment_amount" label="Valor da parcela" register={register} errors={errors} disabled={disabled} requirement="optional" inputMode="decimal" placeholder="0,00" registerOptions={{ onChange: handleCurrencyMask, onBlur: handleCurrencyBlur }} />
          <TextField name="paid_installments" label="Parcelas pagas" register={register} errors={errors} disabled={disabled} requirement="optional" inputMode="numeric" registerOptions={{ onChange: handleIntegerMask }} />
          <TextField name="overdue_installments" label="Parcelas em atraso" register={register} errors={errors} disabled={disabled} requirement="optional" inputMode="numeric" registerOptions={{ onChange: handleIntegerMask }} />
          <TextField name="due_day" label="Dia do vencimento" register={register} errors={errors} disabled={disabled} requirement="optional" inputMode="numeric" registerOptions={{ onChange: handleIntegerMask }} />
        <TextField name="contract_number" label="Número do financiamento" register={register} errors={errors} disabled={disabled} requirement="optional" />
      </FormSection>

      <FormSection
        title="Dados jurídicos"
        description="Campos usados pelo Jurídico e pela migracao da base antiga."
      >
        <TextField
          name="legal_department"
          label="Departamento jurídico legado"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <TextField
          name="legal_status_text"
          label="Status jurídico"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <TextField
          name="legal_document_status"
          label="Status documental jurídico"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <TextField
          name="legal_case_number"
          label="Número do processo"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="optional"
        />
        <TextField
          name="legal_case_year"
          label="Ano do processo"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <TextField
          name="legal_deadline"
          label="Prazo"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <TextField
          name="legal_county"
          label="Comarca"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <TextField
          name="legal_forum"
          label="Forum"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <TextField
          name="legal_court_division"
          label="Vara"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <TextField
          name="legal_operator_name"
          label="Operador jurídico legado"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <TextField
          name="legal_process_operator_name"
          label="Operador processual legado"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
        <TextField
          name="legal_protocol"
          label="Protocolo jurídico"
          register={register}
          errors={errors}
          disabled={disabled}
          requirement="legal"
        />
      </FormSection>

      {selectedPreSaleType === "veiculo" ? (
        <FormSection
          title="Dados do veículo"
          description="Campos obrigatórios somente para operações de veículo."
        >
          <TextField name="asset_brand_model" label="Veículo / marca-modelo" register={register} errors={errors} disabled={disabled} requirement="conditional" hint="Obrigatório quando o tipo da pré-venda for Veículo." />
          <TextField name="asset_color" label="Cor" register={register} errors={errors} disabled={disabled} requirement="conditional" hint="Obrigatório quando o tipo da pré-venda for Veículo." />
          <TextField name="asset_year" label="Ano" register={register} errors={errors} disabled={disabled} requirement="conditional" hint="Obrigatório quando o tipo da pré-venda for Veículo." inputMode="numeric" registerOptions={{ onChange: handleIntegerMask }} />
          <TextField name="asset_plate" label="Placa" register={register} errors={errors} disabled={disabled} requirement="conditional" hint="Obrigatório quando o tipo da pré-venda for Veículo." />
        </FormSection>
      ) : null}

      <FormSection
        title="Contratação e negociacao"
        description="Registre valores, detalhes combinados e observações operacionais."
      >
          <TextField name="contract_value" label="Valor do contrato" register={register} errors={errors} disabled={disabled} requirement="required" hint="Usado no contrato e no recibo para gerar o valor total no documento." inputMode="decimal" placeholder="0,00" registerOptions={{ onChange: handleCurrencyMask, onBlur: handleCurrencyBlur }} />
        <div className="space-y-2 md:col-span-2">
          <FormFieldLabel
            htmlFor="payment_description"
            label="Descrição de contrato"
            requirement="required"
            hint="Usado diretamente em contrato e recibo pela tag {{descricao_pagamento}}."
          />
          <textarea
            id="payment_description"
            rows={4}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            disabled={disabled}
            placeholder="Ex.: R$ 800,00 no credito a vista e R$ 1.000,00 no PIX."
            {...register("payment_description")}
          />
          {errors.payment_description?.message ? (
            <p className="text-sm text-red-600">
              {errors.payment_description.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2 md:col-span-2">
          <FormFieldLabel
            htmlFor="negotiation_details"
            label="Descrição livre da contratação / informe"
            requirement="optional"
          />
          <textarea
            id="negotiation_details"
            rows={6}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            disabled={disabled}
            {...register("negotiation_details")}
          />
          {errors.negotiation_details?.message ? (
            <p className="text-sm text-red-600">
              {errors.negotiation_details.message}
            </p>
          ) : null}
        </div>
      </FormSection>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Pagamentos previstos
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Inclua parcelas previstas para acompanhamento comercial inicial.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            disabled={disabled}
            onClick={() =>
              append({
                installment_number: String(fields.length + 1),
                amount: "",
                goal_amount: "",
                payment_method: "",
                payment_date: "",
                status: "previsto",
              })
            }
          >
            Adicionar pagamento
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-[80px_1fr_1fr_1fr_1fr_1fr_auto]">
            <span>Parcela (Opcional)</span>
            <span>Valor (Obrigatório para recibo)</span>
            <span>Forma (Obrigatório para recibo)</span>
            <span>Meta</span>
            <span>Data (Opcional)</span>
            <span>Status (Opcional)</span>
            <span />
          </div>
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[80px_1fr_1fr_1fr_1fr_1fr_auto]"
            >
              <input
                aria-label="Número da parcela"
                inputMode="numeric"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                disabled={disabled}
                placeholder="Parcela"
                {...register(`payments.${index}.installment_number`, {
                  onChange: handleIntegerMask,
                })}
              />
              <input
                aria-label="Valor"
                inputMode="decimal"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                disabled={disabled}
                placeholder="Valor"
                {...register(`payments.${index}.amount`, {
                  onChange: (event) => {
                    handleCurrencyMask(event);

                    if (
                      isAutomaticGoalPaymentMethod(
                        getValues(`payments.${index}.payment_method`),
                      )
                    ) {
                      syncPaymentGoalWithAmount(index, event.target.value);
                    }
                  },
                  onBlur: (event) => {
                    handleCurrencyBlur(event);

                    if (
                      isAutomaticGoalPaymentMethod(
                        getValues(`payments.${index}.payment_method`),
                      )
                    ) {
                      syncPaymentGoalWithAmount(index, event.target.value);
                    }
                  },
                })}
              />
              <select
                aria-label="Forma"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                disabled={disabled}
                {...register(`payments.${index}.payment_method`, {
                  onChange: (event) => {
                    if (isAutomaticGoalPaymentMethod(event.target.value)) {
                      syncPaymentGoalWithAmount(
                        index,
                        getValues(`payments.${index}.amount`),
                      );
                    }
                  },
                })}
              >
                <option value="">Forma</option>
                {paymentMethodOptions.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
              <input
                aria-label="Meta"
                inputMode="decimal"
                className={`rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 ${
                  isAutomaticGoalPaymentMethod(watchedPayments?.[index]?.payment_method)
                    ? "bg-slate-200 font-semibold text-slate-700"
                    : "bg-white"
                }`}
                disabled={disabled}
                readOnly={isAutomaticGoalPaymentMethod(watchedPayments?.[index]?.payment_method)}
                placeholder="Meta"
                {...register(`payments.${index}.goal_amount`, {
                  onChange: handleCurrencyMask,
                  onBlur: handleCurrencyBlur,
                })}
              />
              <input
                aria-label="Data"
                type="date"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                disabled={disabled}
                min={
                  watchedPayments?.[index]?.status === "previsto"
                    ? new Date(Date.now() + 86400000).toISOString().slice(0, 10)
                    : undefined
                }
                {...register(`payments.${index}.payment_date`)}
              />
              <select
                aria-label="Status"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                disabled={disabled}
                {...register(`payments.${index}.status`)}
              >
                {paymentStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                disabled={disabled}
                onClick={() => remove(index)}
              >
                Remover
              </button>
              {[
                getPaymentErrorMessage(errors, index, "amount"),
                getPaymentErrorMessage(errors, index, "payment_method"),
                getPaymentErrorMessage(errors, index, "goal_amount"),
                getPaymentErrorMessage(errors, index, "payment_date"),
                getPaymentErrorMessage(errors, index, "status"),
              ].filter(Boolean).length ? (
                <div className="text-sm text-red-600 md:col-span-7">
                  {[
                    getPaymentErrorMessage(errors, index, "amount"),
                    getPaymentErrorMessage(errors, index, "payment_method"),
                    getPaymentErrorMessage(errors, index, "goal_amount"),
                    getPaymentErrorMessage(errors, index, "payment_date"),
                    getPaymentErrorMessage(errors, index, "status"),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </div>
              ) : null}
            </div>
          ))}
          {errors.payments?.message ? (
            <p className="text-sm text-red-600">{String(errors.payments.message)}</p>
          ) : null}
        </div>
      </section>

      {message ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={disabled}
          className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {disabled ? "Salvando..." : submitLabel}
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={() => {
            if (confirmNavigation()) {
              router.back();
            }
          }}
        >
          Voltar
        </button>
        <Link
          href="/pre-vendas"
          onClick={(event) => {
            if (!confirmNavigation()) {
              event.preventDefault();
            }
          }}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
        >
          Lista de pré-vendas
        </Link>
      </div>

      </div>
      <aside className="sticky top-4 max-h-[calc(100dvh-2rem)] space-y-4 overflow-y-auto">
        <section className="rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-[var(--ns-primary)]" />Resumo da pré-venda</h2>
          <p className="mt-5 break-words text-lg font-semibold">{selectedClient?.full_name ?? "Nova oportunidade"}</p>
          <p className="mt-1 text-xs text-[var(--ns-text-secondary)]">{preSaleStatuses.find((status) => status.value === summaryValues.status)?.label ?? summaryValues.status}</p>
          <dl className="mt-5 space-y-3 text-xs">{[
            ["Tipo de serviço", summaryValues.service_type || "Não definido"],
            ["Tipo de pré-venda", preSaleTypes.find((type) => type.value === summaryValues.pre_sale_type)?.label ?? "Não definido"],
            ["Valor do contrato", summaryValues.contract_value ? `R$ ${summaryValues.contract_value}` : "Não informado"],
            ["Origem / Mídia", summaryValues.media || "Não definida"],
            ["Consultor", selectedConsultant ? resolveUserDisplayName(selectedConsultant, "Sem nome") : "Não atribuído"],
            ["Financeira", summaryValues.financer_name || "Não informada"],
          ].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-[var(--ns-text-secondary)]">{label}</dt><dd className="max-w-[60%] break-words text-right font-medium">{value}</dd></div>)}</dl>
          {selectedClient && <Link className="mt-5 block rounded-lg border border-[var(--ns-border)] p-2 text-center text-xs font-semibold hover:bg-[var(--ns-surface-hover)]" href={`/clientes/${selectedClient.id}`} onClick={(event) => { if (!confirmNavigation()) event.preventDefault(); }}>Ver cliente 360°</Link>}
        </section>
        <section className="rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><ClipboardList className="h-4 w-4 text-[var(--ns-primary)]" />Checklist de preenchimento</h2><p className="mt-2 text-xs text-[var(--ns-text-secondary)]">{completed} de {checklist.length} concluídos</p><progress className="my-3 h-2 w-full accent-[var(--ns-success)]" value={completed} max={checklist.length} aria-label="Progresso do preenchimento" /><ul className="space-y-3">{checklist.map((item) => <li key={item.label} className="flex items-center gap-2 text-xs">{item.done ? <CheckCircle2 className="h-4 w-4 text-[var(--ns-success)]" /> : <Circle className="h-4 w-4 text-[var(--ns-text-secondary)]" />}{item.label}</li>)}</ul></section>
        <section className="rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-5"><h2 className="text-sm font-semibold">Dados da oportunidade</h2><p className="mt-3 text-xs text-[var(--ns-text-secondary)]">Abertura: {openingDateLabel}</p><button type="submit" disabled={disabled} className="mt-5 w-full cursor-pointer rounded-lg bg-[var(--ns-primary)] p-3 text-sm font-semibold text-[var(--ns-primary-foreground)] disabled:opacity-50">{disabled ? "Salvando..." : submitLabel}</button></section>
      </aside>
      <ChangeNoteModal
        isOpen={isChangeNoteModalOpen}
        title="Registrar alteração na pré-venda"
        description="Antes de salvar, descreva o que foi ajustado na pré-venda e por que essa alteração foi necessária."
        confirmLabel="Salvar com anotacao"
        pending={disabled}
        onClose={() => {
          if (disabled) {
            return;
          }

          setIsChangeNoteModalOpen(false);
          setPendingValues(null);
        }}
        onConfirm={(note) => {
          if (!pendingValues) {
            return;
          }

          setIsChangeNoteModalOpen(false);
          submitValues(pendingValues, note);
        }}
      />
    </form>
  );
}
