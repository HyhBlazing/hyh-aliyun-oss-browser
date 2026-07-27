<template>
  <div class="login-page page">
    <div class="login-card card-panel">
      <div class="brand">
        <img class="brand-logo" src="/logo.png" alt="" width="56" height="56" />
        <h1>hyh-aliyun-oss-browser</h1>
      </div>

      <a-alert v-if="!auth.sidecarOnline" type="warning" style="margin: 12px 0">
        传输服务未连接。请先启动 sidecar（开发：npm run sidecar）。
      </a-alert>

      <a-tabs v-model:active-key="loginTab" type="rounded">
        <a-tab-pane key="ak" title="AccessKey 登录">
          <a-form :model="form" layout="vertical" @submit-success="onSubmitAk">
            <a-form-item field="id" label="AccessKeyId" required>
              <a-input v-model="form.id" allow-clear placeholder="请输入 AccessKeyId" />
            </a-form-item>
            <a-form-item field="secret" label="AccessKeySecret" required>
              <a-input-password v-model="form.secret" allow-clear placeholder="请输入 AccessKeySecret" />
            </a-form-item>
            <a-form-item field="desc" label="备注（可选）">
              <a-input v-model="form.desc" allow-clear maxlength="30" placeholder="便于区分多组 Key" />
            </a-form-item>

            <a-form-item>
              <div class="flags">
                <a-checkbox v-model="remember">记住秘钥</a-checkbox>
                <a-checkbox v-model="keepLoggedIn">保持登录</a-checkbox>
                <a-button type="text" size="small" @click="showHistory = true">
                  AK 历史
                </a-button>
              </div>
            </a-form-item>

            <a-button type="primary" html-type="submit" long :loading="loading">
              登录
            </a-button>
          </a-form>
        </a-tab-pane>

        <a-tab-pane key="token" title="Auth Token 登录">
          <a-form :model="tokenForm" layout="vertical" @submit-success="onSubmitToken">
            <a-form-item label="Auth Token (Base64)" required>
              <a-textarea v-model="authToken" :auto-size="{ minRows: 4, maxRows: 8 }" placeholder="粘贴 Base64 编码的登录令牌" @input="onAuthTokenChange" />
            </a-form-item>
            <div v-if="authTokenInfo" class="token-info">
              <p><span class="label">AccessKeyId</span>{{ authTokenInfo.id }}</p>
              <p v-if="authTokenInfo.osspath">
                <span class="label">OSS 路径</span>{{ authTokenInfo.osspath }}
              </p>
              <p v-if="authTokenInfo.privilege">
                <span class="label">权限</span>{{ authTokenInfo.privilege }}
              </p>
              <p v-if="authTokenInfo.expiration">
                <span class="label">过期时间</span>{{ authTokenInfo.expirationStr }}
              </p>
              <a-alert v-if="authTokenInfo.isExpired" type="error" style="margin-top: 8px">
                令牌已过期
              </a-alert>
            </div>
            <a-button type="primary" html-type="submit" long :loading="loading" :disabled="!authTokenInfo || authTokenInfo.isExpired">
              使用令牌登录
            </a-button>
          </a-form>
        </a-tab-pane>
      </a-tabs>

      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <div class="login-foot">
      <span class="foot-left">非官方定制版 3.x · Tauri + Vue3</span>
      <a class="foot-right" href="https://github.com/HyhBlazing" target="_blank" rel="noopener noreferrer" @click.prevent="openGithub">
        HyhBlazing
      </a>
    </div>

    <AkHistoryModal v-model:visible="showHistory" @select="onSelectHistory" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Message } from "@arco-design/web-vue";
import {
  getKeepLoggedInFlag,
  getRememberFlag,
  setKeepLoggedInFlag,
  setRememberFlag,
  useAuthStore,
} from "../stores/auth";
import {
  ensureSidecarStarted,
  saveRememberForm,
  type AuthHistoryItem,
} from "../lib/tauri";
import { isTauri } from "../lib/local-fs";
import AkHistoryModal from "../components/AkHistoryModal.vue";

const LS_AUTH_TOKEN = "hyh-oss-auth-token";
const LS_LOGIN_TAB = "hyh-oss-login-tab";
const GITHUB_URL = "https://github.com/HyhBlazing";

type AuthTokenInfo = {
  id: string;
  secret: string;
  stoken?: string;
  privilege?: string;
  expiration?: string;
  expirationStr?: string;
  osspath?: string;
  region?: string;
  eptpl?: string;
  isExpired?: boolean;
  requestpaystatus?: string;
  [key: string]: unknown;
};

const auth = useAuthStore();
const router = useRouter();
const loading = ref(false);
const error = ref("");
const remember = ref(getRememberFlag());
const keepLoggedIn = ref(getKeepLoggedInFlag());
const showHistory = ref(false);
const loginTab = ref(localStorage.getItem(LS_LOGIN_TAB) || "ak");
const authToken = ref("");
const authTokenInfo = ref<AuthTokenInfo | null>(null);
const tokenForm = reactive({});

