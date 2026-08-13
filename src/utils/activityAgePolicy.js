import { ageInYearsAt } from "./publicHotelsCartStorage.js";

/**
 * Parse une tranche d’âge libre (ex. « 4-9ans », « 0-5 ans », « Minimum 11 ans », « Interdit -6ans »).
 * @returns {{ kind: 'range', min: number, max: number }
 *   | { kind: 'min', min: number }
 *   | { kind: 'forbidden_under', under: number }
 *   | { kind: 'forbidden' }
 *   | null}
 */
export function parseActivityAgeLabel(raw) {
  const text = String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!text) return null;

  if (/^interdit\.?$/.test(text) || text === "non" || text === "none") {
    return { kind: "forbidden" };
  }

  const forbiddenUnder = text.match(/interdit\s*-?\s*(\d+(?:[.,]\d+)?)/);
  if (forbiddenUnder) {
    const under = Number(String(forbiddenUnder[1]).replace(",", "."));
    if (Number.isFinite(under)) return { kind: "forbidden_under", under };
  }

  const range = text.match(/(\d+(?:[.,]\d+)?)\s*[-–àto]+\s*(\d+(?:[.,]\d+)?)/);
  if (range) {
    const min = Number(String(range[1]).replace(",", "."));
    const max = Number(String(range[2]).replace(",", "."));
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { kind: "range", min: Math.min(min, max), max: Math.max(min, max) };
    }
  }

  const minOnly = text.match(/(?:minim+um?|a partir de|des?\s*)\s*(\d+(?:[.,]\d+)?)/);
  if (minOnly) {
    const min = Number(String(minOnly[1]).replace(",", "."));
    if (Number.isFinite(min)) return { kind: "min", min };
  }

  const single = text.match(/^(\d+(?:[.,]\d+)?)\s*ans?$/);
  if (single) {
    const n = Number(String(single[1]).replace(",", "."));
    if (Number.isFinite(n)) return { kind: "range", min: n, max: n };
  }

  return null;
}

function inRange(age, min, max) {
  return age >= min && age <= max;
}

/**
 * Politique d’âge dérivée des champs activité (+ flag babies_forbidden).
 */
export function buildActivityAgePolicy(activity) {
  const babiesForbiddenFlag = Boolean(activity?.babies_forbidden ?? activity?.babiesForbidden);
  const babyLabel = String(activity?.age_baby ?? activity?.ageBaby ?? "").trim();
  const childLabel = String(activity?.age_child ?? activity?.ageChild ?? "").trim();
  const babyParsed = parseActivityAgeLabel(babyLabel);
  const childParsed = parseActivityAgeLabel(childLabel);

  let babyMin = null;
  let babyMax = null;
  let childMin = null;
  let childMax = null;
  let babiesForbidden = babiesForbiddenFlag;

  if (babyParsed?.kind === "forbidden") babiesForbidden = true;
  if (babyParsed?.kind === "range") {
    babyMin = babyParsed.min;
    babyMax = babyParsed.max;
  } else if (babyParsed?.kind === "forbidden_under") {
    babiesForbidden = true;
    // Sous ce seuil = non accepté en bébé ; l’enfant commence souvent à ce seuil
    if (childMin == null) childMin = babyParsed.under;
  }

  if (childParsed?.kind === "range") {
    childMin = childParsed.min;
    childMax = childParsed.max;
  } else if (childParsed?.kind === "min") {
    childMin = childParsed.min;
    childMax = 17;
  } else if (childParsed?.kind === "forbidden" || childParsed?.kind === "forbidden_under") {
    // Activité interdite aux enfants : pas de grille enfant utilisable
    childMin = null;
    childMax = null;
  }

  // Défauts prudents si libellés absents
  if (babyMin == null && babyMax == null && !babiesForbidden) {
    babyMin = 0;
    babyMax = childMin != null ? Math.max(0, childMin - 0.001) : 3;
  }
  if (childMin == null && childMax == null && childParsed == null) {
    childMin = babyMax != null ? Math.ceil(babyMax + 0.001) : 4;
    childMax = 12;
  }

  return {
    babyMin,
    babyMax,
    childMin,
    childMax,
    babiesForbidden,
    babyLabel,
    childLabel,
  };
}

