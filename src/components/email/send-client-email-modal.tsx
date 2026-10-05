"use client";

import { Mail } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendClientEmailAction,
  type EmailActionState,
} from "@/app/(authenticated)/emails/actions";
import { formatClientDocumentSize } from "@/lib/client-documents/formatters";
import {
  emailDispatchModes,
  formatEmailRecipientMode,
  type EmailDispatchMode,
  type EmailTemplate,
} from "@/types/email";

export type EmailAttachmentOption = {
  id: string;
  title: string | null;
  file_name: string;
  file_size: number;
};

type SendClientEmailModalProps = {
  clientId: string;
  preSaleId?: string | null;
  clientEmail: string | null;
  bankName?: string | null;
  bankEmail?: string | null;
  templates: EmailTemplate[];
  documents: EmailAttachmentOption[];
  variables: Record<string, string>;
};

const freeEmailTemplateId = "__free_email__";

function renderTemplate(value: string, variables: Record<string, string>) {
  return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    return variables[key] ?? "Não informado";
  });
}

function recipientValue(template: EmailTemplate | null, clientEmail: string | null, bankEmail: string) {
  if (!template) {
    return clientEmail ?? "";
  }

  const recipients = [];

  if ((template.recipient_mode === "client" || template.recipient_mode === "client_bank") && clientEmail) {
    recipients.push(clientEmail);
  }

  if ((template.recipient_mode === "bank" || template.recipient_mode === "client_bank") && bankEmail) {
    recipients.push(bankEmail);
  }

  return recipients.join(", ");
}

