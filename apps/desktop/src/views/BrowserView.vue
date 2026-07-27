<template>
  <div class="browser">
    <header class="chrome">
      <a-tooltip content="后退 Alt+←">
        <button class="icon-btn" type="button" :disabled="!browser.canBack" @click="browser.back()">
          <icon-arrow-left />
        </button>
      </a-tooltip>
      <a-tooltip content="前进 Alt+→">
        <button class="icon-btn" type="button" :disabled="!browser.canForward" @click="browser.forward()">
          <icon-arrow-right />
        </button>
      </a-tooltip>
      <a-tooltip content="上级 Alt+↑">
        <button class="icon-btn" type="button" :disabled="!browser.bucket" @click="browser.goUp()">
          <icon-left />
        </button>
      </a-tooltip>
      <a-tooltip content="首页 Alt+Home">
        <button class="icon-btn" type="button" @click="browser.go('oss://')">
          <icon-home />
        </button>
      </a-tooltip>
      <a-tooltip content="刷新 F5">
        <button class="icon-btn" type="button" @click="browser.refresh()">
          <icon-refresh />
        </button>
      </a-tooltip>
      <a-input
        ref="addressInputRef"
        v-model="addressInput"
        class="addr"
        size="small"
        allow-clear
        placeholder="地址栏 Ctrl+L"
        @press-enter="browser.go(addressInput)"
      />
      <a-tooltip content="收藏夹">
        <button class="icon-btn" type="button" @click="showFav = true">
          <icon-bookmark />
        </button>
      </a-tooltip>
      <a-tooltip content="传输列表">
        <button class="icon-btn" type="button" data-transfer-toggle @click.stop="transfer.visible ? transfer.closePanel() : transfer.openPanel(transfer.panelType)">
          <icon-storage />
        </button>
      </a-tooltip>
      <a-tooltip content="设置">
        <button class="icon-btn" type="button" @click="openSettings = true">
          <icon-settings />
        </button>
      </a-tooltip>
      <a-dropdown trigger="hover" position="br" :popup-max-height="320" @popup-visible-change="onAccountMenuVisible">
        <button class="icon-btn account-trigger" type="button" :title="currentAccountTip" @click="switchToNextAccount">
          <icon-user />
        </button>
        <template #content>
          <div class="account-menu">
            <div class="account-menu-head">
              <span class="account-menu-label">当前账号</span>
              <span v-if="currentAccountDesc" class="account-menu-desc">{{ currentAccountDesc }}</span>
              <span class="account-menu-id" :title="currentAccountId">{{ currentAccountLabel }}</span>
            </div>
            <template v-if="switchableAccounts.length">
              <div class="account-menu-section">切换账号</div>
              <a-doption v-for="item in switchableAccounts" :key="item.id" class="account-option" :title="accountTip(item)" @click="switchAccount(item)">
                <span v-if="accountDesc(item)" class="account-option-desc">{{ accountDesc(item) }}</span>
                <span class="account-option-main">{{ accountLabel(item) }}</span>
              </a-doption>
            </template>
            <div v-else class="account-menu-empty">暂无其他可切换账号</div>
            <div class="account-menu-divider" />
            <a-doption class="account-logout" @click="onLogout">
              <icon-export />
              <span>退出登录</span>
            </a-doption>
          </div>
        </template>
      </a-dropdown>
    </header>

    <div class="toolbar">
      <a-input v-model="browser.searchKeyword" class="search" size="small" allow-clear placeholder="搜索" />
      <div class="toolbar-actions">
        <template v-if="!browser.bucket">
          <a-tooltip v-if="canWrite" content="新建 Bucket">
            <button class="icon-btn primary" type="button" @click="showCreate = true">
              <icon-plus />
            </button>
          </a-tooltip>
          <a-tooltip v-if="canWrite" content="删除所选 Bucket">
            <button class="icon-btn danger" type="button" :disabled="!selectedKeys.length" @click="deleteBuckets">
              <icon-delete />
            </button>
          </a-tooltip>
          <a-tooltip v-if="selectedKeys.length === 1" content="Bucket ACL">
            <button class="icon-btn" type="button" @click="openBucketAcl">
              <icon-lock />
            </button>
          </a-tooltip>
          <a-tooltip v-if="selectedKeys.length === 1" content="分片上传">
            <button class="icon-btn" type="button" @click="openMultipart">
              <icon-file />
            </button>
          </a-tooltip>
          <span class="meta">{{ browser.filteredBuckets.length }}/{{ browser.buckets.length }}</span>
        </template>
        <template v-else>
          <a-tooltip v-if="canWrite" content="新建文件夹">
            <button class="icon-btn primary" type="button" @click="showCreateFolder = true">
              <icon-folder-add />
            </button>
          </a-tooltip>
          <a-tooltip v-if="canWrite && selectedKeys.length === 1" content="重命名">
            <button class="icon-btn" type="button" @click="openRename">
              <icon-edit />
            </button>
          </a-tooltip>
          <a-tooltip v-if="canWrite && selectedFileKey" content="对象 ACL">
            <button class="icon-btn" type="button" @click="openObjectAcl">
              <icon-lock />
            </button>
          </a-tooltip>
          <a-tooltip v-if="selectedFileKey" content="HTTP 头">
            <button class="icon-btn" type="button" @click="openObjectMeta">
              <icon-settings />
            </button>
          </a-tooltip>
          <a-tooltip content="解冻归档">
            <button class="icon-btn" type="button" :disabled="!selectedKeys.length" @click="openRestore">
              <icon-history />
            </button>
          </a-tooltip>
          <a-tooltip v-if="canWrite" content="创建软链接">
            <button class="icon-btn" type="button" @click="openSymlink">
              <icon-link />
            </button>
          </a-tooltip>
          <a-tooltip v-if="canWrite" content="上传文件">
            <button class="icon-btn primary" type="button" @click="pickUpload(false)">
              <icon-upload />
            </button>
          </a-tooltip>
          <a-tooltip v-if="canWrite" content="上传文件夹">
            <button class="icon-btn primary" type="button" @click="pickUpload(true)">
              <icon-folder-add />
            </button>
          </a-tooltip>
          <a-tooltip content="批量获取地址">
            <button class="icon-btn" type="button" :disabled="!selectedKeys.length" @click="openBatchAddress">
              <icon-link />
            </button>
          </a-tooltip>
          <a-tooltip content="下载所选">
            <button class="icon-btn" type="button" :disabled="!selectedKeys.length" @click="pickDownload">
              <icon-download />
            </button>
          </a-tooltip>
          <a-tooltip v-if="canWrite" content="剪切（移动）">
            <button class="icon-btn" type="button" :disabled="!selectedKeys.length" @click="cutSelected">
              <icon-scissor />
            </button>
          </a-tooltip>
          <a-tooltip v-if="canWrite" content="复制">
            <button class="icon-btn" type="button" :disabled="!selectedKeys.length" @click="copySelected">
              <icon-copy />
            </button>
          </a-tooltip>
          <a-tooltip v-if="canWrite" :content="clipboard.isCopy ? '粘贴（复制）' : '粘贴（移动）'">
            <button class="icon-btn" type="button" :class="{ active: clipboard.hasItems }" :disabled="!clipboard.hasItems" @click="pasteClipboard">
              <icon-paste />
            </button>
          </a-tooltip>
          <span v-if="clipboard.hasItems" class="meta paste-meta">
            {{ clipboard.isCopy ? "复制" : "剪切" }} {{ clipboard.count }}
            <button class="link-btn" type="button" @click="clipboard.clear()">取消</button>
          </span>
          <a-tooltip v-if="canWrite" content="删除所选">
            <button class="icon-btn danger" type="button" :disabled="!selectedKeys.length" @click="deleteObjects">
              <icon-delete />
            </button>
          </a-tooltip>
          <a-tooltip content="收藏当前目录">
            <button class="icon-btn" type="button" :class="{ active: currentFav }" :disabled="!canFavCurrent" @click="toggleCurrentFav">
              <icon-star-fill v-if="currentFav" />
              <icon-star v-else />
            </button>
          </a-tooltip>
          <span v-if="browser.bucketRegion" class="meta">{{ browser.bucketRegion }}</span>
          <span v-if="selectedKeys.length" class="meta">已选 {{ selectedKeys.length }}</span>
          <span v-if="browser.isTruncated" class="meta">未完全加载</span>
          <a-tooltip v-if="browser.isTruncated" content="加载更多">
            <button class="icon-btn" type="button" @click="browser.loadMore()">
              <icon-more />
            </button>
          </a-tooltip>
          <span class="meta">{{ browser.filteredObjects.length }}/{{ browser.objects.length }}</span>
        </template>
      </div>
    </div>

    <main class="list" :class="{ 'drop-active': dropActive }" @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop.prevent="onDrop" @contextmenu="onListBlankContextMenu">
      <a-spin :loading="browser.loading" style="width: 100%; height: 100%">
        <a-alert v-if="browser.error" type="error" banner>{{ browser.error }}</a-alert>

        <a-empty v-if="!browser.loading && !browser.error && emptyList" :description="browser.bucket ? '暂无对象' : '暂无 Bucket'" />

        <a-table v-else-if="!browser.bucket && browser.filteredBuckets.length" row-key="name" size="small" :bordered="false" :columns="bucketColumns" :data="browser.filteredBuckets" :pagination="false" :row-selection="rowSelection" v-model:selected-keys="selectedKeys" :scroll="{ y: 'calc(100vh - 96px)' }" @row-dblclick="onBucketRow" @row-contextmenu="onBucketContextMenu" @selection-change="onSelectionChange">
          <template #sortName>
            <span class="col-sort" :class="{ active: browser.sortKey === 'name' }" role="button" tabindex="0" @click="toggleSort('name')" @keydown.enter.prevent="toggleSort('name')">
              名称<span class="col-sort-mark">{{ sortMark("name") }}</span>
            </span>
          </template>
          <template #sortRegion>
            <span class="col-sort" :class="{ active: browser.sortKey === 'region' }" role="button" tabindex="0" @click="toggleSort('region')" @keydown.enter.prevent="toggleSort('region')">
              区域<span class="col-sort-mark">{{ sortMark("region") }}</span>
            </span>
          </template>
          <template #sortCreationDate>
            <span class="col-sort" :class="{ active: browser.sortKey === 'creationDate' }" role="button" tabindex="0" @click="toggleSort('creationDate')" @keydown.enter.prevent="toggleSort('creationDate')">
              创建时间<span class="col-sort-mark">{{ sortMark("creationDate") }}</span>
            </span>
          </template>
          <template #name="{ record }">
            <button class="name-cell" type="button" @click="onBucketRow(record)">
              <icon-storage class="type-icon bucket" />
              <span>{{ record.name }}</span>
            </button>
          </template>
          <template #creationDate="{ record }">
            {{ formatTime(record.creationDate) }}
          </template>
        </a-table>

        <a-table v-else-if="browser.bucket && browser.filteredObjects.length" row-key="name" size="small" :bordered="false" :columns="objectColumns" :data="browser.filteredObjects" :pagination="false" :row-selection="rowSelection" v-model:selected-keys="selectedKeys" :scroll="{ y: 'calc(100vh - 96px)' }" @row-dblclick="onObjectDbl" @row-contextmenu="onObjectContextMenu" @selection-change="onSelectionChange">
          <template #sortName>
            <span class="col-sort" :class="{ active: browser.sortKey === 'name' }" role="button" tabindex="0" @click="toggleSort('name')" @keydown.enter.prevent="toggleSort('name')">
              名称<span class="col-sort-mark">{{ sortMark("name") }}</span>
            </span>
          </template>
          <template #sortSize>
            <span class="col-sort" :class="{ active: browser.sortKey === 'size' }" role="button" tabindex="0" @click="toggleSort('size')" @keydown.enter.prevent="toggleSort('size')">
              大小<span class="col-sort-mark">{{ sortMark("size") }}</span>
            </span>
          </template>
          <template #sortLastModified>
            <span class="col-sort" :class="{ active: browser.sortKey === 'lastModified' }" role="button" tabindex="0" @click="toggleSort('lastModified')" @keydown.enter.prevent="toggleSort('lastModified')">
              修改时间<span class="col-sort-mark">{{ sortMark("lastModified") }}</span>
            </span>
          </template>
          <template #name="{ record }">
            <div class="name-cell" role="button" tabindex="0" draggable="true" title="单击打开；按住拖到资源管理器文件夹可下载到该位置" :class="{ archived: isArchive(record) }" @click="record.isFolder ? browser.enterFolder(record) : previewItem(record)" @keydown.enter.prevent="record.isFolder ? browser.enterFolder(record) : previewItem(record)" @dragstart="onObjectDragStart($event, record)" @dragend="onObjectDragEnd">
              <img v-if="showThumb && !record.isFolder && isImage(record.name) && thumbMap[record.name]" :src="thumbMap[record.name]" class="type-icon thumb" alt="" />
              <icon-folder v-else-if="record.isFolder" class="type-icon folder" />
              <icon-file-image v-else-if="isImage(record.name)" class="type-icon image" />
              <icon-video-camera v-else-if="isVideo(record.name)" class="type-icon video" />
              <icon-code v-else-if="isText(record.name)" class="type-icon text" />
              <icon-file v-else class="type-icon file" />
              <span>{{ displayName(record.name) }}</span>
            </div>
          </template>
          <template #size="{ record }">
            {{ record.isFolder ? "-" : formatSize(record.size) }}
          </template>
          <template #storageClass="{ record }">
            {{ record.isFolder ? "-" : formatStorageClass(record.storageClass || record.storage_class) }}
          </template>
          <template #lastModified="{ record }">
            {{ formatTime(record.lastModified) }}
          </template>
          <template #actions="{ record }">
            <div class="row-actions" @click.stop>
              <a-tooltip v-if="record.isFolder" :content="fav.has(favUrl(record)) ? '取消收藏' : '收藏'">
                <button class="icon-btn sm" type="button" :class="{ active: fav.has(favUrl(record)) }" @click="toggleFav(record)">
                  <icon-star-fill v-if="fav.has(favUrl(record))" />
                  <icon-star v-else />
                </button>
              </a-tooltip>
              <a-tooltip v-if="canWrite && isArchive(record)" content="解冻">
                <button class="icon-btn sm" type="button" @click="openRestoreOne(record)">
                  <icon-history />
                </button>
              </a-tooltip>
              <a-tooltip content="获取地址">
                <button class="icon-btn sm" type="button" @click="showAddress(record)">
                  <icon-link />
                </button>
              </a-tooltip>
              <a-tooltip content="下载">
                <button class="icon-btn sm" type="button" @click="downloadOne(record)">
                  <icon-download />
                </button>
              </a-tooltip>
              <a-tooltip v-if="canWrite" content="删除">
                <button class="icon-btn sm danger" type="button" @click="deleteOne(record)">
                  <icon-delete />
                </button>
              </a-tooltip>
            </div>
          </template>
        </a-table>
      </a-spin>
    </main>

    <Teleport to="body">
      <div v-if="ctxMenu.visible" class="ctx-mask" @click="closeCtxMenu" @contextmenu.prevent="closeCtxMenu">
        <div class="ctx-menu" :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }" @click.stop>
          <!-- Bucket -->
          <template v-if="ctxMenu.kind === 'bucket'">
            <button class="ctx-item" type="button" @click="onBucketCtxOpen">
              <icon-folder class="ctx-ico" />打开
            </button>
            <button class="ctx-item" type="button" @click="onBucketCtxRefresh">
              <icon-refresh class="ctx-ico" />刷新
            </button>
          </template>

          <!-- 空白处（当前目录） -->
          <template v-else-if="ctxMenu.kind === 'blank'">
            <button class="ctx-item" type="button" :disabled="!canWrite" @click="onBlankCtxCreateFolder">
              <icon-folder-add class="ctx-ico" />新建文件夹
            </button>
            <button class="ctx-item" type="button" :disabled="!canWrite" @click="onBlankCtxUpload(false)">
              <icon-upload class="ctx-ico blue" />上传文件
            </button>
            <button class="ctx-item" type="button" :disabled="!canWrite" @click="onBlankCtxUpload(true)">
              <icon-upload class="ctx-ico blue" />上传文件夹
            </button>
            <div class="ctx-divider" />
            <button class="ctx-item" type="button" @click="onBlankCtxRefresh">
              <icon-refresh class="ctx-ico" />刷新
            </button>
          </template>

          <!-- Object file / folder -->
          <template v-else-if="ctxMenu.kind === 'object' && ctxMenu.record">
            <button class="ctx-item" type="button" :disabled="!ctxMenu.record.isFolder" @click="onCtxFav">
              <icon-star class="ctx-ico star" />收藏文件夹
            </button>
            <button class="ctx-item" type="button" @click="onCtxDownload">
              <icon-download class="ctx-ico blue" />下载
            </button>
            <button class="ctx-item" type="button" :disabled="!canWrite" @click="onCtxCopy">
              <icon-copy class="ctx-ico blue" />复制
            </button>
            <button class="ctx-item" type="button" :disabled="!canWrite" @click="onCtxCut">
              <icon-scissor class="ctx-ico blue" />移动
            </button>
            <button class="ctx-item" type="button" :disabled="!canWrite" @click="onCtxRename">
              <icon-edit class="ctx-ico blue" />重命名
            </button>
            <button class="ctx-item" type="button" :disabled="!canWrite || !!ctxMenu.record.isFolder" @click="onCtxAcl">
              <icon-safe class="ctx-ico green" />ACL 权限
            </button>
            <button class="ctx-item" type="button" @click="onCtxPolicy">
              <icon-safe class="ctx-ico orange" />简化 Policy 授权
            </button>
            <button class="ctx-item" type="button" :disabled="!ctxMenu.record.isFolder" @click="onCtxGrantToken">
              <icon-safe class="ctx-ico green" />生成授权码
            </button>
            <button class="ctx-item" type="button" @click="onCtxAddress">
              <icon-link class="ctx-ico" />{{ ctxMenu.record.isFolder ? "批量获取地址" : "获取地址" }}
            </button>
            <button class="ctx-item" type="button" :disabled="!!ctxMenu.record.isFolder" @click="onCtxMeta">
              <icon-settings class="ctx-ico" />HTTP 头
            </button>
            <button class="ctx-item" type="button" :disabled="!canWrite || !!ctxMenu.record.isFolder" @click="onCtxSymlink">
              <icon-link class="ctx-ico" />设置软链接
            </button>
            <div class="ctx-divider" />
            <button class="ctx-item danger" type="button" :disabled="!canWrite" @click="onCtxDelete">
              <icon-close class="ctx-ico danger" />删除
            </button>
          </template>
        </div>
      </div>
    </Teleport>

    <TransferDock />

    <a-modal v-model:visible="showCreate" title="新建 Bucket" @ok="createBucket">
      <a-form :model="createForm" layout="vertical">
        <a-form-item label="名称" required>
          <a-input v-model="createForm.name" />
        </a-form-item>
        <a-form-item label="Region">
          <a-input v-model="createForm.region" placeholder="oss-cn-hangzhou" />
        </a-form-item>
        <a-form-item label="读写权限">
          <a-select v-model="createForm.acl" :options="[
            { label: '私有', value: 'private' },
            { label: '公共读', value: 'public-read' },
            { label: '公共读写', value: 'public-read-write' },
          ]" />
        </a-form-item>
        <a-form-item label="存储类型">
          <a-select v-model="createForm.storageClass" :options="[
            { label: '标准存储', value: 'Standard' },
            { label: '低频访问', value: 'IA' },
            { label: '归档存储', value: 'Archive' },
          ]" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:visible="openSettings"
      title="设置"
      :footer="false"
      fullscreen
      unmount-on-close
      modal-class="settings-modal"
    >
      <SettingsPanel @saved="onSettingsSaved" />
    </a-modal>

    <a-modal v-model:visible="showFav" title="收藏夹" :footer="false" width="560px" unmount-on-close>
      <a-empty v-if="!fav.items.length" description="暂无收藏" />
      <div v-else class="fav-list">
        <button v-for="item in fav.items" :key="item.url" class="fav-row" type="button" @click="openFav(item)">
          <icon-folder class="type-icon folder" />
          <span class="fav-url">{{ item.url }}</span>
          <a-tooltip content="移除">
            <span class="icon-btn sm danger" role="button" @click.stop.prevent="fav.remove(item.url)">
              <icon-delete />
            </span>
          </a-tooltip>
        </button>
      </div>
    </a-modal>

    <GetAddressModal v-model:visible="addressModal.visible" :bucket="browser.bucket" :object-key="addressModal.key" :region="browser.bucketRegion" />
    <BatchGetAddressModal v-model:visible="batchAddressModal.visible" :bucket="browser.bucket" :keys="batchAddressModal.keys" :region="browser.bucketRegion" />

    <CreateFolderModal v-model:visible="showCreateFolder" :bucket="browser.bucket" :prefix="browser.prefix" :region="browser.bucketRegion" @done="browser.refresh()" />

    <RenameModal v-model:visible="renameModal.visible" :bucket="browser.bucket" :prefix="browser.prefix" :region="browser.bucketRegion" :object-key="renameModal.key" :is-folder="renameModal.isFolder" @done="onRenameDone" />

    <ObjectAclModal v-model:visible="aclModal.visible" :bucket="browser.bucket" :object-key="aclModal.key" :region="browser.bucketRegion" />

    <ObjectMetaModal v-model:visible="metaModal.visible" :bucket="browser.bucket" :object-key="metaModal.key" :region="browser.bucketRegion" />

    <RestoreModal v-model:visible="restoreModal.visible" :bucket="browser.bucket" :keys="restoreModal.keys" :prefix="browser.prefix" :region="browser.bucketRegion" />

    <SymlinkModal v-model:visible="symlinkModal.visible" :bucket="browser.bucket" :region="browser.bucketRegion" :default-target="symlinkModal.target" :default-link="symlinkModal.link" @done="browser.refresh()" />

    <BucketAclModal v-model:visible="bucketAclModal.visible" :bucket="bucketAclModal.bucket" :region="bucketAclModal.region" />

    <MultipartModal v-model:visible="multipartModal.visible" :bucket="multipartModal.bucket" :region="multipartModal.region" />

    <a-modal v-model:visible="pathPrompt.visible" title="选择下载目录" unmount-on-close @ok="confirmPathPrompt" @cancel="cancelPathPrompt">
      <p class="muted path-hint">当前为浏览器预览模式，请填写本机绝对路径（sidecar 所在机器）。</p>
      <a-input v-model="pathPrompt.value" placeholder="例如 D:\Downloads\oss" allow-clear />
    </a-modal>

    <a-modal v-model:visible="preview.visible" :title="preview.title" :footer="false" width="80vw" unmount-on-close modal-class="preview-modal">
      <div class="preview-body" :class="{ scrollable: preview.kind === 'text', loading: preview.loading }">
        <pre v-if="preview.kind === 'text'" class="preview-text">{{ preview.text }}</pre>
        <VideoPlayer v-else-if="preview.kind === 'video' && preview.url" :url="preview.url" />
        <AudioSpectrumPlayer
          v-else-if="preview.kind === 'audio' && preview.key"
          :url="preview.url"
          :title="preview.title"
          :bucket="browser.bucket"
          :object-key="preview.key"
          :region="browser.bucketRegion"
        />
        <div v-else-if="!preview.loading" class="preview-other">
          <p class="muted">该类型暂不支持内嵌预览</p>
          <a-space>
            <a-button type="primary" @click="openExternal(preview.url)">在浏览器打开</a-button>
            <a-button @click="copyText(preview.url)">复制地址</a-button>
          </a-space>
        </div>
        <div v-if="preview.loading" class="preview-loading">加载中…</div>
      </div>
    </a-modal>

    <a-image-preview-group v-model:visible="imagePreview.visible" v-model:current="imagePreview.current" :src-list="imagePreview.srcList" :infinite="imagePreview.keys.length > 1" @change="onImagePreviewChange" />
  </div>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Message, Modal } from "@arco-design/web-vue";
