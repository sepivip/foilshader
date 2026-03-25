import { uniform } from 'three/tsl'
import { Vector2, Vector3 } from 'three/webgpu'

export function createFoilUniforms() {
  return {
    /** Card tilt in radians (x, y) — driven by mouse/touch/gyroscope */
    tilt: uniform(new Vector2(0, 0)),
    /** Light direction (world space, will be normalized in shader) */
    lightDir: uniform(new Vector3(0, 1, 0.5)),
    /** 1/d where d = grating period in nm. Default: 1/1800 (d = 1800nm) */
    gratingDensity: uniform(1 / 1800),
    /** Foil surface roughness 0–1 */
    foilRoughness: uniform(0.15),
    /** Foil intensity multiplier */
    foilIntensity: uniform(1.5),
    /** Thin-film thickness in nm (used by Physical tier) */
    foilThickness: uniform(500),
    /** Elapsed time in seconds */
    time: uniform(0),
    /** Foil pattern ID (0=full, 1=cosmos, ..., 14=confetti) */
    foilPattern: uniform(0),
    /** Mask mode: 0 = pattern, 1 = color key */
    maskMode: uniform(0),
    /** Target color for color-key masking */
    maskColor: uniform(new Vector3(0, 0, 1)),
    /** Color-key tolerance (0 = exact match, 1 = very loose) */
    maskTolerance: uniform(0.3),
  }
}

export type FoilUniforms = ReturnType<typeof createFoilUniforms>
