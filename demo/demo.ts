import * as THREE from 'three/webgpu'
import { HolographicCard } from '../src/HolographicCard'
import type { QualityTier } from '../src/HolographicCard'
import type { FoilPattern } from '../src/core/patterns'

// --- Presets ---
const PRESETS: Record<string, { gratingPeriod: number; roughness: number; intensity: number }> = {
  'trading-card': { gratingPeriod: 1800, roughness: 0.15, intensity: 1.5 },
  'cd-rom': { gratingPeriod: 1200, roughness: 0.02, intensity: 2.0 },
  'credit-card': { gratingPeriod: 2500, roughness: 0.35, intensity: 1.0 },
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
      currentRenderer?.setClearColor(0x000000)
    } else {
      document.documentElement.setAttribute('data-theme', 'light')
      localStorage.setItem('holo-theme', 'light')
      btn.innerHTML = '&#9790;'
      currentRenderer?.setClearColor(0xf2f2f7)
    }
  })
}

// --- Card sizing ---
function getCardSize() {
  const isMobile = window.innerWidth <= 768
  return {
    width: isMobile ? 1.8 : 2.5,
    height: isMobile ? 2.52 : 3.5,
    camZ: isMobile ? 5.5 : 6,
  }
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
  renderer.setClearColor(isLight ? 0xf2f2f7 : 0x000000)

  const scene = new THREE.Scene()
  const sizes = getCardSize()
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(0, 0, sizes.camZ)

  const card = new HolographicCard(scene, {
    quality: 'balanced',
    width: sizes.width,
    height: sizes.height,
    autoTilt: true,
  })
  card.setupInput(canvas)

  // --- Controls ---
  const $ = (id: string) => document.getElementById(id)!
  const qualitySelect = $('quality') as HTMLSelectElement
  const foilPatternSelect = $('foil-pattern') as HTMLSelectElement
  const presetSelect = $('preset') as HTMLSelectElement
  const gratingSlider = $('grating') as HTMLInputElement
  const gratingVal = $('grating-val')
  const roughnessSlider = $('roughness') as HTMLInputElement
  const roughnessVal = $('roughness-val')
  const intensitySlider = $('intensity') as HTMLInputElement
  const intensityVal = $('intensity-val')
  const animSpeedSlider = $('anim-speed') as HTMLInputElement
  const animSpeedVal = $('anim-speed-val')

  // Mobile bottom sheet — start collapsed
  const controlsPanel = $('controls')
  const controlsToggle = $('controls-toggle')
  if (window.innerWidth <= 768) {
    controlsPanel.classList.add('collapsed')
  }
  controlsToggle.addEventListener('click', () => {
    controlsPanel.classList.toggle('collapsed')
  })

  // Gyroscope (iOS)
  const gyroBtn = $('gyro-btn')
  const DOE = DeviceOrientationEvent as any
  if (typeof DOE.requestPermission === 'function') {
    gyroBtn.style.display = 'inline-flex'
    gyroBtn.addEventListener('click', async () => {
      try {
        const perm = await DOE.requestPermission()
        if (perm === 'granted') {
          card.inputMode = 'gyroscope'
          gyroBtn.textContent = 'Gyro On'
          setTimeout(() => { gyroBtn.style.display = 'none' }, 1500)
        }
      } catch { gyroBtn.textContent = 'Failed' }
    })
  } else if ('ontouchstart' in window && typeof DeviceOrientationEvent !== 'undefined') {
    gyroBtn.style.display = 'inline-flex'
    gyroBtn.addEventListener('click', () => {
      card.inputMode = 'gyroscope'
      gyroBtn.textContent = 'Gyro On'
      setTimeout(() => { gyroBtn.style.display = 'none' }, 1500)
    })
  }

  // Quality
  qualitySelect.addEventListener('change', () => {
    card.quality = qualitySelect.value as QualityTier
  })

  // Foil pattern
  foilPatternSelect.addEventListener('change', () => {
    card.foilPattern = foilPatternSelect.value as FoilPattern
  })

  // Presets
  presetSelect.addEventListener('change', () => {
    const preset = PRESETS[presetSelect.value]
    if (!preset) return
    gratingSlider.value = String(preset.gratingPeriod)
    gratingVal.textContent = `${preset.gratingPeriod}nm`
    card.gratingDensity = 1 / preset.gratingPeriod
    roughnessSlider.value = String(Math.round(preset.roughness * 100))
    roughnessVal.textContent = preset.roughness.toFixed(2)
    card.foilRoughness = preset.roughness
    intensitySlider.value = String(Math.round(preset.intensity * 100))
    intensityVal.textContent = preset.intensity.toFixed(2)
    card.foilIntensity = preset.intensity
  })

  // Sliders
  gratingSlider.addEventListener('input', () => {
    const v = Number(gratingSlider.value)
    gratingVal.textContent = `${v}nm`
    card.gratingDensity = 1 / v
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
  const uploadBtn = $('upload-btn')
  const fileInput = $('file-input') as HTMLInputElement
  uploadBtn.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    card.setTexture(URL.createObjectURL(file))
  })

  // Drag and drop with overlay
  const dropOverlay = $('drop-overlay')
  let dragCounter = 0

  canvas.addEventListener('dragenter', (e) => {
    e.preventDefault()
    dragCounter++
    dropOverlay.classList.add('active')
  })
  document.addEventListener('dragleave', () => {
    dragCounter--
    if (dragCounter <= 0) {
      dragCounter = 0
      dropOverlay.classList.remove('active')
    }
  })
  document.addEventListener('dragover', (e) => e.preventDefault())
  document.addEventListener('drop', (e) => {
    e.preventDefault()
    dragCounter = 0
    dropOverlay.classList.remove('active')
    const file = e.dataTransfer?.files[0]
    if (!file || !file.type.startsWith('image/')) return
    card.setTexture(URL.createObjectURL(file))
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
