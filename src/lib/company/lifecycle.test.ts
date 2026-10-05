import { describe, expect, it } from "vitest";
import { canRestoreCompany, isCompanyBlocked, restorationDeadline } from "./lifecycle";

describe("company lifecycle", () => {
  it("blocks only suspended and cancelled companies", () => {
    expect(isCompanyBlocked("active")).toBe(false);
    expect(isCompanyBlocked("trial")).toBe(false);
    expect(isCompanyBlocked("suspended")).toBe(true);
    expect(isCompanyBlocked("cancelled")).toBe(true);
  });
  it("retains data for three calendar months, not ninety days", () => {
    expect(restorationDeadline("2026-10-05T12:00:00.000Z")).toBe("2027-01-05T12:00:00.000Z");
    expect(restorationDeadline("2026-01-31T12:00:00.000Z")).toBe("2026-04-30T12:00:00.000Z");
    expect(restorationDeadline("2023-11-30T12:00:00.000Z")).toBe("2024-02-29T12:00:00.000Z");
  });
  it("does not restore at or after the deadline", () => {
    expect(canRestoreCompany("2027-01-05T12:00:00Z", new Date("2027-01-05T11:59:59Z"))).toBe(true);
    expect(canRestoreCompany("2027-01-05T12:00:00Z", new Date("2027-01-05T12:00:00Z"))).toBe(false);
    expect(canRestoreCompany(null)).toBe(false);
  });
});
