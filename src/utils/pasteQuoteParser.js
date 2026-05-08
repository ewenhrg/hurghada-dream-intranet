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

function monthLookup(tok) {
  const monthTok = String(tok || "")
    .toLowerCase()
    .replace(/\.$/, "");
  const monthTokAscii = monthTok.normalize("NFD").replace(/\p{M}/gu, "");
  return MONTHS_FR[monthTok] ?? MONTHS_FR[monthTokAscii];
}

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
  const threshold = 0.28;
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

function inferYearForMonth(month) {
  let year = new Date().getFullYear();
  if (!month) return year;
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  if (month < curMonth - 3) year += 1;
  return year;
}

/**
 * Plage type « 16 au 27 août » (un seul mois).
 */
function parseFrenchStayRangeSingleMonth(text) {
  const t = String(text || "").trim();
  const re = /(\d{1,2})\s*(?:au|à|-|–|—)\s*(\d{1,2})\s+([a-zA-ZéèêëàâùûôîïçÉÈÊËÀÂÙÛÔÎÏÇ.]+)(?:\s+(\d{4}))?/i;
  const m = t.match(re);
  if (!m) return null;
  const d1 = parseInt(m[1], 10);
  const d2 = parseInt(m[2], 10);
  const month = monthLookup(m[3]);
  if (!month || !Number.isFinite(d1) || !Number.isFinite(d2)) return null;
  let year = m[4] ? parseInt(m[4], 10) : inferYearForMonth(month);
  return {
    arrival: toIsoDate(year, month, d1),
    departure: toIsoDate(year, month, d2),
  };
}

/**
 * Plage type « 23 juin au 28 juin » ou « 28 juin au 3 juillet ».
 */
function parseFrenchStayRangeDualMonth(text) {
  const t = String(text || "").trim();
  const re =
    /(\d{1,2})\s+([a-zA-ZéèêëàâùûôîïçÉÈÊËÀÂÙÛÔÎÏÇ.]+)\s*(?:au|à|-|–|—)\s*(\d{1,2})\s+([a-zA-ZéèêëàâùûôîïçÉÈÊËÀÂÙÛÔÎÏÇ.]+)(?:\s+(\d{4}))?/i;
  const m = t.match(re);
  if (!m) return null;
  const d1 = parseInt(m[1], 10);
  const d2 = parseInt(m[3], 10);
  const month1 = monthLookup(m[2]);
  const month2 = monthLookup(m[4]);
  if (!month1 || !month2 || !Number.isFinite(d1) || !Number.isFinite(d2)) return null;
  let year = m[5] ? parseInt(m[5], 10) : inferYearForMonth(Math.min(month1, month2));
  let yearEnd = year;
  if (month2 < month1 || (month2 === month1 && d2 < d1)) {
    yearEnd = year + 1;
  }
  const arrival = toIsoDate(year, month1, d1);
  let departure = toIsoDate(yearEnd, month2, d2);
  if (!arrival || !departure) return null;
  return { arrival, departure };
}

