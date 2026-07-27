<template>
  <a-modal :visible="visible" title="批量获取地址" :footer="false" width="720px" unmount-on-close @update:visible="emit('update:visible', $event)" @cancel="emit('update:visible', false)">
    <a-spin :loading="loading" style="width: 100%">
      <a-form layout="vertical">
        <a-form-item>
          <template #label>
            <span class="field-label">
              范围
              <a-tooltip content="目录将展开为其下全部文件；结果按一行一个地址输出。">
                <icon-exclamation-circle class="label-tip" />
              </a-tooltip>
            </span>
          </template>
          <div class="keys">
            <div v-for="k in keys" :key="k" class="key">{{ k }}</div>
          </div>
        </a-form-item>

        <a-form-item label="域名">
          <a-select v-model="selectedDomain" :options="domainOptions" allow-search placeholder="选择域名（含传输加速）" @change="onDomainChange" />
        </a-form-item>

        <a-form-item v-if="isSigned">
          <template #label>
            <span class="field-label">
              有效期（秒）
              <a-tooltip content="当前为私有对象，链接带签名有效期。">
                <icon-exclamation-circle class="label-tip" />
              </a-tooltip>
            </span>
          </template>
          <div class="expires-row">
            <a-input-number v-model="expires" :min="60" :max="604800" style="width: 160px" />
            <a-button type="outline" size="small" :loading="generating" @click="loadAddresses">
              重新生成
            </a-button>
          </div>
        </a-form-item>

        <a-form-item>
          <a-space>
            <a-button type="primary" :disabled="!urlsText" @click="copyUrls">复制全部地址</a-button>
            <a-button :disabled="!pairsText" @click="copyPairs">复制「路径 + 地址」</a-button>
          </a-space>
        </a-form-item>

        <a-alert v-if="truncated" type="warning" style="margin-bottom: 12px">
          文件数量超过上限，已截断。可缩小范围后重试。
        </a-alert>

        <a-form-item v-if="resultTotal >= 0" :label="`结果（${resultTotal}）`">
          <a-textarea v-model="urlsText" :auto-size="{ minRows: 8, maxRows: 16 }" readonly />
        </a-form-item>
      </a-form>
    </a-spin>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Message } from "@arco-design/web-vue";
import { api } from "../api/client";

const props = defineProps<{
  visible: boolean;
  bucket: string;
  keys: string[];
  region?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
}>();

const LS_DOMAIN = "hyh-oss-last-address-domain";

const loading = ref(false);
const generating = ref(false);
const expires = ref(3600);
const isSigned = ref(false);
const selectedDomain = ref("");
const domains = ref<{ label: string; value: string; type: string }[]>([]);
const urlsText = ref("");
const pairsText = ref("");
const resultTotal = ref(-1);
const truncated = ref(false);
let reqSeq = 0;

const domainOptions = computed(() =>
  domains.value.map((d) => ({ label: d.label, value: d.value }))
);

watch(
  () => props.visible,
  async (v) => {
    if (!v) return;
    urlsText.value = "";
    pairsText.value = "";
    resultTotal.value = -1;
    truncated.value = false;
    isSigned.value = false;
    await init();
  }
);

async function init() {
  const seq = ++reqSeq;
  loading.value = true;
  try {
    const domainRes = await api.listBucketDomains(props.bucket, props.region);
    if (seq !== reqSeq) return;
    const d = domainRes.data as {
      list: { label: string; value: string; type: string }[];
      preferred: string;
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
    const last = localStorage.getItem(LS_DOMAIN) || "";
    const values = domains.value.map((x) => x.value);
    if (last && values.includes(last)) selectedDomain.value = last;
    else selectedDomain.value = d?.preferred || domains.value[0].value;

    await loadAddresses(seq);
  } catch (e) {
    if (seq !== reqSeq) return;
    Message.error(e instanceof Error ? e.message : "加载失败");
  } finally {
    if (seq === reqSeq) loading.value = false;
  }
}

async function onDomainChange(v: string) {
  selectedDomain.value = v;
  if (v) localStorage.setItem(LS_DOMAIN, v);
  const seq = ++reqSeq;
  loading.value = true;
  try {
    await loadAddresses(seq);
  } finally {
    if (seq === reqSeq) loading.value = false;
  }
}

async function loadAddresses(existingSeq?: number) {
  if (!props.keys.length) {
    Message.warning("未选择对象");
    return;
  }
  const seq = existingSeq ?? ++reqSeq;
  generating.value = true;
  try {
    if (selectedDomain.value) {
      localStorage.setItem(LS_DOMAIN, selectedDomain.value);
    }
    const res = await api.batchObjectAddresses({
      bucket: props.bucket,
      keys: props.keys,
      expires: expires.value,
      region: props.region,
      domain: selectedDomain.value || "",
    });
    if (seq !== reqSeq) return;
    const data = res.data as {
      list?: { key: string; url: string; error?: string }[];
      total?: number;
      truncated?: boolean;
      public?: boolean;
      signed?: boolean;
    };
    const list = data?.list || [];
    isSigned.value = !!data?.signed;
    truncated.value = !!data?.truncated;
    resultTotal.value = data?.total ?? list.length;
    urlsText.value = list
      .map((i) => i.url)
      .filter(Boolean)
      .join("\n");
    pairsText.value = list
      .filter((i) => i.url)
      .map((i) => `${i.key}\t${i.url}`)
      .join("\n");
    if (!list.length) {
      Message.warning("没有可获取地址的文件");
    }
  } catch (e) {
    if (seq !== reqSeq) return;
    Message.error(e instanceof Error ? e.message : "获取地址失败");
  } finally {
    if (seq === reqSeq) generating.value = false;
  }
}

async function copyUrls() {
  if (!urlsText.value) return;
  try {
    await navigator.clipboard.writeText(urlsText.value);
    Message.success("已复制全部地址");
  } catch {
    Message.error("复制失败");
  }
}

async function copyPairs() {
  if (!pairsText.value) return;
  try {
    await navigator.clipboard.writeText(pairsText.value);
    Message.success("已复制路径与地址");
  } catch {
    Message.error("复制失败");
  }
}
</script>

<style scoped>
.keys {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  max-height: 100px;
  overflow: auto;
  padding: 8px;
  background: #f5f5f7;
  border-radius: 8px;
  font-size: 12px;
  word-break: break-all;
}

.key {
  width: 100%;
}

.key + .key {
  margin-top: 4px;
}

:deep(.arco-form-item-content-wrapper),
:deep(.arco-form-item-content),
:deep(.arco-form-item-wrapper-col) {
  width: 100%;
  max-width: 100%;
  flex: 1 1 auto;
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

.expires-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
