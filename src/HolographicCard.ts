import * as THREE from 'three/webgpu'
import { createFastFoil } from './shaders/createFastFoil'
import { createBalancedFoil } from './shaders/createBalancedFoil'
import { createPhysicalFoil } from './shaders/createPhysicalFoil'
import type { FoilMaterialOptions, FoilMaterialResult } from './shaders/createFastFoil'
import type { FoilUniforms } from './core/uniforms'
import { PATTERN_IDS, type FoilPattern } from './core/patterns'

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
  foilPattern?: FoilPattern
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

  // Input handlers
  private _boundOnMouseMove: ((e: MouseEvent) => void) | null = null
  private _boundOnMouseLeave: (() => void) | null = null
  private _boundOnTouchMove: ((e: TouchEvent) => void) | null = null
  private _boundOnTouchStart: ((e: TouchEvent) => void) | null = null
  private _boundOnTouchEnd: (() => void) | null = null
  private _boundOnDeviceOrientation: ((e: DeviceOrientationEvent) => void) | null = null
  private _gyroscopeActive = false
  private _domElement: HTMLElement | null = null
  private _lastTouch = { x: 0, y: 0 }

  constructor(scene: THREE.Scene, options: HolographicCardOptions = {}) {
    this._scene = scene
    this._quality = options.quality ?? 'balanced'
    this._inputMode = options.inputMode ?? 'auto'
    this._autoTilt = options.autoTilt ?? true
    this._animationSpeed = options.animationSpeed ?? 1

    const width = options.width ?? 2.5
    const height = options.height ?? 3.5

    // Load texture
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

    const result = this._createMaterial()
    this._material = result.material
    this._uniforms = result.uniforms

    const geometry = new THREE.PlaneGeometry(width, height)
    this.mesh = new THREE.Mesh(geometry, this._material)
    scene.add(this.mesh)
  }

  private _createMaterial(): FoilMaterialResult {
    return FACTORY_MAP[this._quality](this._options)
  }

  // --- Properties ---

  get quality(): QualityTier { return this._quality }
  set quality(value: QualityTier) {
    if (value === this._quality) return
    this._quality = value
    this._rebuildMaterial()
  }

  get gratingDensity(): number { return this._uniforms.gratingDensity.value as number }
  set gratingDensity(v: number) { (this._uniforms.gratingDensity as any).value = v }

  get foilRoughness(): number { return this._uniforms.foilRoughness.value as number }
  set foilRoughness(v: number) { (this._uniforms.foilRoughness as any).value = v }

  get foilIntensity(): number { return this._uniforms.foilIntensity.value as number }
  set foilIntensity(v: number) { (this._uniforms.foilIntensity as any).value = v }

  get foilThickness(): number { return this._uniforms.foilThickness.value as number }
  set foilThickness(v: number) { (this._uniforms.foilThickness as any).value = v }

  get foilPattern(): FoilPattern {
    const id = this._uniforms.foilPattern.value as number
    return (Object.entries(PATTERN_IDS).find(([, v]) => v === id)?.[0] ?? 'full') as FoilPattern
  }
  set foilPattern(v: FoilPattern) { (this._uniforms.foilPattern as any).value = PATTERN_IDS[v] ?? 0 }

  get lightDirection(): THREE.Vector3 { return this._uniforms.lightDir.value as THREE.Vector3 }

  get tilt(): THREE.Vector2 { return this._uniforms.tilt.value as THREE.Vector2 }

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
    this._rebuildMaterial()
  }

  private _rebuildMaterial(): void {
    const tiltVal = this._uniforms.tilt.value as THREE.Vector2
    const tx = tiltVal.x
    const ty = tiltVal.y
    const result = this._createMaterial()
    this._material.dispose()
    this._material = result.material
    this._uniforms = result.uniforms
    ;(this._uniforms.tilt.value as THREE.Vector2).set(tx, ty)
    this.mesh.material = this._material
  }

  // --- Input ---

  setupInput(domElement: HTMLElement): void {
    this._domElement = domElement
    this._setupInputListeners(domElement)
  }

  private _setupInputListeners(domElement: HTMLElement): void {
    const mode = this._inputMode

    if (mode === 'mouse' || mode === 'auto') {
      this._boundOnMouseMove = (e: MouseEvent) => {
        const rect = domElement.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2
        const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2
        ;(this._uniforms.tilt.value as THREE.Vector2).set(x * 0.6, -y * 0.4)
        this._isInteracting = true
        this._idleTimer = 0
      }
      this._boundOnMouseLeave = () => {
        this._isInteracting = false
      }
      domElement.addEventListener('mousemove', this._boundOnMouseMove)
      domElement.addEventListener('mouseleave', this._boundOnMouseLeave)
    }

    if (mode === 'touch' || mode === 'auto') {
      this._boundOnTouchStart = (e: TouchEvent) => {
        this._isInteracting = true
        this._idleTimer = 0
        if (e.touches.length === 1) {
          this._lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        }
        // Request gyroscope on first touch (iOS)
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
        const dx = (touch.clientX - this._lastTouch.x) * 0.005
        const dy = (touch.clientY - this._lastTouch.y) * 0.005
        const tilt = this._uniforms.tilt.value as THREE.Vector2
        tilt.x = Math.max(-1, Math.min(1, tilt.x + dx))
        tilt.y = Math.max(-1, Math.min(1, tilt.y + dy))
        this._lastTouch = { x: touch.clientX, y: touch.clientY }
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
    if (typeof DeviceOrientationEvent === 'undefined') return

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
      const tilt = this._uniforms.tilt.value as THREE.Vector2
      tilt.x = (e.gamma! / 90) * 0.8
      tilt.y = ((e.beta! - 45) / 90) * 0.8
      this._isInteracting = true
      this._idleTimer = 0
    }
    window.addEventListener('deviceorientation', this._boundOnDeviceOrientation)
  }

  private _removeInputListeners(): void {
    if (this._boundOnMouseMove && this._domElement) {
      this._domElement.removeEventListener('mousemove', this._boundOnMouseMove)
    }
    if (this._boundOnMouseLeave && this._domElement) {
      this._domElement.removeEventListener('mouseleave', this._boundOnMouseLeave)
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
    this._boundOnMouseLeave = null
    this._boundOnTouchMove = null
    this._boundOnTouchStart = null
    this._boundOnTouchEnd = null
    this._boundOnDeviceOrientation = null
    this._gyroscopeActive = false
  }

  // --- Animation ---

  update(deltaTime: number): void {
    ;(this._uniforms.time as any).value += deltaTime

    if (!this._isInteracting) {
      this._idleTimer += deltaTime
    }

    // Auto-tilt when idle for > 3 seconds
    if (this._autoTilt && this._idleTimer > 3 && !this._isInteracting) {
      const t = (this._uniforms.time as any).value * this._animationSpeed
      const tilt = this._uniforms.tilt.value as THREE.Vector2
      tilt.x = Math.sin(t * 0.5) * 0.3
      tilt.y = Math.cos(t * 0.3) * 0.2
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
