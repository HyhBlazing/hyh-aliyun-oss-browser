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

export const useTransferStore = defineStore("transfer", () => {
  const jobs = ref<TransferJob[]>([]);
  const visible = ref(false);
  const panelType = ref<TransferPanelType>("upload");
  /** 已删除 id，防止 SSE progress 回灌 */
  const suppressedIds = new Set<string>();
  const finishListeners = new Set<JobFinishListener>();
  let stopEvents: null | (() => void) = null;

  const totals = computed(() => {
    const uploads = jobs.value.filter((j) => j.type === "upload");
    const downloads = jobs.value.filter((j) => j.type === "download");
    const moves = jobs.value.filter((j) => isMovePanelJob(j.type));
    return {
      upDone: uploads.filter((j) => j.status === "finished").length,
      upTotal: uploads.length,
      downDone: downloads.filter((j) => j.status === "finished").length,
      downTotal: downloads.length,
      moveDone: moves.filter((j) => j.status === "finished").length,
      moveTotal: moves.length,
      running: jobs.value.filter((j) => j.status === "running").length,
    };
  });

  const panelJobs = computed(() =>
    jobs.value.filter((j) => {
      if (suppressedIds.has(j.id)) return false;
      if (panelType.value === "move") return isMovePanelJob(j.type);
      return j.type === panelType.value;
    })
  );

  function onJobFinished(cb: JobFinishListener) {
    finishListeners.add(cb);
    return () => {
      finishListeners.delete(cb);
    };
  }

  function notifyFinished(job: TransferJob, prevStatus?: string) {
    if (job.status !== "finished" || prevStatus === "finished") return;
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
    if (idx >= 0) jobs.value[idx] = job;
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
  }

  async function refresh() {
    const res = await api.listJobs();
    const list = ((res.data as any)?.list || []) as TransferJob[];
    jobs.value = list.filter((j) => !suppressedIds.has(j.id));
  }

  async function clearPanelJobs(onlyFinished: boolean) {
    const type = panelType.value;
    const res = await api.clearJobs({ type, onlyFinished });
    const ids = ((res.data as any)?.ids || []) as string[];
    if (ids.length) suppress(ids);
    else await refresh();
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

  async function upload(
    bucket: string,
    prefix: string,
    localPaths: string[],
    region?: string,
    overwriteSameName?: boolean
  ) {
    const res = await api.upload({
      bucket,
      prefix,
      localPaths,
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
  }

  async function download(
    bucket: string,
    keys: string[],
    localDir: string,
    region?: string,
    stripPrefix?: string
  ) {
    if (!keys.length) throw new Error("请先选择要下载的对象");
    if (!localDir) throw new Error("请选择下载目录");
    await api.download({
      bucket,
      keys,
      localDir,
      ...(region ? { region } : {}),
      ...(stripPrefix ? { stripPrefix } : {}),
    });
    panelType.value = "download";
    visible.value = true;
    await refresh();
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
    await api.enqueueMove(payload);
    panelType.value = "move";
    visible.value = true;
    await refresh();
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
