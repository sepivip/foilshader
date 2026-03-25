import { Fn, float, vec3, select, smoothstep } from 'three/tsl'

/**
 * Convert a wavelength in nm (380–780) to a linear RGB vec3.
 * Uses a piecewise fit of the CIE 1931 color matching functions.
 * Outside 380–780nm, fades to black via edge falloff.
 */
export const wavelengthToRGB = Fn(([wavelength_immutable]: [any]) => {
  const w = float(wavelength_immutable)

  // Red channel: violet tail (380-440), zero (440-510), ramp (510-580), plateau (580-645), falloff (645-780)
  const r = select(
    w.lessThan(510),
    select(
      w.lessThan(440),
      float(440).sub(w).div(60).mul(0.3).add(0.1),
      float(0)
    ),
    select(
      w.lessThan(580),
      w.sub(510).div(70),
      select(
        w.lessThan(645),
        float(1),
        float(1).sub(w.sub(645).div(135).mul(0.2))
      )
    )
  )

  // Green channel: zero (380-440), ramp (440-490), plateau (490-580), falloff (580-645), zero (645+)
  const g = select(
    w.lessThan(440),
    float(0),
    select(
      w.lessThan(490),
      w.sub(440).div(50),
      select(
        w.lessThan(580),
        float(1),
        select(
          w.lessThan(645),
          float(645).sub(w).div(65),
          float(0)
        )
      )
    )
  )

  // Blue channel: ramp down (380-440), falloff (440-490), zero (490+)
  const b = select(
    w.lessThan(380),
    float(0),
    select(
      w.lessThan(440),
      float(1).sub(w.sub(380).div(60).mul(0.3)),
      select(
        w.lessThan(490),
        float(490).sub(w).div(50),
        float(0)
      )
    )
  )

  // Intensity falloff at edges of visible spectrum
  const edgeFade = smoothstep(float(380), float(420), w)
    .mul(smoothstep(float(780), float(700), w))

  return vec3(r, g, b).mul(edgeFade)
})
