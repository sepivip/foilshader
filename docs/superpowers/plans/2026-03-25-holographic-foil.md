# Holographic Foil Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a physics-based holographic foil shader library for Three.js with three fidelity tiers, interactive demo, and ESM+UMD distribution.

**Architecture:** Strategy pattern — shared core modules (grating equation, spectrum, sparkle noise, uniforms) composed by three separate shader factory functions (Fast, Balanced, Physical). A `HolographicCard` class wraps mesh creation, input handling, and material management. Three.js TSL compiles to both GLSL and WGSL from a single source.

**Tech Stack:** TypeScript, Three.js (>=0.171.0 with TSL), Vite (library + demo build), vanilla CSS.

**Spec:** `docs/superpowers/specs/2026-03-25-holographic-foil-design.md`

---

## File Structure

```
holographic-foil/
  src/
    core/
      uniforms.ts           — Shared uniform nodes (tilt, light, grating, roughness, etc.)
      spectrum.ts           — wavelengthToRGB TSL function (CIE analytical fit)
      grating.ts            — diffractionAngle TSL function (grating equation solver)
      sparkle.ts            — sparkleNoise TSL function (hash-based foil flakes)
    shaders/
      createFastFoil.ts     — Tier 1 factory: analytical rainbow
      createBalancedFoil.ts — Tier 2 factory: 8-wavelength sampled
      createPhysicalFoil.ts — Tier 3 factory: full spectral interference
      index.ts              — Re-exports all factories
    HolographicCard.ts      — High-level API (mesh + input + animation)
    index.ts                — Public entry (re-exports HolographicCard + factories)
  demo/
    index.html              — Demo HTML shell
    demo.ts                 — Demo app (scene, controls, upload)
    style.css               — Demo styles (vanilla CSS)
  package.json
  tsconfig.json
  vite.config.ts
  vite.config.demo.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vite.config.demo.ts`
- Create: `.gitignore`
- Create: `src/index.ts` (placeholder)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "holographic-foil",
  "version": "0.1.0",
  "description": "Physics-based holographic foil shader for Three.js",
  "type": "module",
  "main": "dist/holographic-foil.umd.js",
  "module": "dist/holographic-foil.es.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/holographic-foil.es.js",
      "require": "./dist/holographic-foil.umd.js",
      "types": "./dist/index.d.ts"
    },
    "./shaders": {
      "import": "./dist/shaders.es.js",
      "require": "./dist/shaders.umd.js",
      "types": "./dist/shaders/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "dev": "vite --config vite.config.demo.ts",
    "build": "vite build && vite build --config vite.config.demo.ts",
    "build:lib": "vite build",
    "build:demo": "vite build --config vite.config.demo.ts",
    "preview": "vite preview --config vite.config.demo.ts"
  },
  "peerDependencies": {
    "three": ">=0.171.0"
  },
  "devDependencies": {
    "three": "^0.183.0",
    "@types/three": "^0.183.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vite-plugin-dts": "^4.3.0"
  },
  "license": "MIT",
  "keywords": ["threejs", "holographic", "foil", "shader", "diffraction", "webgpu", "tsl"]
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationDir": "dist",
    "outDir": "dist",
    "sourceMap": true,
    "jsx": "preserve",
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "demo"]
}
```

- [ ] **Step 3: Create vite.config.ts (library build)**

```ts
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: {
        'holographic-foil': 'src/index.ts',
        'shaders': 'src/shaders/index.ts',
      },
      formats: ['es', 'umd'],
      name: 'HolographicFoil',
    },
    rollupOptions: {
      external: ['three', 'three/webgpu', 'three/tsl'],
      output: {
        globals: {
          'three': 'THREE',
          'three/webgpu': 'THREE',
          'three/tsl': 'THREE',
        },
      },
    },
  },
})
```

- [ ] **Step 4: Create vite.config.demo.ts (demo build)**

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'demo',
  base: './',
  build: {
    outDir: '../dist/demo',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.superpowers/
*.local
```

- [ ] **Step 6: Create placeholder src/index.ts**

```ts
export const VERSION = '0.1.0'
```

- [ ] **Step 7: Install dependencies and verify build**

Run: `npm install`
Expected: Clean install, `node_modules/` created.

Run: `npx vite build`
Expected: Build succeeds, `dist/` contains `holographic-foil.es.js` and `holographic-foil.umd.js`.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json vite.config.ts vite.config.demo.ts .gitignore src/index.ts
git commit -m "feat: project scaffolding with Vite library + demo build"
```

---

### Task 2: Core — Uniforms

**Files:**
- Create: `src/core/uniforms.ts`

- [ ] **Step 1: Create uniforms.ts**

All shader factories share these uniforms. Each factory will import and use what it needs.

```ts
import { uniform } from 'three/tsl'
import { Vector2, Vector3, Color, Texture } from 'three/webgpu'

export function createFoilUniforms() {
  return {
    /** Card tilt in radians (x, y) — driven by mouse/touch/gyroscope */
    tilt: uniform(new Vector2(0, 0)),
    /** Light direction (world space, will be normalized in shader) */
    lightDir: uniform(new Vector3(0, 1, 0.5)),
    /** 1/d where d = grating period in nm. Default: 1/1800 */
    gratingDensity: uniform(1 / 1800),
    /** Foil surface roughness 0–1 */
    foilRoughness: uniform(0.15),
    /** Foil intensity multiplier */
    foilIntensity: uniform(1.5),
    /** Thin-film thickness in nm (used by Physical tier) */
    foilThickness: uniform(500),
    /** Elapsed time in seconds */
    time: uniform(0),
  }
}

export type FoilUniforms = ReturnType<typeof createFoilUniforms>
```

- [ ] **Step 2: Commit**

```bash
git add src/core/uniforms.ts
git commit -m "feat: add shared foil uniform definitions"
```

---

### Task 3: Core — Spectrum (Wavelength to RGB)

**Files:**
- Create: `src/core/spectrum.ts`

- [ ] **Step 1: Create spectrum.ts**

Analytical approximation of CIE 1931 color matching functions. This maps a wavelength (380–780nm) to linear sRGB. Based on the well-known Bruton/CIE fit used in spectral rendering.

```ts
import { Fn, float, vec3, select, smoothstep, clamp } from 'three/tsl'

/**
 * Convert a wavelength in nm (380–780) to a linear RGB vec3.
 * Uses a piecewise Gaussian fit of the CIE 1931 color matching functions.
 * Outside 380–780nm, returns black.
 */
