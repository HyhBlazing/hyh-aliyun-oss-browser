<template>
  <div class="settings">
    <a-form :model="form" layout="vertical">
      <a-row :gutter="12">
        <a-col :span="12">
          <a-form-item label="最大上传任务数">
            <a-input-number v-model="form.maxUploadJobCount" :min="1" :max="50" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="最大下载任务数">
            <a-input-number v-model="form.maxDownloadJobCount" :min="1" :max="50" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="超时时间 (ms)">
            <a-input-number v-model="form.connectTimeout" :min="1000" :step="1000" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="分片大小 (MB)">
            <a-input-number v-model="form.uploadPartSize" :min="1" :max="100" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="列举 Object 最大数量">
            <a-input-number v-model="form.listObjectNum" :min="30" :max="1000" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="私有云允许不安全 TLS">
            <a-switch v-model="form.allowInsecureTls" />
          </a-form-item>
        </a-col>
      </a-row>
      <a-button type="primary" :loading="saving" @click="onSave">保存</a-button>
    </a-form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { Message } from "@arco-design/web-vue";
import { useSettingsStore } from "../stores/settings";

const emit = defineEmits<{ saved: [] }>();
const settings = useSettingsStore();
const saving = ref(false);
const form = reactive({
  maxUploadJobCount: 3,
  maxDownloadJobCount: 1,
  connectTimeout: 60000,
  uploadPartSize: 10,
  listObjectNum: 500,
  allowInsecureTls: false,
});

onMounted(async () => {
  await settings.load();
  Object.assign(form, settings.values);
});

async function onSave() {
  saving.value = true;
  try {
    await settings.save({ ...form });
    Message.success("已保存设置");
    emit("saved");
  } finally {
    saving.value = false;
  }
}
</script>
