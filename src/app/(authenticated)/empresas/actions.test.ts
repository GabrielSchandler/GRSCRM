import { beforeEach, expect, it, vi } from "vitest";
const { context, admin } = vi.hoisted(() => ({ context: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUserContext: context }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: admin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/clients/masks", async () => await import("../../../lib/clients/masks"));
vi.mock("@/lib/company/lifecycle", async () => await import("../../../lib/company/lifecycle"));
vi.mock("@/lib/company/platform-settings", async () => await import("../../../lib/company/platform-settings"));
vi.mock("@/lib/workspace", async () => await import("../../../lib/workspace"));
import { changeCompanyLifecycleAction } from "./actions";
const id = "393baabb-ffb8-4941-8edb-22a4d2950ee7";
const previous = { error: "", success: "" };
function form(operation: string, confirmation = "Empresa") {
  const data = new FormData(); data.set("company_id", id); data.set("operation", operation); data.set("confirmation", confirmation); return data;
}
beforeEach(() => { vi.clearAllMocks(); context.mockResolvedValue({ isPlatformOwner: true, userProfileId: "master" }); });
function setup(masters = 0) {
  const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  const from = vi.fn((table: string) => {
    const value = table === "companies" ? { data: { id, trade_name: "Empresa", legal_name: "Empresa" }, error: null } : table === "user_profiles" ? { count: masters, error: null } : table === "company_lifecycle" ? { data: null, error: null } : { data: { company_id: id }, error: null };
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(value), then: (resolve: (value: object) => unknown) => resolve(value), update };
  });
  const rpc = vi.fn().mockResolvedValue({ error: null });
  admin.mockReturnValue({ from, rpc });
  return { from, rpc, update };
}
it("denies ordinary administrators before creating a privileged client", async () => {
  context.mockResolvedValue({ isPlatformOwner: false, role: "admin" });
  expect((await changeCompanyLifecycleAction(previous, form("archive"))).error).toContain("exclusivo");
  expect(admin).not.toHaveBeenCalled();
});
it("requires exact company-name confirmation before mutating", async () => {
  const { rpc, update } = setup();
  expect((await changeCompanyLifecycleAction(previous, form("archive", "Outra empresa"))).error).toContain("não corresponde");
  expect(rpc).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});
it("protects a company with any master profile", async () => {
  const { rpc, update } = setup(1);
  expect((await changeCompanyLifecycleAction(previous, form("archive"))).error).toContain("operador master");
  expect(rpc).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});
it("archives atomically through the restricted RPC", async () => {
  const { rpc } = setup();
  expect((await changeCompanyLifecycleAction(previous, form("archive"))).error).toBe("");
  expect(rpc).toHaveBeenCalledWith("set_company_archive", { target_company: id, restore_company: false, actor_profile: "master" });
});
it("updates only access status without resetting contracted modules", async () => {
  const { update } = setup();
  expect((await changeCompanyLifecycleAction(previous, form("block"))).error).toBe("");
  expect(update).toHaveBeenCalledWith({ status: "suspended", updated_at: expect.any(String), updated_by: "master" });
});