/** Dates numériques : 23/06/2026 au 28/06/2026, 23-06 au 28-06-2026, etc. */
function parseNumericDateRange(text) {
  const t = String(text || "").trim();
  const re =
    /(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\s*(?:au|à|-|–|—)\s*(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/i;
  const m = t.match(re);
  if (!m) return null;
  const d1 = parseInt(m[1], 10);
  const mo1 = parseInt(m[2], 10);
  let y1 = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
  if (m[3] && m[3].length === 2) y1 += y1 >= 70 ? 1900 : 2000;
  const d2 = parseInt(m[4], 10);
  const mo2 = parseInt(m[5], 10);
  let y2 = m[6] ? parseInt(m[6], 10) : y1;
  if (m[6] && m[6].length === 2) y2 += y2 >= 70 ? 1900 : 2000;
  if (!m[3]) y1 = inferYearForMonth(mo1);
  if (!m[6]) y2 = y1;
  if (mo2 < mo1 || (mo2 === mo1 && d2 < d1)) y2 = y1 + 1;
  const arrival = toIsoDate(y1, mo1, d1);
  const departure = toIsoDate(y2, mo2, d2);
  if (!arrival || !departure) return null;
  return { arrival, departure };
}

function parseFrenchStayRangeAny(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^\s*du\s*[:\-–—]?\s*/i, "")
    .trim();

  const single = parseFrenchStayRangeSingleMonth(cleaned);
  if (single) return single;
  const dual = parseFrenchStayRangeDualMonth(cleaned);
  if (dual) return dual;
  const compact = parseCompactDayRangeInMonth(cleaned);
  if (compact) return compact;
  return parseNumericDateRange(cleaned);
}

/** Ex. « 23-28 juin » ou « 23 – 28 juin » */
function parseCompactDayRangeInMonth(text) {
  const t = String(text || "").trim();
  const re = /(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([a-zA-ZéèêëàâùûôîïçÉÈÊËÀÂÙÛÔÎÏÇ.]+)(?:\s+(\d{4}))?/i;
  const m = t.match(re);
  if (!m) return null;
  const d1 = parseInt(m[1], 10);
  const d2 = parseInt(m[2], 10);
  const month = monthLookup(m[3]);
  if (!month || !Number.isFinite(d1) || !Number.isFinite(d2)) return null;
  const year = m[4] ? parseInt(m[4], 10) : inferYearForMonth(month);
  return {
    arrival: toIsoDate(year, month, d1),
    departure: toIsoDate(year, month, d2),
  };
}

function extractLabeledValue(line, prefixRe) {
  const m = line.match(prefixRe);
  return m ? String(m[1] || "").trim() : "";
}

/**
 * Enlève en-têtes messagerie, listes, numérotation.
 */
export function stripPastedLinePrefix(raw) {
  let s = String(raw ?? "").trim();
  // NOTE: éviter `\]` avec le flag `u` (peut casser certains builds).
  s = s.replace(/^\[[^]]*]\s*[^:]+:\s*/u, "").trim();
  s = s.replace(/^[\s*•·▪◦\-–—]+/u, "").trim();
  s = s.replace(/^\d{1,2}[\].)]\s+/, "").trim();
  return s;
}

const RE_NAME_LABEL =
  /^\s*(nom|noms|client|contact|prénom|prenom|name|nom\s+et\s+prénom|prénom\s+et\s+nom)\s*[:\-–—]\s*(.+)$/i;
const RE_TEL_LABEL =
  /^\s*(t[eé]l\.?|téléphone|telephone|mobile|portable|whatsapp|num[ée]ro|gsm)\s*[:\-–—]\s*(.+)$/i;
const RE_MAIL_LABEL = /^\s*(e-?mail|courriel|mail|email)\s*[:\-–—]\s*(.+)$/i;
const RE_HOTEL_LABEL =
  /^\s*(h[oô]tel|hébergement|hebergement|logement|airbnb|résidence|residence|adresse|lieu\s+de\s+sejour|lieu\s+de\s+séjour)\s*[:\-–—]\s*(.+)$/i;
const RE_STAY_LABEL =
  /^\s*(date\s*de\s*séjour|date\s*de\s*sejour|séjour|sejour|dates?|disponibilités|période|du|arriv[ée]e|départ|depart)\s*[:\-–—]?\s*(.+)$/i;
const RE_PARTY_LABEL =
  /^\s*(nombre\s*de\s*personnes?|nombre\s*de\s*participants?|participants?|personnes?|voyageurs?|pax|groupe|combien)\s*[:\-–—]?\s*(.+)$/i;
const RE_ROOM_LABEL = /^\s*(chambre|room|n[o°]\s*chambre)\s*[:\-–—]?\s*(.+)$/i;

function parseLabeledName(line) {
  const m = line.match(RE_NAME_LABEL);
  return m ? m[2].trim() : "";
}

function parseLabeledPhoneTail(line) {
  const m = line.match(RE_TEL_LABEL);
  return m ? m[2].trim() : "";
}

function parseLabeledHotel(line) {
  const m = line.match(RE_HOTEL_LABEL);
  return m ? m[2].trim() : "";
}

function parseLabeledStayTail(line) {
  const m = line.match(RE_STAY_LABEL);
  if (!m) return "";
  const tail = m[2].trim();
  if (/^(du|du\s+|le)\s*$/i.test(tail)) return "";
  return tail;
}

function parseLabeledPartyTail(line) {
  const m = line.match(RE_PARTY_LABEL);
  return m ? m[2].trim() : "";
}

