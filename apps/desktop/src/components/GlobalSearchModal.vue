<template>
  <a-modal :visible="visible" :footer="false" width="920px" unmount-on-close modal-class="global-search-modal" @cancel="emit('update:visible', false)" @update:visible="emit('update:visible', $event)">
    <template #title>
      <div class="gs-title">
        <span class="gs-title-main">
          全局搜索
          <span class="gs-beta">Beta</span>
          <a-tooltip content="试验功能，结果与索引可能不完整，请以对象列表为准">
            <icon-exclamation-circle class="gs-beta-tip-icon" />
          </a-tooltip>
        </span>
      </div>
    </template>
    <div class="gs">
      <div class="mode-row">
        <a-radio-group v-model="form.mode" type="button" size="small">
          <a-radio value="index">索引搜索</a-radio>
          <a-radio value="live">即时搜索</a-radio>
        </a-radio-group>
        <p class="hint muted">
          {{
            form.mode === "index"
              ? "查询本地元数据索引，适合百万级对象；不含对象内容。"
              : "调用 OSS 列举，适合小 Bucket；结果达到上限后截断。"
          }}
        </p>
      </div>

      <div v-if="form.mode === 'index'" class="index-panel">
        <div class="index-meta">
          <span>索引对象 {{ formatCount(indexStatus.total_objects) }}</span>
          <span>索引占用 {{ formatSize(indexStatus.index_bytes) }}</span>
          <span>对象合计 {{ formatSize(indexStatus.objects_bytes) }}</span>
          <span>上次索引 {{ formatTime(indexStatus.last_indexed_at) }}</span>
        </div>
        <div class="index-actions">
          <a-button size="small" type="primary" :loading="indexBusy" @click="onBuildIndex">
            建立/更新索引
          </a-button>
          <a-button size="small" :loading="indexBusy" @click="onRefreshIndex">增量更新</a-button>
          <a-button size="small" status="danger" :disabled="indexBusy" @click="onClearIndex">
            清除本地索引
          </a-button>
        </div>
        <div v-if="indexJob" class="index-progress">
          <a-progress :percent="indexPercent" :status="indexJob.status === 'failed' ? 'danger' : indexJob.status === 'done' ? 'success' : 'normal'" size="small" />
          <p class="muted progress-text">
            {{ indexJobText }}
            <button v-if="indexJob.status === 'running'" class="link-btn" type="button" @click="onCancelIndex">
              取消
            </button>
          </p>
        </div>
      </div>

      <a-form :model="form" layout="vertical" class="filters">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="Bucket">
              <a-select v-model="form.buckets" multiple allow-clear allow-search placeholder="空=全部 Bucket" :options="bucketOptions" :max-tag-count="2" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="前缀（跨目录可留空）">
              <a-input v-model="form.prefix" allow-clear placeholder="例如 photos/2024/" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="文件名">
              <a-input v-model="form.name" allow-clear placeholder="子串匹配" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="扩展名">
              <a-input v-model="form.ext" allow-clear placeholder="如 jpg" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="存储类型">
              <a-select v-model="form.storageClass" allow-clear placeholder="全部" :options="storageOptions" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="最小大小（字节）">
              <a-input-number v-model="form.sizeMin" :min="0" hide-button style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="最大大小（字节）">
              <a-input-number v-model="form.sizeMax" :min="0" hide-button style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="修改时间起">
              <a-date-picker
                v-model="form.mtimeFrom"
                show-time
                style="width: 100%"
                :disabled-date="disabledFutureDate"
                :disabled-time="disabledFutureTime"
                @change="onMtimeFromChange"
              />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="修改时间止">
              <a-date-picker
                v-model="form.mtimeTo"
                show-time
                style="width: 100%"
                :disabled-date="disabledFutureDate"
                :disabled-time="disabledFutureTime"
                @change="onMtimeToChange"
              />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>

      <div class="search-actions">
        <a-button type="primary" :loading="searching" :disabled="searching" @click="onSearch">
          搜索
        </a-button>
        <a-button v-if="searching" @click="() => onCancelSearch()">取消搜索</a-button>
        <span v-if="truncated" class="warn muted">结果已截断，请收紧条件或改用索引搜索</span>
      </div>

      <div class="batch-bar">
        <a-button size="small" :disabled="!selectedKeys.length" @click="emitBatch('download')">
          下载
        </a-button>
        <a-button size="small" status="danger" :disabled="!selectedKeys.length" @click="emitBatch('delete')">
          删除
        </a-button>
        <a-button size="small" :disabled="!selectedKeys.length" @click="emitBatch('address')">
          获取地址
        </a-button>
        <a-button size="small" :disabled="!selectedKeys.length" @click="emitBatch('verify')">
          完整性校验
        </a-button>
        <a-button size="small" :disabled="!selectedKeys.length" @click="emitBatch('open')">
          打开所在目录
        </a-button>
        <span v-if="selectedKeys.length" class="muted">已选 {{ selectedKeys.length }}</span>
      </div>

      <a-table row-key="rowKey" size="small" :bordered="false" :columns="columns" :data="rows" :loading="searching" :pagination="{ pageSize: 10 }" :row-selection="rowSelection" v-model:selected-keys="selectedKeys" :scroll="{ y: 320 }">
        <template #size="{ record }">
          {{ formatSize(record.size) }}
        </template>
        <template #storage="{ record }">
          {{ formatStorageClass(record.storage_class) }}
        </template>
        <template #mtime="{ record }">
          {{ formatTime(record.last_modified) }}
        </template>
      </a-table>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Message, Modal } from "@arco-design/web-vue";
