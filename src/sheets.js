export const SHEET_ID = import.meta.env.VITE_SUBSTACK_SHEET_ID || ''
export const ARTICLES_GID = import.meta.env.VITE_SUBSTACK_SHEET_GID || '0'
export const TASK_WRITE_URL = import.meta.env.VITE_SUBSTACK_API_URL || ''

export const READABLE_STATUSES = [
  { key: 'unread', label: 'Unread' },
  { key: 'readLater', label: 'Read Later' },
  { key: 'read', label: 'Read' },
  { key: 'notInterested', label: 'Not Interested' },
]

export const STATUS_META = Object.fromEntries(READABLE_STATUSES.map((status) => [status.key, status]))

function parseCsv(csv) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    const next = csv[index + 1]

    if (char === '"' && quoted && next === '"') {
      value += '"'
      index += 1
    } else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) {
      row.push(value)
      value = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1
      row.push(value)
      if (row.some((cell) => String(cell || '').trim() !== '')) rows.push(row)
      row = []
      value = ''
    } else value += char
  }

  if (value || row.length) {
    row.push(value)
    if (row.some((cell) => String(cell || '').trim() !== '')) rows.push(row)
  }

  return rows
}

function normalizeDateValue(value) {
  if (!value) return ''
  const clean = String(value).trim()
  const dateMatch = clean.match(/^Date\((\d+),(\d+),(\d+)\)$/)
  if (!dateMatch) return clean
  const year = Number(dateMatch[1])
  const month = String(Number(dateMatch[2]) + 1).padStart(2, '0')
  const day = String(Number(dateMatch[3])).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateToTime(value) {
  const clean = normalizeDateValue(value)
  if (!clean) return 0
  const parsed = new Date(clean)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

export function statusKeyFromValue(value) {
  const clean = String(value || '').trim().toLowerCase()
  if (clean === 'read later' || clean === 'later' || clean === 'read_later') return 'readLater'
  if (clean === 'read' || clean === 'done' || clean === 'finished') return 'read'
  if (clean === 'not interested' || clean === 'skip' || clean === 'archive') return 'notInterested'
  return 'unread'
}

function splitTags(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function rowsToArticles(rows) {
  if (!rows.length) return []

  const headers = rows[0].map((header) => String(header || '').trim().toLowerCase())
  const findIndex = (...names) => headers.findIndex((header) => names.includes(header))

  const serialIndex = findIndex('s.no', 'serial', 'no')
  const discoveryIndex = findIndex('discovery date', 'date')
  const titleIndex = findIndex('article title', 'title')
  const authorIndex = findIndex('author')
  const publishedIndex = findIndex('published', 'publish date')
  const linkIndex = findIndex('article link', 'link', 'url')
  const tagsIndex = findIndex('tags')
  const summaryIndex = findIndex('summary')
  const statusIndex = findIndex('status')

  return rows
    .slice(1)
    .map((row, rowIndex) => {
      const title = String(row[titleIndex] || '').trim()
      if (!title) return null

      const discoveryDate = normalizeDateValue(row[discoveryIndex] || '')
      const published = normalizeDateValue(row[publishedIndex] || '')
      const statusKey = statusKeyFromValue(row[statusIndex] || '')

      return {
        id: `sheet-${rowIndex + 2}`,
        rowNumber: rowIndex + 2,
        serial: String(row[serialIndex] || rowIndex + 1).trim(),
        discoveryDate,
        title,
        author: String(row[authorIndex] || 'Unknown author').trim(),
        published,
        link: String(row[linkIndex] || '').trim(),
        tags: splitTags(row[tagsIndex]),
        summary: String(row[summaryIndex] || '').trim(),
        statusKey,
        status: STATUS_META[statusKey].label,
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      const dateDelta = parseDateToTime(right.discoveryDate) - parseDateToTime(left.discoveryDate)
      if (dateDelta !== 0) return dateDelta
      return Number(right.serial || 0) - Number(left.serial || 0)
    })
}

function dataTableToRows(table) {
  const headers = (table?.cols || []).map((column) => column.label || column.id || '')
  const rows = (table?.rows || []).map(({ c = [] }) => c.map((cell) => {
    if (!cell) return ''
    if (cell.f !== undefined && cell.f !== null) return String(cell.f)
    if (typeof cell.v === 'boolean') return cell.v ? 'TRUE' : 'FALSE'
    if (typeof cell.v === 'string' && cell.v.startsWith('Date(')) return normalizeDateValue(cell.v)
    return cell.v === undefined || cell.v === null ? '' : String(cell.v)
  }))
  return [headers, ...rows]
}

function fetchViaScript(gid, transform, signal) {
  return new Promise((resolve, reject) => {
    const callbackName = `substackSheet_${gid}_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')
    let settled = false

    const cleanup = () => {
      script.remove()
      delete window[callbackName]
      signal?.removeEventListener('abort', abort)
    }

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      cleanup()
      callback(value)
    }

    const abort = () => finish(reject, new DOMException('Request aborted', 'AbortError'))

    window[callbackName] = (response) => {
      if (response?.status === 'error') {
        finish(reject, new Error(response.errors?.[0]?.detailed_message || 'Google Sheets returned an error.'))
      } else finish(resolve, transform(dataTableToRows(response?.table)))
    }

    script.onerror = () => finish(reject, new Error('The Google Sheet could not be reached.'))
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${gid}&tqx=responseHandler:${callbackName};out:json&_=${Date.now()}`
    signal?.addEventListener('abort', abort, { once: true })
    document.head.appendChild(script)
  })
}

async function fetchSheet(gid, transform, signal) {
  if (!SHEET_ID) {
    throw new Error('Set VITE_SUBSTACK_SHEET_ID before loading the deck.')
  }

  let lastError

  try {
    return await fetchViaScript(gid, transform, signal)
  } catch (error) {
    if (error.name === 'AbortError') throw error
    lastError = error
  }

  const endpoints = [
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}&_=${Date.now()}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}&_=${Date.now()}`,
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { signal, cache: 'no-store' })
      if (!response.ok) throw new Error(`Google Sheets returned ${response.status}.`)
      const body = await response.text()
      if (/<!doctype html|<html/i.test(body)) throw new Error('The sheet is not publicly readable.')
      return transform(parseCsv(body))
    } catch (error) {
      if (error.name === 'AbortError') throw error
      lastError = error
    }
  }

  throw new Error(`${lastError?.message || 'Could not load the sheet.'} Make sure Anyone with the link can view it.`)
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function writeRequest(action, article, status, signal) {
  if (!TASK_WRITE_URL) {
    const error = new Error('Set VITE_SUBSTACK_API_URL to connect status updates to Google Sheets.')
    error.code = 'NO_WRITE_ENDPOINT'
    throw error
  }

  await fetch(TASK_WRITE_URL, {
    method: 'POST',
    mode: 'no-cors',
    cache: 'no-store',
    signal,
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, article: { rowNumber: article.rowNumber, title: article.title }, status }),
  })

  await wait(700)
  return { ok: true }
}

export function readSavedStatusMap() {
  try {
    return JSON.parse(window.localStorage.getItem('substack-swipe-statuses') || '{}')
  } catch {
    return {}
  }
}

export function fetchArticles(signal) {
  return fetchSheet(ARTICLES_GID, rowsToArticles, signal)
}

export function updateArticleStatus(article, status, signal) {
  return writeRequest('updateStatus', article, status, signal)
}