/** Détecte une ligne du type « clé : valeur » générique (une seule valeur courte). */
function splitGenericLabelLine(line) {
  const m = String(line).match(/^\s*([^:：]{1,40})[:\s：]\s*(.{1,500})$/u);
  if (!m) return null;
  const key = m[1].trim().toLowerCase();
  const value = m[2].trim();
  if (!value || value.length < 1) return null;
  return { key, value };
}

function extractHotelFromLine(line) {
  const labeled = parseLabeledHotel(line);
  if (labeled) return labeled;
  const m = line.match(/^\s*h[oô]tel\s*:?\s*(.+)$/i);
  return m ? m[1].trim() : "";
}

/** Téléphone : chiffres dominants, éventuellement +code pays. */
function isLikelyPhoneLine(line) {
  const t = String(line || "").trim();
  if (!t || t.length < 8) return false;
  if (/[@]/.test(t) && !/\+\d/.test(t)) return false;
  const d = t.replace(/\D/g, "");
  if (d.length < 8 || d.length > 16) return false;
  const letters = t.replace(/[\d\s+().\-/]/g, "");
  return letters.length <= 3;
}

function normalizePhoneLine(line) {
  const t = String(line || "")
    .trim()
    .replace(/\s+/g, " ");
  const fromLabel = parseLabeledPhoneTail(line);
  const src = fromLabel || t;
  const digits = src.replace(/\D/g, "");
  if (digits.length >= 8) {
    const mPlus = src.match(/\+[\d\s]{10,}/);
    if (mPlus) return mPlus[0].replace(/\s+/g, "");
  }
  return t;
}

/** Extrait le premier numéro « plausible » dans tout le bloc. */
function extractPhoneFromFullText(text) {
  const t = String(text);
  const candidates = [];
  const re = /(?:\+\d{1,3}[\s.-]?\d{6,14}|0\d{9}|[+]20\d{9,10})/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    candidates.push(m[0].replace(/[\s.-]/g, ""));
  }
  if (candidates.length === 0) {
    const chunks = t.match(/\d[\d\s./-]{8,}/g) || [];
    for (const ch of chunks) {
      const d = ch.replace(/\D/g, "");
      if (d.length >= 9 && d.length <= 14) candidates.push(d);
    }
  }
  for (const c of candidates) {
    if (c.length >= 10 && c.length <= 15) return c.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return candidates[0] ? candidates[0] : "";
}

function extractEmailFromText(text) {
  const m = String(text).match(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/);
  return m ? m[0] : "";
}

function extractEmailFromLine(line) {
  const ml = line.match(RE_MAIL_LABEL);
  if (ml) {
    const v = extractEmailFromText(ml[2]);
    if (v) return v;
  }
  const m = String(line).match(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/);
  return m ? m[0] : "";
}

function extractParticipantsCount(text) {
  const m = String(text).match(/(\d+)\s*(?:personnes?|pers\.?|participants?|pax\b|voyageurs?)/i);
  if (m) return Math.min(99, Math.max(1, parseInt(m[1], 10) || 0));
  return 0;
}

function extractAdultsChildren(text) {
  const t = String(text || "");
  const ma = t.match(/(\d+)\s*adultes?/i);
  const mc = t.match(/(\d+)\s*enfants?/i);
  const mb = t.match(/(\d+)\s*bébés?|(\d+)\s*bebés?/i);
  const mu = /\bun\s+enfant\b/i.test(t) || /\bune\s+enfant\b/i.test(t);
  let adults = ma ? parseInt(ma[1], 10) : 0;
  let children = mc ? parseInt(mc[1], 10) : 0;
  if (mb) children += parseInt(mb[1] || mb[2] || "0", 10);
  if (!mc && !mb && mu) children = Math.max(children, 1);
  if (!ma && !mc && !mu && !mb) {
    const total = extractParticipantsCount(t);
    if (total) return { adults: total, children: 0 };
    const duo = t.match(/(\d+)\s*\+\s*(\d+)/);
    if (duo) {
      return { adults: parseInt(duo[1], 10) || 0, children: parseInt(duo[2], 10) || 0 };
    }
    return { adults: 0, children: 0 };
  }
  return { adults, children };
}

const RE_METADATA_KEY_HINT =
  /^(nom|client|t[eé]l|mail|h[oô]tel|adresse|date|séjour|sejour|personnes|participants|chambre|pax|airbnb)/i;

