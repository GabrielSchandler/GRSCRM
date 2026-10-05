"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { ManagementMetric } from "./management-ui";

export function OnlineUsersMetric({ activeCount }: { activeCount: number | null }) {
  const [online, setOnline] = useState<number | null>(null);
  const [status, setStatus] = useState("Consultando presença");

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/management/presence", { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok || typeof result.online !== "number") {
          setOnline(null);
          setStatus(result.schemaMissing ? "Presença não configurada" : "Presença indisponível");
          return;
        }
        setOnline(result.online);
        setStatus("Online nos últimos 90 segundos");
      } catch {
        if (!controller.signal.aborted) {
          setOnline(null);
          setStatus("Presença indisponível");
        }
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return <ManagementMetric label="Usuários online" value={online ?? "Indisponível"} icon={Users}
    detail={`${activeCount === null ? "Contas ativas indisponíveis" : `${activeCount} usuários ativos`} · ${status}`} />;
}
