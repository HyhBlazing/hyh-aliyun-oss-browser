import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, openTransferEvents } from "../api/client";

export type TransferJob = {
  id: string;
  type: "upload" | "download";
  status: string;
  progress: number;
  bucket: string;
  key: string;
  localPath: string;
  size: number;
  error?: string;
};

export const useTransferStore = defineStore("transfer", () => {
  const jobs = ref<TransferJob[]>([]);
  const visible = ref(false);
  let stopEvents: null | (() => void) = null;

  const totals = computed(() => {
    const uploads = jobs.value.filter((j) => j.type === "upload");
    const downloads = jobs.value.filter((j) => j.type === "download");
    return {
      upDone: uploads.filter((j) => j.status === "finished").length,
      upTotal: uploads.length,
      downDone: downloads.filter((j) => j.status === "finished").length,
      downTotal: downloads.length,
      running: jobs.value.filter((j) => j.status === "running").length,
    };
  });

  function startListening() {
    stopEvents?.();
    stopEvents = openTransferEvents((msg: any) => {
      if (msg.type === "snapshot") {
        jobs.value = msg.list || [];
      } else if (msg.type === "progress" && msg.job) {
        const idx = jobs.value.findIndex((j) => j.id === msg.job.id);
        if (idx >= 0) jobs.value[idx] = msg.job;
        else jobs.value.push(msg.job);
      }
    });
  }

  async function refresh() {
    const res = await api.listJobs();
    jobs.value = ((res.data as any)?.list || []) as TransferJob[];
  }

  async function upload(bucket: string, prefix: string, localPaths: string[]) {
    await api.upload({ bucket, prefix, localPaths });
    visible.value = true;
    await refresh();
  }

  async function download(bucket: string, keys: string[], localDir: string) {
    await api.download({ bucket, keys, localDir });
    visible.value = true;
    await refresh();
  }

  return {
    jobs,
    visible,
    totals,
    startListening,
    refresh,
    upload,
    download,
  };
});
