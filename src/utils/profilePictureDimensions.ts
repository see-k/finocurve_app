/** Max dimension for profile pictures (keeps file size small for localStorage). */
export const PROFILE_IMAGE_MAX_SIZE = 256

/** Scale dimensions down when either edge exceeds maxSize, preserving aspect ratio. */
export function computeProfileImageDimensions(
  width: number,
  height: number,
  maxSize: number = PROFILE_IMAGE_MAX_SIZE,
): { width: number; height: number } {
  if (width <= maxSize && height <= maxSize) {
    return { width, height }
  }
  if (width > height) {
    return { width: maxSize, height: (height / width) * maxSize }
  }
  return { width: (width / height) * maxSize, height: maxSize }
}
