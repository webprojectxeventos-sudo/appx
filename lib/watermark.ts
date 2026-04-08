'use client'

// Watermark utility — adds event branding to downloaded photos using Canvas API
// 100% client-side, no server needed

interface WatermarkOptions {
  eventName: string
  brandHandle?: string // e.g. "@tugraduacionmadrid"
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: WatermarkOptions
) {
  const text = options.brandHandle
    ? `${options.eventName}  ·  ${options.brandHandle}`
    : options.eventName

  // Font size proportional to image (2.5% of height, min 14px, max 40px)
  const fontSize = Math.max(14, Math.min(40, Math.round(height * 0.025)))
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

  const textMetrics = ctx.measureText(text)
  const textWidth = textMetrics.width
  const padding = fontSize * 0.8
  const boxHeight = fontSize * 2.2
  const boxWidth = textWidth + padding * 2
  const margin = fontSize * 0.6

  // Position: bottom-right
  const x = width - boxWidth - margin
  const y = height - boxHeight - margin

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.beginPath()
  const radius = fontSize * 0.4
  ctx.roundRect(x, y, boxWidth, boxHeight, radius)
  ctx.fill()

  // Text
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + padding, y + boxHeight / 2)
}

async function generateWatermarkedBlob(
  imageUrl: string,
  options: WatermarkOptions
): Promise<Blob> {
  const img = await loadImage(imageUrl)

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  drawWatermark(ctx, canvas.width, canvas.height, options)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob failed'))
      },
      'image/jpeg',
      0.92
    )
  })
}

export async function downloadWithWatermark(
  imageUrl: string,
  options: WatermarkOptions,
  filename?: string
): Promise<boolean> {
  try {
    const blob = await generateWatermarkedBlob(imageUrl, options)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `${options.eventName.replace(/\s+/g, '-').toLowerCase()}-photo.jpg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return true
  } catch {
    // CORS or other error — fallback to direct download without watermark
    console.warn('[Watermark] Canvas export failed, falling back to direct download')
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = filename || 'photo.jpg'
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return false
  }
}

export async function shareWithWatermark(
  imageUrl: string,
  options: WatermarkOptions
): Promise<boolean> {
  try {
    const blob = await generateWatermarkedBlob(imageUrl, options)
    const file = new File([blob], `${options.eventName.replace(/\s+/g, '-').toLowerCase()}-photo.jpg`, {
      type: 'image/jpeg',
    })

    // Web Share API with file support
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: options.eventName,
      })
      return true
    }

    // Fallback: share URL only
    if (navigator.share) {
      await navigator.share({
        title: options.eventName,
        url: imageUrl,
      })
      return true
    }

    // No share API — copy URL to clipboard
    await navigator.clipboard.writeText(imageUrl)
    return false // indicates URL was copied, not shared
  } catch (err) {
    // User cancelled share or error
    if ((err as Error).name === 'AbortError') return true
    console.warn('[Share] Error:', err)
    return false
  }
}
