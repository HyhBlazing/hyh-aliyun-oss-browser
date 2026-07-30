<template>
  <a-modal
    :visible="visible"
    :title="modalTitle"
    :footer="false"
    width="720px"
    unmount-on-close
    modal-class="verify-modal"
    @cancel="emit('update:visible', false)"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="verify">
      <a-form layout="vertical" :model="form">
        <a-form-item label="校验算法">
          <a-radio-group v-model="form.mode" type="button" size="small">
            <a-radio value="auto">自动（优先 CRC64）</a-radio>
            <a-radio value="crc64">CRC64</a-radio>
            <a-radio value="md5">MD5</a-radio>
          </a-radio-group>
          <p class="hint muted">
            分片上传的 ETag 不是文件 MD5，自动模式不会用它做内容校验。
          </p>
        </a-form-item>

        <a-form-item v-if="!isBatch" label="云端对象">
          <a-input :model-value="objectKey" readonly />
        </a-form-item>
        <a-form-item v-else label="校验范围">
          <a-input :model-value="batchLabel" readonly />
        </a-form-item>

        <a-form-item label="本地路径">
          <div class="path-row">
            <a-input
              v-model="form.localPath"
              allow-clear
              :placeholder="isBatch ? '请选择本地目录' : '请选择或填写本地文件路径'"
            />
            <a-button html-type="button" @click="pickLocal">浏览</a-button>
          </div>
        </a-form-item>
      </a-form>

      <div class="actions">
        <a-button type="primary" :loading="loading" @click="onVerify">开始校验</a-button>
      </div>

      <a-spin :loading="loading" style="width: 100%">
        <div v-if="singleResult" class="result-card" :class="resultClass(singleResult)">
          <div class="result-title">{{ singleResult.message || (singleResult.matched ? '通过' : '失败') }}</div>
          <ul class="result-list">
            <li><span>算法</span><span>{{ singleResult.algorithm || '-' }}</span></li>
            <li><span>本地</span><span class="mono">{{ singleResult.local || '-' }}</span></li>
            <li><span>云端</span><span class="mono">{{ singleResult.remote || '-' }}</span></li>
            <li v-if="singleResult.warning"><span>说明</span><span>{{ singleResult.warning }}</span></li>
          </ul>
        </div>

        <div v-if="batchSummary" class="batch-block">
          <div class="batch-summary">
            合计 {{ batchSummary.total }}：通过 {{ batchSummary.passed }}，失败 {{ batchSummary.failed }}，跳过 {{ batchSummary.skipped }}
          </div>
          <p v-if="reportPath" class="report-path muted">报告：{{ reportPath }}</p>
          <a-table
            v-if="batchItems.length"
            :columns="columns"
            :data="batchItems"
            row-key="key"
            :pagination="{ pageSize: 8 }"
            size="small"
            :bordered="false"
          >
            <template #status="{ record }">
              <span :class="resultClass(record)">{{ statusText(record) }}</span>
            </template>
          </a-table>
        </div>
      </a-spin>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Message } from "@arco-design/web-vue";
import { api } from "../api/client";
import { isTauri } from "../lib/local-fs";

type VerifyMode = "auto" | "crc64" | "md5";

const props = defineProps<{
  visible: boolean;
  bucket: string;
  region?: string;
  /** 单对象校验 */
  objectKey?: string;
  /** 批量：对象 key 列表 */
  keys?: string[];
  /** 批量：列举前缀（无 keys 时） */
  prefix?: string;
  stripPrefix?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
}>();

const loading = ref(false);
const form = reactive({
  mode: "auto" as VerifyMode,
  localPath: "",
});
const singleResult = ref<Record<string, any> | null>(null);
const batchSummary = ref<Record<string, any> | null>(null);
const batchItems = ref<Record<string, any>[]>([]);
const reportPath = ref("");

const isBatch = computed(
  () => !!(props.keys?.length || props.prefix) && !props.objectKey
);

const modalTitle = computed(() =>
  isBatch.value ? "批量完整性校验" : "完整性校验"
);

