import { useMemo, useState } from "react";
import { GhostBtn, PrimaryBtn, TextInput } from "../ui";
import { getDefaultTemplate } from "../../utils/messageGenerator";

const VARIABLES_HINT =
  "{hotel} ou Hôtel : ___, {time} ou Heure de départ : ___, {trip} ou Activité : ___, {name}, {date}, {formLink}";

export default function MessageTemplatesModal({
  activityNames = [],
  messageTemplates = {},
  onTemplateChange,
  onDeleteTemplate,
  onClose,
  saveStatus = "idle",
}) {
  const [search, setSearch] = useState("");
  const [newActivity, setNewActivity] = useState("");
  const [selectedActivity, setSelectedActivity] = useState(null);

  const sortedNames = useMemo(() => {
    const unique = [...new Set(activityNames.map((n) => n.trim()).filter(Boolean))];
    return unique.sort((a, b) => a.localeCompare(b, "fr"));
  }, [activityNames]);

  const filteredNames = useMemo(() => {
    if (!search.trim()) return sortedNames;
    const term = search.toLowerCase();
    return sortedNames.filter((name) => name.toLowerCase().includes(term));
  }, [sortedNames, search]);

  const configuredCount = useMemo(
    () => sortedNames.filter((name) => Boolean(messageTemplates[name]?.trim())).length,
    [sortedNames, messageTemplates]
  );

  const handleAddActivity = () => {
    const name = newActivity.trim();
    if (!name) return;
    if (!messageTemplates[name]) {
      onTemplateChange(name, "");
    }
    setNewActivity("");
    setSelectedActivity(name);
  };

  const saveLabel =
    saveStatus === "saving"
      ? "Sauvegarde..."
      : saveStatus === "saved"
      ? "✓ Sauvegardé"
      : saveStatus === "error"
      ? "Erreur"
      : "";

  const template = selectedActivity ? messageTemplates[selectedActivity] ?? "" : "";
  const hasTemplate = Boolean(template.trim());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm md:p-6">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-blue-700 px-4 py-4 text-white md:px-6">
          <div>
            {selectedActivity ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedActivity(null)}
                  className="mb-1 text-sm font-semibold text-blue-100 hover:text-white"
                >
                  ← Retour aux activités
                </button>
                <h3 className="text-xl font-bold md:text-2xl">{selectedActivity}</h3>
                <p className="mt-1 text-sm text-blue-100">Message WhatsApp pour cette activité</p>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold md:text-2xl">Messages prédéfinis</h3>
                <p className="mt-1 text-sm text-blue-100">
                  {configuredCount} / {sortedNames.length} activité
                  {sortedNames.length > 1 ? "s" : ""} configurée
                  {configuredCount > 1 ? "s" : ""}
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {saveLabel && (
              <span
                className={`text-sm font-semibold ${
                  saveStatus === "error" ? "text-red-200" : "text-emerald-200"
                }`}
              >
                {saveLabel}
              </span>
            )}
            <GhostBtn onClick={onClose} className="bg-white/15 text-white hover:bg-white/25">
              Fermer
            </GhostBtn>
          </div>
        </div>

        {!selectedActivity ? (
          <>
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 md:px-6">
              <TextInput
                type="search"
                placeholder="Rechercher une activité..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-base text-gray-900"
              />
              <p className="mt-2 text-sm text-gray-700">
                Cliquez sur une activité pour saisir ou modifier son message.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
              {filteredNames.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-700">
                  Aucune activité. Ajoutez-en une ci-dessous.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredNames.map((activityName) => {
                    const isConfigured = Boolean(messageTemplates[activityName]?.trim());
                    return (
                      <button
                        key={activityName}
                        type="button"
                        onClick={() => setSelectedActivity(activityName)}
                        className={`flex items-center justify-between rounded-xl border-2 px-4 py-4 text-left transition hover:border-blue-500 hover:bg-blue-50 ${
                          isConfigured
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <span className="pr-2 text-base font-bold text-gray-900">{activityName}</span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                            isConfigured
                              ? "bg-emerald-600 text-white"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {isConfigured ? "✓ OK" : "À faire"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-4">
                <p className="mb-2 font-semibold text-gray-900">Ajouter une activité</p>
                <div className="flex flex-wrap gap-2">
                  <TextInput
                    placeholder="Ex: Orange Bay, Safari..."
                    value={newActivity}
                    onChange={(e) => setNewActivity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddActivity();
                    }}
                    className="min-w-[200px] flex-1 text-base text-gray-900"
                  />
                  <PrimaryBtn onClick={handleAddActivity} disabled={!newActivity.trim()}>
                    Ajouter
                  </PrimaryBtn>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
            <div className="mb-3 flex flex-wrap gap-2">
              <GhostBtn
                size="sm"
                onClick={() => onTemplateChange(selectedActivity, getDefaultTemplate())}
              >
                Modèle par défaut
              </GhostBtn>
              {hasTemplate && (
                <GhostBtn
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Effacer le message pour « ${selectedActivity} » ?`
                      )
                    ) {
                      onDeleteTemplate(selectedActivity);
                    }
                  }}
                >
                  Effacer le message
                </GhostBtn>
              )}
            </div>

            <textarea
              value={template}
              onChange={(e) => onTemplateChange(selectedActivity, e.target.value)}
              placeholder={`Collez ici le message pour ${selectedActivity}...`}
              className="min-h-[320px] w-full resize-y rounded-xl border-2 border-gray-300 bg-white p-4 text-base leading-relaxed text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              rows={14}
              autoFocus
            />

            {!hasTemplate && (
              <p className="mt-2 text-sm font-medium text-amber-700">
                Pas encore de message — le modèle par défaut sera utilisé à l&apos;envoi.
              </p>
            )}

            <div className="mt-4 rounded-lg bg-gray-100 p-3 text-sm text-gray-800">
              <p className="font-semibold text-gray-900">Remplissage auto depuis l&apos;Excel :</p>
              <p className="mt-1">
                <code className="rounded bg-white px-1">{VARIABLES_HINT}</code>
              </p>
              <p className="mt-2">
                Exemple : <code className="rounded bg-white px-1">Hôtel : ___</code> et{" "}
                <code className="rounded bg-white px-1">Heure de départ : _____</code>
              </p>
            </div>

            <div className="mt-4 flex justify-end">
              <PrimaryBtn onClick={() => setSelectedActivity(null)}>Terminé</PrimaryBtn>
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-xs text-gray-600 md:text-sm">
          Sauvegarde automatique dans la base — visible par toute l&apos;équipe
        </div>
      </div>
    </div>
  );
}
