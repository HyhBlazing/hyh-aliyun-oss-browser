import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useAuthStore } from "./auth";

export type FavItem = {
  url: string;
  addedAt: number;
  region?: string;
};

const MAX = 100;

function normalizeFolderUrl(addr: string) {
  if (!addr || typeof addr !== "string") return "";
  let a = addr.trim();
  if (a === "oss://" || !a.startsWith("oss://")) return "";
  const rest = a.slice(6).replace(/\/+$/, "");
  if (!rest) return "";
  const slashIdx = rest.indexOf("/");
  const bucket = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
  const key = slashIdx === -1 ? "" : rest.slice(slashIdx + 1);
  if (!bucket || !key) return "";
  return `oss://${bucket}/${key.replace(/\/+$/, "")}/`;
}

function storageKey(akId: string) {
  return `hyh-oss-favorites:${akId || "_anonymous"}`;
}

function load(akId: string): FavItem[] {
  try {
    const raw = localStorage.getItem(storageKey(akId));
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((it: any) => ({
        url: String(it?.url || ""),
        addedAt: Number(it?.addedAt) || Date.now(),
        region: it?.region ? String(it.region) : "",
      }))
      .filter((it) => !!normalizeFolderUrl(it.url));
  } catch {
    return [];
  }
}

function save(akId: string, list: FavItem[]) {
  localStorage.setItem(storageKey(akId), JSON.stringify(list.slice(0, MAX)));
}

export const useFavoritesStore = defineStore("favorites", () => {
  const auth = useAuthStore();
  const akId = computed(() => auth.session?.id || "");
  const items = ref<FavItem[]>(load(akId.value));

  watch(akId, (id) => {
    items.value = load(id);
  });

  const urls = computed(() => new Set(items.value.map((i) => i.url)));

  function list() {
    return items.value;
  }

  function has(url: string) {
    const n = normalizeFolderUrl(url);
    return !!(n && urls.value.has(n));
  }

  function add(url: string, region?: string) {
    const n = normalizeFolderUrl(url);
    if (!n) return false;
    if (urls.value.has(n)) {
      // 更新 region
      if (region) {
        items.value = items.value.map((it) =>
          it.url === n ? { ...it, region: region || it.region } : it
        );
        save(akId.value, items.value);
      }
      return true;
    }
    if (items.value.length >= MAX) return false;
    items.value = [
      { url: n, addedAt: Date.now(), region: region || "" },
      ...items.value,
    ];
    save(akId.value, items.value);
    return true;
  }

  function remove(url: string) {
    const n = normalizeFolderUrl(url);
    items.value = items.value.filter((i) => i.url !== n);
    save(akId.value, items.value);
  }

  function toggle(url: string, region?: string) {
    if (has(url)) {
      remove(url);
      return false;
    }
    return add(url, region);
  }

  function folderUrl(bucket: string, folderKey: string) {
    const key = folderKey.endsWith("/") ? folderKey : `${folderKey}/`;
    return normalizeFolderUrl(`oss://${bucket}/${key}`);
  }

  function find(url: string) {
    const n = normalizeFolderUrl(url);
    return items.value.find((i) => i.url === n) || null;
  }

  return {
    items,
    list,
    has,
    add,
    remove,
    toggle,
    folderUrl,
    find,
    normalizeFolderUrl,
  };
});
