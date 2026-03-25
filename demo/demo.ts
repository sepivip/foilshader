import * as THREE from 'three/webgpu'
import { HolographicCard } from '../src/HolographicCard'
import type { QualityTier } from '../src/HolographicCard'
import type { FoilPattern } from '../src/core/patterns'

// --- Presets ---
const PRESETS: Record<string, { gratingPeriod: number; roughness: number }> = {
  'trading-card': { gratingPeriod: 1800, roughness: 0.15 },
  'cd-rom': { gratingPeriod: 1600, roughness: 0.05 },
  'credit-card': { gratingPeriod: 2000, roughness: 0.25 },
}

// --- Theme ---
let currentRenderer: THREE.WebGPURenderer | null = null

function initTheme() {
  const saved = localStorage.getItem('holo-theme')
  const btn = document.getElementById('theme-toggle')!
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
    btn.innerHTML = '&#9790;'
  }
  btn.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light'
    if (isLight) {
      document.documentElement.removeAttribute('data-theme')
      localStorage.setItem('holo-theme', 'dark')
      btn.innerHTML = '&#9788;'
      currentRenderer?.setClearColor(0x0a0a0a)
    } else {
      document.documentElement.setAttribute('data-theme', 'light')
      localStorage.setItem('holo-theme', 'light')
      btn.innerHTML = '&#9790;'
      currentRenderer?.setClearColor(0xf0f0f0)
    }
  })
}

// --- Main ---
async function main() {
  initTheme()

  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true })
  currentRenderer = renderer
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  const isLight = localStorage.getItem('holo-theme') === 'light'
  renderer.setClearColor(isLight ? 0xf0f0f0 : 0x0a0a0a)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  )
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

  // Mobile controls collapse
  const controlsPanel = document.getElementById('controls')!
  const controlsToggle = document.getElementById('controls-toggle')!
  controlsToggle.addEventListener('click', () => {
    controlsPanel.classList.toggle('collapsed')
    controlsToggle.innerHTML = controlsPanel.classList.contains('collapsed')
      ? '&#9660; Controls'
      : '&#9650; Controls'
  })

  // Foil pattern
  const foilPatternSelect = document.getElementById('foil-pattern') as HTMLSelectElement
  foilPatternSelect.addEventListener('change', () => {
    card.foilPattern = foilPatternSelect.value as FoilPattern
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

  // --- Render loop ---
  let lastTime = performance.now()
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = (now - lastTime) / 1000
    lastTime = now
    card.update(dt)
    renderer.render(scene, camera)
  })
}

main()
