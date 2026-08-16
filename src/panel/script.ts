/**
 * Laeuft im Webview und wird unter der CSP mit Nonce eingebettet — deshalb eine
 * Zeichenkette und keine gebuendelte Datei.
 */
export const SCRIPT = `
const vscode = acquireVsCodeApi()
const shown = {}

// Verwirft VS Code das Webview — Tab lange im Hintergrund, Fenster neu geladen —,
// baut es die Seite von vorn auf. retainContextWhenHidden hilft nur innerhalb
// einer Sitzung, dieser Zustand ueberdauert sie.
const save = () => vscode.setState({
  view: [...document.querySelectorAll('.view')].find((view) => !view.hidden)?.id ?? 'overview',
  search: search.value, provider: provider.value, price: price.value, purpose: purpose.value,
  favoritesOnly: document.getElementById('favorites-only')?.getAttribute('aria-pressed') ?? 'false',
})

const show = (id) => {
  document.querySelectorAll('.view').forEach((view) => { view.hidden = view.id !== id })
  document.querySelectorAll('[data-view]').forEach((button) => {
    const isActive = button.dataset.view === id
    button.classList.toggle('active', isActive)
    if (isActive) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current')
  })
  scrollTo(0, 0)
  // Fokuslandung nur, wenn das Dokument den Fokus bereits hat – sonst wuerde ein
  // Restore beim Laden den Fokus in die Kopfzeile reissen. Nach einem Klick ist
  // der Tab ohnehin schon fokussiert, der Aufruf ist dann ein No-op.
  if (document.hasFocus()) {
    const active = document.querySelector('nav [data-view].active')
    if (active instanceof HTMLElement) active.focus()
  }
  save()
}
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => show(button.dataset.view)))
// [data-action]-Buttons senden ihren Typ als Nachricht an die Extension. Der
// Listener muss nach jedem Fragment-Tausch neu gebunden werden, weil
// host.innerHTML = html die alten Elemente (mitsamt ihren Listenern) verwirft
// und durch neue, ungebundene Elemente ersetzt. bindActions wird deshalb auch
// in replaceFragment fuer den getauschten Host aufgerufen.
//
// offerKey-Anhang: Buttons mit data-offer-key (z. B. der Stern-Button) legen
// den offerKey (provider:id) mit in die Nachricht, damit die Extension weiss,
// welcher Offer gemeint ist. Buttons ohne data-offer-key senden weiter nur den
// Typ — kein neues Verhalten. Die if/else-Form statt Spread-Syntax haelt den
// von den Panel-Tests geprueften Substring postMessage({ type: ... }) intakt.
const bindActions = (root) => root.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.offerKey) vscode.postMessage({ type: button.dataset.action, offerKey: button.dataset.offerKey })
  else vscode.postMessage({ type: button.dataset.action })
}))
bindActions(document)

// --- Modelle-Tabelle: Filter -> Sortieren -> Paginieren ---------------------
// Bei hunderten OpenRouter-Modellen wuerde ein input-Event pro Tastendruck
// ueber alle Zeilen iterieren — deshalb Debounce, und deshalb werden pro Seite
// nur PAGE_SIZE Zeilen sichtbar gezeigt (hidden, nicht entfernt).
const PAGE_SIZE = 100
let page = 1
let sortKey = 'name'     // 'name' | 'input' | 'output' | 'benchmark'
let sortDir = 'asc'      // 'asc' | 'desc'

const matchRow = (row) => {
  const q = search.value.toLowerCase(), p = provider.value, c = price.value, u = purpose.value
  // Favoriten-Filter: nur Zeilen mit data-favorite="true" zeigen, wenn der
  // Umschalter aktiv ist. UND-Verknuepfung mit den bestehenden Such-/Anbieter-/
  // Preis-/Fähigkeitsfiltern. data-favorite liegt auf dem Stern-Button (Kind
  // der Zeile), deshalb querySelector statt row.dataset.favorite.
  const favOnly = document.getElementById('favorites-only')?.getAttribute('aria-pressed') === 'true'
  return row.dataset.model.includes(q) && (!p || row.dataset.provider === p) && (!c || row.dataset.price === c) && (!u || row.dataset.model.includes(u)) && (!favOnly || row.querySelector('[data-favorite="true"]') !== null)
}
const sortValue = (row, key) => key === 'name' ? (row.dataset.name ?? '') : Number(row.dataset[key] ?? 0)

const applyFilter = () => {
  const rows = [...document.querySelectorAll('[data-model]')]
  let visible = 0
  rows.forEach((row) => { const m = matchRow(row); row._m = m; if (m) visible++ })
  // Leerer tbody sah bisher aus wie "keine Daten" — dabei war nur der Filter
  // zu streng. Die bereitliegende Empty-Zeile wird sichtbar, sobald keine
  // Modellzeile mehr matched, und verdeckt sonst.
  const emptyFilter = document.querySelector('[data-empty-filter]')
  if (emptyFilter instanceof HTMLElement) emptyFilter.hidden = visible > 0
  // Sortieren: nur die gefilterten Zeilen nach dem aktiven Kriterium.
  const matched = rows.filter((row) => row._m).sort((a, b) => {
    const va = sortValue(a, sortKey), vb = sortValue(b, sortKey)
    const cmp = sortKey === 'name'
      ? String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' })
      : va - vb
    return sortDir === 'asc' ? cmp : -cmp
  })
  // DOM-Reihenfolge anpassen; die Empty-Zeile bleibt immer zuletzt.
  const tbody = document.querySelector('[data-fragment="models"]')
  const tail = document.querySelector('[data-empty-filter]')
  if (tbody && tail) matched.forEach((row) => tbody.insertBefore(row, tail))
  // Paginieren: Seite X von Y, maximal PAGE_SIZE sichtbar.
  const pages = Math.max(1, Math.ceil(visible / PAGE_SIZE))
  if (page > pages) page = pages
  if (page < 1) page = 1
  const start = (page - 1) * PAGE_SIZE
  matched.forEach((row, i) => { row.hidden = i < start || i >= start + PAGE_SIZE })
  rows.forEach((row) => { if (!row._m) row.hidden = true })
  renderPagination(visible, pages)
  save()
}

const renderPagination = (total, pages) => {
  const host = document.getElementById('models')
  let bar = host ? host.querySelector('.pagination') : null
  if (!bar) {
    bar = document.createElement('div')
    bar.className = 'pagination'
    bar.setAttribute('role', 'navigation')
    bar.setAttribute('aria-label', 'Modell-Seiten Navigation')
    if (host) host.appendChild(bar)
  }
  // Bis PAGE_SIZE braucht es keine Blaetterung.
  if (total <= PAGE_SIZE) { bar.hidden = true; bar.replaceChildren(); return }
  bar.hidden = false
  const prev = document.createElement('button')
  prev.type = 'button'
  prev.textContent = 'Zurück'
  prev.setAttribute('aria-label', 'Vorherige Modellseite')
  prev.disabled = page <= 1
  prev.addEventListener('click', () => { page = Math.max(1, page - 1); applyFilter() })
  const info = document.createElement('span')
  info.textContent = 'Seite ' + page + ' von ' + pages
  info.setAttribute('aria-live', 'polite')
  const next = document.createElement('button')
  next.type = 'button'
  next.textContent = 'Weiter'
  next.setAttribute('aria-label', 'Nächste Modellseite')
  next.disabled = page >= pages
  next.addEventListener('click', () => { page = Math.min(pages, page + 1); applyFilter() })
  bar.replaceChildren(prev, info, next)
}

// Sortier-Köpfe: die <th>-Zellen liegen ausserhalb des getauschten Fragments
// (das Fragment ist das tbody) und bekommen data-sort/aria-sort erst hier im
// Skript — panelHtml/index.ts bleibt unangetastet. Spalten: Modell(0),
// Input(2), Output(3), Benchmark(5). Klick: asc -> desc -> Default (Name asc).
const SORT_COLUMNS = [['name', 0], ['input', 2], ['output', 3], ['benchmark', 5]]
const updateSortAria = () => {
  document.querySelectorAll('#models thead [data-sort]').forEach((th) => {
    if (th.dataset.sort === sortKey) th.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending')
    else th.removeAttribute('aria-sort')
  })
}
const toggleSort = (key) => {
  if (sortKey === key && sortDir === 'asc') sortDir = 'desc'
  else if (sortKey === key && sortDir === 'desc') { sortKey = 'name'; sortDir = 'asc' }
  else { sortKey = key; sortDir = 'asc' }
  page = 1
  updateSortAria()
  applyFilter()
}
const initSortHeaders = () => {
  const ths = document.querySelectorAll('#models thead th')
  if (!ths.length) return
  SORT_COLUMNS.forEach(([key, idx]) => {
    const th = ths[idx]
    if (!th) return
    th.setAttribute('data-sort', key)
    th.setAttribute('tabindex', '0')
    th.addEventListener('click', () => toggleSort(key))
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(key) } })
  })
  updateSortAria()
}

// Debounce: ein input-Event pro Tastendruck waere bei hunderten Zeilen spuerbar
// — 150 ms reichen, ohne die Eingabe träge wirken zu lassen. clearTimeout/
// setTimeout machen die Mechanik im Skripttext pruefbar.
let filterTimer = null
const scheduleFilter = () => { clearTimeout(filterTimer); filterTimer = setTimeout(() => { page = 1; applyFilter() }, 150) }
document.getElementById('search').addEventListener('input', scheduleFilter)
;['provider', 'price', 'purpose'].forEach((id) => document.getElementById(id).addEventListener('change', () => { page = 1; applyFilter() }))

// "Nur Favoriten"-Umschalter: Klick schaltet aria-pressed um und filtert neu,
// beginnend wieder auf Seite 1 (wie die Selects). aria-pressed ist fuer
// Toggle-Buttons das korrekte Zustandsattribut (nicht aria-checked).
const favToggle = document.getElementById('favorites-only')
if (favToggle) favToggle.addEventListener('click', () => {
  const on = favToggle.getAttribute('aria-pressed') === 'true'
  favToggle.setAttribute('aria-pressed', on ? 'false' : 'true')
  page = 1
  applyFilter()
})

initSortHeaders()

const applyHistoryFilter = () => {
  const q = document.getElementById('history-search').value.toLowerCase()
  const p = document.getElementById('history-provider').value
  const cutoff = Date.now() - Number(document.getElementById('history-range').value) * 86400000
  document.querySelectorAll('[data-change]').forEach((row) => {
    row.hidden = !(row.dataset.change.includes(q) && (!p || row.dataset.provider === p) && Number(row.dataset.at) >= cutoff)
  })
}
;['history-search', 'history-provider', 'history-range'].forEach((id) => document.getElementById(id).addEventListener(id === 'history-search' ? 'input' : 'change', applyHistoryFilter))

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
  bindActions(host)
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
  // Ein getauschtes Verlaufsfragment zeigte sonst wieder alle Zeilen.
  applyHistoryFilter()
})

const restore = () => {
  const saved = vscode.getState()
  if (!saved) return
  search.value = saved.search ?? ''
  provider.value = saved.provider ?? ''
  price.value = saved.price ?? ''
  purpose.value = saved.purpose ?? ''
  const favEl = document.getElementById('favorites-only')
  if (favEl && saved.favoritesOnly === 'true') favEl.setAttribute('aria-pressed', 'true')
  applyFilter()
  if (saved.view) show(saved.view)
}
restore()

// Ohne diese Meldung bliebe "shown" bis zum ersten Abruf leer — der wuerde
// dann alle Fragmente tauschen, obwohl ihr Inhalt schon im Dokument steht,
// und die Bedienung genau einmal doch wegwerfen.
vscode.postMessage({ type: 'ready' })
`
