import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { Notificador } from "@/components/newsec/notificador";
import packageJson from "../../../package.json";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userProfileId, companyId, role, isPlatformOwner } = await getCurrentUserContext();

  return (
    <AuthenticatedShell
      sidebar={<AppSidebar />}
      footer={
        <div className="border-t border-slate-200 bg-white px-6 py-3 text-xs text-slate-500">
          Versao {packageJson.version}
        </div>
      }
    >
      {children}
      {/* Aviso de mensagem nova (WhatsApp e chat interno) também nas telas do CRM antigo. */}
      <Notificador userProfileId={userProfileId} companyId={companyId} supervisiona={role === "admin" || role === "manager" || Boolean(isPlatformOwner)} oferecerAvisoWindows />
    </AuthenticatedShell>
  );
}
