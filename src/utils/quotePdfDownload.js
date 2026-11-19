import html2pdf from "html2pdf.js";

function waitForDocumentReady(doc, iframe) {
  return new Promise((resolve) => {
    const finish = () => window.setTimeout(resolve, 80);
    if (doc.readyState === "complete") {
      finish();
      return;
    }
    iframe.onload = finish;
    window.setTimeout(resolve, 600);
  });
}

function waitForImages(doc) {
  const images = Array.from(doc.images || []);
  if (!images.length) return Promise.resolve();
  return Promise.all(
    images.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          window.setTimeout(done, 2000);
        })
    )
  );
}

/**
 * Force le rendu « impression » dans l’iframe (sinon html2pdf capture le style écran :
 * fond gris, ombre, paddings différents du PDF Imprimer).
 */
function applyPrintLook(doc) {
  doc.querySelectorAll("style").forEach((styleEl) => {
    const css = styleEl.textContent || "";
    styleEl.textContent = css.replace(/@media\s+print\s*\{/gi, "@media screen, print {");
  });

  const force = doc.createElement("style");
  force.setAttribute("data-hd-print-force", "1");
  force.textContent = `
    html, body {
      background: #ffffff !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .quote-container {
      box-shadow: none !important;
      border-radius: 0 !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 20px !important;
    }
    .print-btn, button.print-btn, button[onclick*="print"] {
      display: none !important;
    }
    tbody tr:hover {
      background: transparent !important;
    }
  `;
  doc.head.appendChild(force);
}

/**
 * Convertit le HTML devis (même gabarit que Imprimer) en Blob PDF.
 * @param {string} htmlContent
 * @returns {Promise<Blob>}
 */
export async function quoteHtmlToPdfBlob(htmlContent) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  // Largeur proche A4 à 96dpi pour coller au flux impression navigateur.
  iframe.style.cssText =
    "position:fixed;left:-14000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) throw new Error("Impossible de préparer le PDF.");

    doc.open();
    doc.write(htmlContent);
    doc.close();

    await waitForDocumentReady(doc, iframe);
    applyPrintLook(doc);
    await waitForImages(doc);

    const source = doc.querySelector(".quote-container") || doc.body;
    if (!source) throw new Error("Contenu devis introuvable.");

    const opt = {
      // Marges proches du défaut navigateur à l’impression (pas de double marge).
      margin: [10, 10, 10, 10],
      filename: "devis.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        windowWidth: 794,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };

    const worker = html2pdf().set(opt).from(source);
    const blob = await worker.outputPdf("blob");
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

/**
 * Même pipeline que le bouton Imprimer (rendu 100 % identique).
 * Utile en secours si la génération Blob échoue.
 */
export function openQuotePrintDocument(htmlContent, documentTitle = "Devis") {
  const newWindow = window.open("", "_blank");
  if (!newWindow) {
    return { ok: false, blocked: true };
  }
  newWindow.document.open();
  newWindow.document.write(htmlContent);
  newWindow.document.title = documentTitle;
  newWindow.document.close();
  window.setTimeout(() => {
    try {
      newWindow.focus();
      newWindow.print();
    } catch {
      /* ignore */
    }
  }, 500);
  return { ok: true };
}
