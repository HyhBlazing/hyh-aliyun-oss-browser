<template>
  <router-view />

  <a-modal v-model:visible="closeVisible" title="关闭确认" :mask-closable="false" :esc-to-close="true" unmount-on-close width="440px" @cancel="onStay">
    <p class="close-msg">{{ closeMessage }}</p>
    <template #footer>
      <a-space>
        <a-button @click="onStay">取消</a-button>
        <a-button type="secondary" @click="onMinimizeToTray">最小化到托盘</a-button>
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
import { getCloseStrategy } from "./lib/close-strategy";

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
    return `当前有 ${activeCount.value} 个传输任务进行中。选择「最小化到托盘」可隐藏窗口并继续传输；选择「退出应用」将中断全部任务。`;
  }
  return "确定要关闭吗？选择「最小化到托盘」将隐藏到系统托盘；选择「退出应用」将结束程序。";
});

onMounted(async () => {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    unlistenClose = await win.onCloseRequested(async (event) => {
      event.preventDefault();
      if (closeVisible.value || exiting.value) return;

      const strategy = getCloseStrategy();
      if (strategy === "tray") {
        await hideToTray();
        return;
      }
      if (strategy === "exit") {
        await onExit();
        return;
      }
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

async function hideToTray() {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("hide_to_tray");
  } catch (e) {
    console.warn("hide to tray failed, fallback minimize", e);
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch (err) {
      console.warn("minimize failed", err);
    }
  }
}

async function onMinimizeToTray() {
  closeVisible.value = false;
  await hideToTray();
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
