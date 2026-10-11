import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { DetectedObject, ObjectDetection } from '@tensorflow-models/coco-ssd';
import HospitalPicker from '../components/HospitalPicker';
import Spinner from '../components/Spinner';
import { DETECT_INTERVAL_MS, MAX_DETECTIONS, MODEL_BASE, PERSON_MIN_SCORE, THERMAL_RES } from '../config/camera';
import { CROWDING_LABELS } from '../config/labels';
import { CROWD_STYLE } from '../config/ui';
import { useHospital } from '../hooks/useHospitals';
import { useNow } from '../hooks/useInterval';
import { useSelectedHospitalId } from '../hooks/useSelectedHospital';
import { pushWindow, readingDue, smoothedCount, uploadDecision, type UploadState } from '../lib/cameraLogic';
import { applyThermal } from '../lib/thermalPalette';
import { crowdingLevel, crowdRatio } from '../lib/crowding';
import { formatAgo } from '../lib/time';
import { errorMessage } from '../services/authService';
import { appendErReading, updateErCount } from '../services/hospitalService';

type Source = 'webcam' | 'file';
type ModelState = 'loading' | 'ready' | 'error';

/**
 * Thermal people counter (spec 9.5). The feed is rendered with a thermal-camera look
 * (see lib/thermalPalette) to stand in for a real thermal sensor in this prototype.
 * Counting still runs on the original frame, so the number is unaffected. Frames are
 * analysed in this browser only; the only thing that leaves the device is the count.
 */
