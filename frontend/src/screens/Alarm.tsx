/**
 * Экран будильника: крещендо-саксофон + камера + распознавание питья.
 * Fallback-цепочка: 2 повтора распознавания → ручное подтверждение с пометкой «непроверено».
 */
import { useEffect, useRef, useState } from 'react';
import { SaxAlarmPlayer } from '../lib/audio';
import { detectDrinking, loadModels } from '../vision/drinkDetector';
import { dhashFromCanvas, hamming } from '../lib/phash';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';

type Phase = 'ringing' | 'camera' | 'detecting' | 'success' | 'failed';

export function Alarm({ alarmId, boost, onDone }: { alarmId: number; boost: number; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('ringing');
  const [attempts, setAttempts] = useState(0);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const player = useRef(new SaxAlarmPlayer(90));
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastHash = useRef<string | null>(null);

  useEffect(() => () => { player.current.stop(); stopCam(); }, []);

  function stopCam() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  /** User gesture → можно запускать звук (обход запрета автоплея). */
  async function wakeUp() {
    haptic('tap');
    await player.current.start();
    loadModels(setMessage); // грузим модели параллельно со звуком
    setPhase('camera');
    // ТОЛЬКО живая камера — upload из галереи в приложении отсутствует
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 } },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }

  async function proveDrink() {
    if (!videoRef.current || !canvasRef.current) return;
    haptic('tap');
    setPhase('detecting');
    setMessage('Смотрю, как ты пьёшь…');
    const captureMs = Date.now();
    const frames: Blob[] = [];

    const result = await detectDrinking(videoRef.current, canvasRef.current, frames);

    // клиентская прекроверка дубликата (мгновенный отказ до похода на сервер)
    const h = dhashFromCanvas(canvasRef.current);
    if (lastHash.current && hamming(lastHash.current, h) <= 6 && !result.ok) {
      setMessage('Это тот же кадр. Сделай настоящий глоток!');
      setPhase('camera');
      return;
    }
    lastHash.current = h;

    if (result.ok) {
      await submit(frames, captureMs, result.score, result.liveness, false);
    } else {
      const next = attempts + 1;
      setAttempts(next);
      if (next < 2) {
        setMessage(`${result.reason}. Попытка ${next + 1} из 2.`);
        setPhase('camera');
        haptic('error');
      } else {
        setMessage(result.reason ?? '');
        setPhase('failed'); // → предложение ручного подтверждения
      }
    }
  }

  /** Fallback: ручное подтверждение — засчитывается с пометкой «непроверено». */
  async function manualConfirm() {
    if (!videoRef.current || !canvasRef.current) return;
    const captureMs = Date.now();
    const frames: Blob[] = [];
    const g = canvasRef.current.getContext('2d')!;
    for (let i = 0; i < 3; i++) {
      g.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
      frames.push(await new Promise<Blob>(r => canvasRef.current!.toBlob(b => r(b!), 'image/jpeg', 0.8)));
      await new Promise(r => setTimeout(r, 400));
    }
    await submit(frames, captureMs, 0, 0, true);
  }

  async function submit(frames: Blob[], captureMs: number, score: number, liveness: number, manual: boolean) {
    const fd = new FormData();
    fd.set('alarmId', String(alarmId));
    fd.set('captureMs', String(captureMs));
    fd.set('clientScore', String(score));
    fd.set('livenessScore', String(liveness));
    if (manual) fd.set('manual', '1');
    frames.forEach((b, i) => fd.append('frames', b, `f${i}.jpg`));

    try {
      const res = await api.submitDrink(fd);
      setStatus(res.status);
      player.current.stop();
      stopCam();
      haptic('success');
      setPhase('success');
      setTimeout(onDone, 2200);
    } catch (e: any) {
      haptic('error');
      const reason = e.body?.reasons?.[0];
      setMessage(
        reason === 'rate_limited' ? 'Слишком часто! Дай печени шанс.' :
        reason === 'duplicate_image' ? 'Этот кадр уже был. Никакого читерства 😏' :
        'Не получилось отправить. Ещё раз?'
      );
      setPhase('camera');
    }
  }

  return (
    <div className="alarm-screen">
      {phase === 'ringing' && (
        <>
          <div className="sax">🎷</div>
          <h1>ПОРА ПИТЬ!</h1>
          {boost > 1 && <p className="dim">Сквад-буст ×{boost.toFixed(2)} — твои друзья уже наливают</p>}
          <div className="vol-meter">
            {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ animationDelay: `${i * 90}ms` }} />)}
          </div>
          <p className="dim">Саксофоны будут играть всё громче, пока ты не выпьешь</p>
          <button className="btn danger" onClick={wakeUp}>🔊 Проснуться и налить</button>
        </>
      )}

      {(phase === 'camera' || phase === 'detecting' || phase === 'failed') && (
        <>
          <div className="cam-wrap">
            <video ref={videoRef} playsInline muted />
            <div className="scan-ring" />
            <div className="cam-hint">
              {phase === 'detecting' ? '🎥 Пей, не останавливайся — снимаю серию…' : '🥤 Поднеси напиток ко рту и жми кнопку'}
            </div>
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {message && <p className="dim">{message}</p>}

          {phase === 'camera' && <button className="btn" onClick={proveDrink}>📸 Я пью — проверяй</button>}
          {phase === 'detecting' && <button className="btn" disabled>Распознаю…</button>}
          {phase === 'failed' && (
            <>
              <button className="btn secondary" onClick={() => { setAttempts(0); setPhase('camera'); }}>
                🔁 Попробовать ещё раз
              </button>
              <button className="btn" onClick={manualConfirm}>
                ✋ Я честно выпил (пометка «непроверено»)
              </button>
            </>
          )}
        </>
      )}

      {phase === 'success' && (
        <>
          <div className="sax" style={{ animation: 'none' }}>🥃</div>
          <h1>Дринк засчитан!</h1>
          <span className={`badge ${status}`}>
            {status === 'verified' ? '✔ проверено CV' : status === 'unverified' ? '~ непроверено' : '⚑ на проверке'}
          </span>
          <p className="dim">Саксофоны умолкли. До следующего раза…</p>
        </>
      )}
    </div>
  );
}
