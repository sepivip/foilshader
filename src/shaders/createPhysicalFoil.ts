import * as THREE from 'three/webgpu'
import {
  Fn, float, vec2, vec3, vec4, texture, uv, normalize,
  positionWorld, cameraPosition,
  dot, sin, cos, acos, mix, clamp, max, abs, fract,
  Loop, PI,
} from 'three/tsl'
import { createFoilUniforms, type FoilUniforms } from '../core/uniforms'
import { wavelengthToRGB } from '../core/spectrum'
import { diffractionSinAngle } from '../core/grating'
import { sparkleNoise } from '../core/sparkle'
import type { FoilMaterialOptions, FoilMaterialResult } from './createFastFoil'

const NUM_WAVELENGTHS = 12

/**
 * Simple hash for per-pixel roughness noise.
 */
const hash22 = Fn(([p_immutable]: [any]) => {
  const p = vec2(p_immutable)
  const d1 = dot(p, vec2(127.1, 311.7))
  const d2 = dot(p, vec2(269.5, 183.3))
  return vec2(
    fract(sin(d1).mul(43758.5453)),
    fract(sin(d2).mul(43758.5453)),
  )
})

/**
 * Compute contribution of a single diffraction order to complex amplitude.
 */
const addOrderContribution = Fn(([
  ampReal, ampImag,
  incidence, lambda, order, d,
  sinViewAngle, filmThickness, nFilm, phaseNoise,
]: [any, any, any, any, any, any, any, any, any, any]) => {
  const result = diffractionSinAngle(incidence, lambda, order, d)
  const sinThetaM = result.x
  const valid = result.y

  // Angular envelope: how close is diffracted beam to viewer
  const diff = abs(sinThetaM.sub(sinViewAngle))
  const envelope = max(float(1).sub(diff.mul(3)), float(0)).mul(valid)

  // Path difference from grating geometry
  const pathDiff = d.mul(order).mul(sin(incidence))
  // Thin-film contribution
  const thinFilm = filmThickness.mul(nFilm).mul(float(2)).mul(cos(incidence))
  // Total phase
  const phase = pathDiff.add(thinFilm).div(lambda).mul(PI.mul(2)).add(phaseNoise)

  ampReal.addAssign(cos(phase).mul(envelope))
  ampImag.addAssign(sin(phase).mul(envelope))
})

/**
 * Tier 3: Full spectral physics.
 * 12 wavelengths, 5 orders (m=-2..+2), complex wave interference,
 * thin-film boost, per-pixel roughness noise. ~70 TSL node operations.
 * Maximum fidelity — best for single-card showcase on desktop.
 */
export function createPhysicalFoil(options: FoilMaterialOptions = {}): FoilMaterialResult {
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

    const incidence = acos(clamp(dot(n, lightDir), float(-1), float(1)))
    const viewAngle = acos(clamp(dot(n, viewDir), float(-1), float(1)))
    const sinViewAngle = sin(viewAngle)

    const d = float(1).div(uniforms.gratingDensity)

    // Per-pixel roughness noise
    const pixelNoise = hash22(uvCoord.mul(500))
    const phaseNoise = pixelNoise.x.mul(uniforms.foilRoughness).mul(PI.mul(2))

    // Thin-film parameters
    const filmThickness = uniforms.foilThickness
    const nFilm = float(1.5)

    // Accumulate color across wavelengths
    const totalColor = vec3(0, 0, 0).toVar()

    Loop(NUM_WAVELENGTHS, ({ i }) => {
      const t = i.toFloat().div(float(NUM_WAVELENGTHS - 1))
      const lambda = mix(float(380), float(780), t)
      const rgb = wavelengthToRGB(lambda)

      // Complex amplitude summation across 5 orders
      const ampReal = float(0).toVar()
      const ampImag = float(0).toVar()

      // m = -2, -1, 0, +1, +2
      addOrderContribution(ampReal, ampImag, incidence, lambda, float(-2), d, sinViewAngle, filmThickness, nFilm, phaseNoise)
      addOrderContribution(ampReal, ampImag, incidence, lambda, float(-1), d, sinViewAngle, filmThickness, nFilm, phaseNoise)
      addOrderContribution(ampReal, ampImag, incidence, lambda, float(0), d, sinViewAngle, filmThickness, nFilm, phaseNoise)
      addOrderContribution(ampReal, ampImag, incidence, lambda, float(1), d, sinViewAngle, filmThickness, nFilm, phaseNoise)
      addOrderContribution(ampReal, ampImag, incidence, lambda, float(2), d, sinViewAngle, filmThickness, nFilm, phaseNoise)

      // Intensity = |A|^2 (constructive = bright, destructive = dark)
      const intensity = ampReal.mul(ampReal).add(ampImag.mul(ampImag))

      totalColor.addAssign(rgb.mul(intensity))
    })

    const foilColor = totalColor.div(float(NUM_WAVELENGTHS)).mul(uniforms.foilIntensity)

    const NdotV = max(dot(n, viewDir), float(0))
    const sparkle = sparkleNoise(uvCoord, NdotV, uniforms.time, uniforms.foilRoughness)

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