function lineLooksLikeParty(line) {
  return /\d+\s*(?:personnes?|adultes?|enfants?)|\benfant\b|\bbébé\b|pax\b|voyageurs?/i.test(line);
}

function lineLooksLikeRoomNote(line) {
  return /chambre|room\b|n[o°]\s*\d/i.test(line);
}

function lineLooksLikeAddressOrHotelBody(line) {
  return (
    /governorate|égypte|egypt|airbnb|شارع|مصر|hurghada|sharm|\bresort\b|\bressort\b|\baqua\b|\bhotels?\b|\bh[oô]tels?\b|\bbeach\s+(park|resort|hotel)\b/i.test(
      line
    ) || (line.length > 40 && /[,&]/.test(line))
  );
}

/** Ligne probablement une excursion (pas un paragraphe, pas une métadonnée évidente). */
function lineCouldBeActivityLine(trimmed) {
  if (!trimmed || trimmed.length < 2) return false;
  if (trimmed.length > 200) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (isLikelyPhoneLine(trimmed)) return false;
  if (extractEmailFromLine(trimmed)) return false;
  if (parseFrenchStayRangeAny(trimmed)) return false;
  if (lineLooksLikeParty(trimmed)) return false;
  if (RE_NAME_LABEL.test(trimmed) || RE_TEL_LABEL.test(trimmed) || RE_MAIL_LABEL.test(trimmed)) return false;
  if (RE_HOTEL_LABEL.test(trimmed) || RE_STAY_LABEL.test(trimmed) || RE_PARTY_LABEL.test(trimmed)) return false;
  if (lineLooksLikeRoomNote(trimmed)) return false;
  const generic = splitGenericLabelLine(trimmed);
  if (generic && RE_METADATA_KEY_HINT.test(generic.key)) return false;
  return true;
}

/** Prénom / nom approximatif sur une ligne seule. */
function looksLikePersonNameLine(line) {
  const t = line.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (/\d/.test(t)) return false;
  if (/[@/_]/.test(t)) return false;
  if (lineLooksLikeAddressOrHotelBody(t)) return false;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 6) return false;
  const letterish = /^[\p{L}''\-]+$/u;
  return parts.every((p) => letterish.test(p));
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

function applyGenericLabeledLine(trimmed, ctx) {
  const g = splitGenericLabelLine(trimmed);
  if (!g) return false;
  const { key, value } = g;
  if (/^(nom|client|contact|name|prénom|prenom)/i.test(key)) {
    if (!ctx.name && value.length < 120) ctx.name = value;
    return true;
  }
  if (/^(t[eé]l|phone|mobile|whatsapp|portable|gsm)/i.test(key)) {
    if (!ctx.phone && isLikelyPhoneLine(value)) ctx.phone = normalizePhoneLine(value);
    return true;
  }
  if (/^(mail|email|courriel)/i.test(key)) {
    const em = extractEmailFromText(value);
    if (em && !ctx.email) ctx.email = em;
    return true;
  }
  if (/^(h[oô]tel|adresse|logement|airbnb|résidence)/i.test(key)) {
    if (!ctx.hotel && value.length > 2) ctx.hotel = value;
    return true;
  }
  if (/^date|séjour|sejour|période|disponibilit/i.test(key)) {
    const range = parseFrenchStayRangeAny(value) || parseNumericDateRange(value);
    if (range && range.arrival) {
      ctx.arrivalDate = range.arrival;
      ctx.departureDate = range.departure;
    }
    return true;
  }
  if (/personnes|participants|pax|groupe|combien/i.test(key)) {
    const { adults, children } = extractAdultsChildren(value);
    if (adults || children) {
      ctx.adultsGuess = Math.max(ctx.adultsGuess, adults);
      ctx.childrenGuess = Math.max(ctx.childrenGuess, children);
    } else {
      const n = extractParticipantsCount(value);
      if (n) ctx.adultsGuess = Math.max(ctx.adultsGuess, n);
    }
    return true;
  }
  if (/^(chambre|room)\b/i.test(key)) {
    if (value) ctx.room = ctx.room ? `${ctx.room} ; ${value}` : value;
    return true;
  }
  return false;
}

