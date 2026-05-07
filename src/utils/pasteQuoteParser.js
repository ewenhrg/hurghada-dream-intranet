import { mergePublicSavedLineIntoQuoteItem, createBlankQuoteLine } from "./publicQuoteToDraft";

const MONTHS_FR = {
  janvier: 1,
  "janv.": 1,
  février: 2,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  "sept.": 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
  decembre: 12,
};

function normalizeForMatch(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSimilarity(label, activityName) {
  const na = normalizeForMatch(label);
  const nb = normalizeForMatch(activityName);
  if (!na || !nb) return 0;
  if (na.includes(nb) || nb.includes(na)) return 0.92;
  const ta = new Set(na.split(/\s+/).filter((t) => t.length > 1));
  const tb = new Set(nb.split(/\s+/).filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter++;
  }
  return inter / Math.max(ta.size, tb.size, 1);
}

function bestActivityForLabel(label, activities) {
  let best = null;
  let bestScore = 0;
  for (const act of activities) {
    const name = act?.name;
    if (!name || String(name).trim() === "") continue;
    const score = tokenSimilarity(label, name);
    if (score > bestScore) {
      bestScore = score;
      best = act;
    }
  }
  const threshold = 0.32;
  if (!best || bestScore < threshold) return { activity: null, score: bestScore };
  return { activity: best, score: bestScore };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toIsoDate(year, month, day) {
  if (!year || !month || !day) return "";
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * @param {string} text
 * @returns {{ arrival: string, departure: string } | null}
 */
function parseFrenchStayRange(text) {
  const t = String(text || "").trim();
  const re = /(\d{1,2})\s*(?:au|à|-|–|—)\s*(\d{1,2})\s+([a-zA-ZéèêëàâùûôîïçÉÈÊËÀÂÙÛÔÎÏÇ.]+)(?:\s+(\d{4}))?/i;
  const m = t.match(re);
  if (!m) return null;
  const d1 = parseInt(m[1], 10);
  const d2 = parseInt(m[2], 10);
  const monthTok = m[3].toLowerCase().replace(/\.$/, "");
  const monthTokAscii = monthTok.normalize("NFD").replace(/\p{M}/gu, "");
  const month = MONTHS_FR[monthTok] ?? MONTHS_FR[monthTokAscii];
  if (!month || !Number.isFinite(d1) || !Number.isFinite(d2)) return null;
  let year = m[4] ? parseInt(m[4], 10) : new Date().getFullYear();
  if (!m[4]) {
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    if (month < curMonth - 3) year += 1;
  }
  return {
    arrival: toIsoDate(year, month, d1),
    departure: toIsoDate(year, month, d2),
  };
}

function extractLabeledValue(line, prefixRe) {
  const m = line.match(prefixRe);
  return m ? String(m[1] || "").trim() : "";
}

/** Ligne essentiellement un numéro (téléphone). */
function isLikelyPhoneLine(line) {
  const t = String(line || "").trim();
  if (!t || t.length < 8) return false;
  if (/[@:]/.test(t)) return false;
  const d = t.replace(/\D/g, "");
  if (d.length < 10 || d.length > 15) return false;
  const letters = t.replace(/[\d\s+().-]/g, "");
  return letters.length <= 2;
}

function extractEmailFromText(text) {
  const m = String(text).match(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/);
  return m ? m[0] : "";
}

function extractParticipantsCount(text) {
  const m = String(text).match(/(\d+)\s*(?:personnes?|pers\.?|participants?|pax\b)/i);
  if (m) return Math.min(99, Math.max(1, parseInt(m[1], 10) || 0));
  return 0;
}

/**
 * Découpe une ligne d’activité : répétition "(2 fois)", notes entre parenthèses, prix en €.
 */
export function parseActivityLine(rawLine) {
  let line = String(rawLine || "").trim();
  let repeat = 1;
  const notes = [];

  const fois = line.match(/\((\d+)\s*fois\)/i);
  if (fois) {
    repeat = Math.min(20, Math.max(1, parseInt(fois[1], 10) || 1));
    line = line.replace(fois[0], " ").trim();
  }

  const parenAll = [...line.matchAll(/\(([^)]*)\)/g)];
  for (const m of parenAll) {
    const inner = String(m[1] || "").trim();
    if (inner && !/^\d+\s*fois$/i.test(inner)) notes.push(inner);
    line = line.replace(m[0], " ").trim();
  }

  line = line.replace(/\d+(?:[.,]\d+)?\s*€/gi, " ");
  line = line.replace(/\s+à\s+/gi, " ");
  line = line.replace(/\s+/g, " ").trim();

  return { cleanLabel: line, repeat, parenNotes: notes };
}

function findPhoneLineIndex(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (isLikelyPhoneLine(lines[i])) return i;
  }
  return -1;
}

function firstMetadataLineIndex(lines) {
  let idx = lines.length;
  const labeled = (l) =>
    /^(adresse|date\s+de\s+séjour|date\s+de\s+sejour|nombre\s+de\s+participants)\b/i.test(String(l || "").trim());

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l || !l.trim()) continue;
    if (labeled(l)) idx = Math.min(idx, i);
    if (/@/.test(l)) idx = Math.min(idx, i);
  }
  return idx < lines.length ? idx : -1;
}

/**
 * Analyse un texte collé (message client) et produit le même brouillon que les demandes catalogue.
 * @param {string} rawText
 * @param {object[]} activities
 * @returns {{ draft: { client: object, items: object[], notes: string }, warnings: string[] }}
 */
