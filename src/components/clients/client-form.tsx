"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { CheckCircle2, Circle, FileText, MapPin, Phone, Users, RotateCcw } from "lucide-react";
import {
  clientDefaultValues,
  clientFormSchema,
  type ClientFormValues,
  type ClientPayload,
} from "@/lib/clients/schema";
import { formatCpf, formatPhone, formatZipCode, onlyDigits } from "@/lib/clients/masks";
import { FormFieldLabel } from "@/components/form-field-label";
import { ChangeNoteModal } from "@/components/shared/change-note-modal";
import { resolveUserDisplayName } from "@/lib/users/account";
import { ReactivateClientButton } from "./reactivate-client-button";
import type { ClientActionState } from "@/app/(authenticated)/clientes/actions";
import type { UserProfileOption } from "@/types/pre-sale";

type ClientFormProps = {
  defaultValues?: Partial<ClientFormValues>;
  submitLabel: string;
  onSubmitAction: (
    values: ClientPayload,
    changeNote?: string | null,
  ) => Promise<ClientActionState>;
  canReactivateDeletedClient?: boolean;
  commercialConsultants?: UserProfileOption[];
  legalAdmins?: UserProfileOption[];
  legalConsultants?: UserProfileOption[];
  requireChangeNote?: boolean;
};

const fields = [
  { name: "full_name", label: "Nome completo", type: "text", required: true },
  { name: "cpf", label: "CPF", type: "text", required: true },
  { name: "phone_mobile", label: "Celular", type: "text" },
  { name: "rg", label: "RG", type: "text", required: true },
  { name: "nationality", label: "Nacionalidade", type: "text", requirement: "legal" },
  { name: "birth_date", label: "Data de nascimento", type: "date", required: true },
  { name: "marital_status", label: "Estado civil", type: "select", required: true },
  { name: "profession", label: "Profissao", type: "text" },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "phone_secondary", label: "Telefone secundario", type: "text" },
  { name: "zip_code", label: "CEP", type: "text", required: true },
  { name: "street", label: "Rua", type: "text", required: true },
  { name: "number", label: "Número", type: "text", required: true },
  { name: "district", label: "Bairro", type: "text", required: true },
  { name: "city", label: "Cidade", type: "text", required: true },
  { name: "state", label: "Estado", type: "text", required: true },
] as const;

const maritalStatusOptions = [
  "Solteiro",
  "Casado",
  "Divorciado",
  "Viuvo",
  "Uniao estavel",
] as const;

function maskValue(fieldName: string, value: string) {
  if (fieldName === "cpf") {
    return formatCpf(value);
  }

  if (fieldName === "phone_mobile" || fieldName === "phone_secondary") {
    return formatPhone(value);
  }

  if (fieldName === "zip_code") {
    return formatZipCode(value);
  }

  return value;
}

function getMaxLength(fieldName: string) {
  if (fieldName === "cpf") {
    return 14;
  }

  if (fieldName === "phone_mobile" || fieldName === "phone_secondary") {
    return 15;
  }

  if (fieldName === "zip_code") {
    return 9;
  }

  return undefined;
}