export default function CameraPage() {
  const { hospitalId, canChoose, choose } = useSelectedHospitalId();
  const hospital = useHospital(hospitalId);
  const now = useNow(1000);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null); // offscreen frame used to recolor to thermal
  const modelRef = useRef<ObjectDetection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileUrlRef = useRef<string | null>(null);

  const [modelState, setModelState] = useState<ModelState>('loading');
  const [modelError, setModelError] = useState('');
  const [source, setSource] = useState<Source | null>(null);
  const [running, setRunning] = useState(false);
  const [rawCount, setRawCount] = useState(0);
  const [smoothed, setSmoothed] = useState(0);
  const [fps, setFps] = useState(0);
  const [upload, setUpload] = useState<{ at: number | null; error: string | null }>({ at: null, error: null });

  // Mutable loop state (refs so the detection loop never re-subscribes).
  const bufferRef = useRef<number[]>([]);
  const uploadStateRef = useRef<UploadState>({ lastValue: null, lastAt: null });
  const uploadingRef = useRef(false);
  const lastReadingAtRef = useRef<number | null>(null);
  const lastDetectAtRef = useRef<number | null>(null);
  const hospitalIdRef = useRef(hospitalId);
  hospitalIdRef.current = hospitalId;

  // ---- Load the model once (WebGL backend). Loaded lazily so other pages stay light. ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tf = await import('@tensorflow/tfjs');
      await tf.setBackend('webgl').catch(() => false);
      await tf.ready();
      const cocoSsd = await import('@tensorflow-models/coco-ssd');
      const model = await cocoSsd.load({ base: MODEL_BASE });
      if (cancelled) {
        model.dispose();
        return;
      }
      modelRef.current = model;
      setModelState('ready');
    })().catch((err) => {
      if (cancelled) return;
      setModelState('error');
      setModelError(errorMessage(err));
    });
    return () => {
      cancelled = true;
      modelRef.current?.dispose();
      modelRef.current = null;
    };
  }, []);

  // ---- Sources ----
  const stopSource = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    fileUrlRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
      video.load();
    }
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setRunning(false);
    setSource(null);
  }, []);

  useEffect(() => stopSource, [stopSource]); // stop camera tracks on unmount

  const resetCounting = () => {
    bufferRef.current = [];
    lastDetectAtRef.current = null;
    setRawCount(0);
    setSmoothed(0);
    setFps(0);
  };

  const startWebcam = async () => {
    stopSource();
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Camera needs a secure connection. Open the app via https:// or http://localhost.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      resetCounting();
      setSource('webcam');
      setRunning(true);
      toast.success('Thermal camera started');
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      toast.error(
        name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow it in the browser address bar and try again.'
          : name === 'NotFoundError'
            ? 'No camera found on this device.'
            : `Could not start camera: ${errorMessage(err)}`,
      );
    }
  };

  const startFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stopSource();
    const url = URL.createObjectURL(file);
    fileUrlRef.current = url;
    const video = videoRef.current!;
    video.src = url;
    video.loop = true;
    try {
      await video.play();
      resetCounting();
      setSource('file');
      setRunning(true);
      toast.success(`Playing ${file.name}`);
    } catch (err) {
      toast.error(`Could not play this video: ${errorMessage(err)}`);
      stopSource();
    }
  };

  // ---- Switching hospital starts a fresh upload schedule ----
  useEffect(() => {
    uploadStateRef.current = { lastValue: null, lastAt: null };
    lastReadingAtRef.current = null;
    setUpload({ at: null, error: null });
  }, [hospitalId]);

  // ---- Detection loop: one detection at a time, at most every DETECT_INTERVAL_MS. ----
  // A timer (not requestAnimationFrame) keeps counting while the tab is in the background.
  useEffect(() => {
    if (!running || modelState !== 'ready') return;
    let stopped = false;
    let timer: number | undefined;

    const maybeUpload = (value: number) => {
      const hid = hospitalIdRef.current;
      if (!hid || uploadingRef.current) return;
      const t = Date.now();
      if (!uploadDecision(value, t, uploadStateRef.current)) return;
      uploadingRef.current = true;
      updateErCount(hid, value, 'camera')
        .then(async (level) => {
          uploadStateRef.current = { lastValue: value, lastAt: t };
          setUpload({ at: t, error: null });
          if (readingDue(t, lastReadingAtRef.current)) {
            lastReadingAtRef.current = t;
            await appendErReading(hid, value, level);
          }
        })
        .catch((err) => {
          // Back off until the next allowed upload instead of retrying every frame.
          uploadStateRef.current = { ...uploadStateRef.current, lastAt: t };
          setUpload((u) => ({ ...u, error: errorMessage(err) }));
        })
        .finally(() => {
          uploadingRef.current = false;
        });
    };

    const tick = async () => {
      if (stopped) return;
      const started = performance.now();
      const video = videoRef.current;
      const model = modelRef.current;
      if (video && model && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const detections = await model.detect(video, MAX_DETECTIONS, PERSON_MIN_SCORE);
          if (stopped) return;
          const people = detections.filter((d) => d.class === 'person' && d.score >= PERSON_MIN_SCORE);
          renderThermal(canvasRef.current, scratchRef, video, people);
          bufferRef.current = pushWindow(bufferRef.current, people.length);
          const s = smoothedCount(bufferRef.current);
          setRawCount(people.length);
          setSmoothed(s);
          const t = performance.now();
          if (lastDetectAtRef.current !== null) setFps(1000 / (t - lastDetectAtRef.current));
          lastDetectAtRef.current = t;
          maybeUpload(s);
        } catch (err) {
          console.error('Detection failed', err);
        }
      }
      const elapsed = performance.now() - started;
      timer = window.setTimeout(tick, Math.max(0, DETECT_INTERVAL_MS - elapsed));
    };

    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [running, modelState]);

  const capacity = hospital.data?.erComfortCapacity ?? 0;
  const level = crowdingLevel(crowdRatio(smoothed, capacity));
  const style = CROWD_STYLE[level];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div role="note" className="mb-4 rounded-md border border-green-700 bg-green-50 px-4 py-3 text-sm text-green-900">
        <span aria-hidden="true">🔒 </span>
        <strong>People are counted on this device.</strong> The thermal view is privacy-friendly by design — no faces, and no video or images are stored or sent, only the number.
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Thermal camera — ER waiting room</h1>
          <p className="text-sm text-slate-600">
            {hospital.data?.name ?? '…'} ·{' '}
            <Link to={canChoose ? `/hospital?h=${hospitalId}` : '/hospital'} className="font-medium text-red-700 underline">
              Back to dashboard
            </Link>
          </p>
        </div>
        {canChoose && <HospitalPicker value={hospitalId} onChange={choose} />}
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startWebcam}
          disabled={modelState !== 'ready'}
          className={`rounded-md px-4 py-3 font-semibold shadow-sm disabled:opacity-50 ${
            source === 'webcam' ? 'bg-red-700 text-white' : 'border border-slate-300 bg-white hover:bg-slate-50'
          }`}
        >
          🌡️ Thermal camera
        </button>
        <label
          className={`cursor-pointer rounded-md px-4 py-3 font-semibold shadow-sm focus-within:ring-2 focus-within:ring-blue-600 ${
            modelState !== 'ready' ? 'pointer-events-none opacity-50' : ''
          } ${source === 'file' ? 'bg-red-700 text-white' : 'border border-slate-300 bg-white hover:bg-slate-50'}`}
        >
          🎞️ Video file
          <input type="file" accept="video/*" onChange={startFile} className="sr-only" disabled={modelState !== 'ready'} />
        </label>
        {source && (
          <button type="button" onClick={stopSource} className="rounded-md border border-slate-300 bg-white px-4 py-3 font-semibold hover:bg-slate-50">
            ■ Stop
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} muted playsInline className="pointer-events-none absolute h-px w-px opacity-0" aria-hidden="true" />
          <canvas ref={canvasRef} className="block h-auto w-full" aria-hidden="true" />
          {source && <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs font-semibold tracking-wide text-orange-300">THERMAL</span>}
          {!source && (
            <div className="absolute inset-0 flex min-h-[16rem] items-center justify-center p-6 text-center text-slate-300">
              {modelState === 'loading' ? (
                <Spinner label="Loading the AI model (first time takes a few seconds)…" />
              ) : modelState === 'error' ? (
                <p className="text-red-300">Could not load the AI model: {modelError}</p>
              ) : (
                <p>Choose “Thermal camera” or “Video file” to start counting.</p>
              )}
            </div>
          )}
          {!source && <div className="min-h-[16rem]" />}
        </div>

        <aside className="space-y-3" aria-live="polite">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-medium text-slate-600">People waiting (smoothed)</h2>
            <p className="text-6xl font-bold tabular-nums">{smoothed}</p>
            <span className={`mt-2 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-sm font-semibold ${style.badge}`}>
              <span aria-hidden="true">{style.icon}</span> Crowding: {CROWDING_LABELS[level]}
            </span>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-slate-600">Comfortable capacity</dt>
              <dd className="text-right tabular-nums">{capacity || '—'}</dd>
              <dt className="text-slate-600">In this frame</dt>
              <dd className="text-right tabular-nums">{rawCount}</dd>
              <dt className="text-slate-600">Detections / s</dt>
              <dd className="text-right tabular-nums">{running ? fps.toFixed(1) : '—'}</dd>
            </dl>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 className="font-medium text-slate-600">Upload status</h2>
            {upload.error ? (
              <p className="mt-1 text-red-700">⚠ Upload failed: {upload.error}</p>
            ) : upload.at ? (
              <p className="mt-1 text-green-800">Uploading ✓ last sent {sentAgo(upload.at, now)}</p>
            ) : (
              <p className="mt-1 text-slate-600">{running ? 'Starting…' : 'Not running'}</p>
            )}
            <p className="mt-2 text-xs text-slate-500">Sends the number when it changes (at most every 5 s) and a heartbeat every 30 s.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** "3 s ago" for the first minute, then the usual "2 min ago". */
function sentAgo(at: number, now: Date): string {
  const sec = Math.max(0, Math.round((now.getTime() - at) / 1000));
  return sec < 60 ? `${sec} s ago` : formatAgo(new Date(at), now);
}

/**
 * Renders the current video frame as a thermal-style image on the visible canvas,
 * then draws person boxes and the live count on top. Prototype stand-in for a real
 * thermal camera — nothing here is ever saved.
 */
function renderThermal(
  canvas: HTMLCanvasElement | null,
  scratchRef: { current: HTMLCanvasElement | null },
  video: HTMLVideoElement,
  people: DetectedObject[],
) {
  if (!canvas) return;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Downscale the frame to a small offscreen buffer first. Low resolution is what
  // destroys faces and fine detail — the recoloured result reads as thermal "heat
  // blobs", not a tinted photo. Scaling it back up (smoothed) blurs it further.
  const lowH = THERMAL_RES;
  const lowW = Math.max(1, Math.round((lowH * w) / h));
  let scratch = scratchRef.current;
  if (!scratch) {
    scratch = document.createElement('canvas');
    scratchRef.current = scratch;
  }
  if (scratch.width !== lowW || scratch.height !== lowH) {
    scratch.width = lowW;
    scratch.height = lowH;
  }
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!sctx) return;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(video, 0, 0, lowW, lowH); // shrink: averages pixels → blur
  const frame = sctx.getImageData(0, 0, lowW, lowH);
  applyThermal(frame.data);
  sctx.putImageData(frame, 0, 0);

  // Blow the small thermal buffer back up to full size with smoothing on, so the
  // blocky low-res image becomes a soft thermal gradient.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(scratch, 0, 0, lowW, lowH, 0, 0, w, h);

  // Boxes + labels drawn on top, in cyan so they stay readable over warm colours.
  const scale = Math.max(1, canvas.width / 640);
  ctx.lineWidth = 3 * scale;
  ctx.font = `${14 * scale}px system-ui, sans-serif`;
  for (const p of people) {
    const [x, y] = p.bbox;
    const [, , bw, bh] = p.bbox;
    ctx.strokeStyle = '#22d3ee';
    ctx.strokeRect(x, y, bw, bh);
    const label = `person ${Math.round(p.score * 100)}%`;
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(x, Math.max(0, y - 20 * scale), ctx.measureText(label).width + 8 * scale, 20 * scale);
    ctx.fillStyle = '#083344';
    ctx.fillText(label, x + 4 * scale, Math.max(15 * scale, y - 5 * scale));
  }
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(8 * scale, 8 * scale, 150 * scale, 32 * scale);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${18 * scale}px system-ui, sans-serif`;
  ctx.fillText(`People: ${people.length}`, 16 * scale, 30 * scale);
}
