// Only consecutive negative frames rearm the same barcode.
export class ScanGate {
  private held = ''
  private absentSince: number | null = null
  private misses = 0
  frame(code: string | null, now: number) {
    if (code === null) {
      this.absentSince ??= now
      if (++this.misses >= 3 && now - this.absentSince >= 650) this.held = ''
      return null
    }
    this.absentSince = null
    this.misses = 0
    if (code === this.held) return null
    this.held = code
    return code
  }
}
export interface CameraAdapter {
  start: (
    video: HTMLVideoElement,
    frame: (code: string | null) => void,
    signal: AbortSignal,
  ) => Promise<() => void>
}
export const camera: CameraAdapter = {
  async start(video, frame, signal) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw Error('Abre la dirección HTTPS del PC y confía en su certificado para usar la cámara.')
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType, NotFoundException }] =
      await Promise.all([import('@zxing/browser'), import('@zxing/library')])
    const reader = new BrowserMultiFormatReader(
      new Map([
        [
          DecodeHintType.POSSIBLE_FORMATS,
          [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
          ],
        ],
      ]),
      { delayBetweenScanAttempts: 130, delayBetweenScanSuccess: 150 },
    )
    signal.throwIfAborted()
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
    })
    const release = () => stream.getTracks().forEach((track) => track.stop())
    signal.addEventListener('abort', release, { once: true })
    try {
      signal.throwIfAborted()
      const controls = await reader.decodeFromStream(stream, video, (result, error) => {
        if (result) frame(result.getText())
        else if (error instanceof NotFoundException) frame(null)
      })
      return () => {
        signal.removeEventListener('abort', release)
        controls.stop()
        release()
      }
    } catch (e) {
      signal.removeEventListener('abort', release)
      release()
      throw e
    }
  },
}
export function scanContinuously(
  adapter: CameraAdapter,
  video: HTMLVideoElement,
  onCode: (c: string) => void,
  onError: (e: unknown) => void,
) {
  const gate = new ScanGate()
  const controller = new AbortController()
  let closed = false,
    stop: (() => void) | undefined
  adapter
    .start(
      video,
      (code) => {
        if (!closed) {
          const accepted = gate.frame(code, performance.now())
          if (accepted) onCode(accepted)
        }
      },
      controller.signal,
    )
    .then((fn) => {
      if (closed) fn()
      else stop = fn
    })
    .catch((e) => {
      if (!closed) onError(e)
    })
  return () => {
    closed = true
    controller.abort()
    stop?.()
    const stream = video.srcObject
    if (stream && 'getTracks' in stream) (stream as MediaStream).getTracks().forEach((t) => t.stop())
    video.srcObject = null
  }
}