export function buildDraftFromPastedText(rawText, activities) {
  const warnings = [];
  const safeActivities = Array.isArray(activities) ? activities : [];

  const fullText = String(rawText || "");
  const lines = fullText.split(/\r?\n/).map((l) => l.trim());

  const phoneIdx = findPhoneLineIndex(lines);
  let name = "";
  let activityRawLines = [];

  if (phoneIdx >= 0) {
    let nameIdx = phoneIdx - 1;
    while (nameIdx >= 0 && !lines[nameIdx]) nameIdx--;
    if (nameIdx >= 0 && !/@/.test(lines[nameIdx]) && !isLikelyPhoneLine(lines[nameIdx])) {
      name = lines[nameIdx].trim();
    }
    activityRawLines = lines.slice(0, nameIdx >= 0 ? nameIdx : phoneIdx).filter((l) => l);
  } else {
    const emailLineIdx = lines.findIndex((l) => l && /@/.test(l));
    const metaIdx = firstMetadataLineIndex(lines);
    let end = lines.length;
    if (metaIdx >= 0) end = Math.min(end, metaIdx);
    if (emailLineIdx >= 0) end = Math.min(end, emailLineIdx);

    const sliceBefore = lines.slice(0, end).filter((l) => l);
    activityRawLines = sliceBefore;

    if (emailLineIdx >= 0) {
      const beforeEmail = lines.slice(0, emailLineIdx).filter((l) => l);
      if (beforeEmail.length >= 1) {
        const lastBefore = beforeEmail[beforeEmail.length - 1];
        if (
          !/^adresse\b/i.test(lastBefore) &&
          !/^date\s+de\s+séjour/i.test(lastBefore) &&
          !/^date\s+de\s+sejour/i.test(lastBefore) &&
          !/^nombre\s+de\s+participants/i.test(lastBefore) &&
          !isLikelyPhoneLine(lastBefore)
        ) {
          name = lastBefore.trim();
          activityRawLines = beforeEmail.slice(0, -1);
        }
      }
    }
  }

  const phone =
    phoneIdx >= 0
      ? lines[phoneIdx].replace(/\s/g, " ").trim()
      : (() => {
          const m = fullText.match(/(?:\+33|\+20|0)[\d\s.-]{9,}/);
          return m ? m[0].replace(/\s/g, " ").trim() : "";
        })();

  const email = extractEmailFromText(fullText);

  let hotel = "";
  let arrivalDate = "";
  let departureDate = "";
  let adultsGuess = 0;

  for (const l of lines) {
    if (!l) continue;
    const addr = extractLabeledValue(l, /adresse[^:]*:\s*(.+)/i);
    if (addr) hotel = addr;

    const stayRaw = extractLabeledValue(l, /date\s+de\s+séjour\s*:\s*(.+)/i) || extractLabeledValue(l, /date\s+de\s+sejour\s*:\s*(.+)/i);
    if (stayRaw) {
      const range = parseFrenchStayRange(stayRaw);
      if (range) {
        arrivalDate = range.arrival;
        departureDate = range.departure;
      } else warnings.push(`Dates de séjour non reconnues : « ${stayRaw} »`);
    }

    const partRaw = extractLabeledValue(l, /nombre\s+de\s+participants\s*:\s*(.+)/i);
    if (partRaw) {
      const n = extractParticipantsCount(partRaw);
      if (n) adultsGuess = n;
    }
  }

  if (!arrivalDate || !departureDate) {
    const fallback = parseFrenchStayRange(fullText);
    if (fallback) {
      arrivalDate = arrivalDate || fallback.arrival;
      departureDate = departureDate || fallback.departure;
    }
  }
  if (!adultsGuess) adultsGuess = extractParticipantsCount(fullText);

  const defaultDate = arrivalDate || new Date().toISOString().slice(0, 10);
  const adultsStr = adultsGuess > 0 ? String(adultsGuess) : "";

  const items = [];
  const unmatchedForNotes = [];

  for (const rawAct of activityRawLines) {
    const { cleanLabel, repeat, parenNotes } = parseActivityLine(rawAct);
    if (!cleanLabel) continue;

    const { activity, score } = bestActivityForLabel(cleanLabel, safeActivities);
    const extraBits = [...parenNotes].filter(Boolean);
    let extraLabel = extraBits.length ? extraBits.join(" · ") : "";

    if (activity) {
      if (score < 0.55) warnings.push(`Correspondance faible (${(score * 100).toFixed(0)} %) : « ${cleanLabel} » → ${activity.name}`);
    } else {
      unmatchedForNotes.push(rawAct);
      warnings.push(`Aucune activité reconnue pour : « ${cleanLabel} »`);
    }

    const baseLine = mergePublicSavedLineIntoQuoteItem({
      activityId: activity ? String(activity.id || activity.supabase_id || "") : "",
      date: defaultDate,
      adults: adultsStr,
      children: 0,
      babies: 0,
    });
    if (extraLabel) baseLine.extraLabel = extraLabel;
    if (!activity) {
      baseLine.extraLabel = [cleanLabel, baseLine.extraLabel].filter(Boolean).join(" — ");
    }

    const r = Math.min(20, Math.max(1, repeat));
    for (let k = 0; k < r; k++) {
      items.push({ ...baseLine, activityId: baseLine.activityId });
    }
  }

  if (items.length === 0) {
    items.push(createBlankQuoteLine());
    warnings.push("Aucune ligne d’activité détectée — formulaire avec une ligne vide.");
  }

  const notesParts = [];
  if (unmatchedForNotes.length) {
    notesParts.push("Activités (texte client, à rattacher manuellement) :\n- " + unmatchedForNotes.join("\n- "));
  }

  const draft = {
    client: {
      name,
      phone,
      email,
      hotel,
      room: "",
      neighborhood: "",
      arrivalDate,
      departureDate,
    },
    items,
    notes: notesParts.join("\n\n"),
  };

  return { draft, warnings };
}