function inferNameFromLines(cleanedLines, ctx) {
  if (ctx.name && ctx.name.trim()) return;
  const phoneIdx = cleanedLines.findIndex((l) => isLikelyPhoneLine(l));
  const limit = phoneIdx >= 0 ? phoneIdx : cleanedLines.length;
  for (let i = 0; i < limit; i++) {
    const t = cleanedLines[i].trim();
    if (!looksLikePersonNameLine(t)) continue;
    if (parseLabeledName(t)) continue;
    if (extractHotelFromLine(t)) continue;
    ctx.name = t;
    return;
  }
}

function mergeDateRange(into, range) {
  if (!range) return;
  if (range.arrival) into.arrivalDate = range.arrival;
  if (range.departure) into.departureDate = range.departure;
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
  const cleanedLines = fullText.split(/\r?\n/).map(stripPastedLinePrefix).filter((l) => l.length > 0);

  const ctx = {
    name: "",
    phone: "",
    email: "",
    hotel: "",
    room: "",
    arrivalDate: "",
    departureDate: "",
    adultsGuess: 0,
    childrenGuess: 0,
  };
  const activityCandidates = [];
  const extraNotes = [];

  for (const line of cleanedLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (applyGenericLabeledLine(trimmed, ctx)) continue;

    const named = parseLabeledName(trimmed);
    if (named) {
      ctx.name = named;
      continue;
    }

    if (RE_TEL_LABEL.test(trimmed) && parseLabeledPhoneTail(trimmed)) {
      const tail = parseLabeledPhoneTail(trimmed);
      if (isLikelyPhoneLine(tail)) {
        ctx.phone = normalizePhoneLine(`${tail}`);
        continue;
      }
    }

    if (isLikelyPhoneLine(trimmed)) {
      ctx.phone = normalizePhoneLine(trimmed);
      continue;
    }

    const em = extractEmailFromLine(trimmed);
    if (em) {
      if (!ctx.email) ctx.email = em;
      continue;
    }

    const ht = extractHotelFromLine(trimmed);
    if (ht) {
      ctx.hotel = ht;
      continue;
    }

    // Ligne d’hôtel / adresse sans libellé : si ça ressemble fortement à un hébergement,
    // on la traite comme hôtel (sinon elle partait parfois en « activité »).
    if (lineLooksLikeAddressOrHotelBody(trimmed)) {
      if (!ctx.hotel) {
        ctx.hotel = trimmed;
        continue;
      }
      if (!lineCouldBeActivityLine(trimmed) && trimmed.length > ctx.hotel.length) {
        ctx.hotel = trimmed;
        continue;
      }
    }

    const rm = trimmed.match(RE_ROOM_LABEL);
    if (rm && rm[2]) {
      ctx.room = rm[2].trim();
      continue;
    }

    if (lineLooksLikeRoomNote(trimmed)) {
      const rm2 = trimmed.match(/chambre\s*:?\s*(.+)$/i);
      if (rm2 && rm2[1] && rm2[1].trim()) ctx.room = rm2[1].trim();
      else extraNotes.push(trimmed);
      continue;
    }

    const stayLabeled =
      extractLabeledValue(trimmed, /date\s+de\s+séjour\s*:\s*(.+)/i) ||
      extractLabeledValue(trimmed, /date\s+de\s+sejour\s*:\s*(.+)/i);
    if (stayLabeled) {
      const range = parseFrenchStayRangeAny(stayLabeled) || parseNumericDateRange(stayLabeled);
      if (range) mergeDateRange(ctx, range);
      else warnings.push(`Dates de séjour non reconnues : « ${stayLabeled} »`);
      continue;
    }

    const stayTail = parseLabeledStayTail(trimmed);
    if (stayTail) {
      const range = parseFrenchStayRangeAny(stayTail) || parseNumericDateRange(stayTail);
      if (range) {
        mergeDateRange(ctx, range);
        continue;
      }
    }

    const dr = parseFrenchStayRangeAny(trimmed) || parseNumericDateRange(trimmed);
    if (dr) {
      mergeDateRange(ctx, dr);
      continue;
    }

    const addr = extractLabeledValue(trimmed, /adresse[^:]*:\s*(.+)/i);
    if (addr) {
      ctx.hotel = addr;
      continue;
    }

    const partyTail =
      parseLabeledPartyTail(trimmed) ||
      extractLabeledValue(trimmed, /nombre\s+de\s+participants\s*:\s*(.+)/i);
    if (partyTail) {
      const { adults, children } = extractAdultsChildren(partyTail);
      if (adults > 0 || children > 0) {
        ctx.adultsGuess = Math.max(ctx.adultsGuess, adults);
        ctx.childrenGuess = Math.max(ctx.childrenGuess, children);
      } else {
        const n = extractParticipantsCount(partyTail);
        if (n) ctx.adultsGuess = Math.max(ctx.adultsGuess, n);
      }
      continue;
    }

    if (lineLooksLikeParty(trimmed)) {
      const { adults, children } = extractAdultsChildren(trimmed);
      if (adults > 0 || children > 0) {
        ctx.adultsGuess = Math.max(ctx.adultsGuess, adults);
        ctx.childrenGuess = Math.max(ctx.childrenGuess, children);
      } else {
        const n = extractParticipantsCount(trimmed);
        if (n) ctx.adultsGuess = Math.max(ctx.adultsGuess, n);
      }
      continue;
    }

    if (lineCouldBeActivityLine(trimmed)) activityCandidates.push(trimmed);
    else if (trimmed.length < 300) extraNotes.push(trimmed);
  }

  if (!ctx.email) ctx.email = extractEmailFromText(fullText);

  if (!ctx.phone) {
    const fromText = extractPhoneFromFullText(fullText);
    if (fromText) ctx.phone = fromText.replace(/\s+/g, "").length >= 10 ? fromText.replace(/\s+/g, "") : fromText;
  }

  inferNameFromLines(cleanedLines, ctx);

  if (!ctx.arrivalDate || !ctx.departureDate) {
    const fallback = parseFrenchStayRangeAny(fullText) || parseNumericDateRange(fullText);
    if (fallback) mergeDateRange(ctx, fallback);
  }

  if (!ctx.adultsGuess && !ctx.childrenGuess) {
    const { adults, children } = extractAdultsChildren(fullText);
    ctx.adultsGuess = adults;
    ctx.childrenGuess = children;
    if (!ctx.adultsGuess) ctx.adultsGuess = extractParticipantsCount(fullText);
  }

  const defaultDate = ctx.arrivalDate || new Date().toISOString().slice(0, 10);
  const adultsStr = ctx.adultsGuess > 0 ? String(ctx.adultsGuess) : "";

  const items = [];
  const unmatchedForNotes = [];

  for (const rawAct of activityCandidates) {
    const { cleanLabel, repeat, parenNotes } = parseActivityLine(rawAct);
    if (!cleanLabel) continue;

    const { activity, score } = bestActivityForLabel(cleanLabel, safeActivities);
    const extraBits = [...parenNotes].filter(Boolean);
    let extraLabel = extraBits.length ? extraBits.join(" · ") : "";

    if (activity) {
      if (score < 0.5)
        warnings.push(`Correspondance faible (${(score * 100).toFixed(0)} %) : « ${cleanLabel} » → ${activity.name}`);
    } else {
      unmatchedForNotes.push(rawAct);
      warnings.push(`Aucune activité catalogue pour : « ${cleanLabel} » — vérifiez la ligne dans le devis.`);
    }

    const baseLine = mergePublicSavedLineIntoQuoteItem({
      activityId: activity ? String(activity.id || activity.supabase_id || "") : "",
      date: defaultDate,
      adults: adultsStr,
      children: ctx.childrenGuess,
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
    items.push(
      mergePublicSavedLineIntoQuoteItem({
        activityId: "",
        date: defaultDate,
        adults: adultsStr,
        children: ctx.childrenGuess,
        babies: 0,
      })
    );
    warnings.push("Aucune excursion détectée en texte libre — une ligne vide a été ajoutée.");
  }

  const notesParts = [];
  if (extraNotes.length) notesParts.push(extraNotes.join("\n"));
  if (unmatchedForNotes.length) {
    notesParts.push("Demandes client (à vérifier) :\n- " + unmatchedForNotes.join("\n- "));
  }

  const draft = {
    client: {
      name: ctx.name,
      phone: ctx.phone,
      email: ctx.email,
      hotel: ctx.hotel,
      room: ctx.room,
      neighborhood: "",
      arrivalDate: ctx.arrivalDate,
      departureDate: ctx.departureDate,
    },
    items,
    notes: notesParts.filter(Boolean).join("\n\n"),
  };

  return { draft, warnings };
}