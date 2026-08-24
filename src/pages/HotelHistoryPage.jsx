import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Banknote, BedDouble, Building2, CheckCircle2, FileText, MessageSquareReply, Receipt, Trash2, Upload, Ban } from "lucide-react";
import { supabase } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { logger } from "../utils/logger";
import { toast } from "../utils/toast.js";
import { useDebounce } from "../hooks/useDebounce";
import { GhostBtn, NumberInput, Pill, PrimaryBtn, TextInput } from "../components/ui";
import { printHotelRequest, printHotelPaymentReceipt } from "../utils/hotelRequestPrint";
import { formatHotelStayDate, normalizeStayDate } from "../utils/hotelRequestDates";
import {
  formatHotelRequestShortRef,
  normalizeHotelRequestRefQuery,
} from "../utils/hotelRequestRef";
import {
  boardFieldsFromRow,
  boardFieldsToPayload,
  boardLabelsFromViewModel,
} from "../constants/hotelRequestBoardOptions";
import { loadPublicHotelsCatalog } from "../utils/publicHotelsCatalog";
import { countHotelNights, formatQuoteMoney } from "../utils/hotelQuoteCalc";
import {
  formatRoomOccupancyLabel,
  findRoomCategory,
  roomCategoryNames,
} from "../utils/hotelRoomCategories";
import {
  buildPaymentSchedule,
  computeConfirmedGrandTotal,
  getPaymentStatus,
  normalizePayment,
  serializePayment,
} from "../utils/hotelRequestPayment";
import {
  HOTEL_CLIENT_DOC_TYPES,
  hotelClientDocTypeLabel,
  normalizeClientDocuments,
  serializeClientDocuments,
} from "../utils/hotelRequestDocuments";
import {
  cleanupExpiredHotelRequestDocuments,
  storageRefFromPublicUrl,
} from "../utils/cleanupExpiredHotelRequestDocuments";
import { canDeleteHotelRequest } from "../constants/permissions";

const PAYMENT_PROOF_BUCKET = "documents";
const PAYMENT_PROOF_FALLBACK_BUCKET = "Catalogue";
const PAYMENT_PROOF_MAX_BYTES = 10 * 1024 * 1024;
const CLIENT_DOC_MAX_BYTES = 15 * 1024 * 1024;

const SELECT_COLUMNS =
  "id, first_name, last_name, client_phone, client_email, arrival_date, departure_date, adults_count, children_count, child_ages, hotel_option_1, hotel_option_2, hotel_option_3, budget, wants_custom_offer, board_all_inclusive, board_full_board, board_breakfast, notes, response_payload, created_at, updated_at";

/** Supplément transfert aéroport (optionnel, ajouté au prix séjour saisi). */
export const HOTEL_TRANSFER_FEE_EUR = 40;

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function parseMoneyInput(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? roundMoney(n) : null;
}

function serializeQuote(quote) {
  if (!quote) return null;
  return {
    ok: quote.ok === true,
    nights: quote.nights ?? 0,
    coveredNights: quote.coveredNights ?? 0,
    currency: quote.currency || "EUR",
    stayTotal: quote.stayTotal ?? quote.total,
    total: quote.total,
    adultsTotal: quote.adultsTotal ?? 0,
    childrenTotal: quote.childrenTotal ?? 0,
    babiesTotal: quote.babiesTotal ?? 0,
    freeChildren: quote.freeChildren ?? 0,
    chargedChildren: quote.chargedChildren ?? 0,
    totalAdults: quote.totalAdults ?? 0,
    roomsNeeded: Math.max(1, Number(quote.roomsNeeded) || 1),
    maxAdultsPerRoom:
      quote.maxAdultsPerRoom != null && Number.isFinite(Number(quote.maxAdultsPerRoom))
        ? Number(quote.maxAdultsPerRoom)
        : null,
    warnings: Array.isArray(quote.warnings) ? quote.warnings : [],
    hiltonPolicyApplied: quote.hiltonPolicyApplied === true,
    transferIncluded: quote.transferIncluded === true,
    transferFee: quote.transferFee ?? 0,
    priceManual: quote.priceManual === true,
  };
}

function normalizeHotelProposal(h) {
  if (!h || typeof h !== "object") return null;
  const hotelName = String(h.hotelName || "").trim();
  if (!hotelName) return null;
  return {
    slot: Number(h.slot) || 0,
    hotelName,
    roomCategory: String(h.roomCategory || "").trim(),
    catalogSlug: String(h.catalogSlug || "").trim(),
    stayFrom: normalizeStayDate(h.stayFrom),
    stayTo: normalizeStayDate(h.stayTo),
    includeTransfer: h.includeTransfer === true,
        manualTotal:
      h.manualTotal != null && Number.isFinite(Number(h.manualTotal))
            ? roundMoney(Number(h.manualTotal))
            : null,
    quote: h.quote && typeof h.quote === "object" ? serializeQuote(h.quote) : null,
  };
}

function normalizeResponsePayload(raw) {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const hotels = Array.isArray(base.hotels) ? base.hotels : [];
  const normalizedHotels = hotels.map(normalizeHotelProposal).filter(Boolean);

  let confirmedHotels = [];
  if (Array.isArray(base.confirmedHotels) && base.confirmedHotels.length > 0) {
    confirmedHotels = base.confirmedHotels.map(normalizeHotelProposal).filter(Boolean);
  } else if (base.confirmedHotel && typeof base.confirmedHotel === "object") {
    const one = normalizeHotelProposal(base.confirmedHotel);
    if (one) confirmedHotels = [one];
  }
  const confirmedHotel = confirmedHotels[0] || null;

  return {
    agentNotes: String(base.agentNotes || base.notes || "").trim(),
    hotels: normalizedHotels,
    confirmedHotel,
    confirmedHotels,
    confirmedAt: base.confirmedAt || "",
    flights: normalizeFlights(base.flights),
    zeroTracas: normalizeZeroTracas(base.zeroTracas),
    sentToClient: base.sentToClient === true,
    sentAt: base.sentAt || "",
    confirmedByHotel: base.confirmedByHotel === true,
    confirmedByHotelAt: base.confirmedByHotelAt || "",
    payment: normalizePayment(base.payment),
    clientDocuments: normalizeClientDocuments(base.clientDocuments),
    cancelled: base.cancelled === true,
    cancelledAt: base.cancelledAt || "",
  };
}

function normalizeFlights(raw) {
  const f = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    arrivalFlightNumber: String(f.arrivalFlightNumber || "").trim(),
    arrivalTime: String(f.arrivalTime || "").trim(),
    arrivalDate: String(f.arrivalDate || "").trim(),
    departureFlightNumber: String(f.departureFlightNumber || "").trim(),
    departureTime: String(f.departureTime || "").trim(),
    departureDate: String(f.departureDate || "").trim(),
  };
}

const EMPTY_FLIGHTS = {
  arrivalFlightNumber: "",
  arrivalTime: "",
  arrivalDate: "",
  departureFlightNumber: "",
  departureTime: "",
  departureDate: "",
};

const EMPTY_ZERO_TRACAS = {
  enabled: false,
  visaCount: "",
  simCount: "",
  manualTotal: null,
};

