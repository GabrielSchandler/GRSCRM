import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/newsec/top-bar";
import { CanaisWhatsapp } from "@/components/newsec/canais-whatsapp";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Números de WhatsApp · GRS",
};

// Conectar número de WhatsApp (QR Code) ao atendimento do CRM. Só administrador ou master.
export default async function CanaisWhatsappPage() {
  const { role, isPlatformOwner, activeCompany } = await getCurrentUserContext();
  if (!(role === "admin" || isPlatformOwner)) redirect("/atendimento");
  const companyName = activeCompany?.trade_name ?? activeCompany?.legal_name ?? "Empresa";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar companyName={companyName} links={[{ href: "/atendimento", label: "← Atendimento" }]} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CanaisWhatsapp />
      </div>
    </div>
  );
}
