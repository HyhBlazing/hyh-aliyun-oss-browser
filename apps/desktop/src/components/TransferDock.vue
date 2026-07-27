<template>
  <div ref="dockRef" class="dock" :class="{ open: transfer.visible }" @click.stop>
    <div
      v-if="transfer.visible"
      class="panel"
      :style="{ height: panelHeight + 'px' }"
    >
      <div
        class="resize-handle"
        title="拖拽调整高度"
        @mousedown.prevent="onResizeStart"
      >
        <span class="resize-grip" />
      </div>

      <div class="panel-head">
        <div class="type-tabs">
          <a-tooltip content="上传">
            <button class="type-tab" type="button" :class="{ active: transfer.panelType === 'upload' }" @click.stop="transfer.openPanel('upload')">
              <icon-upload />
              <span>{{ transfer.totals.upDone }}/{{ transfer.totals.upTotal }}</span>
            </button>
          </a-tooltip>
          <a-tooltip content="下载">
            <button class="type-tab" type="button" :class="{ active: transfer.panelType === 'download' }" @click.stop="transfer.openPanel('download')">
              <icon-download />
              <span>{{ transfer.totals.downDone }}/{{ transfer.totals.downTotal }}</span>
            </button>
          </a-tooltip>
          <a-tooltip content="移动 / 复制">
            <button class="type-tab" type="button" :class="{ active: transfer.panelType === 'move' }" @click.stop="transfer.openPanel('move')">
              <icon-swap />
              <span>{{ transfer.totals.moveDone }}/{{ transfer.totals.moveTotal }}</span>
            </button>
          </a-tooltip>
        </div>
        <a-tooltip content="关闭">
          <button class="icon-btn" type="button" @click.stop="transfer.closePanel()">
            <icon-close />
          </button>
        </a-tooltip>
      </div>

      <div class="toolbar">
        <div class="search-wrap">
          <a-input v-model="keyword" class="search" size="small" allow-clear :placeholder="searchPlaceholder" />
        </div>
        <a-select v-model="statusFilter" class="status-filter" size="small" :options="statusOptions" />
        <div class="toolbar-actions">
          <a-tooltip content="启动全部">
            <button class="icon-btn" type="button" @click.stop="resumeAll">
              <icon-play-arrow />
            </button>
          </a-tooltip>
          <a-tooltip content="暂停全部">
            <button class="icon-btn" type="button" @click.stop="pauseAll">
              <icon-pause />
            </button>
          </a-tooltip>
          <a-tooltip content="清空已完成">
            <button class="icon-btn" type="button" @click.stop="clearFinished">
              <icon-check-circle />
            </button>
          </a-tooltip>
          <a-tooltip content="清空全部">
            <button class="icon-btn danger" type="button" @click.stop="clearAll">
              <icon-delete />
            </button>
          </a-tooltip>
        </div>
      </div>

      <div class="panel-body">
        <a-empty v-if="!filteredJobs.length" :description="emptyText" />
        <a-table
          v-else
          :columns="columns"
          :data="filteredJobs"
          row-key="id"
          :pagination="false"
          :bordered="false"
          size="small"
        >
          <template #status="{ record }">
            <span class="status-text">{{ formatStatus(record.status) }}</span>
          </template>
          <template #progress="{ record }">
            <div class="progress-cell">
              <a-progress :percent="toArcoPercent(record.progress)" size="small" />
              <span v-if="record.speed > 0 && record.status === 'running'" class="speed">{{ formatSpeed(record.speed) }}</span>
            </div>
          </template>
          <template #error="{ record }">
            <a-tooltip v-if="record.error" :content="record.error">
              <span class="err-text">{{ record.error }}</span>
            </a-tooltip>
            <span v-else class="muted">-</span>
          </template>
          <template #actions="{ record }">
            <a-tooltip v-if="record.status === 'running'" content="暂停">
              <button class="icon-btn" type="button" @click.stop="onPause(record.id)">
                <icon-pause />
              </button>
            </a-tooltip>
            <a-tooltip v-if="record.status === 'stopped' || record.status === 'failed'" content="继续">
              <button class="icon-btn" type="button" @click.stop="onResume(record.id)">
                <icon-play-arrow />
              </button>
            </a-tooltip>
            <a-tooltip content="移除">
              <button class="icon-btn danger" type="button" @click.stop="onRemove(record.id)">
                <icon-delete />
              </button>
            </a-tooltip>
          </template>
        </a-table>
      </div>
    </div>

    <div v-show="!transfer.visible" class="toggle-bar" @click.stop>
      <a-tooltip content="上传">
        <button class="toggle" type="button" @click.stop="transfer.openPanel('upload')">
          <icon-upload />
          <span>{{ transfer.totals.upDone }}/{{ transfer.totals.upTotal }}</span>
        </button>
      </a-tooltip>
      <a-tooltip content="下载">
        <button class="toggle" type="button" @click.stop="transfer.openPanel('download')">
          <icon-download />
          <span>{{ transfer.totals.downDone }}/{{ transfer.totals.downTotal }}</span>
        </button>
      </a-tooltip>
      <a-tooltip content="移动 / 复制">
        <button class="toggle" type="button" @click.stop="transfer.openPanel('move')">
          <icon-swap />
          <span>{{ transfer.totals.moveDone }}/{{ transfer.totals.moveTotal }}</span>
        </button>
      </a-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Message } from "@arco-design/web-vue";
