<template>
  <a-modal
    :visible="visible"
    title="解冻归档对象"
    :ok-loading="loading"
    unmount-on-close
    @ok="onOk"
    @cancel="emit('update:visible', false)"
    @update:visible="emit('update:visible', $event)"
  >
    <a-form :model="formStub" layout="vertical">
      <a-form-item label="对象">
        <div class="keys">
          <div v-for="k in keys" :key="k" class="key">{{ displayKey(k) }}</div>
        </div>
      </a-form-item>
      <a-form-item label="可读天数" required>
        <a-input-number v-model="days" :min="1" :max="7" style="width: 120px" />
        <p class="hint muted">归档类型对象解冻后可读，最长 7 天</p>
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
  keys: string[];
  prefix?: string;
  region?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
  (e: "done"): void;
}>();

const days = ref(1);
const loading = ref(false);
const formStub = {};

watch(
  () => props.visible,
  (v) => {
    if (v) days.value = 1;
  }
);

function displayKey(k: string) {
  const p = props.prefix || "";
  if (p && k.startsWith(p)) return k.slice(p.length);
  const parts = k.split("/");
  return parts[parts.length - 1] || k;
}

async function onOk() {
  if (!props.keys.length) {
    Message.warning("未选择对象");
    return;
  }
  loading.value = true;
  try {
    await api.restoreObjects({
      bucket: props.bucket,
      keys: props.keys,
      days: days.value,
      ...(props.region ? { region: props.region } : {}),
    });
    Message.success("解冻请求已提交");
    emit("update:visible", false);
    emit("done");
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "解冻失败");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.keys {
  max-height: 140px;
  overflow: auto;
  padding: 8px;
  background: #f5f5f7;
  border-radius: 8px;
  font-size: 12px;
}
.key + .key {
  margin-top: 4px;
}
.hint {
  margin: 6px 0 0;
  font-size: 12px;
}
.muted {
  color: #8e8e93;
}
</style>
