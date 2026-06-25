import { useState, useMemo, useRef, useEffect, useCallback, Suspense, lazy } from "react";
import * as XLSX from "xlsx";
import { PrimaryBtn, GhostBtn, Section } from "../components/ui";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";
import { LS_KEYS, SITE_KEY } from "../constants";
import { loadLS, saveLS } from "../utils";
import { extractPhoneFromName, validatePhoneNumber, extractNameFromField, resolvePhoneFromExcelRow } from "../utils/phoneUtils";
import { convertExcelValue, findColumn, isIgnoredTransferExcelColumn } from "../utils/excelParser";
import { generateMessage } from "../utils/messageGenerator";
import {
  saveSituationTransferRows,
  SITUATION_TRANSFER_SETTINGS_TYPE,
} from "../utils/situationTransferSync";
import {
  saveMessageTemplates,
  MESSAGE_TEMPLATES_SETTINGS_TYPE,
  normalizeMessageTemplates,
  buildUniqueActivityNames,
  normalizeActivityLabel,
  activityNameKey,
} from "../utils/messageTemplatesSync";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { ExcelUploadSection } from "../components/situation/ExcelUploadSection";
import { TransferClientsTable } from "../components/situation/TransferClientsTable";
import { TransferMessagePreviewModal } from "../components/situation/TransferMessagePreviewModal";
import { AutoSendingIndicator } from "../components/situation/AutoSendingIndicator";
import { MessagePreviewSection } from "../components/situation/MessagePreviewSection";
import { SendLogSection } from "../components/situation/SendLogSection";

const MessageTemplatesModal = lazy(() => import("../components/situation/MessageTemplatesModal"));
const HotelsModal = lazy(() => import("../components/situation/HotelsModal"));

