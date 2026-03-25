import * as THREE from 'three/webgpu'
import {
  Fn, float, vec3, vec4, texture, uv, normalize,
  positionWorld, normalWorld, cameraPosition,
  dot, sin, acos, clamp, max, abs,
} from 'three/tsl'
import { createFoilUniforms, type FoilUniforms } from '../core/uniforms'
import { wavelengthToRGB } from '../core/spectrum'
import { sparkleNoise } from '../core/sparkle'

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
 * Tier 1: Fast analytical approximation.
 * Solves grating equation for m=1 only, maps result directly to hue.
 * No wavelength loop. ~20 TSL node operations. Best for mobile / many cards.
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

    // Tilted normal: rotate base (0,0,1) by tilt angles
    const tiltX = uniforms.tilt.x
    const tiltY = uniforms.tilt.y
    const n = normalize(vec3(sin(tiltX), sin(tiltY), float(1)))
    const lightDir = normalize(vec3(uniforms.lightDir))
    const viewDir = normalize(cameraPosition.sub(positionWorld))

    // Incidence angle between light and tilted surface
    const incidence = acos(clamp(dot(n, lightDir), float(-1), float(1)))

    // Grating period d = 1 / gratingDensity (in nm)
    const d = float(1).div(uniforms.gratingDensity)

    // View angle relative to surface
    const viewAngle = acos(clamp(dot(n, viewDir), float(-1), float(1)))
    const sinView = sin(viewAngle)

    // For m=1: λ = d * (sin(θ_i) + sin(θ_view))
    // This gives us the wavelength that diffracts toward the viewer
    const lambda = d.mul(sin(incidence).add(sinView))

    // Clamp to visible range and get color
    const lambdaClamped = clamp(lambda, float(380), float(780))
    const inRange = clamp(
      float(1).sub(abs(lambda.sub(float(580))).sub(float(200)).mul(0.01)),
      0, 1
    )
    const rainbowColor = wavelengthToRGB(lambdaClamped).mul(inRange)

    // Intensity: cosine falloff from viewing angle
    const NdotV = max(dot(n, viewDir), float(0))
    const NdotL = max(dot(n, lightDir), float(0))
    const intensity = NdotV.mul(NdotL)

    const foilColor = rainbowColor.mul(intensity).mul(uniforms.foilIntensity)

    // Sparkle
    const sparkle = sparkleNoise(uvCoord, NdotV, uniforms.time, uniforms.foilRoughness)

    // Base texture or placeholder
    const baseColor = options.baseTexture
      ? texture(options.baseTexture, uvCoord).rgb
      : vec3(0.15, 0.15, 0.2)

    const ambient = float(0.65)
    const finalColor = baseColor.mul(ambient.add(foilColor).add(sparkle.mul(0.3)))

    return vec4(finalColor, float(1))
  })

  const material = new THREE.NodeMaterial()
  material.fragmentNode = foilShader()
  material.side = THREE.DoubleSide

  return { material, uniforms }
}
