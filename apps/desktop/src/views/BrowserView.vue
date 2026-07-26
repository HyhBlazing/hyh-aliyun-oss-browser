<template>
  <div class="browser page">
    <header class="top bar card-panel">
      <div class="nav">
        <a-button size="small" @click="browser.goUp()">上级</a-button>
        <a-button size="small" @click="browser.refresh()">刷新</a-button>
        <a-button size="small" @click="browser.go('oss://')">首页</a-button>
      </div>
      <a-input
        v-model="addressInput"
        class="addr"
        allow-clear
        @press-enter="browser.go(addressInput)"
      />
      <div class="actions">
        <a-button size="small" @click="openSettings = true">设置</a-button>
        <a-button size="small" status="danger" @click="onLogout">退出</a-button>
      </div>
    </header>

    <section class="toolbar bar card-panel">
      <template v-if="!browser.bucket">
        <a-button type="primary" size="small" @click="showCreate = true"
          >新建 Bucket</a-button
        >
        <a-button
          size="small"
          status="danger"
          :disabled="!browser.selected.length"
          @click="deleteBuckets"
          >删除</a-button
        >
        <span class="muted count">共 {{ browser.buckets.length }} 个 Bucket</span>
      </template>
      <template v-else>
        <a-button type="primary" size="small" @click="pickUpload">上传</a-button>
        <a-button
          size="small"
          :disabled="!browser.selected.length"
          @click="pickDownload"
          >下载</a-button
        >
        <a-button
          size="small"
          status="danger"
          :disabled="!browser.selected.length"
          @click="deleteObjects"
          >删除</a-button
        >
        <span class="muted count">{{ browser.prefix || "/" }}</span>
      </template>
    </section>

    <main class="table-wrap card-panel">
      <a-spin :loading="browser.loading" style="width: 100%">
        <a-alert v-if="browser.error" type="error" style="margin-bottom: 12px">{{
          browser.error
        }}</a-alert>

        <a-table
          v-if="!browser.bucket"
          row-key="name"
          :data="browser.buckets"
          :pagination="false"
          :row-selection="rowSelection"
          @row-click="onBucketRow"
        >
          <a-table-column title="Bucket 名称" data-index="name" />
          <a-table-column title="区域" data-index="region" :width="180" />
          <a-table-column title="创建时间" data-index="creationDate" :width="220" />
        </a-table>

        <a-table
          v-else
          row-key="name"
          :data="browser.objects"
          :pagination="false"
          :row-selection="rowSelection"
          @row-click="onObjectRow"
        >
          <a-table-column title="名称">
            <template #cell="{ record }">
              <a v-if="record.isFolder" class="link" @click.stop="browser.enterFolder(record)">
                {{ displayName(record.name) }}
              </a>
              <span v-else>{{ displayName(record.name) }}</span>
            </template>
          </a-table-column>
          <a-table-column title="大小" :width="120">
            <template #cell="{ record }">
              {{ record.isFolder ? "-" : formatSize(record.size) }}
            </template>
          </a-table-column>
          <a-table-column title="修改时间" data-index="lastModified" :width="220" />
        </a-table>
      </a-spin>
    </main>

    <TransferDock />

    <a-modal v-model:visible="showCreate" title="新建 Bucket" @ok="createBucket">
      <a-form :model="createForm" layout="vertical">
        <a-form-item label="名称" required>
          <a-input v-model="createForm.name" />
        </a-form-item>
        <a-form-item label="Region">
          <a-input v-model="createForm.region" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:visible="openSettings" title="设置" :footer="false" width="560px">
      <SettingsPanel @saved="openSettings = false" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Message, Modal } from "@arco-design/web-vue";
import { open } from "@tauri-apps/plugin-dialog";
import { useAuthStore } from "../stores/auth";
import { useBrowserStore } from "../stores/browser";
import { useTransferStore } from "../stores/transfer";
import { api } from "../api/client";
import TransferDock from "../components/TransferDock.vue";
import SettingsPanel from "../components/SettingsPanel.vue";

const auth = useAuthStore();
const browser = useBrowserStore();
const transfer = useTransferStore();
const router = useRouter();

const addressInput = ref(browser.address);
const showCreate = ref(false);
const openSettings = ref(false);
const createForm = reactive({
  name: "",
  region: "oss-cn-hangzhou",
});

const rowSelection = {
  type: "checkbox" as const,
  showCheckedAll: true,
  onlyCurrent: false,
  selectedRowKeys: browser.selected,
  onChange: (keys: (string | number)[]) => {
    browser.selected = keys.map(String);
  },
};

watch(
  () => browser.address,
  (v) => {
    addressInput.value = v;
  }
);

onMounted(async () => {
  transfer.startListening();
  await browser.refresh();
});

function displayName(full: string) {
  const p = browser.prefix;
  let name = full;
  if (p && name.startsWith(p)) name = name.slice(p.length);
  return name.replace(/\/$/, "") || full;
}

function formatSize(n?: number) {
  if (!n && n !== 0) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function onBucketRow(record: any) {
  browser.enterBucket(record.name);
}

function onObjectRow(record: any) {
  if (record.isFolder) browser.enterFolder(record);
}

async function createBucket() {
  await api.createBucket({ ...createForm });
  Message.success("创建成功");
  showCreate.value = false;
  await browser.refresh();
}

async function deleteBuckets() {
  Modal.warning({
    title: "确认删除",
    content: `将删除 ${browser.selected.length} 个 Bucket`,
    hideCancel: false,
    onOk: async () => {
      for (const name of browser.selected) {
        await api.deleteBucket(name);
      }
      Message.success("已删除");
      await browser.refresh();
    },
  });
}

async function deleteObjects() {
  Modal.warning({
    title: "确认删除",
    content: `将删除 ${browser.selected.length} 个对象`,
    hideCancel: false,
    onOk: async () => {
      await api.deleteObjects({
        bucket: browser.bucket,
        keys: browser.selected,
      });
      Message.success("已删除");
      await browser.refresh();
    },
  });
}

async function pickUpload() {
  const selected = await open({
    multiple: true,
    directory: false,
  });
  const paths = Array.isArray(selected)
    ? selected
    : selected
      ? [selected]
      : [];
  if (!paths.length) return;
  await transfer.upload(browser.bucket, browser.prefix, paths as string[]);
  Message.success("已加入上传队列");
}

async function pickDownload() {
  const dir = await open({ directory: true, multiple: false });
  if (!dir || Array.isArray(dir)) return;
  await transfer.download(browser.bucket, browser.selected, dir);
  Message.success("已加入下载队列");
}

async function onLogout() {
  await auth.logout();
  router.push({ name: "login" });
}
</script>

<style scoped>
.browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  gap: 10px;
}
.bar {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  gap: 8px;
}
.nav,
.actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.addr {
  flex: 1;
}
.count {
  margin-left: 8px;
  font-size: 12px;
}
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}
.link {
  color: #007aff;
  cursor: pointer;
}
</style>