const form = reactive({
  id: "",
  secret: "",
  stoken: "",
  region: "oss-cn-hangzhou",
  eptpl: "https://{region}.aliyuncs.com",
  osspath: "",
  desc: "",
});

watch(remember, (v) => {
  setRememberFlag(v);
  if (!v) saveRememberForm(null);
});

watch(keepLoggedIn, (v) => {
  setKeepLoggedInFlag(v);
});

watch(loginTab, (v) => {
  localStorage.setItem(LS_LOGIN_TAB, v);
});

onMounted(async () => {
  await ensureSidecarStarted();
  await auth.bootstrap();
  if (auth.session) {
    router.replace({ name: "browser" });
    return;
  }
  authToken.value = localStorage.getItem(LS_AUTH_TOKEN) || "";
  onAuthTokenChange();
  const remembered = auth.applyRememberedForm();
  if (remembered && getRememberFlag()) {
    Object.assign(form, {
      id: remembered.id || "",
      secret: remembered.secret || "",
      stoken: remembered.stoken || "",
      region: remembered.region || "oss-cn-hangzhou",
      eptpl: remembered.eptpl || "https://{region}.aliyuncs.com",
      osspath: remembered.osspath || "",
      desc: remembered.desc || "",
    });
  }
});

function formatExpiration(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function decodeAuthToken(raw: string): AuthTokenInfo | null {
  const token = (raw || "").trim();
  if (!token) return null;
  try {
    const str = atob(token);
    const info = JSON.parse(str) as AuthTokenInfo;
    if (
      info.id &&
      info.secret &&
      info.stoken &&
      info.privilege &&
      info.expiration &&
      info.osspath
    ) {
      try {
        info.isExpired = new Date(info.expiration).getTime() <= Date.now();
      } catch {
        /* ignore */
      }
      info.expirationStr = formatExpiration(info.expiration);
      return info;
    }
    if (info.id && info.secret && !info.id.startsWith("STS.")) {
      return info;
    }
    if (info.expiration && new Date(info.expiration).getTime() < Date.now()) {
      return null;
    }
    return info.id && info.secret ? info : null;
  } catch {
    return null;
  }
}

function onAuthTokenChange() {
  localStorage.setItem(LS_AUTH_TOKEN, authToken.value || "");
  authTokenInfo.value = decodeAuthToken(authToken.value);
}

function onSelectHistory(item: AuthHistoryItem) {
  Object.assign(form, {
    id: item.id || "",
    secret: item.secret || "",
    stoken: item.stoken || "",
    region: item.region || "oss-cn-hangzhou",
    eptpl: item.eptpl || "https://{region}.aliyuncs.com",
    osspath: item.osspath || "",
    desc: item.desc || "",
  });
  Message.success("已回填所选 AccessKey");
}

function buildAkPayload() {
  const payload: Record<string, unknown> = {
    ...form,
    requestpaystatus: "NO",
  };
  if (typeof payload.id === "string" && !payload.id.startsWith("STS.")) {
    delete payload.stoken;
  }
  return payload;
}

async function openGithub() {
  if (isTauri()) {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(GITHUB_URL);
      return;
    } catch {
      /* fall through */
    }
  }
  window.open(GITHUB_URL, "_blank", "noopener,noreferrer");
}

async function onSubmitAk() {
  loading.value = true;
  error.value = "";
  try {
    await auth.login(buildAkPayload(), {
      remember: remember.value,
      keepLoggedIn: keepLoggedIn.value,
    });
    Message.success("登录成功");
    router.push({ name: "browser" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "登录失败";
  } finally {
    loading.value = false;
  }
}

async function onSubmitToken() {
  if (!authTokenInfo.value || authTokenInfo.value.isExpired) {
    error.value = "令牌无效或已过期";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const payload = { ...authTokenInfo.value };
    delete payload.isExpired;
    delete payload.expirationStr;
    await auth.login(payload, {
      remember: remember.value,
      keepLoggedIn: keepLoggedIn.value,
    });
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
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.login-card {
  width: 480px;
  padding: 28px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.brand-logo {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
}

.login-card h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  word-break: break-all;
}

.flags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.flags>* {
  margin-right: 12px;
}

.token-info {
  margin-bottom: 16px;
  padding: 12px;
  background: #f5f5f7;
  border-radius: 8px;
  font-size: 13px;
}

.token-info p {
  margin: 0 0 6px;
}

.token-info .label {
  display: inline-block;
  width: 88px;
  color: #8e8e93;
}

.error {
  color: #d4380d;
  margin-top: 12px;
}

.login-foot {
  position: absolute;
  left: 24px;
  right: 24px;
  bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  pointer-events: none;
}

.foot-left,
.foot-right {
  font-size: 12px;
  color: #8e8e93;
  line-height: 1.4;
}

.foot-right {
  pointer-events: auto;
  text-decoration: none;
}

.foot-right:hover {
  color: #667085;
}
</style>
