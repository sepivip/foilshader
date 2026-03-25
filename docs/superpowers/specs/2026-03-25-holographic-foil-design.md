# Holographic Foil Library — Design Spec

## Overview

A physics-based holographic foil shader library for Three.js that replicates the diffraction effect seen on trading cards, credit cards, and CD-ROMs. Inspired by Janum Trivedi's viral Metal shader (June 2025). Ships as both a reusable npm library and a standalone interactive demo.

## Goals

1. **Physics-based rendering** — real diffraction grating equations and wave interference, not gradient fakes
2. **Three fidelity tiers** — Fast (analytical), Balanced (sampled), Physical (full spectral interference) — for comparison and performance tradeoff
3. **Reusable library** — clean API, ES module + UMD bundle, Three.js peer dependency
4. **Interactive demo** — minimal functional page with upload, sliders, dark/light mode
5. **Cross-platform** — desktop (mouse), mobile (gyroscope + touch), WebGPU + WebGL2 via Three.js TSL

## Architecture

### Strategy Pattern with Shared Core

```
holographic-foil/
  src/
    core/
      grating.ts        — Diffraction grating equation (TSL node, shared)
      spectrum.ts        — Wavelength → RGB conversion (TSL node, shared)
      sparkle.ts         — Foil flake noise (TSL node, shared)
      uniforms.ts        — Common uniform definitions
    shaders/
      createFastFoil.ts      — Tier 1: Analytical approximation
      createBalancedFoil.ts  — Tier 2: Sampled grating + simplified intensity
      createPhysicalFoil.ts  — Tier 3: Full spectral multi-order interference
      index.ts               — Re-exports all factories
    HolographicCard.ts  — Main API class (mesh, input, animation)
    index.ts            — Public exports
  demo/
    index.html          — Standalone demo page
    demo.ts             — Demo app logic
  package.json
  vite.config.ts
  tsconfig.json
```

### Shared Core (`src/core/`)

**`grating.ts`** — TSL node implementing the diffraction grating equation:
```
d × (sin θ_i + sin θ_m) = m × λ
```
- Input: incidence angle `θ_i`, wavelength `λ`, order `m`, grating period `d`
- Output: diffraction angle `θ_m`
- Validates that `|sin θ_m| ≤ 1` (physically realizable)

**`spectrum.ts`** — Converts wavelength (380–780nm) to linear RGB using an analytical fit of CIE color matching functions. Returns `vec3` in linear sRGB space.

**`sparkle.ts`** — Hash-based high-frequency noise:
- Input: UV coordinates, view direction, time
- Produces tiny bright flecks that shift with viewing angle
- Simulates individual micro-facets on the foil surface
- Additive blend on top of diffraction color

**`uniforms.ts`** — Shared uniform definitions:
- `u_tilt: vec2` — x/y rotation in radians from input
- `u_lightDir: vec3` — light direction (default: top-down `(0, 1, 0.5)`)
- `u_gratingDensity: float` — 1/d in nm⁻¹ (default: `1/1800`)
- `u_foilThickness: float` — thin-film thickness in nm (Tier 3 only)
- `u_foilRoughness: float` — 0–1 roughness factor
- `u_foilIntensity: float` — multiplier for foil brightness
- `u_time: float` — elapsed time for subtle animation
- `u_baseTexture: sampler2D` — card art texture

### Shader Factories (`src/shaders/`)

Each factory function returns a Three.js `NodeMaterial` configured with TSL nodes.

**`createFastFoil(options)`** — Tier 1:
- Solves grating equation for m=1 only
- Maps diffraction angle directly to hue (no wavelength loop)
- Intensity: cosine falloff from diffraction condition
- Adds sparkle noise
- ~20 TSL node operations
- Target: mobile, low-end GPUs, many cards on screen

**`createBalancedFoil(options)`** — Tier 2:
- Loops over 8 discrete wavelengths (380–780nm, evenly spaced)
- Solves grating equation for orders m = -1, 0, +1
- Intensity per wavelength: squared sinc-like falloff from exact diffraction condition
- Sums `intensity × wavelengthToRGB(λ)` across all samples
- Adds sparkle noise
- ~40 TSL node operations
- Target: default quality, good visual/performance balance