import { api } from "../api/client";

export type SearchHit = {
  rowKey: string;
  bucket: string;
  key: string;
  name: string;
  size: number;
  last_modified: number;
  storage_class: string;
  region?: string;
};

const props = defineProps<{
  visible: boolean;
  /** 可选 Bucket 列表 */
  bucketNames: string[];
  /** 默认选中的 Bucket */
  defaultBucket?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
  (
    e: "batch",
    action: "download" | "delete" | "address" | "verify" | "open",
    items: SearchHit[]
  ): void;
}>();

const form = reactive({
  mode: "index" as "live" | "index",
  buckets: [] as string[],
  prefix: "",
  name: "",
  ext: "",
  storageClass: "" as string,
  sizeMin: undefined as number | undefined,
  sizeMax: undefined as number | undefined,
  mtimeFrom: undefined as Date | string | undefined,
  mtimeTo: undefined as Date | string | undefined,
});

const searching = ref(false);
const truncated = ref(false);
const rows = ref<SearchHit[]>([]);
const selectedKeys = ref<(string | number)[]>([]);
const indexBusy = ref(false);
let searchAbort: AbortController | null = null;
const indexStatus = reactive({
  total_objects: 0,
  index_bytes: 0,
  objects_bytes: 0,
  last_indexed_at: null as number | null,
});
const indexJob = ref<Record<string, any> | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const storageOptions = [
  { label: "标准存储", value: "Standard" },
  { label: "低频访问", value: "IA" },
  { label: "归档存储", value: "Archive" },
  { label: "冷归档", value: "ColdArchive" },
  { label: "深度冷归档", value: "DeepColdArchive" },
];

const bucketOptions = computed(() =>
  (props.bucketNames || []).map((n) => ({ label: n, value: n }))
);

const columns = [
  { title: "Bucket", dataIndex: "bucket", width: 120, ellipsis: true },
  { title: "对象", dataIndex: "key", ellipsis: true },
  { title: "大小", dataIndex: "size", width: 90, slotName: "size" },
  { title: "存储", dataIndex: "storage_class", width: 100, slotName: "storage" },
  { title: "修改时间", dataIndex: "last_modified", width: 160, slotName: "mtime" },
];

const rowSelection = { type: "checkbox" as const, showCheckedAll: true };

