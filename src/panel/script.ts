/**
 * Laeuft im Webview und wird unter der CSP mit Nonce eingebettet — deshalb eine
 * Zeichenkette und keine gebuendelte Datei.
 */
export const SCRIPT = `
const vscode = acquireVsCodeApi()
const shown = {}

// HTML-Maskierung fuer dynamische Werte, die per innerHTML eingesetzt werden
// (z. B. die Vergleichstabelle). Entspricht esc() in src/panel/format.ts;
// hier lokal im Skript, weil der Webview-Code keine gebuendelte Datei ist.
const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

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

// --- Modellvergleich (Side-by-Side, rein lokal) ---------------------------
// Der Vergleich ist ein reines Panel-Feature: keine Extension-Message, kein
// Backend, kein save()/restore(). selectedKeys ist bewusst fluechtiger
// Sitzungszustand — ein Neuaufbau des Webview verwirft ihn. Die Auswahl
// ueberlebt dagegen Filter/Sortierung/Paginierung, weil sie auf dem
// offerKey (provider:id) liegt und applyCompare nach jedem Fragment-Tausch
// die aria-pressed-Zustaende und die .selected-Markierung neu traegt.
// MAX_COMPARE=3: bei drei ausgewaehlten Modellen ist der Vergleich voll, der
// Warn-Hinweis wird sichtbar und weitere Klicks auf nicht ausgewaehlte
// Modelle werden ignoriert (zunaechst eine Auswahl aufheben). Diese "ignorieren"
// -Regel ist die einfachere, klare Variante gegenuer dem automatischen
// Verdraengen des aeltesten Modells.
const MAX_COMPARE = 3
const selectedKeys = []
let compareOpen = false
// offersData: offerKey -> Compare-Payload (aus data-offer der Buttons). Nach
// jedem Fragment-Tausch neu befuellt, weil die Buttons verworfen/neu erzeugt
// werden — die Payloads muessen immer frisch aus dem DOM gelesen werden.
const offersData = {}

const bindCompareToggles = (root) => root.querySelectorAll('[data-compare-toggle]').forEach((btn) => {
  // try/catch: ein defekter/verstümmelter data-offer-Payload darf das Skript
  // nicht zum Abbruch bringen — der betroffene Button wird übersprungen, die
  // übrigen Vergleichs-Buttons funktionieren weiter.
  try {
    if (btn.dataset.offer) offersData[btn.dataset.offerKey] = JSON.parse(btn.dataset.offer)
  } catch (e) { console.warn('compare payload unparseable', btn.dataset.offerKey, e) }
  btn.addEventListener('click', () => {
    const key = btn.dataset.offerKey
    const i = selectedKeys.indexOf(key)
    if (i >= 0) selectedKeys.splice(i, 1)
    else if (selectedKeys.length < MAX_COMPARE) selectedKeys.push(key)
    // else: Maximum erreicht — Klick ignoriert; der Warn-Hinweis in der Leiste
    // erklaert, warum nichts passiert. Kein automatisches Verdraengen.
    applyCompare()
  })
})
bindCompareToggles(document)

const renderCompareBar = () => {
  const bar = document.getElementById('compare-bar')
  if (!bar) return
  const n = selectedKeys.length
  if (n === 0) { bar.hidden = true; bar.replaceChildren(); return }
  bar.hidden = false
  const open = document.createElement('button')
  open.type = 'button'
  const label = n + ' Modell' + (n === 1 ? '' : 'e') + ' vergleichen'
  open.textContent = label
  open.setAttribute('aria-label', label)
  open.disabled = n < 2
  open.title = n < 2 ? 'Mindestens 2 Modelle auswählen' : 'Vergleich öffnen'
  open.addEventListener('click', () => { if (selectedKeys.length >= 2) { compareOpen = true; renderCompareView() } })
  const clear = document.createElement('button')
  clear.type = 'button'
  clear.textContent = '✕'
  clear.setAttribute('aria-label', 'Vergleichsauswahl leeren')
  clear.title = 'Auswahl leeren'
  clear.addEventListener('click', () => { selectedKeys.length = 0; applyCompare() })
  bar.replaceChildren(open, clear)
  if (n >= MAX_COMPARE) {
    const warn = document.createElement('small')
    warn.className = 'compare-warn'
    warn.textContent = 'Maximal 3 Modelle vergleichbar — zuerst eine Auswahl aufheben.'
    bar.appendChild(warn)
  }
}

const COMPARE_ROWS = [
  ['Anbieter', 'provider'], ['Kontextlänge', 'ctx'], ['Eingabe / 1M', 'input'], ['Ausgabe / 1M', 'output'],
  ['Modalitäten', 'modalities'], ['Tools', 'tools'], ['Reasoning', 'reasoning'],
  ['Benchmark · Intelligenz', 'bi'], ['Benchmark · Coding', 'bc'], ['Benchmark · Agentic', 'ba'], ['Top-Benchmarks', 'details'],
]
const renderCompareView = () => {
  const host = document.getElementById('compare-view')
  if (!host) return
  if (!compareOpen || selectedKeys.length < 2) { host.hidden = true; host.replaceChildren(); return }
  const cols = selectedKeys.map((k) => offersData[k]).filter(Boolean)
  if (cols.length < 2) { host.hidden = true; host.replaceChildren(); return }
  // esc() an JEDEM dynamischen Wert: die Payloads liegen roh in data-offer
  // (comparePayload esc()'t nicht mehr), deshalb muss die Tabelle hier
  // maskieren — sonst waere ein Modellname wie a<b ein XSS-Vektor. Die
  // Zeilenlabels (row[0]) und "Eigenschaft" sind statische Literale.
  const head = '<tr><th scope="col">Eigenschaft</th>' + cols.map((c) => '<th scope="col">' + esc(c.name) + '<br><small>' + esc(c.provider) + '</small></th>').join('') + '</tr>'
  const body = COMPARE_ROWS.map((row) => '<tr><th scope="row">' + row[0] + '</th>' + cols.map((c) => '<td>' + esc(c[row[1]]) + '</td>').join('') + '</tr>').join('')
  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = 'Schließen'
  close.setAttribute('aria-label', 'Vergleichsansicht schließen')
  close.addEventListener('click', () => { compareOpen = false; renderCompareView() })
  const head2 = document.createElement('div')
  head2.className = 'compare-head'
  const h2 = document.createElement('h2')
  h2.textContent = 'Modellvergleich'
  head2.replaceChildren(h2, close)
  const wrap = document.createElement('div')
  wrap.className = 'compare-table-wrap'
  wrap.innerHTML = '<table class="compare-table" aria-label="Modellvergleich"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>'
  host.hidden = false
  host.replaceChildren(head2, wrap)
}

const applyCompare = () => {
  document.querySelectorAll('[data-compare-toggle]').forEach((btn) => {
    const on = selectedKeys.includes(btn.dataset.offerKey)
    btn.setAttribute('aria-pressed', on ? 'true' : 'false')
    const row = btn.closest('[data-model]')
    if (row) row.classList.toggle('selected', on)
  })
  renderCompareBar()
  if (compareOpen) renderCompareView()
}
applyCompare()

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
  // Modellvergleich: die Vergleichs-Buttons liegen im models-Fragment und
  // werden mit dem Tausch verworfen. Nur fuer das models-Fragment neu binden
  // und die Auswahl-Zustaende wiederherstellen (Leiste/Ansicht stehen
  // ausserhalb des Fragments und ueberleben den Tausch unveraendert).
  if (id === 'models') { bindCompareToggles(host); applyCompare() }
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
