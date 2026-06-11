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

  const sortedNames = useMemo(() => {
    const unique = [...new Set(activityNames.map((n) => n.trim()).filter(Boolean))];
    return unique.sort((a, b) => a.localeCompare(b, "fr"));
  }, [activityNames]);

  const filteredNames = useMemo(() => {
    if (!search.trim()) return sortedNames;
    const term = search.toLowerCase();
    return sortedNames.filter((name) => name.toLowerCase().includes(term));
  }, [sortedNames, search]);

  const handleAddActivity = () => {
    const name = newActivity.trim();
    if (!name) return;
    if (!messageTemplates[name]) {
      onTemplateChange(name, getDefaultTemplate());
    }
    setNewActivity("");
  };

  const saveLabel =
    saveStatus === "saving"
      ? "Sauvegarde en cours..."
      : saveStatus === "saved"
      ? "✓ Sauvegardé dans la base"
      : saveStatus === "error"
      ? "Erreur de sauvegarde"
      : "";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/60 backdrop-blur-sm">
      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-blue-700 px-4 py-4 text-white md:px-6">
          <div>
            <h3 className="text-xl font-bold md:text-2xl">Messages prédéfinis par activité</h3>
            <p className="mt-1 text-sm text-blue-100">
              Un message par activité — sauvegarde automatique pour toute l&apos;équipe
            </p>
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

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 md:px-6">
          <TextInput
            type="search"
            placeholder="Rechercher une activité..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-base text-gray-900"
          />
          <p className="mt-2 text-sm text-gray-600">
            Remplissage auto depuis l&apos;Excel :{" "}
            <code className="rounded bg-gray-200 px-1">{VARIABLES_HINT}</code>
          </p>
          <p className="mt-1 text-sm text-gray-700">
            Exemple : laissez{" "}
            <code className="rounded bg-gray-200 px-1">Hôtel : ___</code> et{" "}
            <code className="rounded bg-gray-200 px-1">Heure de départ : _____</code> — le logiciel
            mettra l&apos;hôtel et l&apos;heure de prise en charge de chaque client.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
          {filteredNames.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-700">
              Aucune activité trouvée. Ajoutez un nom d&apos;activité ci-dessous.
            </p>
          ) : (
            <div className="space-y-5">
              {filteredNames.map((activityName) => {
                const template = messageTemplates[activityName] ?? "";
                const hasTemplate = Boolean(template.trim());

                return (
                  <div
                    key={activityName}
                    className="rounded-xl border-2 border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-lg font-bold text-gray-900">{activityName}</h4>
                      <div className="flex flex-wrap gap-2">
                        <GhostBtn
                          size="sm"
                          onClick={() => onTemplateChange(activityName, getDefaultTemplate())}
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
                                  `Effacer le message prédéfini pour « ${activityName} » ?`
                                )
                              ) {
                                onDeleteTemplate(activityName);
                              }
                            }}
                          >
                            Effacer
                          </GhostBtn>
                        )}
                      </div>
                    </div>
                    <textarea
                      value={template}
                      onChange={(e) => onTemplateChange(activityName, e.target.value)}
                      placeholder={`Message WhatsApp pour ${activityName}...`}
                      className="min-h-[140px] w-full resize-y rounded-lg border-2 border-gray-300 bg-white p-3 text-base leading-relaxed text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      rows={6}
                    />
                    {!hasTemplate && (
                      <p className="mt-1 text-sm font-medium text-amber-700">
                        Pas encore de message — le modèle par défaut sera utilisé
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-4">
            <p className="mb-2 font-semibold text-gray-900">Ajouter une activité</p>
            <div className="flex flex-wrap gap-2">
              <TextInput
                placeholder="Ex: Speed Boat, Safari..."
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

        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-gray-600 md:px-6">
          Les messages sont enregistrés automatiquement dans la base de données (partagés avec toute
          l&apos;équipe).
        </div>
      </div>
    </div>
  );
}
