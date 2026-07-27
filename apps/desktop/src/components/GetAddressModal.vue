<template>
  <a-modal :visible="visible" title="获取地址" :footer="false" width="680px" unmount-on-close @update:visible="emit('update:visible', $event)" @cancel="emit('update:visible', false)">
    <a-spin :loading="loading" style="width: 100%">
      <a-form :model="{}" layout="vertical">
        <a-form-item label="对象">
          <a-input :model-value="objectName" readonly />
        </a-form-item>

        <a-form-item label="域名">
          <a-select v-model="selectedDomain" :options="domainOptions" allow-search placeholder="选择域名（含传输加速）" @change="onDomainChange" />
          <p v-if="!accelerateDomain && domainsLoaded" class="hint muted">
            未检测到传输加速域名。请确认 Bucket 已在控制台开通「传输加速」。
          </p>
        </a-form-item>

        <a-form-item v-if="!isPublic" label="有效期（秒）">
          <div class="field-block expires-row">
            <a-input-number v-model="expires" :min="60" :max="604800" style="width: 160px" />
            <a-button type="outline" size="small" @click="regen">重新生成</a-button>
          </div>
        </a-form-item>

        <a-form-item label="地址">
          <div class="field-block">
            <a-input v-model="url" class="url-input" readonly />
            <div class="url-actions">
              <a-button type="primary" size="small" @click="copyText(url)">复制地址</a-button>
              <a-button v-if="accelerateDomain" type="outline" size="small" :loading="copyingAcc" @click="copyAccelerate">
                复制加速链接
              </a-button>
              <a-button size="small" @click="openExternal(url)">打开</a-button>
            </div>
          </div>
        </a-form-item>

        <a-form-item v-if="url" label="二维码">
          <div class="qr-wrap">
            <canvas ref="qrCanvas" width="180" height="180" />
            <div class="qr-actions">
              <a-button size="small" @click="copyQrcode">复制二维码</a-button>
              <a-button size="small" @click="downloadQrcode">下载二维码</a-button>
            </div>
          </div>
        </a-form-item>
      </a-form>
    </a-spin>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Message } from "@arco-design/web-vue";
import QRCode from "qrcode";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { api } from "../api/client";

const props = defineProps<{
  visible: boolean;
  bucket: string;
  objectKey: string;
  region?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
}>();

const LS_DOMAIN = "hyh-oss-last-address-domain";

const loading = ref(false);
const copyingAcc = ref(false);
const domainsLoaded = ref(false);
const url = ref("");
const originUrl = ref("");
const expires = ref(3600);
const isPublic = ref(false);
const selectedDomain = ref("");
const domains = ref<{ label: string; value: string; type: string }[]>([]);
const qrCanvas = ref<HTMLCanvasElement | null>(null);
let reqSeq = 0;

const objectName = computed(() => {
  const k = props.objectKey || "";
  const parts = k.split("/");
  return parts[parts.length - 1] || k;
});

const domainOptions = computed(() =>
  domains.value.map((d) => ({ label: d.label, value: d.value }))
);

/** 优先国内加速，其次海外加速 */
const accelerateDomain = computed(() => {
  const domestic = domains.value.find((d) => d.type === "accelerate");
  if (domestic) return domestic.value;
  const overseas = domains.value.find((d) => d.type === "accelerate-overseas");
  return overseas?.value || "";
});

watch(
  () => props.visible,
  async (v) => {
    if (v) await init();
  }
);

watch(url, async (v) => {
  if (!v) return;
  await nextTick();
  await drawQr(v);
});

async function fetchAddress(domain?: string, seq?: number) {
  const res = await api.getObjectAddress({
    bucket: props.bucket,
    key: props.objectKey,
    expires: expires.value,
    region: props.region,
    ...(domain ? { domain } : {}),
  });
  if (seq != null && seq !== reqSeq) return "";
  const data = res.data as {
    url?: string;
    public?: boolean;
    signed?: boolean;
  };
  isPublic.value = !!data?.public;
  return data?.url || "";
}