import { useTransferStore } from "../stores/transfer";
import { api } from "../api/client";

const LS_PANEL_HEIGHT = "hyh-oss-transfer-panel-height";
const MIN_PANEL_HEIGHT = 220;

const transfer = useTransferStore();
const keyword = ref("");
const statusFilter = ref("all");
const dockRef = ref<HTMLElement | null>(null);
const panelHeight = ref(defaultPanelHeight());
let resizing = false;
let resizeStartY = 0;
let resizeStartH = 0;

function defaultPanelHeight() {
  if (typeof window === "undefined") return 420;
  return Math.round(window.innerHeight * 0.5);
}

function clampPanelHeight(h: number) {
  const max = Math.max(MIN_PANEL_HEIGHT, Math.round(window.innerHeight * 0.9));
  return Math.min(max, Math.max(MIN_PANEL_HEIGHT, Math.round(h)));
}

function loadPanelHeight() {
  try {
    const raw = localStorage.getItem(LS_PANEL_HEIGHT);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) {
      panelHeight.value = clampPanelHeight(n);
      return;
    }
  } catch {
    /* ignore */
  }
  panelHeight.value = clampPanelHeight(defaultPanelHeight());
}

function savePanelHeight() {
  try {
    localStorage.setItem(LS_PANEL_HEIGHT, String(panelHeight.value));
  } catch {
    /* ignore */
  }
}

function onResizeStart(e: MouseEvent) {
  resizing = true;
  resizeStartY = e.clientY;
  resizeStartH = panelHeight.value;
  document.body.classList.add("transfer-dock-resizing");
  window.addEventListener("mousemove", onResizeMove);
  window.addEventListener("mouseup", onResizeEnd);
}

function onResizeMove(e: MouseEvent) {
  if (!resizing) return;
  // 面板贴底：向上拖增高，向下拖降低
  const next = resizeStartH + (resizeStartY - e.clientY);
  panelHeight.value = clampPanelHeight(next);
}

function onResizeEnd() {
  if (!resizing) return;
  resizing = false;
  document.body.classList.remove("transfer-dock-resizing");
  window.removeEventListener("mousemove", onResizeMove);
  window.removeEventListener("mouseup", onResizeEnd);
  savePanelHeight();
}

function onWindowResize() {
  panelHeight.value = clampPanelHeight(panelHeight.value);
}

