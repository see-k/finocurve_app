/**
 * Normalize an uploaded brand logo (.svg, .png, .jpg, etc.) into a raster PNG
 * data URL suitable for jsPDF (which cannot embed SVG). Runs once at upload
 * time so document generation stays synchronous and format-agnostic.
 */

/** Longest edge of the normalized logo, in pixels. */
export const MAX_EDGE = 512
/** Reject source files larger than this to keep stored branding small. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024
/** Fallback canvas box when an SVG reports no intrinsic dimensions. */
export const SVG_FALLBACK_SIZE = 512

export const ACCEPTED_LOGO_TYPES = new Set([
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])

export class BrandLogoError extends Error {}

/** True when an image's reported size looks like Chromium's default for a dimensionless SVG. */
export function looksDimensionless(width: number, height: number): boolean {
  return !width || !height || (width === 300 && height === 150)
}

export function isAcceptedLogoType(type: string, name: string): boolean {
  if (!type) return /\.(svg|png|jpe?g|webp|gif)$/i.test(name)
  return ACCEPTED_LOGO_TYPES.has(type)
}

/** Validate an uploaded file before decoding. Throws BrandLogoError when rejected. */
export function assertLogoFileAcceptable(file: { size: number; type: string; name: string }): void {
  if (file.size > MAX_FILE_BYTES) {
    throw new BrandLogoError('Logo file is too large (max 2 MB).')
  }
  if (file.type && !isAcceptedLogoType(file.type, file.name)) {
    throw new BrandLogoError('Unsupported image type. Use SVG, PNG, JPG, WEBP, or GIF.')
  }
}

/** Scale intrinsic pixels to fit MAX_EDGE, applying the SVG dimensionless fallback. */
export function computeLogoOutputSize(
  srcW: number,
  srcH: number,
  isSvg: boolean,
): { width: number; height: number } | null {
  let w = srcW
  let h = srcH
  if (isSvg && looksDimensionless(w, h)) {
    w = SVG_FALLBACK_SIZE
    h = SVG_FALLBACK_SIZE
  }
  if (!w || !h) return null
  if (w > MAX_EDGE || h > MAX_EDGE) {
    if (w >= h) {
      h = Math.round((h / w) * MAX_EDGE)
      w = MAX_EDGE
    } else {
      w = Math.round((w / h) * MAX_EDGE)
      h = MAX_EDGE
    }
  }
  return { width: w, height: h }
}

/**
 * Reads an image file, scales it to fit within MAX_EDGE (preserving aspect
 * ratio and transparency), and returns a `data:image/png;base64,...` string.
 * Throws BrandLogoError on unsupported types, oversized files, or decode
 * failures.
 */
export function normalizeLogoForDocuments(file: File): Promise<string> {
  try {
    assertLogoFileAcceptable(file)
  } catch (e) {
    return Promise.reject(e)
  }

  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)

  return new Promise<string>((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const size = computeLogoOutputSize(img.naturalWidth, img.naturalHeight, isSvg)
        if (!size) {
          reject(new BrandLogoError('Could not determine the image dimensions.'))
          return
        }
        const { width: outW, height: outH } = size

        const canvas = document.createElement('canvas')
        canvas.width = outW
        canvas.height = outH
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new BrandLogoError('Could not get a canvas context to process the logo.'))
          return
        }
        ctx.drawImage(img, 0, 0, outW, outH)

        const dataUrl = canvas.toDataURL('image/png')
        if (!dataUrl.startsWith('data:image/png')) {
          reject(new BrandLogoError('Failed to convert the logo to PNG.'))
          return
        }
        resolve(dataUrl)
      } catch (e) {
        reject(new BrandLogoError(e instanceof Error ? e.message : 'Failed to process the logo.'))
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new BrandLogoError('Could not read the image. It may be corrupt or an unsupported format.'))
    }

    img.src = url
  })
}