/** Arco Progress 的 percent 为 0–1 */
const indexPercent = computed(() => {
  const job = indexJob.value;
  if (!job) return 0;
  if (job.status === "done") return 1;
  let pct = 0;
  const p = Number(job.progress);
  if (Number.isFinite(p) && p >= 0) {
    pct = Math.min(job.status === "running" ? 99 : 100, Math.round(p));
  } else {
    const total = Number(job.buckets_total) || 0;
    const done = Number(job.buckets_done) || 0;
    if (!total) {
      pct = job.status === "running" ? 1 : 0;
    } else {
      const estimate = Number(job.current_bucket_estimate) || 0;
      const scannedInBucket = Number(job.current_bucket_scanned) || 0;
      let frac = 0;
      if (estimate > 0) {
        frac = Math.min(0.99, scannedInBucket / estimate);
      } else if (scannedInBucket > 0) {
        frac = Math.min(0.9, 1 - 1 / (1 + scannedInBucket / 1500));
      }
      pct = Math.min(99, Math.round(((done + frac) / total) * 100));
    }
  }
  return Math.min(1, Math.max(0, pct / 100));
});

const indexJobText = computed(() => {
  const job = indexJob.value;
  if (!job) return "";
  if (job.status === "failed") return job.error || "索引失败";
  if (job.status === "done") {
    return `完成：扫描 ${job.scanned || 0}，写入 ${job.upserted || 0}`;
  }
  if (job.status === "cancelled") return "已取消";
  const total = Number(job.buckets_total) || 0;
  const done = Number(job.buckets_done) || 0;
  const bucketPart =
    total > 0
      ? `Bucket ${Math.min(done + (job.current_bucket ? 1 : 0), total)}/${total}`
      : "";
  const name = job.current_bucket ? ` · ${job.current_bucket}` : "";
  return `进行中 ${bucketPart}${name} · 已扫描 ${job.scanned || 0}`;
});

watch(
  () => props.visible,
  async (v) => {
    if (!v) {
      stopPoll();
      onCancelSearch(false);
      return;
    }
    form.buckets = props.defaultBucket ? [props.defaultBucket] : [];
    form.prefix = "";
    form.name = "";
    form.ext = "";
    form.storageClass = "";
    form.sizeMin = undefined;
    form.sizeMax = undefined;
    form.mtimeFrom = undefined;
    form.mtimeTo = undefined;
    rows.value = [];
    selectedKeys.value = [];
    truncated.value = false;
    await refreshIndexStatus();
  }
);

