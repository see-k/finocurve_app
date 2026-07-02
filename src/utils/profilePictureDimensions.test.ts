import { describe, expect, it } from 'vitest'
import { computeProfileImageDimensions, PROFILE_IMAGE_MAX_SIZE } from './profilePictureDimensions'

describe('computeProfileImageDimensions', () => {
  it('returns original dimensions when both edges are within maxSize', () => {
    expect(computeProfileImageDimensions(200, 150)).toEqual({ width: 200, height: 150 })
    expect(computeProfileImageDimensions(PROFILE_IMAGE_MAX_SIZE, PROFILE_IMAGE_MAX_SIZE)).toEqual({
      width: PROFILE_IMAGE_MAX_SIZE,
      height: PROFILE_IMAGE_MAX_SIZE,
    })
  })

  it('scales wide images to max width while preserving aspect ratio', () => {
    const result = computeProfileImageDimensions(512, 256)
    expect(result.width).toBe(PROFILE_IMAGE_MAX_SIZE)
    expect(result.height).toBe(128)
  })

  it('scales tall images to max height while preserving aspect ratio', () => {
    const result = computeProfileImageDimensions(200, 400)
    expect(result.width).toBe(128)
    expect(result.height).toBe(PROFILE_IMAGE_MAX_SIZE)
  })

  it('honors a custom maxSize', () => {
    expect(computeProfileImageDimensions(100, 200, 50)).toEqual({ width: 25, height: 50 })
  })
})
