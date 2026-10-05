"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

type Selection = { leadIds: string[]; selected: Set<string>; toggle: (id: string, checked: boolean) => void; toggleAll: (checked: boolean) => void };
const SelectionContext = createContext<Selection | null>(null);

export function LeadSelection({ leadIds, children }: { leadIds: string[]; children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggle(id: string, checked: boolean) {
    setSelected(previous => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  return <SelectionContext.Provider value={{ leadIds, selected, toggle, toggleAll: checked => setSelected(new Set(checked ? leadIds : [])) }}>{children}</SelectionContext.Provider>;
}

function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) throw new Error("Lead selection requires its provider");
  return context;
}

const checkboxClass = "h-4 w-4 cursor-pointer rounded border-[var(--ns-border)] accent-[var(--ns-primary)]";

export function SelectAllLeadsCheckbox() {
  const { leadIds, selected, toggleAll } = useSelection();
  const input = useRef<HTMLInputElement>(null);
  const count = leadIds.filter(id => selected.has(id)).length;
  const all = leadIds.length > 0 && count === leadIds.length;
  const mixed = count > 0 && !all;
  useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
  return <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap normal-case">
    <input ref={input} type="checkbox" aria-label="Selecionar todos os leads da lista" aria-checked={mixed ? "mixed" : all}
      checked={all} disabled={!leadIds.length} onChange={event => toggleAll(event.target.checked)} className={checkboxClass} />
    <span>Todos</span>
  </label>;
}

export function LeadSelectionCheckbox({ id, name }: { id: string; name: string }) {
  const { selected, toggle } = useSelection();
  return <input type="checkbox" name="lead_id" value={id} aria-label={`Selecionar lead ${name}`} checked={selected.has(id)}
    onChange={event => toggle(id, event.target.checked)} className={checkboxClass} />;
}