import { open } from "@tauri-apps/plugin-dialog";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import {
  getKeepLoggedInFlag,
  useAuthStore,
} from "../stores/auth";
import { clearLastBrowserAddress, useBrowserStore, type SortKey } from "../stores/browser";
import { useTransferStore } from "../stores/transfer";
import { useFavoritesStore } from "../stores/favorites";
import { useClipboardStore } from "../stores/clipboard";
import { api } from "../api/client";
import {
  isTauri,
  rememberDownloadDirectory,
  resolveDownloadDirectory,
} from "../lib/local-fs";
import { listHistories, type AuthHistoryItem } from "../lib/tauri";
import TransferDock from "../components/TransferDock.vue";
import SettingsPanel from "../components/SettingsPanel.vue";
import GetAddressModal from "../components/GetAddressModal.vue";
import BatchGetAddressModal from "../components/BatchGetAddressModal.vue";
import CreateFolderModal from "../components/CreateFolderModal.vue";
import RenameModal from "../components/RenameModal.vue";
import ObjectAclModal from "../components/ObjectAclModal.vue";
import ObjectMetaModal from "../components/ObjectMetaModal.vue";
import RestoreModal from "../components/RestoreModal.vue";
import SymlinkModal from "../components/SymlinkModal.vue";
import BucketAclModal from "../components/BucketAclModal.vue";
import MultipartModal from "../components/MultipartModal.vue";
import VideoPlayer from "../components/VideoPlayer.vue";
import AudioSpectrumPlayer from "../components/AudioSpectrumPlayer.vue";