export function SituationPage({ activities = [], user }) {
  const [excelData, setExcelData] = useState(() => loadLS(LS_KEYS.situationTransferRows, []));
  const [sharedMeta, setSharedMeta] = useState({ fileName: "", importedBy: "", updatedAt: null });
  const [previewMessages, setPreviewMessages] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendLog, setSendLog] = useState([]);
  const [detectedColumns, setDetectedColumns] = useState([]);
  const [autoSending, setAutoSending] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingCount, setRemainingCount] = useState(0);
  const whatsappWindowRef = useRef(null);
  const messageQueueRef = useRef([]);
  const intervalRef = useRef(null);
  const isAutoSendingRef = useRef(false);
  const isFirstMessageRef = useRef(true);
  
  // État pour la configuration des messages
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [messageTemplates, setMessageTemplates] = useState(() => {
    return normalizeMessageTemplates(loadLS(LS_KEYS.messageTemplates, {}));
  });
  const [templatesSaveStatus, setTemplatesSaveStatus] = useState("idle");
  
  // État pour la gestion des hôtels avec RDV à l'extérieur
  const [showHotelsModal, setShowHotelsModal] = useState(false);
  const [exteriorHotels, setExteriorHotels] = useState(() => {
    const saved = loadLS(LS_KEYS.exteriorHotels, []);
    // Migration : convertir les anciens strings en objets si nécessaire
    if (saved.length > 0 && typeof saved[0] === 'string') {
      return saved.map(name => ({ name, hasBeachBoats: false }));
    }
    return saved;
  });
  const [newHotel, setNewHotel] = useState("");
  
  // État pour stocker les lignes avec marina cochée (non sauvegardé, réinitialisé à chaque import)
  const [rowsWithMarina, setRowsWithMarina] = useState(() => new Set());
  
  // État pour l'édition des cellules du tableau
  const [editingCell, setEditingCell] = useState(null); // { rowId: string, field: string }
  const [messageOverrides, setMessageOverrides] = useState({});
  const [messagePreviewRow, setMessagePreviewRow] = useState(null);

  const handleNewHotelChange = useCallback(
    (value) => {
      setNewHotel(value);
    },
    [setNewHotel]
  );

  const isSupabaseConfigured = __SUPABASE_DEBUG__?.isConfigured;
  const [settingsLoaded, setSettingsLoaded] = useState(!isSupabaseConfigured);
  const messageTemplatesSaveTimeoutRef = useRef(null);
  const skipNextTemplatesSaveRef = useRef(false);
  const exteriorHotelsSaveTimeoutRef = useRef(null);
  const situationRowsSaveTimeoutRef = useRef(null);
  const lastRemoteSituationAtRef = useRef(null);
  const skipNextSituationSaveRef = useRef(false);
  const lastUploadedFileNameRef = useRef("");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSettingsLoaded(true);
      return;
    }

    let cancelled = false;

    async function fetchSettings() {
      try {
        const { data, error } = await supabase
          .from("message_settings")
          .select("settings_type, payload, updated_at")
          .eq("site_key", SITE_KEY);

        if (!error && Array.isArray(data) && !cancelled) {
          const templatesRow = data.find((row) => row.settings_type === "message_templates");
          if (templatesRow && templatesRow.payload && typeof templatesRow.payload === "object") {
            skipNextTemplatesSaveRef.current = true;
            const normalized = normalizeMessageTemplates(templatesRow.payload);
            setMessageTemplates(normalized);
            saveLS(LS_KEYS.messageTemplates, normalized);
          }

          const hotelsRow = data.find((row) => row.settings_type === "exterior_hotels");
          if (hotelsRow && Array.isArray(hotelsRow.payload) && !cancelled) {
            const normalizedHotels = hotelsRow.payload.map((hotel) => {
              if (typeof hotel === "string") {
                return { name: hotel, hasBeachBoats: false };
              }
              return {
                name: hotel?.name || "",
                hasBeachBoats: Boolean(hotel?.hasBeachBoats),
              };
            }).filter((hotel) => hotel.name.trim() !== "");

            setExteriorHotels(normalizedHotels);
            saveLS(LS_KEYS.exteriorHotels, normalizedHotels);
          }

          const situationRow = data.find((row) => row.settings_type === SITUATION_TRANSFER_SETTINGS_TYPE);
          if (situationRow?.payload && typeof situationRow.payload === "object" && !cancelled) {
            const p = situationRow.payload;
            if (Array.isArray(p.rows)) {
              skipNextSituationSaveRef.current = true;
              setExcelData(p.rows);
              saveLS(LS_KEYS.situationTransferRows, p.rows);
            }
            if (Array.isArray(p.detectedColumns)) {
              setDetectedColumns(p.detectedColumns);
            }
            if (Array.isArray(p.rowsWithMarina)) {
              setRowsWithMarina(new Set(p.rowsWithMarina));
            }
            setSharedMeta({
              fileName: p.fileName != null ? String(p.fileName) : "",
              importedBy: p.importedBy != null ? String(p.importedBy) : "",
              updatedAt: situationRow.updated_at || p.updated_at || null,
            });
            lastRemoteSituationAtRef.current = situationRow.updated_at || p.updated_at || null;
          }
        } else if (error) {
          logger.warn("⚠️ Impossible de charger les paramètres Supabase:", error);
        }
      } catch (fetchError) {
        logger.warn("⚠️ Erreur lors du chargement des paramètres Supabase:", fetchError);
      } finally {
        if (!cancelled) {
          setSettingsLoaded(true);
        }
      }
    }

    fetchSettings();

    return () => {
      cancelled = true;
    };
  }, [isSupabaseConfigured]);

  useEffect(() => {
    saveLS(LS_KEYS.messageTemplates, messageTemplates);

    if (!settingsLoaded || !isSupabaseConfigured) return;

    if (skipNextTemplatesSaveRef.current) {
      skipNextTemplatesSaveRef.current = false;
      return;
    }

    if (messageTemplatesSaveTimeoutRef.current) {
      clearTimeout(messageTemplatesSaveTimeoutRef.current);
    }

    setTemplatesSaveStatus("saving");

    messageTemplatesSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const { error } = await saveMessageTemplates(
          supabase,
          SITE_KEY,
          normalizeMessageTemplates(messageTemplates)
        );

        if (error) {
          logger.warn("⚠️ Impossible de sauvegarder les templates sur Supabase:", error);
          setTemplatesSaveStatus("error");
        } else {
          setTemplatesSaveStatus("saved");
          setTimeout(() => setTemplatesSaveStatus("idle"), 2500);
        }
      } catch (saveError) {
        logger.warn("⚠️ Erreur lors de la sauvegarde des templates sur Supabase:", saveError);
        setTemplatesSaveStatus("error");
      }
    }, 600);

    return () => {
      if (messageTemplatesSaveTimeoutRef.current) {
        clearTimeout(messageTemplatesSaveTimeoutRef.current);
      }
    };
  }, [messageTemplates, settingsLoaded, isSupabaseConfigured]);

  useEffect(() => {
    saveLS(LS_KEYS.exteriorHotels, exteriorHotels);

    if (!settingsLoaded || !isSupabaseConfigured) return;

    if (exteriorHotelsSaveTimeoutRef.current) {
      clearTimeout(exteriorHotelsSaveTimeoutRef.current);
    }

    exteriorHotelsSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from("message_settings")
          .upsert(
            {
              site_key: SITE_KEY,
              settings_type: "exterior_hotels",
              payload: exteriorHotels,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "site_key,settings_type" }
          );

        if (error) {
          logger.warn("⚠️ Impossible de sauvegarder les hôtels sur Supabase:", error);
        }
      } catch (saveError) {
        logger.warn("⚠️ Erreur lors de la sauvegarde des hôtels sur Supabase:", saveError);
      }
    }, 400);

    return () => {
      if (exteriorHotelsSaveTimeoutRef.current) {
        clearTimeout(exteriorHotelsSaveTimeoutRef.current);
      }
    };
  }, [exteriorHotels, settingsLoaded, isSupabaseConfigured]);

  useEffect(() => {
    saveLS(LS_KEYS.situationTransferRows, excelData);

    if (!settingsLoaded || !isSupabaseConfigured) return;

    if (skipNextSituationSaveRef.current) {
      skipNextSituationSaveRef.current = false;
      return;
    }

    if (situationRowsSaveTimeoutRef.current) {
      clearTimeout(situationRowsSaveTimeoutRef.current);
    }

    situationRowsSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const payload = {
          rows: excelData,
          detectedColumns,
          rowsWithMarina: [...rowsWithMarina],
          fileName: sharedMeta.fileName || lastUploadedFileNameRef.current || "",
          importedBy: sharedMeta.importedBy || user?.name || "",
        };
        const { error } = await saveSituationTransferRows(supabase, SITE_KEY, payload);
        if (error) {
          logger.warn("⚠️ Impossible de synchroniser les transferts sur Supabase:", error);
        } else {
          const now = new Date().toISOString();
          lastRemoteSituationAtRef.current = now;
          setSharedMeta((prev) => ({ ...prev, updatedAt: now }));
        }
      } catch (saveError) {
        logger.warn("⚠️ Erreur sync transferts Supabase:", saveError);
      }
    }, 600);

    return () => {
      if (situationRowsSaveTimeoutRef.current) {
        clearTimeout(situationRowsSaveTimeoutRef.current);
      }
    };
  }, [
    excelData,
    detectedColumns,
    rowsWithMarina,
    settingsLoaded,
    isSupabaseConfigured,
    sharedMeta.fileName,
    sharedMeta.importedBy,
    user?.name,
  ]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel("situation-transfer-rows")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_settings",
          filter: `site_key=eq.${SITE_KEY}`,
        },
        (payload) => {
          const row = payload.new;
          if (!row || !row.payload || typeof row.payload !== "object") return;

          if (row.settings_type === MESSAGE_TEMPLATES_SETTINGS_TYPE) {
            skipNextTemplatesSaveRef.current = true;
            const normalized = normalizeMessageTemplates(row.payload);
            setMessageTemplates(normalized);
            saveLS(LS_KEYS.messageTemplates, normalized);
            return;
          }

          if (row.settings_type !== SITUATION_TRANSFER_SETTINGS_TYPE) return;
          const remoteAt = row.updated_at;
          if (remoteAt && remoteAt === lastRemoteSituationAtRef.current) return;

          const p = row.payload;
          if (!p || typeof p !== "object") return;

          lastRemoteSituationAtRef.current = remoteAt;
          skipNextSituationSaveRef.current = true;

          if (Array.isArray(p.rows)) {
            setExcelData(p.rows);
            saveLS(LS_KEYS.situationTransferRows, p.rows);
          }
          if (Array.isArray(p.detectedColumns)) {
            setDetectedColumns(p.detectedColumns);
          }
          if (Array.isArray(p.rowsWithMarina)) {
            setRowsWithMarina(new Set(p.rowsWithMarina));
          }
          setSharedMeta({
            fileName: p.fileName != null ? String(p.fileName) : "",
            importedBy: p.importedBy != null ? String(p.importedBy) : "",
            updatedAt: remoteAt || null,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isSupabaseConfigured]);
  
  // Les cases marina ne sont plus sauvegardées - elles sont réinitialisées à chaque import

  const activityNames = useMemo(
    () => buildUniqueActivityNames({ activityList: activities.map((a) => a.name) }),
    [activities]
  );

  const handleTemplateChange = useCallback((activityName, template) => {
    const label = normalizeActivityLabel(activityName);
    setMessageTemplates((prev) => {
      const normalized = normalizeMessageTemplates(prev);
      const existingKey =
        Object.keys(normalized).find((k) => activityNameKey(k) === activityNameKey(label)) || label;
      return { ...normalized, [existingKey]: template };
    });
  }, []);

  const handleDeleteTemplate = useCallback((activityName) => {
    setMessageTemplates((prev) => {
      const normalized = normalizeMessageTemplates(prev);
      const keyToDelete = Object.keys(normalized).find(
        (k) => activityNameKey(k) === activityNameKey(activityName)
      );
      if (!keyToDelete) return normalized;
      const next = { ...normalized };
      delete next[keyToDelete];
      return next;
    });
    toast.success(`Message effacé pour « ${activityName} »`);
  }, []);
  
  // Gestion des hôtels avec RDV à l'extérieur
  const handleAddHotel = () => {
    if (!newHotel.trim()) {
      toast.error("Veuillez entrer un nom d'hôtel");
      return;
    }
    
    const hotelName = newHotel.trim();
    const hotelLower = hotelName.toLowerCase();
    // Vérifier si l'hôtel existe déjà (gérer les objets et les strings pour la migration)
    const hotelExists = exteriorHotels.some(h => {
      const hName = typeof h === 'string' ? h : h.name;
      return hName.toLowerCase() === hotelLower;
    });
    
    if (hotelExists) {
      toast.error("Cet hôtel est déjà dans la liste");
      return;
    }
    
    setExteriorHotels([...exteriorHotels, { name: hotelName, hasBeachBoats: false }]);
    toast.success(`Hôtel "${hotelName}" ajouté`);
    setNewHotel("");
  };
  
  const handleDeleteHotel = (hotelName) => {
    if (window.confirm(`Êtes-vous sûr de vouloir retirer "${hotelName}" de la liste des hôtels extérieurs ?\n\nCette action est irréversible.`)) {
      setExteriorHotels(exteriorHotels.filter(h => {
        const hName = typeof h === 'string' ? h : h.name;
        return hName !== hotelName;
      }));
      toast.success(`Hôtel "${hotelName}" retiré`);
    }
  };
  
  // Toggle la case "bateaux sur la plage" pour un hôtel
  const handleToggleBeachBoats = (hotelName) => {
    setExteriorHotels(exteriorHotels.map(h => {
      const hName = typeof h === 'string' ? h : h.name;
      if (hName === hotelName) {
        // Si c'est un string, convertir en objet
        if (typeof h === 'string') {
          return { name: h, hasBeachBoats: true };
        }
        return { ...h, hasBeachBoats: !h.hasBeachBoats };
      }
      return h;
    }));
  };

  // Lire le fichier Excel
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Vérifier que c'est un fichier Excel
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Veuillez sélectionner un fichier Excel (.xlsx ou .xls)");
      return;
    }

    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        
        // Prendre la première feuille
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Lire d'abord comme tableau de tableaux pour avoir toutes les lignes avec les valeurs brutes
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: true });
        
        logger.log("📋 Données brutes du fichier Excel (premières 5 lignes):", rawData.slice(0, 5));
        
        // Chercher automatiquement la ligne qui contient les en-têtes
        // On cherche des mots-clés comme "Invoice", "Date", "Name", "Hotel", etc.
        let headerRowIndex = 0;
        const headerKeywords = ["date", "name", "hotel", "room", "trip", "comment", "phone", "telephone", "tel", "mobile"];
        
        for (let i = 0; i < Math.min(rawData.length, 10); i++) {
          const row = rawData[i] || [];
          const rowString = row.map(cell => String(cell || "").toLowerCase()).join(" ");
          const matches = headerKeywords.filter(keyword => rowString.includes(keyword));
          
          // Si on trouve au moins 3 mots-clés dans cette ligne, c'est probablement la ligne d'en-têtes
          if (matches.length >= 3) {
            headerRowIndex = i;
            logger.log(`✅ Ligne d'en-têtes trouvée à l'index ${i}:`, row);
            break;
          }
        }
        
        let jsonData = [];
        
        if (rawData.length > headerRowIndex + 1) {
          // La ligne d'en-têtes trouvée
          const headers = rawData[headerRowIndex].map((h, idx) => {
            const header = String(h || "").trim();
            // Si l'en-tête est vide, utiliser un nom par défaut basé sur l'index
            return header || `Column_${idx + 1}`;
          });
          
          logger.log("📊 En-têtes détectés:", headers);
          
          if (headers.length > 0) {
            // Filtrer les colonnes à ignorer : M (index 12) et N (index 13)
            // ⚠️ Conserver les colonnes "Trip" (index 9) et "Comment" (index 11) pour récupérer l'activité et l'heure
            const columnsToIgnore = [12, 13];
            const filteredHeaders = headers
              .map((header, index) => ({ header, index }))
              .filter(({ index, header }) => !columnsToIgnore.includes(index) && !isIgnoredTransferExcelColumn(header))
              .map(({ header, index }) => ({ header, originalIndex: index }));
            
            // Convertir les lignes suivantes en objets (en sautant la ligne d'en-têtes)
            jsonData = rawData.slice(headerRowIndex + 1)
              .filter(row => row && row.some(cell => cell !== "" && cell !== null && cell !== undefined)) // Ignorer les lignes complètement vides
              .map(row => {
                const obj = {};
                filteredHeaders.forEach(({ header, originalIndex }) => {
                  const rawValue = row[originalIndex];
                  // Convertir les dates et heures Excel en formats lisibles
                  obj[header] = convertExcelValue(rawValue, header);
                });
                return obj;
              });
          }
        } else {
          // Fallback : essayer la méthode normale de XLSX avec valeurs brutes
          const fallbackData = XLSX.utils.sheet_to_json(worksheet, { 
            defval: "", 
            raw: true 
          });
          // Convertir les dates et heures pour chaque ligne et filtrer les colonnes à ignorer
          // Colonnes à ignorer : J "time", L "Lieux", M "Option", N (sans nom ou "Column_14")
          const columnsToIgnoreNames = ["lieux", "option"];
          jsonData = fallbackData.map(row => {
            const convertedRow = {};
            Object.keys(row).forEach(key => {
              const normalizedKey = key.toLowerCase().trim();
              const isIgnoredByName = columnsToIgnoreNames.includes(normalizedKey) || isIgnoredTransferExcelColumn(key);
              const isIgnoredByColumnNumber = normalizedKey.startsWith("column_") && 
                ["10", "12", "13", "14"].some(num => normalizedKey.endsWith("_" + num) || normalizedKey === "column_" + num);
              
              if (!isIgnoredByName && !isIgnoredByColumnNumber) {
                convertedRow[key] = convertExcelValue(row[key], key);
              }
            });
            return convertedRow;
          });
        }

        if (jsonData.length === 0) {
          toast.error("Le fichier Excel est vide ou ne contient pas de données");
          return;
        }

        const jsonDataNormalized = jsonData;

        // Mapper les colonnes (chercher les colonnes possibles)
        const mappedData = jsonDataNormalized.map((row, index) => {
          const date = findColumn(row, ["Date", "date"]);
          const name = findColumn(row, ["Name", "name", "Client", "client", "Nom", "nom"]);
          const hotel = findColumn(row, ["Hotel", "hotel", "Hôtel", "hôtel"]);
          const roomNo = findColumn(row, ["Rm No", "Rm No.", "RmNo", "Room No", "Room No.", "RoomNo", "Room#", "rm_no", "room_no", "rmno", "roomno", "room", "Room", "Chambre", "chambre", "Numéro", "numero", "Number", "number"]);
          // Chercher Trip avec plus de flexibilité (insensible à la casse, avec espaces, etc.)
          // Essayer d'abord avec les noms exacts, puis avec des variations
          let trip = findColumn(row, ["Trip", "trip", "TRIP", "Activity", "activity", "ACTIVITY", "Activité", "activité", "ACTIVITÉ"]);
          
          // Si pas trouvé, chercher dans toutes les colonnes avec une recherche partielle
          if (!trip || trip.trim() === "") {
            const allKeys = Object.keys(row);
            const tripKey = allKeys.find(key => {
              const keyLower = String(key || "").trim().toLowerCase();
              // Chercher des variations de "trip" ou "activité"
              return keyLower.includes("trip") || 
                     keyLower.includes("activit") || 
                     keyLower.includes("activity") ||
                     keyLower === "trip" ||
                     keyLower === "activité" ||
                     keyLower === "activity";
            });
            if (tripKey) {
              trip = row[tripKey];
              logger.log(`🔍 Trip trouvé via recherche partielle: colonne "${tripKey}" avec valeur "${trip}"`);
            }
          }
          
          // Heure : colonne Comment uniquement (pas time / pax / ch / inf / invoice)
          const commentColumn = findColumn(row, ["Comment", "comment", "COMMENT", "Commentaire", "commentaire"]);
          const pickupTime = commentColumn;
          const comment = findColumn(row, ["Notes", "notes", "Commentaire", "commentaire"]);
          const phoneColumnRaw = findColumn(row, [
            "Phone",
            "phone",
            "Téléphone",
            "telephone",
            "Tel",
            "tel",
            "Mobile",
            "mobile",
            "WhatsApp",
            "whatsapp",
            "GSM",
            "gsm",
          ]);

          // Convertir les valeurs en chaînes pour éviter les erreurs
          const nameStr = String(name || "");

          // Extraire le téléphone (colonne dédiée en priorité, sinon champ Name)
          let phone = resolvePhoneFromExcelRow(nameStr, phoneColumnRaw);
          if (!phone) {
            for (const val of Object.values(row)) {
              const candidate = resolvePhoneFromExcelRow("", String(val || ""));
              if (candidate && validatePhoneNumber(candidate).valid) {
                phone = candidate;
                break;
              }
            }
          }
          const clientName = extractNameFromField(nameStr);

          // Valider le numéro de téléphone
          const phoneValidation = phone ? validatePhoneNumber(phone) : { valid: false, error: "Numéro manquant" };

          return {
            id: `row-${index}`,
            invoiceN: "",
            date: String(date || ""),
            name: clientName || "Client",
            phone: phone || "",
            phoneValid: phoneValidation.valid,
            phoneError: phoneValidation.error,
            hotel: String(hotel || ""),
            roomNo: String(roomNo || ""),
            adults: 0,
            children: 0,
            infants: 0,
            trip: String(trip || "").trim(),
            time: String(pickupTime || "").trim(),
            comment: String(comment || ""),
            messageSent: false,
            messageSentAt: null,
          };
        });

        // Filtrer les lignes vides (sans nom, sans téléphone, sans trip, sans date, etc.)
        const filteredData = mappedData.filter((row) => {
          // Une ligne est considérée comme vide si elle n'a pas de nom OU de téléphone OU de trip OU de date
          const hasName = row.name && row.name.trim() !== "" && row.name !== "Client";
          const hasPhone = row.phone && row.phone.trim() !== "";
          const hasTrip = row.trip && row.trip.trim() !== "";
          const hasDate = row.date && row.date.trim() !== "";

          return hasName && (hasPhone || hasTrip || hasDate);
        });

        // Afficher le nombre de lignes vides supprimées
        const emptyRowsCount = mappedData.length - filteredData.length;
        if (emptyRowsCount > 0) {
          logger.log(`📋 ${emptyRowsCount} ligne(s) vide(s) supprimée(s) automatiquement`);
        }

        // Afficher un debug des colonnes trouvées
        if (jsonDataNormalized.length > 0 && jsonDataNormalized[0]) {
          const detectedColumns = Object.keys(jsonDataNormalized[0] || {}).filter(col => 
            col && 
            col !== "__EMPTY" && 
            !col.startsWith("_EMPTY") && 
            !col.startsWith("Column_") // Filtrer aussi les colonnes par défaut
          );
          setDetectedColumns(detectedColumns);
          logger.log("📊 Colonnes détectées dans le fichier Excel:", detectedColumns);
          logger.log("📋 Première ligne de données:", jsonDataNormalized[0]);
          
          // Debug pour Trip et time
          const firstRow = jsonDataNormalized[0];
          const tripColumn = Object.keys(firstRow).find(key => {
            const keyLower = String(key || "").trim().toLowerCase();
            return keyLower === "trip" || keyLower.includes("trip") || keyLower.includes("activit");
          });
          const timeColumn = Object.keys(firstRow).find(key => {
            const keyLower = String(key || "").trim().toLowerCase();
            return keyLower === "time" || keyLower === "heure" || keyLower.includes("time") || keyLower.includes("heure");
          });
          
          if (tripColumn) {
            logger.log(`✅ Colonne Trip trouvée: "${tripColumn}" avec valeur: "${firstRow[tripColumn]}"`);
          } else {
            logger.warn("⚠️ Colonne Trip non trouvée. Colonnes disponibles:", detectedColumns);
          }
          
          if (timeColumn) {
            logger.log(`✅ Colonne time trouvée: "${timeColumn}" avec valeur: "${firstRow[timeColumn]}"`);
          } else {
            logger.warn("⚠️ Colonne time non trouvée. Colonnes disponibles:", detectedColumns);
          }
          
          // Debug pour les valeurs Trip détectées dans les premières lignes
          if (filteredData.length > 0) {
            logger.log("📋 Exemple de valeurs Trip détectées dans les premières lignes:");
            filteredData.slice(0, 3).forEach((row, idx) => {
              logger.log(`  Ligne ${idx + 1}: trip="${row.trip}" | time="${row.time}"`);
            });
          }
          
          // Avertir si aucune colonne valide n'est détectée
          if (detectedColumns.length === 0) {
            toast.error("Aucune colonne valide détectée. Vérifiez que la première ligne de votre Excel contient les en-têtes (Date, Name, Hotel, Trip, Comment, etc.)");
          }
        } else {
          setDetectedColumns([]);
        }

        // Vérifier les numéros de téléphone invalides (seulement sur les lignes non vides)
        const invalidPhones = filteredData.filter(d => !d.phoneValid);
        
        if (invalidPhones.length > 0) {
          const invalidCount = invalidPhones.length;
          const missingCount = invalidPhones.filter(d => !d.phone || d.phone.trim() === "").length;
          const errorCount = invalidCount - missingCount;
          
          let alertMessage = `⚠️ ${invalidCount} numéro(s) de téléphone invalide(s) détecté(s) :\n`;
          if (missingCount > 0) {
            alertMessage += `- ${missingCount} numéro(s) manquant(s)\n`;
          }
          if (errorCount > 0) {
            alertMessage += `- ${errorCount} numéro(s) avec erreur(s)\n\n`;
          }
          alertMessage += "Les lignes avec des numéros invalides sont marquées en rouge dans le tableau.";
          
          toast.error(alertMessage, { duration: 8000 });
          
          // Afficher les détails dans la console
          logger.warn("⚠️ Numéros de téléphone invalides détectés :");
          invalidPhones.forEach((data, idx) => {
            logger.warn(`${idx + 1}. ${data.name} - ${data.phone || "MANQUANT"} - Erreur: ${data.phoneError || "Numéro manquant"}`);
          });
        }
        
        setExcelData(filteredData);
        setRowsWithMarina(new Set()); // Réinitialiser toutes les cases marina à chaque nouvel import
        setMessageOverrides({});
        setShowPreview(false);
        setSendLog([]);
        lastUploadedFileNameRef.current = file.name;
        setSharedMeta({
          fileName: file.name,
          importedBy: user?.name || "",
          updatedAt: new Date().toISOString(),
        });
        
        if (filteredData.length > 0) {
          const message = `${filteredData.length} ligne(s) chargée(s) depuis le fichier Excel${emptyRowsCount > 0 ? ` (${emptyRowsCount} ligne(s) vide(s) supprimée(s))` : ""}`;
          toast.success(message);
        }
      } catch (error) {
        logger.error("Erreur lors de la lecture du fichier Excel:", error);
        toast.error("Erreur lors de la lecture du fichier Excel. Vérifiez que le fichier est valide.");
      }
    };

    reader.onerror = () => {
      toast.error("Erreur lors de la lecture du fichier");
    };

    reader.readAsArrayBuffer(file);
    
    // Réinitialiser l'input pour permettre de recharger le même fichier
    event.target.value = "";
  };

  // Fonction pour cocher/décocher la marina pour une ligne
  const handleToggleMarina = useCallback((rowId) => {
    setRowsWithMarina((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
      return newSet;
    });
    setMessageOverrides((prev) => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }, []);
  
  const handleCellEdit = useCallback((rowId, field, value) => {
    setExcelData((prev) =>
      prev.map((row) => {
        if (row.id === rowId) {
          const updatedRow = { ...row, [field]: value };
          
          if (field === "phone") {
            const phoneValidation = value ? validatePhoneNumber(value) : { valid: false, error: "Numéro manquant" };
            updatedRow.phoneValid = phoneValidation.valid;
            updatedRow.phoneError = phoneValidation.error;
          }
          
          if (field === "name") {
            const nameStr = String(value || "");
            const phone = extractPhoneFromName(nameStr);
            const clientName = extractNameFromField(nameStr);
            updatedRow.name = clientName || "Client";
            updatedRow.phone = phone || updatedRow.phone;
            if (updatedRow.phone) {
              const phoneValidation = validatePhoneNumber(updatedRow.phone);
              updatedRow.phoneValid = phoneValidation.valid;
              updatedRow.phoneError = phoneValidation.error;
            }
          }
          
          return updatedRow;
        }
        return row;
      })
    );
    setMessageOverrides((prev) => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }, [setExcelData]);

  const fileInputRef = useRef(null);
  // Wrapper pour generateMessage avec contexte local (mémoïsé pour éviter les recalculs)
  const generateMessageWithContext = useCallback((data) => {
    return generateMessage(data, messageTemplates, rowsWithMarina, exteriorHotels);
  }, [messageTemplates, rowsWithMarina, exteriorHotels]);

  const getMessageForRow = useCallback(
    (data) => {
      if (messageOverrides[data.id] != null) {
        return messageOverrides[data.id];
      }
      const previewMessage = previewMessages.find((msg) => msg.id === data.id);
      if (previewMessage?.message) {
        return previewMessage.message;
      }
      return generateMessageWithContext(data);
    },
    [messageOverrides, previewMessages, generateMessageWithContext]
  );

  const handleOpenMessagePreview = useCallback((row) => {
    setMessagePreviewRow(row);
  }, []);

  const handleSaveMessageOverride = useCallback(
    (draft) => {
      if (!messagePreviewRow) return;
      setMessageOverrides((prev) => ({ ...prev, [messagePreviewRow.id]: draft }));
      setPreviewMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messagePreviewRow.id);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], message: draft };
        return next;
      });
      toast.success("Message enregistré");
      setMessagePreviewRow(null);
    },
    [messagePreviewRow]
  );

  const handleResetMessagePreview = useCallback(() => {
    if (!messagePreviewRow) return;
    const rowId = messagePreviewRow.id;
    setMessageOverrides((prev) => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setPreviewMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === rowId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], message: generateMessageWithContext(messagePreviewRow) };
      return next;
    });
    toast.info("Message réinitialisé");
  }, [messagePreviewRow, generateMessageWithContext]);

  // Prévisualiser les messages
  const handlePreviewMessages = () => {
    if (excelData.length === 0) {
      toast.warning("Aucune donnée à prévisualiser. Veuillez d'abord charger un fichier Excel.");
      return;
    }

    const messages = excelData.map((data) => ({
      ...data,
      message: getMessageForRow(data),
    }));

    setPreviewMessages(messages);
    setShowPreview(true);
  };

  // Fonction pour tenter d'envoyer automatiquement le message WhatsApp
  const _tryAutoSendMessage = async (whatsappWindow, maxAttempts = 5) => {
    if (!whatsappWindow || whatsappWindow.closed) {
      logger.warn("⚠️ Fenêtre WhatsApp fermée, impossible d'automatiser l'envoi");
      return false;
    }

    // Essayer plusieurs fois avec des délais croissants (WhatsApp peut prendre du temps à charger)
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Attendre que WhatsApp soit complètement chargé (délai croissant)
        const waitTime = attempt === 1 ? 2000 : attempt === 2 ? 3000 : 4000;
        logger.log(`🔄 Tentative ${attempt}/${maxAttempts} d'envoi automatique (attente ${waitTime}ms)...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));

        // Essayer d'accéder au document de la fenêtre WhatsApp
        // Note: Cela peut échouer à cause de CORS si la fenêtre est sur un domaine différent
        let sendButton = null;
        let textBox = null;

        try {
          // Méthode 1: Chercher le bouton d'envoi par différents sélecteurs possibles
        const selectors = [
          'button[data-tab="11"]', // Bouton d'envoi WhatsApp
          'span[data-icon="send"]', // Icône d'envoi
          'button[aria-label*="Send"]', // Bouton avec aria-label
          'button[aria-label*="Envoyer"]', // Bouton avec aria-label français
          '[data-testid="send"]', // Test ID
          'button[type="submit"]', // Bouton submit
        ];

        for (const selector of selectors) {
          try {
            const elements = whatsappWindow.document.querySelectorAll(selector);
            if (elements.length > 0) {
              sendButton = elements[elements.length - 1]; // Prendre le dernier (le plus récent)
              logger.log(`✅ Bouton d'envoi trouvé avec le sélecteur: ${selector}`);
              break;
            }
          } catch {
            // Continuer avec le prochain sélecteur
          }
        }

        // Méthode 2: Chercher la zone de texte pour simuler Entrée
        const textSelectors = [
          'div[contenteditable="true"][data-tab="10"]',
          'div[contenteditable="true"][role="textbox"]',
          '[contenteditable="true"]',
        ];

        for (const selector of textSelectors) {
          try {
            const elements = whatsappWindow.document.querySelectorAll(selector);
            if (elements.length > 0) {
              textBox = elements[elements.length - 1];
              logger.log(`✅ Zone de texte trouvée avec le sélecteur: ${selector}`);
              break;
            }
          } catch {
            // Continuer avec le prochain sélecteur
          }
        }

        // Méthode 3: Essayer de cliquer sur le bouton d'envoi
        if (sendButton) {
          logger.log("🤖 Tentative d'envoi automatique via clic sur le bouton...");
          sendButton.click();
          await new Promise((resolve) => setTimeout(resolve, 500));
          logger.log("✅ Clic sur le bouton d'envoi effectué");
          return true;
        }

        // Méthode 4: Simuler la touche Entrée dans la zone de texte
        if (textBox) {
          logger.log("🤖 Tentative d'envoi automatique via touche Entrée...");
          textBox.focus();
          
          // Créer et dispatcher un événement Entrée
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          });
          
          textBox.dispatchEvent(enterEvent);
          await new Promise((resolve) => setTimeout(resolve, 300));
          
          const enterEventUp = new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          });
          
          textBox.dispatchEvent(enterEventUp);
          await new Promise((resolve) => setTimeout(resolve, 500));
          logger.log("✅ Touche Entrée simulée");
          return true;
        }

          // Si aucune méthode n'a fonctionné, continuer à la prochaine tentative
          if (attempt < maxAttempts) {
            logger.log(`⚠️ Tentative ${attempt} échouée, nouvelle tentative dans 1 seconde...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          } else {
            logger.warn("⚠️ Impossible de trouver le bouton d'envoi ou la zone de texte après toutes les tentatives");
            return false;
          }
        } catch (innerError) {
          // Erreur CORS ou autre dans le try interne - continuer à la prochaine tentative
          if (attempt < maxAttempts) {
            logger.warn(`⚠️ Tentative ${attempt} échouée (CORS ou protection WhatsApp), nouvelle tentative...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          } else {
            logger.warn("⚠️ Automatisation impossible après toutes les tentatives (CORS ou protection WhatsApp):", innerError.message);
            return false;
          }
        }
      } catch (error) {
        // Erreur dans le try externe - essayer encore si ce n'est pas la dernière tentative
        if (attempt < maxAttempts) {
          logger.warn(`⚠️ Tentative ${attempt} échouée (erreur générale), nouvelle tentative...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        } else {
          logger.warn("⚠️ Automatisation impossible après toutes les tentatives:", error.message);
          return false;
        }
      }
    }
    
    // Si on arrive ici, toutes les tentatives ont échoué
    return false;
  };

  // Ouvrir WhatsApp Web avec le numéro et le message pré-rempli (optimisé pour réutiliser la même fenêtre)
  const openWhatsApp = async (phone, message) => {
    // Nettoyer le numéro de téléphone (enlever les espaces, tirets, etc.)
    const cleanPhone = phone.replace(/[\s-()]/g, "");
    // Encoder le message pour l'URL
    const encodedMessage = encodeURIComponent(message);
    // Créer l'URL WhatsApp
    const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;
    
    logger.log(`📱 Changement de l'URL WhatsApp pour ${phone}...`);
    
    // Nom de fenêtre fixe pour FORCER la réutilisation de la même fenêtre
    const windowName = "whatsapp_auto_send";
    
    // Vérifier si une fenêtre existe déjà et n'est pas fermée
    if (whatsappWindowRef.current) {
      try {
        if (!whatsappWindowRef.current.closed) {
          logger.log("🔄 Fenêtre WhatsApp existante détectée, changement d'URL...");
          // Changer l'URL directement dans la fenêtre existante (plus rapide, pas de rechargement complet)
          try {
            whatsappWindowRef.current.location.href = whatsappUrl;
            whatsappWindowRef.current.focus();
            logger.log("✅ URL WhatsApp mise à jour dans la fenêtre existante");
            // Délai réduit à 3 secondes car on change juste l'URL (pas de rechargement complet)
            logger.log("⏳ Attente de 3 secondes pour laisser WhatsApp charger la nouvelle conversation...");
            toast.info("⏳ Chargement de la conversation WhatsApp... (3 secondes)", { duration: 3000 });
            await new Promise((resolve) => setTimeout(resolve, 3000));
            return whatsappWindowRef.current;
          } catch {
            // Si on ne peut pas changer l'URL directement (CORS), utiliser window.open
            logger.warn("⚠️ Impossible de changer l'URL directement, utilisation de window.open...");
            const reusedWindow = window.open(whatsappUrl, windowName);
            if (reusedWindow) {
              whatsappWindowRef.current = reusedWindow;
              reusedWindow.focus();
              logger.log("✅ Fenêtre WhatsApp réutilisée via window.open");
              logger.log("⏳ Attente de 5 secondes pour laisser WhatsApp charger...");
              toast.info("⏳ Chargement de la conversation WhatsApp... (5 secondes)", { duration: 5000 });
              await new Promise((resolve) => setTimeout(resolve, 5000));
              return reusedWindow;
            }
          }
        } else {
          // La fenêtre a été fermée, réinitialiser la référence
          logger.log("🔄 La fenêtre WhatsApp précédente a été fermée");
          whatsappWindowRef.current = null;
        }
      } catch (error) {
        // Erreur lors de la vérification, réinitialiser et ouvrir une nouvelle fenêtre
        logger.warn("⚠️ Erreur lors de la vérification de la fenêtre existante:", error);
        whatsappWindowRef.current = null;
      }
    }
    
    // Ouvrir une nouvelle fenêtre WhatsApp
    logger.log("🔄 Ouverture d'une nouvelle fenêtre WhatsApp...");
    const whatsappWindow = window.open(whatsappUrl, windowName);
    
    if (whatsappWindow) {
      // Mettre à jour la référence
      whatsappWindowRef.current = whatsappWindow;
      logger.log("✅ Fenêtre WhatsApp ouverte avec succès");
      
      // Attente réduite à 5 secondes pour le chargement initial (optimisé)
      logger.log("⏳ Attente de 5 secondes pour laisser WhatsApp charger...");
      toast.info("⏳ Chargement initial de WhatsApp Web... (5 secondes)", { duration: 5000 });
      await new Promise((resolve) => setTimeout(resolve, 5000));
      
      // Focus sur la fenêtre (non-bloquant)
      try {
        whatsappWindow.focus();
      } catch (error) {
        logger.debug("Focus WhatsApp impossible:", error);
      }
      
      return whatsappWindow;
    } else {
      logger.error("❌ window.open() a retourné null - Impossible d'ouvrir la fenêtre WhatsApp");
      logger.error("❌ Le navigateur bloque probablement les popups automatiques");
      logger.error("❌ IMPORTANT: Vous devez autoriser les popups pour ce site");
      whatsappWindowRef.current = null;
      return null;
    }
  };

  // Envoyer un message via WhatsApp Web automatiquement
  const sendWhatsAppMessage = async (data, index, total, messageOverride) => {
    logger.log(`📨 Envoi du message ${index + 1}/${total} pour ${data.name} (${data.phone})`);

    const message = messageOverride ?? getMessageForRow(data);
    
    // IMPORTANT: Attendre 10 secondes minimum entre chaque message pour éviter le bannissement WhatsApp
    // C'est le délai minimum recommandé par WhatsApp pour éviter les restrictions
    const MIN_DELAY_BETWEEN_MESSAGES = 10000; // 10 secondes entre chaque changement de conversation
    
    // Ouvrir WhatsApp Web (réutilise la même fenêtre en changeant l'URL)
    logger.log(`⏳ Ouverture de WhatsApp Web...`);
    const whatsappWindow = await openWhatsApp(data.phone, message);
    
    if (!whatsappWindow) {
      logger.error(`❌ Impossible d'ouvrir WhatsApp Web pour ${data.phone}`);
      toast.error("Impossible d'ouvrir WhatsApp Web. Vérifiez que les popups ne sont pas bloquées.");
      return false;
    }

    // Marquer que ce n'est plus le premier message après la première ouverture
    if (isFirstMessageRef.current) {
      isFirstMessageRef.current = false;
    }

    logger.log(`✅ WhatsApp Web ouvert avec succès. Le message est prêt à être envoyé.`);
    toast.info(
      `📱 WhatsApp Web ouvert pour ${data.name} (${data.phone}). ` +
      `Cliquez sur "Envoyer" (ou appuyez sur Entrée) dans la fenêtre WhatsApp pour envoyer le message.`,
      { duration: 5000 }
    );

    // Attendre 10 secondes minimum avant de passer au suivant
    // Ce délai est CRITIQUE pour éviter le bannissement WhatsApp
    // L'utilisateur a ce temps pour cliquer sur Envoyer
    logger.log(`⏱️ Attente de ${MIN_DELAY_BETWEEN_MESSAGES / 1000} secondes avant le prochain message (pour éviter le bannissement)...`);
    const startTime = Date.now();
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_BETWEEN_MESSAGES));
    const elapsedTime = Date.now() - startTime;
    logger.log(`✅ Attente terminée (${elapsedTime}ms écoulés). Passage au suivant...`);

    // Marquer comme envoyé
    const logEntry = {
      id: data.id,
      name: data.name,
      phone: data.phone,
      trip: data.trip,
      time: data.time,
      status: "success",
      message: message,
      sentAt: new Date().toISOString(),
    };

    setSendLog((prev) => [...prev, logEntry]);
    
    // Mettre à jour le statut dans excelData
    setExcelData((prev) =>
      prev.map((item) =>
        item.id === data.id
          ? { ...item, messageSent: true, messageSentAt: new Date().toISOString() }
          : item
      )
    );

    // Ne pas fermer la fenêtre ici - elle sera fermée avant l'ouverture de la suivante
    // Cela évite les problèmes de timing et permet à l'utilisateur de voir le message envoyé
    logger.log("✅ Message traité, la fenêtre sera fermée avant l'ouverture du suivant");

    return true;
  };

  // Envoyer un message manuellement pour une ligne spécifique
  const handleSendSingleMessage = useCallback(async (rowData) => {
    if (!rowData.phone || !rowData.phoneValid) {
      toast.error("Cette ligne n'a pas de numéro de téléphone valide.");
      return;
    }

    if (rowData.messageSent) {
      toast.info("Ce message a déjà été envoyé.");
      return;
    }

    try {
      // Trouver l'index de la ligne dans excelData
      const index = excelData.findIndex((item) => item.id === rowData.id);
      const total = excelData.length;

      // Utiliser sendWhatsAppMessage qui gère déjà toute la logique
      await sendWhatsAppMessage(rowData, index, total);
      toast.success(`Message envoyé pour ${rowData.name} (${rowData.phone})`);
    } catch (error) {
      logger.error("Erreur lors de l'envoi manuel du message:", error);
      toast.error("Erreur lors de l'envoi du message. Veuillez réessayer.");
    }
  }, [excelData]);

  const handleSendFromPreview = useCallback(
    async (draft) => {
      if (!messagePreviewRow) return;
      const row = messagePreviewRow;
      if (!row.phone || !row.phoneValid) {
        toast.error("Cette ligne n'a pas de numéro de téléphone valide.");
        return;
      }
      if (row.messageSent) {
        toast.info("Ce message a déjà été envoyé.");
        return;
      }
      setMessageOverrides((prev) => ({ ...prev, [row.id]: draft }));
      setMessagePreviewRow(null);
      try {
        const index = excelData.findIndex((item) => item.id === row.id);
        await sendWhatsAppMessage(row, index, excelData.length, draft);
        toast.success(`WhatsApp ouvert pour ${row.name}`);
      } catch (error) {
        logger.error("Erreur lors de l'envoi du message:", error);
        toast.error("Erreur lors de l'envoi du message. Veuillez réessayer.");
      }
    },
    [messagePreviewRow, excelData]
  );

  // Données pour le tableau clients
  const listItemData = useMemo(
    () => ({
      editingCell,
      setEditingCell,
      handleCellEdit,
      handleToggleMarina,
      rowsWithMarina,
      handleSendSingleMessage,
      handleOpenMessagePreview,
      messageOverrides,
    }),
    [
      editingCell,
      handleCellEdit,
      handleToggleMarina,
      rowsWithMarina,
      handleSendSingleMessage,
      handleOpenMessagePreview,
      messageOverrides,
    ]
  );

  // Démarrer l'envoi automatique des messages
  const handleAutoSendMessages = async () => {
    if (excelData.length === 0) {
      toast.warning("Aucune donnée à envoyer. Veuillez d'abord charger un fichier Excel.");
      return;
    }

    // Vérifier les numéros de téléphone (valides seulement)
    const dataWithPhone = excelData.filter((data) => data.phone && data.phoneValid && !data.messageSent);
    const dataWithoutPhone = excelData.filter((data) => !data.phone || !data.phoneValid);

    if (dataWithoutPhone.length > 0) {
      const confirm = window.confirm(
        `${dataWithoutPhone.length} ligne(s) n'ont pas de numéro de téléphone valide et seront ignorées. Voulez-vous continuer ?`
      );
      if (!confirm) return;
    }

    if (dataWithPhone.length === 0) {
      toast.error("Aucun numéro de téléphone valide trouvé dans les données ou tous les messages ont déjà été envoyés.");
      return;
    }

    const finalConfirm = window.confirm(
      `Vous êtes sur le point d'envoyer ${dataWithPhone.length} message(s) automatiquement via WhatsApp Web.\n\n` +
      `Le système va :\n` +
      `1. Ouvrir WhatsApp Web avec chaque numéro\n` +
      `2. Pré-remplir le message\n` +
      `3. Attendre 10 secondes minimum entre chaque message (pour éviter le bannissement)\n` +
      `4. Passer automatiquement au suivant\n\n` +
      `⚠️ IMPORTANT :\n` +
      `- Vous devez AUTORISER LES POPUPS dans votre navigateur pour que cela fonctionne\n` +
      `- Vous devrez être connecté à WhatsApp Web\n` +
      `- Le système tentera d'envoyer automatiquement chaque message (nouveau !)\n` +
      `- Si l'envoi automatique échoue, vous devrez cliquer sur "Envoyer" manuellement\n` +
      `- Le système attendra exactement 10 secondes entre chaque message (CRITIQUE pour éviter le bannissement)\n` +
      `- Le premier message attendra 10 secondes supplémentaires pour laisser WhatsApp charger\n` +
      `- Vous pouvez arrêter l'envoi automatique à tout moment avec le bouton "Arrêter"\n\n` +
      `🛡️ PROTECTION CONTRE LE BANNISSEMENT :\n` +
      `- Délai minimum de 10 secondes entre chaque message (garanti)\n` +
      `- Ne pas envoyer plus de 30 messages par heure (recommandé)\n` +
      `- Chaque message contient un lien unique (évite la détection de spam)\n` +
      `- Varier les messages si possible (utilisez les templates personnalisés)\n` +
      `- Éviter d'envoyer plus de 50 messages par jour depuis le même compte\n\n` +
      `💡 ASTUCE : Gardez la fenêtre WhatsApp Web ouverte et cliquez rapidement sur "Envoyer" lorsque chaque message s'ouvre.\n\n` +
      `Voulez-vous continuer ?`
    );
    if (!finalConfirm) return;

    // Initialiser la queue
    messageQueueRef.current = dataWithPhone;
    setAutoSending(true);
    setCurrentIndex(0);
    setRemainingCount(dataWithPhone.length);
    setSending(true);
    setSendLog([]);
    // Réinitialiser le flag du premier message
    isFirstMessageRef.current = true;

    // Démarrer l'envoi automatique
    startAutoSending(dataWithPhone);
  };

  // Fonction pour démarrer l'envoi automatique
  const startAutoSending = async (queue) => {
    isAutoSendingRef.current = true;
    
    // Filtrer les numéros invalides
    const validQueue = queue.filter((data) => data.phone && data.phoneValid);
    const invalidQueue = queue.filter((data) => !data.phone || !data.phoneValid);
    
    if (invalidQueue.length > 0) {
      toast.warning(`⚠️ ${invalidQueue.length} ligne(s) avec numéro invalide seront ignorées.`, { duration: 5000 });
      logger.warn(`⚠️ ${invalidQueue.length} ligne(s) avec numéro invalide ignorées :`);
      invalidQueue.forEach((data) => {
        logger.warn(`  - ${data.name}: ${data.phone || "MANQUANT"} - ${data.phoneError || "Numéro manquant"}`);
      });
    }
    
    if (validQueue.length === 0) {
      toast.error("Aucun numéro de téléphone valide trouvé. Impossible d'envoyer les messages.");
      isAutoSendingRef.current = false;
      setAutoSending(false);
      setSending(false);
      return;
    }
    
    logger.log(`🚀 Démarrage de l'envoi automatique de ${validQueue.length} messages (${invalidQueue.length} ignorés)`);
    
    for (let i = 0; i < validQueue.length; i++) {
      if (!isAutoSendingRef.current) {
        // Si l'utilisateur a arrêté l'envoi
        logger.log(`⏹️ Envoi arrêté par l'utilisateur à l'index ${i}`);
        break;
      }

      logger.log(`\n🔄 ========== DÉBUT DU MESSAGE ${i + 1}/${validQueue.length} ==========`);
      
      setCurrentIndex(i + 1);
      setRemainingCount(validQueue.length - i - 1);

      const data = validQueue[i];

      logger.log(`📤 Envoi ${i + 1}/${validQueue.length} : ${data.name} (${data.phone})`);
      toast.info(`Envoi ${i + 1}/${validQueue.length} : ${data.name} (${data.phone})`);

      try {
        logger.log(`⏳ Appel de sendWhatsAppMessage pour le message ${i + 1}...`);
        const result = await sendWhatsAppMessage(data, i, validQueue.length);
        logger.log(`✅ Message ${i + 1} traité avec résultat:`, result);
        
        if (!result) {
          logger.warn(`⚠️ sendWhatsAppMessage a retourné false pour le message ${i + 1}, mais on continue...`);
        }
      } catch (error) {
        logger.error(`❌ ERREUR lors de l'envoi du message ${i + 1}:`, error);
        logger.error(`Stack trace:`, error.stack);
        const logEntry = {
          id: data.id,
          name: data.name,
          phone: data.phone,
          trip: data.trip,
          time: data.time,
          status: "error",
          error: error.message,
          sentAt: new Date().toISOString(),
        };
        setSendLog((prev) => [...prev, logEntry]);
      }

      logger.log(`✅ ========== FIN DU MESSAGE ${i + 1}/${validQueue.length} ==========\n`);
      
      // NOTE: Le délai de 10 secondes est déjà inclus dans sendWhatsAppMessage
      // Pas besoin de pause supplémentaire pour éviter le bannissement
      // Le délai de 10 secondes entre chaque message est respecté automatiquement
    }

    // Terminer l'envoi automatique
    logger.log(`🏁 Fin de l'envoi automatique`);
    isAutoSendingRef.current = false;
    setAutoSending(false);
    setSending(false);
    
    // Attendre un peu pour que les logs soient mis à jour
    setTimeout(() => {
      const successCount = sendLog.filter((l) => l.status === "success").length;
      const errorCount = sendLog.filter((l) => l.status === "error").length;
      
      toast.success(`Envoi terminé : ${successCount} message(s) envoyé(s)${errorCount > 0 ? `. ${errorCount} erreur(s).` : ""}`);
    }, 500);
  };

  // Arrêter l'envoi automatique
  const handleStopAutoSending = () => {
    isAutoSendingRef.current = false;
    setAutoSending(false);
    setSending(false);
    
    // Fermer la fenêtre WhatsApp si elle est ouverte
    if (whatsappWindowRef.current && !whatsappWindowRef.current.closed) {
      try {
        whatsappWindowRef.current.close();
      } catch (error) {
        logger.debug("Impossible de fermer la fenêtre WhatsApp:", error);
      }
    }

    // Nettoyer l'intervalle
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    toast.warning("Envoi automatique arrêté.");
  };
  
  // Nettoyer lors du démontage du composant
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (whatsappWindowRef.current && !whatsappWindowRef.current.closed) {
        try {
          whatsappWindowRef.current.close();
        } catch (error) {
          logger.debug("Impossible de fermer la fenêtre WhatsApp au démontage:", error);
        }
      }
    };
  }, []);

  // Ancienne fonction pour l'envoi manuel (simulation)
  const handleSendMessages = async () => {
    if (excelData.length === 0) {
      toast.warning("Aucune donnée à envoyer. Veuillez d'abord charger un fichier Excel.");
      return;
    }

    // Vérifier les numéros de téléphone (valides seulement)
    const dataWithPhone = excelData.filter((data) => data.phone && data.phoneValid);
    const dataWithoutPhone = excelData.filter((data) => !data.phone || !data.phoneValid);

    if (dataWithoutPhone.length > 0) {
      const confirm = window.confirm(
        `${dataWithoutPhone.length} ligne(s) n'ont pas de numéro de téléphone valide et seront ignorées. Voulez-vous continuer ?`
      );
      if (!confirm) return;
    }

    if (dataWithPhone.length === 0) {
      toast.error("Aucun numéro de téléphone valide trouvé dans les données.");
      return;
    }

    const finalConfirm = window.confirm(
      `Vous êtes sur le point d'envoyer ${dataWithPhone.length} message(s). Êtes-vous sûr ?`
    );
    if (!finalConfirm) return;

    setSending(true);
    const log = [];

    // Simuler l'envoi des messages
    for (let i = 0; i < dataWithPhone.length; i++) {
      const data = dataWithPhone[i];
      const message = getMessageForRow(data);

      try {
        // TODO: Remplacer par un vrai service d'envoi (Twilio, WhatsApp API, etc.)
        // Pour l'instant, on simule l'envoi
        await new Promise((resolve) => setTimeout(resolve, 500)); // Simulation d'envoit 

        log.push({
          id: data.id,
          name: data.name,
          phone: data.phone,
          trip: data.trip,
          time: data.time,
          status: "success",
          message: message,
          sentAt: new Date().toISOString(),
        });

        // Mettre à jour le statut dans excelData
        setExcelData((prev) =>
          prev.map((item) =>
            item.id === data.id
              ? { ...item, messageSent: true, messageSentAt: new Date().toISOString() }
              : item
          )
        );
      } catch (error) {
        log.push({
          id: data.id,
          name: data.name,
          phone: data.phone,
          trip: data.trip,
          time: data.time,
          status: "error",
          error: error.message,
          sentAt: new Date().toISOString(),
        });
      }
    }

    setSendLog(log);
    setSending(false);
    
    const successCount = log.filter((l) => l.status === "success").length;
    const errorCount = log.filter((l) => l.status === "error").length;
    
    toast.success(`${successCount} message(s) envoyé(s) avec succès${errorCount > 0 ? `. ${errorCount} erreur(s).` : ""}`);
  };

  // Statistiques
  const stats = useMemo(() => {
    const total = excelData.length;
    const withPhone = excelData.filter((d) => d.phone && d.phoneValid).length;
    const withoutPhone = excelData.filter((d) => !d.phone || !d.phoneValid).length;
    const invalidPhones = excelData.filter((d) => d.phone && !d.phoneValid).length;
    const sent = excelData.filter((d) => d.messageSent).length;
    
    return { total, withPhone, withoutPhone, invalidPhones, sent };
  }, [excelData]);

  const hasWorkData = excelData.length > 0;

  const headerButtons = (
    <div className="flex flex-wrap gap-2">
      {hasWorkData && (
        <GhostBtn onClick={() => fileInputRef.current?.click()} variant="info">
          Changer de fichier
        </GhostBtn>
      )}
      <GhostBtn onClick={() => setShowHotelsModal(true)} variant="info">
        Hôtels extérieur
      </GhostBtn>
      <GhostBtn onClick={() => setShowConfigModal(true)} variant="primary">
        Messages prédéfinis
      </GhostBtn>
    </div>
  );

  const statsBar = hasWorkData ? (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700">
        {stats.total} client{stats.total > 1 ? "s" : ""}
      </span>
      <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-800">
        {stats.withPhone} prêt{stats.withPhone > 1 ? "s" : ""}
      </span>
      {stats.withoutPhone > 0 && (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-800">
          {stats.withoutPhone} à corriger
        </span>
      )}
      {stats.sent > 0 && (
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">
          {stats.sent} envoyé{stats.sent > 1 ? "s" : ""}
        </span>
      )}
    </div>
  ) : null;

  const clientList = hasWorkData ? (
    <>
      <TransferClientsTable rows={excelData} data={listItemData} />
      {Object.keys(messageOverrides).length > 0 && (
        <p className="text-[11px] text-slate-500">* = message modifié manuellement</p>
      )}
    </>
  ) : null;

  const actionButtons = hasWorkData ? (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
      <GhostBtn onClick={handlePreviewMessages} disabled={sending || autoSending}>
        Tous les messages
      </GhostBtn>
      <PrimaryBtn
        onClick={handleAutoSendMessages}
        disabled={sending || autoSending || stats.withPhone === 0}
        variant="success"
        className="px-4 py-2 text-sm font-semibold"
      >
        {autoSending ? "Envoi en cours..." : `Envoyer tout (${stats.withPhone})`}
      </PrimaryBtn>
    </div>
  ) : null;

  const modalsAndOverlays = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
      />

      {showPreview && (
        <MessagePreviewSection
          previewMessages={previewMessages}
          onMessageChange={(index, value) => {
            const updatedMessages = [...previewMessages];
            const row = updatedMessages[index];
            updatedMessages[index] = { ...row, message: value };
            setPreviewMessages(updatedMessages);
            if (row?.id) {
              setMessageOverrides((prev) => ({ ...prev, [row.id]: value }));
            }
          }}
          onClose={() => setShowPreview(false)}
        />
      )}

      {messagePreviewRow && (
        <TransferMessagePreviewModal
          row={messagePreviewRow}
          initialMessage={getMessageForRow(messagePreviewRow)}
          onSave={handleSaveMessageOverride}
          onReset={handleResetMessagePreview}
          onSendWhatsApp={handleSendFromPreview}
          onClose={() => setMessagePreviewRow(null)}
        />
      )}

      {showConfigModal && (
        <Suspense
          fallback={
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-6 text-sm font-medium text-slate-700">
                Chargement de la configuration...
              </div>
            </div>
          }
        >
            <MessageTemplatesModal
              activityNames={activityNames}
              messageTemplates={messageTemplates}
              onTemplateChange={handleTemplateChange}
              onDeleteTemplate={handleDeleteTemplate}
              onClose={() => setShowConfigModal(false)}
              saveStatus={templatesSaveStatus}
            />
        </Suspense>
      )}

      {showHotelsModal && (
        <Suspense
          fallback={
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-6 text-sm font-medium text-slate-700">
                Chargement de la liste des hôtels...
              </div>
            </div>
          }
        >
          <HotelsModal
            exteriorHotels={exteriorHotels}
            newHotel={newHotel}
            onChangeNewHotel={handleNewHotelChange}
            onAddHotel={handleAddHotel}
            onDeleteHotel={handleDeleteHotel}
            onToggleBeachBoats={handleToggleBeachBoats}
            onClose={() => setShowHotelsModal(false)}
          />
        </Suspense>
      )}
    </>
  );

  return (
    <>
      <Section
        title="Transferts WhatsApp"
        subtitle={
          hasWorkData
            ? `${sharedMeta.fileName || "Fichier du jour"} — ${stats.total} client${stats.total > 1 ? "s" : ""}`
            : "Importez le fichier Excel du jour pour envoyer les messages de prise en charge."
        }
        right={headerButtons}
      >
        {!hasWorkData && (
          <div className="transfer-content">
            <ExcelUploadSection onFileUpload={handleFileUpload} />
          </div>
        )}

        {hasWorkData && (
          <div className="transfer-content space-y-2">
            {statsBar}
            {clientList}
            {autoSending && (
              <AutoSendingIndicator
                currentIndex={currentIndex}
                remainingCount={remainingCount}
                onStop={handleStopAutoSending}
              />
            )}
            {actionButtons}
            <SendLogSection sendLog={sendLog} />
          </div>
        )}
      </Section>
      {modalsAndOverlays}
    </>
  );
}

