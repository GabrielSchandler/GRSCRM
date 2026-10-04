"use client";

import { LayoutGrid, List } from "lucide-react";
import { useState, type ReactNode } from "react";

type PreSalesWorkspaceProps = {
  board: ReactNode;
  list: ReactNode;
};

export function PreSalesWorkspace({ board, list }: PreSalesWorkspaceProps) {
  const [view, setView] = useState<"board" | "list">("board");

  return (
    <section>
      <div className="mb-4 flex items-center justify-end">
        <div className="inline-flex rounded-[10px] border border-[#DDE2EC] bg-white p-1" aria-label="Visualização">
          <button
            type="button"
            onClick={() => setView("board")}
            aria-pressed={view === "board"}
            className={`inline-flex items-center gap-2 rounded-[7px] px-3 py-2 text-sm font-semibold transition ${
              view === "board" ? "bg-[#5267F5] text-white" : "text-[#56627C] hover:bg-[#EEF1F8]"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Quadro
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            className={`inline-flex items-center gap-2 rounded-[7px] px-3 py-2 text-sm font-semibold transition ${
              view === "list" ? "bg-[#5267F5] text-white" : "text-[#56627C] hover:bg-[#EEF1F8]"
            }`}
          >
            <List className="h-4 w-4" />
            Lista
          </button>
        </div>
      </div>
      {view === "board" ? board : list}
    </section>
  );
}
