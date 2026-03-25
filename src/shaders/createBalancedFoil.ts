import * as THREE from 'three/webgpu'
import {
  Fn, float, vec3, vec4, texture, uv, normalize,
  positionWorld, cameraPosition,
  dot, sin, acos, clamp, max, abs, mix,
  Loop,
} from 'three/tsl'
import { createFoilUniforms, type FoilUniforms } from '../core/uniforms'
import { wavelengthToRGB } from '../core/spectrum'
import { diffractionSinAngle } from '../core/grating'
import { sparkleNoise } from '../core/sparkle'
import type { FoilMaterialOptions, FoilMaterialResult } from './createFastFoil'

const NUM_WAVELENGTHS = 8

/**
 * Tier 2: Balanced quality.
 * Samples 8 wavelengths across visible spectrum, 3 diffraction orders (m=-1,0,+1).
 * Sinc-like intensity falloff. Good default for desktop. ~40 TSL node operations.
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

    const incidence = acos(clamp(dot(n, lightDir), float(-1), float(1)))
    const viewAngle = acos(clamp(dot(n, viewDir), float(-1), float(1)))
    const sinViewAngle = sin(viewAngle)

    const d = float(1).div(uniforms.gratingDensity)

    // Accumulate color across wavelengths and orders
    const totalColor = vec3(0, 0, 0).toVar()

    Loop(NUM_WAVELENGTHS, ({ i }) => {
      const t = i.toFloat().div(float(NUM_WAVELENGTHS - 1))
      const lambda = mix(float(380), float(780), t)
      const rgb = wavelengthToRGB(lambda)

      const orderContrib = float(0).toVar()

      // m = -1
      const r_m1 = diffractionSinAngle(incidence, lambda, float(-1), d)
      const diff_m1 = abs(r_m1.x.sub(sinViewAngle))
      const i_m1 = max(float(1).sub(diff_m1.mul(5)), float(0))
      orderContrib.addAssign(i_m1.mul(i_m1).mul(r_m1.y))

      // m = 0 (zeroth order, dimmer)
      const r_0 = diffractionSinAngle(incidence, lambda, float(0), d)
      const diff_0 = abs(r_0.x.sub(sinViewAngle))
      const i_0 = max(float(1).sub(diff_0.mul(5)), float(0))
      orderContrib.addAssign(i_0.mul(i_0).mul(r_0.y).mul(0.3))

      // m = +1
      const r_p1 = diffractionSinAngle(incidence, lambda, float(1), d)
      const diff_p1 = abs(r_p1.x.sub(sinViewAngle))
      const i_p1 = max(float(1).sub(diff_p1.mul(5)), float(0))
      orderContrib.addAssign(i_p1.mul(i_p1).mul(r_p1.y))

      totalColor.addAssign(rgb.mul(orderContrib))
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
