import { beforeEach, expect, it, vi } from "vitest";

const { context } = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUserContext: context }));
import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

function setup(presenceResult: object, role = "admin") {
  const users = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: (resolve: (value: object) => unknown) => resolve({ data: [{ id: "active-user" }], error: null }) };
  const presence = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue(presenceResult) };
  const from = vi.fn((table: string) => table === "user_profiles" ? users : presence);
  context.mockResolvedValue({ supabase: { from }, companyId: "tenant", role, isPlatformOwner: false });
  return { users, presence, from };
}

it("scopes presence to the tenant, active profiles and recent heartbeats", async () => {
  const { users, presence } = setup({ data: [{ user_profile_id: "active-user" }], count: 1, error: null });
  const response = await GET();
  expect(await response.json()).toEqual({ online: 1 });
  expect(users.eq).toHaveBeenCalledWith("company_id", "tenant");
  expect(users.eq).toHaveBeenCalledWith("is_active", true);
  expect(presence.eq).toHaveBeenCalledWith("company_id", "tenant");
  expect(presence.in).toHaveBeenCalledWith("user_profile_id", ["active-user"]);
  const cutoff = presence.gte.mock.calls[0][1];
  expect(Date.now() - new Date(cutoff).getTime()).toBeGreaterThanOrEqual(90000);
  expect(Date.now() - new Date(cutoff).getTime()).toBeLessThan(92000);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it("reports a missing migration instead of inventing zero online users", async () => {
  setup({ data: null, count: null, error: { code: "PGRST205" } });
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Presença indisponível", schemaMissing: true });
});

it("returns zero only for a successful empty presence query", async () => {
  setup({ data: [], count: 0, error: null });
  expect(await (await GET()).json()).toEqual({ online: 0 });
});

it("does not expose team presence to a seller", async () => {
  const { from } = setup({ data: [], error: null }, "seller");
  expect((await GET()).status).toBe(403);
  expect(from).not.toHaveBeenCalled();
});
