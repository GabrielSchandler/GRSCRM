import { sanitizeTemplateHtmlContent } from "@/lib/documents/html";

export function DocumentContentPreview({ html }: { html: string | null | undefined }) {
  if (!html?.trim()) return null;
  const content = sanitizeTemplateHtmlContent(html);
  if (!content.trim()) return null;
  return <div aria-label="Prévia do conteúdo do documento" className="reference-document-preview max-h-72 overflow-auto rounded-md border border-[var(--ns-border)]">
    <div dangerouslySetInnerHTML={{ __html: content }} />
  </div>;
}
