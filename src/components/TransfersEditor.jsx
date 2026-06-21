import { memo } from "react";
import { NEIGHBORHOODS } from "../constants";
import { TextInput, NumberInput } from "./ui";
import { isMarsaAlamCategory } from "../utils/transferPricing";

const defaultRow = () => ({
  morningEnabled: false,
  morningTime: "",
  afternoonEnabled: false,
  afternoonTime: "",
  eveningEnabled: false,
  eveningTime: "",
  surcharge: 0,
  surchargeUpTo2: 0,
  surchargeOver2: 0,
});

export const TransfersEditor = memo(({ value = {}, onChange, category = "" }) => {
  const marsaAlamMode = isMarsaAlamCategory(category);

  return (
    <div className="space-y-3">
      {marsaAlamMode && (
        <p className="text-xs text-violet-800 font-medium bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
          Marsa Alam : tarif transfert forfaitaire par quartier — 1 à 2 personnes ou plus de 2 personnes (adultes + enfants).
        </p>
      )}
      {NEIGHBORHOODS.map((n) => {
        const row = value[n.key] ? { ...defaultRow(), ...value[n.key] } : defaultRow();

        return (
          <div key={n.key} className="border rounded-xl p-3 bg-white/40">
            <div className="font-medium text-sm mb-2">{n.label}</div>
            <div className="grid md:grid-cols-7 gap-3 items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.morningEnabled}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [n.key]: { ...row, morningEnabled: e.target.checked },
                    })
                  }
                />
                Matin
              </label>
              <TextInput
                type="time"
                value={row.morningTime}
                onChange={(e) =>
                  onChange({
                    ...value,
                    [n.key]: { ...row, morningTime: e.target.value },
                  })
                }
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.afternoonEnabled}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [n.key]: { ...row, afternoonEnabled: e.target.checked },
                    })
                  }
                />
                Après-midi
              </label>
              <TextInput
                type="time"
                value={row.afternoonTime}
                onChange={(e) =>
                  onChange({
                    ...value,
                    [n.key]: { ...row, afternoonTime: e.target.value },
                  })
                }
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.eveningEnabled}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [n.key]: { ...row, eveningEnabled: e.target.checked },
                    })
                  }
                />
                Soir
              </label>
              <TextInput
                type="time"
                value={row.eveningTime}
                onChange={(e) =>
                  onChange({
                    ...value,
                    [n.key]: { ...row, eveningTime: e.target.value },
                  })
                }
              />
              {!marsaAlamMode && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Supplément (€ / pers.)</p>
                  <NumberInput
                    value={row.surcharge}
                    onChange={(e) => {
                      const v = e.target.value;
                      onChange({
                        ...value,
                        [n.key]: { ...row, surcharge: v === "" ? "" : Number(v) },
                      });
                    }}
                  />
                </div>
              )}
            </div>
            {marsaAlamMode && (
              <div className="grid sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-violet-100">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Transfert 1–2 personnes (€)</p>
                  <NumberInput
                    value={row.surchargeUpTo2}
                    onChange={(e) => {
                      const v = e.target.value;
                      onChange({
                        ...value,
                        [n.key]: { ...row, surchargeUpTo2: v === "" ? "" : Number(v) },
                      });
                    }}
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Transfert plus de 2 personnes (€)</p>
                  <NumberInput
                    value={row.surchargeOver2}
                    onChange={(e) => {
                      const v = e.target.value;
                      onChange({
                        ...value,
                        [n.key]: { ...row, surchargeOver2: v === "" ? "" : Number(v) },
                      });
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

TransfersEditor.displayName = "TransfersEditor";
