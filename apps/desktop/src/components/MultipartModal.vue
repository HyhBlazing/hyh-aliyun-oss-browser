<template>
  <a-modal
    :visible="visible"
    title="分片上传管理"
    :footer="false"
    width="720px"
    unmount-on-close
    @cancel="emit('update:visible', false)"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="head">
      <span class="muted">Bucket: {{ bucket }}</span>
      <a-space>
        <a-button size="small" :loading="loading" @click="load">刷新</a-button>
        <a-button
          size="small"
          type="primary"
          status="danger"
          :disabled="!selected.length"
          :loading="aborting"
          @click="abortSelected"
        >
          删除所选 ({{ selected.length }})
        </a-button>
      </a-space>
    </div>
    <a-spin :loading="loading" style="width: 100%">
      <a-empty v-if="!items.length && !loading" description="暂无未完成的分片上传" />
      <a-table
        v-else
        row-key="rowKey"
        size="small"
        :bordered="false"
        :columns="columns"
        :data="items"
        :pagination="false"
        :row-selection="rowSelection"
        v-model:selected-keys="selected"
        :scroll="{ y: 360 }"
        @selection-change="onSelectionChange"
      >
        <template #initiated="{ record }">
          {{ formatTime(record.initiated) }}
        </template>
      </a-table>
    </a-spin>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Message, Modal } from "@arco-design/web-vue";
import { api } from "../api/client";

type UploadItem = {
  rowKey: string;
  key: string;
  upload_id: string;
  initiated?: string;
  storage_class?: string;
};

const props = defineProps<{
  visible: boolean;
  bucket: string;
  region?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
}>();

const items = ref<UploadItem[]>([]);
const selected = ref<string[]>([]);
const loading = ref(false);
const aborting = ref(false);

const columns = [
  { title: "对象键", dataIndex: "key", ellipsis: true },
  { title: "UploadId", dataIndex: "upload_id", width: 220, ellipsis: true },
  { title: "发起时间", slotName: "initiated", width: 170 },
];

const rowSelection = {
  type: "checkbox" as const,
  showCheckedAll: true,
  width: 44,
};

function onSelectionChange(keys: (string | number)[]) {
  selected.value = keys.map(String);
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      selected.value = [];
      load();
    }
  }
);

function formatTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function load() {
  loading.value = true;
  try {
    const res = await api.listMultipart(props.bucket, {
      ...(props.region ? { region: props.region } : {}),
    });
    const list = ((res.data as { list?: Record<string, unknown>[] })?.list || []).map(
      (row, idx) => {
        const key = String(row.key ?? row.Key ?? "");
        const uploadId = String(row.upload_id ?? row.uploadId ?? row.UploadId ?? "");
        return {
          rowKey: `${key}::${uploadId || idx}`,
          key,
          upload_id: uploadId,
          initiated: String(row.initiated ?? row.Initiated ?? ""),
          storage_class: String(row.storage_class ?? row.storageClass ?? ""),
        };
      }
    );
    items.value = list;
    selected.value = [];
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "加载分片列表失败");
  } finally {
    loading.value = false;
  }
}

async function abortSelected() {
  if (!selected.value.length) return;
  const uploads = items.value
    .filter((i) => selected.value.includes(i.rowKey))
    .map((i) => ({ key: i.key, upload_id: i.upload_id }));
  Modal.warning({
    title: "确认删除",
    content: `将中止 ${uploads.length} 个未完成的分片上传`,
    hideCancel: false,
    onOk: async () => {
      aborting.value = true;
      try {
        await api.abortMultipart(props.bucket, {
          uploads,
          ...(props.region ? { region: props.region } : {}),
        });
        Message.success("已删除所选分片上传");
        await load();
      } catch (e) {
        Message.error(e instanceof Error ? e.message : "删除失败");
      } finally {
        aborting.value = false;
      }
    },
  });
}
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.muted {
  color: #8e8e93;
  font-size: 13px;
}
</style>
