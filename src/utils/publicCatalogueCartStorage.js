/** Persistance du panier catalogue public entre la liste et la fiche activité. */
export const PUBLIC_CATALOGUE_CART_KEY = "hd_public_catalogue_cart_v1";

export function loadPublicCatalogueCart() {
  try {
    const raw = sessionStorage.getItem(PUBLIC_CATALOGUE_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePublicCatalogueCart(cart) {
  try {
    sessionStorage.setItem(PUBLIC_CATALOGUE_CART_KEY, JSON.stringify(cart));
  } catch {
    /* ignore quota / private mode */
  }
}
