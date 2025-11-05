import { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { PrimaryBtn, GhostBtn, Section } from "../components/ui";
import { toast } from "../utils/toast.js";

export function SituationPage({ user }) {
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

  // Extraire le numéro de téléphone depuis le champ "Name"
  const extractPhoneFromName = (nameField) => {
    if (!nameField) return null;
    
    const str = String(nameField);
    if (!str || str.trim() === "") return null;
    
    // Chercher un numéro de téléphone (commence par + suivi de chiffres)
    const phoneMatch = str.match(/\+\d[\d\s-]{6,}/);
    if (phoneMatch) {
      return phoneMatch[0].replace(/\s|-/g, ""); // Nettoyer espaces et tirets
    }
    
    // Chercher aussi les numéros sans le + (commence par des chiffres, minimum 8 caractères)
    const phoneMatch2 = str.match(/\d[\d\s-]{7,}/);
    if (phoneMatch2) {
      return phoneMatch2[0].replace(/\s|-/g, "");
    }
    
    return null;
  };

  // Extraire le nom du client (sans le téléphone)
  const extractNameFromField = (nameField) => {
    if (!nameField) return "Client";
    
    const str = String(nameField);
    if (!str || str.trim() === "") return "Client";
    
    // Enlever le numéro de téléphone
    let name = str.replace(/\+\d[\d\s-]{6,}/g, "").replace(/\d[\d\s-]{7,}/g, "").trim();
    return name || "Client";
  };

  // Convertir une valeur Excel (date/heure) en format lisible
  const convertExcelValue = (value, columnName = "") => {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    // Si c'est déjà un objet Date JavaScript, le formater directement
    if (value instanceof Date) {
      const normalizedColName = String(columnName || "").toLowerCase();
      const isTimeColumn = normalizedColName.includes("time") || normalizedColName.includes("heure") || normalizedColName.includes("pickup");
      
      if (isTimeColumn) {
        // Formater uniquement l'heure
        return value.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        });
      } else {
        // Formater la date
        return value.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        });
      }
    }

    // Si c'est déjà une string, vérifier si c'est un nombre en string
    const numValue = typeof value === "number" ? value : parseFloat(value);
    
    // Si ce n'est pas un nombre valide, retourner la valeur telle quelle
    if (isNaN(numValue)) {
      return String(value);
    }

    // Normaliser le nom de colonne pour la détection
    const normalizedColName = String(columnName || "").toLowerCase();

    // Détecter si c'est une colonne de date ou d'heure
    const isDateColumn = normalizedColName.includes("date") || normalizedColName.includes("jour");
    const isTimeColumn = normalizedColName.includes("time") || normalizedColName.includes("heure") || normalizedColName.includes("pickup");
    
    // Détecter les colonnes qui ne doivent PAS être converties (numéros de chambre, etc.)
    const isRoomColumn = normalizedColName.includes("rm") || normalizedColName.includes("room") || 
                         normalizedColName.includes("chambre") || normalizedColName.includes("numéro") ||
                         normalizedColName.includes("numero") || normalizedColName.includes("number");
    const isInvoiceColumn = normalizedColName.includes("invoice") || normalizedColName.includes("facture");
    const isPaxColumn = normalizedColName.includes("pax") || normalizedColName.includes("adults") || 
                        normalizedColName.includes("adultes") || normalizedColName.includes("children") ||
                        normalizedColName.includes("enfants") || normalizedColName.includes("infants") ||
                        normalizedColName.includes("bébés") || normalizedColName.includes("babies");
    
    // Si c'est une colonne qui ne doit pas être convertie (numéro de chambre, invoice, etc.), retourner directement
    if (isRoomColumn || isInvoiceColumn || isPaxColumn) {
      // Pour les nombres, préserver le format (pas de conversion en date/heure)
      // Convertir en string en préservant les zéros initiaux si c'était une string
      if (typeof value === "string") {
        return value;
      }
      // Si c'est un nombre, le convertir en string sans décimales si c'est un entier
      if (typeof value === "number") {
        if (Number.isInteger(value)) {
          return String(value);
        }
        return String(value);
      }
      return String(value);
    }

    // Les dates Excel sont des nombres >= 1 (généralement > 1000 pour les dates récentes)
    // Les heures Excel sont des fractions de jour (entre 0 et 1, ou parfois combinées avec une date)
    
    // Traiter les colonnes de date
    if (isDateColumn && numValue >= 1 && numValue < 1000000) {
      // Convertir la date Excel en date JavaScript
      // Excel compte les jours depuis le 1er janvier 1900, mais il y a un bug: il compte le 29 février 1900 qui n'existe pas
      // Donc on doit soustraire 2 jours pour corriger le bug Excel du 29 février 1900
      const excelEpoch = new Date(1899, 11, 30); // 30 décembre 1899 (base Excel)
      const daysSince1900 = numValue;
      const date = new Date(excelEpoch.getTime() + daysSince1900 * 24 * 60 * 60 * 1000);
      
      // Formater la date en format français
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        });
      }
    }

    // Traiter les colonnes d'heure
    if (isTimeColumn) {
      let hours = 0;
      let minutes = 0;
      
      if (numValue < 1) {
        // C'est juste une heure (fraction de jour)
        const totalSeconds = numValue * 24 * 60 * 60;
        hours = Math.floor(totalSeconds / 3600);
        const remainingSeconds = totalSeconds % 3600;
        minutes = Math.floor(remainingSeconds / 60);
      } else if (numValue >= 1) {
        // C'est une date+heure combinée, extraire seulement la partie heure
        const datePart = Math.floor(numValue);
        const timePart = numValue - datePart;
        const totalSeconds = timePart * 24 * 60 * 60;
        hours = Math.floor(totalSeconds / 3600);
        const remainingSeconds = totalSeconds % 3600;
        minutes = Math.floor(remainingSeconds / 60);
      }

      // Formater l'heure en HH:MM
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    // Si c'est un nombre qui pourrait être une date (pas de colonne spécifiée)
    // Mais exclure les colonnes de numéro de chambre, invoice, etc.
    if (!isDateColumn && !isTimeColumn && !isRoomColumn && !isInvoiceColumn && !isPaxColumn && 
        numValue >= 1 && numValue < 1000000) {
      // Vérifier si c'est probablement une date (nombre entre des valeurs raisonnables)
      const excelEpoch = new Date(1899, 11, 30);
      const daysSince1900 = numValue;
      const date = new Date(excelEpoch.getTime() + daysSince1900 * 24 * 60 * 60 * 1000);
      
      // Si la date est valide et raisonnable (entre 1900 et 2100), c'est probablement une date
      // Mais aussi vérifier que ce n'est pas un nombre trop petit (comme un numéro de chambre)
      if (!isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= 2100 && numValue > 1000) {
        return date.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        });
      }
    }

    // Si c'est un nombre qui pourrait être une heure (fraction de jour)
    if (!isDateColumn && !isTimeColumn && numValue > 0 && numValue < 1) {
      const totalSeconds = numValue * 24 * 60 * 60;
      const hours = Math.floor(totalSeconds / 3600);
      const remainingSeconds = totalSeconds % 3600;
      const minutes = Math.floor(remainingSeconds / 60);
      
      // Si l'heure est valide (entre 00:00 et 23:59), c'est probablement une heure
      if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      }
    }

    // Si ce n'est ni une date ni une heure reconnue, retourner la valeur telle quelle
    return String(value);
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
            // Filtrer les colonnes à ignorer : J (index 9), L (index 11), M (index 12), N (index 13)
            const columnsToIgnore = [9, 11, 12, 13];
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

        // Fonction pour trouver une colonne avec flexibilité (ignore majuscules/minuscules, espaces, caractères spéciaux)
        const findColumn = (row, possibleNames) => {
          // Normaliser le nom de colonne: enlever espaces, caractères spéciaux, mettre en minuscules
          const normalize = (str) => str?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "";
          
          // D'abord, chercher exactement (avec variations de casse) - même si la valeur est vide
          for (const name of possibleNames) {
            // Chercher exactement le nom (insensible à la casse)
            const exactMatch = Object.keys(row).find(key => key.toLowerCase() === name.toLowerCase());
            if (exactMatch) {
              const value = row[exactMatch];
              // Retourner la valeur même si elle est vide (string vide) car c'est la colonne correcte
              if (value !== undefined && value !== null) {
                return value;
              }
            }
          }
          
          // Ensuite, chercher avec normalisation (enlever espaces et caractères spéciaux)
          const normalizedPossibleNames = possibleNames.map(normalize);
          for (const key of Object.keys(row)) {
            const normalizedKey = normalize(key);
            if (normalizedPossibleNames.includes(normalizedKey)) {
              const value = row[key];
              // Retourner la valeur même si elle est vide
              if (value !== undefined && value !== null) {
                return value;
              }
            }
          }
          
          return "";
        };

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
          const trip = findColumn(row, ["Trip", "trip", "Activity", "activity", "Activité", "activité"]);
          // La colonne K "Comment" contient l'heure de prise en charge
          const pickupTime = findColumn(row, ["Comment", "comment"]);
          // Ignorer la colonne J "time" - on ne la lit pas
          const comment = findColumn(row, ["Notes", "notes", "Commentaire", "commentaire"]);

          // Convertir les valeurs en chaînes pour éviter les erreurs
          const nameStr = String(name || "");
          
          // Extraire le téléphone et le nom
          const phone = extractPhoneFromName(nameStr);
          const clientName = extractNameFromField(nameStr);

          return {
            id: `row-${index}`,
            invoiceN: String(invoiceN || ""),
            date: String(date || ""),
            name: clientName || "Client",
            phone: phone || "",
            hotel: String(hotel || ""),
            roomNo: String(roomNo || ""),
            adults: Number(pax) || 0,
            children: Number(ch) || 0,
            infants: Number(inf) || 0,
            trip: String(trip || ""),
            time: String(pickupTime || ""), // Utiliser la colonne K "Comment" comme heure de prise en charge
            comment: String(comment || ""),
            messageSent: false,
            messageSentAt: null,
          };
        });

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
          
          // Avertir si aucune colonne valide n'est détectée
          if (detectedColumns.length === 0) {
            toast.error("Aucune colonne valide détectée. Vérifiez que la première ligne de votre Excel contient les en-têtes (Invoice #, Date, Name, etc.)");
          }
        } else {
          setDetectedColumns([]);
        }

        setExcelData(mappedData);
        setShowPreview(false);
        setSendLog([]);
        
        if (mappedData.length > 0) {
          toast.success(`${mappedData.length} ligne(s) chargée(s) depuis le fichier Excel`);
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

  // Générer le message personnalisé
  const generateMessage = (data) => {
    const parts = [];

    parts.push(`Bonjour ${data.name || "Client"},`);
    parts.push("");
    parts.push(`Votre pick-up pour ${data.trip || "l'activité"} est prévu le ${data.date || "la date"} à ${data.time || "l'heure"}.
`);

    if (data.hotel) {
      parts.push(`📍 Hôtel: ${data.hotel}`);
    }

    if (data.roomNo) {
      parts.push(`🛏️ Chambre: ${data.roomNo}`);
    }

    const participants = [];
    if (data.adults > 0) participants.push(`${data.adults} adulte(s)`);
    if (data.children > 0) participants.push(`${data.children} enfant(s)`);
    if (data.infants > 0) participants.push(`${data.infants} bébé(s)`);
    
    if (participants.length > 0) {
      parts.push(`👥 Participants: ${participants.join(", ")}`);
    }

    parts.push("");
    parts.push("Merci de vous présenter à l'heure indiquée.");
    parts.push("");
    parts.push("Cordialement,");
    parts.push("Hurghada Dream");

    return parts.join("\n");
  };

  // Prévisualiser les messages
  const handlePreviewMessages = () => {
    if (excelData.length === 0) {
      toast.warning("Aucune donnée à prévisualiser. Veuillez d'abord charger un fichier Excel.");
      return;
    }

    const messages = excelData.map((data) => ({
      ...data,
      message: generateMessage(data),
    }));

    setPreviewMessages(messages);
    setShowPreview(true);
  };

  // Fermer la fenêtre WhatsApp précédente de manière synchrone
  const closePreviousWindow = async () => {
    if (whatsappWindowRef.current) {
      try {
        const wasClosed = whatsappWindowRef.current.closed;
        console.log(`🔒 Vérification de la fenêtre précédente: closed=${wasClosed}`);
        
        if (!wasClosed) {
          console.log("🔒 Fermeture de la fenêtre WhatsApp précédente...");
          whatsappWindowRef.current.close();
          
          // Attendre un peu pour vérifier que la fermeture est effective
          await new Promise((resolve) => setTimeout(resolve, 500));
          
          // Vérifier que la fenêtre est bien fermée
          try {
            if (whatsappWindowRef.current.closed) {
              console.log("✅ Fenêtre précédente fermée avec succès");
            } else {
              console.warn("⚠️ La fenêtre n'est peut-être pas complètement fermée, mais on continue...");
            }
          } catch (e) {
            console.log("✅ Fenêtre fermée (impossible de vérifier, mais c'est probablement OK)");
          }
        } else {
          console.log("✅ Fenêtre précédente déjà fermée");
        }
        
        whatsappWindowRef.current = null;
        
        // Attendre un peu plus pour que la fermeture soit complètement effective
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log("✅ Délai de fermeture terminé, prêt pour la nouvelle fenêtre");
      } catch (error) {
        console.error("❌ Erreur lors de la fermeture de la fenêtre précédente:", error);
        whatsappWindowRef.current = null;
        // Attendre quand même pour éviter les conflits
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } else {
      console.log("ℹ️ Aucune fenêtre précédente à fermer");
    }
  };

  // Ouvrir WhatsApp Web avec le numéro et le message pré-rempli
  const openWhatsApp = async (phone, message) => {
    // Nettoyer le numéro de téléphone (enlever les espaces, tirets, etc.)
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
    // Encoder le message pour l'URL
    const encodedMessage = encodeURIComponent(message);
    // Créer l'URL WhatsApp
    const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;
    
    console.log(`📱 Ouverture de WhatsApp Web pour ${phone}...`);
    console.log(`📱 URL: ${whatsappUrl.substring(0, 50)}...`);
    
    // IMPORTANT: Fermer la fenêtre précédente AVANT d'ouvrir la nouvelle
    console.log("⏳ Fermeture de la fenêtre précédente...");
    await closePreviousWindow();
    console.log("✅ Fenêtre précédente fermée, prêt pour ouvrir la nouvelle");
    
    // Attendre un peu avant d'ouvrir la nouvelle fenêtre pour éviter les conflits
    console.log("⏳ Attente de 500ms avant l'ouverture...");
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Ouvrir WhatsApp Web dans un nouvel onglet
    // Utiliser "_blank" sans nom spécifique pour éviter les conflits avec les service workers
    console.log("📂 Tentative d'ouverture de la nouvelle fenêtre...");
    const newWindow = window.open(whatsappUrl, "_blank");
    
    if (newWindow) {
      console.log(`✅ window.open() a retourné une fenêtre`);
      whatsappWindowRef.current = newWindow;
      
      // Vérifier que la fenêtre n'a pas été bloquée après un court délai
      console.log("⏳ Attente de 300ms pour vérifier la fenêtre...");
      await new Promise((resolve) => setTimeout(resolve, 300));
      
      try {
        if (newWindow.closed) {
          console.error("❌ La fenêtre WhatsApp a été fermée immédiatement (peut-être bloquée par le navigateur)");
          whatsappWindowRef.current = null;
          return null;
        }
        console.log("✅ Fenêtre WhatsApp vérifiée et ouverte correctement");
        return newWindow;
      } catch (error) {
        console.error("❌ Erreur lors de la vérification de la fenêtre:", error);
        // On retourne quand même la fenêtre car elle existe
        return newWindow;
      }
    } else {
      console.error("❌ window.open() a retourné null - Impossible d'ouvrir la fenêtre WhatsApp");
      console.error("❌ Vérifiez que les popups ne sont pas bloquées dans votre navigateur");
      whatsappWindowRef.current = null;
      return null;
    }
  };

  // Envoyer un message via WhatsApp Web automatiquement
  const sendWhatsAppMessage = async (data, index, total) => {
    console.log(`📨 Envoi du message ${index + 1}/${total} pour ${data.name} (${data.phone})`);
    const message = generateMessage(data);
    
    // IMPORTANT: Attendre 10 secondes minimum entre chaque message pour éviter le bannissement WhatsApp
    // C'est le délai minimum recommandé par WhatsApp pour éviter les restrictions
    const MIN_DELAY_BETWEEN_MESSAGES = 10000; // 10 secondes
    
    // Ouvrir WhatsApp Web (la fonction ferme déjà la fenêtre précédente)
    console.log(`⏳ Ouverture de WhatsApp Web...`);
    const whatsappWindow = await openWhatsApp(data.phone, message);
    
    if (!whatsappWindow) {
      console.error(`❌ Impossible d'ouvrir WhatsApp Web pour ${data.phone}`);
      toast.error("Impossible d'ouvrir WhatsApp Web. Vérifiez que les popups ne sont pas bloquées.");
      return false;
    }

    console.log(`✅ WhatsApp Web ouvert avec succès. Attente de ${MIN_DELAY_BETWEEN_MESSAGES / 1000} secondes...`);
    
    // Afficher une notification pour guider l'utilisateur
    toast.info(
      `📱 WhatsApp Web ouvert pour ${data.name} (${data.phone}). ` +
      `Cliquez sur "Envoyer" dans la fenêtre WhatsApp, puis attendez ${MIN_DELAY_BETWEEN_MESSAGES / 1000} secondes...`,
      { duration: MIN_DELAY_BETWEEN_MESSAGES }
    );

    // Attendre 10 secondes minimum avant de passer au suivant
    // Pendant ce temps, l'utilisateur doit cliquer sur "Envoyer" dans WhatsApp Web
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

    // Vérifier les numéros de téléphone
    const dataWithPhone = excelData.filter((data) => data.phone && !data.messageSent);
    const dataWithoutPhone = excelData.filter((data) => !data.phone);

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
      `- Vous devrez cliquer sur "Envoyer" pour chaque message dans la fenêtre WhatsApp\n` +
      `- Le système attendra exactement 10 secondes entre chaque message (CRITIQUE pour éviter le bannissement)\n` +
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

    // Démarrer l'envoi automatique
    startAutoSending(dataWithPhone);
  };

  // Fonction pour démarrer l'envoi automatique
  const startAutoSending = async (queue) => {
    isAutoSendingRef.current = true;
    
    console.log(`🚀 Démarrage de l'envoi automatique de ${queue.length} messages`);
    
    for (let i = 0; i < queue.length; i++) {
      if (!isAutoSendingRef.current) {
        // Si l'utilisateur a arrêté l'envoi
        console.log(`⏹️ Envoi arrêté par l'utilisateur à l'index ${i}`);
        break;
      }

      console.log(`\n🔄 ========== DÉBUT DU MESSAGE ${i + 1}/${queue.length} ==========`);
      
      setCurrentIndex(i + 1);
      setRemainingCount(queue.length - i - 1);

      const data = queue[i];
      const message = generateMessage(data);

      console.log(`📤 Envoi ${i + 1}/${queue.length} : ${data.name} (${data.phone})`);
      toast.info(`Envoi ${i + 1}/${queue.length} : ${data.name} (${data.phone})`);

      try {
        console.log(`⏳ Appel de sendWhatsAppMessage pour le message ${i + 1}...`);
        const result = await sendWhatsAppMessage(data, i, queue.length);
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

      console.log(`✅ ========== FIN DU MESSAGE ${i + 1}/${queue.length} ==========\n`);
      
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
        // Ignorer les erreurs
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
          // Ignorer les erreurs
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

    // Vérifier les numéros de téléphone
    const dataWithPhone = excelData.filter((data) => data.phone);
    const dataWithoutPhone = excelData.filter((data) => !data.phone);

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
      const message = generateMessage(data);

      try {
        // TODO: Remplacer par un vrai service d'envoi (Twilio, WhatsApp API, etc.)
        // Pour l'instant, on simule l'envoi
        await new Promise((resolve) => setTimeout(resolve, 500)); // Simulation d'envoi

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
    const withPhone = excelData.filter((d) => d.phone).length;
    const withoutPhone = total - withPhone;
    const sent = excelData.filter((d) => d.messageSent).length;
    
    return { total, withPhone, withoutPhone, sent };
  }, [excelData]);

  return (
    <Section
      title="📋 Situation - Envoi de messages"
      subtitle="Chargez un fichier Excel et envoyez automatiquement les messages de rappel aux clients"
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
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Statut</th>
                </tr>
              </thead>
              <tbody>
                {excelData.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-slate-100 hover:bg-slate-50/50 ${
                      row.messageSent ? "bg-emerald-50/30" : ""
                    }`}
                  >
                    <td className="px-4 py-2 text-xs text-slate-700">{row.invoiceN}</td>
                    <td className="px-4 py-2 text-xs text-slate-700">{row.date}</td>
                    <td className="px-4 py-2 text-xs font-medium text-slate-900">{row.name}</td>
                    <td className="px-4 py-2 text-xs text-slate-700">
                      {row.phone ? (
                        <span className="text-blue-600 font-medium">{row.phone}</span>
                      ) : (
                        <span className="text-amber-600">⚠️ Non trouvé</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-700">{row.hotel}</td>
                    <td className="px-4 py-2 text-xs text-slate-700">{row.roomNo}</td>
                    <td className="px-4 py-2 text-xs text-slate-700">{row.trip}</td>
                    <td className="px-4 py-2 text-xs font-semibold text-slate-900">{row.time}</td>
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
      </div>
    </Section>
  );
}

