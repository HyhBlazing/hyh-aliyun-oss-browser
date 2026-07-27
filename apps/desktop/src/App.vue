<template>
  <router-view />

  <a-modal
    v-model:visible="closeVisible"
    title="退出确认"
    :mask-closable="false"
    :esc-to-close="true"
    unmount-on-close
    width="440px"
    @cancel="onStay"
  >
    <p class="close-msg">{{ closeMessage }}</p>
    <template #footer>
      <a-space>
        <a-button @click="onStay">取消</a-button>
        <a-button type="secondary" @click="onBackground">后台运行</a-button>
        <a-button type="primary" status="danger" :loading="exiting" @click="onExit">
          退出应用
        </a-button>
      </a-space>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useTransferStore } from "./stores/transfer";
import { isTauri } from "./lib/local-fs";

const transfer = useTransferStore();
const closeVisible = ref(false);
const exiting = ref(false);
let unlistenClose: null | (() => void) = null;

const activeCount = computed(
  () =>
    transfer.jobs.filter((j) => j.status === "running" || j.status === "waiting").length
);

const closeMessage = computed(() => {
  if (activeCount.value > 0) {
    return `当前有 ${activeCount.value} 个传输任务进行中。选择「后台运行」可最小化窗口并继续传输；选择「退出应用」将中断全部任务。`;
  }
  return "确定要退出吗？选择「后台运行」将最小化到任务栏，传输服务会继续保持。";
});

onMounted(async () => {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    unlistenClose = await win.onCloseRequested(async (event) => {
      // 始终拦截，改为弹窗选择
      event.preventDefault();
      if (closeVisible.value || exiting.value) return;
      closeVisible.value = true;
    });
  } catch (e) {
    console.warn("close guard unavailable", e);
  }
});

onUnmounted(() => {
  unlistenClose?.();
  unlistenClose = null;
});

function onStay() {
  closeVisible.value = false;
}

async function onBackground() {
  closeVisible.value = false;
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  } catch (e) {
    console.warn("minimize failed", e);
  }
}

async function onExit() {
  if (exiting.value) return;
  exiting.value = true;
  closeVisible.value = false;
  if (!isTauri()) {
    window.close();
    return;
  }
  try {
    // 先结束 sidecar，再强制销毁窗口（不会再次触发 closeRequested）
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("quit_app");
    } catch {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().destroy();
    }
  } catch (e) {
    console.warn("exit failed", e);
    exiting.value = false;
  }
}
</script>

<style scoped>
.close-msg {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #1d1d1f;
}
</style>