function formatSize(n: number) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
  if (v < 1024 * 1024 * 1024 * 1024) {
    return `${(v / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
  return `${(v / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`;
}

function formatCount(n: number) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return v.toLocaleString("zh-CN");
}

function formatStorageClass(value?: string) {
  if (!value) return "—";
  const map: Record<string, string> = {
    standard: "标准存储",
    ia: "低频访问",
    archive: "归档存储",
    coldarchive: "冷归档",
    deepcoldarchive: "深度冷归档",
  };
  const key = String(value).toLowerCase();
  return map[key] || value;
}

function formatTime(ms: number | null | undefined) {
  if (!ms) return "—";
  try {
    return new Date(Number(ms)).toLocaleString();
  } catch {
    return "—";
  }
}

function toMs(v: Date | string | undefined) {
  if (!v) return undefined;
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(t) ? t : undefined;
}

function toDate(v: Date | string | undefined | null | { toDate?: () => Date; valueOf?: () => number }): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof (v as { toDate?: () => Date }).toDate === "function") {
    const d = (v as { toDate: () => Date }).toDate();
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const raw =
    typeof (v as { valueOf?: () => unknown }).valueOf === "function"
      ? (v as { valueOf: () => unknown }).valueOf()
      : v;
  const d = new Date(raw as string | number | Date);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function rangeNums(start: number, end: number) {
  const list: number[] = [];
  for (let i = start; i < end; i++) list.push(i);
  return list;
}

/** 禁用今天之后的日期 */
function disabledFutureDate(current?: Date) {
  const d = toDate(current ?? null);
  if (!d) return false;
  const now = new Date();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return day > today;
}

/** 选中当天时，禁用当前时刻之后的时分秒 */
function disabledFutureTime(current: Date) {
  const d = toDate(current);
  const now = new Date();
  if (!d || !isSameCalendarDay(d, now)) {
    return {};
  }
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  return {
    disabledHours: () => rangeNums(h + 1, 24),
    // Arco 类型声明与运行时签名不一致，这里兼容两种调用方式
    disabledMinutes: (...args: number[]) => {
      const hour = args.length ? Number(args[0]) : h;
      return hour === h ? rangeNums(m + 1, 60) : [];
    },
    disabledSeconds: (...args: number[]) => {
      const hour = args.length ? Number(args[0]) : h;
      const minute = args.length > 1 ? Number(args[1]) : m;
      return hour === h && minute === m ? rangeNums(s + 1, 60) : [];
    },
  };
}

function clampToNow(v: Date | string | undefined | null): Date | undefined {
  const d = toDate(v ?? null);
  if (!d) return undefined;
  const now = new Date();
  return d.getTime() > now.getTime() ? now : d;
}

function onMtimeToChange(value: Date | string | undefined) {
  form.mtimeTo = clampToNow(value);
}

function onMtimeFromChange(value: Date | string | undefined) {
  form.mtimeFrom = clampToNow(value);
}

async function refreshIndexStatus() {
  try {
    const res = await api.getSearchIndexStatus();
    const data = res.data || {
      total_objects: 0,
      last_indexed_at: null,
      index_bytes: 0,
      objects_bytes: 0,
    };
    indexStatus.total_objects = Number(data.total_objects) || 0;
    indexStatus.index_bytes = Number(data.index_bytes) || 0;
    indexStatus.objects_bytes = Number(data.objects_bytes) || 0;
    indexStatus.last_indexed_at = data.last_indexed_at ?? null;
  } catch {
    /* ignore */
  }
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollJob(jobId: string) {
  stopPoll();
  pollTimer = setInterval(async () => {
    try {
      const res = await api.getSearchIndexJob(jobId);
      indexJob.value = (res.data || null) as any;
      const st = String(indexJob.value?.status || "");
      if (st === "done" || st === "failed" || st === "cancelled") {
        stopPoll();
        indexBusy.value = false;
        await refreshIndexStatus();
        if (st === "done") Message.success("索引已更新");
        if (st === "failed") Message.error(indexJob.value?.error || "索引失败");
      }
    } catch {
      stopPoll();
      indexBusy.value = false;
    }
  }, 800);
}

async function onBuildIndex() {
  indexBusy.value = true;
  try {
    const res = await api.buildSearchIndex({
      buckets: form.buckets.length ? form.buckets : [],
    });
    const id = String(res.data?.job_id || "");
    indexJob.value = {
      id,
      status: "running",
      scanned: 0,
      upserted: 0,
      buckets_done: 0,
      buckets_total: 0,
      progress: 0,
      current_bucket_scanned: 0,
      current_bucket_estimate: 0,
    };
    await pollJob(id);
  } catch (e) {
    indexBusy.value = false;
    Message.error(e instanceof Error ? e.message : "启动索引失败");
  }
}

async function onRefreshIndex() {
  indexBusy.value = true;
  try {
    const res = await api.refreshSearchIndex({
      buckets: form.buckets.length ? form.buckets : [],
    });
    const id = String(res.data?.job_id || "");
    indexJob.value = {
      id,
      status: "running",
      scanned: 0,
      upserted: 0,
      buckets_done: 0,
      buckets_total: 0,
      progress: 0,
      current_bucket_scanned: 0,
      current_bucket_estimate: 0,
    };
    await pollJob(id);
  } catch (e) {
    indexBusy.value = false;
    Message.error(e instanceof Error ? e.message : "启动增量更新失败");
  }
}

function onClearIndex() {
  Modal.confirm({
    title: "清除本地索引",
    content: form.buckets.length
      ? `将清除所选 Bucket 的本地索引元数据，不影响云端对象。`
      : "将清除当前账号下全部本地索引，不影响云端对象。",
    okText: "清除",
    cancelText: "取消",
    onOk: async () => {
      try {
        await api.clearSearchIndex({
          buckets: form.buckets.length ? form.buckets : undefined,
        });
        indexJob.value = null;
        await refreshIndexStatus();
        Message.success("本地索引已清除");
      } catch (e) {
        Message.error(e instanceof Error ? e.message : "清除失败");
      }
    },
  });
}

async function onCancelIndex() {
  const id = String(indexJob.value?.id || "");
  if (!id) return;
  try {
    await api.cancelSearchIndexJob(id);
  } catch {
    /* ignore */
  }
}

function onCancelSearch(notify = true) {
  if (!searchAbort && !searching.value) return;
  if (searchAbort) {
    searchAbort.abort();
    searchAbort = null;
  }
  searching.value = false;
  if (notify) Message.info("已取消搜索");
}

function isAbortError(e: unknown) {
  return (
    (e instanceof DOMException && e.name === "AbortError") ||
    (e instanceof Error && (e.name === "AbortError" || e.message === "已取消"))
  );
}

async function onSearch() {
  if (searchAbort) {
    searchAbort.abort();
    searchAbort = null;
  }
  const ac = new AbortController();
  searchAbort = ac;
  searching.value = true;
  selectedKeys.value = [];
  let limit = 500;
  try {
    const st = await api.getSettings();
    const n = Number((st.data as { searchDefaultLimit?: number } | undefined)?.searchDefaultLimit);
    if (Number.isFinite(n) && n >= 50) limit = Math.min(5000, Math.round(n));
  } catch {
    /* use default */
  }
  try {
    const res = await api.searchObjects(
      {
        mode: form.mode,
        buckets: form.buckets,
        prefix: form.prefix || "",
        name: form.name || "",
        ext: form.ext || "",
        storage_class: form.storageClass || "",
        size_min: form.sizeMin,
        size_max: form.sizeMax,
        mtime_from: toMs(clampToNow(form.mtimeFrom as any)),
        mtime_to: toMs(clampToNow(form.mtimeTo as any)),
        limit,
      },
      { signal: ac.signal }
    );
    if (ac.signal.aborted || searchAbort !== ac) return;
    const data = res.data || { items: [] };
    truncated.value = !!data.truncated;
    rows.value = (data.items || []).map((it: any) => ({
      rowKey: `${it.bucket}::${it.key}`,
      bucket: String(it.bucket || ""),
      key: String(it.key || ""),
      name: String(it.name || ""),
      size: Number(it.size) || 0,
      last_modified: Number(it.last_modified) || 0,
      storage_class: String(it.storage_class || ""),
      region: String(it.region || ""),
    }));
    Message.success(res.message || `找到 ${rows.value.length} 条`);
  } catch (e) {
    if (isAbortError(e)) {
      if (searchAbort === ac) Message.info("已取消搜索");
      return;
    }
    if (searchAbort === ac) {
      Message.error(e instanceof Error ? e.message : "搜索失败");
    }
  } finally {
    if (searchAbort === ac) {
      searchAbort = null;
      searching.value = false;
    }
  }
}

function selectedItems(): SearchHit[] {
  const set = new Set(selectedKeys.value.map(String));
  return rows.value.filter((r) => set.has(r.rowKey));
}

function emitBatch(action: "download" | "delete" | "address" | "verify" | "open") {
  const items = selectedItems();
  if (!items.length) {
    Message.warning("请先选择结果");
    return;
  }
  emit("batch", action, items);
}
</script>

<style scoped>
.gs-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 28px;
}

.gs-title-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #1d1d1f;
  line-height: 1.3;
}

.gs-beta {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1;
  color: #6e6e73;
  background: #f2f2f7;
  border: 1px solid #e5e5ea;
}

.gs-beta-tip-icon {
  font-size: 14px;
  color: #8e8e93;
  cursor: help;
}

.gs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mode-row .hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.4;
}

.index-panel {
  padding: 10px 12px;
  border-radius: 10px;
  background: #f5f5f7;
}

.index-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  font-size: 13px;
  color: #3a3a3c;
  margin-bottom: 8px;
}

.index-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.index-progress {
  margin-top: 10px;
}

.progress-text {
  margin: 6px 0 0;
  font-size: 12px;
}

.filters :deep(.arco-form-item) {
  margin-bottom: 10px;
}

.search-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.batch-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.warn {
  color: #d25f00;
}

.muted {
  color: #8e8e93;
  font-size: 12px;
}

.link-btn {
  border: none;
  background: transparent;
  color: #0071e3;
  cursor: pointer;
  padding: 0 4px;
  font-size: 12px;
}
</style>
