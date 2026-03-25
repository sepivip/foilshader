import * as THREE from 'three/webgpu'
import {
  Fn, float, vec3, vec4, texture, uv, normalize,
  positionWorld, cameraPosition,
  dot, sin, cos, clamp, max, cross, select, length, PI,
} from 'three/tsl'
import { createFoilUniforms, type FoilUniforms } from '../core/uniforms'
import { wavelengthToRGB } from '../core/spectrum'
import { sparkleNoise } from '../core/sparkle'
import { foilPatternMask, foilPatternDepth } from '../core/patterns'

export interface FoilMaterialOptions {
  baseTexture?: THREE.Texture
  gratingDensity?: number
  foilRoughness?: number
  foilIntensity?: number
  foilThickness?: number
  lightDirection?: THREE.Vector3
}

export interface FoilMaterialResult {
  material: THREE.NodeMaterial
  uniforms: FoilUniforms
}

/**
 * Tier 1 — Fast analytical approximation.
 *
 * Uses the real grating equation d*(sinα + sinβ) = mλ to compute
 * which wavelength diffracts toward the viewer at each pixel.
 * No wavelength loop — single color per pixel per grating direction.
 * 3 grating orientations for complex multi-color patterns.
 */
export function createFastFoil(options: FoilMaterialOptions = {}): FoilMaterialResult {
  const uniforms = createFoilUniforms()

  if (options.gratingDensity !== undefined) uniforms.gratingDensity.value = options.gratingDensity
  if (options.foilRoughness !== undefined) uniforms.foilRoughness.value = options.foilRoughness
  if (options.foilIntensity !== undefined) uniforms.foilIntensity.value = options.foilIntensity
  if (options.foilThickness !== undefined) uniforms.foilThickness.value = options.foilThickness
  if (options.lightDirection !== undefined) uniforms.lightDir.value.copy(options.lightDirection)

  const foilShader = Fn(() => {
    const uvCoord = uv()

    // Tilted surface normal (card tilt from mouse/touch/gyroscope)
    const tiltX = uniforms.tilt.x
    const tiltY = uniforms.tilt.y
    const n = normalize(vec3(sin(tiltX), sin(tiltY), float(1)))

    // Light and view directions (from surface point)
    const L = normalize(vec3(uniforms.lightDir))
    const V = normalize(cameraPosition.sub(positionWorld))

    // 3 grating tangent directions (perpendicular to groove lines)
    const t1 = normalize(cross(n, vec3(0, 1, 0)))        // horizontal grooves
    const t2 = normalize(cross(n, t1))                     // vertical grooves
    const t3 = normalize(t1.mul(0.707).add(t2.mul(0.707))) // diagonal grooves

    const d1 = float(1).div(uniforms.gratingDensity)
    const d2 = d1.mul(1.3)
    const d3 = d1.mul(0.85)

    // Pattern depth perturbation for embossed feel
    const depth = foilPatternDepth(uvCoord, uniforms.foilPattern)

    // Spatial variation: different card positions = slightly different angles
    const sx = uvCoord.x.sub(0.5).mul(0.5)
    const sy = uvCoord.y.sub(0.5).mul(0.3)

    // For each grating: compute sinα + sinβ (the grating equation parameter)
    // sinα = projection of light onto tangent, sinβ = projection of view onto tangent
    // Grating equation: d*(sinα + sinβ) = m*λ → λ = d*(sinα + sinβ)/m
    // For m=1, the visible wavelength at this pixel is: λ = d*(sinα + sinβ)

    // Grating 1
    const sinSum1 = dot(L, t1).add(dot(V, t1)).add(sx).add(depth.x)
    const lam1 = d1.mul(sinSum1)
    const vis1 = clamp(float(1).sub(max(float(380).sub(lam1), float(0)).add(max(lam1.sub(float(780)), float(0))).mul(0.02)), 0, 1)
    const c1 = wavelengthToRGB(clamp(lam1, float(380), float(780))).mul(vis1)

    // m=-1 for reflected order
    const lam1n = d1.mul(sinSum1.negate())
    const vis1n = clamp(float(1).sub(max(float(380).sub(lam1n), float(0)).add(max(lam1n.sub(float(780)), float(0))).mul(0.02)), 0, 1)
    const c1n = wavelengthToRGB(clamp(lam1n, float(380), float(780))).mul(vis1n)

    // Grating 2
    const sinSum2 = dot(L, t2).add(dot(V, t2)).add(sy).add(depth.y)
    const lam2 = d2.mul(sinSum2)
    const vis2 = clamp(float(1).sub(max(float(380).sub(lam2), float(0)).add(max(lam2.sub(float(780)), float(0))).mul(0.02)), 0, 1)
    const c2 = wavelengthToRGB(clamp(lam2, float(380), float(780))).mul(vis2)

    // Grating 3
    const sinSum3 = dot(L, t3).add(dot(V, t3)).add(sx.add(sy).mul(0.7)).add(depth.x.add(depth.y).mul(0.5))
    const lam3 = d3.mul(sinSum3)
    const vis3 = clamp(float(1).sub(max(float(380).sub(lam3), float(0)).add(max(lam3.sub(float(780)), float(0))).mul(0.02)), 0, 1)
    const c3 = wavelengthToRGB(clamp(lam3, float(380), float(780))).mul(vis3)

    const foilColor = c1.add(c1n).add(c2.mul(0.7)).add(c3.mul(0.5)).mul(uniforms.foilIntensity)

    const NdotV = max(dot(n, V), float(0.001))
    const fresnel = float(0.5).add(float(0.5).mul(float(1).sub(NdotV)))
    const sparkle = sparkleNoise(uvCoord, NdotV, uniforms.time, uniforms.foilRoughness)

    const baseColor = options.baseTexture
      ? texture(options.baseTexture, uvCoord).rgb
      : vec3(0.45, 0.45, 0.5)

    // Mask: pattern or color-key
    const patternMask = foilPatternMask(uvCoord, uniforms.foilPattern)
    const colorDist = length(baseColor.sub(vec3(uniforms.maskColor)))
    const colorMask = clamp(float(1).sub(colorDist.div(max(uniforms.maskTolerance, float(0.01)))), 0, 1)
    const mask = select(uniforms.maskMode.lessThan(0.5), patternMask, colorMask)

    const finalColor = baseColor.mul(float(0.65)).add(foilColor.mul(fresnel).mul(mask)).add(sparkle.mul(0.15).mul(mask))

    return vec4(finalColor, float(1))
  })

  const material = new THREE.NodeMaterial()
  material.fragmentNode = foilShader()
  material.side = THREE.DoubleSide

  return { material, uniforms }
}
