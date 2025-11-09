import { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { PrimaryBtn, GhostBtn, Section, TextInput } from "../components/ui";
import { toast } from "../utils/toast.js";
import { LS_KEYS } from "../constants";
import { loadLS, saveLS } from "../utils";
import { extractPhoneFromName, validatePhoneNumber, extractNameFromField } from "../utils/phoneUtils";
import { convertExcelValue, findColumn } from "../utils/excelParser";
import { generateMessage, getDefaultTemplate } from "../utils/messageGenerator";

export function SituationPage({ activities = [] }) {
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
  
  // État pour stocker les lignes avec marina cochée
  const [rowsWithMarina, setRowsWithMarina] = useState(() => {
    const saved = loadLS("hd_rows_with_marina", []);
    return new Set(saved);
  });
  
  // État pour l'édition des cellules du tableau
  const [editingCell, setEditingCell] = useState(null); // { rowId: string, field: string }

  // Sauvegarder les templates dans localStorage
  useEffect(() => {
    if (messageTemplates && Object.keys(messageTemplates).length >= 0) {
      saveLS(LS_KEYS.messageTemplates, messageTemplates);
    }
  }, [messageTemplates]);
  
  // Sauvegarder les lignes avec marina cochée
  useEffect(() => {
    saveLS("hd_rows_with_marina", Array.from(rowsWithMarina));
  }, [rowsWithMarina]);
  
  // Sauvegarder la liste des hôtels dans localStorage
  useEffect(() => {
    saveLS(LS_KEYS.exteriorHotels, exteriorHotels);
  }, [exteriorHotels]);

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
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer le template pour "${activityName}" ?`)) {
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
    if (window.confirm(`Êtes-vous sûr de vouloir retirer "${hotelName}" de la liste ?`)) {
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
  const handleToggleMarina = (rowId) => {
    setRowsWithMarina((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
      return newSet;
    });
  };
  
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

  // Ouvrir WhatsApp Web avec le numéro et le message pré-rempli
  const openWhatsApp = async (phone, message) => {
    // Nettoyer le numéro de téléphone (enlever les espaces, tirets, etc.)
    const cleanPhone = phone.replace(/[\s-()]/g, "");
    // Encoder le message pour l'URL
    const encodedMessage = encodeURIComponent(message);
    // Créer l'URL WhatsApp
    const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;
    
    console.log(`📱 Changement de l'URL WhatsApp pour ${phone}...`);
    console.log(`📱 URL: ${whatsappUrl.substring(0, 50)}...`);
    
    // Nom de fenêtre fixe pour forcer la réutilisation
    const windowName = "whatsapp_auto_send";
    
    // IMPORTANT: Utiliser window.open() avec le même nom pour forcer la réutilisation de la fenêtre
    // Le navigateur réutilisera la fenêtre existante si elle existe et n'est pas fermée
    console.log("🔄 Ouverture/réutilisation de la fenêtre WhatsApp...");
    
    // Utiliser window.open() avec le même nom - le navigateur réutilisera la fenêtre si elle existe
    const whatsappWindow = window.open(whatsappUrl, windowName);
    
    if (whatsappWindow) {
      // Mettre à jour la référence
      whatsappWindowRef.current = whatsappWindow;
      
      // Vérifier si c'est une nouvelle fenêtre ou une réutilisation
      if (whatsappWindowRef.current === whatsappWindow) {
        // Vérifier si la fenêtre était déjà ouverte
        try {
          // Essayer de vérifier si la fenêtre était fermée avant
          const wasClosed = whatsappWindow.closed;
          if (wasClosed) {
            console.log("✅ Nouvelle fenêtre WhatsApp ouverte");
          } else {
            console.log("✅ Fenêtre WhatsApp réutilisée - URL changée pour la nouvelle conversation");
          }
        } catch (error) {
          console.log("✅ Fenêtre WhatsApp ouverte/réutilisée");
          console.debug("Détail de l'erreur de vérification de fenêtre:", error);
        }
      }
      
      // Attendre un peu pour que la fenêtre se charge
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      // Focus sur la fenêtre
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
      console.error("❌ Instructions: Cliquez sur l'icône de cadenas dans la barre d'adresse → Autoriser les popups");
      whatsappWindowRef.current = null;
      return null;
    }
  };

  // Envoyer un message via WhatsApp Web automatiquement
  const sendWhatsAppMessage = async (data, index, total) => {
    console.log(`📨 Envoi du message ${index + 1}/${total} pour ${data.name} (${data.phone})`);
    const message = generateMessageWithContext(data);
    
    // IMPORTANT: Attendre 15 secondes minimum entre chaque message pour éviter le bannissement WhatsApp
    // C'est le délai minimum recommandé par WhatsApp pour éviter les restrictions
    // Augmenté à 15 secondes pour les connexions WiFi lentes
    const MIN_DELAY_BETWEEN_MESSAGES = 15000; // 15 secondes
    // Délai supplémentaire pour la première ouverture de WhatsApp (pour laisser le temps à la page de charger)
    const INITIAL_LOAD_DELAY = 15000; // 15 secondes supplémentaires pour le premier message (WiFi lent)
    
    // Ouvrir WhatsApp Web (la fonction ferme déjà la fenêtre précédente)
    console.log(`⏳ Ouverture de WhatsApp Web...`);
    const whatsappWindow = await openWhatsApp(data.phone, message);
    
    if (!whatsappWindow) {
      console.error(`❌ Impossible d'ouvrir WhatsApp Web pour ${data.phone}`);
      toast.error("Impossible d'ouvrir WhatsApp Web. Vérifiez que les popups ne sont pas bloquées.");
      return false;
    }

    // Si c'est le premier message, attendre plus longtemps pour laisser le temps à WhatsApp de charger complètement
    if (isFirstMessageRef.current) {
      console.log(`⏳ Premier message détecté. Attente supplémentaire de ${INITIAL_LOAD_DELAY / 1000} secondes pour laisser le temps à WhatsApp de charger...`);
      toast.info(
        `📱 Premier message : Attente de ${INITIAL_LOAD_DELAY / 1000} secondes pour laisser WhatsApp charger complètement...`,
        { duration: INITIAL_LOAD_DELAY }
      );
      await new Promise((resolve) => setTimeout(resolve, INITIAL_LOAD_DELAY));
      isFirstMessageRef.current = false;
      console.log(`✅ Délai initial terminé. WhatsApp devrait être chargé maintenant.`);
    }

    console.log(`✅ WhatsApp Web ouvert avec succès. Attente de ${MIN_DELAY_BETWEEN_MESSAGES / 1000} secondes...`);
    
    // Afficher une notification pour guider l'utilisateur
    toast.info(
      `📱 WhatsApp Web ouvert pour ${data.name} (${data.phone}). ` +
      `Cliquez sur "Envoyer" dans la fenêtre WhatsApp, puis attendez ${MIN_DELAY_BETWEEN_MESSAGES / 1000} secondes...`,
      { duration: MIN_DELAY_BETWEEN_MESSAGES }
    );

    // Attendre 15 secondes minimum avant de passer au suivant
    // Pendant ce temps, l'utilisateur doit cliquer sur "Envoyer" dans WhatsApp Web
    // Ce délai est CRITIQUE pour éviter le bannissement WhatsApp et laisser le temps au WiFi lent
    console.log(`⏱️ Attente de ${MIN_DELAY_BETWEEN_MESSAGES / 1000} secondes (minimum requis pour éviter le bannissement et WiFi lent)...`);
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
      `3. Attendre 15 secondes minimum entre chaque message (pour éviter le bannissement et laisser le temps au WiFi lent)\n` +
      `4. Passer automatiquement au suivant\n\n` +
      `⚠️ IMPORTANT :\n` +
      `- Vous devez AUTORISER LES POPUPS dans votre navigateur pour que cela fonctionne\n` +
      `- Vous devrez être connecté à WhatsApp Web\n` +
      `- Vous devrez cliquer sur "Envoyer" pour chaque message dans la fenêtre WhatsApp\n` +
      `- Le système attendra exactement 15 secondes entre chaque message (CRITIQUE pour éviter le bannissement)\n` +
      `- Le premier message attendra 15 secondes supplémentaires pour laisser WhatsApp charger (WiFi lent)\n` +
      `- Vous pouvez arrêter l'envoi automatique à tout moment avec le bouton "Arrêter"\n\n` +
      `🛡️ PROTECTION CONTRE LE BANNISSEMENT :\n` +
      `- Délai minimum de 15 secondes entre chaque message (garanti)\n` +
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
      
      // NOTE: Le délai de 15 secondes est déjà inclus dans sendWhatsAppMessage
      // Pas besoin de pause supplémentaire pour éviter le bannissement
      // Le délai de 15 secondes entre chaque message est respecté automatiquement
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
  
  // Fonction pour gérer l'édition d'une cellule dans le tableau
  const handleCellEdit = (rowId, field, value) => {
    setExcelData((prev) =>
      prev.map((row) => {
        if (row.id === rowId) {
          const updatedRow = { ...row, [field]: value };
          
          // Si on modifie le téléphone, revalider
          if (field === "phone") {
            const phoneValidation = value ? validatePhoneNumber(value) : { valid: false, error: "Numéro manquant" };
            updatedRow.phoneValid = phoneValidation.valid;
            updatedRow.phoneError = phoneValidation.error;
          }
          
          // Si on modifie le nom, extraire le téléphone et le nom
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
      const message = generateMessageWithContext(data);

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
          <GhostBtn onClick={() => setShowHotelsModal(true)}>
            🏨 Hôtels extérieur
          </GhostBtn>
          <GhostBtn onClick={() => setShowConfigModal(true)}>
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
                <p className="text-[10px] text-red-600 mt-1">⚠️ {stats.invalidPhones} invalide(s)</p>
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
            <table className="w-full border-collapse bg-white rounded-lg border border-slate-200 shadow-sm">
              <thead>
                <tr className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Invoice N</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Téléphone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Hôtel</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Chambre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Trip</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Heure</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Marina</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Statut</th>
                </tr>
              </thead>
              <tbody>
                {excelData.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-slate-100 hover:bg-slate-50/50 ${
                      row.messageSent ? "bg-emerald-50/30" : ""
                    } ${
                      !row.phoneValid ? "bg-red-50/50 border-l-4 border-l-red-500" : ""
                    }`}
                  >
                    <td className="px-4 py-2 text-xs text-slate-700">
                      {editingCell?.rowId === row.id && editingCell?.field === "invoiceN" ? (
                        <TextInput
                          value={row.invoiceN}
                          onChange={(e) => handleCellEdit(row.id, "invoiceN", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          className="w-full px-2 py-1 text-xs"
                          autoFocus
                        />
                      ) : (
                        <span 
                          className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded"
                          onClick={() => setEditingCell({ rowId: row.id, field: "invoiceN" })}
                        >
                          {row.invoiceN}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-700">
                      {editingCell?.rowId === row.id && editingCell?.field === "date" ? (
                        <TextInput
                          value={row.date}
                          onChange={(e) => handleCellEdit(row.id, "date", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          className="w-full px-2 py-1 text-xs"
                          autoFocus
                        />
                      ) : (
                        <span 
                          className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded"
                          onClick={() => setEditingCell({ rowId: row.id, field: "date" })}
                        >
                          {row.date}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs font-medium text-slate-900">
                      {editingCell?.rowId === row.id && editingCell?.field === "name" ? (
                        <TextInput
                          value={row.name}
                          onChange={(e) => handleCellEdit(row.id, "name", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          className="w-full px-2 py-1 text-xs"
                          autoFocus
                        />
                      ) : (
                        <span 
                          className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded"
                          onClick={() => setEditingCell({ rowId: row.id, field: "name" })}
                        >
                          {row.name}
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-2 text-xs ${
                      !row.phoneValid 
                        ? "text-red-600 font-semibold" 
                        : row.phone 
                          ? "text-blue-600 font-medium" 
                          : "text-amber-600"
                    }`}>
                      {editingCell?.rowId === row.id && editingCell?.field === "phone" ? (
                        <TextInput
                          value={row.phone}
                          onChange={(e) => handleCellEdit(row.id, "phone", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          className="w-full px-2 py-1 text-xs"
                          autoFocus
                        />
                      ) : (
                        <span 
                          className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded"
                          onClick={() => setEditingCell({ rowId: row.id, field: "phone" })}
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
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-700">
                      {editingCell?.rowId === row.id && editingCell?.field === "hotel" ? (
                        <TextInput
                          value={row.hotel}
                          onChange={(e) => handleCellEdit(row.id, "hotel", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          className="w-full px-2 py-1 text-xs"
                          autoFocus
                        />
                      ) : (
                        <span 
                          className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded"
                          onClick={() => setEditingCell({ rowId: row.id, field: "hotel" })}
                        >
                          {row.hotel}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-700">
                      {editingCell?.rowId === row.id && editingCell?.field === "roomNo" ? (
                        <TextInput
                          value={row.roomNo}
                          onChange={(e) => handleCellEdit(row.id, "roomNo", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          className="w-full px-2 py-1 text-xs"
                          autoFocus
                        />
                      ) : (
                        <span 
                          className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded"
                          onClick={() => setEditingCell({ rowId: row.id, field: "roomNo" })}
                        >
                          {row.roomNo}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-700">
                      {editingCell?.rowId === row.id && editingCell?.field === "trip" ? (
                        <TextInput
                          value={row.trip}
                          onChange={(e) => handleCellEdit(row.id, "trip", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          className="w-full px-2 py-1 text-xs"
                          autoFocus
                        />
                      ) : (
                        <span 
                          className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded"
                          onClick={() => setEditingCell({ rowId: row.id, field: "trip" })}
                        >
                          {row.trip}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs font-semibold text-slate-900">
                      {editingCell?.rowId === row.id && editingCell?.field === "time" ? (
                        <TextInput
                          value={row.time}
                          onChange={(e) => handleCellEdit(row.id, "time", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          className="w-full px-2 py-1 text-xs"
                          autoFocus
                        />
                      ) : (
                        <span 
                          className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded"
                          onClick={() => setEditingCell({ rowId: row.id, field: "time" })}
                        >
                          {row.time}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <label className="flex items-center justify-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rowsWithMarina.has(row.id)}
                          onChange={() => handleToggleMarina(row.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          title="Bateau garé à la marina de cet hôtel"
                        />
                      </label>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {row.messageSent ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                          ✓ Envoyé
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <GhostBtn onClick={handlePreviewMessages} disabled={sending || autoSending}>
              📝 Prévisualiser les messages
            </GhostBtn>
            <PrimaryBtn 
              onClick={handleAutoSendMessages} 
              disabled={sending || autoSending || stats.withPhone === 0}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
            >
              {autoSending ? "🔄 Envoi automatique..." : "🚀 Envoyer automatiquement via WhatsApp"}
            </PrimaryBtn>
            <PrimaryBtn 
              onClick={handleSendMessages} 
              disabled={sending || autoSending || stats.withPhone === 0}
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
              {previewMessages.map((msg) => (
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
                  <pre className="text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200 whitespace-pre-wrap font-sans">
                    {msg.message}
                  </pre>
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* En-tête */}
              <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">⚙️ Configuration des messages par activité</h3>
                  <p className="text-sm opacity-90 mt-1">Personnalisez les messages WhatsApp pour chaque activité</p>
                </div>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="text-white/80 hover:text-white text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              {/* Contenu */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Sélection d'activité */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Sélectionner une activité
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {activities.length > 0 ? (
                      activities.map((activity) => (
                        <button
                          key={activity.id}
                          onClick={() => {
                            const template = messageTemplates[activity.name] || "";
                            setSelectedActivity(activity.name);
                            setEditingTemplate({
                              activity: activity.name,
                              template: template,
                            });
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            selectedActivity === activity.name
                              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {activity.name}
                          {messageTemplates[activity.name] && (
                            <span className="ml-2 text-xs opacity-75">✓</span>
                          )}
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">
                        Aucune activité disponible. Les templates seront appliqués par nom d'activité depuis le fichier Excel.
                      </p>
                    )}
                  </div>
                </div>

                {/* Entrée manuelle du nom d'activité */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Ou saisir le nom de l'activité manuellement
                  </label>
                  <TextInput
                    placeholder="Ex: Speed Boat, Safari Désert..."
                    value={editingTemplate.activity}
                    onChange={(e) =>
                      setEditingTemplate({
                        ...editingTemplate,
                        activity: e.target.value,
                      })
                    }
                  />
                </div>

                {/* Éditeur de template */}
                {editingTemplate.activity && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-semibold text-slate-700">
                        Template de message pour "{editingTemplate.activity}"
                      </label>
                      <div className="flex gap-2">
                        <GhostBtn
                          size="sm"
                          onClick={() => {
                            setEditingTemplate({
                              ...editingTemplate,
                              template: getDefaultTemplate(),
                            });
                          }}
                        >
                          📋 Template par défaut
                        </GhostBtn>
                        {messageTemplates[editingTemplate.activity] && (
                          <GhostBtn
                            size="sm"
                            onClick={() => handleDeleteTemplate(editingTemplate.activity)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            🗑️ Supprimer
                          </GhostBtn>
                        )}
                      </div>
                    </div>
                    <textarea
                      value={editingTemplate.template}
                      onChange={(e) =>
                        setEditingTemplate({
                          ...editingTemplate,
                          template: e.target.value,
                        })
                      }
                      placeholder="Entrez votre template de message ici..."
                      className="w-full rounded-lg border border-slate-300 bg-white p-4 text-sm font-mono min-h-[300px] resize-y focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      rows={12}
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Variables disponibles : <code className="bg-slate-100 px-1 rounded">{"{name}"}</code>,{" "}
                      <code className="bg-slate-100 px-1 rounded">{"{trip}"}</code>,{" "}
                      <code className="bg-slate-100 px-1 rounded">{"{date}"}</code>,{" "}
                      <code className="bg-slate-100 px-1 rounded">{"{time}"}</code>,{" "}
                      <code className="bg-slate-100 px-1 rounded">{"{hotel}"}</code>,{" "}
                      <code className="bg-slate-100 px-1 rounded">{"{roomNo}"}</code>,{" "}
                      <code className="bg-slate-100 px-1 rounded">{"{adults}"}</code>,{" "}
                      <code className="bg-slate-100 px-1 rounded">{"{children}"}</code>,{" "}
                      <code className="bg-slate-100 px-1 rounded">{"{infants}"}</code>
                    </p>
                  </div>
                )}

                {/* Liste des templates configurés */}
                {Object.keys(messageTemplates).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3">
                      Templates configurés ({Object.keys(messageTemplates).length})
                    </h4>
                    <div className="space-y-2">
                      {Object.keys(messageTemplates).map((activityName) => (
                        <div
                          key={activityName}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
                        >
                          <span className="text-sm font-medium text-slate-700">{activityName}</span>
                          <div className="flex gap-2">
                            <GhostBtn
                              size="sm"
                              onClick={() => handleOpenConfig(activityName)}
                            >
                              ✏️ Modifier
                            </GhostBtn>
                            <GhostBtn
                              size="sm"
                              onClick={() => handleDeleteTemplate(activityName)}
                              className="text-red-600 hover:bg-red-50"
                            >
                              🗑️ Supprimer
                            </GhostBtn>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Pied de page */}
              <div className="border-t border-slate-200 p-6 flex items-center justify-end gap-3">
                <GhostBtn onClick={() => setShowConfigModal(false)}>Annuler</GhostBtn>
                <PrimaryBtn
                  onClick={handleSaveTemplate}
                  disabled={!editingTemplate.activity.trim()}
                >
                  💾 Sauvegarder le template
                </PrimaryBtn>
              </div>
            </div>
          </div>
        )}

        {/* Modal de gestion des hôtels avec RDV à l'extérieur */}
        {showHotelsModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* En-tête */}
              <div className="bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 text-white p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">🏨 Hôtels avec RDV à l'extérieur</h3>
                  <p className="text-sm opacity-90 mt-1">Liste des hôtels où les clients doivent attendre à l'extérieur</p>
                </div>
                <button
                  onClick={() => setShowHotelsModal(false)}
                  className="text-white/80 hover:text-white text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              {/* Contenu */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Ajouter un hôtel */}
                <div className="flex gap-2">
                  <TextInput
                    placeholder="Nom de l'hôtel (ex: Hilton Hurghada Resort)"
                    value={newHotel}
                    onChange={(e) => setNewHotel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleAddHotel();
                      }
                    }}
                    className="flex-1"
                  />
                  <PrimaryBtn onClick={handleAddHotel}>
                    ➕ Ajouter
                  </PrimaryBtn>
                </div>

                {/* Liste des hôtels */}
                {exteriorHotels.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-700 mb-3">
                      Liste des hôtels ({exteriorHotels.length})
                    </h4>
                    {exteriorHotels.map((hotel, index) => {
                      const hotelName = typeof hotel === 'string' ? hotel : hotel.name;
                      const hasBeachBoats = typeof hotel === 'string' ? false : (hotel.hasBeachBoats || false);
                      
                      return (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <span className="text-sm font-medium text-slate-900 flex-1">{hotelName}</span>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={hasBeachBoats}
                                onChange={() => handleToggleBeachBoats(hotelName)}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <span className="text-xs text-slate-600">🚤 Bateaux sur la plage</span>
                            </label>
                          </div>
                          <button
                            onClick={() => handleDeleteHotel(hotelName)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded-lg text-sm font-medium transition-colors ml-2"
                          >
                            🗑️ Supprimer
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <p className="text-sm">Aucun hôtel dans la liste</p>
                    <p className="text-xs mt-2">Les clients auront le message "RDV devant la réception" par défaut</p>
                  </div>
                )}

                {/* Information */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                  <p className="text-xs text-blue-900">
                    <strong>ℹ️ Information :</strong> Pour les hôtels dans cette liste, le message "📍 Rendez-vous à l'extérieur de l'hôtel." sera automatiquement ajouté à tous les messages. 
                    Pour les autres hôtels, ce sera "📍 Rendez-vous devant la réception de l'hôtel."
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 p-4 flex justify-end">
                <GhostBtn onClick={() => setShowHotelsModal(false)}>
                  Fermer
                </GhostBtn>
              </div>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

