import { computeProfileImageDimensions, PROFILE_IMAGE_MAX_SIZE } from './profilePictureDimensions'

const JPEG_QUALITY = 0.85

/**
 * Reads a file, resizes and compresses it, returns a data URL suitable for localStorage.
 */
export async function compressImageForProfile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      const scaled = computeProfileImageDimensions(img.width, img.height, PROFILE_IMAGE_MAX_SIZE)
      const { width, height } = scaled

      canvas.width = width
      canvas.height = height
      ctx.drawImage(img, 0, 0, width, height)

      try {
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
        resolve(dataUrl)
      } catch (e) {
        reject(e)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}
