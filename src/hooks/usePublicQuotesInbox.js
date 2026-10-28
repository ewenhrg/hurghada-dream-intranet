import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { setVisibilityAwareInterval } from "../utils/idle";
import { getQuotesRealtimeSiteKeyFilter } from "../constants";
import {
  PUBLIC_QUOTE_ALERT_REPEAT_MS,
  alertPublicQuotePending,
  fetchPendingPublicQuotesCount,
  isPublicQuotePending,
  pulsePublicQuoteDocumentTitle,
} from "../utils/publicQuoteInbox";

/**
 * Compte les demandes catalogue encore en attente, notifie à chaque arrivée,
 * et rejoue l’alarme chaque minute tant qu’il reste des demandes non traitées.
 */
export function usePublicQuotesInbox({ enabled = false } = {}) {
  const [pendingCount, setPendingCount] = useState(0);
  const knownIdsRef = useRef(new Set());
  const primedRef = useRef(false);
  const pendingCountRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setPendingCount(0);
      pendingCountRef.current = 0;
      pulsePublicQuoteDocumentTitle(0);
      return;
    }
    const { count, ids } = await fetchPendingPublicQuotesCount();
    ids.forEach((id) => knownIdsRef.current.add(id));
    pendingCountRef.current = count;
    setPendingCount(count);
    pulsePublicQuoteDocumentTitle(count);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !supabase) {
      primedRef.current = false;
      knownIdsRef.current = new Set();
      pendingCountRef.current = 0;
      setPendingCount(0);
      pulsePublicQuoteDocumentTitle(0);
      return undefined;
    }

    let cancelled = false;

    const bootstrap = async () => {
      await refresh();
      if (cancelled) return;
      primedRef.current = true;
      // Déjà des demandes en attente au chargement → alerter tout de suite.
      if (pendingCountRef.current > 0) {
        alertPublicQuotePending(pendingCountRef.current, { urgent: true });
      }
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
              const nextCount = Math.max(1, pendingCountRef.current + 1);
              alertPublicQuotePending(nextCount, { urgent: true });
            }
          }
          if (payload.eventType === "DELETE" && payload.old?.id != null) {
            knownIdsRef.current.delete(String(payload.old.id));
          }
          void refresh();
        }
      )
      .subscribe();

    // Sondage léger : onglet caché → pause (Realtime couvre l’immédiat).
    const stopInterval = setVisibilityAwareInterval(() => {
      void refresh();
    }, 30_000);

    // Alarme répétée même onglet en arrière-plan (setInterval classique).
    const alertTimer = window.setInterval(() => {
      const n = pendingCountRef.current;
      if (n > 0) {
        alertPublicQuotePending(n, { urgent: true });
      }
    }, PUBLIC_QUOTE_ALERT_REPEAT_MS);

    const onLocalChange = () => {
      void refresh();
    };
    window.addEventListener("hd-public-quote-inbox-changed", onLocalChange);

    return () => {
      cancelled = true;
      stopInterval();
      window.clearInterval(alertTimer);
      window.removeEventListener("hd-public-quote-inbox-changed", onLocalChange);
      supabase.removeChannel(channel);
      pulsePublicQuoteDocumentTitle(0);
    };
  }, [enabled, refresh]);

  return { pendingCount, refreshPendingCount: refresh };
}
