import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Check, X, ShieldCheck } from 'lucide-react';

/**
 * Live camera capture modal. Streams the user's front camera via getUserMedia
 * and lets them snap a single frame as a JPEG File. Uploading from disk is
 * intentionally NOT possible here — the file is generated from the live feed.
 *
 * Props:
 *   open       — show/hide
 *   onCancel   — user closed without taking a photo
 *   onCapture  — user confirmed: receives a File (image/jpeg)
 */
export default function LiveCaptureModal({ open, onCancel, onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState(null); // { dataUrl, blob }

  // Open the camera when the modal opens; tear it down when it closes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setReady(false);
    setSnapshot(null);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Your browser does not support camera capture.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 720 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (err) {
        setError(
          err.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access and try again.'
            : err.message || 'Could not open the camera.',
        );
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setReady(false);
    };
  }, [open]);

  if (!open) return null;

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // Mirror horizontally to match the on-screen preview (since the preview
    // uses scaleX(-1)).
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setSnapshot({ blob, dataUrl: canvas.toDataURL('image/jpeg', 0.9) });
      },
      'image/jpeg',
      0.9,
    );
  };

  const retake = () => setSnapshot(null);

  const confirm = () => {
    if (!snapshot?.blob) return;
    const file = new File([snapshot.blob], `verification-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });
    onCapture?.(file);
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-neutral-950 text-white shadow-2xl flex flex-col overflow-hidden animate-[pop_150ms_ease-out]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="min-w-0 flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-bold">Live verification</p>
              <p className="text-[11px] text-white/60">
                Take a real-time selfie to confirm you're a real person.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative aspect-square bg-black">
          {/* Live preview */}
          {!snapshot && (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' /* mirror for natural selfie */ }}
            />
          )}

          {/* Captured snapshot preview */}
          {snapshot && (
            <img
              src={snapshot.dataUrl}
              alt="Captured selfie"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {/* Status overlays */}
          {!ready && !error && !snapshot && (
            <div className="absolute inset-0 grid place-items-center bg-black/40">
              <div className="text-center text-white/80 text-sm">
                <Camera size={28} className="mx-auto mb-2 opacity-70" />
                Starting camera…
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 grid place-items-center bg-black/60 p-6 text-center">
              <p className="text-rose-300 text-sm">{error}</p>
            </div>
          )}

          {/* Soft face-target ring */}
          {ready && !snapshot && (
            <div className="absolute inset-6 rounded-full border-2 border-white/30 pointer-events-none" />
          )}

          <canvas ref={canvasRef} hidden />
        </div>

        <div className="px-5 py-4 flex items-center justify-center gap-3 border-t border-white/10 bg-black/40">
          {!snapshot ? (
            <button
              type="button"
              onClick={capture}
              disabled={!ready}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-tinder text-white text-sm font-semibold shadow-tinder/30 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <Camera size={16} /> Capture photo
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={retake}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition"
              >
                <RefreshCw size={14} /> Retake
              </button>
              <button
                type="button"
                onClick={confirm}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold shadow-emerald-500/40 shadow-lg transition"
              >
                <Check size={14} strokeWidth={2.6} /> Use this photo
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