**`createPhysicalFoil(options)`** — Tier 3:
- Loops over 12 discrete wavelengths (380–780nm)
- Orders m = -2 to +2 (5 orders)
- Complex amplitude summation per wavelength:
  - `A_real = Σ_m cos(2π × pathDiff_m / λ)`
  - `A_imag = Σ_m sin(2π × pathDiff_m / λ)`
  - Path difference from grating geometry + thin-film contribution
- Per-pixel random phase noise (hash of UV) for surface roughness
- Final intensity = `A_real² + A_imag²` (constructive = bright, destructive = dark gaps)
- Sums `intensity × wavelengthToRGB(λ)` across all wavelengths
- Adds sparkle noise
- ~70 TSL node operations
- Target: showcase quality, single card, desktop

### Blending Model

All tiers use the same blending with the base card texture:
```
finalColor = baseTexture.rgb × (ambientBase + foilColor × foilIntensity)
```
- `ambientBase` = 0.65 (ensures card art always visible)
- `foilIntensity` = tunable multiplier (default 1.5)
- Foil effect is multiplicative/additive on top of the art

## Public API

### High-Level: `HolographicCard`

```ts
import { HolographicCard } from 'holographic-foil'

const card = new HolographicCard(scene, {
  texture: 'path/to/card.jpg',   // URL string or Three.js Texture
  quality: 'balanced',            // 'fast' | 'balanced' | 'physical'
  width: 2.5,
  height: 3.5,
})

// Live parameter tuning
card.gratingDensity = 1 / 1800
card.foilRoughness = 0.15
card.foilIntensity = 1.5
card.lightDirection.set(0, 1, 0.5)
card.quality = 'physical'         // swaps material at runtime

// Input control
card.inputMode = 'auto'           // 'auto' | 'mouse' | 'touch' | 'gyroscope' | 'none'
card.tilt.set(0.1, -0.2)          // manual tilt when inputMode = 'none'

// Animation
card.autoTilt = true              // gentle sine wave when idle
card.animationSpeed = 1.0

// Lifecycle
card.dispose()                    // removes mesh, disposes material/textures
```

**Input mode `'auto'` detection order:**
1. Gyroscope (if `DeviceOrientationEvent` available + permission granted)
2. Touch (if touch events available)
3. Mouse (fallback)

On iOS, gyroscope requires `DeviceOrientationEvent.requestPermission()` — the library calls this on first touch interaction.

### Low-Level: Shader Factories

```ts
import { createBalancedFoil } from 'holographic-foil/shaders'

const material = createBalancedFoil({
  baseTexture: myTexture,
  gratingDensity: 1 / 2000,
  foilRoughness: 0.2,
  foilIntensity: 1.5,
})
myMesh.material = material
```

Each factory accepts the same options interface:
```ts
interface FoilMaterialOptions {
  baseTexture?: Texture
  gratingDensity?: number   // default: 1/1800 nm⁻¹
  foilRoughness?: number    // default: 0.15 (0–1)
  foilIntensity?: number    // default: 1.5
  foilThickness?: number    // default: 500nm (Tier 3 only)
  lightDirection?: Vector3  // default: (0, 1, 0.5)
}
```

## Demo Page

### Layout
- Dark background (near-black `#0a0a0a`), dark/light toggle top-left
- Single card centered in viewport with perspective camera
- Upload button top-right (also accepts drag-and-drop)
- Right panel with controls (collapses to bottom sheet on mobile)

### Controls
- **Quality**: dropdown — Fast / Balanced / Physical
- **Presets**: dropdown — "Trading Card" (d=1800nm, roughness=0.15), "CD-ROM" (d=1600nm, roughness=0.05), "Credit Card" (d=2000nm, roughness=0.25)
- **Grating density**: slider 1000–3000nm
- **Foil roughness**: slider 0–1
- **Foil intensity**: slider 0–3
- **Animation speed**: slider 0–2 (0 = manual only)

