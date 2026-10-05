"use client";

import { Download, Eye, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  cancelClientDocumentsBulkUploadAction,
  completeClientDocumentsBulkUploadAction,
  prepareClientDocumentsBulkUploadAction,
  type ClientDocumentActionState,
} from "@/app/(authenticated)/clientes/document-actions";
import { FormFieldLabel } from "@/components/form-field-label";
import { createClient } from "@/lib/supabase/browser";
import {
  clientDocumentAcceptedFormatsLabel,
  clientDocumentAcceptedInputTypes,
  clientDocumentTypes,
  type ClientDocumentType,
} from "@/types/client-document";

type ClientDocumentUploadProps = {
  clientId: string;
  preSaleId?: string | null;
  fixedDocumentType?: ClientDocumentType;
  preSales?: ClientDocumentPreSaleOption[];
};

export type ClientDocumentPreSaleOption = {
  id: string;
  tracking_protocol: string | null;
  service_type: string | null;
  created_at: string;
};

function getFriendlyUploadError(message: string) {
  if (message.toLowerCase().includes("exceeded the maximum allowed size")) {
    return "Um dos arquivos ultrapassa o limite permitido pelo Storage. O limite atual para documentos do cliente e 20 MB por arquivo.";
  }

  return message;
}

const defaultDocumentType = clientDocumentTypes[0]?.value ?? "documentacao";

