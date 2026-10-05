"use client";

import { useActionState, useState } from "react";
import { Lock, Unlock, Trash2, RotateCcw } from "lucide-react";
import { changeCompanyLifecycleAction } from "@/app/(authenticated)/empresas/actions";
import { canRestoreCompany } from "@/lib/company/lifecycle";

export function CompanyLifecycleControls({ companyId, name, status, deletedAt, deadline, archiveReady, protectedCompany }: {
  companyId: string; name: string; status: string; deletedAt?: string | null; deadline?: string | null; archiveReady: boolean; protectedCompany: boolean;
}) {
  const [operation, setOperation] = useState<string | null>(null);
  const [state, action, pending] = useActionState(changeCompanyLifecycleAction, { error: "", success: "" });
  const archived = Boolean(deletedAt);
  return <div className="space-y-3 border-t border-[var(--ns-border)] pt-4">
    <h3 className="text-xs font-semibold">Controle de acesso</h3>
    {archived && <p className="text-xs leading-5 text-[var(--ns-warning)]">Recuperação disponível até {deadline ? new Date(deadline).toLocaleString("pt-BR") : "data indisponível"}.</p>}
    {protectedCompany ? <p className="text-xs text-[var(--ns-text-secondary)]">Empresa vinculada ao operador master: bloqueio e exclusão protegidos.</p> : <div className="flex flex-wrap gap-2">
      {!archived && <button onClick={() => setOperation(status === "suspended" || status === "cancelled" ? "unblock" : "block")} className="inline-flex items-center gap-2 rounded-md border border-[var(--ns-border)] px-3 py-2 text-xs">{status === "suspended" || status === "cancelled" ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{status === "suspended" || status === "cancelled" ? "Desbloquear" : "Bloquear"}</button>}
      {!archived && <button disabled={!archiveReady} onClick={() => setOperation("archive")} className="inline-flex items-center gap-2 rounded-md border border-[var(--ns-danger)] px-3 py-2 text-xs text-[var(--ns-danger)]"><Trash2 className="h-4 w-4" />Excluir empresa</button>}
      {archived && <button disabled={!canRestoreCompany(deadline)} onClick={() => setOperation("restore")} className="inline-flex items-center gap-2 rounded-md border border-[var(--ns-border)] px-3 py-2 text-xs text-[var(--ns-primary)]"><RotateCcw className="h-4 w-4" />Restaurar empresa</button>}
    </div>}
    {operation && <form action={action} className="space-y-3 rounded-md border border-[var(--ns-border)] p-3">
      <input type="hidden" name="company_id" value={companyId} /><input type="hidden" name="operation" value={operation} />
      <p className="text-xs leading-5">{operation === "archive" ? "A empresa perderá acesso ao CRM. Seus dados poderão ser recuperados por três meses; depois desse prazo a exclusão definitiva será processada." : operation === "block" ? "O acesso dos usuários desta empresa será bloqueado, sem apagar dados." : "O acesso será reativado conforme o status da empresa."}</p>
      <label className="block text-xs">Digite <strong>{name}</strong> para confirmar<input name="confirmation" required autoComplete="off" className="mt-2 w-full" /></label>
      <div className="flex gap-2"><button disabled={pending} type="submit" className="rounded-md bg-[var(--ns-primary)] px-3 py-2 text-xs text-[var(--ns-primary-foreground)]">{pending ? "Processando..." : "Confirmar"}</button><button type="button" disabled={pending} onClick={() => setOperation(null)} className="rounded-md border border-[var(--ns-border)] px-3 py-2 text-xs">Cancelar</button></div>
    </form>}
    {state.error && <p role="alert" className="text-xs text-[var(--ns-danger)]">{state.error}</p>}{state.success && <p role="status" className="text-xs text-[var(--ns-success)]">{state.success}</p>}
  </div>;
}
