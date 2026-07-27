<template>
  <div class="settings">
    <a-form :model="form" layout="vertical" @submit.prevent="onSave">
      <div class="settings-block">
        <a-form-item>
          <template #label>
            <span class="field-label">
              默认下载目录
              <a-tooltip content="每次询问：每次下载都选择保存位置。固定目录：下载直接保存到指定目录。">
                <icon-exclamation-circle class="label-tip" />
              </a-tooltip>
            </span>
          </template>
          <div class="download-dir-block">
            <a-radio-group v-model="downloadMode" type="button" size="small" class="download-mode">
              <a-radio value="ask">每次询问</a-radio>
              <a-radio value="fixed">固定目录</a-radio>
            </a-radio-group>
            <div v-if="downloadMode === 'fixed'" class="path-row">
              <a-input
                v-model="downloadDir"
                allow-clear
                placeholder="请选择或填写固定下载目录"
              />
              <a-button html-type="button" @click="pickDownloadDir">浏览</a-button>
            </div>
            <p v-else class="path-hint muted">每次下载时弹出目录选择，不会锁定到固定路径</p>
          </div>
        </a-form-item>

        <a-form-item>
          <template #label>
            <span class="field-label">
              网络代理
              <a-tooltip content="仅作用于 OSS 访问（列举/上传/下载），不跟随 Windows 系统代理。支持 HTTP、HTTPS、SOCKS5。">
                <icon-exclamation-circle class="label-tip" />
              </a-tooltip>
            </span>
          </template>
          <div class="proxy-row">
            <a-switch v-model="form.proxyEnabled" checked-text="开" unchecked-text="关" />
            <a-input v-if="form.proxyEnabled" v-model="form.proxyUrl" class="proxy-input" allow-clear placeholder="例如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080" />
            <span v-else class="proxy-off muted">未启用，OSS 请求将直连</span>
          </div>
        </a-form-item>
      </div>

      <div class="settings-grid">
        <a-form-item label="最大上传任务数">
          <a-input-number v-model="form.maxUploadJobCount" :min="1" :max="200" />
        </a-form-item>
        <a-form-item label="最大下载任务数">
          <a-input-number v-model="form.maxDownloadJobCount" :min="1" :max="200" />
        </a-form-item>
        <a-form-item label="超时时间 (ms)">
          <a-input-number v-model="form.connectTimeout" :min="1000" :step="1000" />
        </a-form-item>
        <a-form-item label="分片大小 (MB)">
          <a-input-number v-model="form.uploadPartSize" :min="1" :max="100" />
        </a-form-item>
        <a-form-item label="并发分片下载数">
          <a-input-number v-model="form.downloadConcurrecyPartSize" :min="1" :max="20" />
        </a-form-item>
        <a-form-item label="上传/下载重试次数">
          <a-input-number v-model="form.uploadAndDownloadRetryTimes" :min="0" :max="20" />
        </a-form-item>
        <a-form-item label="列举 Object 最大数量">
          <a-input-number v-model="form.listObjectNum" :min="30" :max="1000" />
        </a-form-item>
        <a-form-item>
          <template #label>
            <span class="field-label">
              覆盖同名文件
              <a-tooltip content="开启：上传时覆盖云端同名文件。关闭：云端已有且大小相同的文件会自动跳过，不重复上传。">
                <icon-exclamation-circle class="label-tip" />
              </a-tooltip>
            </span>
          </template>
          <a-switch v-model="form.overwriteSameName" />
        </a-form-item>
        <a-form-item label="私有云允许不安全 TLS">
          <a-switch v-model="form.allowInsecureTls" />
        </a-form-item>
        <a-form-item>
          <template #label>
            <span class="field-label">
              显示图片缩略图
              <a-tooltip content="仅保存在本机，不写入服务端配置">
                <icon-exclamation-circle class="label-tip" />
              </a-tooltip>
            </span>
          </template>
          <a-switch v-model="form.showImageThumbnail" />
        </a-form-item>
      </div>

      <div class="settings-actions">
        <a-button type="primary" html-type="button" :loading="saving" @click="onSave">
          保存
        </a-button>
      </div>
    </a-form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { Message } from "@arco-design/web-vue";
import { useSettingsStore } from "../stores/settings";
import {
  getDefaultDownloadDirectory,
  getDownloadDirMode,
  isTauri,
  setDefaultDownloadDirectory,
  setDownloadDirMode,
  type DownloadDirMode,
} from "../lib/local-fs";

const LS_SHOW_THUMB = "hyh-oss-show-thumb";