### Behavior
- Placeholder: animated gradient card until user uploads an image
- Auto-tilt: gentle sine wave animation when idle, stops on user interaction, resumes after 3s idle
- Mobile: gyroscope primary, sliders in collapsible bottom sheet
- Theme preference persisted in `localStorage`

### No Tailwind
Vanilla CSS only — keeps the demo dependency-free and the single-file build simple.

## Build & Packaging

### Tooling
- **TypeScript** — strict mode, ES2020 target
- **Vite** — dev server + library build
- **Three.js** — peer dependency (>=0.160.0)

### Build Outputs
- `dist/holographic-foil.es.js` — ESM bundle
- `dist/holographic-foil.umd.js` — UMD bundle (global name: `HolographicFoil`)
- `dist/holographic-foil.d.ts` — TypeScript declarations
- `dist/demo/index.html` — standalone demo

### package.json Exports
```json
{
  "main": "dist/holographic-foil.umd.js",
  "module": "dist/holographic-foil.es.js",
  "types": "dist/holographic-foil.d.ts",
  "exports": {
    ".": {
      "import": "./dist/holographic-foil.es.js",
      "require": "./dist/holographic-foil.umd.js",
      "types": "./dist/holographic-foil.d.ts"
    },
    "./shaders": {
      "import": "./dist/shaders.es.js",
      "require": "./dist/shaders.umd.js"
    }
  },
  "peerDependencies": {
    "three": ">=0.160.0"
  }
}
```

### Dev Dependencies
- `vite`
- `typescript`
- `@types/three`

No other runtime dependencies.

## Physics Reference

### Diffraction Grating Equation
```
d × (sin θ_i + sin θ_m) = m × λ
```
- `d` = grating period (distance between grooves). Trading cards: ~1800nm. CD-ROMs: ~1600nm.
- `θ_i` = angle of incidence (light hitting the surface)
- `θ_m` = angle of diffraction for order `m`
- `m` = integer diffraction order (..., -2, -1, 0, 1, 2, ...)
- `λ` = wavelength of light (visible: 380–780nm)

### Wave Interference (Tier 3)
For each wavelength, sum complex amplitudes across all orders:
```
A(λ) = Σ_m exp(i × 2π × Δ_m / λ)
```
Where `Δ_m` is the optical path difference for order `m`:
```
Δ_m = d × m × sin(θ_i) + 2 × t × n_film × cos(θ_refracted)
```
(Second term is thin-film contribution, `t` = film thickness, `n_film` = refractive index ~1.5)

Intensity: `I(λ) = |A(λ)|² = A_real² + A_imag²`

Constructive interference (bright): when path differences are integer multiples of λ.
Destructive interference (dark gaps): when they're half-integer multiples.

### Wavelength to RGB
Analytical approximation of CIE 1931 color matching functions. Maps wavelength in nm to linear sRGB (0–1 per channel). Gamma correction applied at the end of the pipeline.

### Presets
| Preset       | Grating Period | Roughness | Notes                              |
|-------------|---------------|-----------|-------------------------------------|
| Trading Card | 1800nm        | 0.15      | Classic holographic foil            |
| CD-ROM       | 1600nm        | 0.05      | Tight, vivid rainbows               |
| Credit Card  | 2000nm        | 0.25      | Broader, more diffuse holographic   |

## Acceptance Criteria

1. Tilting the card shifts rainbow patterns smoothly and continuously — no banding or stepping
2. Tier 3 (Physical) shows visible constructive/destructive interference bands (bright rainbows with dark gaps)
3. All 3 tiers produce visually distinct results that match their physics models
4. Sparkle flecks shift with viewing angle on all tiers
5. 60fps on modern laptop (Tier 2), 60fps on mobile (Tier 1)
6. Gyroscope input works on iOS Safari and Android Chrome
7. Upload replaces card texture immediately
8. All sliders update the effect in real-time with no lag
9. Library builds to both ESM and UMD without errors
10. Library works when imported into a fresh Three.js project (no hidden dependencies)
