import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getQuotesRealtimeSiteKeyFilter } from "../constants";
import {
  fetchPendingPublicQuotesCount,
  isPublicQuotePending,
  playPublicQuoteChime,
} from "../utils/publicQuoteInbox";

/**
 * Compte les demandes catalogue encore en attente et joue un son à chaque nouvelle arrivée.
 */
export function usePublicQuotesInbox({ enabled = false } = {}) {
  const [pendingCount, setPendingCount] = useState(0);
  const knownIdsRef = useRef(new Set());
  const primedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setPendingCount(0);
      return;
    }
    const { count, ids } = await fetchPendingPublicQuotesCount();
    ids.forEach((id) => knownIdsRef.current.add(id));
    setPendingCount(count);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !supabase) {
      primedRef.current = false;
      knownIdsRef.current = new Set();
      setPendingCount(0);
      return undefined;
    }

    let cancelled = false;

    const bootstrap = async () => {
      await refresh();
      if (!cancelled) primedRef.current = true;
    };
    bootstrap();

    const channel = supabase
      .channel("public-quotes-inbox-nav")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "public_quotes",
          filter: getQuotesRealtimeSiteKeyFilter(),
        },
        (payload) => {
          if (payload.eventType === "INSERT" && payload.new?.id != null) {
            const id = String(payload.new.id);
            const isNew = !knownIdsRef.current.has(id);
            knownIdsRef.current.add(id);
            if (primedRef.current && isNew && isPublicQuotePending(payload.new)) {
              playPublicQuoteChime();
            }
          }
          if (payload.eventType === "DELETE" && payload.old?.id != null) {
            knownIdsRef.current.delete(String(payload.old.id));
          }
          void refresh();
        }
      )
      .subscribe();

    const intervalId = setInterval(() => {
      void refresh();
    }, 30_000);

    const onLocalChange = () => {
      void refresh();
    };
    window.addEventListener("hd-public-quote-inbox-changed", onLocalChange);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener("hd-public-quote-inbox-changed", onLocalChange);
      supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);

  return { pendingCount, refreshPendingCount: refresh };
}
