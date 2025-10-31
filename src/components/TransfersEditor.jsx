import { NEIGHBORHOODS } from "../constants";
import { TextInput, NumberInput } from "./ui";

export function TransfersEditor({ value = {}, onChange }) {
  return (
    <div className="space-y-3">
      {NEIGHBORHOODS.map((n) => {
        const row = value[n.key]
          ? value[n.key]
          : {
              morningEnabled: false,
              morningTime: "",
              afternoonEnabled: false,
              afternoonTime: "",
              surcharge: 0,
            };

        return (
          <div key={n.key} className="border rounded-xl p-3 bg-white/40">
            <div className="font-medium text-sm mb-2">{n.label}</div>
            <div className="grid md:grid-cols-5 gap-3 items-end">
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
              <div>
                <p className="text-xs text-gray-500 mb-1">Supplément (€)</p>
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
            </div>
          </div>
        );
      })}
    </div>
  );
}

