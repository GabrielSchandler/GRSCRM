"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";

export function UserPresenceHeartbeat({ userProfileId, companyId }: { userProfileId: string; companyId: string }) {
  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    let pending = false;
    async function heartbeat() {
      if (stopped || pending || document.hidden) return;
      pending = true;
      try {
        // RLS binds this row to the authenticated profile; PostgreSQL supplies the timestamp.
        const { error } = await supabase.from("user_presence").upsert({ user_profile_id: userProfileId, company_id: companyId });
        if (error?.code === "PGRST205" || error?.code === "42P01") stopped = true;
      } catch {
        // A temporary network failure is retried by the next heartbeat.
      } finally {
        pending = false;
      }
    }
    void heartbeat();
    const timer = window.setInterval(heartbeat, 40000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [userProfileId, companyId]);
  return null;
}