export function ClientDocumentUpload({
  clientId,
  preSaleId = null,
  fixedDocumentType,
  preSales = [],
}: ClientDocumentUploadProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [files, setFiles] = useState<File[]>([]);
  const [documentType, setDocumentType] = useState(fixedDocumentType ?? defaultDocumentType);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPreSaleId, setSelectedPreSaleId] = useState(preSaleId ?? "");
  const [clientVisibilityRequested, setClientVisibilityRequested] = useState(false);
  const [clientDownloadRequested, setClientDownloadRequested] = useState(false);
  const [state, setState] = useState<ClientDocumentActionState | null>(null);
  const disabled = isPending || files.length === 0;
  const selectedDocumentType = fixedDocumentType ?? documentType;
  const selectedDocumentTypeLabel =
    clientDocumentTypes.find((item) => item.value === selectedDocumentType)?.label ??
    "Documentação";
  const hintText = useMemo(
    () =>
      preSaleId
        ? "Este arquivo será vinculado ao cliente e também a esta operação."
        : "Este arquivo será vinculado ao cliente.",
    [preSaleId],
  );

  function resetForm() {
    setFiles([]);
    setDocumentType(fixedDocumentType ?? defaultDocumentType);
    setTitle("");
    setDescription("");
    setSelectedPreSaleId(preSaleId ?? "");
    setClientVisibilityRequested(false);
    setClientDownloadRequested(false);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!files.length) {
      setState({
        ok: false,
        message: "Selecione pelo menos um arquivo.",
      });
      return;
    }

    if (
      selectedDocumentType === "extrajudicial" &&
      clientVisibilityRequested &&
      !selectedPreSaleId
    ) {
      setState({
        ok: false,
        message: "Selecione a pré-venda para vincular a publicação ao protocolo correto.",
      });
      return;
    }

    setState(null);

    startTransition(async () => {
      const payload = {
        client_id: clientId,
        pre_sale_id: selectedPreSaleId,
        document_type: selectedDocumentType,
        title,
        description,
        client_visibility_requested:
          selectedDocumentType === "extrajudicial" && clientVisibilityRequested,
        client_download_requested:
          selectedDocumentType === "extrajudicial" && clientDownloadRequested,
      };
      const prepared = await prepareClientDocumentsBulkUploadAction(
        payload,
        files.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
        })),
      );

      if (!prepared.ok || !prepared.uploads?.length) {
        setState(prepared);
        return;
      }

      const supabase = createClient();
      const uploadedPaths: string[] = [];

      for (const upload of prepared.uploads) {
        const file = files[upload.index];

        if (!file) {
          await cancelClientDocumentsBulkUploadAction(uploadedPaths);
          setState({
            ok: false,
            message: "Um arquivo selecionado não foi encontrado. Selecione novamente.",
          });
          return;
        }

        const { error } = await supabase.storage
          .from("client-documents")
          .uploadToSignedUrl(upload.filePath, upload.token, file, {
            contentType: upload.mimeType || file.type || "application/octet-stream",
          });

        if (error) {
          await cancelClientDocumentsBulkUploadAction(uploadedPaths);
          setState({
            ok: false,
            message: getFriendlyUploadError(error.message),
          });
          return;
        }

        uploadedPaths.push(upload.filePath);
      }

      const result = await completeClientDocumentsBulkUploadAction(
        {
          ...payload,
        },
        prepared.uploads,
      );
      setState(result);

      if (result.ok) {
        resetForm();
        const fileInput = globalThis.document.getElementById(
          `client-document-file-${preSaleId ?? "client"}-${selectedDocumentType}`,
        ) as HTMLInputElement | null;

        if (fileInput) {
          fileInput.value = "";
        }

        router.refresh();
      }
    });
  }

  return (
    <form
      className="space-y-4 rounded-[10px] border border-[var(--ns-border)] bg-[var(--ns-surface)] p-5 shadow-none"
      onSubmit={handleSubmit}
    >
      <div>
        <h3 className="text-sm font-semibold text-[var(--ns-text)]">Adicionar documento em massa</h3>
        <p className="mt-1 text-sm text-[var(--ns-muted)]">{hintText}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {fixedDocumentType ? (
          <div className="space-y-2">
            <FormFieldLabel label="Tipo do documento" requirement="required" />
            <div className="rounded-[8px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt)] px-3 py-2.5 text-sm font-semibold text-[var(--ns-text)]">
              {selectedDocumentTypeLabel}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <FormFieldLabel
              htmlFor="document_type"
              label="Tipo do documento"
              requirement="required"
            />
            <select
              id="document_type"
              value={documentType}
              disabled={isPending}
              className="w-full cursor-pointer rounded-[8px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt)] px-3 py-2.5 text-sm text-[var(--ns-text)] outline-none transition focus:border-[var(--ns-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ns-primary)_18%,transparent)]"
              onChange={(event) =>
                setDocumentType(event.target.value as (typeof clientDocumentTypes)[number]["value"])
              }
            >
              {clientDocumentTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-2">
          <FormFieldLabel
            htmlFor={`client-document-file-${preSaleId ?? "client"}-${selectedDocumentType}`}
            label="Arquivo"
            requirement="required"
          />
          <input
            id={`client-document-file-${preSaleId ?? "client"}-${selectedDocumentType}`}
            type="file"
            multiple
            disabled={isPending}
            accept={clientDocumentAcceptedInputTypes}
            className="w-full cursor-pointer rounded-[8px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt)] px-3 py-2 text-sm text-[var(--ns-text)] file:mr-3 file:cursor-pointer file:rounded-[6px] file:border-0 file:bg-[var(--ns-primary)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:opacity-90"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          {files.length ? (
            <p className="text-xs text-slate-500">
              {files.length} arquivo(s) selecionado(s).
            </p>
          ) : null}
        </div>

        {!preSaleId && selectedDocumentType === "extrajudicial" ? (
          <div className="space-y-2 md:col-span-2">
            <FormFieldLabel
              htmlFor="document_pre_sale_id"
              label="Pré-venda / protocolo"
              requirement={clientVisibilityRequested ? "required" : "optional"}
              hint="O vínculo garante que o arquivo apareça somente na consulta deste protocolo."
            />
            <select
              id="document_pre_sale_id"
              value={selectedPreSaleId}
              disabled={isPending}
              onChange={(event) => setSelectedPreSaleId(event.target.value)}
              className="w-full rounded-[8px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt)] px-3 py-2.5 text-sm text-[var(--ns-text)] outline-none transition focus:border-[var(--ns-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ns-primary)_18%,transparent)]"
            >
              <option value="">Selecione uma pré-venda</option>
              {preSales.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.tracking_protocol || "Sem protocolo"}
                  {item.service_type ? ` | ${item.service_type}` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-2">
          <FormFieldLabel htmlFor="title" label="Título" requirement="optional" />
          <input
            id="title"
            value={title}
            disabled={isPending}
            className="w-full rounded-[8px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt)] px-3 py-2.5 text-sm text-[var(--ns-text)] outline-none transition focus:border-[var(--ns-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ns-primary)_18%,transparent)]"
            placeholder="Opcional para envio único. Em massa, o nome do arquivo vira título."
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <FormFieldLabel
            htmlFor="description"
            label="Descrição"
            requirement="optional"
          />
          <input
            id="description"
            value={description}
            disabled={isPending}
            className="w-full rounded-[8px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt)] px-3 py-2.5 text-sm text-[var(--ns-text)] outline-none transition focus:border-[var(--ns-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ns-primary)_18%,transparent)]"
            placeholder="Observação opcional"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      {selectedDocumentType === "extrajudicial" ? (
        <section className="rounded-[8px] border border-[color-mix(in_srgb,var(--ns-primary)_30%,var(--ns-border))] bg-[color-mix(in_srgb,var(--ns-primary)_8%,var(--ns-surface))] p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--ns-surface)] text-[var(--ns-primary)] shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h4 className="text-sm font-semibold text-[var(--ns-text)]">Acesso do cliente</h4>
              <p className="mt-1 text-xs leading-5 text-[var(--ns-muted)]">
                Cada opção solicitada ficará pendente até a aprovação da Gestão.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--ns-border)] bg-[var(--ns-surface)] p-3 transition hover:bg-[var(--ns-surface-alt)]">
              <input
                type="checkbox"
                checked={clientVisibilityRequested}
                disabled={isPending}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setClientVisibilityRequested(checked);
                  if (!checked) setClientDownloadRequested(false);
                }}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--ns-text)]">
                  <Eye className="h-4 w-4 text-teal-700" />
                  Mostrar que o arquivo existe
                </span>
                <span className="mt-1 block text-xs leading-5 text-[var(--ns-muted)]">
                  O cliente verá o título e a situação do documento.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--ns-border)] bg-[var(--ns-surface)] p-3 transition hover:bg-[var(--ns-surface-alt)]">
              <input
                type="checkbox"
                checked={clientDownloadRequested}
                disabled={isPending}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setClientDownloadRequested(checked);
                  if (checked) setClientVisibilityRequested(true);
                }}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--ns-text)]">
                  <Download className="h-4 w-4 text-teal-700" />
                  Permitir download
                </span>
                <span className="mt-1 block text-xs leading-5 text-[var(--ns-muted)]">
                  Inclui a visualização e libera o arquivo após aprovação.
                </span>
              </span>
            </label>
          </div>
        </section>
      ) : null}

      <p className="text-xs text-slate-500">
        Formatos aceitos: {clientDocumentAcceptedFormatsLabel}. Tamanho maximo: 20 MB.
      </p>

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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={disabled}
          className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Enviando..." : files.length > 1 ? "Enviar documentos" : "Enviar documento"}
        </button>
      </div>
    </form>
  );
}
