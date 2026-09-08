/**
 * Intensidad de audio (AnalyserNode) para la gráfica de la llamada.
 * Un único AudioContext; cada <audio> solo puede tener un MediaElementSource.
 */

import { useEffect, useState } from 'react'

const BARS = 28
const sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()
let ctx: AudioContext | null = null

function audioCtx(): AudioContext | null {
  const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx || ctx.state === 'closed') ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  return ctx
}

function attachMedia(el: HTMLMediaElement): AnalyserNode | null {
  const ac = audioCtx()
  if (!ac) return null
  let source = sources.get(el)
  if (!source) {
    try {
      source = ac.createMediaElementSource(el)
      source.connect(ac.destination)
      sources.set(el, source)
    } catch {
      return null
    }
  }
  const analyser = ac.createAnalyser()
  analyser.fftSize = 64
  analyser.smoothingTimeConstant = 0.72
  source.connect(analyser)
  return analyser
}

function attachStream(stream: MediaStream): { analyser: AnalyserNode; disconnect: () => void } | null {
  const ac = audioCtx()
  if (!ac) return null
  const source = ac.createMediaStreamSource(stream)
  const analyser = ac.createAnalyser()
  analyser.fftSize = 64
  analyser.smoothingTimeConstant = 0.72
  source.connect(analyser)
  return {
    analyser,
    disconnect: () => {
      try {
        source.disconnect()
        analyser.disconnect()
      } catch {
        /* ya cerrado */
      }
    },
  }
}

function readLevels(analyser: AnalyserNode, bars: number): number[] {
  const bins = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(bins)
  const out = new Array<number>(bars)
  const step = Math.max(1, Math.floor(bins.length / bars))
  for (let i = 0; i < bars; i++) {
    let sum = 0
    const start = i * step
    for (let j = 0; j < step && start + j < bins.length; j++) sum += bins[start + j]
    out[i] = Math.min(1, sum / step / 180)
  }
  return out
}

export function getSoftphoneRemoteAudio(): HTMLAudioElement | null {
  return document.getElementById('avi-softphone-remote-audio') as HTMLAudioElement | null
}

export function useAudioLevels(
  target: HTMLMediaElement | MediaStream | null | undefined,
  active: boolean,
  bars = BARS,
): number[] {
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: bars }, () => 0.08))

  useEffect(() => {
    if (!active || !target) {
      setLevels(Array.from({ length: bars }, () => 0.08))
      return
    }

    let analyser: AnalyserNode | null = null
    let dispose: (() => void) | null = null
    let raf = 0

    if (target instanceof MediaStream) {
      const attached = attachStream(target)
      analyser = attached?.analyser ?? null
      dispose = attached?.disconnect ?? null
    } else {
      analyser = attachMedia(target)
    }

    if (!analyser) return

    const tick = () => {
      setLevels(readLevels(analyser!, bars))
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(raf)
      dispose?.()
    }
  }, [target, active, bars])

  return levels
}

export function useSoftphoneLevels(active: boolean, bars = BARS): number[] {
  const [el, setEl] = useState<HTMLAudioElement | null>(null)
  useEffect(() => {
    if (!active) {
      setEl(null)
      return
    }
    setEl(getSoftphoneRemoteAudio())
    const id = window.setInterval(() => setEl(getSoftphoneRemoteAudio()), 800)
    return () => window.clearInterval(id)
  }, [active])
  return useAudioLevels(el, active, bars)
}
