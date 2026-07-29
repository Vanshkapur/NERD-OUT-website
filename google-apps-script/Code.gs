const SPREADSHEET_ID = getRequiredProperty_('SUBSTACK_SPREADSHEET_ID')
const SHEET_NAME = PropertiesService.getScriptProperties().getProperty('SUBSTACK_SHEET_NAME') || ''
const STATUS_HEADER = PropertiesService.getScriptProperties().getProperty('SUBSTACK_STATUS_HEADER') || 'Status'

function doGet() {
  return jsonResponse_({ ok: true, message: 'Substack swipe script is live.' })
}

function doPost(event) {
  const lock = LockService.getScriptLock()
  lock.waitLock(10000)

  try {
    const payload = JSON.parse((event && event.postData && event.postData.contents) || '{}')
    if (payload.action !== 'updateStatus') throw new Error('Unsupported action.')

    const article = payload.article || {}
    const status = normalizeStatus_(payload.status)
    const rowNumber = Number(article.rowNumber)

    if (!rowNumber || rowNumber < 2) throw new Error('A valid rowNumber is required.')

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    const sheet = SHEET_NAME ? spreadsheet.getSheetByName(SHEET_NAME) : spreadsheet.getSheets()[0]
    if (!sheet) throw new Error('No sheet was found in the spreadsheet.')

    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    const statusColumn = headerRow.findIndex((header) => String(header).trim().toLowerCase() === STATUS_HEADER.toLowerCase()) + 1
    if (!statusColumn) throw new Error('Status column was not found.')

    sheet.getRange(rowNumber, statusColumn).setValue(status)

    return jsonResponse_({ ok: true, rowNumber, status })
  } catch (error) {
    return jsonResponse_({ ok: false, error: error.message })
  } finally {
    lock.releaseLock()
  }
}

function normalizeStatus_(status) {
  const clean = String(status || '').trim().toLowerCase()
  if (clean === 'read later' || clean === 'later') return 'Read Later'
  if (clean === 'read' || clean === 'done') return 'Read'
  if (clean === 'not interested' || clean === 'skip') return 'Not Interested'
  return 'Unread'
}

function getRequiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name)
  if (!value) throw new Error('Missing script property: ' + name)
  return value
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON)
}
