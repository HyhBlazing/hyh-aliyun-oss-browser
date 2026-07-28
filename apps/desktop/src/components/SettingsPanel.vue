<template>
  <div class="settings">
    <a-tabs v-model:active-key="activeTab" type="rounded" class="settings-tabs">
      <a-tab-pane key="app" title="应用">
        <div class="tab-pane-scroll">
          <section class="settings-section">
            <h4 class="section-title">基础</h4>
            <a-form :model="form" layout="vertical">
              <a-form-item>
                <template #label>
                  <span class="field-label">
                    主窗口关闭策略
                    <a-tooltip :content="closeStrategyHint">
                      <icon-exclamation-circle class="label-tip" />
                    </a-tooltip>
                  </span>
                </template>
                <a-select v-model="closeStrategy" :options="closeStrategyOptions" />
              </a-form-item>

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
                    开机自动启动
                    <a-tooltip content="开启后，系统登录时自动启动本应用。仅桌面客户端可用；开发/浏览器预览模式不支持。">
                      <icon-exclamation-circle class="label-tip" />
                    </a-tooltip>
                  </span>
                </template>
                <a-switch v-model="autoStart" :disabled="!autoStartSupported" />
                <p v-if="!autoStartSupported" class="path-hint muted">
                  当前环境不支持开机自启，请在桌面客户端中使用
                </p>
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
            </a-form>
          </section>
        </div>
      </a-tab-pane>

      <a-tab-pane key="other" title="其他">
        <div class="tab-pane-scroll">
          <section class="settings-section">
            <h4 class="section-title">上传 / 下载</h4>
            <a-form :model="form" layout="vertical">
              <div class="settings-grid">
                <a-form-item label="最大上传任务数">
                  <a-input-number v-model="form.maxUploadJobCount" :min="1" :max="200" />
                </a-form-item>
                <a-form-item label="最大下载任务数">
                  <a-input-number v-model="form.maxDownloadJobCount" :min="1" :max="200" />
                </a-form-item>
                <a-form-item label="分片大小 (MB)">
                  <a-input-number v-model="form.uploadPartSize" :min="1" :max="100" />
                </a-form-item>
                <a-form-item label="并发分片下载数">
                  <a-input-number v-model="form.downloadConcurrecyPartSize" :min="1" :max="20" />
                </a-form-item>
                <a-form-item label="上传 / 下载重试次数">
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
              </div>
            </a-form>
          </section>

          <section class="settings-section">
            <h4 class="section-title">网络</h4>
            <a-form :model="form" layout="vertical">
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
                  <a-input
                    v-if="form.proxyEnabled"
                    v-model="form.proxyUrl"
                    class="proxy-input"
                    allow-clear
                    placeholder="例如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
                  />
                  <span v-else class="proxy-off muted">未启用，OSS 请求将直连</span>
                </div>
              </a-form-item>

              <div class="settings-grid">
                <a-form-item label="超时时间 (ms)">
                  <a-input-number v-model="form.connectTimeout" :min="1000" :step="1000" />
                </a-form-item>
                <a-form-item label="私有云允许不安全 TLS">
                  <a-switch v-model="form.allowInsecureTls" />
                </a-form-item>
              </div>
            </a-form>
          </section>
        </div>
      </a-tab-pane>

      <a-tab-pane key="about" title="关于">
        <div class="tab-pane-scroll">
          <section class="settings-section about-section">
            <div class="about-card">
              <img class="about-logo" src="/logo.png" alt="" width="56" height="56" />
              <div class="about-meta">
                <h3 class="about-name">{{ appName }}</h3>
                <p class="about-desc muted">
                  面向阿里云 OSS 与兼容私有云的桌面对象存储管理工具。
                </p>
              </div>
            </div>
            <ul class="about-list">
              <li>
                <span class="about-k">产品</span>
                <span class="about-v">{{ appName }}</span>
              </li>
              <li>
                <span class="about-k">本地版本</span>
                <span class="about-v">{{ appVersion }}</span>
              </li>
              <li>
                <span class="about-k">线上版本</span>
                <span class="about-v">
                  <span v-if="remoteLoading" class="muted">检查中…</span>
                  <span v-else-if="remoteError" class="muted">{{ remoteError }}</span>
                  <span v-else>{{ remoteVersion || "—" }}</span>
                </span>
              </li>
              <li>
                <span class="about-k">更新</span>
                <span class="about-v">
                  <a-button
                    type="text"
                    size="small"
                    class="update-btn"
                    :disabled="remoteLoading"
                    @click="openUpdatePage"
                  >
                    {{ updateActionLabel }}
                  </a-button>
                </span>
              </li>
              <li>
                <span class="about-k">界面</span>
                <span class="about-v">Arco Design + Vue 3</span>
              </li>
              <li>
                <span class="about-k">运行时</span>
                <span class="about-v">Tauri 2</span>
              </li>
            </ul>
          </section>
        </div>
      </a-tab-pane>
    </a-tabs>

    <div v-if="activeTab !== 'about'" class="settings-actions">
      <a-button type="primary" html-type="button" :loading="saving" @click="onSave">
        保存
      </a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
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
import {
  getCloseStrategy,
  setCloseStrategy,
  type CloseStrategy,
} from "../lib/close-strategy";
import { getAutoStartEnabled, setAutoStartEnabled } from "../lib/autostart";

const LS_SHOW_THUMB = "hyh-oss-show-thumb";
const APP_NAME = "hyh-aliyun-oss-browser";
/** 与 apps/desktop/package.json version 保持一致 */
const APP_VERSION = "3.0.2";
const GITHUB_RELEASES_URL =
  "https://github.com/HyhBlazing/hyh-aliyun-oss-browser/releases";
