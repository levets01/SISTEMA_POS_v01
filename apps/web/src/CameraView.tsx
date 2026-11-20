import { useEffect, useRef } from 'react'
import { ScanLine, X } from 'lucide-react'
import { camera, scanContinuously } from './scanner'
import { message } from './client'
export function Scanner({
  code,
  close,
  error,
}: {
  code: (s: string) => void
  close: () => void
  error: (s: string) => void
}) {
  const video = useRef<HTMLVideoElement>(null),
    callbacks = useRef({ code, close, error })
  callbacks.current = { code, close, error }
  useEffect(() => {
    const stop = scanContinuously(
      camera,
      video.current!,
      (c) => callbacks.current.code(c),
      (e) => {
        callbacks.current.error(message(e))
        callbacks.current.close()
      },
    )
    const hide = () => {
      if (document.hidden) {
        stop()
        callbacks.current.close()
      }
    }
    const leave = () => {
      stop()
      callbacks.current.close()
    }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', leave)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', leave)
    }
  }, [])
  return (
    <div className="scanner">
      <video autoPlay muted playsInline ref={video} />
      <div className="target" />
      <button onClick={close} className="scanclose" aria-label="Cerrar escáner">
        <X size={18} />
      </button>
      <span>
        <ScanLine size={16} /> Retira el producto para repetir la lectura
      </span>
    </div>
  )
}
