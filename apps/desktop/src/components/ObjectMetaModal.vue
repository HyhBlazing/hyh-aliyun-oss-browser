<template>
  <a-modal
    :visible="visible"
    title="HTTP 头与用户元数据"
    :ok-loading="loading"
    width="640px"
    unmount-on-close
    @ok="onOk"
    @cancel="emit('update:visible', false)"
    @update:visible="emit('update:visible', $event)"
  >
    <a-spin :loading="loadingInit" style="width: 100%">
      <a-form :model="formStub" layout="vertical">
        <a-form-item label="对象">
          <a-input :model-value="objectName" readonly />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="CRC64（只读）">
              <a-input :model-value="integrity.crc64 || '—'" readonly />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Content-MD5（只读）">
              <a-input :model-value="integrity.contentMd5 || '—'" readonly />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item label="ETag（只读）">
              <a-input :model-value="integrity.etag || '—'" readonly />
              <p v-if="integrity.etagHint" class="hint muted">{{ integrity.etagHint }}</p>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="Content-Type">
              <a-input v-model="headers.contentType" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Content-Language">
              <a-input v-model="headers.contentLanguage" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Cache-Control">
              <a-input v-model="headers.cacheControl" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Content-Disposition">
              <a-input v-model="headers.contentDisposition" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Content-Encoding">
              <a-input v-model="headers.contentEncoding" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Expires">
              <a-input v-model="headers.expires" allow-clear placeholder="GMT 日期字符串" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="用户元数据">
          <div v-for="(item, idx) in metaItems" :key="idx" class="meta-row">
            <a-input v-model="item.key" placeholder="键" allow-clear />
            <a-input v-model="item.value" placeholder="值" allow-clear />
            <a-button type="text" status="danger" @click="removeMeta(idx)">删除</a-button>
          </div>
          <a-button type="outline" size="small" @click="addMeta">添加</a-button>
        </a-form-item>
      </a-form>
    </a-spin>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Message } from "@arco-design/web-vue";
import { api } from "../api/client";

const props = defineProps<{
  visible: boolean;
  bucket: string;
  objectKey: string;
  region?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
  (e: "done"): void;
}>();

const loading = ref(false);
const loadingInit = ref(false);
const headers = reactive({
  contentType: "",
  contentLanguage: "",
  cacheControl: "",
  contentDisposition: "",
  contentEncoding: "",
  expires: "",
});
const metaItems = ref<{ key: string; value: string }[]>([]);
const formStub = {};
const integrity = reactive({
  crc64: "",
  contentMd5: "",
  etag: "",
  etagHint: "",
});

const objectName = computed(() => {
  const k = props.objectKey || "";
  const parts = k.split("/");
  return parts[parts.length - 1] || k;
});

watch(
  () => props.visible,
  async (v) => {
    if (!v) return;
    loadingInit.value = true;
    Object.assign(headers, {
      contentType: "",
      contentLanguage: "",
      cacheControl: "",
      contentDisposition: "",
      contentEncoding: "",
      expires: "",
    });
    Object.assign(integrity, {
      crc64: "",
      contentMd5: "",
      etag: "",
      etagHint: "",
    });
    metaItems.value = [];
    try {
      const res = await api.getObjectMeta({
        bucket: props.bucket,
        key: props.objectKey,
        ...(props.region ? { region: props.region } : {}),
      });
      const data = (res.data || {}) as Record<string, unknown>;
      headers.contentType = String(
        data.content_type ?? data.contentType ?? data.ContentType ?? ""
      );
      headers.contentLanguage = String(
        data.content_language ?? data.contentLanguage ?? data.ContentLanguage ?? ""
      );
      headers.cacheControl = String(
        data.cache_control ?? data.cacheControl ?? data.CacheControl ?? ""
      );
      headers.contentDisposition = String(
        data.content_disposition ?? data.contentDisposition ?? data.ContentDisposition ?? ""
      );
      headers.contentEncoding = String(
        data.content_encoding ?? data.contentEncoding ?? data.ContentEncoding ?? ""
      );
      headers.expires = String(data.expires ?? data.Expires ?? "");
      integrity.crc64 = String(
        data.hash_crc64ecma ?? data.hashCrc64ecma ?? data.crc64 ?? ""
      );
      integrity.contentMd5 = String(
        data.content_md5 ?? data.contentMd5 ?? data.ContentMD5 ?? ""
      );
      integrity.etag = String(data.etag ?? data.ETag ?? "").replace(/"/g, "");
      integrity.etagHint = integrity.etag.includes("-")
        ? "分片上传的 ETag 不能当作文件 MD5"
        : "";
      const meta = (data.metadata ?? data.Metadata ?? {}) as Record<string, string>;
      metaItems.value = Object.entries(meta).map(([key, value]) => ({ key, value }));
      if (!metaItems.value.length) metaItems.value.push({ key: "", value: "" });
    } catch (e) {
      Message.error(e instanceof Error ? e.message : "读取元数据失败");
    } finally {
      loadingInit.value = false;
    }
  }
);

function addMeta() {
  metaItems.value.push({ key: "", value: "" });
}

function removeMeta(idx: number) {
  metaItems.value.splice(idx, 1);
  if (!metaItems.value.length) metaItems.value.push({ key: "", value: "" });
}

async function onOk() {
  const metadata: Record<string, string> = {};
  for (const item of metaItems.value) {
    const k = (item.key || "").trim();
    const val = (item.value || "").trim();
    if (k && val) metadata[k] = val;
  }
  loading.value = true;
  try {
    await api.putObjectMeta({
      bucket: props.bucket,
      key: props.objectKey,
      headers: {
        "Content-Type": headers.contentType || undefined,
        "Content-Language": headers.contentLanguage || undefined,
        "Cache-Control": headers.cacheControl || undefined,
        "Content-Disposition": headers.contentDisposition || undefined,
        "Content-Encoding": headers.contentEncoding || undefined,
        Expires: headers.expires || undefined,
      },
      metadata,
      ...(props.region ? { region: props.region } : {}),
    });
    Message.success("元数据已更新");
    emit("update:visible", false);
    emit("done");
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "更新元数据失败");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.meta-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.meta-row > * + * {
  margin-left: 8px;
}
.meta-row .arco-input-wrapper {
  flex: 1;
}
.hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.4;
}
.muted {
  color: var(--color-text-3);
}
</style>
