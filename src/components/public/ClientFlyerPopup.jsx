import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { X } from "lucide-react";
import { fetchActiveClientFlyer } from "../../utils/clientFlyer";

/** Fenêtre affichée à chaque ouverture de l’application, fermable par la croix. */
export function ClientFlyerPopup() {
  const [flyer, setFlyer] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function showIfActive() {
      const row = await fetchActiveClientFlyer();
      if (cancelled) return;
      if (!row) {
        setFlyer(null);
        setOpen(false);
        return;
      }
      setFlyer(row);
      setOpen(true);
    }

    void showIfActive();

    if (!Capacitor.isNativePlatform()) {
      return () => {
        cancelled = true;
      };
    }

    let listener;
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void showIfActive();
    }).then((handle) => {
      if (cancelled) {
        handle.remove();
        return;
      }
      listener = handle;
    });

    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !flyer) return null;

  const description = String(flyer.description || "").trim();

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70 p-4 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Information Hurghada Dream"
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fermer"
          className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-white/95 text-slate-800 shadow-md"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        <img
          src={flyer.image_url}
          alt={description || "Flyer Hurghada Dream"}
          className="max-h-[58vh] w-full bg-slate-100 object-contain"
        />
        {description ? (
          <p className="px-5 py-4 text-sm leading-relaxed text-slate-800">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