export function SendClientEmailModal({
  clientId,
  preSaleId = null,
  clientEmail,
  bankName = null,
  bankEmail = null,
  templates,
  documents,
  variables,
}: SendClientEmailModalProps) {
  const router = useRouter();
  const initialTemplate = templates[0] ?? null;
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<EmailActionState | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    initialTemplate?.id ?? freeEmailTemplateId,
  );
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [mode, setMode] = useState<EmailDispatchMode>("draft");
  const [typedBankEmail, setTypedBankEmail] = useState(bankEmail ?? "");
  const selectedTemplate = useMemo(
    () =>
      selectedTemplateId === freeEmailTemplateId
        ? null
        : templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );
  const [to, setTo] = useState(() =>
    recipientValue(initialTemplate, clientEmail, bankEmail ?? ""),
  );
  const [cc, setCc] = useState(initialTemplate?.cc_template ?? "");
  const [bcc, setBcc] = useState(initialTemplate?.bcc_template ?? "");
  const [subject, setSubject] = useState(() =>
    initialTemplate ? renderTemplate(initialTemplate.subject_template, variables) : "",
  );
  const [body, setBody] = useState(() =>
    initialTemplate ? renderTemplate(initialTemplate.body_template, variables) : "",
  );

  function handleTemplateChange(templateId: string) {
    const nextTemplate =
      templateId === freeEmailTemplateId
        ? null
        : templates.find((template) => template.id === templateId) ?? null;
    setSelectedTemplateId(templateId);
    setTo(recipientValue(nextTemplate, clientEmail, typedBankEmail));
    setCc(nextTemplate?.cc_template ?? "");
    setBcc(nextTemplate?.bcc_template ?? "");
    setSubject(nextTemplate ? renderTemplate(nextTemplate.subject_template, variables) : "");
    setBody(nextTemplate ? renderTemplate(nextTemplate.body_template, variables) : "");
  }

  function handleBankEmailChange(value: string) {
    setTypedBankEmail(value);

    if (
      selectedTemplate?.recipient_mode === "bank" ||
      selectedTemplate?.recipient_mode === "client_bank"
    ) {
      setTo(recipientValue(selectedTemplate, clientEmail, value));
    }
  }

  function toggleAttachment(documentId: string) {
    setSelectedAttachmentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  }

  function handleSend() {
    if (!subject.trim() || !body.trim()) {
      setState({
        ok: false,
        message: "Informe assunto e corpo do email.",
      });
      return;
    }

    setState(null);
    startTransition(async () => {
      const result = await sendClientEmailAction({
        client_id: clientId,
        pre_sale_id: preSaleId ?? "",
        template_id: selectedTemplate?.id ?? "",
        mode,
        to,
        cc,
        bcc,
        subject,
        body,
        attachment_ids: selectedAttachmentIds,
      });
      setState(result);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-[8px] border border-[color-mix(in_srgb,var(--ns-primary)_35%,var(--ns-border))] bg-[color-mix(in_srgb,var(--ns-primary)_10%,var(--ns-surface))] px-4 py-2.5 text-sm font-semibold text-[var(--ns-primary)] transition hover:bg-[color-mix(in_srgb,var(--ns-primary)_16%,var(--ns-surface))]"
      >
        <Mail className="h-4 w-4" />
        Enviar email
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Enviar email</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Escreva livremente ou use um template como ponto de partida. Depois confira destinatarios e anexos.
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              {state ? (
                <div
                  className={`rounded-lg border px-4 py-3 text-sm ${
                    state.ok
                      ? "border-teal-200 bg-teal-50 text-teal-800"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {state.message}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="email-template" className="text-sm font-semibold text-slate-700">
                    Template
                  </label>
                  <select
                    id="email-template"
                    value={selectedTemplateId}
                    disabled={isPending}
                    onChange={(event) => handleTemplateChange(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  >
                    <option value={freeEmailTemplateId}>Email livre - sem template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} - {formatEmailRecipientMode(template.recipient_mode)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="email-mode" className="text-sm font-semibold text-slate-700">
                    Ação
                  </label>
                  <select
                    id="email-mode"
                    value={mode}
                    disabled={isPending}
                    onChange={(event) => setMode(event.target.value as EmailDispatchMode)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  >
                    {emailDispatchModes.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="bank-email" className="text-sm font-semibold text-slate-700">
                    Email do banco
                  </label>
                  <input
                    id="bank-email"
                    value={typedBankEmail}
                    disabled={isPending}
                    onChange={(event) => handleBankEmailChange(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                    placeholder={`Opcional${bankName ? ` para ${bankName}` : ""}`}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="email-to" className="text-sm font-semibold text-slate-700">
                    Para
                  </label>
                  <input
                    id="email-to"
                    value={to}
                    disabled={isPending}
                    onChange={(event) => setTo(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                    placeholder="email@exemplo.com.br"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="email-cc" className="text-sm font-semibold text-slate-700">
                    Cc
                  </label>
                  <input
                    id="email-cc"
                    value={cc}
                    disabled={isPending}
                    onChange={(event) => setCc(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="email-bcc" className="text-sm font-semibold text-slate-700">
                    Cco
                  </label>
                  <input
                    id="email-bcc"
                    value={bcc}
                    disabled={isPending}
                    onChange={(event) => setBcc(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  />
                </div>
              </div>

              <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="space-y-2">
                  <label htmlFor="email-subject" className="text-sm font-semibold text-slate-700">
                    Assunto
                  </label>
                  <input
                    id="email-subject"
                    value={subject}
                    disabled={isPending}
                    onChange={(event) => setSubject(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                    placeholder="Digite o assunto do email"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="email-body" className="text-sm font-semibold text-slate-700">
                    Corpo do email
                  </label>
                  <textarea
                    id="email-body"
                    value={body}
                    disabled={isPending}
                    onChange={(event) => setBody(event.target.value)}
                    rows={9}
                    className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                    placeholder="Escreva o email aqui. Você tambem pode usar tags como {{nome_cliente}}, {{cpf}} e {{numero_contrato}}."
                  />
                  <p className="text-xs text-slate-500">
                    A assinatura da empresa sera adicionada automaticamente no final do email.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-950">Anexos do cliente</p>
                <p className="mt-1 text-xs text-slate-500">
                  Nesta versao, os anexos selecionados precisam somar até 3 MB.
                </p>
                <div className="mt-4 grid gap-2">
                  {documents.length ? (
                    documents.map((document) => (
                      <label
                        key={document.id}
                        className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAttachmentIds.includes(document.id)}
                          disabled={isPending}
                          onChange={() => toggleAttachment(document.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                        />
                        <span>
                          <span className="block font-semibold text-slate-950">
                            {document.title || document.file_name}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {document.file_name} - {formatClientDocumentSize(document.file_size)}
                          </span>
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                      Nenhum documento anexado no cadastro do cliente.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending || !subject.trim() || !body.trim()}
                onClick={handleSend}
                className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPending ? "Processando..." : mode === "draft" ? "Criar rascunho" : "Enviar agora"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
