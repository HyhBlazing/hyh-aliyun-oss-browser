import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api/client";

export type BucketItem = {
  name: string;
  region: string;
  creationDate?: string;
};

export type ObjectItem = {
  name: string;
  isFolder: boolean;
  size?: number;
  lastModified?: string;
  path?: string;
};

export const useBrowserStore = defineStore("browser", () => {
  const address = ref("oss://");
  const buckets = ref<BucketItem[]>([]);
  const objects = ref<ObjectItem[]>([]);
  const loading = ref(false);
  const error = ref("");
  const nextMarker = ref("");
  const selected = ref<string[]>([]);

  const bucket = computed(() => {
    const m = address.value.match(/^oss:\/\/([^/]+)/);
    return m ? m[1] : "";
  });

  const prefix = computed(() => {
    if (!bucket.value) return "";
    return address.value.replace(`oss://${bucket.value}/`, "").replace(/^oss:\/\/[^/]+$/, "");
  });

  const isBucketList = computed(() => address.value === "oss://" || address.value === "oss://");

  async function go(url: string) {
    address.value = normalizeOssUrl(url);
    selected.value = [];
    await refresh();
  }

  async function refresh() {
    loading.value = true;
    error.value = "";
    try {
      if (!bucket.value) {
        const res = await api.listBuckets();
        buckets.value = (res.data as { list: BucketItem[] }).list || [];
        objects.value = [];
      } else {
        const res = await api.listObjects({
          bucket: bucket.value,
          prefix: prefix.value,
        });
        const data = res.data as {
          list: ObjectItem[];
          nextMarker: string;
        };
        objects.value = data.list || [];
        nextMarker.value = data.nextMarker || "";
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "加载失败";
    } finally {
      loading.value = false;
    }
  }

  async function enterBucket(name: string) {
    await go(`oss://${name}/`);
  }

  async function enterFolder(item: ObjectItem) {
    const p = item.path || item.name;
    await go(`oss://${bucket.value}/${p}`);
  }

  async function goUp() {
    if (!bucket.value) return;
    if (!prefix.value) {
      await go("oss://");
      return;
    }
    const parts = prefix.value.replace(/\/$/, "").split("/");
    parts.pop();
    const next = parts.length ? parts.join("/") + "/" : "";
    await go(`oss://${bucket.value}/${next}`);
  }

  return {
    address,
    buckets,
    objects,
    loading,
    error,
    nextMarker,
    selected,
    bucket,
    prefix,
    isBucketList,
    go,
    refresh,
    enterBucket,
    enterFolder,
    goUp,
  };
});

function normalizeOssUrl(url: string) {
  let u = (url || "").trim();
  if (!u) return "oss://";
  if (!u.startsWith("oss://")) u = "oss://" + u.replace(/^\/+/, "");
  return u;
}
