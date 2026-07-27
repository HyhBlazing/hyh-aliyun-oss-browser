<template>
  <a-modal
    :visible="visible"
    :title="isCopy ? '复制到' : '移动到'"
    unmount-on-close
    @ok="onOk"
    @cancel="emit('update:visible', false)"
    @update:visible="emit('update:visible', $event)"
  >
    <a-form :model="{}" layout="vertical">
      <a-form-item :label="isCopy ? '复制' : '移动'">
        <div class="keys">
          <div v-for="k in keys" :key="k" class="key">{{ k }}</div>
        </div>
      </a-form-item>
      <a-form-item label="目标路径" required>
        <a-input
          v-model="target"
          placeholder="oss://bucket/prefix/ 或相对目录 prefix/"
          allow-clear
        />
        <p class="hint muted">
          填写完整 oss 路径，或仅填写目录前缀（默认当前 Bucket）。目录请以 / 结尾。确认后将后台执行，可继续其它操作。
        </p>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Message } from "@arco-design/web-vue";
import { useTransferStore } from "../stores/transfer";

const props = defineProps<{
  visible: boolean;
  isCopy: boolean;
  bucket: string;
  region?: string;
  fromPrefix?: string;
  keys: string[];
}>();

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
  (e: "done"): void;
}>();

const transfer = useTransferStore();
const target = ref("");

watch(
  () => props.visible,
  (v) => {
    if (v) {
      target.value = props.fromPrefix
        ? `oss://${props.bucket}/${props.fromPrefix}`
        : `oss://${props.bucket}/`;
    }
  }
);

function parseTarget(raw: string) {
  let t = (raw || "").trim();
  if (!t) return null;
  if (!t.startsWith("oss://")) {
    const prefix = t.replace(/^\/+/, "");
    return {
      toBucket: props.bucket,
      toPrefix: prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix,
    };
  }
  const rest = t.slice(6);
  const i = rest.indexOf("/");
  if (i < 0) {
    return { toBucket: rest, toPrefix: "" };
  }
  const toBucket = rest.slice(0, i);
  let toPrefix = rest.slice(i + 1);
  if (toPrefix && !toPrefix.endsWith("/")) toPrefix += "/";
  return { toBucket, toPrefix };
}

function onOk() {
  const parsed = parseTarget(target.value);
  if (!parsed?.toBucket) {
    Message.warning("请填写目标路径");
    return;
  }
  if (!props.keys.length) {
    Message.warning("未选择对象");
    return;
  }
  const action = props.isCopy ? "复制" : "移动";
  const payload = {
    bucket: props.bucket,
    keys: [...props.keys],
    toBucket: parsed.toBucket,
    toPrefix: parsed.toPrefix,
    fromPrefix: props.fromPrefix || "",
    region: props.region,
    toRegion: props.region,
    isCopy: props.isCopy,
  };
  // 先关弹窗，后台入队，避免遮罩挡住后续操作
  emit("update:visible", false);
  void (async () => {
    try {
      await transfer.moveCopy(payload);
      Message.success(`已加入${action}队列，可在传输列表查看进度`);
      emit("done");
    } catch (e) {
      Message.error(e instanceof Error ? e.message : "操作失败");
    }
  })();
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
