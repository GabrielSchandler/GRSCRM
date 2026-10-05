export function isCompanyBlocked(status: string | null | undefined) {
  return status === "suspended" || status === "cancelled";
}

export function restorationDeadline(deletedAt: string) {
  const date = new Date(deletedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Data de exclusão inválida.");
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 3);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

export function canRestoreCompany(deadline: string | null | undefined, now = new Date()) {
  return Boolean(deadline && new Date(deadline).getTime() > now.getTime());
}
