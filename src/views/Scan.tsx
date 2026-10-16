import { useEffect, useRef, useState } from 'preact/hooks';
import { Screen, TopBar } from '../ui/components';
import { Icon } from '../ui/icons';
import { back, go, qs } from '../router';
import { useAppState } from '../lib/store';
import { foodByBarcode, put } from '../lib/db';
import { lookupBarcode } from '../lib/online';
import { foodCache } from '../lib/actions';

type Phase = { kind: 'scanning' } | { kind: 'looking'; code: string } | { kind: 'notfound'; code: string; errors: string[] } | { kind: 'nocamera'; reason: string };

export function Scan({ q }: { q: URLSearchParams }) {
  const { settings } = useAppState();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });
  const [torch, setTorch] = useState<boolean | null>(null);
  const [manual, setManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const passthrough = { date: q.get('date') ?? undefined, meal: q.get('meal') ?? undefined, mode: q.get('mode') ?? undefined, recipe: q.get('recipe') ?? undefined };

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const handleCode = async (code: string) => {
    stop();
    setPhase({ kind: 'looking', code });
    const local = await foodByBarcode(code);
    if (local) return openFood(local.id);
    const { food, errors } = await lookupBarcode(code, settings.fdcKey);
    if (food) {
      foodCache.set(food.id, food);
      await put('foods', { ...food, createdAt: Date.now() });
      return openFood(food.id);
    }
    setPhase({ kind: 'notfound', code, errors });
  };

  const openFood = (key: string) => go('/food' + qs({ key, ...passthrough }), { replace: true });

  useEffect(() => {
    if (phase.kind !== 'scanning' || manual) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase({ kind: 'nocamera', reason: 'Camera access is not available in this browser.' });
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
        });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] };
        if (caps.torch) setTorch(false);
        if (caps.focusMode?.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {});
        const { createDetector, normalizeScan, validGtin } = await import('../lib/barcode');
        const detector = createDetector();
        let last = '';
        const tick = async () => {
          if (!alive) return;
          try {
            if (video.readyState >= 2) {
              const found = await detector.detect(video);
              for (const b of found) {
                const code = normalizeScan(b.rawValue, b.format);
                if (!validGtin(code)) continue;
                // require two consecutive identical reads to rule out misreads
                if (code === last) { alive = false; handleCode(code); return; }
                last = code;
              }
            }
          } catch { /* frame not ready */ }
          timer = setTimeout(tick, 90);
        };
        tick();
      } catch (e: any) {
        setPhase({ kind: 'nocamera', reason: e?.name === 'NotAllowedError' ? 'Camera permission was denied. You can allow it in Settings → Safari → Camera, or type the number below.' : 'Could not start the camera.' });
      }
    })();
    return () => { alive = false; clearTimeout(timer); stop(); };
  }, [phase.kind, manual]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch;
    await track.applyConstraints({ advanced: [{ torch: next } as any] }).catch(() => {});
    setTorch(next);
  };

  const fromPhoto = async (file: File) => {
    const { createDetector, normalizeScan, validGtin } = await import('../lib/barcode');
    const found = await createDetector().detect(file).catch(() => []);
    const hit = found.map((b) => normalizeScan(b.rawValue, b.format)).find(validGtin);
    if (hit) handleCode(hit);
    else alert('No barcode found in that photo. Try a closer, sharper shot.');
  };

  if (phase.kind === 'scanning' && !manual) {
    return (
      <div class="scanner">
        <video ref={videoRef} playsInline muted autoPlay />
        <div class="frame" />
        <div class="top">
          <button class="icon-btn" aria-label="Close" onClick={() => { stop(); back('/add'); }}><Icon name="close" /></button>
          {torch != null && <button class="icon-btn" aria-label="Flashlight" onClick={toggleTorch}><Icon name="quick" filled={torch} /></button>}
        </div>
        <div class="bottom">
          <div class="msg">Point at a barcode</div>
          <div class="btn-row">
            <button class="btn secondary" onClick={() => { stop(); setManual(true); }}>Type number</button>
            <label class="btn secondary">Photo<input type="file" accept="image/*" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) fromPhoto(f); }} /></label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Screen tabs={false}>
      <TopBar title="Barcode" backTo="/add" />
      {phase.kind === 'looking' && <div class="card center"><div class="bold">Looking up {phase.code}…</div><div class="hint">Checking your foods, Open Food Facts and USDA.</div></div>}
      {phase.kind === 'nocamera' && <div class="card"><div class="bold">Camera unavailable</div><div class="hint">{phase.reason}</div></div>}
      {phase.kind === 'notfound' && (
        <div class="card stack">
          <div>
            <div class="bold">{phase.errors.length ? `Couldn't look up ${phase.code}` : `No match for ${phase.code}`}</div>
            <div class="hint">{phase.errors.length
              ? 'The food databases could not be reached — check your connection and scan again, or enter it yourself.'
              : "This product isn't in Open Food Facts or USDA yet. Add it once and it'll scan instantly next time."}</div>
            {phase.errors.map((e) => <div class="hint" key={e}>{e}</div>)}
          </div>
          <button class="btn block" onClick={() => go('/custom-food' + qs({ barcode: phase.code, ...passthrough }), { replace: true })}>Enter the nutrition label</button>
          <button class="btn ghost block" onClick={() => go('/custom-food' + qs({ barcode: phase.code, ai: 1, ...passthrough }), { replace: true })}>Read the label with {settings.ai === 'claude' ? 'Claude' : 'ChatGPT'}</button>
          <button class="btn secondary block" onClick={() => { setManual(false); setPhase({ kind: 'scanning' }); }}>Scan again</button>
        </div>
      )}
      {(manual || phase.kind === 'nocamera') && phase.kind !== 'looking' && (
        <div class="card">
          <label class="field">
            <span>Barcode number</span>
            <input class="input" inputMode="numeric" autoComplete="off" value={manualCode} placeholder="e.g. 012345678905"
              onInput={(e) => setManualCode((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
          </label>
          <div class="btn-row">
            {phase.kind !== 'nocamera' && <button class="btn ghost" onClick={() => { setManual(false); setPhase({ kind: 'scanning' }); }}>Use camera</button>}
            <button class="btn" disabled={manualCode.length < 8} onClick={() => handleCode(manualCode)}>Look up</button>
          </div>
          <label class="btn ghost block" style={{ marginTop: 8 }}>Scan from a photo<input type="file" accept="image/*" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) fromPhoto(f); }} /></label>
        </div>
      )}
    </Screen>
  );
}
