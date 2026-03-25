import { Fn, float, vec2, clamp, abs, sin } from 'three/tsl'

/**
 * Diffraction grating equation: d * (sin(θ_i) + sin(θ_m)) = m * λ
 * Solves for sin(θ_m) = (m * λ / d) - sin(θ_i)
 *
 * Returns vec2(sinTheta_m, valid) where valid is 1.0 if |sinTheta_m| <= 1.0
 * (physically realizable diffraction), 0.0 otherwise.
 *
 * @param incidenceAngle - θ_i in radians
 * @param wavelength - λ in nm
 * @param order - m (integer diffraction order)
 * @param gratingPeriod - d in nm
 */
export const diffractionSinAngle = Fn(([
  incidenceAngle_immutable,
  wavelength_immutable,
  order_immutable,
  gratingPeriod_immutable,
]: [any, any, any, any]) => {
  const incidenceAngle = float(incidenceAngle_immutable)
  const wavelength = float(wavelength_immutable)
  const order = float(order_immutable)
  const gratingPeriod = float(gratingPeriod_immutable)

  // sin(θ_m) = (m * λ / d) - sin(θ_i)
  const sinThetaM = order.mul(wavelength).div(gratingPeriod).sub(sin(incidenceAngle))

  // Valid if |sin(θ_m)| <= 1 (physically possible)
  // Sharp step: 1 when valid, 0 when not
  const valid = float(1).sub(clamp(abs(sinThetaM).sub(1).mul(1000), 0, 1))

  return vec2(sinThetaM, valid)
})
