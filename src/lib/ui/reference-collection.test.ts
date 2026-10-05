import { describe, expect, it } from "vitest";
import { getCollectionWindow } from "./reference-collection";

const rows = Array.from({ length: 10 }, (_, index) => ({
  id: String(index), search: index === 0 ? "João Simulação" : `Registro ${index}`,
  type: index % 2 ? "Template" : "Contrato", status: index < 5 ? "Ativo" : "Inativo",
}));
const defaults = { query: "", type: "", status: "", page: 0, selectedId: "0" };

describe("reference collection", () => {
  it("searches case and accent insensitive without changing records", () => {
    expect(getCollectionWindow(rows, { ...defaults, query: " JOAO " }).filtered).toEqual([rows[0]]);
  });
  it("combines type and status filters", () => {
    expect(getCollectionWindow(rows, { ...defaults, type: "Template", status: "Ativo" }).filtered.map(row => row.id)).toEqual(["1", "3"]);
  });
  it("clamps pages when filters reduce the list", () => {
    const result = getCollectionWindow(rows, { ...defaults, type: "Contrato", page: 5 });
    expect(result.currentPage).toBe(0);
    expect(result.visible).toHaveLength(5);
  });
  it("paginates by eight and keeps the selection", () => {
    const result = getCollectionWindow(rows, { ...defaults, page: 1, selectedId: "9" });
    expect(result.pages).toBe(2);
    expect(result.visible.map(row => row.id)).toEqual(["8", "9"]);
    expect(result.selected?.id).toBe("9");
  });
  it("does not reopen a closed detail panel", () => {
    expect(getCollectionWindow(rows, { ...defaults, selectedId: null }).selected).toBeUndefined();
  });
  it("falls back to a visible record when the selection is filtered out", () => {
    expect(getCollectionWindow(rows, { ...defaults, type: "Template" }).selected?.id).toBe("1");
  });
  it("handles an empty list", () => {
    const result = getCollectionWindow([], defaults);
    expect(result.pages).toBe(1);
    expect(result.visible).toEqual([]);
    expect(result.selected).toBeUndefined();
  });
});