export const wavelengthToRGB = Fn(([wavelength_immutable]: [ReturnType<typeof float>]) => {
  const w = float(wavelength_immutable)

  // Red: peaks around 600nm
  const r = select(
    w.lessThan(510),
    // 380-440: ramp up from violet, 440-510: zero
    select(
      w.lessThan(440),
      float(440).sub(w).div(60).mul(0.3).add(0.1), // violet tail
      float(0)
    ),
    // 510-580: ramp up, 580+: plateau then fall
    select(
      w.lessThan(580),
      w.sub(510).div(70),
      select(
        w.lessThan(645),
        float(1),
        // 645-780: gentle falloff
        float(1).sub(w.sub(645).div(135).mul(0.2))
      )
    )
  )

  // Green: peaks around 540nm
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

  // Blue: peaks around 460nm
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
```

- [ ] **Step 2: Verify visually**

This function will be tested visually when the first shader factory (Task 6) renders a rainbow. For now, verify it compiles by importing it in `src/index.ts`:

Add to `src/index.ts`:
```ts
export { wavelengthToRGB } from './core/spectrum'
```

Run: `npx vite build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/core/spectrum.ts src/index.ts
git commit -m "feat: add wavelengthToRGB TSL function (CIE analytical fit)"
```

---

### Task 4: Core — Grating (Diffraction Equation)

**Files:**
- Create: `src/core/grating.ts`

- [ ] **Step 1: Create grating.ts**

Solves the diffraction grating equation for the exit angle given incidence angle, wavelength, order, and grating period.

```ts
import { Fn, float, vec2, clamp, abs, asin, sin } from 'three/tsl'

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
]: [
  ReturnType<typeof float>,
  ReturnType<typeof float>,
  ReturnType<typeof float>,
  ReturnType<typeof float>,
]) => {
  const incidenceAngle = float(incidenceAngle_immutable)
  const wavelength = float(wavelength_immutable)
  const order = float(order_immutable)
  const gratingPeriod = float(gratingPeriod_immutable)

  // sin(θ_m) = (m * λ / d) - sin(θ_i)
  const sinThetaM = order.mul(wavelength).div(gratingPeriod).sub(sin(incidenceAngle))

  // Valid if |sin(θ_m)| <= 1 (physically possible)
  const valid = float(1).sub(clamp(abs(sinThetaM).sub(1).mul(1000), 0, 1))

  return vec2(sinThetaM, valid)
})
```

- [ ] **Step 2: Update src/index.ts and verify build**

Add to `src/index.ts`:
```ts
export { diffractionSinAngle } from './core/grating'
```

Run: `npx vite build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/core/grating.ts src/index.ts
git commit -m "feat: add diffractionSinAngle TSL function (grating equation)"
```

---

### Task 5: Core — Sparkle Noise

**Files:**
- Create: `src/core/sparkle.ts`

- [ ] **Step 1: Create sparkle.ts**

Hash-based noise simulating microscopic foil imperfections. Produces tiny bright flecks that shift as the viewing angle changes.

```ts
import { Fn, float, vec2, vec3, fract, sin, dot, abs, pow, clamp } from 'three/tsl'

/**
 * Hash function for pseudo-random noise. Maps vec2 → float in [0,1].
 */
const hash21 = Fn(([p_immutable]: [ReturnType<typeof vec2>]) => {
  const p = vec2(p_immutable)
  const h = dot(p, vec2(127.1, 311.7))
  return fract(sin(h).mul(43758.5453123))
})

/**
 * Sparkle noise simulating foil micro-facets.
 * Returns a vec3 sparkle color (white flecks, intensity varies by angle).
 *
 * @param uvCoord - fragment UV
 * @param viewDotNormal - dot(viewDir, normal), 0–1
 * @param time - elapsed time for subtle shimmer
 * @param roughness - controls sparkle density (0 = none, 1 = dense)
 */
export const sparkleNoise = Fn(([
  uvCoord_immutable,
  viewDotNormal_immutable,
  time_immutable,
  roughness_immutable,
]: [
  ReturnType<typeof vec2>,
  ReturnType<typeof float>,
  ReturnType<typeof float>,
  ReturnType<typeof float>,
]) => {
  const uvCoord = vec2(uvCoord_immutable)
  const viewDotNormal = float(viewDotNormal_immutable)
  const time = float(time_immutable)
  const roughness = float(roughness_immutable)

  // High-frequency UV grid for tiny flakes
  const gridUV = uvCoord.mul(200)
  const cellId = vec2(gridUV.x.floor(), gridUV.y.floor())

  // Random value per cell, modulated by time for shimmer
  const rand = hash21(cellId.add(vec2(time.mul(0.1).floor(), 0)))

  // Sparkle threshold — lower roughness = fewer but brighter flecks
  const threshold = float(1).sub(roughness.mul(0.3))

  // Angle-dependent intensity — sparkles at glancing angles
  const angleFactor = pow(float(1).sub(viewDotNormal), float(3))

  // Combine: only show sparkle if random exceeds threshold AND angle is right
  const sparkle = clamp(
    rand.sub(threshold).mul(50),
    0,
    1
  ).mul(angleFactor)

  return vec3(sparkle, sparkle, sparkle)
})
```

- [ ] **Step 2: Update src/index.ts and verify build**

Add to `src/index.ts`:
```ts
export { sparkleNoise } from './core/sparkle'
```

Run: `npx vite build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/core/sparkle.ts src/index.ts
git commit -m "feat: add sparkleNoise TSL function (foil micro-facet flakes)"
```

---

### Task 6: Shader Factory — createFastFoil (Tier 1)

**Files:**
- Create: `src/shaders/createFastFoil.ts`

- [ ] **Step 1: Create createFastFoil.ts**

Tier 1: Analytical approximation. No wavelength loop. Solves grating equation for m=1 and maps the result to a hue.

```ts
import * as THREE from 'three/webgpu'
import {
  Fn, float, vec2, vec3, vec4, texture, uv, normalize,
  positionWorld, normalWorld, cameraPosition,
  dot, sin, acos, mix, clamp, max, asin, abs,
} from 'three/tsl'
import { createFoilUniforms, type FoilUniforms } from '../core/uniforms'
import { wavelengthToRGB } from '../core/spectrum'
import { sparkleNoise } from '../core/sparkle'

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