/**
 * @returns {'baby'|'child'|'adult'|'forbidden'|'unknown'|null}
 */
export function classifyMinorForActivity(birthDateIso, referenceDateIso, activity) {
  const age = ageInYearsAt(birthDateIso, referenceDateIso);
  if (age == null) return null;
  const policy = buildActivityAgePolicy(activity);

  if (policy.babyMin != null && policy.babyMax != null && inRange(age, policy.babyMin, policy.babyMax)) {
    if (policy.babiesForbidden) return "forbidden";
    return "baby";
  }
  if (policy.childMin != null && policy.childMax != null && inRange(age, policy.childMin, policy.childMax)) {
    return "child";
  }
  if (policy.childMax != null && age > policy.childMax) return "adult";
  if (policy.babiesForbidden && (policy.childMin == null || age < policy.childMin)) {
    return "forbidden";
  }
  if (policy.childMin != null && age < policy.childMin) {
    return policy.babiesForbidden ? "forbidden" : "unknown";
  }
  return "unknown";
}

export function formatActivityMinorCategoryLabel(category, age) {
  const ageTxt = age == null ? "" : ` · ${age} an${age > 1 ? "s" : ""}`;
  if (category === "baby") return `Bébé${ageTxt}`;
  if (category === "child") return `Enfant${ageTxt}`;
  if (category === "adult") return `Compté en adulte${ageTxt}`;
  if (category === "forbidden") return `Non autorisé${ageTxt}`;
  if (category === "unknown") return age == null ? "Date invalide" : `Hors grille${ageTxt}`;
  return "Saisissez la date de naissance";
}

/**
 * Dérive enfants / bébés d’une ligne panier à partir des dates de naissance.
 * @param {{ minorsCount?: number, birthDates?: string[], children?: number, babies?: number }} line
 * @param {object} activity
 * @param {string} referenceDateIso date d’excursion (ou arrivée)
 */
export function deriveCatalogueLineMinors(line, activity, referenceDateIso) {
  const legacyChildren = Math.max(0, Number(line?.children) || 0);
  const legacyBabies = Math.max(0, Number(line?.babies) || 0);
  let minorsCount = Number(line?.minorsCount);
  if (!Number.isFinite(minorsCount) || minorsCount < 0) {
    minorsCount = legacyChildren + legacyBabies;
  }
  minorsCount = Math.min(10, Math.max(0, minorsCount || 0));

  const birthDates = Array.isArray(line?.birthDates)
    ? [...line.birthDates].map((d) => String(d || "").trim())
    : [];
  while (birthDates.length < minorsCount) birthDates.push("");
  birthDates.length = minorsCount;

  const details = [];
  let childrenCount = 0;
  let babiesCount = 0;
  let upgradedAdultsCount = 0;
  let forbiddenCount = 0;
  let missingCount = 0;

  for (let i = 0; i < minorsCount; i += 1) {
    const birthDate = birthDates[i] || "";
    const age = ageInYearsAt(birthDate, referenceDateIso);
    const category = birthDate
      ? classifyMinorForActivity(birthDate, referenceDateIso, activity)
      : null;
    details.push({ index: i, birthDate, age, category });
    if (!birthDate || category == null) {
      missingCount += 1;
      continue;
    }
    if (category === "baby") babiesCount += 1;
    else if (category === "child") childrenCount += 1;
    else if (category === "adult") upgradedAdultsCount += 1;
    else if (category === "forbidden") forbiddenCount += 1;
    else missingCount += 1; // unknown = incomplete for submit
  }

  return {
    minorsCount,
    birthDates,
    childrenCount,
    babiesCount,
    upgradedAdultsCount,
    forbiddenCount,
    missingCount,
    details,
    complete: minorsCount === 0 || (missingCount === 0 && forbiddenCount === 0),
  };
}

/** Texte résumé pour notes / intranet. */
export function formatCatalogueMinorsAgesNote(lines) {
  const parts = [];
  for (const { line, activity, derived } of lines) {
    if (!derived?.minorsCount) continue;
    const name = activity?.name || line?.activityName || "Activité";
    const bits = derived.details
      .map((d) => formatActivityMinorCategoryLabel(d.category, d.age))
      .filter(Boolean);
    if (bits.length) parts.push(`${name}: ${bits.join(", ")}`);
  }
  return parts.join(" · ");
}
