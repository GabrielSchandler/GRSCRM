import type { Metadata } from "next";
import { TopBar } from "@/components/newsec/top-bar";
import { ChatInternoWorkspace } from "@/components/newsec/chat-interno-workspace";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Chat interno · GRS",
};

// Conversa entre funcionários. Sem link no menu do CRM antigo (mesma regra do atendimento):
// aparece só na barra lateral do shell novo. Quem lê o quê é decidido pelo banco (RLS, 0010).
export default async function ChatInternoPage() {
  const { userProfileId, activeCompany } = await getCurrentUserContext();
  const companyName = activeCompany?.trade_name ?? activeCompany?.legal_name ?? "Empresa";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar companyName={companyName} />
      <div className="min-h-0 flex-1">
        <ChatInternoWorkspace userProfileId={userProfileId} />
      </div>
    </div>
  );
}
