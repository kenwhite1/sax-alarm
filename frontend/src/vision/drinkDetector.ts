/**
 * Распознавание «питья» на клиенте:
 *  1) coco-ssd (TFJS) — объекты: cup / bottle / wine glass
 *  2) MediaPipe FaceLandmarker — координаты рта
 *  3) Liveness: серия из N кадров, объект должен ДВИГАТЬСЯ к рту (а не статичное фото)
 *
 * score = доля кадров, где сосуд перекрывает зону рта, взвешенная на уверенность детекции.
 * liveness = нормированное смещение сосуда между кадрами + факт сближения с ртом.
 */
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import '@tensorflow/tfjs';

const DRINK_CLASSES = new Set(['cup', 'bottle', 'wine glass']);

export interface FrameResult {
  hasVessel: boolean;
  vesselScore: number;
  vesselCenter: [number, number] | null;   // нормированные 0..1
  mouth: [number, number] | null;
  nearMouth: boolean;
}

export interface DetectionResult {
  ok: boolean;
  score: number;        // 0..1 — уверенность «человек пьёт»
  liveness: number;     // 0..1 — живость серии
  frames: FrameResult[];
  reason?: string;
}

let ssd: cocoSsd.ObjectDetection | null = null;
let face: FaceLandmarker | null = null;

export async function loadModels(onProgress?: (msg: string) => void) {
  if (!ssd) {
    onProgress?.('Загружаю детектор объектов…');
    ssd = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
  }
  if (!face) {
    onProgress?.('Загружаю детектор лица…');
    const fileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    face = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      },
      runningMode: 'IMAGE',
      numFaces: 1,
    });
  }
}

async function analyzeFrame(canvas: HTMLCanvasElement): Promise<FrameResult> {
  const [objects, faces] = await Promise.all([
    ssd!.detect(canvas),
    Promise.resolve(face!.detect(canvas)),
  ]);

  const vessel = objects
    .filter(o => DRINK_CLASSES.has(o.class))
    .sort((a, b) => b.score - a.score)[0];

  let mouth: [number, number] | null = null;
  const lm = faces.faceLandmarks?.[0];
  if (lm) {
    // 13/14 — верхняя/нижняя губа в топологии FaceMesh
    mouth = [(lm[13].x + lm[14].x) / 2, (lm[13].y + lm[14].y) / 2];
  }

  let vesselCenter: [number, number] | null = null;
  let nearMouth = false;
  if (vessel) {
    const [x, y, w, h] = vessel.bbox;
    vesselCenter = [(x + w / 2) / canvas.width, (y + h / 2) / canvas.height];
    if (mouth) {
      // верхняя кромка сосуда близко ко рту (пьют верхом стакана, не центром)
      const topY = y / canvas.height;
      const dx = Math.abs(vesselCenter[0] - mouth[0]);
      const dy = Math.abs(topY - mouth[1]);
      nearMouth = dx < 0.22 && dy < 0.22;
    }
  }

  return {
    hasVessel: !!vessel,
    vesselScore: vessel?.score ?? 0,
    vesselCenter,
    mouth,
    nearMouth,
  };
}

/** Захват N кадров из живого <video> с интервалом intervalMs и полный анализ серии. */
export async function detectDrinking(
  video: HTMLVideoElement,
  captureCanvas: HTMLCanvasElement,
  frameJpegs: Blob[],           // сюда складываются JPEG для отправки на сервер
  n = 6,
  intervalMs = 550
): Promise<DetectionResult> {
  const results: FrameResult[] = [];
  const g = captureCanvas.getContext('2d')!;
  captureCanvas.width = 480;
  captureCanvas.height = Math.round(480 * video.videoHeight / (video.videoWidth || 1)) || 640;

  for (let i = 0; i < n; i++) {
    g.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    const blob: Blob = await new Promise(r => captureCanvas.toBlob(b => r(b!), 'image/jpeg', 0.8));
    frameJpegs.push(blob);
    results.push(await analyzeFrame(captureCanvas));
    if (i < n - 1) await new Promise(r => setTimeout(r, intervalMs));
  }

  const withVessel = results.filter(r => r.hasVessel);
  if (withVessel.length === 0) {
    return { ok: false, score: 0, liveness: 0, frames: results, reason: 'Не вижу стакан/бутылку/кружку' };
  }
  if (!results.some(r => r.mouth)) {
    return { ok: false, score: 0, liveness: 0, frames: results, reason: 'Не вижу лицо — селфи-режим!' };
  }

  // score: доля кадров с сосудом у рта, взвешенная на уверенность
  const near = results.filter(r => r.nearMouth);
  const score =
    (near.length / n) * 0.7 +
    (withVessel.reduce((s, r) => s + r.vesselScore, 0) / withVessel.length) * 0.3;

  // liveness: сосуд двигался + приближался ко рту
  let movement = 0;
  let approaches = 0;
  const centers = results.map(r => r.vesselCenter).filter(Boolean) as [number, number][];
  for (let i = 1; i < centers.length; i++) {
    movement += Math.hypot(centers[i][0] - centers[i - 1][0], centers[i][1] - centers[i - 1][1]);
  }
  const mouths = results.map(r => r.mouth);
  for (let i = 1; i < results.length; i++) {
    const a = results[i - 1], b = results[i];
    if (a.vesselCenter && b.vesselCenter && mouths[i]) {
      const dA = Math.hypot(a.vesselCenter[0] - mouths[i]![0], a.vesselCenter[1] - mouths[i]![1]);
      const dB = Math.hypot(b.vesselCenter[0] - mouths[i]![0], b.vesselCenter[1] - mouths[i]![1]);
      if (dB < dA - 0.01) approaches++;
    }
  }
  const liveness = Math.min(1, movement * 4) * 0.6 + Math.min(1, approaches / 2) * 0.4;

  const ok = near.length >= 2 && liveness > 0.15;
  return {
    ok, score: +score.toFixed(3), liveness: +liveness.toFixed(3), frames: results,
    reason: ok ? undefined : near.length < 2 ? 'Поднеси напиток ко рту' : 'Слишком статично — сделай глоток по-настоящему',
  };
}