const GITHUB_LATEST_API =
  "https://api.github.com/repos/HyhBlazing/hyh-aliyun-oss-browser/releases/latest";

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

const closeStrategyOptions = [
  { label: "最小化到托盘", value: "tray" },
  { label: "退出应用", value: "exit" },
  { label: "每次询问", value: "ask" },
];

const emit = defineEmits<{ saved: [] }>();
const settings = useSettingsStore();
const saving = ref(false);
const activeTab = ref("app");
const downloadDir = ref("");
const downloadMode = ref<DownloadDirMode>("ask");
const closeStrategy = ref<CloseStrategy>("ask");
const autoStart = ref(false);
const autoStartSupported = ref(false);
const appName = APP_NAME;
const appVersion = APP_VERSION;
const remoteVersion = ref("");
const remoteLoading = ref(false);
const remoteError = ref("");

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

const closeStrategyHint = computed(() => {
  if (closeStrategy.value === "tray") {
    return "关闭主窗口时隐藏到系统托盘，传输任务继续在后台运行。";
  }
  if (closeStrategy.value === "exit") {
    return "关闭主窗口时直接退出应用并结束传输服务。";
  }
  return "关闭主窗口时弹出确认，可选择最小化到托盘或退出应用。";
});

const hasNewerRemote = computed(() => {
  if (!remoteVersion.value) return false;
  return compareSemver(remoteVersion.value, appVersion) > 0;
});

const updateActionLabel = computed(() => {
  if (remoteLoading.value) return "检查中…";
  if (hasNewerRemote.value) return `更新到 ${remoteVersion.value}`;
  if (remoteVersion.value) return "已是最新，打开发布页";
  return "打开 GitHub 发布页";
});

function compareSemver(a: string, b: string) {
  const pa = String(a)
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((x) => parseInt(x, 10) || 0);
  const pb = String(b)
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

async function fetchRemoteVersion() {
  remoteLoading.value = true;
  remoteError.value = "";
  try {
    const res = await fetch(GITHUB_LATEST_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { tag_name?: string; name?: string };
    const tag = String(json.tag_name || json.name || "").trim();
    remoteVersion.value = tag.replace(/^v/i, "") || "";
    if (!remoteVersion.value) remoteError.value = "暂无版本信息";
  } catch {
    remoteError.value = "获取失败";
    remoteVersion.value = "";
  } finally {
    remoteLoading.value = false;
  }
}

async function openUpdatePage() {
  const url = GITHUB_RELEASES_URL;
  if (isTauri()) {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
      return;
    } catch {
      /* fall through */
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

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
  closeStrategy.value = getCloseStrategy();
  autoStartSupported.value = isTauri();
  if (autoStartSupported.value) {
    try {
      autoStart.value = await getAutoStartEnabled();
    } catch {
      autoStart.value = false;
    }
  }
  void fetchRemoteVersion();
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
      activeTab.value = "other";
      return;
    }
    if (downloadMode.value === "fixed" && !(downloadDir.value || "").trim()) {
      Message.warning("请先选择固定下载目录");
      activeTab.value = "app";
      return;
    }
    localStorage.setItem(LS_SHOW_THUMB, form.showImageThumbnail ? "YES" : "NO");
    setDownloadDirMode(downloadMode.value);
    if (downloadMode.value === "fixed") {
      setDefaultDownloadDirectory((downloadDir.value || "").trim());
    }
    setCloseStrategy(closeStrategy.value);
    if (autoStartSupported.value) {
      try {
        await setAutoStartEnabled(!!autoStart.value);
      } catch (e) {
        Message.error(e instanceof Error ? e.message : "设置开机自启失败");
        activeTab.value = "app";
        return;
      }
    }
    await settings.save(payload);
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
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.settings-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.settings-tabs :deep(.arco-tabs-nav) {
  margin-bottom: 0;
  padding: 0 4px;
}

.settings-tabs :deep(.arco-tabs-content) {
  flex: 1;
  min-height: 0;
  padding-top: 12px;
}

.settings-tabs :deep(.arco-tabs-content-list),
.settings-tabs :deep(.arco-tabs-pane) {
  height: 100%;
}

.tab-pane-scroll {
  height: 100%;
  max-height: min(560px, calc(100vh - 220px));
  overflow: auto;
  padding-right: 4px;
}

.settings-section {
  margin-bottom: 8px;
}

.section-title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: #636366;
  letter-spacing: 0.02em;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 4px 16px;
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

.field-hint,
.path-hint {
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

.download-dir-block {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  width: 100%;
}

.download-mode {
  width: fit-content;
  max-width: 100%;
}

.download-mode :deep(.arco-radio-button),
.download-mode :deep(.arco-radio-button-content) {
  white-space: nowrap;
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
  flex-shrink: 0;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebebef;
}

.about-section {
  padding-top: 8px;
}

.about-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-radius: 10px;
  background: #f5f5f7;
  margin-bottom: 16px;
}

.about-logo {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
  display: block;
}

.about-name {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 600;
  color: #1d1d1f;
}

.about-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.update-btn {
  padding: 0;
  height: auto;
  color: #0071e3;
}

.update-btn:hover {
  color: #0077ed;
}

.about-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #ebebef;
  border-radius: 10px;
  overflow: hidden;
}

.about-list li {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  font-size: 13px;
  border-bottom: 1px solid #ebebef;
}

.about-list li:last-child {
  border-bottom: none;
}

.about-k {
  color: #8e8e93;
  flex-shrink: 0;
}

.about-v {
  color: #1d1d1f;
  text-align: right;
  word-break: break-all;
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
