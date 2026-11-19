import html2pdf from "html2pdf.js";

/**
 * Convertit le HTML devis/facture en Blob PDF (sans ouvrir de fenêtre).
 * @param {string} htmlContent
 * @returns {Promise<Blob>}
 */
export async function quoteHtmlToPdfBlob(htmlContent) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-12000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) throw new Error("Impossible de préparer le PDF.");

    doc.open();
    doc.write(htmlContent);
    doc.close();

    await new Promise((resolve) => {
      if (doc.readyState === "complete") {
        window.setTimeout(resolve, 50);
        return;
      }
      iframe.onload = () => window.setTimeout(resolve, 50);
      window.setTimeout(resolve, 400);
    });

    const source = doc.body;
    if (!source) throw new Error("Contenu devis introuvable.");

    // Masquer les boutons d’impression éventuels dans le gabarit.
    source.querySelectorAll(".print-btn, button").forEach((el) => {
      el.style.display = "none";
    });

    const opt = {
      margin: [8, 8, 8, 8],
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };

    const blob = await html2pdf().set(opt).from(source).outputPdf("blob");
    if (!blob || !(blob instanceof Blob)) {
      throw new Error("Génération PDF échouée.");
    }
    return blob;
  } finally {
    iframe.remove();
  }
}

/**
 * Ouvre l’explorateur / lance le téléchargement d’un Blob PDF.
 * @param {Blob} blob
 * @param {string} suggestedName
 */
export async function savePdfBlob(blob, suggestedName) {
  const name = suggestedName.endsWith(".pdf") ? suggestedName : `${suggestedName}.pdf`;

  try {
    if (typeof window.showSaveFilePicker === "function") {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: "PDF",
            accept: { "application/pdf": [".pdf"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { ok: true, method: "picker" };
    }
  } catch (err) {
    if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) {
      return { ok: false, aborted: true };
    }
    // Fallback ci-dessous
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { ok: true, method: "anchor" };
}
