import { boardLabelsFromViewModel } from "../constants/hotelRequestBoardOptions";

/**
 * HTML imprimable pour une demande hôtel (formulaire public).
 */
export function generateHotelRequestHTML(request) {
  const fullName = [request.firstName, request.lastName].filter(Boolean).join(" ").trim() || "—";
  const wantsOffer = request.wantsCustomOffer === true;
  const hotels = wantsOffer
    ? []
    : [request.hotelOption1, request.hotelOption2, request.hotelOption3].filter((h) =>
        String(h || "").trim()
      );
  const createdLabel = request.createdAt
    ? new Date(request.createdAt).toLocaleString("fr-FR")
    : "—";
  const boardLabels = boardLabelsFromViewModel(request);
  const boardHtml =
    boardLabels.length > 0
      ? boardLabels.map((l) => escapeHtml(l)).join(", ")
      : "—";

  const hotelRows = wantsOffer
    ? `<tr><td colspan="2" style="padding:8px 12px;border:1px solid #fde68a;background:#fffbeb;font-weight:600;">Je n'ai pas de choix d'hôtel — faites-moi une offre</td></tr>`
    : hotels.length > 0
      ? hotels
          .map(
            (name, i) =>
              `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">Choix ${i + 1}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(name)}</td></tr>`
          )
          .join("")
      : `<tr><td colspan="2" style="padding:8px 12px;border:1px solid #e2e8f0;">—</td></tr>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Demande hôtel — ${escapeHtml(fullName)}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 24px; line-height: 1.45; }
    h1 { font-size: 22px; margin: 0 0 8px; color: #312e81; }
    .meta { font-size: 13px; color: #64748b; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 14px; }
    .notes { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; white-space: pre-wrap; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>Demande hôtel — Hurghada Dream</h1>
  <p class="meta">Reçue le ${escapeHtml(createdLabel)} · Réf. #${escapeHtml(String(request.id || ""))}</p>

  <table>
    <tbody>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;width:32%;">Nom</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(request.lastName || "—")}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">Prénom</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(request.firstName || "—")}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">Téléphone</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(request.phone || "—")}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">E-mail</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(request.email || "—")}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">Budget</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(request.budget?.trim() ? request.budget : "—")}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">Formule</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${boardHtml}</td></tr>
    </tbody>
  </table>

  <h2 style="font-size:16px;margin:20px 0 8px;color:#4338ca;">Hôtels souhaités</h2>
  <table>
    <tbody>${hotelRows}</tbody>
  </table>

  <h2 style="font-size:16px;margin:20px 0 8px;color:#4338ca;">Notes</h2>
  <div class="notes">${escapeHtml(request.notes?.trim() ? request.notes : "—")}</div>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Ouvre la fenêtre d’impression navigateur. */
export function printHotelRequest(request) {
  const html = generateHotelRequestHTML(request);
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
  return true;
}
