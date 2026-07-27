import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
    },
    {
      path: "/",
      name: "browser",
      component: () => import("../views/BrowserView.vue"),
      meta: { auth: true },
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.ready) {
    await auth.bootstrap();
  }
  if (to.meta.auth && !auth.session) {
    // 仅在开启「保持登录」时尝试静默恢复
    const ok = await auth.restoreSidecarSession();
    if (!ok) return { name: "login" };
  }
  if (to.name === "login" && auth.session) {
    return { name: "browser" };
  }
  return true;
});

export default router;
