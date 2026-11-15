import { useState } from "react";
import { Printer } from "lucide-react";
import {
  isManualQuoteDraftReady,
  ManualQuoteForm,
  validateManualQuoteDraft,
} from "../components/ManualQuoteForm";
import { supabase } from "../lib/supabase";
import {
  emptyManualClient,
  emptyManualLine,
  normalizeManualLines,
  saveManualQuote,
} from "../utils/manualQuotes";
import { generateManualQuoteHTML } from "../utils/printTemplates";
import { toast } from "../utils/toast.js";

function openPrint(html) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const popup = window.open(url);
  if (!popup) {
    URL.revokeObjectURL(url);
    toast.error("Autorisez les pop-ups pour imprimer.");
    return false;
  }
  window.setTimeout(() => {
    try {
      popup.focus();
      popup.print();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  }, 400);
  return true;
}

export function ManualQuotePage({ user }) {
  const [client, setClient] = useState(() => emptyManualClient());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([emptyManualLine()]);
  const [saving, setSaving] = useState(false);

  const canPrint = isManualQuoteDraftReady(client, lines);

  const handlePrint = async () => {
    const error = validateManualQuoteDraft(client, lines);
    if (error) {
      toast.warning(error);
      return;
    }
    setSaving(true);
    const draft = {
      client,
      note,
      currency: "EUR",
      lines: normalizeManualLines(lines).filter((line) => line.label.trim()),
    };
    const result = await saveManualQuote(supabase, draft, user?.name || "");
    setSaving(false);
    if (!result.ok || !result.quote) {
      toast.error("Impossible d’enregistrer le devis. Réessayez.");
      return;
    }
    openPrint(generateManualQuoteHTML(result.quote));
    toast.success("Devis enregistré et prêt à imprimer.");
    setClient(emptyManualClient());
    setNote("");
    setLines([emptyManualLine()]);
  };

  return (
    <ManualQuoteForm
      client={client}
      setClient={setClient}
      note={note}
      setNote={setNote}
      lines={lines}
      setLines={setLines}
      footer={
        <button
          type="button"
          onClick={() => void handlePrint()}
          disabled={!canPrint || saving}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white disabled:opacity-40"
        >
          <Printer className="size-4" aria-hidden />
          {saving ? "Enregistrement…" : "Imprimer"}
        </button>
      }
    />
  );
}
