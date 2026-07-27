<template>
  <a-modal
    :visible="visible"
    title="创建软链接"
    :ok-loading="loading"
    unmount-on-close
    @ok="onOk"
    @cancel="emit('update:visible', false)"
    @update:visible="emit('update:visible', $event)"
  >
    <a-form :model="formStub" layout="vertical">
      <a-form-item label="链接对象键" required>
        <a-input v-model="linkName" placeholder="新软链接的完整对象键" allow-clear />
        <p class="hint muted">不含首尾 /，长度 1-254 字符</p>
      </a-form-item>
      <a-form-item label="目标对象键" required>
        <a-input v-model="targetKey" placeholder="指向的目标对象键" allow-clear />
      </a-form-item>
    </a-form>
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
  defaultTarget?: string;
  defaultLink?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
  (e: "done"): void;
}>();

const linkName = ref("");
const targetKey = ref("");
const loading = ref(false);
const formStub = {};

watch(
  () => props.visible,
  (v) => {
    if (v) {
      linkName.value = props.defaultLink || "";
      targetKey.value = props.defaultTarget || "";
    }
  }
);

function validateName(value: string) {
  const v = (value || "").trim();
  if (!v) return "请填写链接对象键";
  if (v.startsWith("/") || v.endsWith("/")) return "链接键不能以 / 开头或结尾";
  if (v.includes("//")) return "链接键不能包含连续 /";
  if (v.includes("..")) return "链接键不能包含 ..";
  if (v.length > 254) return "链接键长度不能超过 254";
  return "";
}

async function onOk() {
  const link = (linkName.value || "").trim();
  const target = (targetKey.value || "").trim();
  const err = validateName(link);
  if (err) {
    Message.warning(err);
    return;
  }
  if (!target) {
    Message.warning("请填写目标对象键");
    return;
  }
  loading.value = true;
  try {
    await api.putSymlink({
      bucket: props.bucket,
      link: link,
      target: target,
      ...(props.region ? { region: props.region } : {}),
    });
    Message.success("软链接已创建");
    emit("update:visible", false);
    emit("done");
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "创建软链接失败");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.hint {
  margin: 6px 0 0;
  font-size: 12px;
}
.muted {
  color: #8e8e93;
}
</style>
