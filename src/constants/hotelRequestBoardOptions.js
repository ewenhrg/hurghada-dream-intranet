/** Options de pension (formulaire demande hôtel public). */
export const HOTEL_BOARD_OPTIONS = [
  { formKey: "boardAllInclusive", dbColumn: "board_all_inclusive", label: "All inclusive" },
  { formKey: "boardFullBoard", dbColumn: "board_full_board", label: "Pension complète" },
  { formKey: "boardBreakfast", dbColumn: "board_breakfast", label: "Petit déjeuner compris" },
];

export function boardLabelsFromViewModel(vm) {
  return HOTEL_BOARD_OPTIONS.filter((opt) => vm[opt.formKey] === true).map((opt) => opt.label);
}

export function boardFieldsToPayload(vm) {
  const out = {};
  for (const opt of HOTEL_BOARD_OPTIONS) {
    out[opt.dbColumn] = vm[opt.formKey] === true;
  }
  return out;
}

export function boardFieldsFromRow(row) {
  const out = {};
  for (const opt of HOTEL_BOARD_OPTIONS) {
    out[opt.formKey] = row[opt.dbColumn] === true;
  }
  return out;
}
