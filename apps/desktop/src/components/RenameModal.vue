<template>
  <a-modal
    :visible="visible"
    title="重命名"
    :ok-loading="loading"
    unmount-on-close
    @ok="onOk"
    @cancel="emit('update:visible', false)"
    @update:visible="emit('update:visible', $event)"
  >
    <a-spin :loading="loadingInit" style="width: 100%">
      <a-form :model="formStub" layout="vertical">
        <a-form-item label="原名称">
          <a-input :model-value="displayName" readonly />
        </a-form-item>
        <a-form-item label="新名称" required>
          <a-input
            v-model="newName"
            placeholder="不含 / 的名称"
            allow-clear
            @press-enter="onOk"
          />
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
  prefix: string;
  region?: string;
  objectKey: string;
  isFolder?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
  (e: "done"): void;
}>();

const newName = ref("");
const loading = ref(false);
const loadingInit = ref(false);
const formStub = {};

const displayName = computed(() => {
  const key = props.objectKey || "";
  const p = props.prefix || "";
  let name = key;
  if (p && name.startsWith(p)) name = name.slice(p.length);
  return name.replace(/\/$/, "") || key;
});

watch(
  () => props.visible,
  (v) => {
    if (v) newName.value = displayName.value;
  }
);

async function onOk() {
  const n = (newName.value || "").trim();
  if (!n) {
    Message.warning("请输入新名称");
    return;
  }
  if (n.includes("/") || n.includes("\\")) {
    Message.warning("名称不能包含 /");
    return;
  }
  if (n === displayName.value) {
    Message.warning("名称未变更");
    return;
  }
  const toKey = `${props.prefix || ""}${n}${props.isFolder ? "/" : ""}`;
  if (toKey === props.objectKey) {
    emit("update:visible", false);
    return;
  }
  loading.value = true;
  try {
    await api.renameObject({
      bucket: props.bucket,
      fromKey: props.objectKey,
      toKey,
      ...(props.region ? { region: props.region } : {}),
    });
    Message.success("重命名成功");
    emit("update:visible", false);
    emit("done");
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "重命名失败");
  } finally {
    loading.value = false;
  }
}
</script>
