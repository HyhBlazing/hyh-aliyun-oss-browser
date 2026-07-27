<template>
  <a-modal
    :visible="visible"
    title="Bucket ACL"
    :ok-loading="loading"
    unmount-on-close
    @ok="onOk"
    @cancel="emit('update:visible', false)"
    @update:visible="emit('update:visible', $event)"
  >
    <a-spin :loading="loadingInit" style="width: 100%">
      <a-form :model="formStub" layout="vertical">
        <a-form-item label="Bucket">
          <a-input :model-value="bucket" readonly />
        </a-form-item>
        <a-form-item label="访问权限" required>
          <a-select v-model="acl" :options="aclOptions" />
        </a-form-item>
      </a-form>
    </a-spin>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Message } from "@arco-design/web-vue";
import { api } from "../api/client";

const props = defineProps<{
  visible: boolean;
  bucket: string;
  region?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
  (e: "done"): void;
}>();

const aclOptions = [
  { label: "私有", value: "private" },
  { label: "公共读", value: "public-read" },
  { label: "公共读写", value: "public-read-write" },
];

const acl = ref("private");
const loading = ref(false);
const loadingInit = ref(false);
const formStub = {};

watch(
  () => props.visible,
  async (v) => {
    if (!v) return;
    loadingInit.value = true;
    acl.value = "private";
    try {
      const res = await api.getBucketAcl(props.bucket, props.region);
      acl.value = (res.data as { acl?: string })?.acl || "private";
    } catch (e) {
      Message.error(e instanceof Error ? e.message : "读取 Bucket ACL 失败");
    } finally {
      loadingInit.value = false;
    }
  }
);

async function onOk() {
  loading.value = true;
  try {
    await api.putBucketAcl(props.bucket, {
      acl: acl.value,
      ...(props.region ? { region: props.region } : {}),
    });
    Message.success("Bucket ACL 已更新");
    emit("update:visible", false);
    emit("done");
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "更新 Bucket ACL 失败");
  } finally {
    loading.value = false;
  }
}
</script>
