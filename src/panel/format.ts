export const esc = (value: unknown) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")
export const count = (value: number) => new Intl.NumberFormat("de-DE").format(value)
export const amount = (value: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 4 }).format(value)
export const money = (value: number) => `${amount(value)} $`
export const stamp = (at: number) => new Date(at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })
