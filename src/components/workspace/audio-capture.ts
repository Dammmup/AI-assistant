"use client";

/**
 * Захват звука для записи приёма.
 *
 * Важно: эхоподавление (echoCancellation) на iPhone/Safari включает «голосовой» режим аудиосистемы —
 * как при телефонном звонке: узкая полоса частот и агрессивная обработка, звук «как со старого микрофона».
 * На приёме из динамика ничего не звучит, эхоподавление не нужно. Шумоподавление по умолчанию тоже выключено:
 * оно глушит дальний голос пациента. Его можно включить для шумного кабинета.
 */

const NS_KEY = "ms.noiseSuppression";

export function getNoiseSuppression(): boolean {
  try {
    return localStorage.getItem(NS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNoiseSuppression(on: boolean) {
  try {
    localStorage.setItem(NS_KEY, on ? "1" : "0");
  } catch {}
}

export function micConstraints(noiseSuppression = getNoiseSuppression()): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: false,
      noiseSuppression,
      autoGainControl: true,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48_000 },
    },
  };
}

/** Формат и битрейт фрагментов: Opus 64 кбит/с или AAC 128 кбит/с (Safari). */
export function recorderOptions(): { mimeType: string; audioBitsPerSecond: number } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates: [string, number][] = [
    ["audio/webm;codecs=opus", 64_000],
    ["audio/ogg;codecs=opus", 64_000],
    ["audio/mp4;codecs=mp4a.40.2", 128_000],
    ["audio/mp4", 128_000],
    ["audio/webm", 64_000],
  ];
  const found = candidates.find(([m]) => MediaRecorder.isTypeSupported(m));
  return found ? { mimeType: found[0], audioBitsPerSecond: found[1] } : { mimeType: "", audioBitsPerSecond: 128_000 };
}

/* ---------- Общий аудиоконтекст ---------- */

let sharedCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === "closed") {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new Ctx();
  }
  return sharedCtx;
}

/**
 * Вызывать синхронно в обработчике нажатия кнопки: iPhone разрешает запуск звука только по жесту пользователя.
 * Контекст, созданный позже (после await), может навсегда остаться на паузе.
 */
export function unlockAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {}
}

/* ---------- Несжатый поток PCM 16 кГц для потокового распознавания ---------- */

export const PCM_SAMPLE_RATE = 16_000;

const WORKLET = `
class Pcm16kProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${PCM_SAMPLE_RATE};
    this.pos = 0; this.acc = 0; this.cnt = 0;
    this.frame = 1600; // 100 мс
    this.buf = new Int16Array(this.frame); this.n = 0;
    this.port.onmessage = (e) => { if (e.data === "flush") this.flush(); };
  }
  flush() {
    if (this.n > 0) { this.port.postMessage(this.buf.slice(0, this.n).buffer); this.n = 0; }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      // Понижение частоты дискретизации с усреднением (простой фильтр нижних частот).
      this.acc += ch[i]; this.cnt++; this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        let v = this.acc / this.cnt; this.acc = 0; this.cnt = 0;
        v = v < -1 ? -1 : v > 1 ? 1 : v;
        this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.n === this.frame) {
          this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
          this.buf = new Int16Array(this.frame); this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm16k", Pcm16kProcessor);
`;

const loadedContexts = new WeakSet<AudioContext>();

/**
 * Передаёт звук потока кусками по 100 мс в формате PCM 16 бит, 16 кГц, моно.
 * Возвращает null, если браузер не поддерживает AudioWorklet (тогда используется MediaRecorder).
 */
export async function startPcm16k(stream: MediaStream, onChunk: (pcm: ArrayBuffer) => void): Promise<{ stop: () => Promise<void> } | null> {
  const ctx = getAudioContext();
  if (!ctx.audioWorklet) return null;
  try {
    if (!loadedContexts.has(ctx)) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      loadedContexts.add(ctx);
    }
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm16k", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    node.port.onmessage = (e) => onChunk(e.data as ArrayBuffer);
    // Узел должен быть подключён к выходу, иначе часть браузеров его не обрабатывает; громкость — ноль.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(node).connect(mute).connect(ctx.destination);
    return {
      stop: async () => {
        node.port.postMessage("flush");
        await new Promise((r) => setTimeout(r, 60));
        source.disconnect();
        node.disconnect();
        mute.disconnect();
        node.port.onmessage = null;
      },
    };
  } catch {
    return null;
  }
}

/* ---------- Экран не гаснет во время записи ---------- */

type WakeLock = { release: () => Promise<void> };

export async function keepScreenOn(): Promise<WakeLock | null> {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } }).wakeLock;
    return wl ? await wl.request("screen") : null;
  } catch {
    return null;
  }
}
