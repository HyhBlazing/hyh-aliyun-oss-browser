import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api/client";
import { useAuthStore } from "./auth";

export type BucketItem = {
  name: string;
  region: string;
  creationDate?: string;
  extranetEndpoint?: string;
  intranetEndpoint?: string;
};

export type ObjectItem = {
  name: string;
  isFolder: boolean;
  size?: number;
  lastModified?: string;
  path?: string;
  storageClass?: string;
  storage_class?: string;
};

export type SortKey =
  | "name"
  | "size"
  | "lastModified"
  | "region"
  | "creationDate";
export type SortOrder = "asc" | "desc";

const MAX_HISTORY = 50;
const SS_LAST_ADDRESS = "hyh-oss-last-address";

type LastAddressState = {
  address: string;
  region?: string;
  akId?: string;
};

function readLastAddress(): LastAddressState | null {
  try {
    const raw = sessionStorage.getItem(SS_LAST_ADDRESS);
    if (!raw) return null;
    const data = JSON.parse(raw) as LastAddressState;
    if (!data?.address || !String(data.address).startsWith("oss://"))
      return null;
    return data;
  } catch {
    return null;
  }
}

function writeLastAddress(state: LastAddressState) {
  try {
    sessionStorage.setItem(SS_LAST_ADDRESS, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function clearLastBrowserAddress() {
  try {
    sessionStorage.removeItem(SS_LAST_ADDRESS);
  } catch {
    /* ignore */
  }
}

export const useBrowserStore = defineStore("browser", () => {
  const address = ref("oss://");
  const buckets = ref<BucketItem[]>([]);
  const objects = ref<ObjectItem[]>([]);
  const loading = ref(false);
  const error = ref("");
  const nextMarker = ref("");
  const isTruncated = ref(false);
  const selected = ref<string[]>([]);
  const bucketRegion = ref("");
  const historyBack = ref<string[]>([]);
  const historyForward = ref<string[]>([]);
  const searchKeyword = ref("");
  const sortKey = ref<SortKey>("name");
  const sortOrder = ref<SortOrder>("asc");

  let navigatingHistory = false;

  const bucket = computed(() => {
    const m = address.value.match(/^oss:\/\/([^/]+)/);
    return m ? m[1] : "";
  });

  const prefix = computed(() => {
    if (!bucket.value) return "";
    let rest = address.value.slice(`oss://${bucket.value}`.length);
    if (rest.startsWith("/")) rest = rest.slice(1);
    return rest;
  });

  const isBucketList = computed(() => !bucket.value);
  const canBack = computed(() => historyBack.value.length > 0);
  const canForward = computed(() => historyForward.value.length > 0);

  function objectDisplayName(full: string) {
    const p = prefix.value;
    let name = full;
    if (p && name.startsWith(p)) name = name.slice(p.length);
    return name.replace(/\/$/, "") || full;
  }

  const filteredBuckets = computed(() => {
    let list = [...buckets.value];
    const kw = searchKeyword.value.trim().toLowerCase();
    if (kw) {
      list = list.filter((b) => b.name.toLowerCase().includes(kw));
    }
    const order = sortOrder.value === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey.value === "region") {
        cmp = (a.region || "").localeCompare(b.region || "", "zh-CN");
      } else if (sortKey.value === "creationDate") {
        cmp = String(a.creationDate || "").localeCompare(
          String(b.creationDate || ""),
        );
      } else {
        cmp = a.name.localeCompare(b.name, "zh-CN");
      }
      return cmp * order;
    });
    return list;
  });

  const filteredObjects = computed(() => {
    let list = [...objects.value];
    const kw = searchKeyword.value.trim().toLowerCase();
    if (kw) {
      list = list.filter((o) =>
        objectDisplayName(o.name).toLowerCase().includes(kw),
      );
    }
    const order = sortOrder.value === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      let cmp = 0;
      if (sortKey.value === "size") {
        cmp = (Number(a.size) || 0) - (Number(b.size) || 0);
      } else if (sortKey.value === "lastModified") {
        const ta = Date.parse(String(a.lastModified || "")) || 0;
        const tb = Date.parse(String(b.lastModified || "")) || 0;
        if (!ta && !tb) {
          cmp = objectDisplayName(a.name).localeCompare(
            objectDisplayName(b.name),
            "zh-CN"
          );
          return cmp * order;
        }
        // 无修改时间的始终排在后面
        if (!ta) return 1;
        if (!tb) return -1;
        cmp = ta - tb;
      } else {
        cmp = objectDisplayName(a.name).localeCompare(
          objectDisplayName(b.name),
          "zh-CN"
        );
      }
      return cmp * order;
    });
    return list;
  });

  function resolveRegionFor(name: string) {
    const hit = buckets.value.find((b) => b.name === name);
    if (hit?.region) return hit.region;
    if (bucketRegion.value && bucket.value === name) return bucketRegion.value;
    return "";
  }

  function recordHistory(prev: string) {
    if (navigatingHistory) return;
    if (prev === address.value) return;
    historyBack.value.push(prev);
    if (historyBack.value.length > MAX_HISTORY) {
      historyBack.value.shift();
    }
    historyForward.value = [];
  }

  async function applyAddress(url: string, record = true, regionHint = "") {
    const prev = address.value;
    const prevBucket = bucket.value;
    address.value = normalizeOssUrl(url);
    selected.value = [];
    searchKeyword.value = "";
    if (!bucket.value) {
      bucketRegion.value = "";
    } else if (bucket.value !== prevBucket) {
      const hit = buckets.value.find((b) => b.name === bucket.value);
      bucketRegion.value =
        regionHint || hit?.region || bucketRegion.value || "";
      // 跨 Bucket 跳转且本地没有 region 时，先拉一次 Bucket 列表补全
      if (!bucketRegion.value) {
        try {
          const res = await api.listBuckets();
          buckets.value = (res.data as { list: BucketItem[] }).list || [];
          const again = buckets.value.find((b) => b.name === bucket.value);
          if (again?.region) bucketRegion.value = again.region;
        } catch {
          /* ignore，后续 refresh 仍会尝试 */
        }
      }
    } else if (regionHint) {
      bucketRegion.value = regionHint;
    }
    if (record) recordHistory(prev);
    persistLastAddress();
    await refresh();
  }

  function persistLastAddress() {
    const auth = useAuthStore();
    writeLastAddress({
      address: address.value,
      region: bucketRegion.value || "",
      akId: auth.session?.id || "",
    });
  }

  async function go(url: string, regionHint = "") {
    await applyAddress(url, true, regionHint);
  }

  async function back() {
    if (!historyBack.value.length) return;
    navigatingHistory = true;
    const target = historyBack.value.pop()!;
    historyForward.value.push(address.value);
    try {
      await applyAddress(target, false);
    } finally {
      navigatingHistory = false;
    }
  }

  async function forward() {
    if (!historyForward.value.length) return;
    navigatingHistory = true;
    const target = historyForward.value.pop()!;
    historyBack.value.push(address.value);
    try {
      await applyAddress(target, false);
    } finally {
      navigatingHistory = false;
    }
  }

  async function refresh() {
    loading.value = true;
    error.value = "";
    try {
      if (!bucket.value) {
        const res = await api.listBuckets();
        buckets.value = (res.data as { list: BucketItem[] }).list || [];
        objects.value = [];
        nextMarker.value = "";
        isTruncated.value = false;
        bucketRegion.value = "";
      } else {
        const region = resolveRegionFor(bucket.value);
        if (region) bucketRegion.value = region;
        const res = await api.listObjects({
          bucket: bucket.value,
          prefix: prefix.value,
          ...(region ? { region } : {}),
        });
        const data = res.data as {
          list: ObjectItem[];
          nextMarker: string;
          isTruncated?: boolean;
        };
        objects.value = data.list || [];
        nextMarker.value = data.nextMarker || "";
        isTruncated.value = !!data.isTruncated;
      }
      persistLastAddress();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "加载失败";
    } finally {
      loading.value = false;
    }
  }

  async function loadMore() {
    if (
      !bucket.value ||
      !isTruncated.value ||
      !nextMarker.value ||
      loading.value
    )
      return;
    loading.value = true;
    error.value = "";
    try {
      const region = resolveRegionFor(bucket.value);
      const res = await api.listObjects({
        bucket: bucket.value,
        prefix: prefix.value,
        marker: nextMarker.value,
        ...(region ? { region } : {}),
      });
      const data = res.data as {
        list: ObjectItem[];
        nextMarker: string;
        isTruncated?: boolean;
      };
      const exist = new Set(objects.value.map((o) => o.name));
      for (const item of data.list || []) {
        if (!exist.has(item.name)) objects.value.push(item);
      }
      nextMarker.value = data.nextMarker || "";
      isTruncated.value = !!data.isTruncated;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "加载失败";
    } finally {
      loading.value = false;
    }
  }

  async function enterBucket(name: string, region?: string) {
    const hit = buckets.value.find((b) => b.name === name);
    bucketRegion.value = region || hit?.region || "";
    await applyAddress(`oss://${name}/`, true);
  }

  async function enterFolder(item: ObjectItem) {
    let p = item.path || item.name;
    if (!p.endsWith("/")) p += "/";
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
    const next = parts.length ? `${parts.join("/")}/` : "";
    await go(`oss://${bucket.value}/${next}`);
  }

  async function bootstrapFromSession() {
    const auth = useAuthStore();
    const last = readLastAddress();
    const akId = auth.session?.id || "";
    if (
      last?.address &&
      (!last.akId || !akId || last.akId === akId) &&
      last.address !== "oss://"
    ) {
      if (last.region) bucketRegion.value = last.region;
      await applyAddress(last.address, false);
      return;
    }

    const osspath = auth.session?.osspath;
    if (osspath && osspath.startsWith("oss://") && osspath !== "oss://") {
      bucketRegion.value = auth.session?.region || "";
      const url = osspath.endsWith("/") ? osspath : `${osspath}/`;
      await applyAddress(url, false);
      return;
    }
    persistLastAddress();
    await refresh();
  }

  return {
    address,
    buckets,
    objects,
    loading,
    error,
    nextMarker,
    isTruncated,
    selected,
    bucketRegion,
    historyBack,
    historyForward,
    searchKeyword,
    sortKey,
    sortOrder,
    bucket,
    prefix,
    isBucketList,
    canBack,
    canForward,
    filteredBuckets,
    filteredObjects,
    objectDisplayName,
    go,
    back,
    forward,
    refresh,
    loadMore,
    enterBucket,
    enterFolder,
    goUp,
    resolveRegionFor,
    bootstrapFromSession,
  };
});

function normalizeOssUrl(url: string) {
  let u = (url || "").trim();
  if (!u) return "oss://";
  if (!u.startsWith("oss://")) u = "oss://" + u.replace(/^\/+/, "");
  const m = u.match(/^oss:\/\/([^/]+)\/(.+)$/);
  if (m && m[2] && !m[2].endsWith("/")) {
    const last = m[2].split("/").pop() || "";
    if (!/\.[A-Za-z0-9]{1,8}$/.test(last)) {
      u += "/";
    }
  }
  return u;
}