export function createFastFoil(options: FoilMaterialOptions = {}): FoilMaterialResult {
  const uniforms = createFoilUniforms()

  // Apply options
  if (options.gratingDensity !== undefined) uniforms.gratingDensity.value = options.gratingDensity
  if (options.foilRoughness !== undefined) uniforms.foilRoughness.value = options.foilRoughness
  if (options.foilIntensity !== undefined) uniforms.foilIntensity.value = options.foilIntensity
  if (options.foilThickness !== undefined) uniforms.foilThickness.value = options.foilThickness
  if (options.lightDirection !== undefined) uniforms.lightDir.value.copy(options.lightDirection)

  const foilShader = Fn(() => {
    const uvCoord = uv()

    // Compute tilted normal from card surface normal + tilt uniform
    const tiltX = uniforms.tilt.x
    const tiltY = uniforms.tilt.y
    // Simple rotation: rotate base normal (0,0,1) by tilt
    const n = normalize(vec3(sin(tiltX), sin(tiltY), float(1)))
    const lightDir = normalize(vec3(uniforms.lightDir))
    const viewDir = normalize(cameraPosition.sub(positionWorld))

    // Incidence angle = angle between light and surface normal
    const incidence = acos(clamp(dot(n, lightDir), float(-1), float(1)))

    // Grating period d = 1 / gratingDensity (in nm)
    const d = float(1).div(uniforms.gratingDensity)

    // For m=1: sin(θ_m) = λ/d - sin(θ_i)
    // Solve for the wavelength that diffracts toward the viewer:
    // The viewer sees light where sin(θ_m) ≈ dot(viewDir, surface tangent)
    const viewAngle = acos(clamp(dot(n, viewDir), float(-1), float(1)))
    const sinView = sin(viewAngle)

    // λ = d * (sin(θ_i) + sin(θ_m)) / m — with m=1
    const lambda = d.mul(sin(incidence).add(sinView))

    // Clamp to visible range and get color
    const lambdaClamped = clamp(lambda, float(380), float(780))
    const inRange = clamp(
      float(1).sub(abs(lambda.sub(float(580))).sub(float(200)).mul(0.01)),
      0, 1
    )
    const rainbowColor = wavelengthToRGB(lambdaClamped).mul(inRange)

    // Intensity: cosine falloff
    const NdotV = max(dot(n, viewDir), float(0))
    const NdotL = max(dot(n, lightDir), float(0))
    const intensity = NdotV.mul(NdotL)

    // Foil color
    const foilColor = rainbowColor.mul(intensity).mul(uniforms.foilIntensity)

    // Sparkle
    const sparkle = sparkleNoise(
      uvCoord,
      NdotV,
      uniforms.time,
      uniforms.foilRoughness,
    )

    // Blend with base texture
    const baseColor = options.baseTexture
      ? texture(options.baseTexture, uvCoord).rgb
      : vec3(0.15, 0.15, 0.2) // placeholder gradient dark

    const ambient = float(0.65)
    const finalColor = baseColor.mul(ambient.add(foilColor).add(sparkle.mul(0.3)))

    return vec4(finalColor, float(1))
  })

  const material = new THREE.NodeMaterial()
  material.fragmentNode = foilShader()
  material.side = THREE.DoubleSide

  return { material, uniforms }
}
```

- [ ] **Step 2: Create shaders/index.ts**

```ts
export { createFastFoil } from './createFastFoil'
export type { FoilMaterialOptions, FoilMaterialResult } from './createFastFoil'
```

- [ ] **Step 3: Update src/index.ts**

```ts
export { createFastFoil } from './shaders/createFastFoil'
export { createFoilUniforms } from './core/uniforms'
export { wavelengthToRGB } from './core/spectrum'
export { diffractionSinAngle } from './core/grating'
export { sparkleNoise } from './core/sparkle'
export type { FoilMaterialOptions, FoilMaterialResult, FoilUniforms } from './shaders/createFastFoil'
export type { FoilUniforms as FoilUniformsType } from './core/uniforms'
```

- [ ] **Step 4: Verify build**

Run: `npx vite build`
Expected: Build succeeds. `dist/` contains library files.

- [ ] **Step 5: Commit**

```bash
git add src/shaders/createFastFoil.ts src/shaders/index.ts src/index.ts
git commit -m "feat: add createFastFoil shader factory (Tier 1 — analytical)"
```

---

### Task 7: Shader Factory — createBalancedFoil (Tier 2)

**Files:**
- Create: `src/shaders/createBalancedFoil.ts`

- [ ] **Step 1: Create createBalancedFoil.ts**

Tier 2: Samples 8 wavelengths, 3 diffraction orders (m = -1, 0, +1), sinc-like intensity falloff.

```ts
import * as THREE from 'three/webgpu'
import {
  Fn, float, vec2, vec3, vec4, texture, uv, normalize, int,
  positionWorld, normalWorld, cameraPosition,
  dot, sin, acos, cos, mix, clamp, max, abs, pow, asin,
  Loop,
} from 'three/tsl'
import { createFoilUniforms, type FoilUniforms } from '../core/uniforms'
import { wavelengthToRGB } from '../core/spectrum'
import { diffractionSinAngle } from '../core/grating'
import { sparkleNoise } from '../core/sparkle'
import type { FoilMaterialOptions, FoilMaterialResult } from './createFastFoil'

const NUM_WAVELENGTHS = 8
const ORDERS = [-1, 0, 1]

