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
import { foilPatternMask, foilPatternDepth } from '../core/patterns'
import type { FoilMaterialOptions, FoilMaterialResult } from './createFastFoil'

const NUM_WAVELENGTHS = 8

/**
 * Tier 2: Balanced — 8 wavelengths, 3 grating directions, cross-hatch.
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

    // 3 grating directions for complex rainbow pattern
    const tangent = normalize(cross(n, vec3(0, 1, 0)))
    const bitangent = normalize(cross(n, tangent))
    const diagonal = normalize(tangent.mul(0.707).add(bitangent.mul(0.707)))

    const d = float(1).div(uniforms.gratingDensity)
    const d2 = d.mul(1.3)  // second grating, different spacing
    const d3 = d.mul(0.85) // third grating, different spacing

    const sx = uvCoord.x.sub(0.5)
    const sy = uvCoord.y.sub(0.5)

    // Pattern depth — perturbs diffraction for embossed material feel
    const depth = foilPatternDepth(uvCoord, uniforms.foilPattern)

    // Diffraction coords for 3 grating orientations + depth perturbation
    const diff1 = dot(H, tangent).add(sx.mul(0.6)).add(sy.mul(0.2)).add(depth.x)
    const diff2 = dot(H, bitangent).add(sy.mul(0.5)).add(sx.mul(0.15)).add(depth.y)
    const diff3 = dot(H, diagonal).add(sx.add(sy).mul(0.35)).add(depth.x.add(depth.y).mul(0.5))

    const totalColor = vec3(0, 0, 0).toVar()

    Loop(NUM_WAVELENGTHS, ({ i }) => {
      const t = i.toFloat().div(float(NUM_WAVELENGTHS - 1))
      const lambda = mix(float(380), float(780), t)
      const rgb = wavelengthToRGB(lambda)

      // Grating 1 (horizontal): m=+1, m=-1
      const tgt1p = lambda.div(d)
      const w1p = max(float(1).sub(abs(diff1.sub(tgt1p)).mul(12)), float(0))
      const tgt1m = lambda.div(d).negate()
      const w1m = max(float(1).sub(abs(diff1.sub(tgt1m)).mul(12)), float(0))

      // Grating 2 (vertical): m=+1, m=-1
      const tgt2p = lambda.div(d2)
      const w2p = max(float(1).sub(abs(diff2.sub(tgt2p)).mul(12)), float(0))
      const tgt2m = lambda.div(d2).negate()
      const w2m = max(float(1).sub(abs(diff2.sub(tgt2m)).mul(12)), float(0))

      // Grating 3 (diagonal): m=+1, m=-1
      const tgt3p = lambda.div(d3)
      const w3p = max(float(1).sub(abs(diff3.sub(tgt3p)).mul(12)), float(0))
      const tgt3m = lambda.div(d3).negate()
      const w3m = max(float(1).sub(abs(diff3.sub(tgt3m)).mul(12)), float(0))

      const total = w1p.add(w1m).add(w2p.mul(0.8)).add(w2m.mul(0.8)).add(w3p.mul(0.5)).add(w3m.mul(0.5))
      totalColor.addAssign(rgb.mul(total))
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
