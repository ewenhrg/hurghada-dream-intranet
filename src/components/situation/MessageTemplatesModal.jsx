import { GhostBtn, PrimaryBtn, TextInput } from "../ui";

export default function MessageTemplatesModal({
  activities = [],
  messageTemplates = {},
  selectedActivity,
  editingTemplate,
  onSelectActivity,
  onEditingTemplateChange,
  onSaveTemplate,
  onDeleteTemplate,
  onUseDefaultTemplate,
  onClose,
  user,
}) {
  const configuredTemplates = Object.keys(messageTemplates);
  
  // Vérifier si l'utilisateur peut ajouter de nouvelles activités (Léa ou Ewen)
  const canAddNewActivity = user?.name === "Léa" || user?.name === "Ewen";
  
  // Fonction pour réinitialiser le formulaire et créer une nouvelle activité
  const handleNewActivity = () => {
    onEditingTemplateChange({
      activity: "",
      template: "",
    });
    onSelectActivity("");
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white p-6 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold">⚙️ Configuration des messages par activité</h3>
            <p className="text-sm opacity-90 mt-1">
              Personnalisez les messages WhatsApp pour chaque activité
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6">
          {/* Section pour ajouter une nouvelle activité (Léa et Ewen uniquement) */}
          {canAddNewActivity && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-base md:text-lg font-bold text-blue-900 mb-1">
                    ➕ Ajouter une nouvelle activité
                  </h4>
                  <p className="text-xs md:text-sm text-blue-700">
                    Créez un nouveau nom d&apos;activité avec son template de message personnalisé
                  </p>
                </div>
                <GhostBtn
                  onClick={handleNewActivity}
                  variant="primary"
                  size="sm"
                  className="flex-shrink-0"
                >
                  ➕ Nouveau
                </GhostBtn>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">
                    Nom de l&apos;activité
                  </label>
                  <TextInput
                    placeholder="Ex: Speed Boat, Safari Désert, Snorkeling..."
                    value={editingTemplate.activity}
                    onChange={(e) =>
                      onEditingTemplateChange({
                        activity: e.target.value,
                      })
                    }
                    className="text-base md:text-sm"
                  />
                </div>
                {editingTemplate.activity && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs md:text-sm font-semibold text-slate-700">
                        Template de message pour &quot;{editingTemplate.activity}&quot;
                      </label>
                      <div className="flex gap-2">
                        <GhostBtn size="sm" onClick={onUseDefaultTemplate} variant="primary">
                          📋 Template par défaut
                        </GhostBtn>
                        {messageTemplates[editingTemplate.activity] && (
                          <GhostBtn
                            size="sm"
                            onClick={() => onDeleteTemplate(editingTemplate.activity)}
                            variant="danger"
                          >
                            🗑️ Supprimer
                          </GhostBtn>
                        )}
                      </div>
                    </div>
                    <textarea
                      value={editingTemplate.template}
                      onChange={(e) =>
                        onEditingTemplateChange({
                          template: e.target.value,
                        })
                      }
                      placeholder="Entrez votre template de message ici..."
                      className="w-full rounded-lg border border-slate-300 bg-white p-3 md:p-4 text-sm font-mono min-h-[200px] md:min-h-[300px] resize-y focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      rows={10}
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Variables disponibles :{" "}
                      <code className="bg-slate-100 px-1 rounded">{"{name}"}</code>,{" "}
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
              </div>
            </div>
          )}

          {/* Section pour sélectionner une activité existante */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Sélectionner une activité existante {canAddNewActivity && "(pour modifier)"}
            </label>
            <div className="flex gap-2 flex-wrap">
              {activities.length > 0 ? (
                activities.map((activity) => (
                  <button
                    key={activity.id}
                    onClick={() => {
                      onSelectActivity(activity.name);
                      // Si c'est Léa ou Ewen, remplir aussi le formulaire d'ajout
                      if (canAddNewActivity) {
                        onEditingTemplateChange({
                          activity: activity.name,
                          template: messageTemplates[activity.name] || "",
                        });
                      }
                    }}
                    className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all min-h-[44px] ${
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
                  Aucune activité disponible. Les templates seront appliqués par nom d&apos;activité
                  depuis le fichier Excel.
                </p>
              )}
            </div>
          </div>

          {/* Section pour modifier une activité existante (si pas en mode nouveau) */}
          {!canAddNewActivity && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Ou saisir le nom de l&apos;activité manuellement
              </label>
              <TextInput
                placeholder="Ex: Speed Boat, Safari Désert..."
                value={editingTemplate.activity}
                onChange={(e) =>
                  onEditingTemplateChange({
                    activity: e.target.value,
                  })
                }
              />
            </div>
          )}

          {/* Section d'édition pour activité sélectionnée (si pas en mode nouveau) */}
          {selectedActivity && selectedActivity === editingTemplate.activity && !canAddNewActivity && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Template de message pour &quot;{editingTemplate.activity}&quot;
                </label>
                <div className="flex gap-2">
                  <GhostBtn size="sm" onClick={onUseDefaultTemplate} variant="primary">
                    📋 Template par défaut
                  </GhostBtn>
                  {messageTemplates[editingTemplate.activity] && (
                    <GhostBtn
                      size="sm"
                      onClick={() => onDeleteTemplate(editingTemplate.activity)}
                      variant="danger"
                    >
                      🗑️ Supprimer
                    </GhostBtn>
                  )}
                </div>
              </div>
              <textarea
                value={editingTemplate.template}
                onChange={(e) =>
                  onEditingTemplateChange({
                    template: e.target.value,
                  })
                }
                placeholder="Entrez votre template de message ici..."
                className="w-full rounded-lg border border-slate-300 bg-white p-4 text-sm font-mono min-h-[300px] resize-y focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                rows={12}
              />
              <p className="text-xs text-slate-500 mt-2">
                Variables disponibles :{" "}
                <code className="bg-slate-100 px-1 rounded">{"{name}"}</code>,{" "}
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

          {configuredTemplates.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">
                Templates configurés ({configuredTemplates.length})
              </h4>
              <div className="space-y-2">
                {configuredTemplates.map((activityName) => (
                  <div
                    key={activityName}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
                  >
                    <span className="text-sm font-medium text-slate-700">{activityName}</span>
                    <div className="flex gap-2">
                      <GhostBtn size="sm" onClick={() => onSelectActivity(activityName)}>
                        ✏️ Modifier
                      </GhostBtn>
                      <GhostBtn
                        size="sm"
                        onClick={() => onDeleteTemplate(activityName)}
                        variant="danger"
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

        <div className="border-t border-slate-200 p-4 md:p-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
          <GhostBtn onClick={onClose} className="w-full sm:w-auto order-2 sm:order-1">Annuler</GhostBtn>
          <PrimaryBtn 
            onClick={onSaveTemplate} 
            disabled={!editingTemplate.activity.trim()}
            className="w-full sm:w-auto order-1 sm:order-2"
          >
            💾 Sauvegarder le template
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

