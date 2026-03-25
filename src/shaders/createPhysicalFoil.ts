import * as THREE from 'three/webgpu'
import {
  Fn, float, vec2, vec3, vec4, texture, uv, normalize,
  positionWorld, cameraPosition,
  dot, sin, cos, mix, clamp, max, abs, fract, cross,
  Loop, PI,
} from 'three/tsl'
import { createFoilUniforms, type FoilUniforms } from '../core/uniforms'
import { wavelengthToRGB } from '../core/spectrum'
import { sparkleNoise } from '../core/sparkle'
import { foilPatternMask, foilPatternDepth } from '../core/patterns'
import type { FoilMaterialOptions, FoilMaterialResult } from './createFastFoil'

const NUM_WAVELENGTHS = 12

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
 * Tier 3: Full spectral — 12 wavelengths, 3 grating directions,
 * 5 orders each, wave interference + thin-film + roughness noise.
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
    const H = normalize(viewDir.add(lightDir))

    const tangent = normalize(cross(n, vec3(0, 1, 0)))
    const bitangent = normalize(cross(n, tangent))
    const diagonal = normalize(tangent.mul(0.707).add(bitangent.mul(0.707)))

    const d = float(1).div(uniforms.gratingDensity)
    const d2 = d.mul(1.3)
    const d3 = d.mul(0.85)

    const sx = uvCoord.x.sub(0.5)
    const sy = uvCoord.y.sub(0.5)

    // Pattern depth perturbation for embossed material feel
    const depth = foilPatternDepth(uvCoord, uniforms.foilPattern)

    const diff1 = dot(H, tangent).add(sx.mul(0.6)).add(sy.mul(0.2)).add(depth.x)
    const diff2 = dot(H, bitangent).add(sy.mul(0.5)).add(sx.mul(0.15)).add(depth.y)
    const diff3 = dot(H, diagonal).add(sx.add(sy).mul(0.35)).add(depth.x.add(depth.y).mul(0.5))

    // Per-pixel roughness noise
    const pixelNoise = hash22(uvCoord.mul(500))
    const phaseNoise = pixelNoise.x.mul(uniforms.foilRoughness).mul(PI.mul(2))

    const thinFilmBase = uniforms.foilThickness.mul(float(1.5)).mul(2)

    const totalColor = vec3(0, 0, 0).toVar()

    Loop(NUM_WAVELENGTHS, ({ i }) => {
      const t = i.toFloat().div(float(NUM_WAVELENGTHS - 1))
      const lambda = mix(float(380), float(780), t)
      const rgb = wavelengthToRGB(lambda)

      const ampReal = float(0).toVar()
      const ampImag = float(0).toVar()

      const thinFilmPhase = thinFilmBase.div(lambda).mul(PI.mul(2))

      // --- Grating 1: horizontal, orders -2..+2 ---
      const t1_m2 = float(-2).mul(lambda).div(d)
      const e1_m2 = max(float(1).sub(abs(diff1.sub(t1_m2)).mul(10)), float(0)).mul(0.3)
      const p1_m2 = t1_m2.mul(d).div(lambda).mul(PI.mul(2)).add(phaseNoise).add(thinFilmPhase)
      ampReal.addAssign(cos(p1_m2).mul(e1_m2))
      ampImag.addAssign(sin(p1_m2).mul(e1_m2))

      const t1_m1 = float(-1).mul(lambda).div(d)
      const e1_m1 = max(float(1).sub(abs(diff1.sub(t1_m1)).mul(10)), float(0))
      const p1_m1 = t1_m1.mul(d).div(lambda).mul(PI.mul(2)).add(phaseNoise).add(thinFilmPhase)
      ampReal.addAssign(cos(p1_m1).mul(e1_m1))
      ampImag.addAssign(sin(p1_m1).mul(e1_m1))

      const t1_p1 = float(1).mul(lambda).div(d)
      const e1_p1 = max(float(1).sub(abs(diff1.sub(t1_p1)).mul(10)), float(0))
      const p1_p1 = t1_p1.mul(d).div(lambda).mul(PI.mul(2)).add(phaseNoise).add(thinFilmPhase)
      ampReal.addAssign(cos(p1_p1).mul(e1_p1))
      ampImag.addAssign(sin(p1_p1).mul(e1_p1))

      const t1_p2 = float(2).mul(lambda).div(d)
      const e1_p2 = max(float(1).sub(abs(diff1.sub(t1_p2)).mul(10)), float(0)).mul(0.3)
      const p1_p2 = t1_p2.mul(d).div(lambda).mul(PI.mul(2)).add(phaseNoise).add(thinFilmPhase)
      ampReal.addAssign(cos(p1_p2).mul(e1_p2))
      ampImag.addAssign(sin(p1_p2).mul(e1_p2))

      // --- Grating 2: vertical, orders -1..+1 ---
      const t2_m1 = float(-1).mul(lambda).div(d2)
      const e2_m1 = max(float(1).sub(abs(diff2.sub(t2_m1)).mul(10)), float(0)).mul(0.8)
      const p2_m1 = t2_m1.mul(d2).div(lambda).mul(PI.mul(2)).add(phaseNoise.mul(1.2))
      ampReal.addAssign(cos(p2_m1).mul(e2_m1))
      ampImag.addAssign(sin(p2_m1).mul(e2_m1))

      const t2_p1 = float(1).mul(lambda).div(d2)
      const e2_p1 = max(float(1).sub(abs(diff2.sub(t2_p1)).mul(10)), float(0)).mul(0.8)
      const p2_p1 = t2_p1.mul(d2).div(lambda).mul(PI.mul(2)).add(phaseNoise.mul(1.2))
      ampReal.addAssign(cos(p2_p1).mul(e2_p1))
      ampImag.addAssign(sin(p2_p1).mul(e2_p1))

      // --- Grating 3: diagonal, orders -1..+1 ---
      const t3_m1 = float(-1).mul(lambda).div(d3)
      const e3_m1 = max(float(1).sub(abs(diff3.sub(t3_m1)).mul(10)), float(0)).mul(0.5)
      const p3_m1 = t3_m1.mul(d3).div(lambda).mul(PI.mul(2)).add(phaseNoise.mul(0.8))
      ampReal.addAssign(cos(p3_m1).mul(e3_m1))
      ampImag.addAssign(sin(p3_m1).mul(e3_m1))

      const t3_p1 = float(1).mul(lambda).div(d3)
      const e3_p1 = max(float(1).sub(abs(diff3.sub(t3_p1)).mul(10)), float(0)).mul(0.5)
      const p3_p1 = t3_p1.mul(d3).div(lambda).mul(PI.mul(2)).add(phaseNoise.mul(0.8))
      ampReal.addAssign(cos(p3_p1).mul(e3_p1))
      ampImag.addAssign(sin(p3_p1).mul(e3_p1))

      const intensity = ampReal.mul(ampReal).add(ampImag.mul(ampImag))
      totalColor.addAssign(rgb.mul(intensity))
    })

    const foilColor = totalColor.mul(uniforms.foilIntensity)

    const NdotV = max(dot(n, viewDir), float(0.001))
    const fresnel = float(0.5).add(float(0.5).mul(float(1).sub(NdotV)))

    const sparkle = sparkleNoise(uvCoord, NdotV, uniforms.time, uniforms.foilRoughness)

    const baseColor = options.baseTexture
      ? texture(options.baseTexture, uvCoord).rgb
      : vec3(0.45, 0.45, 0.5)

    const mask = foilPatternMask(uvCoord, uniforms.foilPattern)
    const finalColor = baseColor.mul(float(0.65)).add(foilColor.mul(fresnel).mul(mask)).add(sparkle.mul(0.15).mul(mask))

    return vec4(finalColor, float(1))
  })

  const material = new THREE.NodeMaterial()
  material.fragmentNode = foilShader()
  material.side = THREE.DoubleSide

  return { material, uniforms }
}
