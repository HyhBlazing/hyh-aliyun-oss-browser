import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, openTransferEvents } from "../api/client";

export type TransferJobType = "upload" | "download" | "move" | "copy";

export type TransferJob = {
  id: string;
  type: TransferJobType;
  status: string;
  progress: number;
  bucket: string;
  key: string;
  localPath: string;
  size: number;
  speed?: number;
  error?: string;
  removed?: boolean;
};

export type TransferPanelType = "upload" | "download" | "move";

type JobFinishListener = (job: TransferJob) => void;

function isMovePanelJob(type: string) {
  return type === "move" || type === "copy";
}

/** 传输已完成（含完整性校验中），用于完成数统计与列表刷新 */
function isTransferCompleteStatus(status?: string) {
  return status === "finished" || status === "verifying";
}

export const useTransferStore = defineStore("transfer", () => {
  const jobs = ref<TransferJob[]>([]);
  const visible = ref(false);
  const panelType = ref<TransferPanelType>("upload");
  /** 已删除 id，防止 SSE progress 回灌 */
  const suppressedIds = new Set<string>();
  const finishListeners = new Set<JobFinishListener>();
  let stopEvents: null | (() => void) = null;
  let syncTimer: ReturnType<typeof setInterval> | null = null;

  const totals = computed(() => {
    const uploads = jobs.value.filter((j) => j.type === "upload");
    const downloads = jobs.value.filter((j) => j.type === "download");
    const moves = jobs.value.filter((j) => isMovePanelJob(j.type));
    return {
      upDone: uploads.filter((j) => isTransferCompleteStatus(j.status)).length,
      upTotal: uploads.length,
      downDone: downloads.filter((j) => isTransferCompleteStatus(j.status)).length,
      downTotal: downloads.length,
      moveDone: moves.filter((j) => j.status === "finished").length,
      moveTotal: moves.length,
      running: jobs.value.filter(
        (j) => j.status === "running" || j.status === "verifying"
      ).length,
    };
  });

  const panelJobs = computed(() =>
    jobs.value.filter((j) => {
      if (suppressedIds.has(j.id)) return false;
      if (panelType.value === "move") return isMovePanelJob(j.type);
      return j.type === panelType.value;
    }),
  );

  function onJobFinished(cb: JobFinishListener) {
    finishListeners.add(cb);
    return () => {
      finishListeners.delete(cb);
    };
  }

  function notifyFinished(job: TransferJob, prevStatus?: string) {
    // 传输完成（进入校验或已完成）即触发，避免卡在校验时完成数落后
    if (!isTransferCompleteStatus(job.status)) return;
    if (isTransferCompleteStatus(prevStatus)) return;
    for (const cb of finishListeners) {
      try {
        cb(job);
      } catch {
        /* ignore */
      }
    }
  }

  function upsertJob(job: TransferJob) {
    if (!job?.id || job.removed || suppressedIds.has(job.id)) return;
    const idx = jobs.value.findIndex((j) => j.id === job.id);
    const prevStatus = idx >= 0 ? jobs.value[idx].status : undefined;
    if (idx >= 0) jobs.value.splice(idx, 1, job);
    else jobs.value.push(job);
    notifyFinished(job, prevStatus);
  }

  function openPanel(type: TransferPanelType) {
    panelType.value = type;
    visible.value = true;
  }

  function closePanel() {
    visible.value = false;
  }

  function reset() {
    stopEvents?.();
    stopEvents = null;
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
    jobs.value = [];
    suppressedIds.clear();
    visible.value = false;
  }

  function suppress(ids: string[]) {
    for (const id of ids) suppressedIds.add(id);
    jobs.value = jobs.value.filter((j) => !suppressedIds.has(j.id));
  }

  function startListening() {
    stopEvents?.();
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
    stopEvents = openTransferEvents((msg: any) => {
      if (msg.type === "snapshot") {
        const list = (msg.list || []) as TransferJob[];
        const live = new Set(list.map((j) => j.id));
        for (const id of [...suppressedIds]) {
          if (!live.has(id)) suppressedIds.delete(id);
        }
        const prevMap = new Map(jobs.value.map((j) => [j.id, j.status]));
        jobs.value = list.filter((j) => !suppressedIds.has(j.id));
        for (const job of jobs.value) {
          notifyFinished(job, prevMap.get(job.id));
        }
      } else if (msg.type === "removed" && msg.id) {
        suppress([String(msg.id)]);
      } else if (msg.type === "progress" && msg.job) {
        upsertJob(msg.job as TransferJob);
      }
    });
    // 大批量时 SSE 可能落后，有未完成任务时定期对齐
    syncTimer = setInterval(() => {
      const hasActive = jobs.value.some(
        (j) =>
          j.status === "waiting" ||
          j.status === "running" ||
          j.status === "verifying"
      );
      if (hasActive) void refresh();
    }, 1500);
  }

  async function refresh() {
    const res = await api.listJobs();
    const list = ((res.data as any)?.list || []) as TransferJob[];
    const prevMap = new Map(jobs.value.map((j) => [j.id, j.status]));
    jobs.value = list.filter((j) => !suppressedIds.has(j.id));
    // 与 snapshot 一致：检测 waiting→finished，触发列表自动刷新等副作用
    for (const job of jobs.value) {
      notifyFinished(job, prevMap.get(job.id));
    }
  }

  async function clearPanelJobs(onlyFinished: boolean) {
    const type = panelType.value;
    const res = await api.clearJobs({ type, onlyFinished });
    const ids = ((res.data as any)?.ids || []) as string[];
    if (ids.length) suppress(ids);
    // 强制与 sidecar 对齐，避免清空后旧任务又被 SSE/refresh 带回来
    await refresh();
    return ids.length;
  }

  async function removeJob(id: string) {
    suppress([id]);
    try {
      await api.removeJob(id);
    } catch (e) {
      suppressedIds.delete(id);
      await refresh();
      throw e;
    }
  }

  let uploadInFlight = false;
  let downloadInFlight = false;
  let moveInFlight = false;

  async function upload(
    bucket: string,
    prefix: string,
    localPaths: string[],
    region?: string,
    overwriteSameName?: boolean,
  ) {
    if (uploadInFlight) {
      return { queued: 0, skipped: 0 };
    }
    uploadInFlight = true;
    try {
      const uniquePaths = [
        ...new Set(
          (localPaths || []).map((p) => String(p || "").trim()).filter(Boolean),
        ),
      ];
      const res = await api.upload({
        bucket,
        prefix,
        localPaths: uniquePaths,
        ...(region ? { region } : {}),
        ...(typeof overwriteSameName === "boolean" ? { overwriteSameName } : {}),
      });
      panelType.value = "upload";
      visible.value = true;
      await refresh();
      const data = (res.data || {}) as { jobs?: unknown[]; skipped?: number };
      return {
        queued: Array.isArray(data.jobs) ? data.jobs.length : 0,
        skipped: Number(data.skipped) || 0,
      };
    } finally {
      uploadInFlight = false;
    }
  }

  async function download(
    bucket: string,
    keys: string[],
    localDir: string,
    region?: string,
    stripPrefix?: string,
  ) {
    if (!keys.length) throw new Error("请先选择要下载的对象");
    if (!localDir) throw new Error("请选择下载目录");
    if (downloadInFlight) {
      return { queued: 0 };
    }
    downloadInFlight = true;
    try {
      const uniqueKeys = [
        ...new Set(keys.map((k) => String(k || "").trim()).filter(Boolean)),
      ];
      const res = await api.download({
        bucket,
        keys: uniqueKeys,
        localDir,
        ...(region ? { region } : {}),
        ...(stripPrefix ? { stripPrefix } : {}),
      });
      panelType.value = "download";
      visible.value = true;
      await refresh();
      const data = (res.data || {}) as { jobs?: unknown[] };
      return {
        queued: Array.isArray(data.jobs) ? data.jobs.length : 0,
      };
    } finally {
      downloadInFlight = false;
    }
  }

  async function moveCopy(payload: {
    bucket: string;
    keys: string[];
    toBucket: string;
    toPrefix?: string;
    fromPrefix?: string;
    region?: string;
    toRegion?: string;
    isCopy?: boolean;
  }) {
    if (!payload.keys?.length) throw new Error("请先选择对象");
    if (moveInFlight) {
      return;
    }
    moveInFlight = true;
    try {
      const uniqueKeys = [
        ...new Set(
          payload.keys.map((k) => String(k || "").trim()).filter(Boolean),
        ),
      ];
      await api.enqueueMove({ ...payload, keys: uniqueKeys });
      panelType.value = "move";
      visible.value = true;
      await refresh();
    } finally {
      moveInFlight = false;
    }
  }

  return {
    jobs,
    panelJobs,
    visible,
    panelType,
    totals,
    openPanel,
    closePanel,
    startListening,
    onJobFinished,
    refresh,
    clearPanelJobs,
    removeJob,
    reset,
    upload,
    download,
    moveCopy,
  };
});
