<template>
  <div class="dock card-panel" :class="{ open: transfer.visible }">
    <button class="toggle" type="button" @click="transfer.visible = !transfer.visible">
      <span>上传 {{ transfer.totals.upDone }}/{{ transfer.totals.upTotal }}</span>
      <span>下载 {{ transfer.totals.downDone }}/{{ transfer.totals.downTotal }}</span>
    </button>
    <div v-if="transfer.visible" class="panel">
      <div class="head">
        <strong>传输任务</strong>
        <a-button size="mini" @click="transfer.visible = false">关闭</a-button>
      </div>
      <a-table :data="transfer.jobs" row-key="id" :pagination="false" size="small">
        <a-table-column title="类型" :width="70">
          <template #cell="{ record }">{{
            record.type === "upload" ? "上传" : "下载"
          }}</template>
        </a-table-column>
        <a-table-column title="对象" data-index="key" />
        <a-table-column title="状态" data-index="status" :width="90" />
        <a-table-column title="进度" :width="120">
          <template #cell="{ record }">
            <a-progress :percent="record.progress" size="small" />
          </template>
        </a-table-column>
        <a-table-column title="操作" :width="150">
          <template #cell="{ record }">
            <a-button
              v-if="record.status === 'running'"
              size="mini"
              @click="api.pauseJob(record.id)"
              >暂停</a-button
            >
            <a-button
              v-if="record.status === 'stopped' || record.status === 'failed'"
              size="mini"
              @click="api.resumeJob(record.id)"
              >继续</a-button
            >
            <a-button size="mini" status="danger" @click="api.removeJob(record.id)"
              >移除</a-button
            >
          </template>
        </a-table-column>
      </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTransferStore } from "../stores/transfer";
import { api } from "../api/client";

const transfer = useTransferStore();
</script>

<style scoped>
.dock {
  position: fixed;
  right: 16px;
  bottom: 0;
  z-index: 20;
  min-width: 220px;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  overflow: hidden;
}
.toggle {
  display: flex;
  gap: 16px;
  width: 100%;
  border: 0;
  background: #fff;
  padding: 10px 14px;
  cursor: pointer;
  color: #667085;
  font-size: 12px;
}
.panel {
  width: 640px;
  max-height: 360px;
  overflow: auto;
  background: #f5f5f7;
  border-top: 1px solid #e4e7ec;
  padding: 8px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
</style>
