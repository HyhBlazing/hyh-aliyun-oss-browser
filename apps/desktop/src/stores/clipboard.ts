import { computed, ref } from "vue";
import { defineStore } from "pinia";

export type ClipboardItem = {
  keys: string[];
  bucket: string;
  fromPrefix: string;
  region?: string;
  isCopy: boolean;
};

export const useClipboardStore = defineStore("clipboard", () => {
  const item = ref<ClipboardItem | null>(null);

  const count = computed(() => item.value?.keys.length || 0);
  const hasItems = computed(() => count.value > 0);
  const isCopy = computed(() => !!item.value?.isCopy);
  const label = computed(() => {
    if (!item.value) return "";
    const n = item.value.keys.length;
    return item.value.isCopy ? `粘贴(${n})` : `粘贴(${n})`;
  });

  function cut(payload: Omit<ClipboardItem, "isCopy">) {
    if (!payload.keys.length) return false;
    item.value = { ...payload, isCopy: false };
    return true;
  }

  function copy(payload: Omit<ClipboardItem, "isCopy">) {
    if (!payload.keys.length) return false;
    item.value = { ...payload, isCopy: true };
    return true;
  }

  function clear() {
    item.value = null;
  }

  return {
    item,
    count,
    hasItems,
    isCopy,
    label,
    cut,
    copy,
    clear,
  };
});
