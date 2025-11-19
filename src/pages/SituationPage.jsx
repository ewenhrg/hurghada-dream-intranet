import { useState, useMemo, useRef, useEffect, useCallback, Suspense, lazy, memo } from "react";
import * as XLSX from "xlsx";
import { PrimaryBtn, GhostBtn, Section, TextInput } from "../components/ui";
import { toast } from "../utils/toast.js";
import { LS_KEYS, SITE_KEY } from "../constants";
import { loadLS, saveLS } from "../utils";
import { extractPhoneFromName, validatePhoneNumber, extractNameFromField } from "../utils/phoneUtils";
import { convertExcelValue, findColumn } from "../utils/excelParser";
import { generateMessage, getDefaultTemplate } from "../utils/messageGenerator";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { useVirtualizer } from "@tanstack/react-virtual";

const MessageTemplatesModal = lazy(() => import("../components/situation/MessageTemplatesModal"));
const HotelsModal = lazy(() => import("../components/situation/HotelsModal"));

const GRID_TEMPLATE = "100px 90px 130px 140px 120px 90px 130px 80px 60px 90px";
const ROW_HEIGHT = 36;
const TABLE_HEADERS = [
  "Invoice N",
  "Date",
  "Nom",
  "Téléphone",
  "Hôtel",
  "Chambre",
  "Trip",
  "Heure",
  "Marina",
  "Statut",
];

