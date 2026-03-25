import * as THREE from 'three/webgpu'
import {
  Fn, float, vec2, vec3, vec4, texture, uv, normalize,
  positionWorld, cameraPosition,
  dot, sin, cos, mix, clamp, max, abs, fract, cross, select, length,
  Loop, PI,
} from 'three/tsl'
import { createFoilUniforms, type FoilUniforms } from '../core/uniforms'
import { wavelengthToRGB } from '../core/spectrum'
import { sparkleNoise } from '../core/sparkle'
import { foilPatternMask, foilPatternDepth } from '../core/patterns'
import type { FoilMaterialOptions, FoilMaterialResult } from './createFastFoil'

const NUM_WAVELENGTHS = 12
const NUM_SLITS = 12 // More slits = sharper diffraction peaks

/**
 * Tier 3 — Physical: Full multi-slit diffraction + thin-film interference.
 *
 * Physics model per fragment:
 * 1. Real grating equation: d*(sinα + sinβ) = mλ
 * 2. Multi-slit interference: I = sin²(N*φ/2) / (N² * sin²(φ/2))
 *    where φ = 2π*d*(sinα+sinβ)/λ  is the phase difference between adjacent slits.
 *    This formula produces:
 *    - Sharp bright peaks at diffraction orders (m = ..., -2, -1, 0, +1, +2, ...)
 *    - Dark destructive interference gaps between orders
 *    - N-2 secondary maxima between each pair of primary peaks
 *    Exactly matching real diffraction grating physics.
 *
 * 3. Thin-film interference: Additional phase from foil coating thickness
 *    φ_film = 4π * n_film * t * cos(θ) / λ
 *    Modulates intensity per wavelength → iridescent color shifts
 *
 * 4. Per-pixel roughness: Random phase noise from foil micro-imperfections
 *    Broadens peaks slightly, adds sparkle at grazing angles
 *
 * 5. 3 grating directions with different periods → complex cross-hatch pattern
 * 6. 12 wavelengths sampled across visible spectrum → smooth color reproduction
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
    const N = float(NUM_SLITS)

    const tiltX = uniforms.tilt.x
    const tiltY = uniforms.tilt.y
    const n = normalize(vec3(sin(tiltX), sin(tiltY), float(1)))

    const L = normalize(vec3(uniforms.lightDir))
    const V = normalize(cameraPosition.sub(positionWorld))

    // 3 grating tangent directions
    const t1 = normalize(cross(n, vec3(0, 1, 0)))
    const t2 = normalize(cross(n, t1))
    const t3 = normalize(t1.mul(0.707).add(t2.mul(0.707)))

    const d1 = float(1).div(uniforms.gratingDensity)
    const d2 = d1.mul(1.3)
    const d3 = d1.mul(0.85)

    // Pattern depth
    const depth = foilPatternDepth(uvCoord, uniforms.foilPattern)

    const sx = uvCoord.x.sub(0.5).mul(0.5)
    const sy = uvCoord.y.sub(0.5).mul(0.3)

    // sin(α) + sin(β) per grating direction
    const sinSum1 = dot(L, t1).add(dot(V, t1)).add(sx).add(depth.x)
    const sinSum2 = dot(L, t2).add(dot(V, t2)).add(sy).add(depth.y)
    const sinSum3 = dot(L, t3).add(dot(V, t3)).add(sx.add(sy).mul(0.6)).add(depth.x.add(depth.y).mul(0.5))

    // Per-pixel roughness noise (2 independent channels)
    const noiseUV = uvCoord.mul(500)
    const nCell = vec2(noiseUV.x.floor(), noiseUV.y.floor())
    const n1 = fract(sin(dot(nCell, vec2(127.1, 311.7))).mul(43758.5453))
    const n2 = fract(sin(dot(nCell, vec2(269.5, 183.3))).mul(43758.5453))
    const phaseNoise = n1.mul(uniforms.foilRoughness).mul(PI.mul(2))

    // Thin-film parameters
    const filmThickness = uniforms.foilThickness // nm
    const nFilm = float(1.5) // refractive index of foil coating
    const cosIncidence = max(dot(n, L), float(0.1))

    const totalColor = vec3(0, 0, 0).toVar()

    Loop(NUM_WAVELENGTHS, ({ i }) => {
      const t = i.toFloat().div(float(NUM_WAVELENGTHS - 1))
      const lambda = mix(float(380), float(780), t)
      const rgb = wavelengthToRGB(lambda)

      // ── Thin-film interference ──
      // Phase from thin coating: φ_film = 4π * n * t * cos(θ) / λ
      const thinFilmPhase = PI.mul(4).mul(nFilm).mul(filmThickness).mul(cosIncidence).div(lambda)
      // Thin-film reflectance modulation (between 0.5 and 1.0)
      const thinFilmFactor = cos(thinFilmPhase).mul(0.25).add(0.75)

      // ── Grating 1: Multi-slit diffraction ──
      const phi1 = PI.mul(2).mul(d1).mul(sinSum1).div(lambda).add(phaseNoise)
      const hp1 = phi1.mul(0.5)
      const sinNhp1 = sin(N.mul(hp1))
      const sinhp1 = sin(hp1)
      const i1 = select(
        abs(sinhp1).lessThan(0.0001),
        float(1),
        sinNhp1.mul(sinNhp1).div(sinhp1.mul(sinhp1)).div(N.mul(N))
      )

      // ── Grating 2 ──
      const phi2 = PI.mul(2).mul(d2).mul(sinSum2).div(lambda).add(phaseNoise.mul(1.2))
      const hp2 = phi2.mul(0.5)
      const sinNhp2 = sin(N.mul(hp2))
      const sinhp2 = sin(hp2)
      const i2 = select(
        abs(sinhp2).lessThan(0.0001),
        float(1),
        sinNhp2.mul(sinNhp2).div(sinhp2.mul(sinhp2)).div(N.mul(N))
      ).mul(0.7)

      // ── Grating 3 ──
      const phi3 = PI.mul(2).mul(d3).mul(sinSum3).div(lambda).add(phaseNoise.mul(0.8))
      const hp3 = phi3.mul(0.5)
      const sinNhp3 = sin(N.mul(hp3))
      const sinhp3 = sin(hp3)
      const i3 = select(
        abs(sinhp3).lessThan(0.0001),
        float(1),
        sinNhp3.mul(sinNhp3).div(sinhp3.mul(sinhp3)).div(N.mul(N))
      ).mul(0.4)

      // Combined intensity: grating diffraction × thin-film modulation
      const intensity = i1.add(i2).add(i3).mul(thinFilmFactor)

      totalColor.addAssign(rgb.mul(intensity))
    })

    const foilColor = totalColor.div(float(NUM_WAVELENGTHS)).mul(uniforms.foilIntensity)

    const NdotV = max(dot(n, V), float(0.001))
    const fresnel = float(0.5).add(float(0.5).mul(float(1).sub(NdotV)))
    const sparkle = sparkleNoise(uvCoord, NdotV, uniforms.time, uniforms.foilRoughness)

    const baseColor = options.baseTexture
      ? texture(options.baseTexture, uvCoord).rgb
      : vec3(0.45, 0.45, 0.5)

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