export function createBalancedFoil(options: FoilMaterialOptions = {}): FoilMaterialResult {
  const uniforms = createFoilUniforms()

  if (options.gratingDensity !== undefined) uniforms.gratingDensity.value = options.gratingDensity
  if (options.foilRoughness !== undefined) uniforms.foilRoughness.value = options.foilRoughness
  if (options.foilIntensity !== undefined) uniforms.foilIntensity.value = options.foilIntensity
  if (options.foilThickness !== undefined) uniforms.foilThickness.value = options.foilThickness
  if (options.lightDirection !== undefined) uniforms.lightDir.value.copy(options.lightDirection)

  const foilShader = Fn(() => {
    const uvCoord = uv()

    // Tilted normal
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
      // Wavelength from 380 to 780nm
      const t = i.toFloat().div(float(NUM_WAVELENGTHS - 1))
      const lambda = mix(float(380), float(780), t)
      const rgb = wavelengthToRGB(lambda)

      // Sum contributions from each diffraction order
      const orderContrib = float(0).toVar()

      // m = -1
      const result_m1 = diffractionSinAngle(incidence, lambda, float(-1), d)
      const sinTheta_m1 = result_m1.x
      const valid_m1 = result_m1.y
      // How close is this diffracted beam to the viewer?
      const diff_m1 = abs(sinTheta_m1.sub(sinViewAngle))
      // Sinc-like falloff: intensity peaks when diff ≈ 0
      const intensity_m1 = max(float(1).sub(diff_m1.mul(5)), float(0))
      orderContrib.addAssign(intensity_m1.mul(intensity_m1).mul(valid_m1))

      // m = 0
      const result_0 = diffractionSinAngle(incidence, lambda, float(0), d)
      const sinTheta_0 = result_0.x
      const valid_0 = result_0.y
      const diff_0 = abs(sinTheta_0.sub(sinViewAngle))
      const intensity_0 = max(float(1).sub(diff_0.mul(5)), float(0))
      orderContrib.addAssign(intensity_0.mul(intensity_0).mul(valid_0).mul(0.3))

      // m = +1
      const result_p1 = diffractionSinAngle(incidence, lambda, float(1), d)
      const sinTheta_p1 = result_p1.x
      const valid_p1 = result_p1.y
      const diff_p1 = abs(sinTheta_p1.sub(sinViewAngle))
      const intensity_p1 = max(float(1).sub(diff_p1.mul(5)), float(0))
      orderContrib.addAssign(intensity_p1.mul(intensity_p1).mul(valid_p1))

      totalColor.addAssign(rgb.mul(orderContrib))
    })

    // Normalize
    const foilColor = totalColor.div(float(NUM_WAVELENGTHS)).mul(uniforms.foilIntensity)

    // Sparkle
    const NdotV = max(dot(n, viewDir), float(0))
    const sparkle = sparkleNoise(uvCoord, NdotV, uniforms.time, uniforms.foilRoughness)

    // Base texture
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
```

- [ ] **Step 2: Update shaders/index.ts**

Add export:
```ts
export { createBalancedFoil } from './createBalancedFoil'
```

- [ ] **Step 3: Update src/index.ts**

Add export:
```ts
export { createBalancedFoil } from './shaders/createBalancedFoil'
```

- [ ] **Step 4: Verify build**

Run: `npx vite build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/shaders/createBalancedFoil.ts src/shaders/index.ts src/index.ts
git commit -m "feat: add createBalancedFoil shader factory (Tier 2 — 8 wavelengths, 3 orders)"
```

---

### Task 8: Shader Factory — createPhysicalFoil (Tier 3)

**Files:**
- Create: `src/shaders/createPhysicalFoil.ts`

- [ ] **Step 1: Create createPhysicalFoil.ts**

Tier 3: Full spectral rendering. 12 wavelengths, 5 orders (m=-2..+2), complex wave interference, thin-film boost, per-pixel roughness noise.

```ts
import * as THREE from 'three/webgpu'
import {
  Fn, float, vec2, vec3, vec4, texture, uv, normalize, int,
  positionWorld, normalWorld, cameraPosition,
  dot, sin, cos, acos, mix, clamp, max, abs, pow, fract, asin,
  Loop, PI,
} from 'three/tsl'
import { createFoilUniforms, type FoilUniforms } from '../core/uniforms'
import { wavelengthToRGB } from '../core/spectrum'
import { diffractionSinAngle } from '../core/grating'
import { sparkleNoise } from '../core/sparkle'
import type { FoilMaterialOptions, FoilMaterialResult } from './createFastFoil'

const NUM_WAVELENGTHS = 12
const NUM_ORDERS = 5 // m = -2, -1, 0, 1, 2

/**
 * Simple hash for per-pixel roughness noise.
 */
const hash22 = Fn(([p_immutable]: [ReturnType<typeof vec2>]) => {
  const p = vec2(p_immutable)
  const d = dot(p, vec2(127.1, 311.7))
  const d2 = dot(p, vec2(269.5, 183.3))
  return vec2(
    fract(sin(d).mul(43758.5453)),
    fract(sin(d2).mul(43758.5453)),
  )
})

export function createPhysicalFoil(options: FoilMaterialOptions = {}): FoilMaterialResult {
  const uniforms = createFoilUniforms()

  if (options.gratingDensity !== undefined) uniforms.gratingDensity.value = options.gratingDensity
  if (options.foilRoughness !== undefined) uniforms.foilRoughness.value = options.foilRoughness
  if (options.foilIntensity !== undefined) uniforms.foilIntensity.value = options.foilIntensity
  if (options.foilThickness !== undefined) uniforms.foilThickness.value = options.foilThickness
  if (options.lightDirection !== undefined) uniforms.lightDir.value.copy(options.lightDirection)

  const foilShader = Fn(() => {
    const uvCoord = uv()

    // Tilted normal
    const tiltX = uniforms.tilt.x
    const tiltY = uniforms.tilt.y
    const n = normalize(vec3(sin(tiltX), sin(tiltY), float(1)))
    const lightDir = normalize(vec3(uniforms.lightDir))
    const viewDir = normalize(cameraPosition.sub(positionWorld))

    const incidence = acos(clamp(dot(n, lightDir), float(-1), float(1)))
    const viewAngle = acos(clamp(dot(n, viewDir), float(-1), float(1)))
    const sinViewAngle = sin(viewAngle)

    const d = float(1).div(uniforms.gratingDensity)

    // Per-pixel roughness noise (random phase perturbation)
    const pixelNoise = hash22(uvCoord.mul(500))
    const phaseNoise = pixelNoise.x.mul(uniforms.foilRoughness).mul(PI.mul(2))

    // Thin-film parameters
    const filmThickness = uniforms.foilThickness // nm
    const nFilm = float(1.5) // refractive index of foil coating

    // Accumulate color across wavelengths
    const totalColor = vec3(0, 0, 0).toVar()

    Loop(NUM_WAVELENGTHS, ({ i }) => {
      const t = i.toFloat().div(float(NUM_WAVELENGTHS - 1))
      const lambda = mix(float(380), float(780), t)
      const rgb = wavelengthToRGB(lambda)

      // Complex amplitude summation across orders
      const ampReal = float(0).toVar()
      const ampImag = float(0).toVar()

      // m = -2
      const r_m2 = diffractionSinAngle(incidence, lambda, float(-2), d)
      const sinT_m2 = r_m2.x
      const v_m2 = r_m2.y
      const diff_m2 = abs(sinT_m2.sub(sinViewAngle))
      const envelope_m2 = max(float(1).sub(diff_m2.mul(3)), float(0)).mul(v_m2)
      const pathDiff_m2 = d.mul(float(-2)).mul(sin(incidence))
      const thinFilm_m2 = filmThickness.mul(nFilm).mul(2).mul(cos(incidence).mul(0.8))
      const phase_m2 = pathDiff_m2.add(thinFilm_m2).div(lambda).mul(PI.mul(2)).add(phaseNoise)
      ampReal.addAssign(cos(phase_m2).mul(envelope_m2))
      ampImag.addAssign(sin(phase_m2).mul(envelope_m2))

      // m = -1
      const r_m1 = diffractionSinAngle(incidence, lambda, float(-1), d)
      const sinT_m1 = r_m1.x
      const v_m1 = r_m1.y
      const diff_m1 = abs(sinT_m1.sub(sinViewAngle))
      const envelope_m1 = max(float(1).sub(diff_m1.mul(3)), float(0)).mul(v_m1)
      const pathDiff_m1 = d.mul(float(-1)).mul(sin(incidence))
      const thinFilm_m1 = filmThickness.mul(nFilm).mul(2).mul(cos(incidence).mul(0.9))
      const phase_m1 = pathDiff_m1.add(thinFilm_m1).div(lambda).mul(PI.mul(2)).add(phaseNoise)
      ampReal.addAssign(cos(phase_m1).mul(envelope_m1))
      ampImag.addAssign(sin(phase_m1).mul(envelope_m1))

      // m = 0
      const r_0 = diffractionSinAngle(incidence, lambda, float(0), d)
      const sinT_0 = r_0.x
      const v_0 = r_0.y
      const diff_0 = abs(sinT_0.sub(sinViewAngle))
      const envelope_0 = max(float(1).sub(diff_0.mul(3)), float(0)).mul(v_0).mul(0.3)
      const pathDiff_0 = float(0)
      const thinFilm_0 = filmThickness.mul(nFilm).mul(2).mul(cos(incidence))
      const phase_0 = pathDiff_0.add(thinFilm_0).div(lambda).mul(PI.mul(2)).add(phaseNoise)
      ampReal.addAssign(cos(phase_0).mul(envelope_0))
      ampImag.addAssign(sin(phase_0).mul(envelope_0))

      // m = +1
      const r_p1 = diffractionSinAngle(incidence, lambda, float(1), d)
      const sinT_p1 = r_p1.x
      const v_p1 = r_p1.y
      const diff_p1 = abs(sinT_p1.sub(sinViewAngle))
      const envelope_p1 = max(float(1).sub(diff_p1.mul(3)), float(0)).mul(v_p1)
      const pathDiff_p1 = d.mul(float(1)).mul(sin(incidence))
      const thinFilm_p1 = filmThickness.mul(nFilm).mul(2).mul(cos(incidence).mul(0.9))
      const phase_p1 = pathDiff_p1.add(thinFilm_p1).div(lambda).mul(PI.mul(2)).add(phaseNoise)
      ampReal.addAssign(cos(phase_p1).mul(envelope_p1))
      ampImag.addAssign(sin(phase_p1).mul(envelope_p1))

      // m = +2
      const r_p2 = diffractionSinAngle(incidence, lambda, float(2), d)
      const sinT_p2 = r_p2.x
      const v_p2 = r_p2.y
      const diff_p2 = abs(sinT_p2.sub(sinViewAngle))
      const envelope_p2 = max(float(1).sub(diff_p2.mul(3)), float(0)).mul(v_p2)
      const pathDiff_p2 = d.mul(float(2)).mul(sin(incidence))
      const thinFilm_p2 = filmThickness.mul(nFilm).mul(2).mul(cos(incidence).mul(0.8))
      const phase_p2 = pathDiff_p2.add(thinFilm_p2).div(lambda).mul(PI.mul(2)).add(phaseNoise)
      ampReal.addAssign(cos(phase_p2).mul(envelope_p2))
      ampImag.addAssign(sin(phase_p2).mul(envelope_p2))

      // Intensity = |A|^2
      const intensity = ampReal.mul(ampReal).add(ampImag.mul(ampImag))

      totalColor.addAssign(rgb.mul(intensity))
    })

    // Normalize and apply intensity
    const foilColor = totalColor.div(float(NUM_WAVELENGTHS)).mul(uniforms.foilIntensity)

    // Sparkle
    const NdotV = max(dot(n, viewDir), float(0))
    const sparkle = sparkleNoise(uvCoord, NdotV, uniforms.time, uniforms.foilRoughness)

    // Base texture
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
```

- [ ] **Step 2: Update shaders/index.ts**

Add export:
```ts
export { createPhysicalFoil } from './createPhysicalFoil'
```

- [ ] **Step 3: Update src/index.ts**

Add export:
```ts
export { createPhysicalFoil } from './shaders/createPhysicalFoil'
```

- [ ] **Step 4: Verify build**

Run: `npx vite build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/shaders/createPhysicalFoil.ts src/shaders/index.ts src/index.ts
git commit -m "feat: add createPhysicalFoil shader factory (Tier 3 — full spectral interference)"
```

---

### Task 9: HolographicCard Class

**Files:**
- Create: `src/HolographicCard.ts`

- [ ] **Step 1: Create HolographicCard.ts**

The high-level API that wraps mesh creation, material management, and input handling (mouse, touch, gyroscope).

```ts
import * as THREE from 'three/webgpu'
import { createFastFoil } from './shaders/createFastFoil'
import { createBalancedFoil } from './shaders/createBalancedFoil'
import { createPhysicalFoil } from './shaders/createPhysicalFoil'
import type { FoilMaterialOptions, FoilMaterialResult } from './shaders/createFastFoil'
import type { FoilUniforms } from './core/uniforms'

export type QualityTier = 'fast' | 'balanced' | 'physical'
export type InputMode = 'auto' | 'mouse' | 'touch' | 'gyroscope' | 'none'

export interface HolographicCardOptions {
  texture?: string | THREE.Texture
  quality?: QualityTier
  width?: number
  height?: number
  inputMode?: InputMode
  autoTilt?: boolean
  animationSpeed?: number
  gratingDensity?: number
  foilRoughness?: number
  foilIntensity?: number
  foilThickness?: number
  lightDirection?: THREE.Vector3
}

const FACTORY_MAP = {
  fast: createFastFoil,
  balanced: createBalancedFoil,
  physical: createPhysicalFoil,
} as const

export class HolographicCard {
  readonly mesh: THREE.Mesh
  private _quality: QualityTier
  private _inputMode: InputMode
  private _uniforms: FoilUniforms
  private _material: THREE.NodeMaterial
  private _scene: THREE.Scene
  private _options: FoilMaterialOptions
  private _loadedTexture: THREE.Texture | undefined
  private _autoTilt: boolean
  private _animationSpeed: number
  private _idleTimer = 0
  private _isInteracting = false

  // Input state
  private _mouseDown = false
  private _lastMouse = { x: 0, y: 0 }
  private _boundOnMouseMove: ((e: MouseEvent) => void) | null = null
  private _boundOnMouseDown: ((e: MouseEvent) => void) | null = null
  private _boundOnMouseUp: ((e: MouseEvent) => void) | null = null
  private _boundOnTouchMove: ((e: TouchEvent) => void) | null = null
  private _boundOnTouchStart: ((e: TouchEvent) => void) | null = null
  private _boundOnTouchEnd: ((e: TouchEvent) => void) | null = null
  private _boundOnDeviceOrientation: ((e: DeviceOrientationEvent) => void) | null = null
  private _gyroscopeActive = false
  private _domElement: HTMLElement | null = null

  constructor(scene: THREE.Scene, options: HolographicCardOptions = {}) {
    this._scene = scene
    this._quality = options.quality ?? 'balanced'
    this._inputMode = options.inputMode ?? 'auto'
    this._autoTilt = options.autoTilt ?? true
    this._animationSpeed = options.animationSpeed ?? 1

    const width = options.width ?? 2.5
    const height = options.height ?? 3.5

    // Load texture if string URL provided
    if (typeof options.texture === 'string') {
      const loader = new THREE.TextureLoader()
      this._loadedTexture = loader.load(options.texture)
      this._loadedTexture.colorSpace = THREE.SRGBColorSpace
    } else if (options.texture) {
      this._loadedTexture = options.texture
    }

    this._options = {
      baseTexture: this._loadedTexture,
      gratingDensity: options.gratingDensity,
      foilRoughness: options.foilRoughness,
      foilIntensity: options.foilIntensity,
      foilThickness: options.foilThickness,
      lightDirection: options.lightDirection,
    }

    // Create material
    const result = this._createMaterial()
    this._material = result.material
    this._uniforms = result.uniforms

    // Create mesh
    const geometry = new THREE.PlaneGeometry(width, height)
    this.mesh = new THREE.Mesh(geometry, this._material)
    scene.add(this.mesh)
  }

  private _createMaterial(): FoilMaterialResult {
    const factory = FACTORY_MAP[this._quality]
    return factory(this._options)
  }

  // --- Public API: Properties ---

  get quality(): QualityTier { return this._quality }
  set quality(value: QualityTier) {
    if (value === this._quality) return
    this._quality = value
    const tiltValue = { x: this._uniforms.tilt.value.x, y: this._uniforms.tilt.value.y }
    const result = this._createMaterial()
    this._material.dispose()
    this._material = result.material
    this._uniforms = result.uniforms
    this._uniforms.tilt.value.set(tiltValue.x, tiltValue.y)
    this.mesh.material = this._material
  }

  get gratingDensity(): number { return this._uniforms.gratingDensity.value }
  set gratingDensity(v: number) { this._uniforms.gratingDensity.value = v }

  get foilRoughness(): number { return this._uniforms.foilRoughness.value }
  set foilRoughness(v: number) { this._uniforms.foilRoughness.value = v }

  get foilIntensity(): number { return this._uniforms.foilIntensity.value }
  set foilIntensity(v: number) { this._uniforms.foilIntensity.value = v }

  get foilThickness(): number { return this._uniforms.foilThickness.value }
  set foilThickness(v: number) { this._uniforms.foilThickness.value = v }

  get lightDirection(): THREE.Vector3 { return this._uniforms.lightDir.value }

  get tilt(): THREE.Vector2 { return this._uniforms.tilt.value }

  get autoTilt(): boolean { return this._autoTilt }
  set autoTilt(v: boolean) { this._autoTilt = v }

  get animationSpeed(): number { return this._animationSpeed }
  set animationSpeed(v: number) { this._animationSpeed = v }

  get inputMode(): InputMode { return this._inputMode }
  set inputMode(mode: InputMode) {
    this._removeInputListeners()
    this._inputMode = mode
    if (this._domElement) this._setupInputListeners(this._domElement)
  }

  // --- Texture ---

  setTexture(textureOrUrl: string | THREE.Texture): void {
    if (typeof textureOrUrl === 'string') {
      const loader = new THREE.TextureLoader()
      this._loadedTexture = loader.load(textureOrUrl)
      this._loadedTexture.colorSpace = THREE.SRGBColorSpace
    } else {
      this._loadedTexture = textureOrUrl
    }
    this._options.baseTexture = this._loadedTexture
    // Rebuild material with new texture
    const tiltValue = { x: this._uniforms.tilt.value.x, y: this._uniforms.tilt.value.y }
    const result = this._createMaterial()
    this._material.dispose()
    this._material = result.material
    this._uniforms = result.uniforms
    this._uniforms.tilt.value.set(tiltValue.x, tiltValue.y)
    this.mesh.material = this._material
  }

  // --- Input Handling ---

  setupInput(domElement: HTMLElement): void {
    this._domElement = domElement
    this._setupInputListeners(domElement)
  }

  private _setupInputListeners(domElement: HTMLElement): void {
    const mode = this._inputMode

    if (mode === 'mouse' || mode === 'auto') {
      // Hover-based tilt: mouse position over the element maps directly to tilt
      // No click required — more natural for a card showcase
      this._boundOnMouseMove = (e: MouseEvent) => {
        const rect = domElement.getBoundingClientRect()
        // Map mouse position to [-1, 1] range relative to element center
        const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2
        const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2
        this._uniforms.tilt.value.x = x * 0.6
        this._uniforms.tilt.value.y = -y * 0.4
        this._isInteracting = true
        this._idleTimer = 0
      }
      this._boundOnMouseUp = () => {
        this._isInteracting = false
      }
      domElement.addEventListener('mousemove', this._boundOnMouseMove)
      domElement.addEventListener('mouseleave', this._boundOnMouseUp)
    }

    if (mode === 'touch' || mode === 'auto') {
      this._boundOnTouchStart = (e: TouchEvent) => {
        this._isInteracting = true
        this._idleTimer = 0
        if (e.touches.length === 1) {
          this._lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        }
        // Request gyroscope permission on first touch (iOS)
        if (mode === 'auto' && !this._gyroscopeActive) {
          this._requestGyroscope()
        }
      }
      this._boundOnTouchEnd = () => {
        this._isInteracting = false
      }
      this._boundOnTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 1) return
        e.preventDefault()
        const touch = e.touches[0]
        const dx = (touch.clientX - this._lastMouse.x) * 0.005
        const dy = (touch.clientY - this._lastMouse.y) * 0.005
        this._uniforms.tilt.value.x += dx
        this._uniforms.tilt.value.y += dy
        this._uniforms.tilt.value.x = Math.max(-1, Math.min(1, this._uniforms.tilt.value.x))
        this._uniforms.tilt.value.y = Math.max(-1, Math.min(1, this._uniforms.tilt.value.y))
        this._lastMouse = { x: touch.clientX, y: touch.clientY }
      }
      domElement.addEventListener('touchstart', this._boundOnTouchStart, { passive: true })
      domElement.addEventListener('touchend', this._boundOnTouchEnd)
      domElement.addEventListener('touchmove', this._boundOnTouchMove, { passive: false })
    }

    if (mode === 'gyroscope' || mode === 'auto') {
      this._requestGyroscope()
    }
  }

  private async _requestGyroscope(): Promise<void> {
    // Check if DeviceOrientationEvent is available
    if (typeof DeviceOrientationEvent === 'undefined') return

    // iOS 13+ requires permission
    const DOE = DeviceOrientationEvent as any
    if (typeof DOE.requestPermission === 'function') {
      try {
        const permission = await DOE.requestPermission()
        if (permission !== 'granted') return
      } catch {
        return
      }
    }

    this._boundOnDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return
      this._gyroscopeActive = true
      // Map device tilt to card tilt
      // beta: front-back tilt (-180 to 180), gamma: left-right tilt (-90 to 90)
      this._uniforms.tilt.value.x = (e.gamma / 90) * 0.8
      this._uniforms.tilt.value.y = ((e.beta - 45) / 90) * 0.8 // offset: phone held at ~45°
      this._isInteracting = true
      this._idleTimer = 0
    }
    window.addEventListener('deviceorientation', this._boundOnDeviceOrientation)
  }

  private _removeInputListeners(): void {
    if (this._boundOnMouseMove && this._domElement) {
      this._domElement.removeEventListener('mousemove', this._boundOnMouseMove)
      this._domElement.removeEventListener('mouseleave', this._boundOnMouseUp!)
    }
    if (this._boundOnTouchMove && this._domElement) {
      this._domElement.removeEventListener('touchmove', this._boundOnTouchMove)
      this._domElement.removeEventListener('touchstart', this._boundOnTouchStart!)
      this._domElement.removeEventListener('touchend', this._boundOnTouchEnd!)
    }
    if (this._boundOnDeviceOrientation) {
      window.removeEventListener('deviceorientation', this._boundOnDeviceOrientation)
    }
    this._boundOnMouseMove = null
    this._boundOnMouseDown = null
    this._boundOnMouseUp = null
    this._boundOnTouchMove = null
    this._boundOnTouchStart = null
    this._boundOnTouchEnd = null
    this._boundOnDeviceOrientation = null
    this._gyroscopeActive = false
  }

  // --- Animation ---

  update(deltaTime: number): void {
    this._uniforms.time.value += deltaTime

    if (!this._isInteracting) {
      this._idleTimer += deltaTime
    }

    // Auto-tilt when idle for > 3 seconds
    if (this._autoTilt && this._idleTimer > 3 && !this._isInteracting) {
      const t = this._uniforms.time.value * this._animationSpeed
      this._uniforms.tilt.value.x = Math.sin(t * 0.5) * 0.3
      this._uniforms.tilt.value.y = Math.cos(t * 0.3) * 0.2
    }
  }

  // --- Cleanup ---

  dispose(): void {
    this._removeInputListeners()
    this._scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this._material.dispose()
    if (this._loadedTexture) this._loadedTexture.dispose()
  }
}
```

- [ ] **Step 2: Update src/index.ts — final public exports**

Replace `src/index.ts` entirely:

```ts
export { HolographicCard } from './HolographicCard'
export { createFastFoil } from './shaders/createFastFoil'
export { createBalancedFoil } from './shaders/createBalancedFoil'
export { createPhysicalFoil } from './shaders/createPhysicalFoil'
export { createFoilUniforms } from './core/uniforms'
export { wavelengthToRGB } from './core/spectrum'
export { diffractionSinAngle } from './core/grating'
export { sparkleNoise } from './core/sparkle'

export type { HolographicCardOptions, QualityTier, InputMode } from './HolographicCard'
export type { FoilMaterialOptions, FoilMaterialResult } from './shaders/createFastFoil'
export type { FoilUniforms } from './core/uniforms'
```

- [ ] **Step 3: Verify build**

Run: `npx vite build`
Expected: Build succeeds. Both `holographic-foil.es.js` and `holographic-foil.umd.js` in `dist/`.

- [ ] **Step 4: Commit**

```bash
git add src/HolographicCard.ts src/index.ts
git commit -m "feat: add HolographicCard class (mesh, input, animation, API)"
```

---

### Task 10: Demo Page

**Files:**
- Create: `demo/index.html`
- Create: `demo/style.css`
- Create: `demo/demo.ts`

- [ ] **Step 1: Create demo/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Holographic Foil — Interactive Demo</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <div id="app">
    <canvas id="canvas"></canvas>

    <!-- Theme toggle -->
    <button id="theme-toggle" title="Toggle theme">☀</button>

    <!-- Upload -->
    <button id="upload-btn">Upload Card Image</button>
    <input type="file" id="file-input" accept="image/*" hidden>

    <!-- Controls panel -->
    <div id="controls">
      <button id="controls-toggle" title="Toggle controls">▲ Controls</button>
      <div id="controls-inner">

      <label>
        Quality
        <select id="quality">
          <option value="fast">Fast</option>
          <option value="balanced" selected>Balanced</option>
          <option value="physical">Physical</option>
        </select>
      </label>

      <label>
        Preset
        <select id="preset">
          <option value="">Custom</option>
          <option value="trading-card" selected>Trading Card</option>
          <option value="cd-rom">CD-ROM</option>
          <option value="credit-card">Credit Card</option>
        </select>
      </label>

      <label>
        Grating Period
        <input type="range" id="grating" min="1000" max="3000" value="1800" step="10">
        <span id="grating-val">1800nm</span>
      </label>

      <label>
        Foil Roughness
        <input type="range" id="roughness" min="0" max="100" value="15" step="1">
        <span id="roughness-val">0.15</span>
      </label>

      <label>
        Foil Intensity
        <input type="range" id="intensity" min="0" max="300" value="150" step="5">
        <span id="intensity-val">1.50</span>
      </label>

      <label>
        Animation Speed
        <input type="range" id="anim-speed" min="0" max="200" value="100" step="5">
        <span id="anim-speed-val">1.00</span>
      </label>
      </div><!-- end controls-inner -->
    </div>
  </div>

  <script type="module" src="./demo.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Create demo/style.css**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg: #0a0a0a;
  --panel-bg: #1a1a1a;
  --text: #e0e0e0;
  --text-muted: #888;
  --accent: #6366f1;
  --border: #333;
}

[data-theme="light"] {
  --bg: #f0f0f0;
  --panel-bg: #ffffff;
  --text: #1a1a1a;
  --text-muted: #666;
  --accent: #4f46e5;
  --border: #ddd;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
  height: 100vh;
  width: 100vw;
}

#app {
  position: relative;
  width: 100%;
  height: 100%;
}

#canvas {
  display: block;
  width: 100%;
  height: 100%;
}

#theme-toggle {
  position: fixed;
  top: 16px;
  left: 16px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  color: var(--text);
  width: 40px;
  height: 40px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 18px;
  z-index: 10;
}

#upload-btn {
  position: fixed;
  top: 16px;
  right: 300px;
  background: var(--accent);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  z-index: 10;
}

#upload-btn:hover { opacity: 0.9; }

#controls {
  position: fixed;
  top: 0;
  right: 0;
  width: 280px;
  height: 100%;
  background: var(--panel-bg);
  border-left: 1px solid var(--border);
  padding: 20px;
  overflow-y: auto;
  z-index: 10;
}

#controls h3 {
  margin-bottom: 20px;
  font-size: 16px;
  color: var(--text);
}

#controls label {
  display: block;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-muted);
}

#controls select,
#controls input[type="range"] {
  display: block;
  width: 100%;
  margin-top: 6px;
}

#controls select {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 6px 8px;
  border-radius: 4px;
}

#controls input[type="range"] {
  accent-color: var(--accent);
}

#controls span {
  float: right;
  color: var(--text);
  font-size: 12px;
  font-family: monospace;
}

#controls-toggle {
  display: none;
  width: 100%;
  background: var(--panel-bg);
  color: var(--text-muted);
  border: none;
  padding: 10px;
  font-size: 14px;
  cursor: pointer;
  text-align: center;
}

/* Mobile: controls as collapsible bottom sheet */
@media (max-width: 768px) {
  #controls {
    position: fixed;
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: auto;
    max-height: 50vh;
    border-left: none;
    border-top: 1px solid var(--border);
    border-radius: 12px 12px 0 0;
    overflow: hidden;
  }

  #controls-toggle { display: block; }

  #controls.collapsed #controls-inner {
    display: none;
  }

  #controls.collapsed {
    max-height: none;
  }

  #upload-btn {
    right: 16px;
  }
}
```

- [ ] **Step 3: Create demo/demo.ts**

```ts
import * as THREE from 'three/webgpu'
import { HolographicCard } from '../src/HolographicCard'
import type { QualityTier } from '../src/HolographicCard'

// --- Presets ---
const PRESETS: Record<string, { gratingPeriod: number; roughness: number }> = {
  'trading-card': { gratingPeriod: 1800, roughness: 0.15 },
  'cd-rom': { gratingPeriod: 1600, roughness: 0.05 },
  'credit-card': { gratingPeriod: 2000, roughness: 0.25 },
}

// --- Theme ---
function initTheme() {
  const saved = localStorage.getItem('holo-theme')
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light')
  const btn = document.getElementById('theme-toggle')!
  btn.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light'
    if (isLight) {
      document.documentElement.removeAttribute('data-theme')
      localStorage.setItem('holo-theme', 'dark')
      btn.textContent = '☀'
    } else {
      document.documentElement.setAttribute('data-theme', 'light')
      localStorage.setItem('holo-theme', 'light')
      btn.textContent = '☾'
    }
  })
}

// --- Scene setup ---
async function main() {
  initTheme()

  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setClearColor(0x0a0a0a)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(0, 0, 6)

  // Create holographic card
  const card = new HolographicCard(scene, {
    quality: 'balanced',
    width: 2.5,
    height: 3.5,
    autoTilt: true,
  })
  card.setupInput(canvas)

  // --- Controls ---
  const qualitySelect = document.getElementById('quality') as HTMLSelectElement
  const presetSelect = document.getElementById('preset') as HTMLSelectElement
  const gratingSlider = document.getElementById('grating') as HTMLInputElement
  const gratingVal = document.getElementById('grating-val')!
  const roughnessSlider = document.getElementById('roughness') as HTMLInputElement
  const roughnessVal = document.getElementById('roughness-val')!
  const intensitySlider = document.getElementById('intensity') as HTMLInputElement
  const intensityVal = document.getElementById('intensity-val')!
  const animSpeedSlider = document.getElementById('anim-speed') as HTMLInputElement
  const animSpeedVal = document.getElementById('anim-speed-val')!

  // Mobile controls collapse toggle
  const controlsPanel = document.getElementById('controls')!
  const controlsToggle = document.getElementById('controls-toggle')!
  controlsToggle.addEventListener('click', () => {
    controlsPanel.classList.toggle('collapsed')
    controlsToggle.textContent = controlsPanel.classList.contains('collapsed')
      ? '▼ Controls'
      : '▲ Controls'
  })

  qualitySelect.addEventListener('change', () => {
    card.quality = qualitySelect.value as QualityTier
  })

  presetSelect.addEventListener('change', () => {
    const preset = PRESETS[presetSelect.value]
    if (!preset) return
    gratingSlider.value = String(preset.gratingPeriod)
    gratingVal.textContent = `${preset.gratingPeriod}nm`
    card.gratingDensity = 1 / preset.gratingPeriod
    roughnessSlider.value = String(Math.round(preset.roughness * 100))
    roughnessVal.textContent = preset.roughness.toFixed(2)
    card.foilRoughness = preset.roughness
  })

  gratingSlider.addEventListener('input', () => {
    const period = Number(gratingSlider.value)
    gratingVal.textContent = `${period}nm`
    card.gratingDensity = 1 / period
    presetSelect.value = ''
  })

  roughnessSlider.addEventListener('input', () => {
    const v = Number(roughnessSlider.value) / 100
    roughnessVal.textContent = v.toFixed(2)
    card.foilRoughness = v
    presetSelect.value = ''
  })

  intensitySlider.addEventListener('input', () => {
    const v = Number(intensitySlider.value) / 100
    intensityVal.textContent = v.toFixed(2)
    card.foilIntensity = v
  })

  animSpeedSlider.addEventListener('input', () => {
    const v = Number(animSpeedSlider.value) / 100
    animSpeedVal.textContent = v.toFixed(2)
    card.animationSpeed = v
  })

  // --- Upload ---
  const uploadBtn = document.getElementById('upload-btn')!
  const fileInput = document.getElementById('file-input') as HTMLInputElement

  uploadBtn.addEventListener('click', () => fileInput.click())

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    card.setTexture(url)
  })

  // Drag and drop
  canvas.addEventListener('dragover', (e) => { e.preventDefault() })
  canvas.addEventListener('drop', (e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files[0]
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    card.setTexture(url)
  })

  // --- Resize ---
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // --- Animate ---
  const clock = new THREE.Clock()
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta()
    card.update(dt)
    renderer.render(scene, camera)
  })
}

main()
```

- [ ] **Step 4: Run dev server and verify visually**

Run: `npm run dev`
Expected: Opens browser at localhost. Card visible with holographic foil effect. Dragging tilts the card and shifts rainbow. Sliders work. Upload works. Theme toggle works.

This is the critical visual verification step. Check:
1. Rainbow shifts smoothly when tilting
2. Switching quality tiers changes the effect visibly
3. Sliders update in real-time
4. Presets snap parameters correctly
5. Upload replaces the card texture

- [ ] **Step 5: Commit**

```bash
git add demo/
git commit -m "feat: add interactive demo page with controls, upload, and theme toggle"
```

---

### Task 11: Build Verification & Polish

**Files:**
- Modify: `vite.config.ts` (if needed)
- Modify: `src/index.ts` (if needed)

- [ ] **Step 1: Run full library build**

Run: `npm run build:lib`
Expected: `dist/` contains `holographic-foil.es.js`, `holographic-foil.umd.js`, `shaders.es.js`, `shaders.umd.js`, and `.d.ts` files.

If the multi-entry UMD build fails (Vite limitation), adjust `vite.config.ts` to use two separate build configs or use `rollupOptions.output` to customize filenames per format.

- [ ] **Step 2: Run full demo build**

Run: `npm run build:demo`
Expected: `dist/demo/` contains a standalone `index.html` with bundled JS.

- [ ] **Step 3: Preview the built demo**

Run: `npm run preview`
Expected: Serves the built demo. All functionality works as in dev mode.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: verify full library + demo build"
```

---

### Task 12: Push to GitHub

- [ ] **Step 1: Add remote and push**

```bash
git remote add origin https://github.com/sepivip/foilshader.git
git branch -M main
git push -u origin main
```

Expected: Code pushed to GitHub.

---

## Verification Checklist

After all tasks are complete, verify these acceptance criteria:

1. [ ] **Tilt response**: Drag/touch/gyroscope tilts card, rainbow shifts smoothly
2. [ ] **Three tiers visible**: Fast/Balanced/Physical produce distinct visual results
3. [ ] **Interference bands**: Physical tier shows bright+dark alternating bands
4. [ ] **Sparkle**: Tiny flecks shift with viewing angle on all tiers
5. [ ] **60fps**: Balanced tier on desktop, Fast tier on mobile
6. [ ] **Upload**: Drop or pick an image, card updates instantly
7. [ ] **Sliders**: All parameters update in real-time
8. [ ] **Presets**: Trading Card / CD-ROM / Credit Card each produce characteristic look
9. [ ] **Theme**: Dark/light toggle works, persists in localStorage
10. [ ] **Build**: `npm run build` produces ESM + UMD bundles without errors
11. [ ] **Mobile**: Touch drag works, gyroscope works on iOS Safari + Android Chrome
