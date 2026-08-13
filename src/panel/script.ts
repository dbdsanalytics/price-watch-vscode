/**
 * Laeuft im Webview und wird unter der CSP mit Nonce eingebettet — deshalb eine
 * Zeichenkette und keine gebuendelte Datei.
 */
export const SCRIPT = `
const vscode = acquireVsCodeApi()
const shown = {}

const show = (id) => {
  document.querySelectorAll('.view').forEach((view) => { view.hidden = view.id !== id })
  document.querySelectorAll('[data-view]').forEach((button) => { button.classList.toggle('active', button.dataset.view === id) })
  scrollTo(0, 0)
}
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => show(button.dataset.view)))
document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => vscode.postMessage({ type: button.dataset.action })))

const applyFilter = () => {
  const q = search.value.toLowerCase(), p = provider.value, c = price.value, u = purpose.value
  document.querySelectorAll('[data-model]').forEach((row) => {
    row.hidden = !(row.dataset.model.includes(q) && (!p || row.dataset.provider === p) && (!c || row.dataset.price === c) && (!u || row.dataset.model.includes(u)))
  })
}
;['search', 'provider', 'price', 'purpose'].forEach((id) => document.getElementById(id).addEventListener(id === 'search' ? 'input' : 'change', applyFilter))

// Ein Tausch verwirft den Inhalt samt aufgeklappten Bereichen und der
// Scrollposition der Tabelle. Beides wird um den Tausch herum gerettet.
const replaceFragment = (id, html) => {
  const host = document.querySelector('[data-fragment="' + id + '"]')
  if (!host) return
  const open = new Set()
  host.querySelectorAll('details[open][data-key]').forEach((item) => open.add(item.dataset.key))
  const wrap = host.closest('.table-wrap'), wrapTop = wrap ? wrap.scrollTop : 0
  const pageTop = window.scrollY
  host.innerHTML = html
  host.querySelectorAll('details[data-key]').forEach((item) => { if (open.has(item.dataset.key)) item.open = true })
  if (wrap) wrap.scrollTop = wrapTop
  window.scrollTo(0, pageTop)
}

window.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'fragments') return
  for (const [id, html] of Object.entries(event.data.fragments)) {
    // Gleicher Inhalt heisst: nichts anfassen. Das ist der Regelfall beim
    // stuendlichen Abruf und der Grund, warum die Bedienung stehen bleibt.
    if (shown[id] === html) continue
    shown[id] = html
    replaceFragment(id, html)
  }
  applyFilter()
})

// Ohne diese Meldung bliebe "shown" bis zum ersten Abruf leer — der wuerde
// dann alle Fragmente tauschen, obwohl ihr Inhalt schon im Dokument steht,
// und die Bedienung genau einmal doch wegwerfen.
vscode.postMessage({ type: 'ready' })
`