async function init() {
  const seq = ++reqSeq;
  loading.value = true;
  domainsLoaded.value = false;
  url.value = "";
  originUrl.value = "";
  isPublic.value = false;
  try {
    const domainRes = await api.listBucketDomains(props.bucket, props.region);
    if (seq !== reqSeq) return;
    const d = domainRes.data as {
      list: { label: string; value: string; type: string }[];
      preferred: string;
      defaultHost: string;
    };
    domains.value = d?.list?.length
      ? d.list
      : [
        {
          label: `系统默认 · ${props.bucket}.aliyuncs.com`,
          value: `${props.bucket}.aliyuncs.com`,
          type: "default",
        },
      ];
    domainsLoaded.value = true;

    const last = localStorage.getItem(LS_DOMAIN) || "";
    const values = domains.value.map((x) => x.value);
    if (last && values.includes(last)) {
      selectedDomain.value = last;
    } else {
      selectedDomain.value = d?.preferred || domains.value[0].value;
    }

    originUrl.value = await fetchAddress(selectedDomain.value, seq);
    if (seq !== reqSeq) return;
    url.value = originUrl.value;
  } catch (e) {
    if (seq !== reqSeq) return;
    Message.error(e instanceof Error ? e.message : "获取地址失败");
  } finally {
    if (seq === reqSeq) loading.value = false;
  }
}

async function copyAccelerate() {
  if (!accelerateDomain.value) {
    Message.warning("未找到可用的传输加速域名");
    return;
  }
  const seq = ++reqSeq;
  copyingAcc.value = true;
  try {
    const u = await fetchAddress(accelerateDomain.value, seq);
    if (seq !== reqSeq) return;
    selectedDomain.value = accelerateDomain.value;
    localStorage.setItem(LS_DOMAIN, accelerateDomain.value);
    originUrl.value = u;
    url.value = u;
    await navigator.clipboard.writeText(u);
    Message.success("已复制加速链接");
  } catch (e) {
    if (seq !== reqSeq) return;
    Message.error(e instanceof Error ? e.message : "复制加速链接失败");
  } finally {
    if (seq === reqSeq) copyingAcc.value = false;
  }
}

async function onDomainChange(v: string) {
  selectedDomain.value = v;
  localStorage.setItem(LS_DOMAIN, v || "");
  const seq = ++reqSeq;
  loading.value = true;
  try {
    originUrl.value = await fetchAddress(v, seq);
    if (seq !== reqSeq) return;
    url.value = originUrl.value;
  } catch (e) {
    if (seq !== reqSeq) return;
    Message.error(e instanceof Error ? e.message : "切换域名失败");
  } finally {
    if (seq === reqSeq) loading.value = false;
  }
}

async function regen() {
  if (isPublic.value) return;
  const seq = ++reqSeq;
  loading.value = true;
  try {
    originUrl.value = await fetchAddress(selectedDomain.value, seq);
    if (seq !== reqSeq) return;
    url.value = originUrl.value;
  } catch (e) {
    if (seq !== reqSeq) return;
    Message.error(e instanceof Error ? e.message : "生成失败");
  } finally {
    if (seq === reqSeq) loading.value = false;
  }
}

async function drawQr(text: string) {
  const canvas = qrCanvas.value;
  if (!canvas) return;
  try {
    await QRCode.toCanvas(canvas, text, {
      width: 180,
      margin: 1,
      color: { dark: "#1d1d1f", light: "#ffffff" },
    });
  } catch {
    /* ignore */
  }
}

async function copyText(text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    Message.success("已复制");
  } catch {
    Message.error("复制失败");
  }
}

function openExternal(u: string) {
  if (!u) return;
  openUrl(u).catch(() => window.open(u, "_blank"));
}

async function copyQrcode() {
  const canvas = qrCanvas.value;
  if (!canvas) {
    Message.error("二维码未生成");
    return;
  }
  try {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
    if (!blob) throw new Error("empty");
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    Message.success("二维码已复制");
  } catch {
    Message.error("复制二维码失败，请改用下载");
  }
}

function downloadQrcode() {
  const canvas = qrCanvas.value;
  if (!canvas) {
    Message.error("二维码未生成");
    return;
  }
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `oss-qrcode-${objectName.value || "file"}.png`;
  a.click();
  Message.success("已开始下载");
}
</script>

<style scoped>
.field-block {
  width: 100%;
}

.url-input {
  width: 100%;
}

.url-input :deep(input) {
  overflow-x: auto;
  white-space: nowrap;
  text-overflow: clip;
}

.expires-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.url-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.qr-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.qr-wrap canvas {
  border: 1px solid #e5e5ea;
  border-radius: 8px;
  background: #fff;
}

.qr-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
}

.hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
}

.muted {
  color: #8e8e93;
}
</style>
