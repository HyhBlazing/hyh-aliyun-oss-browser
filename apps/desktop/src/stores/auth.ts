import { defineStore } from "pinia";
import { ref } from "vue";
import { api, configureApi } from "../api/client";
import { loadSidecarMeta, loadSecureSession, saveSecureSession, clearSecureSession } from "../lib/tauri";

export type SessionInfo = {
  id: string;
  region: string;
  eptpl: string;
  cname: boolean;
  osspath: string;
  privilege: string;
  hasSecret: boolean;
  hasStoken: boolean;
};

export const useAuthStore = defineStore("auth", () => {
  const ready = ref(false);
  const session = ref<SessionInfo | null>(null);
  const sidecarOnline = ref(false);

  async function bootstrap() {
    try {
      const meta = await loadSidecarMeta();
      if (meta?.port) {
        configureApi(`http://${meta.host || "127.0.0.1"}:${meta.port}`, meta.token);
      }
      await api.health();
      sidecarOnline.value = true;
      const saved = await loadSecureSession();
      if (saved?.id && saved?.secret) {
        const res = await api.login(saved);
        session.value = (res.data as { auth: SessionInfo }).auth;
      }
    } catch {
      sidecarOnline.value = false;
      session.value = null;
    } finally {
      ready.value = true;
    }
  }

  async function login(form: Record<string, unknown>, remember: boolean) {
    const res = await api.login(form);
    session.value = (res.data as { auth: SessionInfo }).auth;
    if (remember) {
      await saveSecureSession(form);
    } else {
      await clearSecureSession();
    }
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    session.value = null;
    await clearSecureSession();
  }

  return { ready, session, sidecarOnline, bootstrap, login, logout };
});
