/**
 * Саксофонный будильник: зацикленный трек + плавное крещендо через GainNode.
 *
 * Ограничение Telegram/браузеров: авто-звук запрещён до user gesture.
 * Обход: пуш из бота → пользователь открывает Mini App → жмёт «Проснуться»
 * (это и есть gesture) → start(). Детали в docs/ARCHITECTURE.md.
 *
 * Если /sax-loop.mp3 не выложен, срабатывает синтезированный fallback —
 * «латунный» голос на WebAudio (сакс-имитация: пила + формантные фильтры + вибрато).
 */

export class SaxAlarmPlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private stopFns: (() => void)[] = [];
  private rampSec: number;

  constructor(rampSec = 90) {
    this.rampSec = rampSec; // за сколько секунд дойти до максимума
  }

  /** Вызывать строго из обработчика клика. */
  async start(src = '/sax-loop.mp3') {
    this.stop();
    this.ctx = new AudioContext();
    await this.ctx.resume();

    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
    // крещендо: 0.05 → 1.0
    this.gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    this.gain.gain.exponentialRampToValueAtTime(1.0, this.ctx.currentTime + this.rampSec);

    try {
      const buf = await fetch(src).then(r => {
        if (!r.ok) throw new Error('no track');
        return r.arrayBuffer();
      });
      const audio = await this.ctx.decodeAudioData(buf);
      const node = this.ctx.createBufferSource();
      node.buffer = audio;
      node.loop = true;
      node.connect(this.gain);
      node.start();
      this.stopFns.push(() => node.stop());
    } catch {
      this.startSynthFallback();
    }
  }

  /** Синтезированный «саксофон»: риф из 4 нот, поднимается на октаву по мере крещендо. */
  private startSynthFallback() {
    if (!this.ctx || !this.gain) return;
    const ctx = this.ctx;

    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 900;
    formant.Q.value = 1.2;
    formant.connect(this.gain);

    const riff = [196, 233.08, 261.63, 311.13]; // G3 Bb3 C4 Eb4 — блюзовый минор
    let step = 0;
    let running = true;

    const playNote = () => {
      if (!running) return;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const vibrato = ctx.createOscillator();
      const vibGain = ctx.createGain();

      const octave = Math.min(2, 1 + (ctx.currentTime / this.rampSec)); // выше к концу
      osc.type = 'sawtooth';
      osc.frequency.value = riff[step % riff.length] * octave;
      step++;

      vibrato.frequency.value = 5.5;
      vibGain.gain.value = 6;
      vibrato.connect(vibGain).connect(osc.frequency);

      env.gain.setValueAtTime(0.0001, ctx.currentTime);
      env.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.06); // атака-«язычок»
      env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);

      osc.connect(env).connect(formant);
      osc.start(); vibrato.start();
      osc.stop(ctx.currentTime + 0.6); vibrato.stop(ctx.currentTime + 0.6);

      setTimeout(playNote, 620);
    };
    playNote();
    this.stopFns.push(() => { running = false; });
  }

  /** Быстрый fade-out (exit быстрее entrance) и полная остановка. */
  stop() {
    if (this.gain && this.ctx) {
      this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
    }
    const fns = this.stopFns; this.stopFns = [];
    setTimeout(() => {
      fns.forEach(f => { try { f(); } catch {} });
      this.ctx?.close().catch(() => {});
      this.ctx = null; this.gain = null;
    }, 350);
  }

  get volume(): number {
    return this.gain?.gain.value ?? 0;
  }
}
