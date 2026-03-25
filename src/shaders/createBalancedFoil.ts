import * as THREE from 'three/webgpu'
import {
  Fn, float, vec3, vec4, texture, uv, normalize,
  positionWorld, cameraPosition,
  dot, sin, clamp, max, abs, mix, cross,
  Loop,
} from 'three/tsl'
import { createFoilUniforms, type FoilUniforms } from '../core/uniforms'
import { wavelengthToRGB } from '../core/spectrum'
import { sparkleNoise } from '../core/sparkle'
import { foilPatternMask } from '../core/patterns'
import type { FoilMaterialOptions, FoilMaterialResult } from './createFastFoil'

const NUM_WAVELENGTHS = 8

/**
 * Tier 2: Balanced — 8 wavelengths, 3 orders, cross-hatch.
 * Uses very tight envelopes so only 1-2 wavelengths dominate per pixel,
 * giving saturated rainbow bands, not washed-out white.
 */
export function createBalancedFoil(options: FoilMaterialOptions = {}): FoilMaterialResult {
  const uniforms = createFoilUniforms()

  if (options.gratingDensity !== undefined) uniforms.gratingDensity.value = options.gratingDensity
  if (options.foilRoughness !== undefined) uniforms.foilRoughness.value = options.foilRoughness
  if (options.foilIntensity !== undefined) uniforms.foilIntensity.value = options.foilIntensity
  if (options.foilThickness !== undefined) uniforms.foilThickness.value = options.foilThickness
  if (options.lightDirection !== undefined) uniforms.lightDir.value.copy(options.lightDirection)

  const foilShader = Fn(() => {
    const uvCoord = uv()

    const tiltX = uniforms.tilt.x
    const tiltY = uniforms.tilt.y
    const n = normalize(vec3(sin(tiltX), sin(tiltY), float(1)))

    const lightDir = normalize(vec3(uniforms.lightDir))
    const viewDir = normalize(cameraPosition.sub(positionWorld))
    const H = normalize(viewDir.add(lightDir))
    const tangent = normalize(cross(n, vec3(0, 1, 0)))
    const bitangent = normalize(cross(n, tangent))

    // Diffraction coordinates for two grating directions
    const diffU = dot(H, tangent).add(uvCoord.x.sub(0.5).mul(0.7)).add(uvCoord.y.sub(0.5).mul(0.3))
    const diffV = dot(H, bitangent).add(uvCoord.y.sub(0.5).mul(0.6)).add(uvCoord.x.sub(0.5).mul(0.2))

    const d = float(1).div(uniforms.gratingDensity)
    const d2 = d.mul(1.3) // second grating slightly different spacing

    const totalColor = vec3(0, 0, 0).toVar()

    Loop(NUM_WAVELENGTHS, ({ i }) => {
      const t = i.toFloat().div(float(NUM_WAVELENGTHS - 1))
      const lambda = mix(float(380), float(780), t)
      const rgb = wavelengthToRGB(lambda)

      // TIGHT envelope — only wavelengths very close to the diffraction
      // condition contribute. This keeps colors saturated.
      // m*λ/d is the sin(θ) where this wavelength diffracts

      // Grating 1: m=+1
      const target_p1 = lambda.div(d)
      const w_p1 = max(float(1).sub(abs(diffU.sub(target_p1)).mul(15)), float(0))

      // Grating 1: m=-1
      const target_m1 = lambda.div(d).negate()
      const w_m1 = max(float(1).sub(abs(diffU.sub(target_m1)).mul(15)), float(0))

      // Grating 2 (cross-hatch): m=+1
      const target2_p1 = lambda.div(d2)
      const w2_p1 = max(float(1).sub(abs(diffV.sub(target2_p1)).mul(15)), float(0))

      // Grating 2: m=-1
      const target2_m1 = lambda.div(d2).negate()
      const w2_m1 = max(float(1).sub(abs(diffV.sub(target2_m1)).mul(15)), float(0))

      const totalW = w_p1.add(w_m1).add(w2_p1.mul(0.7)).add(w2_m1.mul(0.7))
      totalColor.addAssign(rgb.mul(totalW))
    })

    const foilColor = totalColor.mul(uniforms.foilIntensity)

    // Fresnel
    const NdotV = max(dot(n, viewDir), float(0.001))
    const fresnel = float(0.5).add(float(0.5).mul(float(1).sub(NdotV)))

    const sparkle = sparkleNoise(uvCoord, NdotV, uniforms.time, uniforms.foilRoughness)

    const baseColor = options.baseTexture
      ? texture(options.baseTexture, uvCoord).rgb
      : vec3(0.45, 0.45, 0.5)

    // Apply foil pattern mask
    const mask = foilPatternMask(uvCoord, uniforms.foilPattern)

    // Additive: card art + saturated rainbow
    const finalColor = baseColor.mul(float(0.7)).add(foilColor.mul(fresnel).mul(mask)).add(sparkle.mul(0.15).mul(mask))

    return vec4(finalColor, float(1))
  })

  const material = new THREE.NodeMaterial()
  material.fragmentNode = foilShader()
  material.side = THREE.DoubleSide

  return { material, uniforms }
}
