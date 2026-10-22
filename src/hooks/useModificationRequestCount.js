import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { setVisibilityAwareInterval } from "../utils/idle";

export function useModificationRequestCount({ enabled = false } = {}) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled || !supabase) {
      setCount(0);
      return;
    }
    const { count: pending, error } = await supabase
      .from("public_modification_requests")
      .select("id", { count: "exact", head: true })
      .eq("site_key", SITE_KEY)
      .eq("status", "pending");
    if (!error) setCount(pending || 0);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !supabase) {
      setCount(0);
      return undefined;
    }
    void refresh();
    const channel = supabase
      .channel("modification-requests-nav")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "public_modification_requests", filter: `site_key=eq.${SITE_KEY}` },
        () => {
          void refresh();
        }
      )
      .subscribe();
    const stopInterval = setVisibilityAwareInterval(() => {
      void refresh();
    }, 30_000);
    return () => {
      stopInterval();
      supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);

  return count;
}
