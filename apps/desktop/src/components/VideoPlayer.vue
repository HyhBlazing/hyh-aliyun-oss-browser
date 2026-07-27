<template>
  <div ref="root" class="xg-preview" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import Player from "xgplayer";
import "xgplayer/dist/index.min.css";

const props = defineProps<{
  url: string;
}>();

const root = ref<HTMLElement | null>(null);
let player: Player | null = null;

function destroyPlayer() {
  if (!player) return;
  try {
    player.destroy();
  } catch {
    /* ignore */
  }
  player = null;
}

function createPlayer() {
  destroyPlayer();
  if (!root.value || !props.url) return;
  root.value.innerHTML = "";
  player = new Player({
    el: root.value,
    url: props.url,
    fluid: true,
    autoplay: true,
    lang: "zh-cn",
    volume: 0.6,
    playbackRate: [0.5, 0.75, 1, 1.5, 2],
    closeVideoClick: false,
    closeVideoDblclick: false,
  });
}

onMounted(createPlayer);
watch(() => props.url, createPlayer);
onBeforeUnmount(destroyPlayer);
</script>

<style scoped>
.xg-preview {
  width: 100%;
  max-height: 70vh;
  overflow: hidden;
  background: #000;
  border-radius: 8px;
}

.xg-preview :deep(.xgplayer) {
  max-height: 70vh;
}

.xg-preview :deep(.xgplayer video) {
  max-height: 70vh;
  object-fit: contain;
}
</style>
