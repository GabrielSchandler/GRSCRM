"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ClientDetailTab = {
  id: string;
  label: string;
  description: string;
  count?: number;
};

type ClientDetailTabsProps = {
  tabs: ClientDetailTab[];
  children: ReactNode;
};

const ClientDetailTabsContext = createContext<string>("");

export function ClientDetailTabs({ tabs, children }: ClientDetailTabsProps) {
  const tabIds = useMemo(() => new Set(tabs.map((tab) => tab.id)), [tabs]);
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");

  useEffect(() => {
    const hashTab = window.location.hash.replace("#", "");

    if (hashTab && tabIds.has(hashTab)) {
      setActiveTab(hashTab);
    }
  }, [tabIds]);

  const selectedTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  function selectTab(tabId: string) {
    setActiveTab(tabId);
    window.history.replaceState(null, "", `#${tabId}`);
  }

  if (!selectedTab) {
    return null;
  }

  return (
    <div className="space-y-5">
      <section className="overflow-x-auto">
        <div
          role="tablist"
          aria-label="Seções do cadastro do cliente"
          className="flex min-w-max gap-2"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === selectedTab.id;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`client-tab-panel-${tab.id}`}
                id={`client-tab-${tab.id}`}
                onClick={() => selectTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-[10px] border px-5 py-3 text-sm font-semibold transition ${
                  isActive
                    ? "border-[var(--ns-primary)] bg-[var(--ns-primary)] text-white"
                    : "border-[var(--ns-border)] bg-[var(--ns-surface)] text-[var(--ns-text)] hover:bg-[var(--ns-surface-alt)]"
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === "number" ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-[color-mix(in_srgb,var(--ns-primary)_10%,var(--ns-surface))] text-[var(--ns-primary)]"
                    }`}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <div
        role="tabpanel"
        id={`client-tab-panel-${selectedTab.id}`}
        aria-labelledby={`client-tab-${selectedTab.id}`}
      >
        <ClientDetailTabsContext.Provider value={selectedTab.id}>
          {children}
        </ClientDetailTabsContext.Provider>
      </div>
    </div>
  );
}

export function ClientTabPanel({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const activeTab = useContext(ClientDetailTabsContext);

  if (activeTab !== id) {
    return null;
  }

  return <>{children}</>;
}
