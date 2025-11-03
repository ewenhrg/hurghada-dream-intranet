import { useState, useMemo } from "react";
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
        
        // Lire d'abord comme tableau de tableaux pour avoir toutes les lignes
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
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
            // Convertir les lignes suivantes en objets (en sautant la ligne d'en-têtes)
            jsonData = rawData.slice(headerRowIndex + 1)
              .filter(row => row && row.some(cell => cell !== "" && cell !== null && cell !== undefined)) // Ignorer les lignes complètement vides
              .map(row => {
                const obj = {};
                headers.forEach((header, index) => {
                  obj[header] = row[index] !== undefined && row[index] !== null ? String(row[index]) : "";
                });
                return obj;
              });
          }
        } else {
          // Fallback : essayer la méthode normale de XLSX
          jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            defval: "", 
            raw: false 
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
          const roomNo = findColumn(row, ["Rm No", "Room No", "Room#", "rm_no", "room_no", "room", "Room", "Chambre", "chambre"]);
          const pax = findColumn(row, ["Pax", "pax", "Adults", "adults", "Adultes", "adultes"]) || 0;
          const ch = findColumn(row, ["Ch", "ch", "Children", "children", "Enfants", "enfants"]) || 0;
          const inf = findColumn(row, ["inf", "Inf", "Infants", "infants", "Bébés", "bébés", "Babies", "babies"]) || 0;
          const trip = findColumn(row, ["Trip", "trip", "Activity", "activity", "Activité", "activité"]);
          const time = findColumn(row, ["time", "Time", "Pickup Time", "pickup_time", "Heure", "heure", "Pickup", "pickup"]);
          const comment = findColumn(row, ["Comment", "comment", "Notes", "notes", "Commentaire", "commentaire"]);

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
            time: String(time || ""),
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

  // Simuler l'envoi des messages (à remplacer par un vrai service SMS/WhatsApp)
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
        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50/50">
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
              <p className="text-sm font-semibold text-slate-700">Cliquez pour charger un fichier Excel</p>
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

        {/* Actions */}
        {excelData.length > 0 && (
          <div className="flex gap-3 justify-end">
            <GhostBtn onClick={handlePreviewMessages}>📝 Prévisualiser les messages</GhostBtn>
            <PrimaryBtn onClick={handleSendMessages} disabled={sending || stats.withPhone === 0}>
              {sending ? "📤 Envoi en cours..." : "📤 Envoyer tous les messages"}
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