const auth = useAuthStore();
const browser = useBrowserStore();
const transfer = useTransferStore();
const fav = useFavoritesStore();
const clipboard = useClipboardStore();
const router = useRouter();
const canWrite = computed(() => auth.session?.privilege !== "readOnly");
const accountHistories = ref<AuthHistoryItem[]>([]);
const switchingAccount = ref(false);

const currentAccountId = computed(() => String(auth.session?.id || ""));

const currentAccountHistory = computed(() =>
  accountHistories.value.find((h) => h.id === currentAccountId.value) || null
);

const currentAccountDesc = computed(() => accountDesc(currentAccountHistory.value));

const currentAccountLabel = computed(() => maskAccountId(currentAccountId.value));

const currentAccountTip = computed(() => {
  const id = currentAccountId.value;
  if (!id) return "账号";
  const desc = currentAccountDesc.value;
  const lines = ["点击切换账号；悬停可选择退出"];
  if (desc) lines.push(desc);
  lines.push(id);
  return lines.join("\n");
});

const switchableAccounts = computed(() =>
  accountHistories.value.filter((h) => h.id && h.id !== currentAccountId.value && h.secret)
);

function refreshAccountHistories() {
  accountHistories.value = listHistories();
}

function onAccountMenuVisible(visible: boolean) {
  if (visible) refreshAccountHistories();
}

function maskAccountId(id: string) {
  if (!id) return "未登录";
  if (id.length <= 10) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function accountDesc(item?: AuthHistoryItem | null) {
  return String(item?.desc || "").trim();
}

function accountLabel(item: AuthHistoryItem) {
  return maskAccountId(item.id);
}

function accountTip(item: AuthHistoryItem) {
  const desc = accountDesc(item);
  return desc ? `${desc}\n${item.id}` : item.id;
}

function accountDisplayName(item: AuthHistoryItem) {
  const desc = accountDesc(item);
  return desc || maskAccountId(item.id);
}

function buildLoginPayload(item: AuthHistoryItem) {
  const raw = item as AuthHistoryItem & { requestpaystatus?: string };
  const payload: Record<string, unknown> = {
    id: item.id,
    secret: item.secret,
    region: item.region || "oss-cn-hangzhou",
    eptpl: item.eptpl || "https://{region}.aliyuncs.com",
    eptplcname: item.eptplcname || "",
    osspath: item.osspath || "",
    cname: !!item.cname,
    desc: item.desc || "",
    requestpaystatus:
      raw.requestpaystatus === "YES" || item.isRequestPay ? "YES" : "NO",
  };
  if (item.stoken && String(item.id).startsWith("STS.")) {
    payload.stoken = item.stoken;
  }
  return payload;
}

async function switchAccount(item: AuthHistoryItem) {
  if (!item?.id || !item.secret || switchingAccount.value) return;
  if (item.id === currentAccountId.value) return;
  switchingAccount.value = true;
  try {
    transfer.reset();
    clipboard.clear();
    clearLastBrowserAddress();
    await auth.login(buildLoginPayload(item), {
      remember: true,
      keepLoggedIn: getKeepLoggedInFlag(),
    });
    await browser.bootstrapFromSession();
    selectedKeys.value = [];
    browser.selected = [];
    refreshAccountHistories();
    Message.success(`已切换到 ${accountDisplayName(item)}`);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "切换账号失败");
  } finally {
    switchingAccount.value = false;
  }
}

