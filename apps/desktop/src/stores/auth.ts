import { defineStore } from "pinia";
import { ref } from "vue";
import { api, configureApi, setRestoreAuthHandler } from "../api/client";
import {
  addToHistories,
  clearSecureSession,
  ensureSidecarStarted,
  loadRememberForm,
  loadSecureSession,
  loadSidecarMeta,
  saveRememberForm,
  saveSecureSession,
  type AuthHistoryItem,
} from "../lib/tauri";

export type SessionInfo = {
  id: string;
  region: string;
  eptpl: string;
  eptplcname?: string;
  cname: boolean;
  osspath: string;
  privilege: string;
  hasSecret: boolean;
  hasStoken: boolean;
  isRequestPay?: boolean;
};

type Credentials = Record<string, unknown>;

const LS_REMEMBER_FLAG = "hyh-oss-remember-flag";
const LS_KEEP_LOGGED_IN = "hyh-oss-keep-logged-in";
const SS_CREDENTIALS = "hyh-oss-runtime-credentials";

export function getRememberFlag() {
  return localStorage.getItem(LS_REMEMBER_FLAG) !== "NO";
}

export function setRememberFlag(v: boolean) {
  localStorage.setItem(LS_REMEMBER_FLAG, v ? "YES" : "NO");
}

export function getKeepLoggedInFlag() {
  return localStorage.getItem(LS_KEEP_LOGGED_IN) !== "NO";
}

export function setKeepLoggedInFlag(v: boolean) {
  localStorage.setItem(LS_KEEP_LOGGED_IN, v ? "YES" : "NO");
}

function readRuntimeCredentials(): Credentials | null {
  try {
    const raw = sessionStorage.getItem(SS_CREDENTIALS);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Credentials;
    if (obj?.id && obj?.secret) return obj;
  } catch {
    /* ignore */
  }
  return null;
}

function writeRuntimeCredentials(creds: Credentials | null) {
  if (!creds) {
    sessionStorage.removeItem(SS_CREDENTIALS);
    return;
  }
  sessionStorage.setItem(SS_CREDENTIALS, JSON.stringify(creds));
}

export const useAuthStore = defineStore("auth", () => {
  const ready = ref(false);
  const session = ref<SessionInfo | null>(null);
  const sidecarOnline = ref(false);
  const credentials = ref<Credentials | null>(readRuntimeCredentials());
  let restoring = false;

  setRestoreAuthHandler(() => restoreSidecarSession());

  async function connectSidecar() {
    // Tauri 桌面壳应自动拉起内置 / 开发 sidecar，避免依赖手动 npm run sidecar
    const ensured = await ensureSidecarStarted();
    const meta = ensured || (await loadSidecarMeta());
    if (meta?.port) {
      configureApi(
        `http://${meta.host || "127.0.0.1"}:${meta.port}`,
        meta.token,
      );
    }
    await api.health();
    sidecarOnline.value = true;
  }

  async function resolveCredentials(): Promise<Credentials | null> {
    if (credentials.value?.id && credentials.value?.secret) {
      return credentials.value;
    }
    const runtime = readRuntimeCredentials();
    if (runtime) {
      credentials.value = runtime;
      return runtime;
    }
    // 仅「保持登录」可静默恢复；「记住密码」只用于登录页回填，不自动登录
    if (getKeepLoggedInFlag()) {
      const saved = await loadSecureSession();
      if (saved?.id && saved?.secret) {
        credentials.value = saved;
        writeRuntimeCredentials(saved);
        return saved;
      }
    }
    return null;
  }

  /** sidecar 会话丢失时静默重登（不跳转登录页） */
  async function restoreSidecarSession(): Promise<boolean> {
    if (restoring) return false;
    restoring = true;
    try {
      await connectSidecar();
      const creds = await resolveCredentials();
      if (!creds?.id || !creds?.secret) return false;
      const res = await api.login(creds);
      session.value = (res.data as { auth: SessionInfo }).auth;
      return true;
    } catch {
      sidecarOnline.value = false;
      return false;
    } finally {
      restoring = false;
    }
  }

  async function bootstrap() {
    try {
      await connectSidecar();
      const health = await api.health();
      const loggedIn = !!(health.data as { loggedIn?: boolean } | undefined)
        ?.loggedIn;

      if (loggedIn) {
        const creds = await resolveCredentials();
        if (creds?.id && creds?.secret) {
          try {
            const cur = await api.session();
            if (cur.data) {
              session.value = cur.data as SessionInfo;
              ready.value = true;
              return;
            }
          } catch {
            /* fall through to restore */
          }
        } else {
          // 本地已退出，但 sidecar 仍有会话 → 清掉残留，避免「退不出去」
          try {
            await api.logout();
          } catch {
            /* ignore */
          }
          session.value = null;
          ready.value = true;
          return;
        }
      }

      const ok = await restoreSidecarSession();
      if (!ok && !session.value) {
        session.value = null;
      }
    } catch {
      sidecarOnline.value = false;
      if (!credentials.value && !readRuntimeCredentials()) {
        session.value = null;
      }
    } finally {
      ready.value = true;
    }
  }

  async function login(
    form: Record<string, unknown>,
    opts: { remember: boolean; keepLoggedIn: boolean },
  ) {
    const payload = { ...form };
    if (typeof payload.secret === "string") {
      payload.secret = payload.secret.trim();
    }
    if (
      typeof payload.osspath === "string" &&
      payload.osspath &&
      !payload.osspath.endsWith("/")
    ) {
      payload.osspath = `${payload.osspath}/`;
    }
    if (typeof payload.id === "string" && !payload.id.startsWith("STS.")) {
      delete payload.stoken;
    }

    await connectSidecar();
    const res = await api.login(payload);
    session.value = (res.data as { auth: SessionInfo }).auth;
    credentials.value = payload;
    writeRuntimeCredentials(payload);

    setRememberFlag(opts.remember);
    setKeepLoggedInFlag(opts.keepLoggedIn);

    if (opts.remember) {
      saveRememberForm(payload);
      addToHistories(payload as AuthHistoryItem);
    } else {
      saveRememberForm(null);
    }

    if (opts.keepLoggedIn) {
      await saveSecureSession(payload);
    } else {
      await clearSecureSession();
    }
  }

  async function logout() {
    // 先清本地凭证，避免 logout 请求触发「静默重登」又登回去
    session.value = null;
    credentials.value = null;
    writeRuntimeCredentials(null);
    setKeepLoggedInFlag(false);
    try {
      sessionStorage.removeItem("hyh-oss-last-address");
    } catch {
      /* ignore */
    }
    try {
      await clearSecureSession();
    } catch {
      /* ignore */
    }
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
  }

  function applyRememberedForm() {
    return loadRememberForm();
  }

  return {
    ready,
    session,
    sidecarOnline,
    bootstrap,
    login,
    logout,
    applyRememberedForm,
    restoreSidecarSession,
  };
});
