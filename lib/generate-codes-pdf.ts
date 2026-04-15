// Client-side PDF generator for the access-codes control sheet.
//
// Produces a printable A4 sheet designed to be handed out in person — dark
// banner with the group name + logo (on-brand club-night look), then a
// clean white body with a correlative + monospace code + dotted handwrite
// line for "Asignado a".
//
// Intentionally free of React / Next / Supabase deps so it can be
// lazy-imported from any client component.

import jsPDF from 'jspdf'

// ──────────────────────────────────────────────────────────────────────────
// Brand palette — matches app's --primary and bg-[#0a0a0a]
// ──────────────────────────────────────────────────────────────────────────
const BRAND_RED: [number, number, number] = [228, 30, 43] // #E41E2B
const BRAND_DARK: [number, number, number] = [10, 10, 10] // #0a0a0a
const WHITE: [number, number, number] = [255, 255, 255]
const WHITE_SOFT: [number, number, number] = [210, 210, 212]
const TEXT: [number, number, number] = [28, 28, 30]
const MUTED: [number, number, number] = [140, 140, 145]
const LINE: [number, number, number] = [222, 222, 225]

// ──────────────────────────────────────────────────────────────────────────
// Layout constants — A4 portrait in mm
// ──────────────────────────────────────────────────────────────────────────
const PAGE_W = 210
const PAGE_H = 297
const BODY_X = 15
const BANNER_H = 48

// 25 rows × 8mm each fits between banner and footer with breathing room
const ROW_H = 8
const ROWS_PER_PAGE = 25

// ──────────────────────────────────────────────────────────────────────────
// Color helpers — jsPDF's color setters are variadic, these keep call sites
// readable and TypeScript-happy without tuple spread.
// ──────────────────────────────────────────────────────────────────────────
const fill = (doc: jsPDF, c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2])
const stroke = (doc: jsPDF, c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2])
const text = (doc: jsPDF, c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2])