const batchLabel = computed(() => {
  if (props.keys?.length) return `已选 ${props.keys.length} 个对象`;
  if (props.prefix) return `前缀 ${props.prefix}`;
  return "";
});

const columns = [
  { title: "对象", dataIndex: "key", ellipsis: true, width: 220 },
  { title: "结果", slotName: "status", width: 90 },
  { title: "算法", dataIndex: "algorithm", width: 90 },
  { title: "说明", dataIndex: "message", ellipsis: true },
];

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    form.mode = "auto";
    form.localPath = "";
    singleResult.value = null;
    batchSummary.value = null;
    batchItems.value = [];
    reportPath.value = "";
  }
);

function resultClass(row: Record<string, any>) {
  if (row.skipped) return "tag skip";
  if (row.matched) return "tag ok";
  return "tag fail";
}

function statusText(row: Record<string, any>) {
  if (row.skipped) return "跳过";
  return row.matched ? "通过" : "失败";
}

async function pickLocal() {
  if (!isTauri()) {
    Message.warning("请在桌面客户端中选择路径，或直接填写");
    return;
  }
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: isBatch.value,
      multiple: false,
      defaultPath: form.localPath || undefined,
    });
    if (!selected) return;
    const p = Array.isArray(selected)
      ? selected[0]
      : typeof selected === "string"
        ? selected
        : (selected as { path?: string }).path;
    if (p) form.localPath = String(p);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "选择路径失败");
  }
}

async function onVerify() {
  if (!props.bucket) {
    Message.warning("缺少 Bucket");
    return;
  }
  if (!(form.localPath || "").trim()) {
    Message.warning(isBatch.value ? "请选择本地目录" : "请选择本地文件");
    return;
  }
  loading.value = true;
  singleResult.value = null;
  batchSummary.value = null;
  batchItems.value = [];
  reportPath.value = "";
  try {
    if (isBatch.value) {
      const res = await api.verifyBatch({
        bucket: props.bucket,
        region: props.region || "",
        keys: props.keys || [],
        prefix: props.prefix || "",
        localDir: form.localPath.trim(),
        stripPrefix: props.stripPrefix || props.prefix || "",
        mode: form.mode,
      });
      const data = (res.data || {}) as any;
      batchSummary.value = data.summary || null;
      batchItems.value = Array.isArray(data.items) ? data.items : [];
      reportPath.value = data.report_path || "";
      Message.success(res.message || "批量校验完成");
    } else {
      if (!props.objectKey) {
        Message.warning("缺少对象 Key");
        return;
      }
      const res = await api.verifyObject({
        bucket: props.bucket,
        key: props.objectKey,
        region: props.region || "",
        localPath: form.localPath.trim(),
        mode: form.mode,
      });
      singleResult.value = (res.data || {}) as any;
      if (singleResult.value?.matched) Message.success("校验通过");
      else if (singleResult.value?.skipped) Message.warning(singleResult.value.message || "已跳过");
      else Message.error(singleResult.value?.message || "校验失败");
    }
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "校验失败");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.verify {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
}

.path-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.path-row :deep(.arco-input-wrapper) {
  flex: 1;
  min-width: 0;
}

.actions {
  display: flex;
  justify-content: flex-start;
}

.result-card {
  padding: 12px 14px;
  border-radius: 10px;
  background: #f5f5f7;
}

.result-card.ok {
  background: rgba(0, 180, 42, 0.08);
}

.result-card.fail {
  background: rgba(245, 63, 63, 0.08);
}

.result-card.skip {
  background: rgba(255, 125, 0, 0.08);
}

.result-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #1d1d1f;
}

.result-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.result-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  padding: 4px 0;
  color: #3a3a3c;
}

.result-list li span:first-child {
  color: #8e8e93;
  flex-shrink: 0;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  word-break: break-all;
  text-align: right;
}

.batch-summary {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.report-path {
  margin: 0 0 10px;
  font-size: 12px;
  word-break: break-all;
}

.tag.ok {
  color: #009a29;
}

.tag.fail {
  color: #cb2634;
}

.tag.skip {
  color: #d25f00;
}

.muted {
  color: #8e8e93;
}
</style>
