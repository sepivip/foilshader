import * as THREE from 'three/webgpu'
import {
  Fn, float, vec3, vec4, texture, uv, normalize,
  positionWorld, cameraPosition,
  dot, sin, cos, clamp, max, cross,
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
 * Tier 1: Fast — 3 grating directions, no wavelength loop.
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

    // 3 grating directions: horizontal, vertical, diagonal
    const tangent = normalize(cross(n, vec3(0, 1, 0)))
    const bitangent = normalize(cross(n, tangent))
    const diagonal = normalize(tangent.add(bitangent))

    const d = float(1).div(uniforms.gratingDensity)

    // Pattern depth perturbation
    const depth = foilPatternDepth(uvCoord, uniforms.foilPattern)

    const sx = uvCoord.x.sub(0.5)
    const sy = uvCoord.y.sub(0.5)

    // Grating 1 + depth perturbation
    const diff1 = dot(H, tangent).add(sx.mul(0.6)).add(sy.mul(0.2)).add(depth.x)
    const lambda1 = d.mul(diff1)
    const c1 = wavelengthToRGB(clamp(lambda1, float(380), float(780)))
    const vis1 = clamp(float(1).sub(max(float(380).sub(lambda1), float(0)).add(max(lambda1.sub(float(780)), float(0))).mul(0.015)), 0, 1)

    // Grating 2 + depth
    const diff2 = dot(H, bitangent).add(sy.mul(0.5)).add(sx.mul(0.15)).add(depth.y)
    const lambda2 = d.mul(1.3).mul(diff2)
    const c2 = wavelengthToRGB(clamp(lambda2, float(380), float(780)))
    const vis2 = clamp(float(1).sub(max(float(380).sub(lambda2), float(0)).add(max(lambda2.sub(float(780)), float(0))).mul(0.015)), 0, 1)

    // Grating 3 + depth
    const diff3 = dot(H, diagonal).add(sx.add(sy).mul(0.4)).add(depth.x.add(depth.y).mul(0.5))
    const lambda3 = d.mul(0.9).mul(diff3)
    const c3 = wavelengthToRGB(clamp(lambda3, float(380), float(780)))
    const vis3 = clamp(float(1).sub(max(float(380).sub(lambda3), float(0)).add(max(lambda3.sub(float(780)), float(0))).mul(0.015)), 0, 1)

    const foilColor = c1.mul(vis1).add(c2.mul(vis2).mul(0.7)).add(c3.mul(vis3).mul(0.5)).mul(uniforms.foilIntensity)

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