const SERVER_KEYS = [
  "maxUploadJobCount",
  "maxDownloadJobCount",
  "connectTimeout",
  "uploadPartSize",
  "downloadConcurrecyPartSize",
  "uploadAndDownloadRetryTimes",
  "listObjectNum",
  "overwriteSameName",
  "allowInsecureTls",
  "proxyEnabled",
  "proxyUrl",
] as const;

const emit = defineEmits<{ saved: [] }>();
const settings = useSettingsStore();
const saving = ref(false);
const downloadDir = ref("");
const downloadMode = ref<DownloadDirMode>("ask");
const form = reactive({
  maxUploadJobCount: 50,
  maxDownloadJobCount: 100,
  connectTimeout: 60000,
  uploadPartSize: 10,
  downloadConcurrecyPartSize: 5,
  uploadAndDownloadRetryTimes: 5,
  listObjectNum: 500,
  overwriteSameName: true,
  allowInsecureTls: false,
  proxyEnabled: false,
  proxyUrl: "",
  showImageThumbnail: false,
});

onMounted(async () => {
  try {
    await settings.load();
    for (const key of SERVER_KEYS) {
      if (settings.values[key] !== undefined && settings.values[key] !== null) {
        (form as any)[key] = settings.values[key];
      }
    }
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "加载设置失败");
  }
  form.showImageThumbnail = localStorage.getItem(LS_SHOW_THUMB) === "YES";
  downloadMode.value = getDownloadDirMode();
  downloadDir.value = getDefaultDownloadDirectory();
});

async function pickDownloadDir() {
  if (!isTauri()) {
    Message.warning("请在桌面客户端中选择目录，或直接填写绝对路径");
    return;
  }
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({
      directory: true,
      multiple: false,
      defaultPath: downloadDir.value || undefined,
    });
    if (!dir) return;
    const path = Array.isArray(dir) ? dir[0] : typeof dir === "string" ? dir : (dir as { path?: string }).path;
    if (path) downloadDir.value = String(path);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "选择目录失败");
  }
}

function buildServerPayload() {
  const payload: Record<string, unknown> = {};
  for (const key of SERVER_KEYS) {
    payload[key] = (form as any)[key];
  }
  payload.proxyEnabled = !!form.proxyEnabled;
  payload.proxyUrl = String(form.proxyUrl || "").trim();
  payload.overwriteSameName = !!form.overwriteSameName;
  payload.allowInsecureTls = !!form.allowInsecureTls;
  return payload;
}

async function onSave() {
  if (saving.value) return;
  saving.value = true;
  try {
    const payload = buildServerPayload();
    if (payload.proxyEnabled && !payload.proxyUrl) {
      Message.warning("启用代理时请填写代理地址");
      return;
    }
    if (downloadMode.value === "fixed" && !(downloadDir.value || "").trim()) {
      Message.warning("请先选择固定下载目录");
      return;
    }
    localStorage.setItem(LS_SHOW_THUMB, form.showImageThumbnail ? "YES" : "NO");
    setDownloadDirMode(downloadMode.value);
    if (downloadMode.value === "fixed") {
      setDefaultDownloadDirectory((downloadDir.value || "").trim());
    }
    await settings.save(payload);
    // 先通知关闭，再由父级提示，避免全屏弹窗挡住 Message
    emit("saved");
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "保存失败");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.settings {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.settings-block :deep(.arco-form-item) {
  margin-bottom: 16px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 4px 16px;
  margin-bottom: 8px;
}

.settings-grid :deep(.arco-form-item) {
  margin-bottom: 12px;
}

.settings-grid :deep(.arco-input-number) {
  width: 100%;
}

.field-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.label-tip {
  color: #8e8e93;
  font-size: 14px;
  cursor: help;
}

.label-tip:hover {
  color: #636366;
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

.download-dir-block {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  width: 100%;
}

.download-mode {
  flex: 0 0 auto;
  width: fit-content;
  max-width: 100%;
}

.download-mode :deep(.arco-radio-button),
.download-mode :deep(.arco-radio-button-content) {
  white-space: nowrap;
}

.path-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
}

.proxy-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 32px;
}

.proxy-row :deep(.arco-switch) {
  flex-shrink: 0;
}

.proxy-input {
  flex: 1;
  min-width: 0;
}

.proxy-off {
  font-size: 13px;
  line-height: 1.4;
  white-space: nowrap;
}

.settings-actions {
  margin-top: 8px;
}

.muted {
  color: #8e8e93;
}

@media (max-width: 640px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
