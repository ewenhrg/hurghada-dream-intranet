/** Formule unique : All inclusive (les autres colonnes DB restent à false pour compat). */
export const HOTEL_BOARD_LABEL = "All inclusive";

export const HOTEL_BOARD_OPTIONS = [
  { formKey: "boardAllInclusive", dbColumn: "board_all_inclusive", label: HOTEL_BOARD_LABEL },
];

/** Toujours All inclusive pour l’affichage. */
export function boardLabelsFromViewModel() {
  return [HOTEL_BOARD_LABEL];
}

/** Payload DB : uniquement all inclusive. */
export function boardFieldsToPayload() {
  return {
    board_all_inclusive: true,
    board_full_board: false,
    board_breakfast: false,
  };
}

export function boardFieldsFromRow() {
  return {
    boardAllInclusive: true,
    boardFullBoard: false,
    boardBreakfast: false,
  };
}
