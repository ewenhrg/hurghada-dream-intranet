import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Banknote, BedDouble, CheckCircle2, FileText, MessageSquareReply, Receipt, Trash2, Upload } from "lucide-react";
import { supabase } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { logger } from "../utils/logger";
import { toast } from "../utils/toast.js";
import { useDebounce } from "../hooks/useDebounce";
import { GhostBtn, NumberInput, Pill, PrimaryBtn, TextInput } from "../components/ui";
import { printHotelRequest, printHotelPaymentReceipt } from "../utils/hotelRequestPrint";
import { formatHotelStayDate } from "../utils/hotelRequestDates";
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

function normalizeResponsePayload(raw) {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const hotels = Array.isArray(base.hotels) ? base.hotels : [];
  const normalizedHotels = hotels
      .map((h) => ({
        slot: Number(h?.slot) || 0,
        hotelName: String(h?.hotelName || "").trim(),
        roomCategory: String(h?.roomCategory || "").trim(),
        catalogSlug: String(h?.catalogSlug || "").trim(),
      includeTransfer: h?.includeTransfer === true,
        manualTotal:
          h?.manualTotal != null && Number.isFinite(Number(h.manualTotal))
            ? roundMoney(Number(h.manualTotal))
            : null,
        quote: h?.quote && typeof h.quote === "object" ? serializeQuote(h.quote) : null,
      }))
    .filter((h) => h.hotelName);

  let confirmedHotel = null;
  if (base.confirmedHotel && typeof base.confirmedHotel === "object") {
    const name = String(base.confirmedHotel.hotelName || "").trim();
    if (name) {
      confirmedHotel = {
        slot: Number(base.confirmedHotel.slot) || 0,
        hotelName: name,
        roomCategory: String(base.confirmedHotel.roomCategory || "").trim(),
        catalogSlug: String(base.confirmedHotel.catalogSlug || "").trim(),
        includeTransfer: base.confirmedHotel.includeTransfer === true,
        manualTotal:
          base.confirmedHotel.manualTotal != null &&
          Number.isFinite(Number(base.confirmedHotel.manualTotal))
            ? roundMoney(Number(base.confirmedHotel.manualTotal))
            : null,
        quote:
          base.confirmedHotel.quote && typeof base.confirmedHotel.quote === "object"
            ? serializeQuote(base.confirmedHotel.quote)
            : null,
      };
    }
  }

  return {
    agentNotes: String(base.agentNotes || base.notes || "").trim(),
    hotels: normalizedHotels,
    confirmedHotel,
    confirmedAt: base.confirmedAt || "",
    flights: normalizeFlights(base.flights),
    zeroTracas: normalizeZeroTracas(base.zeroTracas),
    sentToClient: base.sentToClient === true,
    sentAt: base.sentAt || "",
    payment: normalizePayment(base.payment),
    clientDocuments: normalizeClientDocuments(base.clientDocuments),
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

function flightsAreComplete(flights) {
  const f = normalizeFlights(flights);
  return Boolean(
    f.arrivalFlightNumber &&
      f.arrivalTime &&
      f.arrivalDate &&
      f.departureFlightNumber &&
      f.departureTime &&
      f.departureDate
  );
}

function isHotelRequestConfirmed(request) {
  const payload = normalizeResponsePayload(request?.responsePayload);
  return Boolean(payload.confirmedHotel && proposalIsReady(payload.confirmedHotel));
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
  if (isHotelRequestConfirmed(request)) return false;
  if (!requestCreatedOnOrAfterToday(request)) return false;
  const payload = normalizeResponsePayload(request?.responsePayload);
  return !payload.hotels.some((h) => proposalIsReady(h));
}

/** Réponse préparée, pas encore envoyée ni confirmée. */
function isHotelRequestReadyToSend(request) {
  if (isHotelRequestConfirmed(request)) return false;
  const payload = normalizeResponsePayload(request?.responsePayload);
  if (payload.sentToClient) return false;
  return payload.hotels.some((h) => proposalIsReady(h));
}

/** Devis marqué comme envoyé au client (pas encore confirmé). */
function isHotelRequestSent(request) {
  if (isHotelRequestConfirmed(request)) return false;
  const payload = normalizeResponsePayload(request?.responsePayload);
  return payload.sentToClient === true && payload.hotels.some((h) => proposalIsReady(h));
}

/** Confirmation avec au moins un paiement enregistré (partiel ou total) — reste aussi dans Confirmations. */
function isHotelRequestInPayerList(request) {
  if (!isHotelRequestConfirmed(request)) return false;
  const payload = normalizeResponsePayload(request?.responsePayload);
  return normalizePayment(payload.payment).entries.length > 0;
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

function createEmptyProposal(slot = 1) {
    return {
    slot,
    hotelName: "",
    roomCategory: "",
    catalogSlug: "",
    roomCategories: [],
    catalogHotel: null,
    includeTransfer: false,
    manualTotal: null,
  };
}

function draftFromSavedHotel(prev, catalog, fallbackSlot) {
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
  return {
    slot: prev.slot || fallbackSlot,
    hotelName: prev.hotelName || catalogHotel?.name || "",
    roomCategory: prev.roomCategory || "",
    catalogSlug: catalogHotel?.slug || catalogHotel?.id || prev.catalogSlug || "",
      roomCategories: roomCategoryNames(catalogHotel?.roomCategories),
      catalogHotel: catalogHotel || null,
    includeTransfer:
      prev.includeTransfer === true || prev.quote?.transferIncluded === true,
    manualTotal: stay != null && Number.isFinite(Number(stay)) ? roundMoney(Number(stay)) : null,
  };
}

/** Tarifs auto suspendus : propositions libres depuis le catalogue + prix saisis à la main. */
function buildResponseHotelsDraft(request, catalog) {
  const saved = normalizeResponsePayload(request.responsePayload).hotels;
  if (saved.length > 0) {
    return saved.map((prev, idx) => draftFromSavedHotel(prev, catalog, idx + 1));
  }
  return [createEmptyProposal(1)];
}

function computeQuotesForDraft(request, hotelsDraft) {
  const nights = countHotelNights(request?.arrivalDate, request?.departureDate);
  return hotelsDraft.map((item, index) => {
    const hotelName = String(item.hotelName || "").trim();
    const quote = applyQuoteAdjustments(nights, {
      includeTransfer: false,
      manualTotal: item.manualTotal,
    });
    return {
      slot: item.slot || index + 1,
      hotelName,
      roomCategory: String(item.roomCategory || "").trim(),
      catalogSlug: item.catalogSlug || "",
      includeTransfer: false,
      manualTotal: item.manualTotal ?? null,
      quote: serializeQuote(quote),
    };
  });
}

function proposalIsReady(quoted) {
  return Boolean(quoted?.hotelName && quoted?.quote?.total != null);
}

export const HOTEL_CUSTOM_OFFER_LABEL = "Je n'ai pas de choix d'hôtel — faites-moi une offre";

function digitsOnly(s) {
  return String(s ?? "").replace(/\D/g, "");
}

export function rowToHotelRequestViewModel(row) {
  return {
    id: String(row.id),
    supabaseId: row.id,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    phone: row.client_phone || "",
    email: row.client_email || "",
    arrivalDate: row.arrival_date || "",
    departureDate: row.departure_date || "",
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

function HotelRequestCard({
  request,
  onPrint,
  onReply,
  onConfirm,
  onEdit,
  onMarkSent,
  markingSent,
  onPay,
  onDocuments,
  onPrintReceipt,
  canDelete,
  onDelete,
  deleting,
}) {
  const fullName = [request.firstName, request.lastName].filter(Boolean).join(" ").trim() || "Client";
  const boardLabels = boardLabelsFromViewModel(request);
  const hotels = [
    { label: "Choix 1", value: request.hotelOption1 },
    { label: "Choix 2", value: request.hotelOption2 },
    { label: "Choix 3", value: request.hotelOption3 },
  ].filter((h) => String(h.value || "").trim());
  const payload = normalizeResponsePayload(request.responsePayload);
  const responseHotels = payload.hotels;
  const readyHotels = responseHotels.filter((h) => proposalIsReady(h));
  const hasResponse = readyHotels.length > 0;
  const confirmedHotel = payload.confirmedHotel && proposalIsReady(payload.confirmedHotel)
    ? payload.confirmedHotel
    : null;
  const sentToClient = payload.sentToClient === true;
  const responseTotals = readyHotels
    .map((h) => `${h.hotelName}: ${formatQuoteMoney(h.quote.total, h.quote.currency)}`)
    .join(" · ");
  const refId = String(request.id || request.supabaseId || "").trim();
  const shortRef =
    refId.length > 8 ? refId.slice(0, 8).toUpperCase() : refId.toUpperCase();
  const paymentStatus = confirmedHotel ? getPaymentStatus(request, payload) : null;
  const clientDocuments = payload.clientDocuments || [];

  return (
    <article className="overflow-hidden rounded-2xl border-2 border-indigo-200/90 bg-gradient-to-b from-white via-white to-slate-50/90 shadow-[0_12px_40px_-18px_rgba(30,27,75,0.22)] ring-1 ring-slate-200/80">
      <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-violet-50/50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-indigo-600">
              Demande hôtel
            </p>
              {shortRef ? (
                <span
                  className="inline-flex items-center rounded-full bg-white/90 px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wide text-indigo-900 ring-1 ring-indigo-200"
                  title={refId ? `Référence complète : ${refId}` : undefined}
                >
                  Réf. {shortRef}
                </span>
              ) : null}
            </div>
            <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-950 sm:text-xl">{fullName}</h3>
            {request.wantsCustomOffer ? (
              <span className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-950 ring-1 ring-amber-400/50">
                Offre personnalisée demandée
              </span>
            ) : null}
            {!hasResponse && !confirmedHotel ? (
              <span className="mt-2 ml-0 inline-block rounded-full bg-slate-200 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-800 ring-1 ring-slate-300/70 sm:ml-2">
                En attente
              </span>
            ) : null}
            {hasResponse && !confirmedHotel && !sentToClient ? (
              <span className="mt-2 ml-0 inline-block rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-950 ring-1 ring-amber-400/50 sm:ml-2">
                À envoyer au client
              </span>
            ) : null}
            {hasResponse && !confirmedHotel && sentToClient ? (
              <span className="mt-2 ml-0 inline-block rounded-full bg-sky-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-950 ring-1 ring-sky-400/50 sm:ml-2">
                Envoyé
                {payload.sentAt
                  ? ` · ${new Date(payload.sentAt).toLocaleDateString("fr-FR")}`
                  : ""}
              </span>
            ) : null}
            {confirmedHotel ? (
              <span className="mt-2 ml-0 inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm sm:ml-2">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Confirmé · {confirmedHotel.hotelName}
              </span>
            ) : null}
            {paymentStatus?.isFullyPaid ? (
              <span className="mt-2 ml-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm sm:ml-2">
                <Banknote className="h-3.5 w-3.5" aria-hidden />
                Payé
              </span>
            ) : null}
            {paymentStatus && !paymentStatus.isFullyPaid ? (
              <span className="mt-2 ml-0 inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-950 ring-1 ring-rose-300/70 sm:ml-2">
                Reste à payer · {formatQuoteMoney(paymentStatus.remaining, paymentStatus.currency)}
              </span>
            ) : null}
            {confirmedHotel && clientDocuments.length > 0 ? (
              <span className="mt-2 ml-0 inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm sm:ml-2">
                <FileText className="h-3.5 w-3.5" aria-hidden />
                {clientDocuments.length} document{clientDocuments.length > 1 ? "s" : ""}
              </span>
            ) : null}
            {payload.zeroTracas?.enabled ? (
              <span className="mt-2 ml-0 inline-block rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-950 ring-1 ring-indigo-300/60 sm:ml-2">
                Zero Tracas
                {computeZeroTracasTotal(payload.zeroTracas) > 0
                  ? ` · ${formatQuoteMoney(computeZeroTracasTotal(payload.zeroTracas), "EUR")}`
                  : ""}
              </span>
            ) : null}
            {responseTotals ? (
              <p className="mt-2 text-xs font-semibold text-emerald-900">{responseTotals}</p>
            ) : null}
            <p className="mt-1 text-xs font-medium text-slate-600">
              {request.createdAt
                ? new Date(request.createdAt).toLocaleString("fr-FR")
                : "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {hasResponse && !confirmedHotel ? (
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
                Envoyé
              </label>
            ) : null}
            <GhostBtn type="button" onClick={() => onPrint(request)}>
              Imprimer
            </GhostBtn>
            {confirmedHotel && paymentStatus && !paymentStatus.isFullyPaid ? (
              <PrimaryBtn
                type="button"
                className="!min-h-0 !min-w-0 !bg-emerald-600 !text-sm !px-4 !py-2 hover:!bg-emerald-700"
                onClick={() => onPay?.(request)}
              >
                <Banknote className="h-3.5 w-3.5" aria-hidden />
                Payer
              </PrimaryBtn>
            ) : null}
            {confirmedHotel && paymentStatus && paymentStatus.paid > 0.009 ? (
              <GhostBtn
                type="button"
                onClick={() => onPrintReceipt?.(request)}
                title={
                  paymentStatus.isFullyPaid
                    ? "Imprimer le reçu du règlement total"
                    : "Imprimer le reçu d’acompte / paiement"
                }
              >
                <Receipt className="h-3.5 w-3.5" aria-hidden />
                Reçu
              </GhostBtn>
            ) : null}
            {confirmedHotel ? (
              <GhostBtn type="button" onClick={() => onDocuments?.(request)}>
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Document
                {clientDocuments.length > 0 ? ` (${clientDocuments.length})` : ""}
              </GhostBtn>
            ) : null}
            <GhostBtn type="button" onClick={() => onReply(request)}>
              <MessageSquareReply className="h-3.5 w-3.5" aria-hidden />
              Réponse
            </GhostBtn>
            <GhostBtn
              type="button"
              onClick={() => onConfirm(request)}
              disabled={!hasResponse}
              title={
                hasResponse
                  ? "Valider l’hôtel choisi par le client"
                  : "Préparez d’abord une réponse avec des hôtels proposés"
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
                title="Supprimer ce devis (Ewen / Karim)"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {deleting ? "Suppression…" : "Supprimer"}
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
            Paiement
          </p>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-2.5 shadow-sm">
              <span className="text-[11px] font-bold uppercase text-slate-500">Total</span>
              <p className="mt-0.5 font-semibold text-slate-950">
                {formatQuoteMoney(paymentStatus.grandTotal, paymentStatus.currency)}
              </p>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-2.5 shadow-sm">
              <span className="text-[11px] font-bold uppercase text-slate-500">Déjà payé</span>
              <p className="mt-0.5 font-semibold text-slate-950">
                {formatQuoteMoney(paymentStatus.paid, paymentStatus.currency)}
              </p>
            </div>
            {!paymentStatus.isFullyPaid ? (
              <>
                <div className="rounded-xl border border-rose-200 bg-white px-3 py-2.5 shadow-sm ring-1 ring-rose-100">
                  <span className="text-[11px] font-bold uppercase text-rose-700">Reste à payer</span>
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
                <p className="mt-0.5 font-bold text-emerald-950">Solde réglé</p>
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
                      ? ` · ${new Date(entry.paidAt).toLocaleString("fr-FR")}`
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
                    <span className="text-slate-500">Preuve expirée</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onPrintReceipt?.(request, entry.id)}
                    className="font-bold text-emerald-800 underline underline-offset-2 hover:text-emerald-950"
                  >
                    Reçu
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {confirmedHotel && clientDocuments.length > 0 ? (
        <div className="border-b border-slate-200/90 bg-indigo-50/50 px-4 py-4 sm:px-6">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Documents liés
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
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Coordonnées</p>
        <div className="grid gap-3 text-sm text-slate-800 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm sm:col-span-2 lg:col-span-1">
            <span className="text-[11px] font-bold uppercase text-slate-500">Référence</span>
            <p className="mt-0.5 break-all font-mono text-sm font-semibold text-slate-950">
              {refId || "—"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
            <span className="text-[11px] font-bold uppercase text-slate-500">Téléphone</span>
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
            <span className="text-[11px] font-bold uppercase text-slate-500">Âge(s) enfants</span>
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
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Formule</p>
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
        {hasResponse || confirmedHotel ? (
          <>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {confirmedHotel ? "Hôtel de la confirmation" : "Hôtels de la réponse"}
            </p>
            <ul className="space-y-2">
              {(confirmedHotel ? [confirmedHotel] : readyHotels).map((h, index) => (
                <li
                  key={`${h.hotelName}-${h.slot || index}`}
                  className={`rounded-xl border px-3 py-2.5 text-sm shadow-sm ${
                    confirmedHotel
                      ? "border-teal-200/90 bg-teal-50/80"
                      : "border-emerald-200/90 bg-emerald-50/70"
                  }`}
                >
                  <span className="text-[11px] font-bold uppercase text-emerald-800">
                    {confirmedHotel ? "Confirmé" : `Option ${index + 1}`}
                  </span>
                  <p className="mt-0.5 font-semibold text-slate-950">{h.hotelName}</p>
                  {h.roomCategory ? (
                    <p className="mt-0.5 text-xs font-medium text-slate-600">{h.roomCategory}</p>
                  ) : null}
                  {h.quote?.total != null ? (
                    <p className="mt-1 text-sm font-bold text-emerald-900">
                      {formatQuoteMoney(h.quote.total, h.quote.currency)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            {!confirmedHotel && readyHotels.length > 1 ? (
              <p className="mt-2 text-[11px] font-medium text-slate-500">
                Propositions envoyées / à envoyer au client (réponse).
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
              Hôtels souhaités
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
}

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
        String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" })
      ),
    [catalogHotels]
  );

  if (!request) return null;

  const fullName =
    [request.firstName, request.lastName].filter(Boolean).join(" ").trim() || "Client";
  const boardLabels = boardLabelsFromViewModel(request);

  const updateProposal = (index, patch) => {
    setHotelsDraft((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  };

  const selectCatalogHotel = (index, slugOrId) => {
    const hotel =
      sortedCatalog.find((h) => String(h.slug || h.id) === String(slugOrId)) || null;
    updateProposal(index, {
      hotelName: hotel?.name || "",
      catalogSlug: hotel ? String(hotel.slug || hotel.id || "") : "",
      catalogHotel: hotel,
      roomCategories: roomCategoryNames(hotel?.roomCategories),
      roomCategory: "",
    });
  };

  const addProposal = () => {
    setHotelsDraft((prev) => [...prev, createEmptyProposal(prev.length + 1)]);
  };

  const removeProposal = (index) => {
    setHotelsDraft((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0
        ? next.map((h, i) => ({ ...h, slot: i + 1 }))
        : [createEmptyProposal(1)];
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
              Réponse devis
            </p>
            <h2 id="hotel-response-title" className="mt-1 text-lg font-bold text-slate-900">
              {fullName}
            </h2>
          </div>
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Fermer
          </GhostBtn>
        </div>

        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-slate-800">
          <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
            Demande client
          </p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-bold uppercase text-slate-500">Séjour</dt>
              <dd className="font-semibold text-slate-950">
                {formatHotelStayDate(request.arrivalDate)} → {formatHotelStayDate(request.departureDate)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase text-slate-500">Voyageurs</dt>
              <dd className="font-semibold text-slate-950">
                {request.adultsCount != null ? `${request.adultsCount} adulte(s)` : "—"}
                {request.childrenCount != null && request.childrenCount > 0
                  ? ` · ${request.childrenCount} enfant(s)`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase text-slate-500">Âges</dt>
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
              <dt className="text-[11px] font-bold uppercase text-slate-500">Formule</dt>
              <dd className="font-semibold text-slate-950">
                {boardLabels.length ? boardLabels.join(" · ") : "All inclusive"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-bold uppercase text-slate-500">Hôtels souhaités</dt>
              <dd className="mt-1 font-semibold text-slate-950">
                {request.wantsCustomOffer ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-950">
                    Offre personnalisée
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
              + Ajouter un hôtel
            </GhostBtn>
          </div>
          <p className="mb-3 text-xs font-medium text-slate-600">
            Choisissez les hôtels à proposer dans votre catalogue, puis indiquez le prix à côté.
            Les tarifs automatiques sont suspendus pour le moment.
          </p>

          {sortedCatalog.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
              Catalogue hôtels vide — ajoutez des hôtels dans Catalogue hôtels pour pouvoir répondre.
            </p>
          ) : (
            <ul className="space-y-3">
              {hotelsDraft.map((item, index) => {
                const quoted = quotedHotels[index];
                const quote = quoted?.quote;
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
                        <span className="text-[11px] font-bold uppercase text-slate-500">Hôtel</span>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                          value={item.catalogSlug || ""}
                          onChange={(e) => selectCatalogHotel(index, e.target.value)}
                          disabled={saving}
                        >
                          <option value="">— Choisir un hôtel —</option>
                          {sortedCatalog.map((h) => {
                            const value = String(h.slug || h.id || "");
                            return (
                              <option key={value || h.name} value={value}>
                                {h.name}
                              </option>
                            );
                          })}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-[11px] font-bold uppercase text-slate-500">
                          Catégorie (optionnel)
                        </span>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                          value={item.roomCategory}
                          onChange={(e) => updateProposal(index, { roomCategory: e.target.value })}
                          disabled={saving || !item.catalogSlug || item.roomCategories.length === 0}
                        >
                          <option value="">— Sans catégorie —</option>
                          {item.roomCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                          {item.roomCategory &&
                          !item.roomCategories.includes(item.roomCategory) ? (
                            <option value={item.roomCategory}>
                              {item.roomCategory} (enregistrée)
                            </option>
                      ) : null}
                        </select>
                        {item.roomCategory && item.catalogHotel
                          ? (() => {
                          const occ = formatRoomOccupancyLabel(
                            findRoomCategory(item.catalogHotel.roomCategories, item.roomCategory)
                          );
                          return occ ? (
                                <span className="mt-1 block text-[11px] font-semibold text-slate-600">
                                  {occ}
                                </span>
                          ) : null;
                        })()
                          : null}
                              </label>

                      <label className="block">
                        <span className="text-[11px] font-bold uppercase text-slate-500">
                                    Prix séjour (€)
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
                          placeholder="ex. 850"
                          disabled={saving || !item.hotelName}
                          aria-label={`Prix séjour option ${index + 1}`}
                                  />
                                </label>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 pt-3">
                      {proposalIsReady(quoted) ? (
                        <p className="text-sm font-bold text-violet-950">
                          Total : {formatQuoteMoney(quote.total, quote.currency)}
                          {quote.nights ? (
                            <span className="ml-1 text-xs font-semibold text-slate-500">
                              · {quote.nights} nuit{quote.nights > 1 ? "s" : ""}
                            </span>
                          ) : null}
                        </p>
                      ) : (
                        <p className="text-xs font-semibold text-slate-500">
                          Choisissez un hôtel et un prix
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-5">
          <label htmlFor="hotel-response-agent-notes" className="block text-sm font-bold text-slate-900">
            Note pour le devis
          </label>
          <p className="mt-1 text-xs font-medium text-slate-600">
            Optionnel — affichée sur le devis imprimé (ex. conditions, disponibilité, précisions).
          </p>
          <textarea
            id="hotel-response-agent-notes"
            rows={3}
            value={agentNotes}
            onChange={(e) => setAgentNotes?.(e.target.value)}
            disabled={saving}
            placeholder="Ex. Prix valables 48 h, sous réserve de disponibilité…"
            className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
          />
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Annuler
                                </GhostBtn>
                                <GhostBtn
                                  type="button"
            onClick={() =>
              onPrintDevis?.(quotedHotels.filter((h) => proposalIsReady(h)), agentNotes)
            }
            disabled={saving || readyCount === 0}
          >
            Imprimer le devis
                                </GhostBtn>
          <PrimaryBtn
                                    type="button"
            onClick={onSave}
            disabled={saving || readyCount === 0 || sortedCatalog.length === 0}
          >
            {saving ? "Enregistrement…" : "Enregistrer la réponse"}
          </PrimaryBtn>
                              </div>
      </div>
    </div>,
    document.body
  );
}

function HotelConfirmModal({
  request,
  selectedKey,
  setSelectedKey,
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
  const currentKey =
    selectedKey ||
    (payload.confirmedHotel ? hotelProposalKey(payload.confirmedHotel) : "") ||
    (options[0] ? hotelProposalKey(options[0], 0) : "");
  const flightValues = flights || EMPTY_FLIGHTS;
  const zt = zeroTracas || EMPTY_ZERO_TRACAS;
  const ztTotal = computeZeroTracasTotal(zt);

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
              Confirmation client
            </p>
            <h2 id="hotel-confirm-title" className="mt-1 text-lg font-bold text-slate-900">
              {fullName}
            </h2>
          </div>
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Fermer
                                </GhostBtn>
                              </div>

        <p className="mt-4 text-sm font-medium text-slate-700">
          Quel hôtel le client a-t-il choisi parmi vos propositions ? Le document final n’affichera
          que cette option.
        </p>

        {options.length === 0 ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
            Aucune proposition enregistrée. Préparez d’abord une réponse.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {options.map((hotel, index) => {
              const key = hotelProposalKey(hotel, index);
              const selected = currentKey === key;
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
                      type="radio"
                      name="hotel-confirm-choice"
                      className="mt-1 h-4 w-4 border-slate-300 text-teal-600 focus:ring-teal-500"
                      checked={selected}
                      onChange={() => setSelectedKey(key)}
                      disabled={saving}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-950">{hotel.hotelName}</span>
                      <span className="mt-0.5 block text-xs font-medium text-slate-600">
                        {hotel.roomCategory ? `${hotel.roomCategory} · ` : ""}
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
            Dates, numéros et horaires pour les transferts aéroport.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-600">
              Date d&apos;arrivée <span className="text-teal-600">*</span>
              <input
                type="date"
                value={flightValues.arrivalDate || ""}
                onChange={(e) => updateFlight("arrivalDate", e.target.value)}
                className={fieldClass}
                disabled={saving}
                required
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Date de départ <span className="text-teal-600">*</span>
              <input
                type="date"
                value={flightValues.departureDate || ""}
                min={flightValues.arrivalDate || undefined}
                onChange={(e) => updateFlight("departureDate", e.target.value)}
                className={fieldClass}
                disabled={saving}
                required
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              N° vol arrivée <span className="text-teal-600">*</span>
              <input
                type="text"
                autoComplete="off"
                value={flightValues.arrivalFlightNumber}
                onChange={(e) => updateFlight("arrivalFlightNumber", e.target.value)}
                placeholder="Ex. AF1784"
                className={fieldClass}
                disabled={saving}
                required
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Heure d&apos;arrivée <span className="text-teal-600">*</span>
              <input
                type="time"
                value={flightValues.arrivalTime}
                onChange={(e) => updateFlight("arrivalTime", e.target.value)}
                className={fieldClass}
                disabled={saving}
                required
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              N° vol départ <span className="text-teal-600">*</span>
              <input
                type="text"
                autoComplete="off"
                value={flightValues.departureFlightNumber}
                onChange={(e) => updateFlight("departureFlightNumber", e.target.value)}
                placeholder="Ex. AF1785"
                className={fieldClass}
                disabled={saving}
                required
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Heure de départ <span className="text-teal-600">*</span>
              <input
                type="time"
                value={flightValues.departureTime}
                onChange={(e) => updateFlight("departureTime", e.target.value)}
                className={fieldClass}
                disabled={saving}
                required
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
                Nombre de visas, de SIM, et montant total saisi à la main.
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
                    placeholder="ex. 120"
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
            Annuler
          </GhostBtn>
          <PrimaryBtn
            type="button"
            onClick={() => onConfirm?.(currentKey, flightValues, zt)}
            disabled={saving || !currentKey || options.length === 0}
            className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 border-0"
          >
            {saving ? "Validation…" : "Valider et imprimer"}
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
          Modifier la demande
        </h2>
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-600">
              Prénom
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
            Téléphone
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
              Nombre d&apos;adultes
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
              Nombre d&apos;enfants
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
            Âge(s) des enfants
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={draft.childAges || ""}
              onChange={(e) => setDraft((d) => ({ ...d, childAges: e.target.value }))}
              placeholder="Ex. 5 ans, 8 ans"
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
              Hôtel — choix {n}
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
            Formule : All inclusive
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
            Annuler
          </GhostBtn>
          <PrimaryBtn type="button" onClick={onSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
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
              Paiement
            </p>
            <h2 id="hotel-payment-title" className="mt-1 text-lg font-bold text-slate-900">
              Enregistrer un paiement
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {[request.firstName, request.lastName].filter(Boolean).join(" ") || "Client"}
            </p>
          </div>
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Fermer
          </GhostBtn>
        </div>

        <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
          <div className="flex justify-between gap-2">
            <span className="font-medium text-slate-600">Total confirmation</span>
            <strong>{formatQuoteMoney(status.grandTotal, status.currency)}</strong>
          </div>
          <div className="flex justify-between gap-2">
            <span className="font-medium text-slate-600">Déjà payé</span>
            <strong>{formatQuoteMoney(status.paid, status.currency)}</strong>
          </div>
          <div className="flex justify-between gap-2 border-t border-slate-200 pt-2">
            <span className="font-bold text-rose-800">Reste à payer</span>
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
            Montant payé par le client (€)
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
            aria-label="Montant payé"
          />
        </label>

        <div className="mt-4">
          <span className="text-[11px] font-bold uppercase text-slate-500">
            Preuve de paiement (image)
          </span>
          <label className="mt-1.5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-emerald-400 hover:bg-emerald-50/40">
            <Upload className="h-5 w-5 text-slate-500" aria-hidden />
            <span className="text-sm font-semibold text-slate-800">
              {file ? file.name : "Choisir une image"}
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
                  toast.warning("Le fichier doit être une image.");
                  e.target.value = "";
                  return;
                }
                if (next.size > PAYMENT_PROOF_MAX_BYTES) {
                  toast.warning("Image trop lourde (max 10 Mo).");
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
              alt="Aperçu preuve de paiement"
              className="mt-3 max-h-48 w-full rounded-xl border border-slate-200 object-contain bg-white"
            />
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Annuler
          </GhostBtn>
          <PrimaryBtn
            type="button"
            className="!bg-emerald-600 hover:!bg-emerald-700"
            disabled={!canSubmit}
            onClick={() => onSave?.({ amount: parsedAmount, file })}
          >
            {saving ? "Enregistrement…" : "Valider le paiement"}
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
            Fermer
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
              <span className="text-[11px] font-bold uppercase text-slate-500">Libellé</span>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                disabled={saving}
                placeholder="ex. Assurance voyage"
              />
            </label>
          ) : null}

          <div>
            <span className="text-[11px] font-bold uppercase text-slate-500">Fichier</span>
            <label className="mt-1.5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40">
              <Upload className="h-5 w-5 text-slate-500" aria-hidden />
              <span className="text-sm font-semibold text-slate-800">
                {file ? file.name : "Choisir un fichier"}
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
                    toast.warning("Fichier accepté : image ou PDF.");
                    e.target.value = "";
                    return;
                  }
                  if (next.size > CLIENT_DOC_MAX_BYTES) {
                    toast.warning("Fichier trop lourd (max 15 Mo).");
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
              {saving ? "Upload…" : "Ajouter au devis"}
            </PrimaryBtn>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Déjà liés ({docs.length})
          </p>
          {docs.length === 0 ? (
            <p className="mt-2 text-sm font-medium text-slate-600">
              Aucun document pour ce devis.
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
                      {doc.fileName || "Fichier"}
                      {doc.uploadedAt
                        ? ` · ${new Date(doc.uploadedAt).toLocaleDateString("fr-FR")}`
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
  const [statusFilter, setStatusFilter] = useState("all"); // all | pending | to_send | sent | confirmed | payer
  const [markingSentId, setMarkingSentId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [replyRequest, setReplyRequest] = useState(null);
  const [replyHotelsDraft, setReplyHotelsDraft] = useState([]);
  const [replyAgentNotes, setReplyAgentNotes] = useState("");
  const [confirmRequest, setConfirmRequest] = useState(null);
  const [confirmSelectedKey, setConfirmSelectedKey] = useState("");
  const [confirmFlights, setConfirmFlights] = useState(EMPTY_FLIGHTS);
  const [confirmZeroTracas, setConfirmZeroTracas] = useState(EMPTY_ZERO_TRACAS);
  const [payRequest, setPayRequest] = useState(null);
  const [docsRequest, setDocsRequest] = useState(null);
  const [catalogHotels, setCatalogHotels] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError("Supabase non configuré.");
      return;
    }
    setError("");
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
            "Table public_hotel_requests absente. Exécutez supabase/supabase_public_hotel_requests_table.sql sur Supabase."
          );
        } else if (/response_payload/i.test(loadError.message || "")) {
          setError(
            "Colonne response_payload absente. Exécutez supabase/supabase_public_hotel_requests_add_response_payload.sql sur Supabase."
          );
        } else {
          setError(loadError.message || "Impossible de charger les demandes.");
        }
        setRows([]);
        return;
      }

      let rowsData = data || [];
      try {
        const purged = await cleanupExpiredHotelRequestDocuments({
          supabase,
          siteKey: SITE_KEY,
          rows: rowsData,
          logger,
        });
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
              ? "Documents d’un séjour passé (départ + 2 j) automatiquement supprimés."
              : `Documents de ${purged} séjours passés (départ + 2 j) automatiquement supprimés.`,
            4500
          );
        }
      } catch (purgeErr) {
        logger.warn("HotelHistoryPage docs cleanup:", purgeErr);
      }

      setRows(rowsData.map(rowToHotelRequestViewModel));
    } catch (e) {
      logger.error("HotelHistoryPage load:", e);
      setError("Erreur inattendue au chargement.");
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
      const catalog = await loadPublicHotelsCatalog({ publishedOnly: false });
      if (cancelled) return;
      setCatalogHotels(catalog.hotels || []);
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
          void load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const confirmedCount = useMemo(
    () => rows.filter((r) => isHotelRequestConfirmed(r)).length,
    [rows]
  );
  const pendingCount = useMemo(
    () => rows.filter((r) => isHotelRequestPending(r)).length,
    [rows]
  );
  const toSendCount = useMemo(
    () => rows.filter((r) => isHotelRequestReadyToSend(r)).length,
    [rows]
  );
  const sentCount = useMemo(
    () => rows.filter((r) => isHotelRequestSent(r)).length,
    [rows]
  );
  const payerCount = useMemo(
    () => rows.filter((r) => isHotelRequestInPayerList(r)).length,
    [rows]
  );

  const filteredRows = useMemo(() => {
    let list = rows;
    if (statusFilter === "confirmed") {
      list = list.filter((r) => isHotelRequestConfirmed(r));
    } else if (statusFilter === "payer") {
      list = list.filter((r) => isHotelRequestInPayerList(r));
    } else if (statusFilter === "pending") {
      list = list.filter((r) => isHotelRequestPending(r));
    } else if (statusFilter === "to_send") {
      list = list.filter((r) => isHotelRequestReadyToSend(r));
    } else if (statusFilter === "sent") {
      list = list.filter((r) => isHotelRequestSent(r));
    }
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return list;
    const qDigits = digitsOnly(q);
    // Réf. affichée = 8 premiers car. de l’UUID ; accepter aussi tirets / préfixe « réf »
    const qRef = q
      .replace(/^réf\.?\s*/i, "")
      .replace(/^ref\.?\s*/i, "")
      .replace(/[-\s]/g, "");
    return list.filter((r) => {
      const name = [r.firstName, r.lastName].join(" ").toLowerCase();
      const email = (r.email || "").toLowerCase();
      const phone = digitsOnly(r.phone);
      const hotels = [r.hotelOption1, r.hotelOption2, r.hotelOption3]
        .join(" ")
        .toLowerCase();
      const payload = normalizeResponsePayload(r.responsePayload);
      const confirmedName = String(payload.confirmedHotel?.hotelName || "").toLowerCase();
      const responseNames = (payload.hotels || [])
        .map((h) => String(h.hotelName || "").toLowerCase())
        .join(" ");
      const refRaw = String(r.id || r.supabaseId || "").toLowerCase();
      const refCompact = refRaw.replace(/-/g, "");
      const shortRef = refCompact.slice(0, 8);
      if (
        name.includes(q) ||
        email.includes(q) ||
        hotels.includes(q) ||
        confirmedName.includes(q) ||
        responseNames.includes(q) ||
        (qRef &&
          (refRaw.includes(q) ||
            refCompact.includes(qRef) ||
            shortRef.includes(qRef) ||
            qRef.includes(shortRef)))
      ) {
        return true;
      }
      if (qDigits && phone.includes(qDigits)) return true;
      return false;
    });
  }, [rows, debouncedSearch, statusFilter]);

  const handlePrint = useCallback((request) => {
    const payload = normalizeResponsePayload(request.responsePayload);
    const isConfirmed =
      payload.confirmedHotel && proposalIsReady(payload.confirmedHotel);
    const quoteHotels = isConfirmed
      ? [payload.confirmedHotel]
      : payload.hotels.filter((h) => proposalIsReady(h));
      const ok = printHotelRequest({
        ...request,
        quoteHotels,
      agentNotes: payload.agentNotes,
      flights: payload.flights,
      zeroTracas: payload.zeroTracas,
      documentKind: isConfirmed ? "confirmation" : "devis",
      });
      if (!ok) toast.error("Autorisez les fenêtres popup pour imprimer.");
  }, []);

  const handlePrintReceipt = useCallback((request, entryId = null) => {
    const ok = printHotelPaymentReceipt(
      {
        ...request,
        responsePayload: normalizeResponsePayload(request.responsePayload),
      },
      entryId ? { entryId } : null
    );
    if (!ok) toast.error("Autorisez les fenêtres popup pour imprimer le reçu.");
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
      toast.warning("Préparez d’abord une réponse avec au moins un hôtel et un prix.");
      return;
    }
    const initialKey = payload.confirmedHotel
      ? hotelProposalKey(payload.confirmedHotel)
      : hotelProposalKey(options[0], 0);
    setConfirmRequest(request);
    setConfirmSelectedKey(initialKey);
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
      if (!ok) toast.error("Autorisez les fenêtres popup pour imprimer.");
    },
    [replyRequest]
  );

  const handleSaveReply = useCallback(async () => {
    if (!replyRequest || !supabase) return;
    const hotels = computeQuotesForDraft(replyRequest, replyHotelsDraft).filter((h) =>
      proposalIsReady(h)
    );
    if (hotels.length === 0) {
      toast.error("Ajoutez au moins un hôtel avec un prix.");
      return;
    }
    const prev = normalizeResponsePayload(replyRequest.responsePayload);
    let confirmedHotel = prev.confirmedHotel;
    let confirmedAt = prev.confirmedAt || "";
    if (confirmedHotel) {
      const stillThere = hotels.some(
        (h, i) => hotelProposalKey(h, i) === hotelProposalKey(confirmedHotel)
      );
      if (!stillThere) {
        confirmedHotel = null;
        confirmedAt = "";
      }
    }
    setSaving(true);
    try {
      const response_payload = {
        hotels,
        agentNotes: String(replyAgentNotes || "").trim(),
        confirmedHotel,
        confirmedAt: confirmedAt || undefined,
        flights: prev.flights,
        zeroTracas: prev.zeroTracas,
        sentToClient: prev.sentToClient === true,
        sentAt: prev.sentAt || undefined,
        payment: serializePayment(prev.payment),
        clientDocuments: serializeClientDocuments(prev.clientDocuments),
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
            "Colonne response_payload absente : exécutez supabase_public_hotel_requests_add_response_payload.sql",
            7000
          );
        } else {
          toast.error(updateError.message || "Échec de l'enregistrement.");
        }
        return;
      }
      toast.success("Réponse enregistrée.");
      setReplyRequest(null);
      setReplyHotelsDraft([]);
      setReplyAgentNotes("");
      setStatusFilter("to_send");
      await load();
    } catch (e) {
      logger.error("HotelHistoryPage reply save:", e);
      toast.error("Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  }, [replyRequest, replyHotelsDraft, replyAgentNotes, load]);

  const handleConfirmSave = useCallback(
    async (selectedKey, flightsInput, zeroTracasInput) => {
      if (!confirmRequest || !supabase) return;
      const payload = normalizeResponsePayload(confirmRequest.responsePayload);
      const options = payload.hotels.filter((h) => proposalIsReady(h));
      const chosen =
        options.find((h, i) => hotelProposalKey(h, i) === selectedKey) || null;
      if (!chosen) {
        toast.error("Sélectionnez l’hôtel choisi par le client.");
        return;
      }
      const flights = normalizeFlights(flightsInput || confirmFlights);
      if (!flightsAreComplete(flights)) {
        if (!flights.arrivalDate) {
          toast.error("Indiquez la date d’arrivée du vol.");
          return;
        }
        if (!flights.departureDate) {
          toast.error("Indiquez la date de départ du vol.");
          return;
        }
        if (!flights.arrivalFlightNumber) {
          toast.error("Indiquez le numéro de vol d’arrivée.");
          return;
        }
        if (!flights.arrivalTime) {
          toast.error("Indiquez l’heure d’arrivée du vol.");
          return;
        }
        if (!flights.departureFlightNumber) {
          toast.error("Indiquez le numéro de vol de départ.");
          return;
        }
        toast.error("Indiquez l’heure de départ du vol.");
        return;
      }
      const zeroTracas = normalizeZeroTracas(zeroTracasInput || confirmZeroTracas);
      if (zeroTracas.enabled && !isZeroTracasComplete(zeroTracas)) {
        if (parseQtyInput(zeroTracas.visaCount) <= 0 && parseQtyInput(zeroTracas.simCount) <= 0) {
          toast.error("Zero Tracas : indiquez le nombre de visas et/ou de SIM.");
          return;
        }
        toast.error("Zero Tracas : indiquez le montant total.");
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
          existingPayment.schedule ||
          buildPaymentSchedule(confirmRequest.arrivalDate, grandTotal, new Date());
        const response_payload = {
          hotels: payload.hotels,
          agentNotes: payload.agentNotes,
          confirmedHotel: chosen,
          confirmedAt: new Date().toISOString(),
          flights,
          zeroTracas,
          sentToClient: payload.sentToClient === true,
          sentAt: payload.sentAt || undefined,
          payment: serializePayment({
            entries: existingPayment.entries,
            schedule,
          }),
          clientDocuments: serializeClientDocuments(payload.clientDocuments),
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
          toast.error(updateError.message || "Échec de la confirmation.");
          return;
        }

        const ok = printHotelRequest({
          ...confirmRequest,
          quoteHotels: [chosen],
          agentNotes: payload.agentNotes,
          flights,
          zeroTracas,
          documentKind: "confirmation",
          responsePayload: response_payload,
        });
        if (!ok) {
          toast.warning("Confirmation enregistrée, mais autorisez les popups pour imprimer.");
        } else {
          toast.success(`Confirmé : ${chosen.hotelName}`);
        }
        setConfirmRequest(null);
        setConfirmSelectedKey("");
        setConfirmFlights({ ...EMPTY_FLIGHTS });
        setConfirmZeroTracas({ ...EMPTY_ZERO_TRACAS });
        await load();
      } catch (e) {
        logger.error("HotelHistoryPage confirm save:", e);
        toast.error("Erreur inattendue.");
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
        toast.warning("Préparez d’abord une réponse avant de marquer comme envoyé.");
        return;
      }
      setMarkingSentId(request.id);
      try {
        const response_payload = {
          hotels: prev.hotels,
          agentNotes: prev.agentNotes,
          confirmedHotel: prev.confirmedHotel,
          confirmedAt: prev.confirmedAt || undefined,
          flights: prev.flights,
          zeroTracas: prev.zeroTracas,
          sentToClient: sent === true,
          sentAt: sent ? new Date().toISOString() : undefined,
          payment: serializePayment(prev.payment),
          clientDocuments: serializeClientDocuments(prev.clientDocuments),
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
          toast.error(updateError.message || "Impossible de mettre à jour le statut.");
          return;
        }
        toast.success(sent ? "Devis marqué comme envoyé." : "Devis remis dans « À envoyer ».");
        if (sent) setStatusFilter("sent");
        await load();
      } catch (e) {
        logger.error("HotelHistoryPage mark sent:", e);
        toast.error("Erreur inattendue.");
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
      if (!prev.confirmedHotel || !proposalIsReady(prev.confirmedHotel)) {
        toast.error("Cette demande n’est pas confirmée.");
        return;
      }
      const status = getPaymentStatus(payRequest, prev);
      if (!status || status.isFullyPaid) {
        toast.info("Le solde est déjà réglé.");
        return;
      }
      const paidAmount = roundMoney(Number(amount));
      if (!(paidAmount > 0) || paidAmount > status.remaining + 0.009) {
        toast.error("Montant invalide.");
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
          toast.error(uploadError.message || "Échec de l’upload de la preuve.");
          return;
        }

        const { data: pub } = supabase.storage.from(usedBucket).getPublicUrl(objectPath);
        const proofUrl = String(pub?.publicUrl || "").trim();
        if (!proofUrl) {
          toast.error("URL de preuve introuvable après upload.");
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
          confirmedHotel: prev.confirmedHotel,
          confirmedAt: prev.confirmedAt || undefined,
          flights: prev.flights,
          zeroTracas: prev.zeroTracas,
          sentToClient: prev.sentToClient === true,
          sentAt: prev.sentAt || undefined,
          payment: serializePayment({
            entries: [...existing.entries, entry],
            schedule,
          }),
          clientDocuments: serializeClientDocuments(prev.clientDocuments),
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
          toast.error(updateError.message || "Impossible d’enregistrer le paiement.");
          return;
        }

        const nextRemaining = roundMoney(status.remaining - paidAmount);
        toast.success(
          nextRemaining <= 0.009
            ? "Paiement enregistré — solde réglé."
            : `Paiement enregistré — reste ${formatQuoteMoney(nextRemaining, status.currency)}.`
        );
        const receiptOk = printHotelPaymentReceipt(
          {
            ...payRequest,
            responsePayload: normalizeResponsePayload(response_payload),
          },
          { entryId: entry.id }
        );
        if (!receiptOk) {
          toast.warning("Paiement enregistré — autorisez les popups pour imprimer le reçu.");
        }
        setPayRequest(null);
        setStatusFilter("payer");
        await load();
      } catch (e) {
        logger.error("HotelHistoryPage payment:", e);
        toast.error("Erreur inattendue.");
      } finally {
        setSaving(false);
      }
    },
    [payRequest, load]
  );

  const handleDeleteRequest = useCallback(
    async (request) => {
      if (!canDeleteHotelRequest(user)) {
        toast.error("Vous n’avez pas le droit de supprimer ce devis.");
        return;
      }
      if (!request?.supabaseId || !supabase) return;
      const fullName =
        [request.firstName, request.lastName].filter(Boolean).join(" ").trim() || "ce client";
      const short = String(request.id || "").slice(0, 8).toUpperCase();
      const ok = window.confirm(
        `Supprimer définitivement le devis de ${fullName}${short ? ` (réf. ${short})` : ""} ?\n\nCette action est irréversible.`
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
          toast.error(deleteError.message || "Impossible de supprimer le devis.");
          return;
        }

        toast.success("Devis supprimé.");
        if (payRequest?.id === request.id) setPayRequest(null);
        if (docsRequest?.id === request.id) setDocsRequest(null);
        if (replyRequest?.id === request.id) setReplyRequest(null);
        if (confirmRequest?.id === request.id) setConfirmRequest(null);
        if (editDraft?.id === request.id) setEditDraft(null);
        await load();
      } catch (e) {
        logger.error("HotelHistoryPage delete:", e);
        toast.error("Erreur inattendue.");
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
      confirmedHotel: prev.confirmedHotel,
      confirmedAt: prev.confirmedAt || undefined,
      flights: prev.flights,
      zeroTracas: prev.zeroTracas,
      sentToClient: prev.sentToClient === true,
      sentAt: prev.sentAt || undefined,
      payment: serializePayment(prev.payment),
      clientDocuments: serializeClientDocuments(prev.clientDocuments),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }, []);

  const handleAddClientDocument = useCallback(
    async ({ type, label, file }) => {
      if (!docsRequest?.supabaseId || !supabase || !file) return;
      if (!isHotelRequestConfirmed(docsRequest)) {
        toast.error("Documents disponibles uniquement sur une confirmation.");
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
          toast.error(uploadError.message || "Échec de l’upload du document.");
          return;
        }

        const { data: pub } = supabase.storage.from(usedBucket).getPublicUrl(objectPath);
        const url = String(pub?.publicUrl || "").trim();
        if (!url) {
          toast.error("URL du document introuvable après upload.");
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
          toast.error(updateError.message || "Impossible d’enregistrer le document.");
          return;
        }

        toast.success("Document ajouté au devis.");
        setDocsRequest((r) =>
          r ? { ...r, responsePayload: normalizeResponsePayload(response_payload) } : null
        );
        setStatusFilter("confirmed");
        await load();
      } catch (e) {
        logger.error("HotelHistoryPage doc add:", e);
        toast.error("Erreur inattendue.");
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
          toast.error(updateError.message || "Impossible de retirer le document.");
          return;
        }

        toast.success("Document retiré du devis.");
        setDocsRequest((r) =>
          r ? { ...r, responsePayload: normalizeResponsePayload(response_payload) } : null
        );
        await load();
      } catch (e) {
        logger.error("HotelHistoryPage doc remove:", e);
        toast.error("Erreur inattendue.");
      } finally {
        setSaving(false);
      }
    },
    [docsRequest, load, buildResponsePayloadFromPrev]
  );

  const handleSaveEdit = useCallback(async () => {
    if (!editDraft || !supabase) return;
    if (!editDraft.firstName.trim() || !editDraft.lastName.trim()) {
      toast.error("Le prénom et le nom sont obligatoires.");
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
        toast.error(updateError.message || "Échec de l'enregistrement.");
        return;
      }
      toast.success("Demande mise à jour.");
      setEditDraft(null);
      await load();
    } catch (e) {
      logger.error("HotelHistoryPage save:", e);
      toast.error("Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  }, [editDraft, load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">
        Chargement des demandes hôtel…
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
        Demandes reçues via le formulaire public{" "}
        <strong className="text-indigo-800">/demande-hotel</strong>. Les données proviennent de
        Supabase et se mettent à jour en temps réel.
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
            Tous ({rows.length})
          </Pill>
          <Pill
            type="button"
            tone="light"
            active={statusFilter === "pending"}
            onClick={() => setStatusFilter("pending")}
            className="!px-3.5 !py-2 !text-xs"
          >
            En attente ({pendingCount})
          </Pill>
          <Pill
            type="button"
            tone="light"
            active={statusFilter === "to_send"}
            onClick={() => setStatusFilter("to_send")}
            className="!px-3.5 !py-2 !text-xs"
          >
            À envoyer au client ({toSendCount})
          </Pill>
          <Pill
            type="button"
            tone="light"
            active={statusFilter === "sent"}
            onClick={() => setStatusFilter("sent")}
            className="!px-3.5 !py-2 !text-xs"
          >
            Envoyé ({sentCount})
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
          <Pill
            type="button"
            tone="light"
            active={statusFilter === "payer"}
            onClick={() => setStatusFilter("payer")}
            className="!px-3.5 !py-2 !text-xs"
          >
            Payer ({payerCount})
          </Pill>
        </div>

        <div>
          <label
            htmlFor="hotel-history-search"
            className="block text-xs font-bold uppercase tracking-wide text-indigo-950"
          >
          Rechercher
        </label>
        <TextInput
          id="hotel-history-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, e-mail, téléphone, hôtel ou référence"
          className="mt-2"
        />
        <p className="mt-2 text-[11px] font-medium text-indigo-900/80">
          {filteredRows.length} demande{filteredRows.length > 1 ? "s" : ""}
            {statusFilter === "confirmed"
              ? " confirmée" + (filteredRows.length > 1 ? "s" : "")
              : statusFilter === "payer"
                ? " avec paiement"
                : statusFilter === "pending"
                ? " en attente"
                : statusFilter === "to_send"
                  ? " à envoyer"
                  : statusFilter === "sent"
                    ? " envoyée" + (filteredRows.length > 1 ? "s" : "")
                    : ""}
            {debouncedSearch.trim() ? " · recherche" : ""}
            {statusFilter !== "all" || debouncedSearch.trim() ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="font-bold text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                  }}
                >
                  Réinitialiser
                </button>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-700">
          Aucune demande hôtel pour le moment.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-950">
          {statusFilter === "confirmed"
            ? "Aucune confirmation pour le moment."
            : statusFilter === "payer"
              ? "Aucun paiement enregistré pour le moment. Enregistrez un paiement depuis une confirmation."
              : statusFilter === "pending"
              ? "Aucune nouvelle demande en attente aujourd’hui."
              : statusFilter === "to_send"
                ? "Aucun devis à envoyer pour le moment. Préparez d’abord une réponse."
                : statusFilter === "sent"
                  ? "Aucun devis marqué comme envoyé pour le moment."
                  : "Aucune demande ne correspond à la recherche."}
        </div>
      ) : (
        <div className="space-y-8">
          {filteredRows.map((request) => (
            <HotelRequestCard
              key={request.id}
              request={request}
              onPrint={handlePrint}
              onReply={handleReply}
              onConfirm={handleConfirmOpen}
              onEdit={handleEdit}
              onMarkSent={handleMarkSent}
              markingSent={markingSentId === request.id}
              onPay={setPayRequest}
              onDocuments={setDocsRequest}
              onPrintReceipt={handlePrintReceipt}
              canDelete={canDelete}
              onDelete={handleDeleteRequest}
              deleting={deletingId === request.id}
            />
          ))}
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
        selectedKey={confirmSelectedKey}
        setSelectedKey={setConfirmSelectedKey}
        flights={confirmFlights}
        setFlights={setConfirmFlights}
        zeroTracas={confirmZeroTracas}
        setZeroTracas={setConfirmZeroTracas}
        onClose={() => {
          if (!saving) {
            setConfirmRequest(null);
            setConfirmSelectedKey("");
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
