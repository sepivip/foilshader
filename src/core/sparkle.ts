import { Fn, float, vec2, vec3, fract, sin, dot, pow, clamp } from 'three/tsl'

/**
 * Hash function for pseudo-random noise. Maps vec2 → float in [0,1].
 */
const hash21 = Fn(([p_immutable]: [any]) => {
  const p = vec2(p_immutable)
  const h = dot(p, vec2(127.1, 311.7))
  return fract(sin(h).mul(43758.5453123))
})

/**
 * Sparkle noise simulating foil micro-facets.
 * Returns a vec3 sparkle color (white flecks, intensity varies by angle).
 *
 * @param uvCoord - fragment UV
 * @param viewDotNormal - dot(viewDir, normal), 0–1
 * @param time - elapsed time for subtle shimmer
 * @param roughness - controls sparkle density (0 = none, 1 = dense)
 */
export const sparkleNoise = Fn(([
  uvCoord_immutable,
  viewDotNormal_immutable,
  time_immutable,
  roughness_immutable,
]: [any, any, any, any]) => {
  const uvCoord = vec2(uvCoord_immutable)
  const viewDotNormal = float(viewDotNormal_immutable)
  const time = float(time_immutable)
  const roughness = float(roughness_immutable)

  // High-frequency UV grid for tiny flakes
  const gridUV = uvCoord.mul(200)
  const cellId = vec2(gridUV.x.floor(), gridUV.y.floor())

  // Random value per cell, modulated by time for shimmer
  const rand = hash21(cellId.add(vec2(time.mul(0.1).floor(), 0)))

  // Sparkle threshold — lower roughness = fewer but brighter flecks
  const threshold = float(1).sub(roughness.mul(0.3))

  // Angle-dependent intensity — sparkles at glancing angles
  const angleFactor = pow(float(1).sub(viewDotNormal), float(3))

  // Combine: only show sparkle if random exceeds threshold AND angle is right
  const sparkle = clamp(
    rand.sub(threshold).mul(50),
    0,
    1
  ).mul(angleFactor)

  return vec3(sparkle, sparkle, sparkle)
})
