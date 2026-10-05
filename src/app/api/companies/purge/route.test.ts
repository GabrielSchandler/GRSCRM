import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: admin }));
import { GET } from "./route";

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "test-secret"); vi.stubEnv("COMPANY_PURGE_ENABLED", "false"); });
afterEach(() => vi.unstubAllEnvs());
it("rejects calls without cron credentials before accessing the database", async () => {
  expect((await GET(new Request("http://localhost/api/companies/purge"))).status).toBe(401);
  expect(admin).not.toHaveBeenCalled();
});
it("never runs without an explicit enable flag", async () => {
  const response = await GET(new Request("http://localhost/api/companies/purge", { headers: { authorization: "Bearer test-secret" } }));
  expect(await response.json()).toEqual({ enabled: false });
  expect(admin).not.toHaveBeenCalled();
});
it("rejects an unset secret even when a bearer header is supplied", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(new Request("http://localhost/api/companies/purge", { headers: { authorization: "Bearer " } }))).status).toBe(401);
});
it("does not delete storage or database records when the purge claim fails", async () => {
  vi.stubEnv("COMPANY_PURGE_ENABLED", "true");
  const read = { select: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [{ company_id: "tenant" }], error: null }) };
  const write = { eq: vi.fn().mockResolvedValue({ error: null }) };
  const from = vi.fn(() => ({ ...read, update: vi.fn(() => write) }));
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "Retention has not expired" } });
  const storage = { from: vi.fn() };
  admin.mockReturnValue({ from, rpc, storage });
  const response = await GET(new Request("http://localhost/api/companies/purge", { headers: { authorization: "Bearer test-secret" } }));
  expect(response.status).toBe(503);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(storage.from).not.toHaveBeenCalled();
});
