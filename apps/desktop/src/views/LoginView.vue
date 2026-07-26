<template>
  <div class="login-page page">
    <div class="login-card card-panel">
      <h1>OSS Browser</h1>
      <p class="muted">非官方定制版 3.x · Tauri + Vue3</p>

      <a-alert
        v-if="!auth.sidecarOnline"
        type="warning"
        style="margin: 12px 0"
      >
        传输服务未连接。请先启动 sidecar（开发：npm run sidecar）。
      </a-alert>

      <a-form :model="form" layout="vertical" @submit-success="onSubmit">
        <a-form-item field="id" label="AccessKeyId" required>
          <a-input v-model="form.id" allow-clear />
        </a-form-item>
        <a-form-item field="secret" label="AccessKeySecret" required>
          <a-input-password v-model="form.secret" allow-clear />
        </a-form-item>
        <a-form-item field="stoken" label="STS Token（可选）">
          <a-input v-model="form.stoken" allow-clear />
        </a-form-item>
        <a-form-item field="region" label="Region">
          <a-input v-model="form.region" placeholder="oss-cn-hangzhou" />
        </a-form-item>
        <a-form-item field="eptpl" label="Endpoint 模板">
          <a-input v-model="form.eptpl" />
        </a-form-item>
        <a-form-item field="osspath" label="预设 OSS 路径（可选）">
          <a-input v-model="form.osspath" placeholder="oss://bucket/prefix/" />
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model="form.cname">CNAME</a-checkbox>
          <a-checkbox v-model="remember" style="margin-left: 16px"
            >记住登录</a-checkbox
          >
        </a-form-item>
        <a-button type="primary" html-type="submit" long :loading="loading">
          登录
        </a-button>
      </a-form>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { Message } from "@arco-design/web-vue";
import { useAuthStore } from "../stores/auth";
import { ensureSidecarStarted } from "../lib/tauri";

const auth = useAuthStore();
const router = useRouter();
const loading = ref(false);
const error = ref("");
const remember = ref(true);
const form = reactive({
  id: "",
  secret: "",
  stoken: "",
  region: "oss-cn-hangzhou",
  eptpl: "https://oss-{region}.aliyuncs.com",
  osspath: "",
  cname: false,
});

ensureSidecarStarted().then(() => auth.bootstrap());

async function onSubmit() {
  loading.value = true;
  error.value = "";
  try {
    await auth.login({ ...form }, remember.value);
    Message.success("登录成功");
    router.push({ name: "browser" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "登录失败";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}
.login-card {
  width: 440px;
  padding: 28px;
}
.login-card h1 {
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 600;
}
.error {
  color: #d4380d;
  margin-top: 12px;
}
</style>