function parseQtyInput(raw) {
  if (raw == null || raw === "") return 0;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function normalizeZeroTracas(raw) {
  const z = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const visaCount = parseQtyInput(z.visaCount);
  const simCount = parseQtyInput(z.simCount);
  const manual =
    z.manualTotal != null && Number.isFinite(Number(z.manualTotal))
      ? roundMoney(Number(z.manualTotal))
      : null;
  return {
    enabled: z.enabled === true,
    visaCount: visaCount > 0 ? String(visaCount) : "",
    simCount: simCount > 0 ? String(simCount) : "",
    manualTotal: manual,
  };
}

function isZeroTracasComplete(zeroTracas) {
  const z = normalizeZeroTracas(zeroTracas);
  if (!z.enabled) return true;
  const hasQty = parseQtyInput(z.visaCount) > 0 || parseQtyInput(z.simCount) > 0;
  return hasQty && z.manualTotal != null && z.manualTotal >= 0;
}

function computeZeroTracasTotal(zeroTracas) {
  const z = normalizeZeroTracas(zeroTracas);
  if (!z.enabled || z.manualTotal == null) return 0;
  return z.manualTotal;
}

function getConfirmedHotelsList(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  if (Array.isArray(p.confirmedHotels) && p.confirmedHotels.length > 0) {
    return p.confirmedHotels.filter((h) => proposalIsReady(h));
  }
  if (p.confirmedHotel && proposalIsReady(p.confirmedHotel)) {
    return [p.confirmedHotel];
  }
  return [];
}

function isHotelRequestConfirmed(request) {
  if (typeof request?.isConfirmed === "boolean") return request.isConfirmed;
  const payload = normalizeResponsePayload(request?.responsePayload);
  return getConfirmedHotelsList(payload).length > 0;
}

function requestCreatedOnOrAfterToday(request) {
  const raw = String(request?.createdAt || "").trim();
  if (!raw) return false;
  const created = new Date(raw);
  if (Number.isNaN(created.getTime())) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return created.getTime() >= start.getTime();
}

/** Nouvelle demande sans réponse (à partir d’aujourd’hui). */
function isHotelRequestPending(request) {
  if (typeof request?.isPending === "boolean") return request.isPending;
  if (isHotelRequestConfirmed(request)) return false;
  if (!requestCreatedOnOrAfterToday(request)) return false;
  const payload = normalizeResponsePayload(request?.responsePayload);
  return !payload.hotels.some((h) => proposalIsReady(h));
}

/** Reply préparée, pas encore envoyée ni confirmée. */
function isHotelRequestReadyToSend(request) {
  if (typeof request?.isReadyToSend === "boolean") return request.isReadyToSend;
  if (isHotelRequestConfirmed(request)) return false;
  const payload = normalizeResponsePayload(request?.responsePayload);
  if (payload.sentToClient) return false;
  return payload.hotels.some((h) => proposalIsReady(h));
}

/** Devis marqué comme envoyé au client (pas encore confirmé). */
function isHotelRequestSent(request) {
  if (typeof request?.isSent === "boolean") return request.isSent;
  if (isHotelRequestConfirmed(request)) return false;
  const payload = normalizeResponsePayload(request?.responsePayload);
  return payload.sentToClient === true && payload.hotels.some((h) => proposalIsReady(h));
}

/** Confirmation avec au moins un paiement enregistré (partiel ou total) — reste aussi dans Confirmations. */
function isHotelRequestInPayerList(request) {
  if (typeof request?.isInPayerList === "boolean") return request.isInPayerList;
  if (!isHotelRequestConfirmed(request)) return false;
  const payload = normalizeResponsePayload(request?.responsePayload);
  return normalizePayment(payload.payment).entries.length > 0;
}

/** Instant d’activité (réponse, envoi, MAJ) — plus récent en haut dans toutes les listes. */
function hotelRequestResponseActivityMs(request) {
  const payload =
    request?.responsePayload && typeof request.responsePayload === "object"
      ? request.responsePayload
      : {};
  const candidates = [
    payload.cancelledAt,
    payload.confirmedByHotelAt,
    payload.confirmedAt,
    payload.sentAt,
    payload.updatedAt,
    request?.updatedAt,
    request?.createdAt,
  ];
  // Dernier paiement enregistré
  const entries = Array.isArray(payload.payment?.entries) ? payload.payment.entries : [];
  for (const e of entries) {
    if (e?.paidAt) candidates.push(e.paidAt);
  }
  let best = 0;
  for (const c of candidates) {
    const t = Date.parse(String(c || "").trim());
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best;
}

function hotelProposalKey(hotel, index = 0) {
  return `${hotel?.slot || index + 1}::${String(hotel?.catalogSlug || "").trim()}::${String(hotel?.hotelName || "").trim()}`;
}

function requestHotelsList(request) {
  return [
    { slot: 1, hotelName: String(request.hotelOption1 || "").trim() },
    { slot: 2, hotelName: String(request.hotelOption2 || "").trim() },
    { slot: 3, hotelName: String(request.hotelOption3 || "").trim() },
  ].filter((h) => h.hotelName);
}

function findCatalogHotelByName(hotelName, catalog) {
  const n = String(hotelName || "").trim().toLowerCase();
  if (!n) return null;
  const exact = catalog.find((h) => String(h.name || "").trim().toLowerCase() === n);
  if (exact) return exact;
  return (
    catalog.find((h) => {
      const name = String(h.name || "").trim().toLowerCase();
      return name.includes(n) || n.includes(name);
    }) || null
  );
}

function applyQuoteAdjustments(nights, { includeTransfer = false, manualTotal = null } = {}) {
  const transferOn = includeTransfer === true;
  const transferFee = transferOn ? HOTEL_TRANSFER_FEE_EUR : 0;
  const priceManual = manualTotal != null && Number.isFinite(Number(manualTotal));
  const stayTotal = priceManual ? roundMoney(Number(manualTotal)) : null;
  const total = stayTotal != null ? roundMoney(stayTotal + transferFee) : null;
  return {
    ok: total != null,
    currency: "EUR",
    nights: nights > 0 ? nights : null,
    roomsNeeded: null,
    adultsTotal: null,
    childrenTotal: null,
    babiesTotal: null,
    freeChildren: 0,
    warnings: [],
    hiltonPolicyApplied: false,
    stayTotal,
    transferIncluded: transferOn,
    transferFee,
    priceManual: true,
    total,
  };
}

function createEmptyProposal(slot = 1, stayDefaults = {}) {
  return {
    slot,
    hotelName: "",
    hotelManual: false,
    roomCategory: "",
    roomCategoryManual: false,
    catalogSlug: "",
    roomCategories: [],
    catalogHotel: null,
    stayFrom: normalizeStayDate(stayDefaults.stayFrom),
    stayTo: normalizeStayDate(stayDefaults.stayTo),
    includeTransfer: false,
    manualTotal: null,
  };
}

function draftFromSavedHotel(prev, catalog, fallbackSlot, request) {
  const catalogHotel =
    (prev.catalogSlug &&
      catalog.find((h) => String(h.slug || h.id) === String(prev.catalogSlug))) ||
    findCatalogHotelByName(prev.hotelName, catalog);
  const stay =
    prev.manualTotal != null
      ? prev.manualTotal
      : prev.quote?.stayTotal != null
        ? Number(prev.quote.stayTotal)
        : prev.quote?.total != null && prev.quote?.transferIncluded
          ? roundMoney(Number(prev.quote.total) - Number(prev.quote.transferFee || 0))
          : prev.quote?.total != null
            ? Number(prev.quote.total)
      : null;
  const cats = roomCategoryNames(catalogHotel?.roomCategories);
  const roomCategory = String(prev.roomCategory || "").trim();
  const hotelName = prev.hotelName || catalogHotel?.name || "";
  return {
    slot: prev.slot || fallbackSlot,
    hotelName,
    hotelManual: !catalogHotel && Boolean(String(hotelName).trim()),
    roomCategory,
    roomCategoryManual: Boolean(roomCategory && !cats.includes(roomCategory)),
    catalogSlug: catalogHotel?.slug || catalogHotel?.id || "",
    roomCategories: cats,
    catalogHotel: catalogHotel || null,
    stayFrom:
      normalizeStayDate(prev.stayFrom) || normalizeStayDate(request?.arrivalDate) || "",
    stayTo:
      normalizeStayDate(prev.stayTo) || normalizeStayDate(request?.departureDate) || "",
    includeTransfer:
      prev.includeTransfer === true || prev.quote?.transferIncluded === true,
    manualTotal: stay != null && Number.isFinite(Number(stay)) ? roundMoney(Number(stay)) : null,
  };
}

/** Tarifs auto suspendus : propositions libres depuis le catalogue + prix saisis à la main. */
function buildResponseHotelsDraft(request, catalog) {
  const saved = normalizeResponsePayload(request.responsePayload).hotels;
  const stayDefaults = {
    stayFrom: request?.arrivalDate || "",
    stayTo: request?.departureDate || "",
  };
  if (saved.length > 0) {
    return saved.map((prev, idx) => draftFromSavedHotel(prev, catalog, idx + 1, request));
  }
  return [createEmptyProposal(1, stayDefaults)];
}

function computeQuotesForDraft(request, hotelsDraft) {
  return hotelsDraft.map((item, index) => {
    const hotelName = String(item.hotelName || "").trim();
    const stayFrom =
      normalizeStayDate(item.stayFrom) || normalizeStayDate(request?.arrivalDate);
    const stayTo =
      normalizeStayDate(item.stayTo) || normalizeStayDate(request?.departureDate);
    const nights = countHotelNights(stayFrom, stayTo);
    const quote = applyQuoteAdjustments(nights, {
      includeTransfer: false,
      manualTotal: item.manualTotal,
    });
    return {
      slot: item.slot || index + 1,
      hotelName,
      roomCategory: String(item.roomCategory || "").trim(),
      catalogSlug: item.catalogSlug || "",
      stayFrom,
      stayTo,
      includeTransfer: false,
      manualTotal: item.manualTotal ?? null,
      quote: serializeQuote(quote),
    };
  });
}

function proposalIsReady(quoted) {
  return Boolean(quoted?.hotelName && quoted?.quote?.total != null);
}

export const HOTEL_CUSTOM_OFFER_LABEL = "I don't have a hotel preference — please make me an offer";

function digitsOnly(s) {
  return String(s ?? "").replace(/\D/g, "");
}

export function rowToHotelRequestViewModel(row) {
  const base = {
    id: String(row.id),
    supabaseId: row.id,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    phone: row.client_phone || "",
    email: row.client_email || "",
    arrivalDate: normalizeStayDate(row.arrival_date),
    departureDate: normalizeStayDate(row.departure_date),
    adultsCount:
      row.adults_count != null && row.adults_count !== "" ? Number(row.adults_count) : null,
    childrenCount:
      row.children_count != null && row.children_count !== ""
        ? Number(row.children_count)
        : null,
    childAges: row.child_ages || "",
    hotelOption1: row.hotel_option_1 || "",
    hotelOption2: row.hotel_option_2 || "",
    hotelOption3: row.hotel_option_3 || "",
    budget: row.budget || "",
    wantsCustomOffer: row.wants_custom_offer === true,
    ...boardFieldsFromRow(row),
    notes: row.notes || "",
    responsePayload: normalizeResponsePayload(row.response_payload),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
  return enrichHotelRequestViewModel(base);
}

/** Précalcule flags de filtre + haystack recherche (évite de re-normaliser à chaque render). */
function enrichHotelRequestViewModel(vm) {
  const payload =
    vm.responsePayload && typeof vm.responsePayload === "object"
      ? vm.responsePayload
      : normalizeResponsePayload(vm.responsePayload);
  const confirmedHotels = getConfirmedHotelsList(payload);
  const isConfirmed = confirmedHotels.length > 0;
  const hasReadyHotels = (payload.hotels || []).some((h) => proposalIsReady(h));
  const sentToClient = payload.sentToClient === true;
  const hasPayment = normalizePayment(payload.payment).entries.length > 0;
  const isCancelled = payload.cancelled === true || Boolean(payload.cancelledAt);
  const paymentStatus = isConfirmed ? getPaymentStatus(vm, payload) : null;
  const confirmationPaidAmount = paymentStatus
    ? Number(paymentStatus.paid) || 0
    : hasPayment
      ? 1
      : 0;
  const isConfirmationCancelled = isConfirmed && isCancelled;
  const isConfirmationPaidOrPartial =
    isConfirmed && !isCancelled && confirmationPaidAmount > 0.009;
  const isConfirmationUnpaid = isConfirmed && !isCancelled && !isConfirmationPaidOrPartial;
  const createdToday = requestCreatedOnOrAfterToday(vm);

  const shortRef = formatHotelRequestShortRef(vm.id || vm.supabaseId).toLowerCase();
  const searchHaystack = [
    vm.firstName,
    vm.lastName,
    vm.email,
    vm.phone,
    vm.hotelOption1,
    vm.hotelOption2,
    vm.hotelOption3,
    ...confirmedHotels.map((h) => h.hotelName),
    ...(payload.hotels || []).map((h) => h.hotelName),
    shortRef,
    String(vm.id || ""),
    String(vm.supabaseId || ""),
  ]
    .join(" ")
    .toLowerCase();

  return {
    ...vm,
    responsePayload: payload,
    isConfirmed,
    isPending: !isConfirmed && createdToday && !hasReadyHotels,
    isReadyToSend: !isConfirmed && !sentToClient && hasReadyHotels,
    isSent: !isConfirmed && sentToClient && hasReadyHotels,
    isInPayerList: isConfirmed && !isCancelled && hasPayment,
    isConfirmationPaidOrPartial,
    isConfirmationUnpaid,
    isConfirmationCancelled,
    searchHaystack,
    searchPhoneDigits: digitsOnly(vm.phone),
    shortRef,
  };
}

function viewModelToPayload(vm) {
  return {
    first_name: vm.firstName.trim(),
    last_name: vm.lastName.trim(),
    client_phone: vm.phone.trim(),
    client_email: vm.email.trim(),
    arrival_date: vm.arrivalDate || "",
    departure_date: vm.departureDate || "",
    adults_count:
      vm.adultsCount != null && Number.isFinite(Number(vm.adultsCount)) && Number(vm.adultsCount) >= 1
        ? Number(vm.adultsCount)
        : 1,
    children_count:
      vm.childrenCount != null && Number.isFinite(Number(vm.childrenCount)) && Number(vm.childrenCount) >= 0
        ? Number(vm.childrenCount)
        : 0,
    child_ages: vm.childAges?.trim() || "",
    hotel_option_1: vm.wantsCustomOffer ? "" : vm.hotelOption1.trim(),
    hotel_option_2: vm.wantsCustomOffer ? "" : vm.hotelOption2.trim(),
    hotel_option_3: vm.wantsCustomOffer ? "" : vm.hotelOption3.trim(),
    wants_custom_offer: vm.wantsCustomOffer === true,
    budget: vm.budget.trim(),
    ...boardFieldsToPayload(vm),
    notes: vm.notes.trim(),
    updated_at: new Date().toISOString(),
  };
}

const HotelRequestCard = memo(function HotelRequestCard({
  request,
  onPrint,
  onReply,
  onConfirm,
  onEdit,
  onMarkSent,
  markingSent,
  onMarkConfirmedByHotel,
  markingConfirmedByHotel,
  onPay,
  onDocuments,
  onPrintReceipt,
  onCancelConfirmation,
  cancelling,
  canDelete,
  onDelete,
  deleting,
}) {
  const fullName = [request.firstName, request.lastName].filter(Boolean).join(" ").trim() || "Client";
  const boardLabels = boardLabelsFromViewModel(request);
  const hotels = [
    { label: "Choice 1", value: request.hotelOption1 },
    { label: "Choice 2", value: request.hotelOption2 },
    { label: "Choice 3", value: request.hotelOption3 },
  ].filter((h) => String(h.value || "").trim());
  const payload =
    request.responsePayload && typeof request.responsePayload === "object"
      ? request.responsePayload
      : normalizeResponsePayload(request.responsePayload);
  const responseHotels = payload.hotels;
  const readyHotels = responseHotels.filter((h) => proposalIsReady(h));
  const hasResponse = readyHotels.length > 0;
  const confirmedHotels = getConfirmedHotelsList(payload);
  const confirmedHotel = confirmedHotels[0] || null;
  const isConfirmed = confirmedHotels.length > 0;
  const sentToClient = payload.sentToClient === true;
  const confirmedByHotel = payload.confirmedByHotel === true;
  const responseTotals = (isConfirmed ? confirmedHotels : readyHotels)
    .map((h) => `${h.hotelName}: ${formatQuoteMoney(h.quote.total, h.quote.currency)}`)
    .join(" · ");
  const refId = String(request.id || request.supabaseId || "").trim();
  const shortRef = request.shortRef || formatHotelRequestShortRef(refId);
  const paymentStatus = isConfirmed ? getPaymentStatus(request, payload) : null;
  const isCancelled = payload.cancelled === true || Boolean(payload.cancelledAt);
  const clientDocuments = payload.clientDocuments || [];
  const confirmedLabel =
    confirmedHotels.length > 1
      ? confirmedHotels.map((h) => h.hotelName).join(" + ")
      : confirmedHotel?.hotelName || "";

  return (
    <article className="overflow-hidden rounded-2xl border-2 border-indigo-200/90 bg-gradient-to-b from-white via-white to-slate-50/90 shadow-[0_12px_40px_-18px_rgba(30,27,75,0.22)] ring-1 ring-slate-200/80">
      <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-violet-50/50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-indigo-600">
              Hotel request
            </p>
              {shortRef ? (
                <span
                  className="inline-flex items-center rounded-full bg-white/90 px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wide text-indigo-900 ring-1 ring-indigo-200"
                  title={refId ? `Full reference: ${refId}` : undefined}
                >
                  Ref. {shortRef}
                </span>
              ) : null}
            </div>
            <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-950 sm:text-xl">{fullName}</h3>
            {request.wantsCustomOffer ? (
              <span className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-950 ring-1 ring-amber-400/50">
                Custom offer requested
              </span>
            ) : null}
            {!hasResponse && !isConfirmed ? (
              <span className="mt-2 ml-0 inline-block rounded-full bg-slate-200 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-800 ring-1 ring-slate-300/70 sm:ml-2">
                Pending
              </span>
            ) : null}
            {hasResponse && !isConfirmed && !sentToClient ? (
              <span className="mt-2 ml-0 inline-block rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-950 ring-1 ring-amber-400/50 sm:ml-2">
                Ready to send to client
              </span>
            ) : null}
            {hasResponse && !isConfirmed && sentToClient ? (
              <span className="mt-2 ml-0 inline-block rounded-full bg-sky-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-950 ring-1 ring-sky-400/50 sm:ml-2">
                Sent
                {payload.sentAt
                  ? ` · ${new Date(payload.sentAt).toLocaleDateString("en-GB")}`
                  : ""}
              </span>
            ) : null}
            {isConfirmed && !isCancelled ? (
              <span className="mt-2 ml-0 inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm sm:ml-2">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Confirmed · {confirmedLabel}
              </span>
            ) : null}
            {isConfirmed && confirmedByHotel && !isCancelled ? (
              <span className="mt-2 ml-0 inline-flex items-center gap-1.5 rounded-full bg-violet-700 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm sm:ml-2">
                <Building2 className="h-3.5 w-3.5" aria-hidden />
                Confirmed by hotel
                {payload.confirmedByHotelAt
                  ? ` · ${new Date(payload.confirmedByHotelAt).toLocaleDateString("en-GB")}`
                  : ""}
              </span>
            ) : null}
            {isConfirmed && isCancelled ? (
              <span className="mt-2 ml-0 inline-flex items-center gap-1.5 rounded-full bg-slate-700 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm sm:ml-2">
                <Ban className="h-3.5 w-3.5" aria-hidden />
                Cancelled · {confirmedLabel}
                {payload.cancelledAt
                  ? ` · ${new Date(payload.cancelledAt).toLocaleDateString("en-GB")}`
                  : ""}
              </span>
            ) : null}
            {paymentStatus?.isFullyPaid && !isCancelled ? (
              <span className="mt-2 ml-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm sm:ml-2">
                <Banknote className="h-3.5 w-3.5" aria-hidden />
                Paid
              </span>
            ) : null}
            {paymentStatus && !paymentStatus.isFullyPaid && !isCancelled ? (
              <span className="mt-2 ml-0 inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-950 ring-1 ring-rose-300/70 sm:ml-2">
                Balance due · {formatQuoteMoney(paymentStatus.remaining, paymentStatus.currency)}
              </span>
            ) : null}
            {isConfirmed && clientDocuments.length > 0 ? (
              <span className="mt-2 ml-0 inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm sm:ml-2">
                <FileText className="h-3.5 w-3.5" aria-hidden />
                {clientDocuments.length} document{clientDocuments.length > 1 ? "s" : ""}
              </span>
            ) : null}
            {responseTotals ? (
              <p className="mt-2 text-xs font-semibold text-emerald-900">{responseTotals}</p>
            ) : null}
            <p className="mt-1 text-xs font-medium text-slate-600">
              {request.createdAt
                ? new Date(request.createdAt).toLocaleString("en-GB")
                : "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {hasResponse && !isConfirmed ? (
              <label
                className={`inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold transition ${
                  sentToClient
                    ? "border-sky-400 bg-sky-50 text-sky-950"
                    : "border-amber-300 bg-amber-50 text-amber-950 hover:border-amber-400"
                } ${markingSent ? "opacity-60" : ""}`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  checked={sentToClient}
                  disabled={markingSent}
                  onChange={(e) => onMarkSent?.(request, e.target.checked)}
                />
                Sent
              </label>
            ) : null}
            {isConfirmed && !isCancelled ? (
              <label
                className={`inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold transition ${
                  confirmedByHotel
                    ? "border-violet-500 bg-violet-50 text-violet-950"
                    : "border-slate-300 bg-white text-slate-800 hover:border-violet-300"
                } ${markingConfirmedByHotel ? "opacity-60" : ""}`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  checked={confirmedByHotel}
                  disabled={markingConfirmedByHotel}
                  onChange={(e) => onMarkConfirmedByHotel?.(request, e.target.checked)}
                />
                Confirmed by hotel
              </label>
            ) : null}
            <GhostBtn type="button" onClick={() => onPrint(request)}>
              Print
            </GhostBtn>
            {isConfirmed && !isCancelled && paymentStatus && !paymentStatus.isFullyPaid ? (
              <PrimaryBtn
                type="button"
                className="!min-h-0 !min-w-0 !bg-emerald-600 !text-sm !px-4 !py-2 hover:!bg-emerald-700"
                onClick={() => onPay?.(request)}
              >
                <Banknote className="h-3.5 w-3.5" aria-hidden />
                Pay
              </PrimaryBtn>
            ) : null}
            {isConfirmed && !isCancelled && paymentStatus && paymentStatus.paid > 0.009 ? (
              <GhostBtn
                type="button"
                onClick={() => onPrintReceipt?.(request)}
                title={
                  paymentStatus.isFullyPaid
                    ? "Print full payment receipt"
                    : "Print deposit / payment receipt"
                }
              >
                <Receipt className="h-3.5 w-3.5" aria-hidden />
                Receipt
              </GhostBtn>
            ) : null}
            {isConfirmed ? (
              <GhostBtn type="button" onClick={() => onDocuments?.(request)}>
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Document
                {clientDocuments.length > 0 ? ` (${clientDocuments.length})` : ""}
              </GhostBtn>
            ) : null}
            {isConfirmed && !isCancelled ? (
              <GhostBtn
                type="button"
                onClick={() => onCancelConfirmation?.(request)}
                disabled={cancelling}
                className="!border-slate-400 !text-slate-800 hover:!bg-slate-100 disabled:opacity-50"
                title="Mark this confirmation as cancelled"
              >
                <Ban className="h-3.5 w-3.5" aria-hidden />
                {cancelling ? "Cancelling…" : "Cancel"}
              </GhostBtn>
            ) : null}
            <GhostBtn type="button" onClick={() => onReply(request)}>
              <MessageSquareReply className="h-3.5 w-3.5" aria-hidden />
              Reply
            </GhostBtn>
            <GhostBtn
              type="button"
              onClick={() => onConfirm(request)}
              disabled={!hasResponse}
              title={
                hasResponse
                  ? "Confirm the hotel chosen by the client"
                  : "Prepare a reply with proposed hotels first"
              }
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Confirmer
            </GhostBtn>
            <PrimaryBtn type="button" className="!min-h-0 !min-w-0 !text-sm !px-4 !py-2" onClick={() => onEdit(request)}>
              Modifier
            </PrimaryBtn>
            {canDelete ? (
              <GhostBtn
                type="button"
                onClick={() => onDelete?.(request)}
                disabled={deleting}
                className="!border-rose-300 !text-rose-800 hover:!bg-rose-50 disabled:opacity-50"
                title="Delete this quote (Ewen / Karim)"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {deleting ? "Deleting…" : "Delete"}
              </GhostBtn>
            ) : null}
          </div>
        </div>
      </div>

      {paymentStatus ? (
        <div
          className={`border-b px-4 py-4 sm:px-6 ${
            paymentStatus.isFullyPaid
              ? "border-emerald-200/90 bg-emerald-50/80"
              : "border-rose-200/90 bg-rose-50/70"
          }`}
        >
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Payment
          </p>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-2.5 shadow-sm">
              <span className="text-[11px] font-bold uppercase text-slate-500">Total</span>
              <p className="mt-0.5 font-semibold text-slate-950">
                {formatQuoteMoney(paymentStatus.grandTotal, paymentStatus.currency)}
              </p>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-2.5 shadow-sm">
              <span className="text-[11px] font-bold uppercase text-slate-500">Already paid</span>
              <p className="mt-0.5 font-semibold text-slate-950">
                {formatQuoteMoney(paymentStatus.paid, paymentStatus.currency)}
              </p>
            </div>
            {!paymentStatus.isFullyPaid ? (
              <>
                <div className="rounded-xl border border-rose-200 bg-white px-3 py-2.5 shadow-sm ring-1 ring-rose-100">
                  <span className="text-[11px] font-bold uppercase text-rose-700">Balance due</span>
                  <p className="mt-0.5 text-base font-bold text-rose-950">
                    {formatQuoteMoney(paymentStatus.remaining, paymentStatus.currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-white px-3 py-2.5 shadow-sm ring-1 ring-rose-100">
                  <span className="text-[11px] font-bold uppercase text-rose-700">
                    Date butoir · {paymentStatus.dueTitle}
                  </span>
                  <p className="mt-0.5 text-base font-bold text-rose-950">
                    {paymentStatus.dueLabel}
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5 shadow-sm sm:col-span-2">
                <span className="text-[11px] font-bold uppercase text-emerald-700">Statut</span>
                <p className="mt-0.5 font-bold text-emerald-950">Balance settled</p>
              </div>
            )}
          </div>
          {paymentStatus.entries.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {paymentStatus.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  <span>
                    {formatQuoteMoney(entry.amount, paymentStatus.currency)}
                    {entry.paidAt
                      ? ` · ${new Date(entry.paidAt).toLocaleString("en-GB")}`
                      : ""}
                  </span>
                  {entry.proofUrl ? (
                    <a
                      href={entry.proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                    >
                      Voir la preuve
                    </a>
                  ) : (
                    <span className="text-slate-500">Proof expired</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onPrintReceipt?.(request, entry.id)}
                    className="font-bold text-emerald-800 underline underline-offset-2 hover:text-emerald-950"
                  >
                    Receipt
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {isConfirmed && clientDocuments.length > 0 ? (
        <div className="border-b border-slate-200/90 bg-indigo-50/50 px-4 py-4 sm:px-6">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Linked documents
          </p>
          <ul className="space-y-2">
            {clientDocuments.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200/70 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm"
              >
                <span>
                  {hotelClientDocTypeLabel(doc.type, doc.label)}
                  {doc.fileName ? (
                    <span className="ml-2 text-xs font-medium text-slate-500">{doc.fileName}</span>
                  ) : null}
                </span>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                >
                  Ouvrir
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-b border-slate-200/90 bg-slate-50/95 px-4 py-4 sm:px-6">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Contact details</p>
        <div className="grid gap-3 text-sm text-slate-800 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm sm:col-span-2 lg:col-span-1">
            <span className="text-[11px] font-bold uppercase text-slate-500">Reference</span>
            <p className="mt-0.5 font-mono text-sm font-semibold text-slate-950">
              {shortRef || "—"}
            </p>
            {refId ? (
              <p className="mt-0.5 break-all text-[10px] font-medium text-slate-500" title={refId}>
                ID {refId}
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
            <span className="text-[11px] font-bold uppercase text-slate-500">Phone</span>
            <p className="mt-0.5 font-semibold text-slate-950">{request.phone || "—"}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
            <span className="text-[11px] font-bold uppercase text-slate-500">E-mail</span>
            <p className="mt-0.5 break-all font-semibold text-slate-950">{request.email || "—"}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
            <span className="text-[11px] font-bold uppercase text-slate-500">Check-in</span>
            <p className="mt-0.5 font-semibold text-slate-950">{formatHotelStayDate(request.arrivalDate)}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
            <span className="text-[11px] font-bold uppercase text-slate-500">Check-out</span>
            <p className="mt-0.5 font-semibold text-slate-950">{formatHotelStayDate(request.departureDate)}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
            <span className="text-[11px] font-bold uppercase text-slate-500">Adultes</span>
            <p className="mt-0.5 font-semibold text-slate-950">
              {request.adultsCount != null && request.adultsCount >= 1 ? request.adultsCount : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
            <span className="text-[11px] font-bold uppercase text-slate-500">Enfants</span>
            <p className="mt-0.5 font-semibold text-slate-950">
              {request.childrenCount != null && request.childrenCount >= 0
                ? request.childrenCount
                : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
            <span className="text-[11px] font-bold uppercase text-slate-500">Child age(s)</span>
            <p className="mt-0.5 font-semibold text-slate-950">
              {request.childAges?.trim() ? request.childAges : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
            <span className="text-[11px] font-bold uppercase text-slate-500">Budget</span>
            <p className="mt-0.5 font-semibold text-slate-950">{request.budget?.trim() ? request.budget : "—"}</p>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200/90 px-4 py-4 sm:px-6">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Board basis</p>
        <div className="flex flex-wrap gap-2">
          {boardLabels.map((label) => (
            <span
              key={label}
              className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-900 ring-1 ring-indigo-300/50"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6">
        {hasResponse || isConfirmed ? (
          <>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {isConfirmed
                ? confirmedHotels.length > 1
                  ? "Confirmed hotels"
                  : "Confirmed hotel"
                : "Quoted hotels"}
            </p>
            <ul className="space-y-2">
              {(isConfirmed ? confirmedHotels : readyHotels).map((h, index) => (
                <li
                  key={`${h.hotelName}-${h.slot || index}`}
                  className={`rounded-xl border px-3 py-2.5 text-sm shadow-sm ${
                    isConfirmed
                      ? "border-teal-200/90 bg-teal-50/80"
                      : "border-emerald-200/90 bg-emerald-50/70"
                  }`}
                >
                  <span className="text-[11px] font-bold uppercase text-emerald-800">
                    {isConfirmed
                      ? confirmedHotels.length > 1
                        ? `Confirmed ${index + 1}`
                        : "Confirmed"
                      : `Option ${index + 1}`}
                  </span>
                  <p className="mt-0.5 font-semibold text-slate-950">{h.hotelName}</p>
                  {h.roomCategory ? (
                    <p className="mt-0.5 text-xs font-medium text-slate-600">{h.roomCategory}</p>
                  ) : null}
                  {h.stayFrom || h.stayTo ? (
                    <p className="mt-0.5 text-xs font-semibold text-indigo-800">
                      {formatHotelStayDate(h.stayFrom || request.arrivalDate)} →{" "}
                      {formatHotelStayDate(h.stayTo || request.departureDate)}
                      {countHotelNights(h.stayFrom || request.arrivalDate, h.stayTo || request.departureDate) >
                      0
                        ? ` · ${countHotelNights(h.stayFrom || request.arrivalDate, h.stayTo || request.departureDate)} night${countHotelNights(h.stayFrom || request.arrivalDate, h.stayTo || request.departureDate) > 1 ? "s" : ""}`
                        : ""}
                    </p>
                  ) : null}
                  {h.quote?.total != null ? (
                    <p className="mt-1 text-sm font-bold text-emerald-900">
                      {formatQuoteMoney(h.quote.total, h.quote.currency)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            {!isConfirmed && readyHotels.length > 1 ? (
              <p className="mt-2 text-[11px] font-medium text-slate-500">
                Proposals sent / ready to send to the client (reply).
              </p>
            ) : null}
            {hotels.length > 0 ? (
              <div className="mt-4 border-t border-slate-200/80 pt-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Demande initiale (choix client)
                </p>
                <ul className="flex flex-wrap gap-2">
                  {hotels.map((h) => (
                    <li
                      key={h.label}
                      className="rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      <span className="text-[10px] font-bold uppercase text-slate-500">{h.label} · </span>
                      {h.value}
                    </li>
                  ))}
                </ul>
              </div>
            ) : request.wantsCustomOffer ? (
              <p className="mt-3 text-xs font-medium text-amber-800">{HOTEL_CUSTOM_OFFER_LABEL}</p>
            ) : null}
          </>
        ) : (
          <>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Preferred hotels
            </p>
        {request.wantsCustomOffer ? (
          <p className="rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-950">
            {HOTEL_CUSTOM_OFFER_LABEL}
          </p>
        ) : hotels.length === 0 ? (
          <p className="text-sm text-slate-600">—</p>
        ) : (
          <ul className="space-y-2">
            {hotels.map((h) => (
              <li
                key={h.label}
                className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm"
              >
                <span className="text-[11px] font-bold uppercase text-indigo-700">{h.label}</span>
                <p className="mt-0.5">{h.value}</p>
              </li>
            ))}
          </ul>
            )}
          </>
        )}
      </div>

      <div className="border-t border-slate-200/90 bg-white px-4 py-4 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Notes</p>
        <p className="mt-1 text-sm font-medium leading-relaxed text-slate-800 whitespace-pre-wrap">
          {request.notes?.trim() ? request.notes : "—"}
        </p>
      </div>
    </article>
  );
});

function HotelResponseModal({
  request,
  hotelsDraft,
  setHotelsDraft,
  catalogHotels = [],
  agentNotes = "",
  setAgentNotes,
  onClose,
  onSave,
  onPrintDevis,
  saving,
}) {
  const quotedHotels = useMemo(
    () => (request ? computeQuotesForDraft(request, hotelsDraft) : []),
    [request, hotelsDraft]
  );
  const readyCount = quotedHotels.filter((h) => proposalIsReady(h)).length;
  const clientWishes = request ? requestHotelsList(request) : [];
  const sortedCatalog = useMemo(
    () =>
      [...(catalogHotels || [])].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "en", { sensitivity: "base" })
      ),
    [catalogHotels]
  );

  if (!request) return null;

  const fullName =
    [request.firstName, request.lastName].filter(Boolean).join(" ").trim() || "Client";
  const boardLabels = boardLabelsFromViewModel(request);
  const nightsCount = countHotelNights(request.arrivalDate, request.departureDate);

  const updateProposal = (index, patch) => {
    setHotelsDraft((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  };

  const selectCatalogHotel = (index, slugOrId) => {
    const hotel =
      sortedCatalog.find((h) => String(h.slug || h.id) === String(slugOrId)) || null;
    updateProposal(index, {
      hotelName: hotel?.name || "",
      hotelManual: false,
      catalogSlug: hotel ? String(hotel.slug || hotel.id || "") : "",
      catalogHotel: hotel,
      roomCategories: roomCategoryNames(hotel?.roomCategories),
      roomCategory: "",
      roomCategoryManual: false,
    });
  };

  const selectManualHotel = (index) => {
    updateProposal(index, {
      hotelManual: true,
      catalogSlug: "",
      catalogHotel: null,
      roomCategories: [],
      roomCategory: "",
      roomCategoryManual: true,
      hotelName: "",
    });
  };

  const addProposal = () => {
    setHotelsDraft((prev) => [
      ...prev,
      createEmptyProposal(prev.length + 1, {
        stayFrom: request.arrivalDate || "",
        stayTo: request.departureDate || "",
      }),
    ]);
  };

  const removeProposal = (index) => {
    setHotelsDraft((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0
        ? next.map((h, i) => ({ ...h, slot: i + 1 }))
        : [
            createEmptyProposal(1, {
              stayFrom: request.arrivalDate || "",
              stayTo: request.departureDate || "",
            }),
          ];
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hotel-response-title"
    >
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-violet-600">
              Quote reply
            </p>
            <h2 id="hotel-response-title" className="mt-1 text-lg font-bold text-slate-900">
              {fullName}
            </h2>
            {nightsCount > 0 ? (
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-violet-600 px-3.5 py-1.5 text-sm font-extrabold text-white shadow-sm">
                {nightsCount} night{nightsCount > 1 ? "s" : ""}
                <span className="text-xs font-semibold text-violet-100">
                  {formatHotelStayDate(request.arrivalDate)} → {formatHotelStayDate(request.departureDate)}
                </span>
              </p>
            ) : null}
          </div>
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Close
          </GhostBtn>
        </div>

        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-slate-800">
          <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
            Demande client
          </p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-bold uppercase text-slate-500">Stay</dt>
              <dd className="font-semibold text-slate-950">
                {formatHotelStayDate(request.arrivalDate)} → {formatHotelStayDate(request.departureDate)}
                {nightsCount > 0 ? (
                  <span className="mt-1.5 flex">
                    <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-sm font-extrabold text-violet-900 ring-1 ring-violet-200">
                      {nightsCount} night{nightsCount > 1 ? "s" : ""}
                    </span>
                  </span>
                ) : (
                  <span className="mt-1 block text-xs font-semibold text-amber-800">
                    Missing dates — nights cannot be calculated
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase text-slate-500">Voyageurs</dt>
              <dd className="font-semibold text-slate-950">
                {request.adultsCount != null ? `${request.adultsCount} adult(s)` : "—"}
                {request.childrenCount != null && request.childrenCount > 0
                  ? ` · ${request.childrenCount} child(ren)`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase text-slate-500">Ages</dt>
              <dd className="font-semibold text-slate-950">
                {request.childAges?.trim() ? request.childAges : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase text-slate-500">Budget total</dt>
              <dd className="font-semibold text-slate-950">
                {request.budget?.trim() ? request.budget : "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-bold uppercase text-slate-500">Board basis</dt>
              <dd className="font-semibold text-slate-950">
                {boardLabels.length ? boardLabels.join(" · ") : "All inclusive"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-bold uppercase text-slate-500">Preferred hotels</dt>
              <dd className="mt-1 font-semibold text-slate-950">
                {request.wantsCustomOffer ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-950">
                    Custom offer
                  </span>
                ) : clientWishes.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {clientWishes.map((h) => (
                      <li
                        key={`wish-${h.slot}`}
                        className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-indigo-900 ring-1 ring-indigo-200"
                      >
                        {h.slot}. {h.hotelName}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {request.notes?.trim() ? (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-bold uppercase text-slate-500">Notes</dt>
                <dd className="whitespace-pre-wrap font-medium text-slate-800">{request.notes}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
            <BedDouble className="h-4 w-4 text-violet-700" aria-hidden />
              <h3 className="text-sm font-bold text-slate-900">DEVIS</h3>
            </div>
            <GhostBtn
              type="button"
              className="!min-h-0 !px-3 !py-1.5 !text-xs"
              onClick={addProposal}
              disabled={saving}
            >
              + Add a hotel
            </GhostBtn>
          </div>
          <p className="mb-3 text-xs font-medium text-slate-600">
            Choose hotels to propose (catalog or free text), dates (from / to) for
            each stay, then the price. Useful if the client changes hotels mid-stay.
          </p>

          <ul className="space-y-3">
            {hotelsDraft.map((item, index) => {
              const quoted = quotedHotels[index];
              const quote = quoted?.quote;
              const isManualHotel =
                item.hotelManual === true ||
                (Boolean(String(item.hotelName || "").trim()) && !item.catalogSlug);
              const hotelChosen = Boolean(item.catalogSlug) || isManualHotel;
              return (
                <li
                  key={`proposal-${item.slot}-${index}`}
                  className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Option {index + 1}
                    </p>
                    <GhostBtn
                      type="button"
                      className="!min-h-0 !px-2.5 !py-1 !text-xs"
                      onClick={() => removeProposal(index)}
                      disabled={saving}
                    >
                      Retirer
                    </GhostBtn>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="text-[11px] font-bold uppercase text-slate-500">Hotel</span>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                        value={isManualHotel ? "__manual__" : item.catalogSlug || ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "__manual__") {
                            selectManualHotel(index);
                          } else {
                            selectCatalogHotel(index, v);
                          }
                        }}
                        disabled={saving}
                      >
                        <option value="">— Choose a hotel —</option>
                        {sortedCatalog.map((h) => {
                          const value = String(h.slug || h.id || "");
                          return (
                            <option key={value || h.name} value={value}>
                              {h.name}
                            </option>
                          );
                        })}
                        <option value="__manual__">Autre (saisie manuelle)</option>
                      </select>
                      {isManualHotel ? (
                        <input
                          type="text"
                          className="mt-2 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                          value={item.hotelName || ""}
                          onChange={(e) =>
                            updateProposal(index, {
                              hotelName: e.target.value,
                              hotelManual: true,
                              catalogSlug: "",
                              catalogHotel: null,
                            })
                          }
                          placeholder="Hotel name (not in catalog)"
                          disabled={saving}
                          aria-label={`Manual hotel option ${index + 1}`}
                        />
                      ) : null}
                      {isManualHotel ? (
                        <span className="mt-1 block text-[11px] font-medium text-violet-700">
                          Hotel entered manually (not in catalog).
                        </span>
                      ) : null}
                      {sortedCatalog.length === 0 && !isManualHotel ? (
                        <span className="mt-1 block text-[11px] font-medium text-amber-800">
                          Catalog empty — choose “Other (manual entry)”.
                        </span>
                      ) : null}
                    </label>

                    <label className="block">
                      <span className="text-[11px] font-bold uppercase text-slate-500">
                        Du (check-in)
                      </span>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                        value={item.stayFrom || ""}
                        min={request.arrivalDate || undefined}
                        max={item.stayTo || request.departureDate || undefined}
                        onChange={(e) => updateProposal(index, { stayFrom: e.target.value })}
                        disabled={saving || !hotelChosen}
                        aria-label={`Start date option ${index + 1}`}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-bold uppercase text-slate-500">
                        Au (check-out)
                      </span>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                        value={item.stayTo || ""}
                        min={item.stayFrom || request.arrivalDate || undefined}
                        max={request.departureDate || undefined}
                        onChange={(e) => updateProposal(index, { stayTo: e.target.value })}
                        disabled={saving || !hotelChosen}
                        aria-label={`End date option ${index + 1}`}
                      />
                    </label>
                    {(() => {
                      const n = countHotelNights(
                        item.stayFrom || request.arrivalDate,
                        item.stayTo || request.departureDate
                      );
                      return n > 0 ? (
                        <p className="sm:col-span-2">
                          <span className="inline-flex items-center rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-extrabold text-white shadow-sm">
                            {n} night{n > 1 ? "s" : ""}
                          </span>
                          <span className="ml-2 text-xs font-semibold text-slate-600">
                            for this hotel
                          </span>
                        </p>
                      ) : null;
                    })()}

                    <label className="block">
                      <span className="text-[11px] font-bold uppercase text-slate-500">
                        Category (optional)
                      </span>
                      {(() => {
                        const isManual =
                          item.roomCategoryManual === true ||
                          (Boolean(item.roomCategory) &&
                            !(item.roomCategories || []).includes(item.roomCategory));
                        return (
                          <>
                            <select
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                              value={isManual ? "__manual__" : item.roomCategory || ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "__manual__") {
                                  updateProposal(index, {
                                    roomCategoryManual: true,
                                    roomCategory: isManual ? item.roomCategory : "",
                                  });
                                } else {
                                  updateProposal(index, {
                                    roomCategoryManual: false,
                                    roomCategory: v,
                                  });
                                }
                              }}
                              disabled={saving || !hotelChosen}
                            >
                              <option value="">— No category —</option>
                              {(item.roomCategories || []).map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                              <option value="__manual__">Autre (saisie manuelle)</option>
                            </select>
                            {isManual ? (
                              <input
                                type="text"
                                className="mt-2 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                                value={item.roomCategory || ""}
                                onChange={(e) =>
                                  updateProposal(index, {
                                    roomCategory: e.target.value,
                                    roomCategoryManual: true,
                                  })
                                }
                                placeholder="Ex. Deluxe Sea View"
                                disabled={saving || !hotelChosen}
                                aria-label={`Manual category option ${index + 1}`}
                              />
                            ) : null}
                            {item.roomCategory && item.catalogHotel && !isManual
                              ? (() => {
                                  const occ = formatRoomOccupancyLabel(
                                    findRoomCategory(
                                      item.catalogHotel.roomCategories,
                                      item.roomCategory
                                    )
                                  );
                                  return occ ? (
                                    <span className="mt-1 block text-[11px] font-semibold text-slate-600">
                                      {occ}
                                    </span>
                                  ) : null;
                                })()
                              : null}
                            {isManual ? (
                              <span className="mt-1 block text-[11px] font-medium text-violet-700">
                                Category entered manually (not in catalog).
                              </span>
                            ) : null}
                          </>
                        );
                      })()}
                    </label>

                    <label className="block">
                      <span className="text-[11px] font-bold uppercase text-slate-500">
                        Stay price (€)
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                        value={item.manualTotal ?? ""}
                        onChange={(e) => {
                          const parsed = parseMoneyInput(e.target.value);
                          updateProposal(index, {
                            manualTotal: e.target.value === "" ? null : parsed,
                          });
                        }}
                        placeholder="e.g. 850"
                        disabled={saving || !item.hotelName}
                        aria-label={`Stay price option ${index + 1}`}
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 pt-3">
                    {proposalIsReady(quoted) ? (
                      <p className="text-sm font-bold text-violet-950">
                        Total : {formatQuoteMoney(quote.total, quote.currency)}
                        {quote.nights ? (
                          <span className="ml-1 text-xs font-semibold text-slate-500">
                            · {quote.nights} night{quote.nights > 1 ? "s" : ""}
                          </span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-xs font-semibold text-slate-500">
                        Choose a hotel and a price
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-5">
          <label htmlFor="hotel-response-agent-notes" className="block text-sm font-bold text-slate-900">
            Note pour le devis
          </label>
          <p className="mt-1 text-xs font-medium text-slate-600">
            Optional — shown on the printed quote (e.g. conditions, availability, details).
          </p>
          <textarea
            id="hotel-response-agent-notes"
            rows={3}
            value={agentNotes}
            onChange={(e) => setAgentNotes?.(e.target.value)}
            disabled={saving}
            placeholder="e.g. Prices valid 48 hours, subject to availability…"
            className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
          />
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Cancel
          </GhostBtn>
          <GhostBtn
            type="button"
            onClick={() =>
              onPrintDevis?.(quotedHotels.filter((h) => proposalIsReady(h)), agentNotes)
            }
            disabled={saving || readyCount === 0}
          >
            Print quote
          </GhostBtn>
          <PrimaryBtn
            type="button"
            onClick={onSave}
            disabled={saving || readyCount === 0}
          >
            {saving ? "Saving…" : "Save reply"}
          </PrimaryBtn>
        </div>
      </div>
    </div>,
    document.body
  );
}

function HotelConfirmModal({
  request,
  selectedKeys,
  setSelectedKeys,
  flights,
  setFlights,
  zeroTracas,
  setZeroTracas,
  onClose,
  onConfirm,
  saving,
}) {
  if (!request) return null;

  const payload = normalizeResponsePayload(request.responsePayload);
  const options = payload.hotels.filter((h) => proposalIsReady(h));
  const fullName =
    [request.firstName, request.lastName].filter(Boolean).join(" ").trim() || "Client";
  const currentKeys = Array.isArray(selectedKeys) ? selectedKeys : [];
  const flightValues = flights || EMPTY_FLIGHTS;
  const zt = zeroTracas || EMPTY_ZERO_TRACAS;
  const ztTotal = computeZeroTracasTotal(zt);

  const toggleKey = (key) => {
    setSelectedKeys((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
    });
  };

  const updateFlight = (key, value) => {
    setFlights((prev) => ({ ...(prev || EMPTY_FLIGHTS), [key]: value }));
  };

  const updateZeroTracas = (patch) => {
    setZeroTracas((prev) => ({ ...(prev || EMPTY_ZERO_TRACAS), ...patch }));
  };

  const fieldClass =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hotel-confirm-title"
    >
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-teal-700">
              Client confirmation
            </p>
            <h2 id="hotel-confirm-title" className="mt-1 text-lg font-bold text-slate-900">
              {fullName}
            </h2>
          </div>
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Close
                                </GhostBtn>
                              </div>

        <p className="mt-4 text-sm font-medium text-slate-700">
          Select the hotel(s) confirmed by the client (one or two). The final document will show
          only the selected options, with their dates.
        </p>

        {options.length === 0 ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
            No proposals saved. Prepare a reply first.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {options.map((hotel, index) => {
              const key = hotelProposalKey(hotel, index);
              const selected = currentKeys.includes(key);
              return (
                <li key={key}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3 transition ${
                      selected
                        ? "border-teal-500 bg-teal-50/80 ring-1 ring-teal-400/40"
                        : "border-slate-200 bg-slate-50/80 hover:border-teal-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      checked={selected}
                      onChange={() => toggleKey(key)}
                      disabled={saving}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-950">{hotel.hotelName}</span>
                      <span className="mt-0.5 block text-xs font-medium text-slate-600">
                        {hotel.roomCategory ? `${hotel.roomCategory} · ` : ""}
                        {hotel.stayFrom || hotel.stayTo
                          ? `${formatHotelStayDate(hotel.stayFrom)} → ${formatHotelStayDate(hotel.stayTo)} · `
                          : ""}
                        {formatQuoteMoney(hotel.quote?.total, hotel.quote?.currency)}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">
            Vols
          </p>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Optional — dates, flight numbers, and times for airport transfers.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-600">
              Arrival date
              <input
                type="date"
                value={flightValues.arrivalDate || ""}
                onChange={(e) => updateFlight("arrivalDate", e.target.value)}
                className={fieldClass}
                disabled={saving}
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Departure date
              <input
                type="date"
                value={flightValues.departureDate || ""}
                min={flightValues.arrivalDate || undefined}
                onChange={(e) => updateFlight("departureDate", e.target.value)}
                className={fieldClass}
                disabled={saving}
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Arrival flight no.
              <input
                type="text"
                autoComplete="off"
                value={flightValues.arrivalFlightNumber}
                onChange={(e) => updateFlight("arrivalFlightNumber", e.target.value)}
                placeholder="Ex. AF1784"
                className={fieldClass}
                disabled={saving}
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Arrival time
              <input
                type="time"
                value={flightValues.arrivalTime}
                onChange={(e) => updateFlight("arrivalTime", e.target.value)}
                className={fieldClass}
                disabled={saving}
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Departure flight no.
              <input
                type="text"
                autoComplete="off"
                value={flightValues.departureFlightNumber}
                onChange={(e) => updateFlight("departureFlightNumber", e.target.value)}
                placeholder="Ex. AF1785"
                className={fieldClass}
                disabled={saving}
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Departure time
              <input
                type="time"
                value={flightValues.departureTime}
                onChange={(e) => updateFlight("departureTime", e.target.value)}
                className={fieldClass}
                disabled={saving}
              />
            </label>
                          </div>
                      </div>

        <div className="mt-6 rounded-2xl border-2 border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 to-violet-50/70 p-4 shadow-sm">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
              checked={zt.enabled === true}
              onChange={(e) => updateZeroTracas({ enabled: e.target.checked })}
              disabled={saving}
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-indigo-950">Zero Tracas</span>
              <span className="mt-0.5 block text-xs font-medium text-indigo-800/80">
                Number of visas, SIMs, and total amount entered manually.
                        </span>
            </span>
          </label>

          {zt.enabled ? (
            <div className="mt-4 border-t border-indigo-200/70 pt-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block text-xs font-bold text-slate-800">
                  Nombre de visas
                  <NumberInput
                    value={zt.visaCount ?? ""}
                    onChange={(e) =>
                      updateZeroTracas({
                        visaCount: e.target.value === "" ? "" : e.target.value,
                      })
                    }
                    placeholder="0"
                    min={0}
                    className="mt-1.5 text-sm"
                    disabled={saving}
                  />
                </label>
                <label className="block text-xs font-bold text-slate-800">
                  Nombre de SIM
                  <NumberInput
                    value={zt.simCount ?? ""}
                    onChange={(e) =>
                      updateZeroTracas({
                        simCount: e.target.value === "" ? "" : e.target.value,
                      })
                    }
                    placeholder="0"
                    min={0}
                    className="mt-1.5 text-sm"
                    disabled={saving}
                  />
                </label>
                <label className="block text-xs font-bold text-slate-800">
                  Montant total (€) <span className="text-teal-600">*</span>
                  <NumberInput
                    value={zt.manualTotal ?? ""}
                    onChange={(e) => {
                      const parsed = parseMoneyInput(e.target.value);
                      updateZeroTracas({
                        manualTotal: e.target.value === "" ? null : parsed,
                      });
                    }}
                    placeholder="e.g. 120"
                    min={0}
                    step="0.01"
                    className="mt-1.5 text-sm"
                    disabled={saving}
                  />
                      </label>
                    </div>
              {ztTotal > 0 ? (
                <p className="mt-4 text-right text-sm font-bold text-indigo-950">
                  Total Zero Tracas : {formatQuoteMoney(ztTotal, "EUR")}
                </p>
              ) : (
                <p className="mt-4 text-xs font-semibold text-indigo-800/80">
                  Indiquez au moins 1 visa ou 1 SIM, puis le montant.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Cancel
          </GhostBtn>
          <PrimaryBtn
            type="button"
            onClick={() => onConfirm?.(currentKeys, flightValues, zt)}
            disabled={saving || currentKeys.length === 0 || options.length === 0}
            className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 border-0"
          >
            {saving
              ? "Confirming…"
              : currentKeys.length > 1
                ? "Confirm both hotels and print"
                : "Confirm and print"}
          </PrimaryBtn>
        </div>
      </div>
    </div>,
    document.body
  );
}

function EditHotelRequestModal({ draft, setDraft, onClose, onSave, saving }) {
  if (!draft) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-hotel-request-title"
    >
      <div className="my-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 id="edit-hotel-request-title" className="text-lg font-bold text-slate-900">
          Edit request
        </h2>
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-600">
              First name
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={draft.firstName}
                onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Nom
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={draft.lastName}
                onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
              />
            </label>
          </div>
          <label className="block text-xs font-bold text-slate-600">
            Phone
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
          </label>
          <label className="block text-xs font-bold text-slate-600">
            E-mail
            <input
              type="email"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-600">
              Check-in
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={draft.arrivalDate || ""}
                onChange={(e) => setDraft((d) => ({ ...d, arrivalDate: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Check-out
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={draft.departureDate || ""}
                min={draft.arrivalDate || undefined}
                onChange={(e) => setDraft((d) => ({ ...d, departureDate: e.target.value }))}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-600">
              Number of adults
              <input
                type="number"
                min={1}
                max={99}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={draft.adultsCount ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    adultsCount: e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Number of children
              <input
                type="number"
                min={0}
                max={20}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={draft.childrenCount ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    childrenCount: e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
              />
            </label>
          </div>
          <label className="block text-xs font-bold text-slate-600">
            Child age(s)
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={draft.childAges || ""}
              onChange={(e) => setDraft((d) => ({ ...d, childAges: e.target.value }))}
              placeholder="e.g. 5 years, 8 years"
              disabled={
                !(
                  draft.childrenCount != null &&
                  Number.isFinite(Number(draft.childrenCount)) &&
                  Number(draft.childrenCount) > 0
                )
              }
            />
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5">
            <input
              type="checkbox"
              checked={Boolean(draft.wantsCustomOffer)}
              onChange={(e) => {
                const checked = e.target.checked;
                setDraft((d) => ({
                  ...d,
                  wantsCustomOffer: checked,
                  ...(checked
                    ? { hotelOption1: "", hotelOption2: "", hotelOption3: "" }
                    : {}),
                }));
              }}
              className="mt-0.5 h-4 w-4 rounded border-amber-400 text-indigo-600"
            />
            <span className="text-xs font-semibold text-amber-950">{HOTEL_CUSTOM_OFFER_LABEL}</span>
          </label>
          {[1, 2, 3].map((n) => (
            <label
              key={n}
              className={`block text-xs font-bold text-slate-600 ${draft.wantsCustomOffer ? "opacity-50" : ""}`}
            >
              Hotel — choice {n}
              <input
                disabled={draft.wantsCustomOffer}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"
                value={draft[`hotelOption${n}`]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [`hotelOption${n}`]: e.target.value }))
                }
              />
            </label>
          ))}
          <label className="block text-xs font-bold text-slate-600">
            Budget
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={draft.budget}
              onChange={(e) => setDraft((d) => ({ ...d, budget: e.target.value }))}
            />
          </label>
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
            Board: All inclusive
          </p>
          <label className="block text-xs font-bold text-slate-600">
            Notes
            <textarea
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Cancel
          </GhostBtn>
          <PrimaryBtn type="button" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </PrimaryBtn>
        </div>
      </div>
    </div>,
    document.body
  );
}

function HotelPaymentModal({ request, onClose, onSave, saving }) {
  const payload = normalizeResponsePayload(request?.responsePayload);
  const status = request ? getPaymentStatus(request, payload) : null;
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!request) return;
    const p = normalizeResponsePayload(request.responsePayload);
    const s = getPaymentStatus(request, p);
    if (!s) return;
    const suggested =
      s.schedule?.mode === "deposit" && s.paid < (s.schedule.dueAmount || 0)
        ? roundMoney(Math.min(s.remaining, s.schedule.dueAmount - s.paid))
        : s.remaining;
    setAmount(suggested > 0 ? String(suggested) : "");
    setFile(null);
    setPreviewUrl("");
  }, [request]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!request || !status) return null;

  const parsedAmount = parseMoneyInput(amount);
  const canSubmit =
    !saving &&
    parsedAmount != null &&
    parsedAmount > 0 &&
    parsedAmount <= status.remaining + 0.009 &&
    file;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hotel-payment-title"
    >
      <div className="my-8 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-700">
              Payment
            </p>
            <h2 id="hotel-payment-title" className="mt-1 text-lg font-bold text-slate-900">
              Record a payment
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {[request.firstName, request.lastName].filter(Boolean).join(" ") || "Client"}
            </p>
          </div>
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Close
          </GhostBtn>
        </div>

        <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
          <div className="flex justify-between gap-2">
            <span className="font-medium text-slate-600">Total confirmation</span>
            <strong>{formatQuoteMoney(status.grandTotal, status.currency)}</strong>
          </div>
          <div className="flex justify-between gap-2">
            <span className="font-medium text-slate-600">Already paid</span>
            <strong>{formatQuoteMoney(status.paid, status.currency)}</strong>
          </div>
          <div className="flex justify-between gap-2 border-t border-slate-200 pt-2">
            <span className="font-bold text-rose-800">Balance due</span>
            <strong className="text-rose-950">
              {formatQuoteMoney(status.remaining, status.currency)}
            </strong>
          </div>
          {status.dueLabel ? (
            <p className="text-xs font-semibold text-slate-600">
              Date butoir ({status.dueTitle}) : {status.dueLabel}
            </p>
          ) : null}
        </div>

        <label className="mt-5 block">
          <span className="text-[11px] font-bold uppercase text-slate-500">
            Amount paid by client (€)
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={saving}
            placeholder="ex. 250"
            aria-label="Amount paid"
          />
        </label>

        <div className="mt-4">
          <span className="text-[11px] font-bold uppercase text-slate-500">
            Preuve de paiement (image)
          </span>
          <label className="mt-1.5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-emerald-400 hover:bg-emerald-50/40">
            <Upload className="h-5 w-5 text-slate-500" aria-hidden />
            <span className="text-sm font-semibold text-slate-800">
              {file ? file.name : "Choose an image"}
            </span>
            <span className="text-[11px] font-medium text-slate-500">JPG, PNG ou WebP · max 10 Mo</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={saving}
              onChange={(e) => {
                const next = e.target.files?.[0] || null;
                if (!next) {
                  setFile(null);
                  return;
                }
                if (!next.type.startsWith("image/")) {
                  toast.warning("The file must be an image.");
                  e.target.value = "";
                  return;
                }
                if (next.size > PAYMENT_PROOF_MAX_BYTES) {
                  toast.warning("Image too large (max 10 MB).");
                  e.target.value = "";
                  return;
                }
                setFile(next);
              }}
            />
          </label>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Payment proof preview"
              className="mt-3 max-h-48 w-full rounded-xl border border-slate-200 object-contain bg-white"
            />
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Cancel
          </GhostBtn>
          <PrimaryBtn
            type="button"
            className="!bg-emerald-600 hover:!bg-emerald-700"
            disabled={!canSubmit}
            onClick={() => onSave?.({ amount: parsedAmount, file })}
          >
            {saving ? "Saving…" : "Confirm payment"}
          </PrimaryBtn>
        </div>
      </div>
    </div>,
    document.body
  );
}

function HotelDocumentsModal({ request, onClose, onAdd, onRemove, saving }) {
  const payload = normalizeResponsePayload(request?.responsePayload);
  const docs = payload.clientDocuments || [];
  const [docType, setDocType] = useState("passport");
  const [customLabel, setCustomLabel] = useState("");
  const [file, setFile] = useState(null);

  useEffect(() => {
    setDocType("passport");
    setCustomLabel("");
    setFile(null);
  }, [request?.id]);

  if (!request) return null;

  const canAdd =
    !saving &&
    file &&
    (docType !== "other" || String(customLabel || "").trim());

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hotel-documents-title"
    >
      <div className="my-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-indigo-600">
              Documents
            </p>
            <h2 id="hotel-documents-title" className="mt-1 text-lg font-bold text-slate-900">
              Documents du dossier
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {[request.firstName, request.lastName].filter(Boolean).join(" ") || "Client"}
            </p>
          </div>
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Close
          </GhostBtn>
        </div>

        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase text-slate-500">Type de document</span>
            <select
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
              value={docType}
              disabled={saving}
              onChange={(e) => setDocType(e.target.value)}
            >
              {HOTEL_CLIENT_DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {docType === "other" ? (
            <label className="block">
              <span className="text-[11px] font-bold uppercase text-slate-500">Label</span>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                disabled={saving}
                placeholder="e.g. Travel insurance"
              />
            </label>
          ) : null}

          <div>
            <span className="text-[11px] font-bold uppercase text-slate-500">Fichier</span>
            <label className="mt-1.5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40">
              <Upload className="h-5 w-5 text-slate-500" aria-hidden />
              <span className="text-sm font-semibold text-slate-800">
                {file ? file.name : "Choose a file"}
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                Image ou PDF · max 15 Mo
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                disabled={saving}
                onChange={(e) => {
                  const next = e.target.files?.[0] || null;
                  if (!next) {
                    setFile(null);
                    return;
                  }
                  const okType =
                    next.type.startsWith("image/") || next.type === "application/pdf";
                  if (!okType) {
                    toast.warning("Accepted file: image or PDF.");
                    e.target.value = "";
                    return;
                  }
                  if (next.size > CLIENT_DOC_MAX_BYTES) {
                    toast.warning("File too large (max 15 MB).");
                    e.target.value = "";
                    return;
                  }
                  setFile(next);
                }}
              />
            </label>
          </div>

          <div className="flex justify-end">
            <PrimaryBtn
              type="button"
              disabled={!canAdd}
              onClick={() => {
                onAdd?.({
                  type: docType,
                  label: docType === "other" ? String(customLabel || "").trim() : "",
                  file,
                });
                setFile(null);
                setCustomLabel("");
                setDocType("passport");
              }}
            >
              {saving ? "Uploading…" : "Add to quote"}
            </PrimaryBtn>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Already linked ({docs.length})
          </p>
          {docs.length === 0 ? (
            <p className="mt-2 text-sm font-medium text-slate-600">
              No documents for this quote.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {docs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">
                      {hotelClientDocTypeLabel(doc.type, doc.label)}
                    </p>
                    <p className="truncate text-xs font-medium text-slate-500">
                      {doc.fileName || "File"}
                      {doc.uploadedAt
                        ? ` · ${new Date(doc.uploadedAt).toLocaleDateString("en-GB")}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                    >
                      Ouvrir
                    </a>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onRemove?.(doc.id)}
                      className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      Retirer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function HotelHistoryPage({ user = null }) {
  const canDelete = canDeleteHotelRequest(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState("all"); // all | pending | to_send | sent | confirmed
  const [confirmationPayFilter, setConfirmationPayFilter] = useState("all"); // all | paid | unpaid | cancelled
  const [markingSentId, setMarkingSentId] = useState(null);
  const [markingConfirmedByHotelId, setMarkingConfirmedByHotelId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [replyRequest, setReplyRequest] = useState(null);
  const [replyHotelsDraft, setReplyHotelsDraft] = useState([]);
  const [replyAgentNotes, setReplyAgentNotes] = useState("");
  const [confirmRequest, setConfirmRequest] = useState(null);
  const [confirmSelectedKeys, setConfirmSelectedKeys] = useState([]);
  const [confirmFlights, setConfirmFlights] = useState(EMPTY_FLIGHTS);
  const [confirmZeroTracas, setConfirmZeroTracas] = useState(EMPTY_ZERO_TRACAS);
  const [payRequest, setPayRequest] = useState(null);
  const [docsRequest, setDocsRequest] = useState(null);
  const [catalogHotels, setCatalogHotels] = useState([]);
  const [saving, setSaving] = useState(false);
  const HOTEL_REQUESTS_PAGE_SIZE = 40;
  const [requestsPage, setRequestsPage] = useState(1);
  const docsCleanupDoneRef = useRef(false);
  const realtimeReloadTimerRef = useRef(null);

  const load = useCallback(async (opts = {}) => {
    const { silent = false, skipCleanup = false } = opts;
    if (!supabase) {
      setLoading(false);
      setError("Supabase is not configured.");
      return;
    }
    if (!silent) setError("");
    try {
      const { data, error: loadError } = await supabase
        .from("public_hotel_requests")
        .select(SELECT_COLUMNS)
        .eq("site_key", SITE_KEY)
        .order("created_at", { ascending: false })
        .limit(500);

      if (loadError) {
        logger.error("HotelHistoryPage load:", loadError);
        if (loadError.code === "42P01" || loadError.message?.includes("public_hotel_requests")) {
          setError(
            "Table public_hotel_requests is missing. Run supabase/supabase_public_hotel_requests_table.sql on Supabase."
          );
        } else if (/response_payload/i.test(loadError.message || "")) {
          setError(
            "Column response_payload is missing. Run supabase/supabase_public_hotel_requests_add_response_payload.sql on Supabase."
          );
        } else {
          setError(loadError.message || "Unable to load requests.");
        }
        setRows([]);
        return;
      }

      let rowsData = data || [];
      if (!skipCleanup && !docsCleanupDoneRef.current) {
        try {
          const purged = await cleanupExpiredHotelRequestDocuments({
            supabase,
            siteKey: SITE_KEY,
            rows: rowsData,
            logger,
          });
          docsCleanupDoneRef.current = true;
          if (purged > 0) {
            const { data: refreshed, error: refreshError } = await supabase
              .from("public_hotel_requests")
              .select(SELECT_COLUMNS)
              .eq("site_key", SITE_KEY)
              .order("created_at", { ascending: false })
              .limit(500);
            if (!refreshError && refreshed) {
              rowsData = refreshed;
            }
            toast.info(
              purged === 1
                ? "Documents from a past stay (departure + 2 days) were automatically deleted."
                : `Documents from ${purged} past stays (departure + 2 days) were automatically deleted.`,
              4500
            );
          }
        } catch (purgeErr) {
          logger.warn("HotelHistoryPage docs cleanup:", purgeErr);
          docsCleanupDoneRef.current = true;
        }
      }

      setRows(rowsData.map(rowToHotelRequestViewModel));
    } catch (e) {
      logger.error("HotelHistoryPage load:", e);
      if (!silent) setError("Unexpected error while loading.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const catalog = await loadPublicHotelsCatalog({ publishedOnly: true });
      if (cancelled) return;
      // Catalogue allégé pour les selects de réponse (pas besoin des galeries).
      // publishedOnly : hôtels en pause exclus du site et des listes.
      setCatalogHotels(
        (catalog.hotels || []).map((h) => ({
          name: h.name,
          slug: h.slug || h.id,
          roomCategories: Array.isArray(h.roomCategories) ? h.roomCategories : [],
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;

    const channel = supabase
      .channel("public-hotel-requests-intranet")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "public_hotel_requests",
          filter: `site_key=eq.${SITE_KEY}`,
        },
        () => {
          if (realtimeReloadTimerRef.current) {
            clearTimeout(realtimeReloadTimerRef.current);
          }
          realtimeReloadTimerRef.current = setTimeout(() => {
            void load({ silent: true, skipCleanup: true });
          }, 700);
        }
      )
      .subscribe();

    return () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [load]);

  const modalOpen = Boolean(
    editDraft || replyRequest || confirmRequest || payRequest || docsRequest
  );

  useEffect(() => {
    if (!modalOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [modalOpen]);

  useEffect(() => {
    setRequestsPage(1);
  }, [statusFilter, debouncedSearch, confirmationPayFilter]);

  useEffect(() => {
    if (statusFilter !== "confirmed") setConfirmationPayFilter("all");
  }, [statusFilter]);

  const confirmedCount = useMemo(() => rows.filter((r) => r.isConfirmed).length, [rows]);
  const pendingCount = useMemo(() => rows.filter((r) => r.isPending).length, [rows]);
  const toSendCount = useMemo(() => rows.filter((r) => r.isReadyToSend).length, [rows]);
  const sentCount = useMemo(() => rows.filter((r) => r.isSent).length, [rows]);
  const confirmedPaidCount = useMemo(
    () => rows.filter((r) => r.isConfirmationPaidOrPartial).length,
    [rows]
  );
  const confirmedUnpaidCount = useMemo(
    () => rows.filter((r) => r.isConfirmationUnpaid).length,
    [rows]
  );
  const confirmedCancelledCount = useMemo(
    () => rows.filter((r) => r.isConfirmationCancelled).length,
    [rows]
  );

  const filteredRows = useMemo(() => {
    let list = rows;
    if (statusFilter === "confirmed") {
      list = list.filter((r) => r.isConfirmed);
      if (confirmationPayFilter === "paid") {
        list = list.filter((r) => r.isConfirmationPaidOrPartial);
      } else if (confirmationPayFilter === "unpaid") {
        list = list.filter((r) => r.isConfirmationUnpaid);
      } else if (confirmationPayFilter === "cancelled") {
        list = list.filter((r) => r.isConfirmationCancelled);
      }
    } else if (statusFilter === "pending") {
      list = list.filter((r) => r.isPending);
    } else if (statusFilter === "to_send") {
      list = list.filter((r) => r.isReadyToSend);
    } else if (statusFilter === "sent") {
      list = list.filter((r) => r.isSent);
    }

    // Toutes les listes : dernières modifications en premier
    list = [...list].sort(
      (a, b) => hotelRequestResponseActivityMs(b) - hotelRequestResponseActivityMs(a)
    );

    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return list;
    const qDigits = digitsOnly(q);
    const qRef = normalizeHotelRequestRefQuery(q);
    return list.filter((r) => {
      const haystack = r.searchHaystack || "";
      if (haystack.includes(q)) return true;
      if (qDigits && (r.searchPhoneDigits || "").includes(qDigits)) return true;
      if (qRef) {
        const refRaw = String(r.id || r.supabaseId || "").toLowerCase();
        const refCompact = refRaw.replace(/-/g, "");
        const shortRef = String(r.shortRef || "").toLowerCase();
        const shortRefCore = shortRef.replace(/^h/, "");
        if (
          refRaw.includes(q) ||
          refCompact.includes(qRef) ||
          shortRef.includes(qRef) ||
          shortRefCore.includes(qRef) ||
          qRef.includes(shortRefCore)
        ) {
          return true;
        }
      }
      return false;
    });
  }, [rows, debouncedSearch, statusFilter, confirmationPayFilter]);

  const confirmationGrouped =
    statusFilter === "confirmed" && confirmationPayFilter === "all";

  const confirmedPaidRows = useMemo(
    () => (confirmationGrouped ? filteredRows.filter((r) => r.isConfirmationPaidOrPartial) : []),
    [confirmationGrouped, filteredRows]
  );
  const confirmedUnpaidRows = useMemo(
    () => (confirmationGrouped ? filteredRows.filter((r) => r.isConfirmationUnpaid) : []),
    [confirmationGrouped, filteredRows]
  );
  const confirmedCancelledRows = useMemo(
    () => (confirmationGrouped ? filteredRows.filter((r) => r.isConfirmationCancelled) : []),
    [confirmationGrouped, filteredRows]
  );

  const requestsTotalPages = confirmationGrouped
    ? 1
    : Math.max(1, Math.ceil(filteredRows.length / HOTEL_REQUESTS_PAGE_SIZE));
  const requestsCurrentPage = Math.min(requestsPage, requestsTotalPages);

  const visibleRows = useMemo(() => {
    if (confirmationGrouped) return filteredRows;
    const start = (requestsCurrentPage - 1) * HOTEL_REQUESTS_PAGE_SIZE;
    return filteredRows.slice(start, start + HOTEL_REQUESTS_PAGE_SIZE);
  }, [filteredRows, requestsCurrentPage, confirmationGrouped]);

  const handlePrint = useCallback((request) => {
    const payload = normalizeResponsePayload(request.responsePayload);
    const confirmedHotels = getConfirmedHotelsList(payload);
    const isConfirmed = confirmedHotels.length > 0;
    const quoteHotels = isConfirmed
      ? confirmedHotels
      : payload.hotels.filter((h) => proposalIsReady(h));
      const ok = printHotelRequest({
        ...request,
        quoteHotels,
      agentNotes: payload.agentNotes,
      flights: payload.flights,
      zeroTracas: payload.zeroTracas,
      documentKind: isConfirmed ? "confirmation" : "devis",
      responsePayload: payload,
    });
    if (!ok) toast.error("Unable to open print. Try again.");
  }, []);

  const handlePrintReceipt = useCallback((request, entryId = null) => {
    const ok = printHotelPaymentReceipt(
      {
        ...request,
        responsePayload: normalizeResponsePayload(request.responsePayload),
      },
      entryId ? { entryId } : null
    );
    if (!ok) toast.error("Unable to open receipt print. Try again.");
  }, []);

  const handleEdit = useCallback((request) => {
    setEditDraft({ ...request });
  }, []);

  const handleReply = useCallback(
    (request) => {
      setReplyRequest(request);
      setReplyHotelsDraft(buildResponseHotelsDraft(request, catalogHotels));
      setReplyAgentNotes(normalizeResponsePayload(request.responsePayload).agentNotes || "");
    },
    [catalogHotels]
  );

  const handleConfirmOpen = useCallback((request) => {
    const payload = normalizeResponsePayload(request.responsePayload);
    const options = payload.hotels.filter((h) => proposalIsReady(h));
    if (options.length === 0) {
      toast.warning("Prepare a reply with at least one hotel and a price first.");
      return;
    }
    const already = getConfirmedHotelsList(payload);
    let initialKeys = [];
    if (already.length > 0) {
      options.forEach((h, i) => {
        const key = hotelProposalKey(h, i);
        const matched = already.some(
          (c) =>
            hotelProposalKey(c) === key ||
            (String(c.hotelName || "").trim() === String(h.hotelName || "").trim() &&
              String(c.catalogSlug || "").trim() === String(h.catalogSlug || "").trim())
        );
        if (matched) initialKeys.push(key);
      });
    }
    if (initialKeys.length === 0) {
      // Pré-coche toutes les propositions (ex. 2 hôtels / 2 dates)
      initialKeys = options.map((h, i) => hotelProposalKey(h, i));
    }
    setConfirmRequest(request);
    setConfirmSelectedKeys(initialKeys);
    const existingFlights = normalizeFlights(payload.flights);
    setConfirmFlights({
      ...existingFlights,
      arrivalDate: existingFlights.arrivalDate || request.arrivalDate || "",
      departureDate: existingFlights.departureDate || request.departureDate || "",
    });
    setConfirmZeroTracas(payload.zeroTracas || { ...EMPTY_ZERO_TRACAS });
  }, []);

  const handlePrintDevisFromModal = useCallback(
    (quotedHotels, agentNotes = "") => {
      if (!replyRequest) return;
      const ok = printHotelRequest({
        ...replyRequest,
        quoteHotels: quotedHotels || [],
        agentNotes: String(agentNotes || "").trim(),
      });
      if (!ok) toast.error("Unable to open print. Try again.");
    },
    [replyRequest]
  );

  const handleSaveReply = useCallback(async () => {
    if (!replyRequest || !supabase) return;
    const hotels = computeQuotesForDraft(replyRequest, replyHotelsDraft).filter((h) =>
      proposalIsReady(h)
    );
    if (hotels.length === 0) {
      toast.error("Add at least one hotel with a price.");
      return;
    }
    const prev = normalizeResponsePayload(replyRequest.responsePayload);
    let confirmedHotels = getConfirmedHotelsList(prev);
    let confirmedAt = prev.confirmedAt || "";
    if (confirmedHotels.length > 0) {
      confirmedHotels = confirmedHotels.filter((confirmed) =>
        hotels.some(
          (h, i) =>
            hotelProposalKey(h, i) === hotelProposalKey(confirmed) ||
            (String(h.hotelName || "").trim() === String(confirmed.hotelName || "").trim() &&
              String(h.catalogSlug || "").trim() === String(confirmed.catalogSlug || "").trim())
        )
      );
      if (confirmedHotels.length === 0) confirmedAt = "";
    }
    setSaving(true);
    try {
      const response_payload = {
        hotels,
        agentNotes: String(replyAgentNotes || "").trim(),
        confirmedHotels,
        confirmedHotel: confirmedHotels[0] || null,
        confirmedAt: confirmedAt || undefined,
        flights: prev.flights,
        zeroTracas: prev.zeroTracas,
        sentToClient: prev.sentToClient === true,
        sentAt: prev.sentAt || undefined,
        confirmedByHotel: prev.confirmedByHotel === true,
        confirmedByHotelAt: prev.confirmedByHotelAt || undefined,
        payment: serializePayment(prev.payment),
        clientDocuments: serializeClientDocuments(prev.clientDocuments),
        cancelled: prev.cancelled === true,
        cancelledAt: prev.cancelledAt || undefined,
        updatedAt: new Date().toISOString(),
      };
      const { error: updateError } = await supabase
        .from("public_hotel_requests")
        .update({
          response_payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", replyRequest.supabaseId)
        .eq("site_key", SITE_KEY);

      if (updateError) {
        logger.error("HotelHistoryPage reply:", updateError);
        if (/response_payload/i.test(updateError.message || "")) {
          toast.error(
            "Column response_payload is missing: run supabase_public_hotel_requests_add_response_payload.sql",
            7000
          );
        } else {
          toast.error(updateError.message || "Save failed.");
        }
        return;
      }
      toast.success("Reply saved.");
      setReplyRequest(null);
      setReplyHotelsDraft([]);
      setReplyAgentNotes("");
      setStatusFilter("to_send");
      await load();
    } catch (e) {
      logger.error("HotelHistoryPage reply save:", e);
      toast.error("Unexpected error.");
    } finally {
      setSaving(false);
    }
  }, [replyRequest, replyHotelsDraft, replyAgentNotes, load]);

  const handleConfirmSave = useCallback(
    async (selectedKeysInput, flightsInput, zeroTracasInput) => {
      if (!confirmRequest || !supabase) return;
      const payload = normalizeResponsePayload(confirmRequest.responsePayload);
      const options = payload.hotels.filter((h) => proposalIsReady(h));
      const keys = Array.isArray(selectedKeysInput)
        ? selectedKeysInput
        : selectedKeysInput
          ? [selectedKeysInput]
          : [];
      const chosen = options.filter((h, i) => keys.includes(hotelProposalKey(h, i)));
      if (chosen.length === 0) {
        toast.error("Select at least one hotel confirmed by the client.");
        return;
      }
      const flights = normalizeFlights(flightsInput || confirmFlights);
      const zeroTracas = normalizeZeroTracas(zeroTracasInput || confirmZeroTracas);
      if (zeroTracas.enabled && !isZeroTracasComplete(zeroTracas)) {
        if (parseQtyInput(zeroTracas.visaCount) <= 0 && parseQtyInput(zeroTracas.simCount) <= 0) {
          toast.error("Zero Tracas: enter the number of visas and/or SIMs.");
          return;
        }
        toast.error("Zero Tracas: enter the total amount.");
        return;
      }
      if (!zeroTracas.enabled) {
        zeroTracas.visaCount = "";
        zeroTracas.simCount = "";
        zeroTracas.manualTotal = null;
      }
      setSaving(true);
      try {
        const grandTotal = computeConfirmedGrandTotal(chosen, zeroTracas);
        const existingPayment = normalizePayment(payload.payment);
        const schedule =
          existingPayment.entries.length > 0 && existingPayment.schedule
            ? { ...existingPayment.schedule, grandTotal }
            : buildPaymentSchedule(confirmRequest.arrivalDate, grandTotal, new Date());
        const response_payload = {
          hotels: payload.hotels,
          agentNotes: payload.agentNotes,
          confirmedHotels: chosen,
          confirmedHotel: chosen[0],
          confirmedAt: new Date().toISOString(),
          flights,
          zeroTracas,
          sentToClient: payload.sentToClient === true,
          sentAt: payload.sentAt || undefined,
          confirmedByHotel: payload.confirmedByHotel === true,
          confirmedByHotelAt: payload.confirmedByHotelAt || undefined,
          payment: serializePayment({
            entries: existingPayment.entries,
            schedule,
          }),
          clientDocuments: serializeClientDocuments(payload.clientDocuments),
          cancelled: payload.cancelled === true,
          cancelledAt: payload.cancelledAt || undefined,
          updatedAt: new Date().toISOString(),
        };
        const { error: updateError } = await supabase
          .from("public_hotel_requests")
          .update({
            response_payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", confirmRequest.supabaseId)
          .eq("site_key", SITE_KEY);

        if (updateError) {
          logger.error("HotelHistoryPage confirm:", updateError);
          toast.error(updateError.message || "Confirmation failed.");
          return;
        }

        const ok = printHotelRequest({
          ...confirmRequest,
          quoteHotels: chosen,
          agentNotes: payload.agentNotes,
          flights,
          zeroTracas,
          documentKind: "confirmation",
          responsePayload: response_payload,
        });
        const namesLabel = chosen.map((h) => h.hotelName).join(" + ");
        if (!ok) {
          toast.warning("Confirmation saved, but print could not open. Try again via Print.");
        } else {
          toast.success(`Confirmed: ${namesLabel}`);
        }
        setConfirmRequest(null);
        setConfirmSelectedKeys([]);
        setConfirmFlights({ ...EMPTY_FLIGHTS });
        setConfirmZeroTracas({ ...EMPTY_ZERO_TRACAS });
        await load();
      } catch (e) {
        logger.error("HotelHistoryPage confirm save:", e);
        toast.error("Unexpected error.");
      } finally {
        setSaving(false);
      }
    },
    [confirmRequest, confirmFlights, confirmZeroTracas, load]
  );

  const handleMarkSent = useCallback(
    async (request, sent) => {
      if (!request?.supabaseId || !supabase) return;
      const prev = normalizeResponsePayload(request.responsePayload);
      if (!prev.hotels.some((h) => proposalIsReady(h))) {
        toast.warning("Prepare a reply before marking as sent.");
        return;
      }
      setMarkingSentId(request.id);
      try {
        const response_payload = {
          hotels: prev.hotels,
          agentNotes: prev.agentNotes,
          confirmedHotels: prev.confirmedHotels,
          confirmedHotel: prev.confirmedHotel,
          confirmedAt: prev.confirmedAt || undefined,
          flights: prev.flights,
          zeroTracas: prev.zeroTracas,
          sentToClient: sent === true,
          sentAt: sent ? new Date().toISOString() : undefined,
          confirmedByHotel: prev.confirmedByHotel === true,
          confirmedByHotelAt: prev.confirmedByHotelAt || undefined,
          payment: serializePayment(prev.payment),
          clientDocuments: serializeClientDocuments(prev.clientDocuments),
          cancelled: prev.cancelled === true,
          cancelledAt: prev.cancelledAt || undefined,
          updatedAt: new Date().toISOString(),
        };
        const { error: updateError } = await supabase
          .from("public_hotel_requests")
          .update({
            response_payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", request.supabaseId)
          .eq("site_key", SITE_KEY);

        if (updateError) {
          logger.error("HotelHistoryPage mark sent:", updateError);
          toast.error(updateError.message || "Unable to update status.");
          return;
        }
        toast.success(sent ? "Quote marked as sent." : "Quote moved back to “Ready to send”.");
        if (sent) setStatusFilter("sent");
        await load();
      } catch (e) {
        logger.error("HotelHistoryPage mark sent:", e);
        toast.error("Unexpected error.");
      } finally {
        setMarkingSentId(null);
      }
    },
    [load]
  );

  const handleSavePayment = useCallback(
    async ({ amount, file }) => {
      if (!payRequest?.supabaseId || !supabase || !file) return;
      const prev = normalizeResponsePayload(payRequest.responsePayload);
      if (getConfirmedHotelsList(prev).length === 0) {
        toast.error("This request is not confirmed.");
        return;
      }
      const status = getPaymentStatus(payRequest, prev);
      if (!status || status.isFullyPaid) {
        toast.info("The balance is already settled.");
        return;
      }
      const paidAmount = roundMoney(Number(amount));
      if (!(paidAmount > 0) || paidAmount > status.remaining + 0.009) {
        toast.error("Invalid amount.");
        return;
      }

      setSaving(true);
      try {
        const safeName = String(file.name || "preuve")
          .replace(/[^\w.-]+/g, "_")
          .replace(/_+/g, "_");
        const objectPath = `hotel-payments/${payRequest.supabaseId}/${Date.now()}_${safeName}`;
        let usedBucket = PAYMENT_PROOF_BUCKET;
        let { error: uploadError } = await supabase.storage
          .from(usedBucket)
          .upload(objectPath, file, { upsert: false, contentType: file.type });

        if (
          uploadError &&
          (() => {
            const msg = String(uploadError.message || "").toLowerCase();
            return (
              msg.includes("bucket not found") ||
              msg.includes("not found") ||
              msg.includes("does not exist")
            );
          })()
        ) {
          usedBucket = PAYMENT_PROOF_FALLBACK_BUCKET;
          const retry = await supabase.storage
            .from(usedBucket)
            .upload(objectPath, file, { upsert: false, contentType: file.type });
          uploadError = retry.error || null;
        }

        if (uploadError) {
          logger.error("HotelHistoryPage payment upload:", uploadError);
          toast.error(uploadError.message || "Proof upload failed.");
          return;
        }

        const { data: pub } = supabase.storage.from(usedBucket).getPublicUrl(objectPath);
        const proofUrl = String(pub?.publicUrl || "").trim();
        if (!proofUrl) {
          toast.error("Proof URL not found after upload.");
          return;
        }

        const existing = normalizePayment(prev.payment);
        const schedule =
          existing.schedule ||
          buildPaymentSchedule(
            payRequest.arrivalDate,
            status.grandTotal,
            prev.confirmedAt ? new Date(prev.confirmedAt) : new Date()
          );
        const entry = {
          id: `${Date.now()}-${paidAmount}`,
          amount: paidAmount,
          paidAt: new Date().toISOString(),
          proofUrl,
          proofFileName: file.name || safeName,
        };
        const response_payload = {
          hotels: prev.hotels,
          agentNotes: prev.agentNotes,
          confirmedHotels: prev.confirmedHotels,
          confirmedHotel: prev.confirmedHotel,
          confirmedAt: prev.confirmedAt || undefined,
          flights: prev.flights,
          zeroTracas: prev.zeroTracas,
          sentToClient: prev.sentToClient === true,
          sentAt: prev.sentAt || undefined,
          confirmedByHotel: prev.confirmedByHotel === true,
          confirmedByHotelAt: prev.confirmedByHotelAt || undefined,
          payment: serializePayment({
            entries: [...existing.entries, entry],
            schedule,
          }),
          clientDocuments: serializeClientDocuments(prev.clientDocuments),
          cancelled: prev.cancelled === true,
          cancelledAt: prev.cancelledAt || undefined,
          updatedAt: new Date().toISOString(),
        };

        const { error: updateError } = await supabase
          .from("public_hotel_requests")
          .update({
            response_payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", payRequest.supabaseId)
          .eq("site_key", SITE_KEY);

        if (updateError) {
          logger.error("HotelHistoryPage payment save:", updateError);
          toast.error(updateError.message || "Unable to save payment.");
          return;
        }

        const nextRemaining = roundMoney(status.remaining - paidAmount);
        toast.success(
          nextRemaining <= 0.009
            ? "Payment saved — balance settled."
            : `Payment saved — remaining ${formatQuoteMoney(nextRemaining, status.currency)}.`
        );
        const receiptOk = printHotelPaymentReceipt(
          {
            ...payRequest,
            responsePayload: normalizeResponsePayload(response_payload),
          },
          { entryId: entry.id }
        );
        if (!receiptOk) {
          toast.warning("Payment saved — receipt print could not open. Use the Receipt button.");
        }
        setPayRequest(null);
        setStatusFilter("confirmed");
        setConfirmationPayFilter("paid");
        await load();
      } catch (e) {
        logger.error("HotelHistoryPage payment:", e);
        toast.error("Unexpected error.");
      } finally {
        setSaving(false);
      }
    },
    [payRequest, load]
  );

  const handleDeleteRequest = useCallback(
    async (request) => {
      if (!canDeleteHotelRequest(user)) {
        toast.error("You are not allowed to delete this quote.");
        return;
      }
      if (!request?.supabaseId || !supabase) return;
      const ok = window.confirm(
        "Are you sure you want to delete this booking?"
      );
      if (!ok) return;

      setDeletingId(request.id);
      try {
        const payload = normalizeResponsePayload(request.responsePayload);
        const refs = [];
        for (const d of payload.clientDocuments || []) {
          const storageRef = storageRefFromPublicUrl(d.url);
          if (storageRef?.bucket && storageRef?.path) refs.push(storageRef);
        }
        for (const e of normalizePayment(payload.payment).entries) {
          const storageRef = storageRefFromPublicUrl(e.proofUrl);
          if (storageRef?.bucket && storageRef?.path) refs.push(storageRef);
        }
        if (refs.length > 0) {
          const byBucket = new Map();
          for (const r of refs) {
            if (!byBucket.has(r.bucket)) byBucket.set(r.bucket, []);
            byBucket.get(r.bucket).push(r.path);
          }
          for (const [bucket, paths] of byBucket) {
            const unique = [...new Set(paths)];
            const { error: storageError } = await supabase.storage.from(bucket).remove(unique);
            if (storageError) {
              logger.warn("HotelHistoryPage delete storage:", bucket, storageError);
            }
          }
        }

        const { error: deleteError } = await supabase
          .from("public_hotel_requests")
          .delete()
          .eq("id", request.supabaseId)
          .eq("site_key", SITE_KEY);

        if (deleteError) {
          logger.error("HotelHistoryPage delete:", deleteError);
          toast.error(deleteError.message || "Unable to delete quote.");
          return;
        }

        toast.success("Quote deleted.");
        if (payRequest?.id === request.id) setPayRequest(null);
        if (docsRequest?.id === request.id) setDocsRequest(null);
        if (replyRequest?.id === request.id) setReplyRequest(null);
        if (confirmRequest?.id === request.id) setConfirmRequest(null);
        if (editDraft?.id === request.id) setEditDraft(null);
        await load();
      } catch (e) {
        logger.error("HotelHistoryPage delete:", e);
        toast.error("Unexpected error.");
      } finally {
        setDeletingId(null);
      }
    },
    [user, load, payRequest, docsRequest, replyRequest, confirmRequest, editDraft]
  );

  const buildResponsePayloadFromPrev = useCallback((prev, overrides = {}) => {
    return {
      hotels: prev.hotels,
      agentNotes: prev.agentNotes,
      confirmedHotels: prev.confirmedHotels,
      confirmedHotel: prev.confirmedHotel,
      confirmedAt: prev.confirmedAt || undefined,
      flights: prev.flights,
      zeroTracas: prev.zeroTracas,
      sentToClient: prev.sentToClient === true,
      sentAt: prev.sentAt || undefined,
      confirmedByHotel: prev.confirmedByHotel === true,
      confirmedByHotelAt: prev.confirmedByHotelAt || undefined,
      payment: serializePayment(prev.payment),
      clientDocuments: serializeClientDocuments(prev.clientDocuments),
      cancelled: prev.cancelled === true,
      cancelledAt: prev.cancelledAt || undefined,
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }, []);

  const handleMarkConfirmedByHotel = useCallback(
    async (request, checked) => {
      if (!request?.supabaseId || !supabase) return;
      if (!isHotelRequestConfirmed(request)) {
        toast.error("Only confirmations can be marked as confirmed by the hotel.");
        return;
      }
      const payload = normalizeResponsePayload(request.responsePayload);
      if (payload.cancelled === true || payload.cancelledAt) {
        toast.warning("This confirmation is cancelled.");
        return;
      }
      setMarkingConfirmedByHotelId(request.id);
      try {
        const response_payload = buildResponsePayloadFromPrev(payload, {
          confirmedByHotel: checked === true,
          confirmedByHotelAt: checked ? new Date().toISOString() : undefined,
        });
        const { error: updateError } = await supabase
          .from("public_hotel_requests")
          .update({
            response_payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", request.supabaseId)
          .eq("site_key", SITE_KEY);

        if (updateError) {
          logger.error("HotelHistoryPage mark confirmed by hotel:", updateError);
          toast.error(updateError.message || "Unable to update status.");
          return;
        }
        toast.success(
          checked ? "Marked as confirmed by hotel." : "Hotel confirmation unchecked."
        );
        // Optimistic local update
        setRows((prev) =>
          prev.map((r) =>
            r.id === request.id
              ? { ...r, responsePayload: normalizeResponsePayload(response_payload) }
              : r
          )
        );
        await load({ silent: true, skipCleanup: true });
      } catch (e) {
        logger.error("HotelHistoryPage mark confirmed by hotel:", e);
        toast.error("Unexpected error.");
      } finally {
        setMarkingConfirmedByHotelId(null);
      }
    },
    [load, buildResponsePayloadFromPrev]
  );

  const handleCancelConfirmation = useCallback(
    async (request) => {
      if (!request?.supabaseId || !supabase) return;
      if (!isHotelRequestConfirmed(request)) {
        toast.error("Only confirmations can be cancelled.");
        return;
      }
      const payload = normalizeResponsePayload(request.responsePayload);
      if (payload.cancelled === true || payload.cancelledAt) {
        toast.warning("This confirmation is already cancelled.");
        return;
      }
      const fullName =
        [request.firstName, request.lastName].filter(Boolean).join(" ").trim() || "this client";
      const short = formatHotelRequestShortRef(request.id);
      const ok = window.confirm(
        `Cancel the confirmation for ${fullName}${short ? ` (ref. ${short})` : ""}?\n\nIt will appear in the “Cancelled” sub-list.`
      );
      if (!ok) return;

      setCancellingId(request.id);
      try {
        const response_payload = buildResponsePayloadFromPrev(payload, {
          cancelled: true,
          cancelledAt: new Date().toISOString(),
        });
        const { error: updateError } = await supabase
          .from("public_hotel_requests")
          .update({
            response_payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", request.supabaseId)
          .eq("site_key", SITE_KEY);

        if (updateError) {
          logger.error("HotelHistoryPage cancel confirmation:", updateError);
          toast.error(updateError.message || "Unable to cancel confirmation.");
          return;
        }

        toast.success("Confirmation marked as cancelled.");
        setStatusFilter("confirmed");
        setConfirmationPayFilter("cancelled");
        await load();
      } catch (e) {
        logger.error("HotelHistoryPage cancel confirmation:", e);
        toast.error("Unexpected error.");
      } finally {
        setCancellingId(null);
      }
    },
    [load, buildResponsePayloadFromPrev]
  );

  const handleAddClientDocument = useCallback(
    async ({ type, label, file }) => {
      if (!docsRequest?.supabaseId || !supabase || !file) return;
      if (!isHotelRequestConfirmed(docsRequest)) {
        toast.error("Documents are only available on a confirmation.");
        return;
      }
      setSaving(true);
      try {
        const safeName = String(file.name || "document")
          .replace(/[^\w.-]+/g, "_")
          .replace(/_+/g, "_");
        const objectPath = `hotel-client-docs/${docsRequest.supabaseId}/${Date.now()}_${safeName}`;
        let usedBucket = PAYMENT_PROOF_BUCKET;
        let { error: uploadError } = await supabase.storage
          .from(usedBucket)
          .upload(objectPath, file, { upsert: false, contentType: file.type || undefined });

        if (
          uploadError &&
          (() => {
            const msg = String(uploadError.message || "").toLowerCase();
            return (
              msg.includes("bucket not found") ||
              msg.includes("not found") ||
              msg.includes("does not exist")
            );
          })()
        ) {
          usedBucket = PAYMENT_PROOF_FALLBACK_BUCKET;
          const retry = await supabase.storage
            .from(usedBucket)
            .upload(objectPath, file, { upsert: false, contentType: file.type || undefined });
          uploadError = retry.error || null;
        }

        if (uploadError) {
          logger.error("HotelHistoryPage doc upload:", uploadError);
          toast.error(uploadError.message || "Document upload failed.");
          return;
        }

        const { data: pub } = supabase.storage.from(usedBucket).getPublicUrl(objectPath);
        const url = String(pub?.publicUrl || "").trim();
        if (!url) {
          toast.error("Document URL not found after upload.");
          return;
        }

        const prev = normalizeResponsePayload(docsRequest.responsePayload);
        const entry = {
          id: `${Date.now()}-${safeName}`,
          type: String(type || "other"),
          label: String(label || "").trim(),
          fileName: file.name || safeName,
          url,
          mimeType: file.type || "",
          uploadedAt: new Date().toISOString(),
        };
        const nextDocs = [...prev.clientDocuments, entry];
        const response_payload = buildResponsePayloadFromPrev(prev, {
          clientDocuments: serializeClientDocuments(nextDocs),
        });

        const { error: updateError } = await supabase
          .from("public_hotel_requests")
          .update({
            response_payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", docsRequest.supabaseId)
          .eq("site_key", SITE_KEY);

        if (updateError) {
          logger.error("HotelHistoryPage doc save:", updateError);
          toast.error(updateError.message || "Unable to save document.");
          return;
        }

        toast.success("Document added to quote.");
        setDocsRequest((r) =>
          r ? { ...r, responsePayload: normalizeResponsePayload(response_payload) } : null
        );
        setStatusFilter("confirmed");
        await load();
      } catch (e) {
        logger.error("HotelHistoryPage doc add:", e);
        toast.error("Unexpected error.");
      } finally {
        setSaving(false);
      }
    },
    [docsRequest, load, buildResponsePayloadFromPrev]
  );

  const handleRemoveClientDocument = useCallback(
    async (docId) => {
      if (!docsRequest?.supabaseId || !supabase || !docId) return;
      const prev = normalizeResponsePayload(docsRequest.responsePayload);
      const nextDocs = prev.clientDocuments.filter((d) => d.id !== docId);
      if (nextDocs.length === prev.clientDocuments.length) return;

      setSaving(true);
      try {
        const response_payload = buildResponsePayloadFromPrev(prev, {
          clientDocuments: serializeClientDocuments(nextDocs),
        });
        const { error: updateError } = await supabase
          .from("public_hotel_requests")
          .update({
            response_payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", docsRequest.supabaseId)
          .eq("site_key", SITE_KEY);

        if (updateError) {
          logger.error("HotelHistoryPage doc remove:", updateError);
          toast.error(updateError.message || "Unable to remove document.");
          return;
        }

        toast.success("Document removed from quote.");
        setDocsRequest((r) =>
          r ? { ...r, responsePayload: normalizeResponsePayload(response_payload) } : null
        );
        await load();
      } catch (e) {
        logger.error("HotelHistoryPage doc remove:", e);
        toast.error("Unexpected error.");
      } finally {
        setSaving(false);
      }
    },
    [docsRequest, load, buildResponsePayloadFromPrev]
  );

  const handleSaveEdit = useCallback(async () => {
    if (!editDraft || !supabase) return;
    if (!editDraft.firstName.trim() || !editDraft.lastName.trim()) {
      toast.error("First and last name are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = viewModelToPayload(editDraft);
      const { error: updateError } = await supabase
        .from("public_hotel_requests")
        .update(payload)
        .eq("id", editDraft.supabaseId)
        .eq("site_key", SITE_KEY);

      if (updateError) {
        logger.error("HotelHistoryPage update:", updateError);
        toast.error(updateError.message || "Save failed.");
        return;
      }
      toast.success("Request updated.");
      setEditDraft(null);
      await load();
    } catch (e) {
      logger.error("HotelHistoryPage save:", e);
      toast.error("Unexpected error.");
    } finally {
      setSaving(false);
    }
  }, [editDraft, load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">
        Loading hotel requests…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-900">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-xs font-medium text-slate-700">
        Requests received via the public form{" "}
        <strong className="text-indigo-800">/demande-hotel</strong>. Data comes from
        Supabase and updates in real time.
      </p>

      <div className="space-y-3 rounded-2xl border border-indigo-200/80 bg-indigo-50/40 px-4 py-3 shadow-sm sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill
            type="button"
            tone="light"
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            className="!px-3.5 !py-2 !text-xs"
          >
            All ({rows.length})
          </Pill>
          <Pill
            type="button"
            tone="light"
            active={statusFilter === "pending"}
            onClick={() => setStatusFilter("pending")}
            className="!px-3.5 !py-2 !text-xs"
          >
            Pending ({pendingCount})
          </Pill>
          <Pill
            type="button"
            tone="light"
            active={statusFilter === "to_send"}
            onClick={() => setStatusFilter("to_send")}
            className="!px-3.5 !py-2 !text-xs"
          >
            Ready to send to client ({toSendCount})
          </Pill>
          <Pill
            type="button"
            tone="light"
            active={statusFilter === "sent"}
            onClick={() => setStatusFilter("sent")}
            className="!px-3.5 !py-2 !text-xs"
          >
            Sent ({sentCount})
          </Pill>
          <Pill
            type="button"
            tone="light"
            active={statusFilter === "confirmed"}
            onClick={() => setStatusFilter("confirmed")}
            className="!px-3.5 !py-2 !text-xs"
          >
            Confirmations ({confirmedCount})
          </Pill>
        </div>

        {statusFilter === "confirmed" ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-indigo-200/70 pt-3">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-indigo-900/70">
              Payment
            </span>
            <Pill
              type="button"
              tone="light"
              active={confirmationPayFilter === "all"}
              onClick={() => setConfirmationPayFilter("all")}
              className="!px-3 !py-1.5 !text-[11px]"
            >
              All ({confirmedCount})
            </Pill>
            <Pill
              type="button"
              tone="light"
              active={confirmationPayFilter === "paid"}
              onClick={() => setConfirmationPayFilter("paid")}
              className="!px-3 !py-1.5 !text-[11px]"
            >
              Paid / partial ({confirmedPaidCount})
            </Pill>
            <Pill
              type="button"
              tone="light"
              active={confirmationPayFilter === "unpaid"}
              onClick={() => setConfirmationPayFilter("unpaid")}
              className="!px-3 !py-1.5 !text-[11px]"
            >
              Unpaid ({confirmedUnpaidCount})
            </Pill>
            <Pill
              type="button"
              tone="light"
              active={confirmationPayFilter === "cancelled"}
              onClick={() => setConfirmationPayFilter("cancelled")}
              className="!px-3 !py-1.5 !text-[11px]"
            >
              Cancelled ({confirmedCancelledCount})
            </Pill>
          </div>
        ) : null}

        <div>
          <label
            htmlFor="hotel-history-search"
            className="block text-xs font-bold uppercase tracking-wide text-indigo-950"
          >
          Search
        </label>
        <TextInput
          id="hotel-history-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email, phone, hotel, or reference"
          className="mt-2"
        />
        <p className="mt-2 text-[11px] font-medium text-indigo-900/80">
          {filteredRows.length} request{filteredRows.length > 1 ? "s" : ""}
            {statusFilter === "confirmed"
              ? confirmationPayFilter === "paid"
                ? " paid / partial"
                : confirmationPayFilter === "unpaid"
                  ? " unpaid"
                  : confirmationPayFilter === "cancelled"
                    ? " cancelled"
                    : " confirmed"
              : statusFilter === "pending"
                ? " pending"
                : statusFilter === "to_send"
                  ? " to send"
                  : statusFilter === "sent"
                    ? " sent"
                    : ""}
            {debouncedSearch.trim() ? " · search" : ""}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-700">
          No hotel requests yet.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-950">
          {statusFilter === "confirmed"
            ? confirmationPayFilter === "paid"
              ? "No paid or partially paid confirmations."
              : confirmationPayFilter === "unpaid"
                ? "No unpaid confirmations."
                : confirmationPayFilter === "cancelled"
                  ? "No cancelled confirmations."
                  : "No confirmations yet."
            : statusFilter === "pending"
              ? "No new pending requests today."
              : statusFilter === "to_send"
                ? "No quotes ready to send. Prepare a reply first."
                : statusFilter === "sent"
                  ? "No quotes marked as sent yet."
                  : "No requests match your search."}
        </div>
      ) : confirmationGrouped ? (
        <div className="space-y-10">
          <section aria-labelledby="hotel-conf-paid-heading" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-emerald-200/80 pb-2">
              <div>
                <h3
                  id="hotel-conf-paid-heading"
                  className="text-sm font-bold tracking-tight text-emerald-950"
                >
                  Paid or partially paid
                </h3>
                <p className="mt-0.5 text-xs text-emerald-800/80">
                  At least one payment recorded on the confirmation.
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold tabular-nums text-emerald-900 ring-1 ring-emerald-300/60">
                {confirmedPaidRows.length}
              </span>
            </div>
            {confirmedPaidRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-5 text-center text-sm font-medium text-emerald-900/80">
                No paid or partially paid confirmations.
              </p>
            ) : (
              <div className="space-y-8">
                {confirmedPaidRows.map((request) => (
                  <HotelRequestCard
                    key={request.id}
                    request={request}
                    onPrint={handlePrint}
                    onReply={handleReply}
                    onConfirm={handleConfirmOpen}
                    onEdit={handleEdit}
                    onMarkSent={handleMarkSent}
                    markingSent={markingSentId === request.id}
                    onMarkConfirmedByHotel={handleMarkConfirmedByHotel}
                    markingConfirmedByHotel={markingConfirmedByHotelId === request.id}
                    onPay={setPayRequest}
                    onDocuments={setDocsRequest}
                    onPrintReceipt={handlePrintReceipt}
                    onCancelConfirmation={handleCancelConfirmation}
                    cancelling={cancellingId === request.id}
                    canDelete={canDelete}
                    onDelete={handleDeleteRequest}
                    deleting={deletingId === request.id}
                  />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="hotel-conf-unpaid-heading" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-amber-200/80 pb-2">
              <div>
                <h3
                  id="hotel-conf-unpaid-heading"
                  className="text-sm font-bold tracking-tight text-amber-950"
                >
                  Unpaid
                </h3>
                <p className="mt-0.5 text-xs text-amber-800/80">
                  Confirmations with no payment recorded.
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold tabular-nums text-amber-950 ring-1 ring-amber-300/60">
                {confirmedUnpaidRows.length}
              </span>
            </div>
            {confirmedUnpaidRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-amber-200 bg-amber-50/50 px-4 py-5 text-center text-sm font-medium text-amber-900/80">
                No unpaid confirmations.
              </p>
            ) : (
              <div className="space-y-8">
                {confirmedUnpaidRows.map((request) => (
                  <HotelRequestCard
                    key={request.id}
                    request={request}
                    onPrint={handlePrint}
                    onReply={handleReply}
                    onConfirm={handleConfirmOpen}
                    onEdit={handleEdit}
                    onMarkSent={handleMarkSent}
                    markingSent={markingSentId === request.id}
                    onMarkConfirmedByHotel={handleMarkConfirmedByHotel}
                    markingConfirmedByHotel={markingConfirmedByHotelId === request.id}
                    onPay={setPayRequest}
                    onDocuments={setDocsRequest}
                    onPrintReceipt={handlePrintReceipt}
                    onCancelConfirmation={handleCancelConfirmation}
                    cancelling={cancellingId === request.id}
                    canDelete={canDelete}
                    onDelete={handleDeleteRequest}
                    deleting={deletingId === request.id}
                  />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="hotel-conf-cancelled-heading" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-300/80 pb-2">
              <div>
                <h3
                  id="hotel-conf-cancelled-heading"
                  className="text-sm font-bold tracking-tight text-slate-900"
                >
                  Cancelled
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Confirmations marked as cancelled.
                </p>
              </div>
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold tabular-nums text-slate-800 ring-1 ring-slate-300/70">
                {confirmedCancelledRows.length}
              </span>
            </div>
            {confirmedCancelledRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-5 text-center text-sm font-medium text-slate-600">
                No cancelled confirmations.
              </p>
            ) : (
              <div className="space-y-8">
                {confirmedCancelledRows.map((request) => (
                  <HotelRequestCard
                    key={request.id}
                    request={request}
                    onPrint={handlePrint}
                    onReply={handleReply}
                    onConfirm={handleConfirmOpen}
                    onEdit={handleEdit}
                    onMarkSent={handleMarkSent}
                    markingSent={markingSentId === request.id}
                    onMarkConfirmedByHotel={handleMarkConfirmedByHotel}
                    markingConfirmedByHotel={markingConfirmedByHotelId === request.id}
                    onPay={setPayRequest}
                    onDocuments={setDocsRequest}
                    onPrintReceipt={handlePrintReceipt}
                    onCancelConfirmation={handleCancelConfirmation}
                    cancelling={cancellingId === request.id}
                    canDelete={canDelete}
                    onDelete={handleDeleteRequest}
                    deleting={deletingId === request.id}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-8">
          {visibleRows.map((request) => (
            <HotelRequestCard
              key={request.id}
              request={request}
              onPrint={handlePrint}
              onReply={handleReply}
              onConfirm={handleConfirmOpen}
              onEdit={handleEdit}
              onMarkSent={handleMarkSent}
              markingSent={markingSentId === request.id}
              onMarkConfirmedByHotel={handleMarkConfirmedByHotel}
              markingConfirmedByHotel={markingConfirmedByHotelId === request.id}
              onPay={setPayRequest}
              onDocuments={setDocsRequest}
              onPrintReceipt={handlePrintReceipt}
              onCancelConfirmation={handleCancelConfirmation}
              cancelling={cancellingId === request.id}
              canDelete={canDelete}
              onDelete={handleDeleteRequest}
              deleting={deletingId === request.id}
            />
          ))}
          {!confirmationGrouped && requestsTotalPages > 1 ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              <GhostBtn
                type="button"
                onClick={() => setRequestsPage((p) => Math.max(1, p - 1))}
                disabled={requestsCurrentPage === 1}
                className="!px-4 !py-2"
              >
                ← Previous
              </GhostBtn>
              <span className="px-3 text-sm font-semibold text-slate-600">
                Page {requestsCurrentPage} of {requestsTotalPages}
              </span>
              <GhostBtn
                type="button"
                onClick={() => setRequestsPage((p) => Math.min(requestsTotalPages, p + 1))}
                disabled={requestsCurrentPage === requestsTotalPages}
                className="!px-4 !py-2"
              >
                Next →
              </GhostBtn>
            </div>
          ) : null}
        </div>
      )}

      <HotelResponseModal
        request={replyRequest}
        hotelsDraft={replyHotelsDraft}
        setHotelsDraft={setReplyHotelsDraft}
        catalogHotels={catalogHotels}
        agentNotes={replyAgentNotes}
        setAgentNotes={setReplyAgentNotes}
        onClose={() => {
          if (!saving) {
            setReplyRequest(null);
            setReplyHotelsDraft([]);
            setReplyAgentNotes("");
          }
        }}
        onSave={handleSaveReply}
        onPrintDevis={handlePrintDevisFromModal}
        saving={saving}
      />

      <HotelConfirmModal
        request={confirmRequest}
        selectedKeys={confirmSelectedKeys}
        setSelectedKeys={setConfirmSelectedKeys}
        flights={confirmFlights}
        setFlights={setConfirmFlights}
        zeroTracas={confirmZeroTracas}
        setZeroTracas={setConfirmZeroTracas}
        onClose={() => {
          if (!saving) {
            setConfirmRequest(null);
            setConfirmSelectedKeys([]);
            setConfirmFlights({ ...EMPTY_FLIGHTS });
            setConfirmZeroTracas({ ...EMPTY_ZERO_TRACAS });
          }
        }}
        onConfirm={handleConfirmSave}
        saving={saving}
      />

      <EditHotelRequestModal
        draft={editDraft}
        setDraft={setEditDraft}
        onClose={() => !saving && setEditDraft(null)}
        onSave={handleSaveEdit}
        saving={saving}
      />

      <HotelPaymentModal
        request={payRequest}
        onClose={() => !saving && setPayRequest(null)}
        onSave={handleSavePayment}
        saving={saving}
      />

      <HotelDocumentsModal
        request={docsRequest}
        onClose={() => !saving && setDocsRequest(null)}
        onAdd={handleAddClientDocument}
        onRemove={handleRemoveClientDocument}
        saving={saving}
      />
    </div>
  );
}
