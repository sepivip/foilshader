import * as THREE from 'three/webgpu'
import {
  Fn, float, vec3, vec4, texture, uv, normalize,
  positionWorld, cameraPosition,
  dot, sin, clamp, max, cross,
} from 'three/tsl'
import { createFoilUniforms, type FoilUniforms } from '../core/uniforms'
import { wavelengthToRGB } from '../core/spectrum'
import { sparkleNoise } from '../core/sparkle'
import { foilPatternMask } from '../core/patterns'

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
 * Tier 1: Fast — one wavelength per pixel, no loop.
 * Each pixel computes THE wavelength that diffracts toward the viewer.
 * Result: a single saturated spectral color that shifts with tilt.
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

    const tiltX = uniforms.tilt.x
    const tiltY = uniforms.tilt.y
    const n = normalize(vec3(sin(tiltX), sin(tiltY), float(1)))

    const lightDir = normalize(vec3(uniforms.lightDir))
    const viewDir = normalize(cameraPosition.sub(positionWorld))
    const H = normalize(viewDir.add(lightDir))
    const tangent = normalize(cross(n, vec3(0, 1, 0)))

    // Diffraction coordinate = half-vector projection + spatial position
    // This determines WHICH wavelength is visible at this pixel
    const diffCoord = dot(H, tangent).add(uvCoord.x.sub(0.5).mul(0.7)).add(uvCoord.y.sub(0.5).mul(0.3))

    const d = float(1).div(uniforms.gratingDensity)

    // m=+1: one wavelength per pixel — gives saturated rainbow
    const lambda1 = d.mul(diffCoord)
    const inVis1 = clamp(float(1).sub(max(float(380).sub(lambda1), float(0)).add(max(lambda1.sub(float(780)), float(0))).mul(0.02)), 0, 1)
    const color1 = wavelengthToRGB(clamp(lambda1, float(380), float(780))).mul(inVis1)

    // m=-1: second rainbow band (reflected order)
    const lambda2 = d.mul(diffCoord.negate())
    const inVis2 = clamp(float(1).sub(max(float(380).sub(lambda2), float(0)).add(max(lambda2.sub(float(780)), float(0))).mul(0.02)), 0, 1)
    const color2 = wavelengthToRGB(clamp(lambda2, float(380), float(780))).mul(inVis2)

    const foilColor = color1.add(color2).mul(uniforms.foilIntensity)

    // Fresnel
    const NdotV = max(dot(n, viewDir), float(0.001))
    const fresnel = float(0.5).add(float(0.5).mul(float(1).sub(NdotV)))

    // Sparkle
    const sparkle = sparkleNoise(uvCoord, NdotV, uniforms.time, uniforms.foilRoughness)

    const baseColor = options.baseTexture
      ? texture(options.baseTexture, uvCoord).rgb
      : vec3(0.45, 0.45, 0.5)

    // Apply foil pattern mask
    const mask = foilPatternMask(uvCoord, uniforms.foilPattern)

    // Additive blend: card art + rainbow overlay
    const finalColor = baseColor.mul(float(0.7)).add(foilColor.mul(fresnel).mul(mask)).add(sparkle.mul(0.15).mul(mask))

    return vec4(finalColor, float(1))
  })

  const material = new THREE.NodeMaterial()
  material.fragmentNode = foilShader()
  material.side = THREE.DoubleSide

  return { material, uniforms }
}