async function switchToNextAccount() {
  refreshAccountHistories();
  const list = switchableAccounts.value;
  if (!list.length) {
    Message.info("暂无其他可切换账号，请先在登录页保存多个 AccessKey");
    return;
  }
  await switchAccount(list[0]);
}

const addressInput = ref(browser.address);
const addressInputRef = ref<{ focus?: () => void } | null>(null);
const showCreate = ref(false);
const showCreateFolder = ref(false);
const openSettings = ref(false);
const showFav = ref(false);

function onSettingsSaved() {
  openSettings.value = false;
  // 等全屏设置关闭后再提示，避免被遮挡
  window.setTimeout(() => {
    Message.success("已保存设置");
  }, 120);
}
const dropActive = ref(false);
const OSS_DRAG_MIME = "application/x-hyh-oss-keys";
const objectDrag = reactive({
  active: false,
  keys: [] as string[],
  preparing: false,
});
let unlistenNativeDrop: null | (() => void) = null;
let dragIconPath = "";
let dragSession = 0;
const selectedKeys = ref<(string | number)[]>([]);
const createForm = reactive({
  name: "",
  region: "oss-cn-hangzhou",
  acl: "private",
  storageClass: "Standard",
});

const ctxMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  kind: "bucket" as "bucket" | "object" | "blank",
  record: null as null | {
    name: string;
    region?: string;
    isFolder?: boolean;
    path?: string;
  },
});
const addressModal = reactive({ visible: false, key: "" });
const batchAddressModal = reactive({
  visible: false,
  keys: [] as string[],
});
const renameModal = reactive({
  visible: false,
  key: "",
  isFolder: false,
});
const aclModal = reactive({ visible: false, key: "" });
const metaModal = reactive({ visible: false, key: "" });
const restoreModal = reactive({ visible: false, keys: [] as string[] });
const symlinkModal = reactive({
  visible: false,
  target: "",
  link: "",
});
const bucketAclModal = reactive({
  visible: false,
  bucket: "",
  region: "",
});
const multipartModal = reactive({
  visible: false,
  bucket: "",
  region: "",
});
const pathPrompt = reactive({
  visible: false,
  value: "",
  resolve: null as null | ((v: string | null) => void),
});
const preview = reactive({
  visible: false,
  title: "",
  key: "",
  kind: "other" as "text" | "video" | "audio" | "other",
  url: "",
  text: "",
  loading: false,
});
let previewSeq = 0;

const imagePreview = reactive({
  visible: false,
  current: 0,
  keys: [] as string[],
  srcList: [] as string[],
});
const imageUrlCache = reactive<Record<string, string>>({});
const imageUrlCacheAt = reactive<Record<string, number>>({});

const previewImageList = computed(() =>
  browser.filteredObjects.filter((o) => !o.isFolder && isImage(o.name))
);

const showThumb = ref(localStorage.getItem("hyh-oss-show-thumb") === "YES");
const thumbMap = reactive<Record<string, string>>({});

function toggleSort(key: SortKey) {
  if (browser.sortKey === key) {
    browser.sortOrder = browser.sortOrder === "asc" ? "desc" : "asc";
  } else {
    browser.sortKey = key;
    browser.sortOrder = "asc";
  }
}

function sortMark(key: SortKey) {
  if (browser.sortKey !== key) return "";
  return browser.sortOrder === "asc" ? "↑" : "↓";
}

const bucketColumns = [
  { title: "名称", dataIndex: "name", slotName: "name", titleSlotName: "sortName" },
  { title: "区域", dataIndex: "region", width: 160, titleSlotName: "sortRegion" },
  {
    title: "创建时间",
    dataIndex: "creationDate",
    width: 180,
    slotName: "creationDate",
    titleSlotName: "sortCreationDate",
  },
];

const objectColumns = [
  { title: "名称", dataIndex: "name", slotName: "name", titleSlotName: "sortName" },
  { title: "大小", dataIndex: "size", width: 100, slotName: "size", titleSlotName: "sortSize" },
  { title: "类型", dataIndex: "storageClass", width: 100, slotName: "storageClass" },
  {
    title: "修改时间",
    dataIndex: "lastModified",
    width: 180,
    slotName: "lastModified",
    titleSlotName: "sortLastModified",
  },
  { title: "", slotName: "actions", width: 148 },
];

const selectedFileKey = computed(() => {
  if (selectedKeys.value.length !== 1) return "";
  const key = String(selectedKeys.value[0]);
  const hit = browser.objects.find((o) => o.name === key);
  return hit && !hit.isFolder ? key : "";
});

const selectedSingleRecord = computed(() => {
  if (selectedKeys.value.length !== 1) return null;
  const key = String(selectedKeys.value[0]);
  return browser.objects.find((o) => o.name === key) || null;
});

const rowSelection = {
  type: "checkbox" as const,
  showCheckedAll: true,
  onlyCurrent: true,
  width: 44,
};

function onSelectionChange(keys: (string | number)[]) {
  // v-model 已同步 selectedKeys；这里统一成 string 并写回 store
  selectedKeys.value = keys.map(String);
  browser.selected = selectedKeys.value;
}

const emptyList = computed(() =>
  browser.bucket
    ? !browser.filteredObjects.length
    : !browser.filteredBuckets.length
);

const canFavCurrent = computed(() => {
  if (!browser.bucket || !browser.prefix) return false;
  return !!fav.folderUrl(browser.bucket, browser.prefix);
});

const currentFav = computed(() => {
  if (!canFavCurrent.value) return false;
  return fav.has(`oss://${browser.bucket}/${browser.prefix}`);
});

watch(
  () => browser.address,
  (v) => {
    addressInput.value = v;
    selectedKeys.value = [];
    browser.selected = [];
    Object.keys(thumbMap).forEach((k) => delete thumbMap[k]);
    Object.keys(imageUrlCache).forEach((k) => delete imageUrlCache[k]);
    Object.keys(imageUrlCacheAt).forEach((k) => delete imageUrlCacheAt[k]);
    imagePreview.visible = false;
  }
);

watch(
  () => [browser.filteredObjects, showThumb.value, browser.bucket] as const,
  () => {
    loadThumbs();
  }
);

watch(
  () => openSettings.value,
  (v, prev) => {
    if (prev && !v) {
      showThumb.value = localStorage.getItem("hyh-oss-show-thumb") === "YES";
      if (showThumb.value) loadThumbs();
    }
  }
);

onMounted(async () => {
  showThumb.value = localStorage.getItem("hyh-oss-show-thumb") === "YES";
  refreshAccountHistories();
  transfer.startListening();
  stopJobFinished = transfer.onJobFinished((job) => {
    onTransferJobFinished(job);
  });
  await browser.bootstrapFromSession();
  loadThumbs();
  await setupNativeFileDrop();
  window.addEventListener("keydown", onBrowserShortcut, true);
});

onUnmounted(() => {
  unlistenNativeDrop?.();
  unlistenNativeDrop = null;
  stopJobFinished?.();
  stopJobFinished = null;
  if (listRefreshTimer) {
    clearTimeout(listRefreshTimer);
    listRefreshTimer = 0;
  }
  window.removeEventListener("keydown", onBrowserShortcut, true);
});

let stopJobFinished: null | (() => void) = null;
let listRefreshTimer = 0;

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return !!target.closest(
    ".arco-input, .arco-textarea, .arco-input-tag, .arco-select-view, .arco-picker, [contenteditable='true']"
  );
}

function hasBlockingOverlay() {
  if (imagePreview.visible || preview.visible) return true;
  if (ctxMenu.visible) return false; // Esc 可关，其它导航仍可用
  if (
    openSettings.value ||
    showFav.value ||
    showCreate.value ||
    showCreateFolder.value ||
    pathPrompt.visible ||
    addressModal.visible ||
    batchAddressModal.visible ||
    renameModal.visible ||
    aclModal.visible ||
    metaModal.visible ||
    restoreModal.visible ||
    symlinkModal.visible ||
    bucketAclModal.visible ||
    multipartModal.visible
  ) {
    return true;
  }
  return !!document.querySelector(".arco-image-preview");
}

function focusAddressBar() {
  addressInputRef.value?.focus?.();
  void nextTick(() => {
    const input = document.querySelector(".chrome .addr input") as HTMLInputElement | null;
    input?.focus();
    input?.select();
  });
}