const statusLabel: Record<string, string> = {
  waiting: "等待中",
  running: "进行中",
  stopped: "已暂停",
  failed: "失败",
  finished: "已完成",
};

const statusOptions = [
  { label: "全部", value: "all" },
  { label: "等待中", value: "waiting" },
  { label: "进行中", value: "running" },
  { label: "已暂停", value: "stopped" },
  { label: "失败", value: "failed" },
  { label: "已完成", value: "finished" },
];

function onDocClick(e: MouseEvent) {
  if (!transfer.visible) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest?.("[data-transfer-toggle]")) return;
  const dock = dockRef.value;
  if (!dock) return;
  const path = e.composedPath() as EventTarget[];
  if (path.includes(dock)) return;
  transfer.closePanel();
}

onMounted(() => {
  loadPanelHeight();
  document.addEventListener("click", onDocClick);
  window.addEventListener("resize", onWindowResize);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocClick);
  window.removeEventListener("resize", onWindowResize);
  onResizeEnd();
});

watch(
  () => transfer.panelType,
  () => {
    keyword.value = "";
    statusFilter.value = "all";
  }
);

const columns = [
  { title: "对象", dataIndex: "key", ellipsis: true, width: 180 },
  { title: "状态", dataIndex: "status", width: 88, slotName: "status" },
  { title: "进度", width: 140, slotName: "progress" },
  { title: "错误", slotName: "error", ellipsis: true },
  { title: "", width: 100, slotName: "actions" },
];

const filteredJobs = computed(() => {
  let list = transfer.panelJobs;
  if (statusFilter.value !== "all") {
    list = list.filter((job) => String(job.status || "") === statusFilter.value);
  }
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return list;
  return list.filter((job) => String(job.key || "").toLowerCase().includes(kw));
});

const emptyText = computed(() => {
  if (keyword.value.trim() || statusFilter.value !== "all") return "无匹配任务";
  if (transfer.panelType === "upload") return "暂无上传任务";
  if (transfer.panelType === "download") return "暂无下载任务";
  return "暂无移动/复制任务";
});

const searchPlaceholder = computed(() => {
  if (transfer.panelType === "upload") return "搜索上传名称";
  if (transfer.panelType === "download") return "搜索下载名称";
  return "搜索移动/复制任务";
});

function formatStatus(status?: string) {
  return statusLabel[String(status || "")] || status || "-";
}

/** Arco Progress 的 percent 为 0–1；sidecar 存的是 0–100 */
function toArcoPercent(progress?: number) {
  const n = Number(progress) || 0;
  if (n > 1) return Math.min(1, Math.max(0, n / 100));
  return Math.min(1, Math.max(0, n));
}

function formatSpeed(bytesPerSec: number) {
  if (!bytesPerSec || bytesPerSec <= 0) return "";
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
}

async function onPause(id: string) {
  try {
    await api.pauseJob(id);
    await transfer.refresh();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "暂停失败");
  }
}

async function onResume(id: string) {
  try {
    await api.resumeJob(id);
    await transfer.refresh();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "启动失败");
  }
}

async function onRemove(id: string) {
  try {
    await transfer.removeJob(id);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "移除失败");
  }
}

async function resumeAll() {
  const targets = transfer.panelJobs.filter(
    (j) => j.status === "stopped" || j.status === "failed" || j.status === "waiting"
  );
  if (!targets.length) {
    Message.info("没有可启动的任务");
    return;
  }
  try {
    await Promise.all(targets.map((j) => api.resumeJob(j.id)));
    await transfer.refresh();
    Message.success(`已启动 ${targets.length} 个任务`);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "启动失败");
  }
}

async function pauseAll() {
  const targets = transfer.panelJobs.filter((j) => j.status === "running" || j.status === "waiting");
  if (!targets.length) {
    Message.info("没有可暂停的任务");
    return;
  }
  try {
    await Promise.all(targets.map((j) => api.pauseJob(j.id)));
    await transfer.refresh();
    Message.success(`已暂停 ${targets.length} 个任务`);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "暂停失败");
  }
}

