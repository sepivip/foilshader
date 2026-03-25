import { Fn, float, vec2, fract, sin, cos, dot, abs, max, min, clamp, smoothstep, select, PI } from 'three/tsl'

/** Hash vec2 → float [0,1] */
const hash21 = Fn(([p_immutable]: [any]) => {
  const p = vec2(p_immutable)
  const h = dot(p, vec2(127.1, 311.7))
  return fract(sin(h).mul(43758.5453123))
})

/** Hash vec2 → vec2 [0,1] */
const hash22 = Fn(([p_immutable]: [any]) => {
  const p = vec2(p_immutable)
  return vec2(
    fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)),
    fract(sin(dot(p, vec2(269.5, 183.3))).mul(43758.5453)),
  )
})

/**
 * Procedural foil pattern mask. Returns float 0–1.
 *
 *  0 = Full           10 = Scales
 *  1 = Cosmos          11 = Circuit
 *  2 = Linear          12 = Ripple
 *  3 = Star            13 = Cracked Ice
 *  4 = Reverse         14 = Confetti
 *  5 = Diamond
 *  6 = Chevron
 *  7 = Hexagon
 *  8 = Swirl
 *  9 = Crosshatch
 */
export const foilPatternMask = Fn(([uvCoord_immutable, patternId_immutable]: [any, any]) => {
  const uv = vec2(uvCoord_immutable)
  const pid = float(patternId_immutable)

  // 0: Full
  const full = float(1)

  // 1: Cosmos — scattered circles of varying size
  const cUV = uv.mul(10)
  const cCell = vec2(cUV.x.floor(), cUV.y.floor())
  const cFrac = vec2(fract(cUV.x), fract(cUV.y))
  const cCenter = hash22(cCell).mul(0.6).add(0.2)
  const cDist = cFrac.sub(cCenter)
  const cR2 = dot(cDist, cDist)
  const cRadius = hash21(cCell.add(vec2(7, 3))).mul(0.04).add(0.015)
  const cosmos = smoothstep(cRadius.add(0.008), cRadius, cR2)

  // 2: Linear — horizontal stripes with soft edges
  const linF = fract(uv.y.mul(35))
  const linear = smoothstep(float(0.3), float(0.45), linF).mul(smoothstep(float(0.85), float(0.7), linF))

  // 3: Star — 4-pointed sparkle stars
  const sUV = uv.mul(8)
  const sCell = vec2(sUV.x.floor(), sUV.y.floor())
  const sF = vec2(fract(sUV.x).sub(0.5), fract(sUV.y).sub(0.5))
  const sDist1 = abs(sF.x).add(abs(sF.y))
  const sRot = sF.x.mul(0.707).add(sF.y.mul(0.707))
  const sRot2 = sF.x.mul(0.707).sub(sF.y.mul(0.707))
  const sDist2 = abs(sRot).add(abs(sRot2))
  const sMin = min(sDist1, sDist2)
  const sThr = hash21(sCell).mul(0.08).add(0.12)
  const star = smoothstep(sThr.add(0.02), sThr.sub(0.01), sMin)

  // 4: Reverse — border holo, art window clear
  const margin = float(0.12)
  const inArtX = smoothstep(margin, margin.add(0.02), uv.x)
    .mul(smoothstep(float(1).sub(margin), float(0.86), uv.x))
  const inArtY = smoothstep(float(0.15), float(0.17), uv.y)
    .mul(smoothstep(float(0.55), float(0.53), uv.y))
  const reverse = float(1).sub(inArtX.mul(inArtY).mul(0.85))

  // 5: Diamond — repeating diamond/rhombus grid
  const dUV = uv.mul(12)
  const dF = vec2(fract(dUV.x).sub(0.5), fract(dUV.y).sub(0.5))
  const dDist = abs(dF.x).add(abs(dF.y))
  const diamond = smoothstep(float(0.42), float(0.3), dDist)

  // 6: Chevron — V-shaped stripes
  const chevY = uv.y.mul(18)
  const chevOffset = abs(uv.x.sub(0.5)).mul(8)
  const chevF = fract(chevY.add(chevOffset))
  const chevron = smoothstep(float(0.2), float(0.35), chevF).mul(smoothstep(float(0.8), float(0.65), chevF))

  // 7: Hexagon — honeycomb cells
  const hScale = float(10)
  const hx = uv.x.mul(hScale)
  const hy = uv.y.mul(hScale).mul(1.1547) // 2/sqrt(3)
  const hRow = hy.floor()
  const hOff = select(fract(hRow.mul(0.5)).lessThan(0.25), float(0), float(0.5))
  const hcx = fract(hx.add(hOff)).sub(0.5)
  const hcy = fract(hy).sub(0.5)
  const hDist = abs(hcx).mul(1.0).add(abs(hcy).mul(0.577))
  const hexagon = smoothstep(float(0.48), float(0.42), hDist)

  // 8: Swirl — spiral/vortex from center
  const swirlC = uv.sub(vec2(0.5, 0.5))
  const swirlR = dot(swirlC, swirlC).mul(4) // squared distance
  const swirlAngle = float(0) // atan2 approximation using sin/cos trick
    .add(swirlC.x.mul(cos(swirlR.mul(15))))
    .add(swirlC.y.mul(sin(swirlR.mul(15))))
  const swirlF = fract(swirlAngle.mul(3).add(swirlR.mul(8)))
  const swirl = smoothstep(float(0.25), float(0.4), swirlF).mul(smoothstep(float(0.85), float(0.7), swirlF))

  // 9: Crosshatch — two sets of diagonal lines
  const ch1 = fract(uv.x.add(uv.y).mul(20))
  const ch2 = fract(uv.x.sub(uv.y).mul(20))
  const chLine1 = smoothstep(float(0.3), float(0.4), ch1).mul(smoothstep(float(0.8), float(0.7), ch1))
  const chLine2 = smoothstep(float(0.3), float(0.4), ch2).mul(smoothstep(float(0.8), float(0.7), ch2))
  const crosshatch = max(chLine1, chLine2)

  // 10: Scales — fish/dragon scale pattern
  const scUV = uv.mul(10)
  const scRow = scUV.y.floor()
  const scOff = select(fract(scRow.mul(0.5)).lessThan(0.25), float(0), float(0.5))
  const scFx = fract(scUV.x.add(scOff)).sub(0.5)
  const scFy = fract(scUV.y).sub(0.3)
  const scR = dot(vec2(scFx, scFy), vec2(scFx, scFy))
  const scales = smoothstep(float(0.18), float(0.12), scR)
    .mul(smoothstep(float(0.0), float(0.05), scFy.add(0.3)))

  // 11: Circuit — PCB-style lines and pads
  const ciUV = uv.mul(14)
  const ciCell = vec2(ciUV.x.floor(), ciUV.y.floor())
  const ciFrac = vec2(fract(ciUV.x), fract(ciUV.y))
  const ciRand = hash21(ciCell)
  // Horizontal or vertical line through cell
  const ciLineH = smoothstep(float(0.42), float(0.45), ciFrac.y).mul(smoothstep(float(0.58), float(0.55), ciFrac.y))
  const ciLineV = smoothstep(float(0.42), float(0.45), ciFrac.x).mul(smoothstep(float(0.58), float(0.55), ciFrac.x))
  const ciLine = select(ciRand.lessThan(0.5), ciLineH, ciLineV)
  // Pad at intersection
  const ciPadD = dot(ciFrac.sub(vec2(0.5, 0.5)), ciFrac.sub(vec2(0.5, 0.5)))
  const ciPad = smoothstep(float(0.03), float(0.02), ciPadD)
  const circuit = max(ciLine, ciPad)

  // 12: Ripple — concentric rings from center
  const ripC = uv.sub(vec2(0.5, 0.5))
  const ripR = dot(ripC, ripC).mul(4)
  const ripF = fract(ripR.mul(12))
  const ripple = smoothstep(float(0.25), float(0.4), ripF).mul(smoothstep(float(0.85), float(0.7), ripF))

  // 13: Cracked Ice — voronoi-style cracks
  const viUV = uv.mul(7)
  const viCell = vec2(viUV.x.floor(), viUV.y.floor())
  const viFrac = vec2(fract(viUV.x), fract(viUV.y))
  // Distance to nearest cell center (simplified 3x3 check approximation)
  const viCenter = hash22(viCell).mul(0.8).add(0.1)
  const viD1 = dot(viFrac.sub(viCenter), viFrac.sub(viCenter))
  const viCenter2 = hash22(viCell.add(vec2(1, 0))).mul(0.8).add(0.1)
  const viD2 = dot(viFrac.sub(viCenter2).sub(vec2(1, 0)), viFrac.sub(viCenter2).sub(vec2(1, 0)))
  const viCenter3 = hash22(viCell.add(vec2(0, 1))).mul(0.8).add(0.1)
  const viD3 = dot(viFrac.sub(viCenter3).sub(vec2(0, 1)), viFrac.sub(viCenter3).sub(vec2(0, 1)))
  const viMin = min(viD1, min(viD2, viD3))
  // Edge = where two cells are almost equidistant
  const viEdge = smoothstep(float(0.01), float(0.04), abs(viD1.sub(min(viD2, viD3))))
  const crackedIce = float(1).sub(viEdge).mul(0.7).add(0.3)

  // 14: Confetti — tiny random rectangles scattered
  const coUV = uv.mul(18)
  const coCell = vec2(coUV.x.floor(), coUV.y.floor())
  const coFrac = vec2(fract(coUV.x), fract(coUV.y))
  const coRand = hash21(coCell)
  const coShow = smoothstep(float(0.55), float(0.56), coRand) // ~45% of cells have confetti
  const coW = hash21(coCell.add(vec2(3, 7))).mul(0.3).add(0.15)
  const coH = hash21(coCell.add(vec2(7, 3))).mul(0.3).add(0.15)
  const coCx = hash21(coCell.add(vec2(1, 1))).mul(0.5).add(0.25)
  const coCy = hash21(coCell.add(vec2(2, 2))).mul(0.5).add(0.25)
  const coInX = smoothstep(coCx.sub(coW), coCx.sub(coW).add(0.02), coFrac.x)
    .mul(smoothstep(coCx.add(coW), coCx.add(coW).sub(0.02), coFrac.x))
  const coInY = smoothstep(coCy.sub(coH), coCy.sub(coH).add(0.02), coFrac.y)
    .mul(smoothstep(coCy.add(coH), coCy.add(coH).sub(0.02), coFrac.y))
  const confetti = coInX.mul(coInY).mul(coShow)

  // Chain selects: 0..14
  const result = select(pid.lessThan(0.5), full,
    select(pid.lessThan(1.5), cosmos,
      select(pid.lessThan(2.5), linear,
        select(pid.lessThan(3.5), star,
          select(pid.lessThan(4.5), reverse,
            select(pid.lessThan(5.5), diamond,
              select(pid.lessThan(6.5), chevron,
                select(pid.lessThan(7.5), hexagon,
                  select(pid.lessThan(8.5), swirl,
                    select(pid.lessThan(9.5), crosshatch,
                      select(pid.lessThan(10.5), scales,
                        select(pid.lessThan(11.5), circuit,
                          select(pid.lessThan(12.5), ripple,
                            select(pid.lessThan(13.5), crackedIce,
                              confetti,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  )

  return result
})

/**
 * Pattern depth — returns a small offset that perturbs the diffraction angle
 * based on the pattern shape. Makes patterns feel embossed/stamped with depth,
 * so light catches differently on pattern edges and surfaces.
 *
 * Returns vec2(du, dv) perturbation to add to diffraction coordinates.
 */
export const foilPatternDepth = Fn(([uvCoord_immutable, patternId_immutable]: [any, any]) => {
  const uv = vec2(uvCoord_immutable)
  const pid = float(patternId_immutable)

  // Compute pattern mask at this point and two nearby points for gradient
  const eps = float(0.002)
  const here = foilPatternMask(uv, pid)
  const right = foilPatternMask(uv.add(vec2(eps, 0)), pid)
  const up = foilPatternMask(uv.add(vec2(0, eps)), pid)

  // Gradient of the pattern = surface normal perturbation
  const dx = right.sub(here).div(eps).mul(0.04)
  const dy = up.sub(here).div(eps).mul(0.04)

  return vec2(dx, dy)
})

export type FoilPattern =
  | 'full' | 'cosmos' | 'linear' | 'star' | 'reverse'
  | 'diamond' | 'chevron' | 'hexagon' | 'swirl' | 'crosshatch'
  | 'scales' | 'circuit' | 'ripple' | 'cracked-ice' | 'confetti'

export const PATTERN_IDS: Record<FoilPattern, number> = {
  full: 0,
  cosmos: 1,
  linear: 2,
  star: 3,
  reverse: 4,
  diamond: 5,
  chevron: 6,
  hexagon: 7,
  swirl: 8,
  crosshatch: 9,
  scales: 10,
  circuit: 11,
  ripple: 12,
  'cracked-ice': 13,
  confetti: 14,
}
