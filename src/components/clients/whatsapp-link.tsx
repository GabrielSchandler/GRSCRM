import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { onlyDigits } from "@/lib/clients/masks";

type WhatsAppLinkProps = {
  phone: string | null;
  label?: string;
  className?: string;
};

export function WhatsAppLink({ phone, label = "WhatsApp", className }: WhatsAppLinkProps) {
  const telefone = onlyDigits(phone);

  if (!telefone) {
    return null;
  }

  return (
    <Link
      href={`/atendimento?telefone=${encodeURIComponent(telefone)}`}
      title="Abrir a conversa deste cliente no Atendimento"
      className={
        className ??
        "inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-white px-4 py-2.5 text-sm font-semibold text-teal-700 transition hover:bg-teal-50"
      }
    >
      <MessageCircle className="h-4 w-4" />
      {label}
    </Link>
  );
}
