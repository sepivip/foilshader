import { Fn, float, vec2, vec3, fract, sin, cos, dot, abs, max, clamp, smoothstep, select, PI } from 'three/tsl'

/**
 * Hash for pattern generation
 */
const hash21 = Fn(([p_immutable]: [any]) => {
  const p = vec2(p_immutable)
  const h = dot(p, vec2(127.1, 311.7))
  return fract(sin(h).mul(43758.5453123))
})

/**
 * Procedural foil pattern mask.
 * Returns a float 0–1 controlling where the holographic effect appears.
 *
 * Pattern IDs:
 *  0 = Full (entire surface)
 *  1 = Cosmos (scattered circles/dots)
 *  2 = Linear (horizontal stripes)
 *  3 = Star (star shapes)
 *  4 = Reverse (border only, art window clear)
 */
export const foilPatternMask = Fn(([uvCoord_immutable, patternId_immutable]: [any, any]) => {
  const uvCoord = vec2(uvCoord_immutable)
  const patternId = float(patternId_immutable)

  // Pattern 0: Full — everything is holographic
  const full = float(1)

  // Pattern 1: Cosmos — scattered circles
  const cosmosUV = uvCoord.mul(8)
  const cosmosCell = vec2(cosmosUV.x.floor(), cosmosUV.y.floor())
  const cosmosFrac = vec2(fract(cosmosUV.x), fract(cosmosUV.y))
  const cosmosCenter = vec2(
    hash21(cosmosCell).mul(0.6).add(0.2),
    hash21(cosmosCell.add(vec2(1, 0))).mul(0.6).add(0.2),
  )
  const cosmosDist = cosmosFrac.sub(cosmosCenter)
  const cosmosR = dot(cosmosDist, cosmosDist)
  const cosmosRadius = hash21(cosmosCell.add(vec2(0, 1))).mul(0.06).add(0.02)
  const cosmos = smoothstep(cosmosRadius.add(0.01), cosmosRadius, cosmosR)

  // Pattern 2: Linear — horizontal stripes
  const lineFreq = uvCoord.y.mul(30)
  const lineMask = smoothstep(float(0.3), float(0.5), fract(lineFreq))
    .mul(smoothstep(float(0.9), float(0.7), fract(lineFreq)))
  const linear = lineMask.mul(0.9).add(0.1)

  // Pattern 3: Star — six-pointed star shapes
  const starUV = uvCoord.mul(6)
  const starCell = vec2(starUV.x.floor(), starUV.y.floor())
  const starFrac = vec2(fract(starUV.x).sub(0.5), fract(starUV.y).sub(0.5))
  // Approximate 6-pointed star with max of 3 rotated abs lines
  const angle1 = abs(starFrac.x).add(abs(starFrac.y))
  const rx = starFrac.x.mul(0.866).add(starFrac.y.mul(0.5))
  const ry = starFrac.x.mul(-0.5).add(starFrac.y.mul(0.866))
  const angle2 = abs(rx).add(abs(ry))
  const starDist = max(angle1, angle2)
  const starThreshold = hash21(starCell).mul(0.1).add(0.25)
  const star = smoothstep(starThreshold.add(0.02), starThreshold.sub(0.02), starDist)

  // Pattern 4: Reverse — border holographic, art window clear
  // Typical card proportions: art window roughly centered, 15% margins
  const margin = float(0.12)
  const artTop = float(0.15)
  const artBottom = float(0.55)
  const inArtX = smoothstep(margin, margin.add(0.02), uvCoord.x)
    .mul(smoothstep(float(1).sub(margin), float(1).sub(margin).sub(0.02), uvCoord.x))
  const inArtY = smoothstep(artTop, artTop.add(0.02), uvCoord.y)
    .mul(smoothstep(artBottom, artBottom.sub(0.02), uvCoord.y))
  const inArt = inArtX.mul(inArtY)
  const reverse = float(1).sub(inArt.mul(0.85))

  // Select pattern based on ID using nested selects
  const result = select(
    patternId.lessThan(0.5),
    full,
    select(
      patternId.lessThan(1.5),
      cosmos,
      select(
        patternId.lessThan(2.5),
        linear,
        select(
          patternId.lessThan(3.5),
          star,
          reverse,
        ),
      ),
    ),
  )

  return result
})

export type FoilPattern = 'full' | 'cosmos' | 'linear' | 'star' | 'reverse'

export const PATTERN_IDS: Record<FoilPattern, number> = {
  full: 0,
  cosmos: 1,
  linear: 2,
  star: 3,
  reverse: 4,
}
