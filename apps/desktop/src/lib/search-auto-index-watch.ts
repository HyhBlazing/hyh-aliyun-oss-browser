import { Message } from "@arco-design/web-vue";
import { api } from "../api/client";

const notifiedStart = new Set<string>();
const notifiedEnd = new Set<string>();

function reasonLabel(reason: unknown) {
  const r = String(reason || "");
  if (r === "daily") return "定时自动索引";
  if (r === "login") return "登录后自动索引";
  return "自动索引";
}

async function pollOnce() {
  try {
    const res = await api.listSearchIndexJobs();
    const job = res.data?.latest_auto as
      | {
          id?: string;
          status?: string;
          auto_reason?: string;
          error?: string;
          scanned?: number;
          upserted?: number;
        }
      | null
      | undefined;
    if (!job?.id) return;

    const id = String(job.id);
    const status = String(job.status || "");

    if (status === "running" && !notifiedStart.has(id)) {
      notifiedStart.add(id);
      Message.info({
        content: `${reasonLabel(job.auto_reason)}已开始，可在「全局搜索」中查看进度`,
        duration: 4000,
      });
    }

    if (
      (status === "done" || status === "failed" || status === "cancelled") &&
      notifiedStart.has(id) &&
      !notifiedEnd.has(id)
    ) {
      notifiedEnd.add(id);
      if (status === "done") {
        Message.success({
          content: `${reasonLabel(job.auto_reason)}已完成（扫描 ${Number(job.scanned) || 0}，写入 ${Number(job.upserted) || 0}）`,
          duration: 4500,
        });
      } else if (status === "failed") {
        Message.error({
          content: `${reasonLabel(job.auto_reason)}失败：${job.error || "未知错误"}`,
          duration: 5000,
        });
      } else {
        Message.info(`${reasonLabel(job.auto_reason)}已取消`);
      }
    }
  } catch {
    /* sidecar 未就绪时忽略 */
  }
}

/** 轮询自动索引任务并弹出提示；返回停止函数 */
export function startSearchAutoIndexWatch(intervalMs = 5000) {
  void pollOnce();
  const timer = window.setInterval(() => {
    void pollOnce();
  }, intervalMs);
  return () => {
    window.clearInterval(timer);
  };
}