export function ClientForm({
  defaultValues,
  submitLabel,
  onSubmitAction,
  canReactivateDeletedClient = false,
  commercialConsultants = [],
  legalAdmins = [],
  legalConsultants = [],
  requireChangeNote = false,
}: ClientFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionState, setActionState] = useState<ClientActionState | null>(null);
  const [isChangeNoteModalOpen, setIsChangeNoteModalOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<ClientPayload | null>(null);
  const [lastFetchedZipCode, setLastFetchedZipCode] = useState<string | null>(() =>
    onlyDigits(typeof defaultValues?.zip_code === "string" ? defaultValues.zip_code : ""),
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ClientFormValues, undefined, ClientPayload>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      ...clientDefaultValues,
      ...defaultValues,
    },
  });

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

  const zipCodeValue = watch("zip_code");

  function confirmNavigation() {
    return !isDirty || window.confirm("Existem alterações não salvas. Deseja sair mesmo assim?");
  }

  const fetchAddressByZipCode = useCallback(async (zipCode: string) => {
    if (zipCode.length !== 8 || zipCode === lastFetchedZipCode) {
      return;
    }

    try {
      setLastFetchedZipCode(zipCode);
      const response = await fetch(`https://viacep.com.br/ws/${zipCode}/json/`);
      const data = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };

      if (data.erro) {
        setLastFetchedZipCode(null);
        return;
      }

      setValue("street", data.logradouro ?? "", { shouldDirty: true });
      setValue("district", data.bairro ?? "", { shouldDirty: true });
      setValue("city", data.localidade ?? "", { shouldDirty: true });
      setValue("state", data.uf ?? "", { shouldDirty: true });
    } catch {
      setLastFetchedZipCode(null);
      // CEP lookup is a convenience; manual address entry remains available.
    }
  }, [lastFetchedZipCode, setValue]);

  useEffect(() => {
    const zipCode = onlyDigits(typeof zipCodeValue === "string" ? zipCodeValue : "");

    if (zipCode.length === 8) {
      void fetchAddressByZipCode(zipCode);
    }
  }, [fetchAddressByZipCode, zipCodeValue]);

  function submitValues(values: ClientPayload, changeNote?: string | null) {
    setActionState(null);

    startTransition(async () => {
      const result = await onSubmitAction(values, changeNote);

      if (!result.ok) {
        setActionState(result);
      }
    });
  }

  function onValidSubmit(values: ClientPayload) {
    if (requireChangeNote) {
      setPendingValues(values);
      setIsChangeNoteModalOpen(true);
      return;
    }

    submitValues(values);
  }

  const disabled = isSubmitting || isPending;
  const values = watch();
  const groups = [
    { title: "Dados pessoais", description: "Informações básicas do cliente.", icon: Users, names: ["full_name", "cpf", "birth_date", "rg", "nationality", "marital_status", "profession"] },
    { title: "Contato", description: "Canais de comunicação com o cliente.", icon: Phone, names: ["email", "phone_mobile", "phone_secondary"] },
    { title: "Endereço", description: "Endereço residencial ou comercial.", icon: MapPin, names: ["zip_code", "street", "number", "district", "city", "state"] },
    { title: "Responsáveis", description: "Acompanhamento comercial e jurídico.", icon: Users, names: ["commercial_consultant_user_id", "legal_responsible_user_id", "legal_consultant_user_id"] },
    { title: "Observações", description: "Informações adicionais sobre o cliente.", icon: FileText, names: ["notes"] },
  ];
  const progress = groups.map((group) => ({ ...group, filled: group.names.filter((name) => String(values[name as keyof ClientFormValues] ?? "").trim()).length }));
  const totalFields = groups.reduce((total, group) => total + group.names.length, 0);
  const percentage = Math.round(progress.reduce((total, group) => total + group.filled, 0) / totalFields * 100);

  return (
    <form className="client-edit-form grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]" onSubmit={handleSubmit(onValidSubmit)}>
      <div className="min-w-0 space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Obrigatoriedade alinhada com os contratos e recibos atuais. Os campos marcados como obrigatórios
        são os que entram diretamente nesses documentos.
      </div>
      <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
        Os campos marcados como Jurídico são usados em documentos da esteira jurídica, como procuracoes
        e declaracoes.
      </div>
      <div className="client-form-sections flex flex-col gap-4">
        {groups.slice(0, 3).map((group) => <section key={group.title} className="rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-4">
          <div className="mb-4 flex items-center gap-3"><group.icon className="h-9 w-9 rounded-lg bg-[color-mix(in_srgb,var(--ns-primary)_12%,transparent)] p-2 text-[var(--ns-primary)]" /><div><h2 className="text-sm font-semibold">{group.title}</h2><p className="mt-1 text-xs text-[var(--ns-text-secondary)]">{group.description}</p></div></div>
          <div className="grid gap-4 md:grid-cols-3">
        {fields.filter((field) => group.names.includes(field.name)).map((field) => (
          <div className="space-y-2" key={field.name}>
            <FormFieldLabel
              htmlFor={field.name}
              label={field.label}
              requirement={
                "requirement" in field
                  ? field.requirement
                  : "required" in field && field.required
                    ? "required"
                    : "optional"
              }
            />
            {field.type === "select" ? (
              <select
                id={field.name}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                disabled={disabled}
                {...register(field.name)}
              >
                <option value="">Selecione</option>
                {maritalStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={field.name}
                type={field.type}
                inputMode={
                  field.name === "cpf" ||
                  field.name === "phone_mobile" ||
                  field.name === "phone_secondary" ||
                  field.name === "zip_code"
                    ? "numeric"
                    : undefined
                }
                maxLength={getMaxLength(field.name)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                disabled={disabled}
                {...register(field.name, {
                  onChange(event: ChangeEvent<HTMLInputElement>) {
                    event.target.value = maskValue(field.name, event.target.value);

                  },
                })}
              />
            )}
            {errors[field.name]?.message ? (
              <p className="text-sm text-red-600">
                {String(errors[field.name]?.message)}
              </p>
            ) : null}
          </div>
        ))}
          </div>
        </section>)}

        <section className="order-2 space-y-3 rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-4">
          <div className="flex items-center gap-3"><FileText className="h-9 w-9 rounded-lg bg-[color-mix(in_srgb,var(--ns-primary)_12%,transparent)] p-2 text-[var(--ns-primary)]" /><div><h2 className="text-sm font-semibold">Observações</h2><p className="mt-1 text-xs text-[var(--ns-text-secondary)]">Informações adicionais sobre este cliente.</p></div></div>
          <FormFieldLabel htmlFor="notes" label="Observações" requirement="optional" />
          <textarea
            id="notes"
            rows={3}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            disabled={disabled}
            {...register("notes")}
          />
        </section>

        <section className="rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-4">
        <div className="mb-4 flex items-center gap-3"><Users className="h-9 w-9 rounded-lg bg-[color-mix(in_srgb,var(--ns-primary)_12%,transparent)] p-2 text-[var(--ns-primary)]" /><div><h2 className="text-sm font-semibold">Responsáveis</h2><p className="mt-1 text-xs text-[var(--ns-text-secondary)]">Acompanhamento comercial e jurídico.</p></div></div>
        <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <FormFieldLabel
            htmlFor="commercial_consultant_user_id"
            label="Consultor comercial responsável"
            requirement="optional"
            hint="Selecione o consultor comercial que deve acompanhar este cliente e novas pré-vendas."
          />
          <select
            id="commercial_consultant_user_id"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            disabled={disabled}
            {...register("commercial_consultant_user_id")}
          >
            <option value="">Não definido</option>
            {commercialConsultants.map((consultant) => (
              <option key={consultant.id} value={consultant.id}>
                {resolveUserDisplayName(consultant, "Consultor comercial")}
                {consultant.is_active === false ? " (desativado)" : ""}
              </option>
            ))}
          </select>
          {errors.commercial_consultant_user_id?.message ? (
            <p className="text-sm text-red-600">
              {String(errors.commercial_consultant_user_id?.message)}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <FormFieldLabel
            htmlFor="legal_responsible_user_id"
            label="Adm responsável"
            requirement="legal"
            hint="Selecione o adm jurídico que responde pela operação deste cliente."
          />
          <select
            id="legal_responsible_user_id"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            disabled={disabled}
            {...register("legal_responsible_user_id")}
          >
            <option value="">Não definido</option>
            {legalAdmins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {resolveUserDisplayName(admin, "Adm jurídico")}
              </option>
            ))}
          </select>
          {errors.legal_responsible_user_id?.message ? (
            <p className="text-sm text-red-600">
              {String(errors.legal_responsible_user_id?.message)}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <FormFieldLabel
            htmlFor="legal_consultant_user_id"
            label="Consultor responsável"
            requirement="legal"
            hint="Selecione o consultor jurídico que acompanha diretamente este cliente."
          />
          <select
            id="legal_consultant_user_id"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            disabled={disabled}
            {...register("legal_consultant_user_id")}
          >
            <option value="">Não definido</option>
            {legalConsultants.map((consultant) => (
              <option key={consultant.id} value={consultant.id}>
                {resolveUserDisplayName(consultant, "Consultor jurídico")}
              </option>
            ))}
          </select>
          {errors.legal_consultant_user_id?.message ? (
            <p className="text-sm text-red-600">
              {String(errors.legal_consultant_user_id?.message)}
            </p>
          ) : null}
        </div>
        </div>
        </section>
      </div>

      {actionState ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{actionState.message}</p>
          {actionState.deletedClientId ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`/clientes/${actionState.deletedClientId}`}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
              >
                Ver cliente
              </Link>
              {canReactivateDeletedClient ? (
                <ReactivateClientButton clientId={actionState.deletedClientId} />
              ) : null}
            </div>
          ) : null}
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
          href="/clientes"
          onClick={(event) => {
            if (!confirmNavigation()) {
              event.preventDefault();
            }
          }}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
        >
          Lista de clientes
        </Link>
      </div>

      </div>
      <aside className="sticky top-4 rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-5">
        <h2 className="text-sm font-semibold">Resumo do cadastro</h2><p className="mt-1 text-xs text-[var(--ns-text-secondary)]">Acompanhe o preenchimento das informações.</p>
        <div className="my-6 flex items-center gap-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(var(--ns-success) ${percentage}%, var(--ns-border) 0)` }}><div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ns-surface)] text-lg font-semibold">{percentage}%</div></div><div><p className="text-sm font-semibold">{percentage === 100 ? "Cadastro preenchido" : "Complete as informações"}</p><p className="mt-1 text-xs text-[var(--ns-text-secondary)]">Preencha os campos obrigatórios para salvar.</p></div></div>
        <ul>{progress.map((group) => <li key={group.title} className="flex items-center gap-2 border-b border-[var(--ns-border)] py-3 text-xs">{group.filled === group.names.length ? <CheckCircle2 className="h-4 w-4 text-[var(--ns-success)]" /> : <Circle className="h-4 w-4 text-[var(--ns-text-secondary)]" />}<span className="flex-1">{group.title}</span><span className="text-[var(--ns-text-secondary)]">{group.filled}/{group.names.length}</span></li>)}</ul>
        <h3 className="mb-3 mt-5 text-sm font-semibold">Ações rápidas</h3>
        <button type="button" disabled={disabled} onClick={() => { if (window.confirm("Restaurar o formulário aos valores iniciais?")) reset({ ...clientDefaultValues, ...defaultValues }); }} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--ns-border)] p-2.5 text-xs font-semibold hover:bg-[var(--ns-surface-hover)]"><RotateCcw className="h-4 w-4" />Restaurar formulário</button>
        <button type="submit" disabled={disabled} className="mt-3 w-full cursor-pointer rounded-lg bg-[var(--ns-primary)] p-2.5 text-sm font-semibold text-[var(--ns-primary-foreground)] disabled:opacity-50">{disabled ? "Salvando..." : submitLabel}</button>
      </aside>
      <ChangeNoteModal
        isOpen={isChangeNoteModalOpen}
        title="Registrar alteração no cliente"
        description="Antes de salvar, escreva o que foi alterado no cadastro do cliente e por que essa mudança foi feita."
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