function onBrowserShortcut(e: KeyboardEvent) {
  if (e.defaultPrevented || e.isComposing) return;

  const key = e.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  const mod = e.ctrlKey || e.metaKey;
  const alt = e.altKey;
  const shift = e.shiftKey;
  const typing = isEditableShortcutTarget(e.target);

  // 聚焦地址栏：Ctrl/Cmd+L、Alt+D、F6（输入框内也可用）
  if ((mod && !alt && lower === "l") || (alt && !mod && lower === "d") || key === "F6") {
    e.preventDefault();
    e.stopPropagation();
    focusAddressBar();
    return;
  }

  // Esc：关闭右键菜单 / 传输面板 / 图片预览
  if (key === "Escape") {
    if (ctxMenu.visible) {
      e.preventDefault();
      closeCtxMenu();
      return;
    }
    if (imagePreview.visible) {
      // 交给 Arco Image 自己处理关闭
      return;
    }
    if (transfer.visible) {
      e.preventDefault();
      transfer.closePanel();
      return;
    }
  }

  if (typing || hasBlockingOverlay()) return;

  // 后退：Alt+← / Backspace / BrowserBack
  if (
    key === "BrowserBack" ||
    (alt && !mod && key === "ArrowLeft") ||
    (key === "Backspace" && !mod && !alt && !shift)
  ) {
    e.preventDefault();
    if (browser.canBack) void browser.back();
    return;
  }

  // 前进：Alt+→ / BrowserForward
  if (key === "BrowserForward" || (alt && !mod && key === "ArrowRight")) {
    e.preventDefault();
    if (browser.canForward) void browser.forward();
    return;
  }

  // 上级：Alt+↑
  if (alt && !mod && key === "ArrowUp") {
    e.preventDefault();
    if (browser.bucket) void browser.goUp();
    return;
  }

  // 首页：Alt+Home / BrowserHome
  if (key === "BrowserHome" || (alt && !mod && key === "Home")) {
    e.preventDefault();
    void browser.go("oss://");
    return;
  }

  // 刷新：F5 / Ctrl+R / BrowserRefresh
  if (key === "F5" || key === "BrowserRefresh" || (mod && !alt && lower === "r")) {
    e.preventDefault();
    void browser.refresh();
  }
}

function scheduleListRefresh() {
  if (listRefreshTimer) clearTimeout(listRefreshTimer);
  listRefreshTimer = window.setTimeout(() => {
    listRefreshTimer = 0;
    void browser.refresh();
  }, 500);
}

function onTransferJobFinished(job: { type: string; status: string; bucket?: string; key?: string }) {
  if (job.status !== "finished") return;
  if (job.type === "upload") {
    if (!browser.bucket || job.bucket !== browser.bucket) return;
    const key = String(job.key || "");
    const prefix = browser.prefix || "";
    if (prefix && !key.startsWith(prefix)) return;
    scheduleListRefresh();
    return;
  }
  if (job.type === "move" || job.type === "copy") {
    if (!browser.bucket) return;
    scheduleListRefresh();
  }
}

async function setupNativeFileDrop() {
  if (!isTauri()) return;
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    unlistenNativeDrop = await getCurrentWebviewWindow().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === "enter" || payload.type === "over") {
        if (browser.bucket && canWrite.value) dropActive.value = true;
      } else if (payload.type === "leave" || payload.type === "cancel") {
        dropActive.value = false;
      } else if (payload.type === "drop") {
        dropActive.value = false;
        void handleUploadPaths(payload.paths || []);
      }
    });
  } catch (e) {
    console.warn("native drag-drop unavailable", e);
  }
}

function displayName(full: string) {
  return browser.objectDisplayName(full);
}

function openRenameRecord(record: { name: string; isFolder?: boolean }) {
  renameModal.key = record.name;
  renameModal.isFolder = !!record.isFolder;
  renameModal.visible = true;
}

function openRename() {
  const rec = selectedSingleRecord.value;
  if (!rec) {
    Message.warning("请选择单个对象");
    return;
  }
  openRenameRecord(rec);
}

function openAclRecord(record: { name: string; isFolder?: boolean }) {
  if (record.isFolder) return;
  aclModal.key = record.name;
  aclModal.visible = true;
}

function openObjectAcl() {
  if (!selectedFileKey.value) {
    Message.warning("请选择单个文件");
    return;
  }
  aclModal.key = selectedFileKey.value;
  aclModal.visible = true;
}

function openObjectMeta() {
  if (!selectedFileKey.value) {
    Message.warning("请选择单个文件");
    return;
  }
  metaModal.key = selectedFileKey.value;
  metaModal.visible = true;
}

function openRestore() {
  const keys = selectedKeys.value.map(String);
  if (!keys.length) {
    Message.warning("请先选择对象");
    return;
  }
  restoreModal.keys = keys;
  restoreModal.visible = true;
}

function openRestoreOne(record: any) {
  restoreModal.keys = [record.name];
  restoreModal.visible = true;
}

function openSymlink() {
  const target = selectedFileKey.value || "";
  symlinkModal.target = target;
  symlinkModal.link = "";
  symlinkModal.visible = true;
}

function openBucketAcl() {
  if (selectedKeys.value.length !== 1) return;
  const name = String(selectedKeys.value[0]);
  bucketAclModal.bucket = name;
  bucketAclModal.region = browser.resolveRegionFor(name);
  bucketAclModal.visible = true;
}

function openMultipart() {
  if (selectedKeys.value.length !== 1) return;
  const name = String(selectedKeys.value[0]);
  multipartModal.bucket = name;
  multipartModal.region = browser.resolveRegionFor(name);
  multipartModal.visible = true;
}

async function onRenameDone() {
  selectedKeys.value = [];
  browser.selected = [];
  await browser.refresh();
}

function onDragOver(e: DragEvent) {
  if (!browser.bucket || !canWrite.value) return;
  const types = e.dataTransfer?.types ? Array.from(e.dataTransfer.types) : [];
  // 仅外部文件拖入高亮；内部对象拖拽不触发上传态
  if (types.includes("Files") && !types.includes(OSS_DRAG_MIME)) {
    dropActive.value = true;
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }
}

function onDragLeave() {
  dropActive.value = false;
}

async function handleUploadPaths(paths: string[]) {
  if (!browser.bucket) {
    Message.warning("请先进入 Bucket 再上传");
    return;
  }
  if (!canWrite.value) {
    Message.warning("当前为只读权限，无法上传");
    return;
  }
  if (!paths.length) {
    Message.warning("未获取到本地文件路径");
    return;
  }
  try {
    const result = await transfer.upload(
      browser.bucket,
      browser.prefix,
      paths,
      browser.bucketRegion
    );
    if (result.queued <= 0 && result.skipped > 0) {
      Message.success(`全部跳过：${result.skipped} 个同名未变化文件`);
    } else if (result.skipped > 0) {
      Message.success(`已加入上传队列 ${result.queued} 个，跳过 ${result.skipped} 个同名未变化文件`);
    } else {
      Message.success(`已加入上传队列 ${result.queued} 个`);
    }
  } catch (err) {
    Message.error(err instanceof Error ? err.message : "上传失败");
  }
}

async function onDrop(e: DragEvent) {
  dropActive.value = false;
  if (!browser.bucket || !canWrite.value) return;
  // Tauri 原生 drop 已在 onDragDropEvent 处理；此处作 HTML5 兜底
  if (isTauri()) return;
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i] as File & { path?: string };
    if (f.path) paths.push(f.path);
  }
  if (!paths.length) {
    Message.warning("上传需在桌面客户端中进行，请使用 npm run desktop:dev");
    return;
  }
  await handleUploadPaths(paths);
}

function onObjectDragStart(e: DragEvent, record: { name: string }) {
  if (!browser.bucket) {
    e.preventDefault();
    return;
  }
  const key = record.name;
  const selected = selectedKeys.value.map(String);
  const keys = selected.includes(key) && selected.length ? selected : [key];
  objectDrag.active = true;
  objectDrag.keys = keys;
  e.dataTransfer?.setData(OSS_DRAG_MIME, JSON.stringify(keys));
  e.dataTransfer?.setData("text/plain", keys.map((k) => displayName(k)).join("\n"));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";

  // 桌面端：先下到临时目录，再交给系统原生拖拽，松手到哪个文件夹就落到哪里
  if (isTauri()) {
    e.preventDefault();
    void beginNativeDragOut(keys);
  }
}

async function beginNativeDragOut(keys: string[]) {
  if (!browser.bucket || !keys.length || objectDrag.preparing) return;
  objectDrag.preparing = true;
  const session = ++dragSession;

  // 下载过程中若已松开鼠标，startDrag 在 Windows 上可能误报 Dropped 且不落盘
  let primaryDown = true;
  const onPointerUp = () => {
    primaryDown = false;
  };
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);

  const loadingMsg = Message.loading({
    content: "正在准备拖拽下载，请按住鼠标不放…",
    duration: 0,
  });
  const hideLoading = () => {
    try {
      loadingMsg?.close?.();
    } catch {
      /* ignore */
    }
  };

  const cleanupPointer = () => {
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerUp, true);
  };

  try {
    const { tempDir, join, desktopDir, basename } = await import("@tauri-apps/api/path");
    const { invoke } = await import("@tauri-apps/api/core");
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const { startDrag } = await import("@crabnebula/tauri-plugin-drag");
    const base = await tempDir();
    const localDir = await join(base, "hyh-oss-drag", String(Date.now()));
    const res = await api.downloadNow({
      bucket: browser.bucket,
      keys,
      localDir,
      ...(browser.bucketRegion ? { region: browser.bucketRegion } : {}),
      stripPrefix: browser.prefix || "",
    });
    if (session !== dragSession) return;

    const paths = (res.data?.paths || []).filter(Boolean);
    if (!paths.length) {
      Message.warning("没有可拖拽的文件");
      return;
    }

    const alive = await invoke<boolean>("paths_exist", { paths });
    if (!alive) {
      Message.error("临时文件未就绪，请重试或改用下载按钮");
      return;
    }

    async function isOverOwnWindow(cursorPos?: { x: number; y: number }) {
      try {
        const win = getCurrentWindow();
        const factor = await win.scaleFactor();
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        const cx = Number(cursorPos?.x ?? 0) * factor;
        const cy = Number(cursorPos?.y ?? 0) * factor;
        return (
          cx >= pos.x &&
          cx <= pos.x + size.width &&
          cy >= pos.y &&
          cy <= pos.y + size.height
        );
      } catch {
        return false;
      }
    }

    async function saveToDesktop() {
      const desktop = await desktopDir();
      const saved = await invoke<string[]>("copy_paths_to_dir", {
        paths,
        destDir: desktop,
      });
      const names = await Promise.all(saved.map((p) => basename(p)));
      Message.success(`已保存到桌面：${names.slice(0, 3).join("、")}${names.length > 3 ? " 等" : ""}`);
    }

    hideLoading();

    // 准备完成前已松手：不能再走系统拖拽（易误报成功），改为落到桌面
    if (!primaryDown) {
      try {
        await saveToDesktop();
      } catch (e) {
        Message.warning(
          e instanceof Error
            ? `拖拽已中断，保存到桌面失败：${e.message}`
            : "拖拽已中断，请重新按住拖到目标文件夹，或使用下载按钮"
        );
      }
      return;
    }

    if (!dragIconPath) {
      try {
        dragIconPath = await invoke<string>("get_drag_icon_path");
      } catch {
        dragIconPath = paths[0];
      }
    }

    await startDrag(
      {
        item: paths,
        icon: dragIconPath || paths[0],
        mode: "copy",
      },
      (payload) => {
        void (async () => {
          if (payload.result === "Cancelled") {
            Message.info("已取消拖放。大文件建议使用下载按钮选择目录");
            return;
          }
          if (payload.result !== "Dropped") return;
          if (await isOverOwnWindow(payload.cursorPos as { x: number; y: number })) {
            Message.info("请拖到窗口外的文件夹或桌面后再松开");
            return;
          }
          Message.success("已放到目标文件夹");
        })();
      }
    );
  } catch (err) {
    Message.error(err instanceof Error ? err.message : "拖拽下载失败");
  } finally {
    cleanupPointer();
    hideLoading();
    objectDrag.preparing = false;
    objectDrag.active = false;
    objectDrag.keys = [];
  }
}

