import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../api/client";

export const useSettingsStore = defineStore("settings", () => {
  const values = ref<Record<string, unknown>>({});
  const loaded = ref(false);

  async function load() {
    const res = await api.getSettings();
    values.value = (res.data as Record<string, unknown>) || {};
    loaded.value = true;
  }

  async function save(partial: Record<string, unknown>) {
    const res = await api.saveSettings(partial);
    values.value = (res.data as Record<string, unknown>) || {};
  }

  return { values, loaded, load, save };
});
