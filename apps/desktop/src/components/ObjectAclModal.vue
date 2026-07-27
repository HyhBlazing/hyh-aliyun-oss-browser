<template>
  <a-modal
    :visible="visible"
    title="对象 ACL"
    :ok-loading="loading"
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
        <a-form-item label="访问权限" required>
          <a-select v-model="acl" :options="aclOptions" />
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
  objectKey: string;
  region?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
  (e: "done"): void;
}>();

const aclOptions = [
  { label: "继承 Bucket", value: "default" },
  { label: "私有", value: "private" },
  { label: "公共读", value: "public-read" },
  { label: "公共读写", value: "public-read-write" },
];

const acl = ref("default");
const loading = ref(false);
const loadingInit = ref(false);
const formStub = {};

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
    acl.value = "default";
    try {
      const res = await api.getObjectAcl({
        bucket: props.bucket,
        key: props.objectKey,
        ...(props.region ? { region: props.region } : {}),
      });
      acl.value = (res.data as { acl?: string })?.acl || "default";
    } catch (e) {
      Message.error(e instanceof Error ? e.message : "读取 ACL 失败");
    } finally {
      loadingInit.value = false;
    }
  }
);

async function onOk() {
  loading.value = true;
  try {
    await api.putObjectAcl({
      bucket: props.bucket,
      key: props.objectKey,
      acl: acl.value,
      ...(props.region ? { region: props.region } : {}),
    });
    Message.success("ACL 已更新");
    emit("update:visible", false);
    emit("done");
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "更新 ACL 失败");
  } finally {
    loading.value = false;
  }
}
</script>