function onObjectDragEnd() {
  // Tauri 原生拖出在 beginNativeDragOut 中处理；浏览器模式不支持落到任意文件夹
  if (isTauri()) return;
  objectDrag.active = false;
  objectDrag.keys = [];
}

function formatSize(n?: number) {
  if (!n && n !== 0) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** 显示为 2026-07-27 00:05:09 */
function formatTime(value?: string | Date | number | null) {
  if (value === undefined || value === null || value === "") return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return String(value).replace("T", " ").replace(/\.\d+Z?$/, "").replace(/Z$/, "");
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function extOf(name: string) {
  const base = name.split("/").pop() || name;
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i + 1).toLowerCase() : "";
}

function isImage(name: string) {
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico"].includes(extOf(name));
}

function isVideo(name: string) {
  return ["mp4", "webm", "ogg", "mov", "m4v"].includes(extOf(name));
}

function isAudio(name: string) {
  return ["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(extOf(name));
}

function isArchive(record: any) {
  const sc = String(record?.storageClass || record?.storage_class || "").toLowerCase();
  return sc === "archive" || sc === "coldarchive" || sc === "deepcoldarchive";
}

function formatStorageClass(value?: string) {
  if (!value) return "-";
  const map: Record<string, string> = {
    standard: "标准存储",
    ia: "低频访问",
    archive: "归档存储",
    coldarchive: "冷归档",
    deepcoldarchive: "深度冷归档",
  };
  const key = String(value).toLowerCase();
  return map[key] || value;
}

function isText(name: string) {
  return [
    "txt",
    "md",
    "json",
    "xml",
    "csv",
    "log",
    "html",
    "htm",
    "css",
    "js",
    "ts",
    "tsx",
    "vue",
    "yaml",
    "yml",
    "ini",
    "conf",
  ].includes(extOf(name));
}

function favUrl(record: { name: string; path?: string }) {
  return fav.folderUrl(browser.bucket, record.path || record.name);
}

function onBucketRow(record: any) {
  browser.enterBucket(record.name, record.region);
}

function closeCtxMenu() {
  ctxMenu.visible = false;
  ctxMenu.record = null;
}

function openCtxAt(ev: MouseEvent, kind: "bucket" | "object" | "blank", record: any) {
  ev.preventDefault();
  ev.stopPropagation();
  ctxMenu.kind = kind;
  ctxMenu.record = record
    ? {
      name: record.name,
      region: record.region,
      isFolder: !!record.isFolder,
      path: record.path,
    }
    : null;
  ctxMenu.x = Math.min(ev.clientX, window.innerWidth - 220);
  ctxMenu.y = Math.min(ev.clientY, window.innerHeight - 420);
  ctxMenu.visible = true;
}

function onListBlankContextMenu(ev: MouseEvent) {
  if (!browser.bucket) return;
  const target = ev.target as HTMLElement | null;
  if (!target) return;
  // 点在表格行上时由行右键菜单处理
  if (target.closest("tr.arco-table-tr, .arco-table-tr")) return;
  if (target.closest(".arco-table-th, thead")) return;
  if (target.closest(".ctx-menu, .row-actions, button, a, input, textarea")) return;
  openCtxAt(ev, "blank", null);
}

function onBucketContextMenu(record: any, ev: MouseEvent) {
  if (!record?.name) return;
  openCtxAt(ev, "bucket", record);
}

function onObjectContextMenu(record: any, ev: MouseEvent) {
  if (!record?.name) return;
  // 右键时同步选中该项，便于后续批量感操作
  selectedKeys.value = [record.name];
  browser.selected = [record.name];
  openCtxAt(ev, "object", record);
}

function onBlankCtxCreateFolder() {
  closeCtxMenu();
  if (!canWrite.value) return;
  showCreateFolder.value = true;
}

function onBlankCtxUpload(asFolder: boolean) {
  closeCtxMenu();
  if (!canWrite.value) return;
  void pickUpload(asFolder);
}

async function onBlankCtxRefresh() {
  closeCtxMenu();
  await browser.refresh();
}

function onBucketCtxOpen() {
  const rec = ctxMenu.record;
  closeCtxMenu();
  if (rec) onBucketRow(rec);
}

async function onBucketCtxRefresh() {
  closeCtxMenu();
  await browser.refresh();
}

function onCtxFav() {
  const rec = ctxMenu.record;
  closeCtxMenu();
  if (!rec?.isFolder) return;
  toggleFav(rec);
}

function onCtxDownload() {
  const rec = ctxMenu.record;
  closeCtxMenu();
  if (rec) downloadOne(rec);
}

function onCtxCopy() {
  const rec = ctxMenu.record;
  closeCtxMenu();
  if (rec) copyOne(rec);
}

function onCtxCut() {
  const rec = ctxMenu.record;
  closeCtxMenu();
  if (rec) cutOne(rec);
}

function onCtxRename() {
  const rec = ctxMenu.record;
  closeCtxMenu();
  if (rec) openRenameRecord(rec);
}

function onCtxAcl() {
  const rec = ctxMenu.record;
  closeCtxMenu();
  if (!rec || rec.isFolder) return;
  openAclRecord(rec);
}

function onCtxPolicy() {
  closeCtxMenu();
  Message.info("简化 Policy 授权功能开发中");
}

function onCtxGrantToken() {
  closeCtxMenu();
  Message.info("生成授权码功能开发中");
}

function onCtxAddress() {
  const rec = ctxMenu.record;
  closeCtxMenu();
  if (!rec) return;
  showAddress(rec);
}

function showAddress(record: { name: string; isFolder?: boolean }) {
  if (record.isFolder || selectedKeys.value.length > 1) {
    const keys =
      selectedKeys.value.length > 1 && selectedKeys.value.map(String).includes(record.name)
        ? selectedKeys.value.map(String)
        : [record.name];
    openBatchAddressWithKeys(keys);
    return;
  }
  addressModal.key = record.name;
  addressModal.visible = true;
}

function openBatchAddress() {
  const keys = selectedKeys.value.map(String);
  if (!keys.length) {
    Message.warning("请先选择文件或文件夹");
    return;
  }
  openBatchAddressWithKeys(keys);
}

function openBatchAddressWithKeys(keys: string[]) {
  if (!browser.bucket) {
    Message.warning("请先进入 Bucket");
    return;
  }
  if (!keys.length) {
    Message.warning("请先选择文件或文件夹");
    return;
  }
  batchAddressModal.keys = keys;
  batchAddressModal.visible = true;
}

function onCtxMeta() {
  const rec = ctxMenu.record;
  closeCtxMenu();
  if (!rec || rec.isFolder) return;
  metaModal.key = rec.name;
  metaModal.visible = true;
}

function onCtxSymlink() {
  const rec = ctxMenu.record;
  closeCtxMenu();
  if (!rec || rec.isFolder) return;
  symlinkModal.target = rec.name;
  symlinkModal.link = "";
  symlinkModal.visible = true;
}

function onCtxDelete() {
  const rec = ctxMenu.record;
  closeCtxMenu();
  if (rec) deleteOne(rec);
}

function onObjectDbl(record: any) {
  if (record.isFolder) browser.enterFolder(record);
  else previewItem(record);
}

function toggleFav(record: any) {
  const url = favUrl(record);
  if (!url) {
    Message.warning("无法收藏该路径");
    return;
  }
  const added = fav.toggle(url, browser.bucketRegion);
  Message.success(added ? "已收藏" : "已取消收藏");
}

function toggleCurrentFav() {
  if (!canFavCurrent.value) return;
  const url = `oss://${browser.bucket}/${browser.prefix}`;
  const added = fav.toggle(url, browser.bucketRegion);
  Message.success(added ? "已收藏" : "已取消收藏");
}

async function openFav(item: { url: string; region?: string } | string) {
  const url = typeof item === "string" ? item : item.url;
  const region = typeof item === "string" ? "" : item.region || "";
  if (!url) return;
  showFav.value = false;
  try {
    await browser.go(url, region || undefined);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "打开收藏失败");
  }
}

async function createBucket() {
  await api.createBucket({ ...createForm });
  Message.success("创建成功");
  showCreate.value = false;
  await browser.refresh();
}

function confirmListContent(tip: string, names: string[]) {
  const list = names.length ? names : ["（未选择）"];
  return () =>
    h("div", { class: "delete-confirm" }, [
      h("p", { class: "delete-confirm-tip" }, tip),
      h(
        "div",
        { class: "delete-confirm-list" },
        list.map((name) => h("div", { class: "delete-confirm-item" }, name))
      ),
    ]);
}

function deleteConfirmContent(names: string[]) {
  return confirmListContent(`将删除以下 ${names.length || 1} 项：`, names);
}

function clipboardDisplayName(key: string, fromPrefix: string) {
  let name = key;
  if (fromPrefix && name.startsWith(fromPrefix)) name = name.slice(fromPrefix.length);
  return name.replace(/\/$/, "") || key;
}

async function deleteBuckets() {
  const names = selectedKeys.value.map(String);
  Modal.warning({
    title: "确认删除",
    content: deleteConfirmContent(names),
    hideCancel: false,
    onOk: async () => {
      for (const name of names) {
        const region = browser.resolveRegionFor(name);
        await api.deleteBucket(name, region || undefined);
      }
      Message.success("已删除");
      selectedKeys.value = [];
      await browser.refresh();
    },
  });
}

async function deleteObjects() {
  const keys = selectedKeys.value.map(String);
  const names = keys.map((k) => displayName(k));
  Modal.warning({
    title: "确认删除",
    content: deleteConfirmContent(names),
    hideCancel: false,
    onOk: async () => {
      await api.deleteObjects({
        bucket: browser.bucket,
        keys,
        region: browser.bucketRegion,
      });
      Message.success("已删除");
      selectedKeys.value = [];
      await browser.refresh();
    },
  });
}

async function deleteOne(record: any) {
  const name = displayName(record.name);
  Modal.warning({
    title: "确认删除",
    content: deleteConfirmContent([name]),
    hideCancel: false,
    onOk: async () => {
      await api.deleteObjects({
        bucket: browser.bucket,
        keys: [record.name],
        region: browser.bucketRegion,
      });
      Message.success("已删除");
      await browser.refresh();
    },
  });
}

function askLocalPath(defaultPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    pathPrompt.value = defaultPath || "";
    pathPrompt.resolve = resolve;
    pathPrompt.visible = true;
  });
}

