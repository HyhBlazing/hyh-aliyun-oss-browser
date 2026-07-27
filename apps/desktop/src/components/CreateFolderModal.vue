<template>
  <a-modal
    :visible="visible"
    title="新建文件夹"
    :ok-loading="loading"
    unmount-on-close
    @ok="onOk"
    @cancel="emit('update:visible', false)"
    @update:visible="emit('update:visible', $event)"
  >
    <a-form :model="formStub" layout="vertical">
      <a-form-item label="文件夹名称" required>
        <div class="field">
          <a-input
            v-model="name"
            placeholder="不含 / 的目录名"
            allow-clear
            @press-enter="onOk"
          />
          <p class="hint muted">将创建为 {{ previewPath }}</p>
        </div>
      </a-form-item>
    </a-form>
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
}>();

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
  (e: "done"): void;
}>();

const name = ref("");
const loading = ref(false);
const formStub = {};

const previewPath = computed(() => {
  const base = props.prefix || "";
  const n = (name.value || "").trim();
  return n ? `${base}${n}/` : `${base}<名称>/`;
});

watch(
  () => props.visible,
  (v) => {
    if (v) name.value = "";
  }
);

async function onOk() {
  const n = (name.value || "").trim();
  if (!n) {
    Message.warning("请输入文件夹名称");
    return;
  }
  if (n.includes("/") || n.includes("\\")) {
    Message.warning("文件夹名称不能包含 /");
    return;
  }
  loading.value = true;
  try {
    await api.createFolder({
      bucket: props.bucket,
      prefix: `${props.prefix || ""}${n}/`,
      ...(props.region ? { region: props.region } : {}),
    });
    Message.success("文件夹已创建");
    emit("update:visible", false);
    emit("done");
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "创建失败");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.field {
  width: 100%;
}
.hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.4;
  word-break: break-all;
}
.muted {
  color: #8e8e93;
}
</style>
