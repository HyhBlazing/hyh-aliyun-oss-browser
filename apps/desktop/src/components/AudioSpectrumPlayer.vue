<template>
  <div class="audio-player">
    <div class="spectrum-wrap">
      <canvas ref="canvasRef" class="spectrum" />
      <div v-if="hint" class="hint muted">{{ hint }}</div>
    </div>

    <div class="controls">
      <button class="play-btn" type="button" :disabled="!ready" @click="togglePlay">
        <icon-pause v-if="playing" />
        <icon-play-arrow v-else />
      </button>
      <span class="time">{{ formatTime(current) }} / {{ formatTime(duration) }}</span>
      <input
        class="seek"
        type="range"
        min="0"
        max="1000"
        step="1"
        :value="seekValue"
        :disabled="!ready"
        @input="onSeekInput"
        @change="onSeekChange"
      />
    </div>

    <audio
      ref="audioRef"
      preload="auto"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onMeta"
      @play="onPlay"
      @pause="onPause"
      @ended="onEnded"
      @error="onError"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getApiBase, getApiToken } from "../api/client";

const props = defineProps<{
  url?: string;
  title?: string;
  bucket?: string;
  objectKey?: string;
  region?: string;
}>();

const audioRef = ref<HTMLAudioElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const hint = ref("加载中…");
const ready = ref(false);
const playing = ref(false);
const current = ref(0);
const duration = ref(0);
const seeking = ref(false);

let objectUrl = "";
let loadSeq = 0;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;
let freqData: Uint8Array | null = null;
let raf = 0;
let graphReady = false;

const seekValue = computed(() => {
  if (!duration.value) return 0;
  return Math.round((current.value / duration.value) * 1000);
});

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function revokeObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = "";
  }
}

function stopDraw() {
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

function destroyGraph() {
  stopDraw();
  try {
    source?.disconnect();
  } catch {
    /* ignore */
  }
  try {
    analyser?.disconnect();
  } catch {
    /* ignore */
  }
  try {
    void audioCtx?.close();
  } catch {
    /* ignore */
  }
  source = null;
  analyser = null;
  audioCtx = null;
  freqData = null;
  graphReady = false;
}

function ensureGraph() {
  const audio = audioRef.value;
  if (!audio || graphReady) return graphReady;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return false;
    audioCtx = new Ctx();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    source = audioCtx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    freqData = new Uint8Array(analyser.frequencyBinCount);
    graphReady = true;
    return true;
  } catch {
    destroyGraph();
    return false;
  }
}

async function resumeCtx() {
  if (!ensureGraph()) return;
  try {
    if (audioCtx?.state === "suspended") await audioCtx.resume();
  } catch {
    /* ignore */
  }
}

function drawIdle() {
  const canvas = canvasRef.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 640;
  const cssH = canvas.clientHeight || 160;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const bars = 56;
  const gap = 3;
  const barW = Math.max(2, (cssW - gap * (bars - 1)) / bars);
  const midY = cssH / 2;
  for (let i = 0; i < bars; i++) {
    const h = 6;
    const x = i * (barW + gap);
    ctx.fillStyle = "rgba(90, 140, 200, 0.25)";
    ctx.fillRect(x, midY - h / 2, barW, h);
  }
}

function draw() {
  const canvas = canvasRef.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx || !analyser || !freqData) return;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 640;
  const cssH = canvas.clientHeight || 160;
  if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  analyser.getByteFrequencyData(freqData as any);

  const bars = 56;
  const step = Math.max(1, Math.floor(freqData.length / bars));
  const gap = 3;
  const barW = Math.max(2, (cssW - gap * (bars - 1)) / bars);
  const midY = cssH / 2;

  for (let i = 0; i < bars; i++) {
    let sum = 0;
    const start = i * step;
    for (let j = 0; j < step && start + j < freqData.length; j++) {
      sum += freqData[start + j];
    }
    const avg = sum / step / 255;
    const h = Math.max(4, avg * (cssH * 0.72));
    const x = i * (barW + gap);
    const y = midY - h / 2;
    ctx.fillStyle = `rgba(90, 140, 200, ${0.35 + avg * 0.55})`;
    const r = Math.min(3, barW / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + barW, y, x + barW, y + h, r);
    ctx.arcTo(x + barW, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + barW, y, r);
    ctx.closePath();
    ctx.fill();
  }
  raf = requestAnimationFrame(draw);
}

function startDraw() {
  stopDraw();
  raf = requestAnimationFrame(draw);
}

