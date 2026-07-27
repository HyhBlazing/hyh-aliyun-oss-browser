<template>
  <a-modal
    :visible="visible"
    title="AK 历史"
    width="720px"
    :footer="false"
    unmount-on-close
    @update:visible="emit('update:visible', $event)"
    @cancel="emit('update:visible', false)"
  >
    <div class="toolbar">
      <p class="hint muted">点击行或「使用」可回填到登录表单，支持多组 AccessKey，数量不限。</p>
      <a-button
        size="small"
        status="danger"
        :disabled="!histories.length"
        @click="onClean"
      >
        清空历史
      </a-button>
    </div>

    <a-empty v-if="!histories.length" description="暂无历史记录" />

    <a-table
      v-else
      row-key="id"
      :columns="columns"
      :data="histories"
      :pagination="tablePagination"
      :scroll="{ y: 360 }"
      @row-click="onUse"
    >
      <template #secret="{ record }">
        <span class="mono">{{ hideSecret(record.secret) }}</span>
      </template>
      <template #desc="{ record }">
        <a-input
          v-model="record.desc"
          size="small"
          maxlength="30"
          placeholder="备注"
          @click.stop
          @blur="onSaveDesc(record)"
        />
      </template>
      <template #actions="{ record }">
        <a-space>
          <a-button size="mini" type="primary" @click.stop="onUse(record)">使用</a-button>
          <a-button size="mini" status="danger" @click.stop="onRemove(record)">删除</a-button>
        </a-space>
      </template>
    </a-table>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Message, Modal } from "@arco-design/web-vue";
import {
  cleanHistories,
  listHistories,
  removeFromHistories,
  updateHistory,
  type AuthHistoryItem,
} from "../lib/tauri";

const PAGE_SIZE = 10;

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
  (e: "select", item: AuthHistoryItem): void;
}>();

const histories = ref<AuthHistoryItem[]>([]);
const currentPage = ref(1);

const tablePagination = computed(() => {
  if (histories.value.length <= PAGE_SIZE) return false;
  return {
    current: currentPage.value,
    pageSize: PAGE_SIZE,
    total: histories.value.length,
    showTotal: true,
    showPageSize: false,
    onChange: (page: number) => {
      currentPage.value = page;
    },
  };
});

const columns = [
  {
    title: "#",
    width: 50,
    render: ({ rowIndex }: { rowIndex: number }) =>
      String((currentPage.value - 1) * PAGE_SIZE + rowIndex + 1),
  },
  { title: "ID", dataIndex: "id", ellipsis: true, tooltip: true },
  { title: "Secret", slotName: "secret", width: 140 },
  { title: "备注", slotName: "desc", width: 160 },
  { title: "操作", slotName: "actions", width: 140 },
];

function reload() {
  histories.value = listHistories().map((h) => ({ ...h, desc: h.desc || "" }));
  const maxPage = Math.max(1, Math.ceil(histories.value.length / PAGE_SIZE) || 1);
  if (currentPage.value > maxPage) currentPage.value = maxPage;
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      currentPage.value = 1;
      reload();
    }
  },
  { immediate: true }
);

function hideSecret(secret?: string) {
  if (!secret) return "";
  if (secret.length <= 6) return "******";
  return `${secret.slice(0, 3)}******${secret.slice(-3)}`;
}

function onUse(item: AuthHistoryItem) {
  emit("select", item);
  emit("update:visible", false);
}

function onSaveDesc(item: AuthHistoryItem) {
  const desc = (item.desc || "").trim();
  item.desc = desc;
  updateHistory(item.id, { desc });
  Message.success("备注已保存");
}

function onRemove(item: AuthHistoryItem) {
  Modal.warning({
    title: "删除 AccessKey",
    content: `确认删除 ${item.id}？`,
    hideCancel: false,
    onOk: () => {
      removeFromHistories(item.id);
      reload();
    },
  });
}

function onClean() {
  Modal.warning({
    title: "清空历史",
    content: "确认清空全部 AK 历史？此操作不可恢复。",
    hideCancel: false,
    onOk: () => {
      cleanHistories();
      reload();
      Message.success("已清空");
    },
  });
}
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}
.hint {
  margin: 0;
  font-size: 13px;
  max-width: 520px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.muted {
  color: #667085;
}
</style>