function confirmPathPrompt() {
  const v = (pathPrompt.value || "").trim();
  const resolve = pathPrompt.resolve;
  pathPrompt.visible = false;
  pathPrompt.resolve = null;
  resolve?.(v || null);
}

function cancelPathPrompt() {
  const resolve = pathPrompt.resolve;
  pathPrompt.visible = false;
  pathPrompt.resolve = null;
  resolve?.(null);
}

async function pickUpload(asFolder = false) {
  if (!isTauri()) {
    Message.warning("上传需在桌面客户端中选择本地文件，请使用 npm run desktop:dev");
    return;
  }
  try {
    const selected = await open({
      multiple: !asFolder,
      directory: asFolder,
    });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (!paths.length) return;
    const result = await transfer.upload(
      browser.bucket,
      browser.prefix,
      paths as string[],
      browser.bucketRegion
    );
    if (result.queued <= 0 && result.skipped > 0) {
      Message.success(`全部跳过：${result.skipped} 个同名未变化文件`);
    } else if (result.skipped > 0) {
      Message.success(`已加入上传队列 ${result.queued} 个，跳过 ${result.skipped} 个同名未变化文件`);
    } else {
      Message.success(`已加入上传队列 ${result.queued} 个`);
    }
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "上传失败");
  }
}

async function startDownload(keys: string[], opts?: { chooseDir?: boolean }) {
  if (!keys.length) {
    Message.warning("请先选择要下载的对象");
    return;
  }
  try {
    const dir = await resolveDownloadDirectory(askLocalPath, {
      preferPrompt: !!opts?.chooseDir,
    });
    if (!dir) return;
    rememberDownloadDirectory(dir);
    await transfer.download(
      browser.bucket,
      keys,
      dir,
      browser.bucketRegion,
      browser.prefix || ""
    );
    Message.success(`已加入下载队列 → ${dir}`);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "下载失败");
  }
}

async function pickDownload() {
  await startDownload(selectedKeys.value.map(String));
}

async function downloadOne(record: any) {
  await startDownload([record.name]);
}

function clipboardPayload(keys: string[]) {
  return {
    keys,
    bucket: browser.bucket,
    fromPrefix: browser.prefix || "",
    region: browser.bucketRegion || undefined,
  };
}

function cutSelected() {
  const keys = selectedKeys.value.map(String);
  if (!keys.length) {
    Message.warning("请先选择对象");
    return;
  }
  clipboard.cut(clipboardPayload(keys));
  Message.success(`已剪切 ${keys.length} 项，请切换目录后粘贴`);
}

function copySelected() {
  const keys = selectedKeys.value.map(String);
  if (!keys.length) {
    Message.warning("请先选择对象");
    return;
  }
  clipboard.copy(clipboardPayload(keys));
  Message.success(`已复制 ${keys.length} 项，请切换目录后粘贴`);
}

function cutOne(record: any) {
  clipboard.cut(clipboardPayload([record.name]));
  Message.success("已剪切，请切换目录后粘贴");
}

function copyOne(record: any) {
  clipboard.copy(clipboardPayload([record.name]));
  Message.success("已复制，请切换目录后粘贴");
}

async function pasteClipboard() {
  const clip = clipboard.item;
  if (!clip?.keys.length) {
    Message.warning("剪切板为空");
    return;
  }
  if (!browser.bucket) {
    Message.warning("请先进入目标 Bucket");
    return;
  }
  const samePlace =
    clip.bucket === browser.bucket &&
    (clip.fromPrefix || "") === (browser.prefix || "") &&
    !clip.isCopy;
  if (samePlace) {
    Message.warning("不能移动到同一目录");
    return;
  }

  const action = clip.isCopy ? "复制" : "移动";
  const names = clip.keys.map((k) => clipboardDisplayName(k, clip.fromPrefix || ""));
  Modal.warning({
    title: action,
    content: confirmListContent(
      `将${action}以下 ${names.length} 项到当前目录（后台执行，可继续其它操作）：`,
      names
    ),
    hideCancel: false,
    onOk: () => {
      // 不返回 Promise，避免确认框遮罩一直挡住界面
      const payload = {
        bucket: clip.bucket,
        keys: [...clip.keys],
        toBucket: browser.bucket,
        toPrefix: browser.prefix || "",
        fromPrefix: clip.fromPrefix || "",
        region: clip.region || browser.bucketRegion,
        toRegion: browser.bucketRegion,
        isCopy: clip.isCopy,
      };
      clipboard.clear();
      selectedKeys.value = [];
      browser.selected = [];
      void (async () => {
        try {
          await transfer.moveCopy(payload);
          Message.success(`已加入${action}队列，可在传输列表查看进度`);
        } catch (e) {
          Message.error(e instanceof Error ? e.message : `${action}失败`);
        }
      })();
    },
  });
}

async function signObjectUrl(key: string) {
  if (!key) return "";
  const ttl = 55 * 60 * 1000;
  const cachedAt = imageUrlCacheAt[key] || 0;
  const fresh = cachedAt > 0 && Date.now() - cachedAt < ttl;
  if (fresh && imageUrlCache[key]) return imageUrlCache[key];
  if (fresh && thumbMap[key]) {
    imageUrlCache[key] = thumbMap[key];
    return thumbMap[key];
  }
  const res = await api.signObject({
    bucket: browser.bucket,
    key,
    expires: 3600,
    region: browser.bucketRegion,
  });
  const url = String((res.data as any)?.url || "");
  if (url) {
    imageUrlCache[key] = url;
    imageUrlCacheAt[key] = Date.now();
    thumbMap[key] = url;
  }
  return url;
}

function setImagePreviewUrl(index: number, url: string) {
  if (index < 0 || index >= imagePreview.srcList.length) return;
  if (imagePreview.srcList[index] === url) return;
  const next = imagePreview.srcList.slice();
  next[index] = url;
  imagePreview.srcList = next;
}

async function ensureImagePreviewUrl(index: number) {
  const key = imagePreview.keys[index];
  if (!key) return "";
  if (imagePreview.srcList[index]) return imagePreview.srcList[index];
  const url = await signObjectUrl(key);
  if (url && imagePreview.keys[index] === key) {
    setImagePreviewUrl(index, url);
  }
  return url;
}

async function prefetchImagePreviewAround(center: number) {
  const total = imagePreview.keys.length;
  if (total <= 1) return;
  const targets = [center - 1, center + 1, center - 2, center + 2]
    .map((i) => (i + total) % total)
    .filter((i, idx, arr) => arr.indexOf(i) === idx && i !== center);
  for (const i of targets) {
    try {
      await ensureImagePreviewUrl(i);
    } catch {
      /* ignore */
    }
  }
}

async function openImagePreview(record: { name: string }) {
  const list = previewImageList.value;
  let idx = list.findIndex((o) => o.name === record.name);
  if (idx < 0) {
    // 当前筛选结果里没有时，至少预览这一张
    imagePreview.keys = [record.name];
    idx = 0;
  } else {
    imagePreview.keys = list.map((o) => o.name);
  }
  imagePreview.srcList = imagePreview.keys.map(
    (key) => imageUrlCache[key] || thumbMap[key] || ""
  );
  try {
    const url = await signObjectUrl(record.name);
    if (!url) throw new Error("获取图片地址失败");
    setImagePreviewUrl(idx, url);
    imagePreview.current = idx;
    imagePreview.visible = true;
    void prefetchImagePreviewAround(idx);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "预览失败");
  }
}