async function fetchAudioBlob(): Promise<Blob> {
  if (props.bucket && props.objectKey) {
    const qs = new URLSearchParams({
      bucket: props.bucket,
      key: props.objectKey,
    });
    if (props.region) qs.set("region", props.region);
    const res = await fetch(`${getApiBase()}/objects/media?${qs.toString()}`, {
      headers: { "x-sidecar-token": getApiToken() },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `HTTP ${res.status}`);
    }
    const type = res.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      const json = await res.json();
      throw new Error(json?.message || "加载音频失败");
    }
    return await res.blob();
  }
  if (!props.url) throw new Error("缺少音频地址");
  const res = await fetch(props.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.blob();
}

async function loadAudio() {
  const seq = ++loadSeq;
  const audio = audioRef.value;
  if (!audio) return;

  destroyGraph();
  revokeObjectUrl();
  ready.value = false;
  playing.value = false;
  current.value = 0;
  duration.value = 0;
  hint.value = "加载中…";
  audio.removeAttribute("src");
  audio.load();
  drawIdle();

  try {
    const blob = await fetchAudioBlob();
    if (seq !== loadSeq) return;
    objectUrl = URL.createObjectURL(blob);
    audio.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onFail = () => {
        cleanup();
        reject(new Error("音频无法解码"));
      };
      const cleanup = () => {
        audio.removeEventListener("canplay", onReady);
        audio.removeEventListener("error", onFail);
      };
      if (audio.readyState >= 2) {
        resolve();
        return;
      }
      audio.addEventListener("canplay", onReady);
      audio.addEventListener("error", onFail);
    });
    if (seq !== loadSeq) return;

    await resumeCtx();
    try {
      await audio.play();
      hint.value = "";
    } catch {
      hint.value = "点击播放";
    }
  } catch (e) {
    if (seq !== loadSeq) return;
    hint.value = e instanceof Error ? e.message : "音频加载失败";
    ready.value = false;
  }
}

async function togglePlay() {
  const audio = audioRef.value;
  if (!audio || !ready.value) return;
  if (audio.paused) {
    await resumeCtx();
    try {
      await audio.play();
    } catch {
      hint.value = "播放失败";
    }
  } else {
    audio.pause();
  }
}

async function onPlay() {
  playing.value = true;
  hint.value = "";
  await resumeCtx();
  startDraw();
}

function onPause() {
  playing.value = false;
  stopDraw();
  drawIdle();
}

function onEnded() {
  playing.value = false;
  stopDraw();
  drawIdle();
}

function onMeta() {
  const audio = audioRef.value;
  if (!audio) return;
  duration.value = Number.isFinite(audio.duration) ? audio.duration : 0;
  ready.value = true;
  if (hint.value === "加载中…") hint.value = "";
}

function onTimeUpdate() {
  if (seeking.value) return;
  const audio = audioRef.value;
  if (!audio) return;
  current.value = audio.currentTime || 0;
}

function onSeekInput(e: Event) {
  seeking.value = true;
  const v = Number((e.target as HTMLInputElement).value) || 0;
  if (!duration.value) return;
  current.value = (v / 1000) * duration.value;
}

function onSeekChange(e: Event) {
  const audio = audioRef.value;
  const v = Number((e.target as HTMLInputElement).value) || 0;
  if (audio && duration.value) {
    audio.currentTime = (v / 1000) * duration.value;
  }
  seeking.value = false;
}

function onError() {
  if (!objectUrl) return;
  hint.value = "音频加载失败";
  ready.value = false;
  stopDraw();
}

onMounted(() => {
  drawIdle();
  void loadAudio();
});

watch(
  () => [props.bucket, props.objectKey, props.region, props.url],
  () => {
    void loadAudio();
  }
);

onBeforeUnmount(() => {
  loadSeq += 1;
  destroyGraph();
  revokeObjectUrl();
});
</script>

<style scoped>
.audio-player {
  width: 100%;
  padding: 4px 0;
}

.spectrum-wrap {
  position: relative;
  width: 100%;
  height: 160px;
  margin-bottom: 14px;
  border-radius: 12px;
  background: #f5f5f7;
  overflow: hidden;
}

.spectrum {
  display: block;
  width: 100%;
  height: 100%;
}

.hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  pointer-events: none;
}

.controls {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.play-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: #e8e8ed;
  color: #1d1d1f;
  font-size: 20px;
  cursor: pointer;
  flex-shrink: 0;
}

.play-btn:hover:not(:disabled) {
  background: #dcdce0;
}

.play-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.time {
  flex-shrink: 0;
  min-width: 96px;
  font-size: 12px;
  color: #636366;
  font-variant-numeric: tabular-nums;
}

.seek {
  flex: 1;
  min-width: 0;
  height: 4px;
  accent-color: #5a8cc8;
  cursor: pointer;
}

.muted {
  color: #8e8e93;
}

audio {
  display: none;
}
</style>
