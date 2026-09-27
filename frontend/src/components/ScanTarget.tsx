/** Scan a QR label, or type the printed code.
 *
 *  Camera scanning is a progressive enhancement: BarcodeDetector exists on
 *  Android/Chrome and not on iOS Safari, so the manual field is always present
 *  and always works. A student standing in a hostel corridor with a cracked
 *  screen must still be able to file a complaint.
 */

import { useEffect, useRef, useState } from 'react'
import { Button, Card, Field, TextInput } from './ui'

type DetectorLike = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }

export function ScanTarget({
  onCode,
  hint = 'Point the camera at the label, or type the code printed on it.',
  submitLabel = 'Use this code',
}: {
  onCode: (code: string) => void
  hint?: string
  submitLabel?: string
}) {
  const [manual, setManual] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const supported =
    typeof window !== 'undefined' && 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia)

  useEffect(() => {
    if (!scanning) return
    let cancelled = false
    let raf = 0

    const start = async () => {
      try {
        const Detector = (window as any).BarcodeDetector
        const detector: DetectorLike = new Detector({ formats: ['qr_code', 'code_128', 'code_39'] })
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        const tick = async () => {
          if (cancelled || !videoRef.current) return
          try {
            const found = await detector.detect(videoRef.current)
            if (found.length) {
              stop()
              onCode(found[0].rawValue.trim().toUpperCase())
              return
            }
          } catch {
            /* a dropped frame is not an error worth reporting */
          }
          raf = window.setTimeout(tick, 350) as unknown as number
        }
        void tick()
      } catch {
        setError('The camera could not be started. Type the code instead.')
        setScanning(false)
      }
    }

    const stop = () => {
      cancelled = true
      window.clearTimeout(raf)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setScanning(false)
    }

    void start()
    return stop
  }, [scanning, onCode])

  return (
    <Card>
      <Field label="Asset / room code" hint={hint}>
        <TextInput value={manual} onChange={setManual} placeholder="e.g. CR-FAN-014 or CR-ROOM-AA-101" />
      </Field>
      <div className="row wrap">
        <Button
          variant="primary"
          onClick={() => manual.trim() && onCode(manual.trim().toUpperCase())}
          disabled={!manual.trim()}
        >
          {submitLabel}
        </Button>
        {supported ? (
          <Button variant={scanning ? 'danger' : 'info'} onClick={() => setScanning((value) => !value)}>
            {scanning ? 'Stop camera' : 'Scan QR code'}
          </Button>
        ) : (
          <span className="small muted">Camera scanning is unavailable in this browser.</span>
        )}
      </div>
      {error ? <div className="field-error">{error}</div> : null}
      {scanning ? (
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: '100%', marginTop: 12, border: '3px solid var(--ink)', borderRadius: 6 }}
        />
      ) : null}
    </Card>
  )
}
