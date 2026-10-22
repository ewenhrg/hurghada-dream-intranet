import { supabase } from "../lib/supabase";
import { saveQuotesCache } from "../utils";
import { persistQuoteItemsToSupabase } from "./persistQuoteItems";

/** Commentaire interne d’une ligne de devis. Absent du copier-coller Situation. */
export async function saveOpsComment(quotes, setQuotes, quoteId, itemIndex, rawText) {
  if (typeof setQuotes !== "function") return { ok: false };
  const quote = (quotes || []).find((item) => String(item.id) === String(quoteId));
  const current = quote?.items?.[itemIndex];
  if (!quote || !current) return { ok: false };
  const next = String(rawText ?? "").trim();
  if (String(current.opsComment || "").trim() === next) return { ok: true, unchanged: true };

  const items = quote.items.map((item, index) =>
    index === itemIndex ? { ...item, opsComment: next } : item
  );
  const updatedAt = new Date().toISOString();
  const updatedQuote = { ...quote, items, updated_at: updatedAt };
  const previous = quotes;
  const nextQuotes = quotes.map((item) => (String(item.id) === String(quote.id) ? updatedQuote : item));
  setQuotes(nextQuotes);
  saveQuotesCache(nextQuotes);

  if (!supabase) return { ok: true };
  const saved = await persistQuoteItemsToSupabase(updatedQuote, items, {
    updatedAt,
    notifyStay: false,
  });
  if (!saved.ok) {
    setQuotes(previous);
    saveQuotesCache(previous);
    return { ok: false, error: saved.error };
  }
  return { ok: true };
}