async function onImagePreviewChange(index: number) {
  imagePreview.current = index;
  try {
    await ensureImagePreviewUrl(index);
    void prefetchImagePreviewAround(index);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "加载图片失败");
  }
}

async function previewItem(record: any) {
  if (record.isFolder) return;
  if (isImage(record.name)) {
    preview.visible = false;
    await openImagePreview(record);
    return;
  }

  const seq = ++previewSeq;
  preview.key = record.name;
  preview.title = displayName(record.name);
  preview.loading = true;
  preview.text = "";
  preview.url = "";
  try {
    if (isText(record.name)) {
      const res = await api.getObjectContent({
        bucket: browser.bucket,
        key: record.name,
        ...(browser.bucketRegion ? { region: browser.bucketRegion } : {}),
      });
      if (seq !== previewSeq) return;
      preview.kind = "text";
      preview.text = (res.data as any)?.content || "";
      preview.url = "";
    } else {
      const res = await api.signObject({
        bucket: browser.bucket,
        key: record.name,
        expires: 3600,
        region: browser.bucketRegion,
      });
      if (seq !== previewSeq) return;
      preview.url = (res.data as any)?.url || "";
      preview.text = "";
      if (isVideo(record.name)) preview.kind = "video";
      else if (isAudio(record.name)) preview.kind = "audio";
      else preview.kind = "other";
    }
    preview.visible = true;
  } catch (e) {
    if (seq !== previewSeq) return;
    Message.error(e instanceof Error ? e.message : "预览失败");
  } finally {
    if (seq === previewSeq) preview.loading = false;
  }
}

async function loadThumbs() {
  if (!showThumb.value || !browser.bucket) return;
  const images = browser.filteredObjects
    .filter((o) => !o.isFolder && isImage(o.name))
    .slice(0, 40);
  const ttl = 55 * 60 * 1000;
  for (const item of images) {
    const at = imageUrlCacheAt[item.name] || 0;
    if (thumbMap[item.name] && at > 0 && Date.now() - at < ttl) continue;
    try {
      const res = await api.signObject({
        bucket: browser.bucket,
        key: item.name,
        expires: 3600,
        region: browser.bucketRegion,
      });
      const u = (res.data as any)?.url;
      if (u) {
        thumbMap[item.name] = u;
        imageUrlCache[item.name] = u;
        imageUrlCacheAt[item.name] = Date.now();
      }
    } catch {
      /* ignore */
    }
  }
}

async function copyText(text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    Message.success("已复制");
  } catch {
    Message.error("复制失败");
  }
}

function openExternal(url: string) {
  if (!url) return;
  openUrl(url).catch(() => {
    window.open(url, "_blank");
  });
}

async function onLogout() {
  try {
    transfer.reset();
    clipboard.clear();
  } catch {
    /* ignore */
  }
  try {
    clearLastBrowserAddress();
    await auth.logout();
  } catch {
    /* ignore */
  }
  await router.replace({ name: "login" });
}
</script>

<style scoped>
.browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}

.chrome,
.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--chrome-h);
  padding: 0 8px;
  border-bottom: 1px solid var(--color-border);
  background: #fafafa;
  flex-shrink: 0;
}

.toolbar {
  height: var(--toolbar-h);
  background: #fff;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  margin-left: auto;
}

.addr {
  flex: 1;
  margin: 0;
}

.meta {
  margin-left: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #3a3a3c;
  cursor: pointer;
  font-size: 16px;
  flex-shrink: 0;
}

.icon-btn:hover:not(:disabled) {
  background: #ececef;
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.icon-btn.primary {
  color: var(--color-brand);
}

.icon-btn.danger {
  color: #ff3b30;
}

.icon-btn.active {
  color: #ff9f0a;
}

.icon-btn.sm {
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  font-size: 13px;
  border-radius: 5px;
}

.account-menu {
  min-width: 240px;
  max-width: 300px;
  padding: 6px 0;
}

.account-menu-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 12px 10px;
}

.account-menu-label {
  font-size: 11px;
  color: #8e8e93;
  letter-spacing: 0.02em;
}

.account-menu-desc {
  font-size: 13px;
  color: #1c1c1e;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-menu-id {
  font-size: 12px;
  color: #8e8e93;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-menu-section {
  padding: 4px 12px;
  font-size: 11px;
  color: #8e8e93;
}

.account-menu-empty {
  padding: 8px 12px 10px;
  font-size: 12px;
  color: #8e8e93;
}

.account-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: #e5e5ea;
}

.account-option {
  display: flex !important;
  flex-direction: column;
  align-items: flex-start !important;
  gap: 2px;
  line-height: 1.3;
  max-width: 276px;
}

.account-option-desc {
  font-size: 13px;
  color: #1c1c1e;
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-option-main {
  font-size: 12px;
  color: #8e8e93;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.account-logout {
  color: #ff3b30 !important;
  display: inline-flex !important;
  align-items: center;
  gap: 6px;
}

.list {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #fff;
}

/* 右侧操作列避开纵向滚动条，避免删除按钮被遮挡 */
.list :deep(.arco-table-body) {
  scrollbar-gutter: stable;
}

.list :deep(.arco-table-th:last-child .arco-table-cell),
.list :deep(.arco-table-td:last-child .arco-table-cell) {
  padding-right: 14px !important;
}

.list :deep(.arco-table-element) {
  width: 100%;
}

.list.drop-active {
  outline: 2px dashed #c7c7cc;
  outline-offset: -4px;
  background: #fafafa;
}

.search {
  width: 260px;
  max-width: 40%;
  flex-shrink: 0;
}

.col-sort {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  box-shadow: none;
  outline: none;
  color: var(--color-text-secondary, #6e6e73);
  font-size: inherit;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  user-select: none;
  -webkit-appearance: none;
  appearance: none;
}

.col-sort:hover {
  color: var(--color-text-1, #1d1d1f);
}

.col-sort.active {
  color: var(--color-text-1, #1d1d1f);
}

.col-sort-mark {
  display: inline-block;
  min-width: 0.75em;
  margin-left: 2px;
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-secondary, #8e8e93);
  line-height: 1;
}

.name-cell {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: grab;
  text-align: left;
  font: inherit;
  outline: none;
}

.name-cell:active {
  cursor: grabbing;
}

.name-cell span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  font-size: 16px;
  line-height: 1;
}

.type-icon :deep(svg) {
  width: 16px;
  height: 16px;
}

.type-icon.folder {
  color: var(--color-folder);
}

.type-icon.file {
  color: var(--color-file);
}

.type-icon.bucket {
  color: var(--color-bucket);
}

.type-icon.image {
  color: #34c759;
}

.type-icon.video {
  color: #af52de;
}

.type-icon.text {
  color: #5856d6;
}

.type-icon.thumb {
  display: block;
  padding: 0;
  object-fit: cover;
  border-radius: 2px;
  font-size: 0;
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 2px;
  padding-right: 4px;
  box-sizing: border-box;
}

.fav-list {
  max-height: 420px;
  overflow: auto;
}

.fav-row {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 4px;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}

.fav-row:hover {
  background: #f5f5f7;
}

.fav-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}

.preview-body {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  max-height: 70vh;
  overflow: hidden;
}

.preview-body.scrollable {
  display: block;
  overflow: auto;
}

.preview-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #8e8e93;
  pointer-events: none;
}

.name-cell.archived {
  opacity: 0.55;
}

.preview-text {
  margin: 0;
  padding: 12px;
  background: #f5f5f7;
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.5;
}

.preview-other {
  padding: 24px;
  text-align: center;
}

.path-hint {
  margin: 0 0 12px;
  font-size: 13px;
}

.muted {
  color: #8e8e93;
}

.paste-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.link-btn {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-brand, #007aff);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.link-btn:hover {
  text-decoration: underline;
}

.ctx-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.ctx-menu {
  position: fixed;
  min-width: 200px;
  max-height: calc(100vh - 24px);
  overflow: auto;
  padding: 6px;
  border: 1px solid #e5e5ea;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
}

.ctx-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #1d1d1f;
  text-align: left;
  font: inherit;
  font-size: 13px;
  line-height: 1.2;
  cursor: pointer;
}

.ctx-item:hover:not(:disabled) {
  background: #f5f5f7;
}

.ctx-item:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.ctx-item.danger {
  color: #ff3b30;
}

.ctx-ico {
  margin-right: 10px;
  font-size: 15px;
  color: #636366;
}

.ctx-ico.blue {
  color: #007aff;
}

.ctx-ico.green {
  color: #34c759;
}

.ctx-ico.orange {
  color: #ff9500;
}

.ctx-ico.star {
  color: #ff9f0a;
}

.ctx-ico.danger {
  color: #ff3b30;
}

.ctx-divider {
  height: 1px;
  margin: 4px 6px;
  background: #ebebef;
}

:deep(.settings-modal.arco-modal-fullscreen) {
  border-radius: 0;
}

:deep(.settings-modal.arco-modal-fullscreen .arco-modal-body) {
  max-height: calc(100vh - 64px);
  overflow: auto;
  padding: 24px 32px 40px;
}

.delete-confirm-tip {
  margin: 0 0 8px;
  color: #3a3a3c;
  font-size: 14px;
}

.delete-confirm-list {
  max-height: 240px;
  overflow: auto;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f5f5f7;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-all;
}

.delete-confirm-item+.delete-confirm-item {
  margin-top: 2px;
}
</style>