const VirtualizedRow = memo(({ index, style, data }) => {
  const {
    excelData,
    editingCell,
    setEditingCell,
    handleCellEdit,
    handleToggleMarina,
    rowsWithMarina,
  } = data;

  const row = excelData[index];
  if (!row) return null;

  const isEditing = (field) =>
    editingCell?.rowId === row.id && editingCell?.field === field;

  const rowClasses = [
    "grid",
    "items-center",
    "border-b",
    "border-[rgba(226,232,240,0.6)]",
    "bg-[rgba(255,255,255,0.95)]",
    "hover:bg-[rgba(79,70,229,0.08)]",
    "transition-colors",
    "relative",
  ];
 
  let statusAccent = "";
  if (row.messageSent) {
    rowClasses.push("bg-[rgba(16,185,129,0.12)]", "border-l-4", "border-l-[rgba(16,185,129,0.55)]");
    statusAccent = "from-emerald-400/80 to-teal-400/80";
  } else if (!row.phoneValid) {
    rowClasses.push("bg-[rgba(239,68,68,0.12)]", "border-l-4", "border-l-[rgba(239,68,68,0.65)]");
    statusAccent = "from-rose-400/85 to-red-400/80";
  }

  const cellBase = "px-2 py-1 text-[10px] text-[rgba(71,85,105,0.88)]";

  const handleCellClick = (field) => {
    setEditingCell({ rowId: row.id, field });
  };

  return (
    <div
      style={{
        ...style,
        width: "100%",
        display: "grid",
        gridTemplateColumns: GRID_TEMPLATE,
      }}
      className={rowClasses.join(" ")}
    >
      {statusAccent && (
        <span className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${statusAccent}`} />
      )}
      <div className={`${cellBase} text-slate-700`}>
        {isEditing("invoiceN") ? (
          <TextInput
            value={row.invoiceN}
            onChange={(e) => handleCellEdit(row.id, "invoiceN", e.target.value)}
            onBlur={() => setEditingCell(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditingCell(null);
            }}
            className="w-full px-1 py-0.5 text-[10px]"
            autoFocus
          />
        ) : (
          <span
            className="cursor-pointer hover:bg-slate-100 px-1 py-0.5 rounded inline-flex min-h-[20px] items-center"
            onClick={() => handleCellClick("invoiceN")}
          >
            {row.invoiceN}
          </span>
        )}
      </div>
      <div className={`${cellBase} text-slate-700`}>
        {isEditing("date") ? (
          <TextInput
            value={row.date}
            onChange={(e) => handleCellEdit(row.id, "date", e.target.value)}
            onBlur={() => setEditingCell(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditingCell(null);
            }}
            className="w-full px-1 py-0.5 text-[10px]"
            autoFocus
          />
        ) : (
          <span
            className="cursor-pointer hover:bg-slate-100 px-1 py-0.5 rounded inline-flex min-h-[20px] items-center"
            onClick={() => handleCellClick("date")}
          >
            {row.date}
          </span>
        )}
      </div>
      <div className={`${cellBase} font-medium text-slate-900`}>
        {isEditing("name") ? (
          <TextInput
            value={row.name}
            onChange={(e) => handleCellEdit(row.id, "name", e.target.value)}
            onBlur={() => setEditingCell(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditingCell(null);
            }}
            className="w-full px-1 py-0.5 text-[10px]"
            autoFocus
          />
        ) : (
          <span
            className="cursor-pointer hover:bg-slate-100 px-1 py-0.5 rounded inline-flex min-h-[20px] items-center"
            onClick={() => handleCellClick("name")}
          >
            {row.name}
          </span>
        )}
      </div>
      <div
        className={`${cellBase} ${
          !row.phoneValid
            ? "text-[#dc2626] font-semibold"
            : row.phone
            ? "text-[#4338ca] font-medium"
            : "text-[#b45309]"
        }`}
      >
        {isEditing("phone") ? (
          <TextInput
            value={row.phone}
            onChange={(e) => handleCellEdit(row.id, "phone", e.target.value)}
            onBlur={() => setEditingCell(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditingCell(null);
            }}
            className="w-full px-1 py-0.5 text-[10px]"
            autoFocus
          />
        ) : (
          <span
            className="cursor-pointer hover:bg-slate-100 px-1 py-0.5 rounded inline-flex min-h-[20px] items-center"
            onClick={() => handleCellClick("phone")}
          >
            {row.phone ? (
              <>
                <span>{row.phone}</span>
                {!row.phoneValid && row.phoneError && (
                  <span className="block text-[10px] text-red-500 mt-1" title={row.phoneError}>
                    ⚠️ {row.phoneError}
                  </span>
                )}
              </>
            ) : (
              <span>⚠️ Non trouvé</span>
            )}
          </span>
        )}
      </div>
      <div className={`${cellBase} text-slate-700`}>
        {isEditing("hotel") ? (
          <TextInput
            value={row.hotel}
            onChange={(e) => handleCellEdit(row.id, "hotel", e.target.value)}
            onBlur={() => setEditingCell(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditingCell(null);
            }}
            className="w-full px-1 py-0.5 text-[10px]"
            autoFocus
          />
        ) : (
          <span
            className="cursor-pointer hover:bg-slate-100 px-1 py-0.5 rounded inline-flex min-h-[20px] items-center"
            onClick={() => handleCellClick("hotel")}
          >
            {row.hotel}
          </span>
        )}
      </div>
      <div className={`${cellBase} text-slate-700`}>
        {isEditing("roomNo") ? (
          <TextInput
            value={row.roomNo}
            onChange={(e) => handleCellEdit(row.id, "roomNo", e.target.value)}
            onBlur={() => setEditingCell(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditingCell(null);
            }}
            className="w-full px-1 py-0.5 text-[10px]"
            autoFocus
          />
        ) : (
          <span
            className="cursor-pointer hover:bg-slate-100 px-1 py-0.5 rounded inline-flex min-h-[20px] items-center"
            onClick={() => handleCellClick("roomNo")}
          >
            {row.roomNo}
          </span>
        )}
      </div>
      <div className={`${cellBase} text-slate-700`}>
        {isEditing("trip") ? (
          <TextInput
            value={row.trip}
            onChange={(e) => handleCellEdit(row.id, "trip", e.target.value)}
            onBlur={() => setEditingCell(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditingCell(null);
            }}
            className="w-full px-1 py-0.5 text-[10px]"
            autoFocus
          />
        ) : (
          <span
            className="cursor-pointer hover:bg-slate-100 px-1 py-0.5 rounded inline-flex min-h-[20px] items-center"
            onClick={() => handleCellClick("trip")}
          >
            {row.trip}
          </span>
        )}
      </div>
      <div className={`${cellBase} font-semibold text-slate-900`}>
        {isEditing("time") ? (
          <TextInput
            value={row.time}
            onChange={(e) => handleCellEdit(row.id, "time", e.target.value)}
            onBlur={() => setEditingCell(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditingCell(null);
            }}
            className="w-full px-1 py-0.5 text-[10px]"
            autoFocus
          />
        ) : (
          <span
            className="cursor-pointer hover:bg-slate-100 px-1 py-0.5 rounded inline-flex min-h-[20px] items-center"
            onClick={() => handleCellClick("time")}
          >
            {row.time}
          </span>
        )}
      </div>
      <div className="px-4 py-2 flex justify-center">
        <label className="flex items-center justify-center cursor-pointer">
          <input
            type="checkbox"
            checked={rowsWithMarina.has(row.id)}
            onChange={() => handleToggleMarina(row.id)}
            className="w-4 h-4 text-[#4338ca] border-[rgba(148,163,184,0.6)] rounded focus:ring-[#4f46e5]/40"
            title="Bateau garé à la marina de cet hôtel"
          />
        </label>
      </div>
      <div className="px-4 py-2 text-center">
        {row.messageSent ? (
          <span className="tag-success inline-flex items-center gap-1">✓ Envoyé</span>
         ) : !row.phoneValid ? (
          <span className="tag-danger inline-flex items-center gap-1">⚠️ À corriger</span>
         ) : (
          <span className="text-xs text-[rgba(148,163,184,0.9)]">—</span>
         )}
      </div>
    </div>
  );
});
VirtualizedRow.displayName = "VirtualizedRow";

export function SituationPage({ activities = [], user }) {
  const [excelData, setExcelData] = useState([]);
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
    return loadLS(LS_KEYS.messageTemplates, {});
  });
  const [selectedActivity, setSelectedActivity] = useState("");
  const [editingTemplate, setEditingTemplate] = useState({
    activity: "",
    template: "",
  });
  
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

  const handleEditingTemplateChange = useCallback(
    (patch) => {
      setEditingTemplate((prev) => ({ ...prev, ...patch }));
    },
    [setEditingTemplate]
  );

  const handleUseDefaultTemplate = useCallback(() => {
    setEditingTemplate((prev) => ({ ...prev, template: getDefaultTemplate() }));
  }, [setEditingTemplate]);

  const handleNewHotelChange = useCallback(
    (value) => {
      setNewHotel(value);
    },
    [setNewHotel]
  );

  const isSupabaseConfigured = __SUPABASE_DEBUG__?.isConfigured;
  const [settingsLoaded, setSettingsLoaded] = useState(!isSupabaseConfigured);
  const messageTemplatesSaveTimeoutRef = useRef(null);
  const exteriorHotelsSaveTimeoutRef = useRef(null);

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
          .select("settings_type, payload")
          .eq("site_key", SITE_KEY);

        if (!error && Array.isArray(data) && !cancelled) {
          const templatesRow = data.find((row) => row.settings_type === "message_templates");
          if (templatesRow && templatesRow.payload && typeof templatesRow.payload === "object") {
            setMessageTemplates(templatesRow.payload);
            saveLS(LS_KEYS.messageTemplates, templatesRow.payload);
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
        } else if (error) {
          console.warn("⚠️ Impossible de charger les paramètres Supabase:", error);
        }
      } catch (fetchError) {
        console.warn("⚠️ Erreur lors du chargement des paramètres Supabase:", fetchError);
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

    if (messageTemplatesSaveTimeoutRef.current) {
      clearTimeout(messageTemplatesSaveTimeoutRef.current);
    }

    messageTemplatesSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from("message_settings")
          .upsert(
            {
              site_key: SITE_KEY,
              settings_type: "message_templates",
              payload: messageTemplates,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "site_key,settings_type" }
          );

        if (error) {
          console.warn("⚠️ Impossible de sauvegarder les templates sur Supabase:", error);
        }
      } catch (saveError) {
        console.warn("⚠️ Erreur lors de la sauvegarde des templates sur Supabase:", saveError);
      }
    }, 400);

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
          console.warn("⚠️ Impossible de sauvegarder les hôtels sur Supabase:", error);
        }
      } catch (saveError) {
        console.warn("⚠️ Erreur lors de la sauvegarde des hôtels sur Supabase:", saveError);
      }
    }, 400);

    return () => {
      if (exteriorHotelsSaveTimeoutRef.current) {
        clearTimeout(exteriorHotelsSaveTimeoutRef.current);
      }
    };
  }, [exteriorHotels, settingsLoaded, isSupabaseConfigured]);
  
  // Les cases marina ne sont plus sauvegardées - elles sont réinitialisées à chaque import

  // Ouvrir la configuration pour une activité
  const handleOpenConfig = (activityName) => {
    const template = messageTemplates[activityName] || "";
    setSelectedActivity(activityName);
    setEditingTemplate({
      activity: activityName,
      template: template,
    });
    setShowConfigModal(true);
  };

  // Sauvegarder un template
  const handleSaveTemplate = () => {
    if (!editingTemplate.activity.trim()) {
      toast.error("Veuillez sélectionner une activité");
      return;
    }

    const newTemplates = {
      ...messageTemplates,
      [editingTemplate.activity]: editingTemplate.template,
    };
    
    setMessageTemplates(newTemplates);
    toast.success(`Template sauvegardé pour "${editingTemplate.activity}"`);
    setShowConfigModal(false);
  };

  // Supprimer un template
  const handleDeleteTemplate = (activityName) => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer le template pour "${activityName}" ?\n\nCette action est irréversible.`)) {
      const newTemplates = { ...messageTemplates };
      delete newTemplates[activityName];
      setMessageTemplates(newTemplates);
      toast.success(`Template supprimé pour "${activityName}"`);
    }
  };
  
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
        
        console.log("📋 Données brutes du fichier Excel (premières 5 lignes):", rawData.slice(0, 5));
        
        // Chercher automatiquement la ligne qui contient les en-têtes
        // On cherche des mots-clés comme "Invoice", "Date", "Name", "Hotel", etc.
        let headerRowIndex = 0;
        const headerKeywords = ["invoice", "date", "name", "hotel", "room", "pax", "trip", "time", "comment"];
        
        for (let i = 0; i < Math.min(rawData.length, 10); i++) {
          const row = rawData[i] || [];
          const rowString = row.map(cell => String(cell || "").toLowerCase()).join(" ");
          const matches = headerKeywords.filter(keyword => rowString.includes(keyword));
          
          // Si on trouve au moins 3 mots-clés dans cette ligne, c'est probablement la ligne d'en-têtes
          if (matches.length >= 3) {
            headerRowIndex = i;
            console.log(`✅ Ligne d'en-têtes trouvée à l'index ${i}:`, row);
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
          
          console.log("📊 En-têtes détectés:", headers);
          
          if (headers.length > 0) {
            // Filtrer les colonnes à ignorer : M (index 12) et N (index 13)
            // ⚠️ Conserver les colonnes "Trip" (index 9) et "Comment" (index 11) pour récupérer l'activité et l'heure
            const columnsToIgnore = [12, 13];
            const filteredHeaders = headers
              .map((header, index) => ({ header, index }))
              .filter(({ index }) => !columnsToIgnore.includes(index))
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
          const columnsToIgnoreNames = ["time", "lieux", "option"];
          jsonData = fallbackData.map(row => {
            const convertedRow = {};
            Object.keys(row).forEach(key => {
              // Ignorer les colonnes J, L, M, N
              const normalizedKey = key.toLowerCase().trim();
              const isIgnoredByName = columnsToIgnoreNames.includes(normalizedKey);
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
          // Chercher les colonnes avec toutes les variations possibles
          const invoiceN = findColumn(row, ["Invoice N", "Invoice #", "Invoice#", "invoice_n", "Invoice", "invoice", "Invoice Number", "invoice_number"]);
          const date = findColumn(row, ["Date", "date"]);
          const name = findColumn(row, ["Name", "name", "Client", "client", "Nom", "nom"]);
          const hotel = findColumn(row, ["Hotel", "hotel", "Hôtel", "hôtel"]);
          const roomNo = findColumn(row, ["Rm No", "Rm No.", "RmNo", "Room No", "Room No.", "RoomNo", "Room#", "rm_no", "room_no", "rmno", "roomno", "room", "Room", "Chambre", "chambre", "Numéro", "numero", "Number", "number"]);
          const pax = findColumn(row, ["Pax", "pax", "Adults", "adults", "Adultes", "adultes"]) || 0;
          const ch = findColumn(row, ["Ch", "ch", "Children", "children", "Enfants", "enfants"]) || 0;
          const inf = findColumn(row, ["inf", "Inf", "Infants", "infants", "Bébés", "bébés", "Babies", "babies"]) || 0;
          
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
              console.log(`🔍 Trip trouvé via recherche partielle: colonne "${tripKey}" avec valeur "${trip}"`);
            }
          }
          
          // Lire l'heure depuis "time" ou "Comment" (priorité à "time")
          const timeColumn = findColumn(row, ["time", "Time", "TIME", "heure", "Heure", "HEURE", "pickup", "Pickup", "PICKUP"]);
          const commentColumn = findColumn(row, ["Comment", "comment", "COMMENT", "Commentaire", "commentaire"]);
          // Utiliser "time" si disponible, sinon "Comment"
          const pickupTime = timeColumn || commentColumn;
          const comment = findColumn(row, ["Notes", "notes", "Commentaire", "commentaire"]);

          // Convertir les valeurs en chaînes pour éviter les erreurs
          const nameStr = String(name || "");
          
          // Extraire le téléphone et le nom
          const phone = extractPhoneFromName(nameStr);
          const clientName = extractNameFromField(nameStr);

          // Valider le numéro de téléphone
          const phoneValidation = phone ? validatePhoneNumber(phone) : { valid: false, error: "Numéro manquant" };

          return {
            id: `row-${index}`,
            invoiceN: String(invoiceN || ""),
            date: String(date || ""),
            name: clientName || "Client",
            phone: phone || "",
            phoneValid: phoneValidation.valid,
            phoneError: phoneValidation.error,
            hotel: String(hotel || ""),
            roomNo: String(roomNo || ""),
            adults: Number(pax) || 0,
            children: Number(ch) || 0,
            infants: Number(inf) || 0,
            trip: String(trip || "").trim(),
            time: String(pickupTime || "").trim(), // Utiliser la colonne "time" ou "Comment" comme heure de prise en charge
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
          const hasInvoice = row.invoiceN && row.invoiceN.trim() !== "";
          
          // Garder la ligne si elle a au moins un nom ET (téléphone OU trip OU date OU invoice)
          return hasName && (hasPhone || hasTrip || hasDate || hasInvoice);
        });

        // Afficher le nombre de lignes vides supprimées
        const emptyRowsCount = mappedData.length - filteredData.length;
        if (emptyRowsCount > 0) {
          console.log(`📋 ${emptyRowsCount} ligne(s) vide(s) supprimée(s) automatiquement`);
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
          console.log("📊 Colonnes détectées dans le fichier Excel:", detectedColumns);
          console.log("📋 Première ligne de données:", jsonDataNormalized[0]);
          
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
            console.log(`✅ Colonne Trip trouvée: "${tripColumn}" avec valeur: "${firstRow[tripColumn]}"`);
          } else {
            console.warn("⚠️ Colonne Trip non trouvée. Colonnes disponibles:", detectedColumns);
          }
          
          if (timeColumn) {
            console.log(`✅ Colonne time trouvée: "${timeColumn}" avec valeur: "${firstRow[timeColumn]}"`);
          } else {
            console.warn("⚠️ Colonne time non trouvée. Colonnes disponibles:", detectedColumns);
          }
          
          // Debug pour les valeurs Trip détectées dans les premières lignes
          if (filteredData.length > 0) {
            console.log("📋 Exemple de valeurs Trip détectées dans les premières lignes:");
            filteredData.slice(0, 3).forEach((row, idx) => {
              console.log(`  Ligne ${idx + 1}: trip="${row.trip}" | time="${row.time}"`);
            });
          }
          
          // Avertir si aucune colonne valide n'est détectée
          if (detectedColumns.length === 0) {
            toast.error("Aucune colonne valide détectée. Vérifiez que la première ligne de votre Excel contient les en-têtes (Invoice #, Date, Name, etc.)");
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
          console.warn("⚠️ Numéros de téléphone invalides détectés :");
          invalidPhones.forEach((data, idx) => {
            console.warn(`${idx + 1}. ${data.name} - ${data.phone || "MANQUANT"} - Erreur: ${data.phoneError || "Numéro manquant"}`);
          });
        }
        
        setExcelData(filteredData);
        setRowsWithMarina(new Set()); // Réinitialiser toutes les cases marina à chaque nouvel import
        setShowPreview(false);
        setSendLog([]);
        
        if (filteredData.length > 0) {
          const message = `${filteredData.length} ligne(s) chargée(s) depuis le fichier Excel${emptyRowsCount > 0 ? ` (${emptyRowsCount} ligne(s) vide(s) supprimée(s))` : ""}`;
          toast.success(message);
        }
      } catch (error) {
        console.error("Erreur lors de la lecture du fichier Excel:", error);
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
  }, [setExcelData]);
  
  const listItemData = useMemo(
    () => ({
      excelData,
      editingCell,
      setEditingCell,
      handleCellEdit,
      handleToggleMarina,
      rowsWithMarina,
    }),
    [excelData, editingCell, handleCellEdit, handleToggleMarina, rowsWithMarina]
  );

  const tableBodyRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: excelData.length,
    getScrollElement: () => tableBodyRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  
  // Wrapper pour generateMessage avec contexte local
  const generateMessageWithContext = (data) => {
    return generateMessage(data, messageTemplates, rowsWithMarina, exteriorHotels);
  };

  // Prévisualiser les messages
  const handlePreviewMessages = () => {
    if (excelData.length === 0) {
      toast.warning("Aucune donnée à prévisualiser. Veuillez d'abord charger un fichier Excel.");
      return;
    }

    const messages = excelData.map((data) => ({
      ...data,
      message: generateMessageWithContext(data),

    }));

    setPreviewMessages(messages);
    setShowPreview(true);
  };

  // Fonction pour tenter d'envoyer automatiquement le message WhatsApp
  const tryAutoSendMessage = async (whatsappWindow, maxAttempts = 5) => {
    if (!whatsappWindow || whatsappWindow.closed) {
      console.warn("⚠️ Fenêtre WhatsApp fermée, impossible d'automatiser l'envoi");
      return false;
    }

    // Essayer plusieurs fois avec des délais croissants (WhatsApp peut prendre du temps à charger)
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Attendre que WhatsApp soit complètement chargé (délai croissant)
        const waitTime = attempt === 1 ? 2000 : attempt === 2 ? 3000 : 4000;
        console.log(`🔄 Tentative ${attempt}/${maxAttempts} d'envoi automatique (attente ${waitTime}ms)...`);
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
              console.log(`✅ Bouton d'envoi trouvé avec le sélecteur: ${selector}`);
              break;
            }
          } catch (e) {
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
              console.log(`✅ Zone de texte trouvée avec le sélecteur: ${selector}`);
              break;
            }
          } catch (e) {
            // Continuer avec le prochain sélecteur
          }
        }

        // Méthode 3: Essayer de cliquer sur le bouton d'envoi
        if (sendButton) {
          console.log("🤖 Tentative d'envoi automatique via clic sur le bouton...");
          sendButton.click();
          await new Promise((resolve) => setTimeout(resolve, 500));
          console.log("✅ Clic sur le bouton d'envoi effectué");
          return true;
        }

        // Méthode 4: Simuler la touche Entrée dans la zone de texte
        if (textBox) {
          console.log("🤖 Tentative d'envoi automatique via touche Entrée...");
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
          console.log("✅ Touche Entrée simulée");
          return true;
        }

          // Si aucune méthode n'a fonctionné, continuer à la prochaine tentative
          if (attempt < maxAttempts) {
            console.log(`⚠️ Tentative ${attempt} échouée, nouvelle tentative dans 1 seconde...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          } else {
            console.warn("⚠️ Impossible de trouver le bouton d'envoi ou la zone de texte après toutes les tentatives");
            return false;
          }
        } catch (innerError) {
          // Erreur CORS ou autre dans le try interne - continuer à la prochaine tentative
          if (attempt < maxAttempts) {
            console.warn(`⚠️ Tentative ${attempt} échouée (CORS ou protection WhatsApp), nouvelle tentative...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          } else {
            console.warn("⚠️ Automatisation impossible après toutes les tentatives (CORS ou protection WhatsApp):", innerError.message);
            return false;
          }
        }
      } catch (error) {
        // Erreur dans le try externe - essayer encore si ce n'est pas la dernière tentative
        if (attempt < maxAttempts) {
          console.warn(`⚠️ Tentative ${attempt} échouée (erreur générale), nouvelle tentative...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        } else {
          console.warn("⚠️ Automatisation impossible après toutes les tentatives:", error.message);
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
    
    console.log(`📱 Changement de l'URL WhatsApp pour ${phone}...`);
    
    // Nom de fenêtre fixe pour FORCER la réutilisation de la même fenêtre
    // Le navigateur réutilisera automatiquement la fenêtre si elle existe déjà avec ce nom
    const windowName = "whatsapp_auto_send";
    
    // Vérifier si une fenêtre existe déjà et n'est pas fermée
    if (whatsappWindowRef.current) {
      try {
        if (!whatsappWindowRef.current.closed) {
          console.log("🔄 Fenêtre WhatsApp existante détectée, réutilisation...");
          // La fenêtre existe et est ouverte
          // Utiliser window.open avec le même nom pour forcer la réutilisation et changer l'URL
          const reusedWindow = window.open(whatsappUrl, windowName);
          if (reusedWindow) {
            whatsappWindowRef.current = reusedWindow;
            reusedWindow.focus();
            console.log("✅ Fenêtre WhatsApp réutilisée - URL mise à jour");
            // Attente importante pour laisser WhatsApp charger la nouvelle conversation (15 secondes)
            // WhatsApp Web peut être lent à charger, surtout lors du changement de conversation
            console.log("⏳ Attente de 15 secondes pour laisser WhatsApp charger complètement la nouvelle conversation...");
            toast.info("⏳ Chargement de la conversation WhatsApp... (15 secondes)", { duration: 15000 });
            await new Promise((resolve) => setTimeout(resolve, 15000));
            return reusedWindow;
          }
        } else {
          // La fenêtre a été fermée, réinitialiser la référence
          console.log("🔄 La fenêtre WhatsApp précédente a été fermée");
          whatsappWindowRef.current = null;
        }
      } catch (error) {
        // Erreur lors de la vérification, réinitialiser et ouvrir une nouvelle fenêtre
        console.warn("⚠️ Erreur lors de la vérification de la fenêtre existante:", error);
        whatsappWindowRef.current = null;
      }
    }
    
    // Ouvrir ou réutiliser la fenêtre WhatsApp avec window.open
    // Si une fenêtre avec ce nom existe déjà, le navigateur la réutilisera automatiquement
    console.log("🔄 Ouverture/réutilisation de la fenêtre WhatsApp...");
    const whatsappWindow = window.open(whatsappUrl, windowName);
    
    if (whatsappWindow) {
      // Mettre à jour la référence (même si c'est la même fenêtre)
      whatsappWindowRef.current = whatsappWindow;
      
      // Vérifier si c'est une nouvelle fenêtre ou une réutilisation
      if (whatsappWindow === whatsappWindowRef.current || !whatsappWindow.closed) {
        console.log("✅ Fenêtre WhatsApp ouverte/réutilisée avec succès");
      }
      
      // Attente pour laisser WhatsApp charger (15 secondes pour une nouvelle fenêtre)
      // WhatsApp Web peut être lent à charger initialement
      console.log("⏳ Attente de 15 secondes pour laisser WhatsApp charger complètement...");
      toast.info("⏳ Chargement initial de WhatsApp Web... (15 secondes)", { duration: 15000 });
      await new Promise((resolve) => setTimeout(resolve, 15000));
      
      // Focus sur la fenêtre (non-bloquant)
      try {
        whatsappWindow.focus();
      } catch (error) {
        console.debug("Focus WhatsApp impossible:", error);
      }
      
      return whatsappWindow;
    } else {
      console.error("❌ window.open() a retourné null - Impossible d'ouvrir la fenêtre WhatsApp");
      console.error("❌ Le navigateur bloque probablement les popups automatiques");
      console.error("❌ IMPORTANT: Vous devez autoriser les popups pour ce site");
      whatsappWindowRef.current = null;
      return null;
    }
  };

  // Envoyer un message via WhatsApp Web automatiquement
  const sendWhatsAppMessage = async (data, index, total) => {
    console.log(`📨 Envoi du message ${index + 1}/${total} pour ${data.name} (${data.phone})`);
    
    // Utiliser le message modifié depuis previewMessages s'il existe, sinon générer le message
    const previewMessage = previewMessages.find((msg) => msg.id === data.id);
    const message = previewMessage?.message || generateMessageWithContext(data);
    
    // IMPORTANT: Attendre 10 secondes minimum entre chaque message pour éviter le bannissement WhatsApp
    // C'est le délai minimum recommandé par WhatsApp pour éviter les restrictions
    // Optimisé à 10 secondes pour un meilleur débit tout en restant sécurisé
    const MIN_DELAY_BETWEEN_MESSAGES = 10000; // 10 secondes (réduit de 15s pour améliorer la vitesse)
    // Délai supplémentaire pour la première ouverture de WhatsApp (pour laisser le temps à la page de charger)
    const INITIAL_LOAD_DELAY = 10000; // 10 secondes supplémentaires pour le premier message (réduit de 15s)
    
    // Ouvrir WhatsApp Web (la fonction ferme déjà la fenêtre précédente)
    console.log(`⏳ Ouverture de WhatsApp Web...`);
    const whatsappWindow = await openWhatsApp(data.phone, message);
    
    if (!whatsappWindow) {
      console.error(`❌ Impossible d'ouvrir WhatsApp Web pour ${data.phone}`);
      toast.error("Impossible d'ouvrir WhatsApp Web. Vérifiez que les popups ne sont pas bloquées.");
      return false;
    }

    // Si c'est le premier message, attendre plus longtemps pour laisser le temps à WhatsApp de charger complètement
    // Optimisé : délai réduit à 10 secondes (au lieu de 15s) pour améliorer la vitesse
    if (isFirstMessageRef.current) {
      console.log(`⏳ Premier message détecté. Attente supplémentaire de ${INITIAL_LOAD_DELAY / 1000} secondes pour laisser le temps à WhatsApp de charger...`);
      toast.info(
        `📱 Premier message : Attente de ${INITIAL_LOAD_DELAY / 1000} secondes pour laisser WhatsApp charger...`,
        { duration: INITIAL_LOAD_DELAY }
      );
      // Utiliser Promise pour éviter les blocages
      await new Promise((resolve) => setTimeout(resolve, INITIAL_LOAD_DELAY));
      isFirstMessageRef.current = false;
      console.log(`✅ Délai initial terminé. WhatsApp devrait être chargé maintenant.`);
    } else {
      // Pour les messages suivants, attendre encore 8 secondes supplémentaires pour s'assurer que WhatsApp a bien chargé la nouvelle conversation
      // WhatsApp peut être lent lors du changement de conversation, surtout si la connexion est lente
      console.log(`⏳ Message suivant détecté. Attente supplémentaire de 8 secondes pour s'assurer que WhatsApp a bien chargé la nouvelle conversation...`);
      toast.info(
        `📱 Vérification du chargement de la conversation... Attente de 8 secondes...`,
        { duration: 8000 }
      );
      await new Promise((resolve) => setTimeout(resolve, 8000));
      console.log(`✅ Délai de chargement terminé. WhatsApp devrait être prêt maintenant.`);
    }

    console.log(`✅ WhatsApp Web ouvert avec succès. Tentative d'envoi automatique...`);
    
    // Tenter d'envoyer automatiquement le message
    const autoSendSuccess = await tryAutoSendMessage(whatsappWindow);
    
    if (autoSendSuccess) {
      console.log(`✅ Message envoyé automatiquement avec succès !`);
      toast.success(`✅ Message envoyé automatiquement pour ${data.name}`, { duration: 3000 });
    } else {
      console.log(`⚠️ Envoi automatique échoué, l'utilisateur devra cliquer manuellement`);
      toast.warning(
        `📱 WhatsApp Web ouvert pour ${data.name} (${data.phone}). ` +
        `Cliquez sur "Envoyer" dans la fenêtre WhatsApp si le message ne s'est pas envoyé automatiquement.`,
        { duration: MIN_DELAY_BETWEEN_MESSAGES }
      );
    }

    // Attendre 10 secondes minimum avant de passer au suivant
    // Ce délai est CRITIQUE pour éviter le bannissement WhatsApp
    console.log(`⏱️ Attente de ${MIN_DELAY_BETWEEN_MESSAGES / 1000} secondes (minimum requis pour éviter le bannissement)...`);
    const startTime = Date.now();
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_BETWEEN_MESSAGES));
    const elapsedTime = Date.now() - startTime;
    console.log(`✅ Attente terminée (${elapsedTime}ms écoulés). Passage au suivant...`);

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
    console.log("✅ Message traité, la fenêtre sera fermée avant l'ouverture du suivant");

    return true;
  };

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
      `- Ne pas envoyer plus de 30 messages par heure (recommandé)\n\n` +
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
      console.warn(`⚠️ ${invalidQueue.length} ligne(s) avec numéro invalide ignorées :`);
      invalidQueue.forEach((data) => {
        console.warn(`  - ${data.name}: ${data.phone || "MANQUANT"} - ${data.phoneError || "Numéro manquant"}`);
      });
    }
    
    if (validQueue.length === 0) {
      toast.error("Aucun numéro de téléphone valide trouvé. Impossible d'envoyer les messages.");
      isAutoSendingRef.current = false;
      setAutoSending(false);
      setSending(false);
      return;
    }
    
    console.log(`🚀 Démarrage de l'envoi automatique de ${validQueue.length} messages (${invalidQueue.length} ignorés)`);
    
    for (let i = 0; i < validQueue.length; i++) {
      if (!isAutoSendingRef.current) {
        // Si l'utilisateur a arrêté l'envoi
        console.log(`⏹️ Envoi arrêté par l'utilisateur à l'index ${i}`);
        break;
      }

      console.log(`\n🔄 ========== DÉBUT DU MESSAGE ${i + 1}/${validQueue.length} ==========`);
      
      setCurrentIndex(i + 1);
      setRemainingCount(validQueue.length - i - 1);

      const data = validQueue[i];

      console.log(`📤 Envoi ${i + 1}/${validQueue.length} : ${data.name} (${data.phone})`);
      toast.info(`Envoi ${i + 1}/${validQueue.length} : ${data.name} (${data.phone})`);

      try {
        console.log(`⏳ Appel de sendWhatsAppMessage pour le message ${i + 1}...`);
        const result = await sendWhatsAppMessage(data, i, validQueue.length);
        console.log(`✅ Message ${i + 1} traité avec résultat:`, result);
        
        if (!result) {
          console.warn(`⚠️ sendWhatsAppMessage a retourné false pour le message ${i + 1}, mais on continue...`);
        }
      } catch (error) {
        console.error(`❌ ERREUR lors de l'envoi du message ${i + 1}:`, error);
        console.error(`Stack trace:`, error.stack);
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

      console.log(`✅ ========== FIN DU MESSAGE ${i + 1}/${validQueue.length} ==========\n`);
      
      // NOTE: Le délai de 10 secondes est déjà inclus dans sendWhatsAppMessage
      // Pas besoin de pause supplémentaire pour éviter le bannissement
      // Le délai de 10 secondes entre chaque message est respecté automatiquement
    }

    // Terminer l'envoi automatique
    console.log(`🏁 Fin de l'envoi automatique`);
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
        console.debug("Impossible de fermer la fenêtre WhatsApp:", error);
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
          console.debug("Impossible de fermer la fenêtre WhatsApp au démontage:", error);
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
      // Utiliser le message modifié depuis previewMessages s'il existe, sinon générer le message
      const previewMessage = previewMessages.find((msg) => msg.id === data.id);
      const message = previewMessage?.message || generateMessageWithContext(data);

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

  return (
    <Section
      title="📋 Situation - Envoi de messages"
      subtitle="Chargez un fichier Excel et envoyez automatiquement les messages de rappel aux clients"
      right={
        <div className="flex gap-2">
          <GhostBtn onClick={() => setShowHotelsModal(true)} variant="info">
            🏨 Hôtels extérieur
          </GhostBtn>
          <GhostBtn onClick={() => setShowConfigModal(true)} variant="primary">
            ⚙️ Configurer les messages
          </GhostBtn>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Upload */}
        <div 
          className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50/50"
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const files = e.dataTransfer.files;
            if (files.length > 0) {
              const file = files[0];
              if (file.name.match(/\.(xlsx|xls)$/i)) {
                const fakeEvent = { target: { files: [file] } };
                handleFileUpload(fakeEvent);
              } else {
                toast.error("Veuillez glisser un fichier Excel (.xlsx ou .xls)");
              }
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
            id="excel-upload"
          />
          <label
            htmlFor="excel-upload"
            className="cursor-pointer inline-flex flex-col items-center gap-3"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white text-2xl shadow-lg">
              📤
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Cliquez ou glissez un fichier Excel ici</p>
              <p className="text-xs text-slate-500 mt-1">Formats acceptés: .xlsx, .xls</p>
            </div>
          </label>
        </div>

        {/* Colonnes détectées */}
        {detectedColumns.length > 0 && (
          <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-900 mb-2">📊 Colonnes détectées dans le fichier Excel:</p>
            <div className="flex flex-wrap gap-2">
              {detectedColumns.map((col, idx) => (
                <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                  {col}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Statistiques */}
        {stats.total > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/90 border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-600 mb-1">Total lignes</p>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            </div>
            <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs text-slate-600 mb-1">Avec téléphone</p>
              <p className="text-2xl font-bold text-blue-600">{stats.withPhone}</p>
            </div>
            <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs text-slate-600 mb-1">Sans téléphone</p>
              <p className="text-2xl font-bold text-amber-600">{stats.withoutPhone}</p>
              {stats.invalidPhones > 0 && (
                <p className="text-[11px] text-[#dc2626] mt-1 font-semibold">⚠️ {stats.invalidPhones} invalide(s)</p>
              )}
            </div>
            <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-4">
              <p className="text-xs text-slate-600 mb-1">Messages envoyés</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.sent}</p>
            </div>
          </div>
        )}

        {/* Tableau des données */}
        {excelData.length > 0 && (
          <div className="overflow-x-auto">
            <div className="min-w-[990px] border border-slate-200 rounded-lg shadow-sm bg-white">
              <div
                className="grid text-left text-[10px] font-semibold uppercase text-white"
                style={{
                  gridTemplateColumns: GRID_TEMPLATE,
                  backgroundImage:
                    "linear-gradient(to right, #2563eb, #4338ca, #6d28d9)",
                }}
              >
                {TABLE_HEADERS.map((header) => (
                  <div key={header} className="px-2 py-2">
                    {header}
                  </div>
                ))}
              </div>
              <div className="max-h-[calc(100vh-320px)] overflow-y-auto" ref={tableBodyRef}>
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    position: "relative",
                  }}
                >
                  {virtualRows.map((virtualRow) => (
                    <VirtualizedRow
                      key={virtualRow.key}
                      index={virtualRow.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                        height: `${virtualRow.size}px`,
                      }}
                      data={listItemData}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Indicateur d'envoi automatique */}
        {autoSending && (
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-lg mb-1">🔄 Envoi automatique en cours...</p>
                <p className="text-sm opacity-90">
                  Message {currentIndex} sur {currentIndex + remainingCount} • {remainingCount} restant(s)
                </p>
              </div>
              <GhostBtn 
                onClick={handleStopAutoSending}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                ⏹️ Arrêter
              </GhostBtn>
            </div>
          </div>
        )}

        {/* Actions */}
        {excelData.length > 0 && (
          <div className="flex gap-3 justify-end flex-wrap">
            <GhostBtn onClick={handlePreviewMessages} disabled={sending || autoSending} variant="info">
              📝 Prévisualiser les messages
            </GhostBtn>
            <PrimaryBtn 
               onClick={handleAutoSendMessages} 
               disabled={sending || autoSending || stats.withPhone === 0}
               variant="success"
             >
               {autoSending ? "🔄 Envoi automatique..." : "🚀 Envoyer automatiquement via WhatsApp"}
             </PrimaryBtn>
             <PrimaryBtn 
               onClick={handleSendMessages} 
               disabled={sending || autoSending || stats.withPhone === 0}
               variant="info"
             >
               {sending ? "📤 Envoi en cours..." : "📤 Envoyer (simulation)"}
             </PrimaryBtn>
          </div>
        )}

        {/* Prévisualisation des messages */}
        {showPreview && previewMessages.length > 0 && (
          <div className="border border-blue-200 rounded-xl p-6 bg-blue-50/30">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Prévisualisation des messages</h3>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {previewMessages.map((msg, index) => (
                <div
                  key={msg.id}
                  className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm text-slate-900">{msg.name}</p>
                      <p className="text-xs text-slate-500">
                        {msg.trip} • {msg.date} à {msg.time}
                      </p>
                    </div>
                    {msg.phone ? (
                      <span className="text-xs text-blue-600 font-medium">{msg.phone}</span>
                    ) : (
                      <span className="text-xs text-amber-600">⚠️ Pas de téléphone</span>
                    )}
                  </div>
                  <textarea
                    value={msg.message}
                    onChange={(e) => {
                      const updatedMessages = [...previewMessages];
                      updatedMessages[index] = { ...updatedMessages[index], message: e.target.value };
                      setPreviewMessages(updatedMessages);
                    }}
                    className="w-full text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200 whitespace-pre-wrap font-sans resize-y min-h-[100px]"
                    rows={6}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <GhostBtn onClick={() => setShowPreview(false)}>Fermer</GhostBtn>
            </div>
          </div>
        )}

        {/* Log d'envoi */}
        {sendLog.length > 0 && (
          <div className="border border-slate-200 rounded-xl p-6 bg-slate-50/50">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">📊 Log d'envoi</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {sendLog.map((log, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    log.status === "success"
                      ? "bg-emerald-50 border border-emerald-200"
                      : "bg-red-50 border border-red-200"
                  }`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{log.name}</p>
                    <p className="text-xs text-slate-600">
                      {log.phone} • {log.trip} • {log.time}
                    </p>
                  </div>
                  <div className="text-right">
                    {log.status === "success" ? (
                      <span className="text-emerald-700 text-xs font-medium">✓ Succès</span>
                    ) : (
                      <span className="text-red-700 text-xs font-medium">✗ Erreur</span>
                    )}
                    <p className="text-[10px] text-slate-500 mt-1">
                      {new Date(log.sentAt).toLocaleTimeString("fr-FR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal de configuration des messages */}
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
              activities={activities}
              messageTemplates={messageTemplates}
              selectedActivity={selectedActivity}
              editingTemplate={editingTemplate}
              onSelectActivity={handleOpenConfig}
              onEditingTemplateChange={handleEditingTemplateChange}
              onSaveTemplate={handleSaveTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              onUseDefaultTemplate={handleUseDefaultTemplate}
              onClose={() => setShowConfigModal(false)}
              user={user}
            />
          </Suspense>
        )}

        {/* Modal de gestion des hôtels avec RDV à l'extérieur */}
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
      </div>
    </Section>
  );
}

