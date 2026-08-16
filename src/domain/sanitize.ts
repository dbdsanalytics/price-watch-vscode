/**
 * Rohe Fehlermeldungen (Fetch, Secret-Store, Persistenz, Accounts) koennen
 * Secrets enthalten — etwa API-Keys hinter "Bearer" oder als sk-…-Token.
 * Typische Muster werden maskiert, bevor der Text im Panel, der StatusBar
 * oder einem Attention-Streifen landet.
 */
export function sanitizeErrorText(text: string): string {
  return text.replace(/sk-[A-Za-z0-9]{16,}/g, "***").replace(/Bearer\s+[A-Za-z0-9._-]{10,}/g, "***")
}