// ──────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ──────────────────────────────────────────────────────────────────────────
function formatCode(code: string): string {
  return code.length === 8 ? code.slice(0, 4) + '-' + code.slice(4) : code
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatHeaderDate(raw: string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatFilenameDate(raw: string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return 'sin-fecha'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// jsPDF's setLineDashPattern API has shifted across versions; drawing short
// solid segments manually is smaller and version-proof.
function drawDottedLine(doc: jsPDF, x1: number, y: number, x2: number) {
  const dash = 0.6
  const gap = 1.4
  for (let x = x1; x < x2; x += dash + gap) {
    doc.line(x, y, Math.min(x + dash, x2), y)
  }
}

// Same-origin PNG/SVG can be loaded via <img> + canvas → data URL. For
// cross-origin URLs without CORS we silently skip the logo.
function loadImageAsDataUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || img.width
        canvas.height = img.naturalHeight || img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('no canvas ctx'))
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────────────────────────────────
export async function generateCodesPdf(
  eventName: string,
  eventDate: string,
  codes: string[],
  logoUrl?: string,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const headerDate = formatHeaderDate(eventDate)
  const totalPages = Math.max(1, Math.ceil(codes.length / ROWS_PER_PAGE))

  // Load logo up-front. If it fails (404, CORS, etc.) we fall back to a
  // red "PX" monogram so the banner never looks broken.
  let logoDataUrl: string | null = null
  if (logoUrl) {
    try {
      logoDataUrl = await loadImageAsDataUrl(logoUrl)
    } catch {
      logoDataUrl = null
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Full-bleed dark banner with logo, event name, date, and code count
  // ────────────────────────────────────────────────────────────────────
  const drawBanner = () => {
    // Dark backdrop
    fill(doc, BRAND_DARK)
    doc.rect(0, 0, PAGE_W, BANNER_H, 'F')

    // 2mm red strip at the bottom of the banner — brand signature
    fill(doc, BRAND_RED)
    doc.rect(0, BANNER_H - 2, PAGE_W, 2, 'F')

    // Logo (or PX monogram fallback) on the left
    const logoSize = 18
    const logoY = (BANNER_H - 2 - logoSize) / 2
    let leftTextX = BODY_X
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'PNG', BODY_X, logoY, logoSize, logoSize)
        leftTextX = BODY_X + logoSize + 6
      } catch {
        // fall through to monogram
      }
    }
    if (leftTextX === BODY_X) {
      fill(doc, BRAND_RED)
      doc.rect(BODY_X, logoY, logoSize, logoSize, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      text(doc, WHITE)
      doc.text('PX', BODY_X + logoSize / 2, logoY + logoSize / 2 + 2, { align: 'center' })
      leftTextX = BODY_X + logoSize + 6
    }

    // Event name (big, white, bold)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    text(doc, WHITE)
    // Truncate gracefully if the name is absurdly long
    const maxTitleW = PAGE_W - leftTextX - 40
    let title = eventName
    while (doc.getTextWidth(title) > maxTitleW && title.length > 3) {
      title = title.slice(0, -1)
    }
    if (title !== eventName) title = title.slice(0, -1) + '…'
    doc.text(title, leftTextX, 25)

    // Date below (uppercase letter-spaced for a "premium" feel)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    text(doc, WHITE_SOFT)
    doc.text(headerDate.toUpperCase(), leftTextX, 33, { charSpace: 0.5 })

    // Right side: CÓDIGOS label + big number
    const rightX = PAGE_W - BODY_X
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    text(doc, WHITE_SOFT)
    const label = 'CÓDIGOS'
    const labelW = doc.getTextWidth(label) + label.length * 0.6
    doc.text(label, rightX - labelW, 19, { charSpace: 0.6 })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(24)
    text(doc, WHITE)
    const countText = String(codes.length).padStart(2, '0')
    const countW = doc.getTextWidth(countText)
    doc.text(countText, rightX - countW, 32)
  }

  // ────────────────────────────────────────────────────────────────────
  // Body: section title, column headers, and the rows for this page
  // ────────────────────────────────────────────────────────────────────
  const drawBody = (pageIdx: number) => {
    const startRow = pageIdx * ROWS_PER_PAGE
    const endRow = Math.min(startRow + ROWS_PER_PAGE, codes.length)

    // Red accent bar + section title
    const titleY = 62
    fill(doc, BRAND_RED)
    doc.rect(BODY_X, titleY - 3.5, 1.2, 4.5, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    text(doc, BRAND_RED)
    doc.text('HOJA DE CONTROL', BODY_X + 3.5, titleY, { charSpace: 0.7 })

    // Tiny helper text on the right — what this sheet is for
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    text(doc, MUTED)
    const helperText = 'Apunta a quien entregas cada codigo'
    const helperW = doc.getTextWidth(helperText)
    doc.text(helperText, PAGE_W - BODY_X - helperW, titleY, { charSpace: 0.3 })

    // Column headers
    const headerY = 72
    const colNumX = BODY_X
    const colCodeX = BODY_X + 14
    const colNameX = BODY_X + 58
    const colNameEndX = PAGE_W - BODY_X

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    text(doc, MUTED)
    doc.text('#', colNumX, headerY, { charSpace: 0.5 })
    doc.text('CÓDIGO', colCodeX, headerY, { charSpace: 0.5 })
    doc.text('ASIGNADO A', colNameX, headerY, { charSpace: 0.5 })

    // Divider under headers
    stroke(doc, LINE)
    doc.setLineWidth(0.25)
    doc.line(BODY_X, headerY + 2.5, PAGE_W - BODY_X, headerY + 2.5)

    // Rows
    const firstRowY = 82
    for (let i = startRow; i < endRow; i++) {
      const rowIdx = i - startRow
      const y = firstRowY + rowIdx * ROW_H
      const correlative = String(i + 1).padStart(2, '0')
      const code = formatCode(codes[i])

      // Correlative — red bold, reads like a badge on the left
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      text(doc, BRAND_RED)
      doc.text(correlative, colNumX, y)

      // Code — monospace bold, dark (the hero of the row)
      doc.setFont('courier', 'bold')
      doc.setFontSize(13)
      text(doc, TEXT)
      doc.text(code, colCodeX, y)

      // Dotted handwrite line for the attendee's name
      stroke(doc, LINE)
      doc.setLineWidth(0.4)
      drawDottedLine(doc, colNameX, y + 1.5, colNameEndX)
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Footer: domain on the left, page counter with red dot on the right
  // ────────────────────────────────────────────────────────────────────
  const drawFooter = (pageNum: number) => {
    const dividerY = PAGE_H - 16
    const footerY = PAGE_H - 10

    stroke(doc, LINE)
    doc.setLineWidth(0.2)
    doc.line(BODY_X, dividerY, PAGE_W - BODY_X, dividerY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    text(doc, MUTED)
    doc.text('Generado desde app.projectxeventos.es', BODY_X, footerY, { charSpace: 0.3 })

    // Page counter with a small red dot as a separator
    const rightX = PAGE_W - BODY_X
    const pageText = `Pagina ${pageNum} / ${totalPages}`
    const pageW = doc.getTextWidth(pageText)
    doc.text(pageText, rightX - pageW, footerY)

    fill(doc, BRAND_RED)
    doc.circle(rightX - pageW - 2.5, footerY - 1, 0.7, 'F')
  }

  // ────────────────────────────────────────────────────────────────────
  // Render pages
  // ────────────────────────────────────────────────────────────────────
  if (codes.length === 0) {
    drawBanner()
    drawFooter(1)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(11)
    text(doc, MUTED)
    doc.text('No hay codigos disponibles para exportar.', PAGE_W / 2, PAGE_H / 2, { align: 'center' })
  } else {
    for (let p = 0; p < totalPages; p++) {
      if (p > 0) doc.addPage()
      drawBanner()
      drawBody(p)
      drawFooter(p + 1)
    }
  }

  const filename = `codigos-${slugify(eventName) || 'evento'}-${formatFilenameDate(eventDate)}.pdf`
  doc.save(filename)
}
