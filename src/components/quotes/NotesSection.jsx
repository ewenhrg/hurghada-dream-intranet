/**
 * Composant pour la section des notes du devis
 */
export function NotesSection({ notes, onNotesChange }) {
  return (
    <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl border border-amber-200 shadow-sm p-6 md:p-8">
      <label className="block text-base md:text-lg font-bold text-amber-900 mb-4 flex items-center gap-2">
        <span className="text-xl">📝</span>
        <span>Notes et informations supplémentaires</span>
      </label>
      <textarea
        placeholder="Langue du guide, point de pick-up, demandes spéciales, etc."
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
      />
      <p className="text-xs text-slate-500 mt-3">
        💡 Ces informations seront incluses dans le devis final
      </p>
    </div>
  );
}

