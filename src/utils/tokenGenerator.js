// Générer un token unique pour les demandes client
export function generateRequestToken() {
  // Générer un token aléatoire de 32 caractères (base64url)
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  const base64 = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return base64;
}

// Générer un lien complet pour une demande client
export function generateRequestLink(token) {
  const baseUrl = window.location.origin;
  return `${baseUrl}/request/${token}`;
}