async function clearFinished() {
  try {
    const n = await transfer.clearPanelJobs(true);
    if (!n) {
      Message.info("没有已完成的任务");
      return;
    }
    Message.success(`已清空 ${n} 个已完成任务`);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "清空失败");
  }
}

async function clearAll() {
  try {
    const n = await transfer.clearPanelJobs(false);
    if (!n) {
      Message.info("当前没有任务");
      return;
    }
    Message.success(`已清空 ${n} 个任务`);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "清空失败");
  }
}
</script>

<style scoped>
.dock {
  position: fixed;
  right: 16px;
  bottom: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.toggle-bar {
  display: flex;
  align-items: center;
  height: 36px;
  background: #fff;
  border: 1px solid var(--color-border);
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  overflow: hidden;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
}

.toggle-bar > :deep(*) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.toggle-bar > :deep(* + *) {
  border-left: 1px solid var(--color-border);
}

.toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  border: 0;
  background: #fff;
  padding: 0 14px;
  cursor: pointer;
  color: #667085;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  box-sizing: border-box;
}

.toggle :deep(.arco-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
}

.toggle:hover {
  color: #1d1d1f;
  background: #f5f5f7;
}

.panel {
  display: flex;
  flex-direction: column;
  width: 640px;
  max-width: calc(100vw - 32px);
  height: 50vh;
  margin: 0;
  background: #fff;
  border: 1px solid var(--color-border);
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
  padding: 0 10px 10px;
  line-height: 1.4;
  overflow: hidden;
}

.resize-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 14px;
  margin: 0 -10px 4px;
  cursor: ns-resize;
  user-select: none;
  touch-action: none;
}

.resize-handle:hover .resize-grip,
.resize-handle:active .resize-grip {
  background: #c7c7cc;
}

.resize-grip {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: #d1d1d6;
}

.panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  line-height: 1;
  flex-shrink: 0;
}

.type-tabs {
  display: inline-flex;
  align-items: center;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
  background: #f5f5f7;
}

.type-tabs > :deep(*) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.type-tabs > :deep(* + *) {
  border-left: 1px solid var(--color-border);
}

.type-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  border: 0;
  background: transparent;
  padding: 0 12px;
  cursor: pointer;
  color: #8e8e93;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  box-sizing: border-box;
}

.type-tab :deep(.arco-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
}

.type-tab:hover {
  color: #1d1d1f;
}

.type-tab.active {
  color: #1d1d1f;
  background: #fff;
}

.panel :deep(.arco-empty) {
  padding: 28px 0 20px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  line-height: 1;
  flex-shrink: 0;
}

.search-wrap {
  flex: 1 1 auto;
  min-width: 160px;
}

.search {
  width: 100%;
}

.search :deep(.arco-input-wrapper) {
  width: 100%;
}

.status-filter {
  flex: 0 0 76px;
  width: 76px;
}

.status-filter :deep(.arco-select-view) {
  width: 76px;
  padding-left: 8px;
  padding-right: 4px;
}

.toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.status-text {
  display: inline-block;
  white-space: nowrap;
  font-size: 12px;
}

.progress-cell {
  display: flex;
  flex-direction: column;
}

.speed {
  margin-top: 2px;
  font-size: 11px;
  color: #8e8e93;
}

.err-text {
  display: inline-block;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #ff3b30;
  font-size: 12px;
}

.muted {
  color: #8e8e93;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 26px;
  height: 26px;
  min-width: 26px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: #3a3a3c;
  flex-shrink: 0;
  font-size: 14px;
}

.icon-btn:hover {
  background: #ececef;
}

.icon-btn.danger {
  color: #ff3b30;
}
</style>

<style>
body.transfer-dock-resizing {
  cursor: ns-resize !important;
  user-select: none !important;
}

body.transfer-dock-resizing * {
  cursor: ns-resize !important;
  user-select: none !important;
}
</style>
