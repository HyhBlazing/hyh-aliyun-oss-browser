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
      <a-input ref="addressInputRef" v-model="addressInput" class="addr" size="small" allow-clear placeholder="地址栏 Ctrl+L" @press-enter="browser.go(addressInput)" />
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
      <a-dropdown trigger="click" position="br" :popup-max-height="320" @popup-visible-change="onAccountMenuVisible">
        <button class="icon-btn account-trigger" type="button" :title="currentAccountTip">
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
      <a-input v-model="browser.searchKeyword" class="search" size="small" allow-clear placeholder="当前列表过滤" />
      <a-tooltip content="全局搜索 Ctrl+Shift+F">
        <button class="icon-btn" type="button" @click="openGlobalSearch">
          <icon-search />
        </button>
      </a-tooltip>
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
          <a-tooltip content="完整性校验">
            <button class="icon-btn" type="button" :disabled="!selectedKeys.length" @click="openVerifySelected">
              <icon-safe />
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
          <a-tooltip v-if="canWrite" content="剪切到应用内（Ctrl+X，桶内移动）">
            <button class="icon-btn" type="button" :disabled="!selectedKeys.length" @click="cutSelected">
              <icon-scissor />
            </button>
          </a-tooltip>
          <a-tooltip v-if="canWrite" content="复制到应用内（Ctrl+Shift+C，桶内复制）">
            <button class="icon-btn" type="button" :disabled="!selectedKeys.length" @click="copySelected">
              <icon-copy />
            </button>
          </a-tooltip>
          <a-tooltip content="复制到系统剪贴板（Ctrl+C，可粘贴到桌面/资源管理器）">
            <button class="icon-btn" type="button" :disabled="!selectedKeys.length || !browser.bucket" @click="copySelectedToSystem">
              <icon-export />
            </button>
          </a-tooltip>
          <a-tooltip v-if="canWrite" :content="clipboard.hasItems
            ? clipboard.isCopy
              ? '粘贴：优先本地文件上传，否则桶内复制（Ctrl+V）'
              : '粘贴：优先本地文件上传，否则桶内移动（Ctrl+V）'
            : '粘贴：资源管理器复制的文件将上传到当前目录（Ctrl+V）'
            ">
            <button class="icon-btn" type="button" :disabled="!browser.bucket" @click="smartPaste">
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

    <main ref="listRef" class="list" :class="{ 'is-marquee': marquee.active || marquee.tracking }" @mousedown.capture="onMarqueeMouseDown" @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop.prevent="onDrop" @contextmenu="onListBlankContextMenu">
      <div v-if="dropZoneMode" class="drop-overlay" :class="dropZoneMode === 'ready' ? 'is-ready' : 'is-blocked'" aria-live="polite">
        <div class="drop-overlay-card">
          <icon-upload v-if="dropZoneMode === 'ready'" class="drop-overlay-icon" />
          <icon-exclamation-circle v-else class="drop-overlay-icon" />
          <p class="drop-overlay-title">{{ dropOverlayTitle }}</p>
          <p class="drop-overlay-desc">{{ dropOverlayDesc }}</p>
        </div>
      </div>
      <a-spin :loading="browser.loading" style="width: 100%; height: 100%">
        <a-alert v-if="browser.error" type="error" banner>{{ browser.error }}</a-alert>

        <a-empty v-if="!browser.loading && !browser.error && emptyList" :description="browser.bucket ? '暂无对象' : '暂无 Bucket'" />

        <a-table v-else-if="!browser.bucket && browser.filteredBuckets.length" row-key="name" size="small" :bordered="false" :columns="bucketColumns" :data="browser.filteredBuckets" :pagination="false" :row-selection="rowSelection" v-model:selected-keys="selectedKeys" :scroll="{ y: 'calc(100vh - 96px)' }" @row-click="onBucketRowClick" @row-dblclick="onBucketRow" @row-contextmenu="onBucketContextMenu" @selection-change="onSelectionChange">
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
            <button class="name-cell" type="button" :data-oss-key="record.name" @click="onBucketNameClick($event, record)">
              <icon-storage class="type-icon bucket" />
              <span>{{ record.name }}</span>
            </button>
          </template>
          <template #creationDate="{ record }">
            {{ formatTime(record.creationDate) }}
          </template>
        </a-table>

        <a-table v-else-if="browser.bucket && browser.filteredObjects.length" row-key="name" size="small" :bordered="false" :columns="objectColumns" :data="browser.filteredObjects" :pagination="false" :row-selection="rowSelection" v-model:selected-keys="selectedKeys" :scroll="{ y: 'calc(100vh - 96px)' }" @row-click="onObjectRowClick" @row-dblclick="onObjectDbl" @row-contextmenu="onObjectContextMenu" @selection-change="onSelectionChange">
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
            <div class="name-cell" role="button" tabindex="0" :data-oss-key="record.name" :draggable="isKeySelected(record.name)" title="单击打开；空白处框选；已选中拖到文件夹（首次准备后再次拖出）" :class="{ archived: isArchive(record) }" @click="onNameCellClick($event, record)" @keydown.enter.prevent="record.isFolder ? browser.enterFolder(record) : previewItem(record)" @dragstart="onObjectDragStart($event, record)" @dragend="onObjectDragEnd">
              <img v-if="showThumb && !record.isFolder && isImage(record.name) && thumbMap[record.name]" :src="thumbMap[record.name]" class="type-icon thumb" alt="" @error="onThumbError(record.name)" />
              <icon-folder v-else-if="record.isFolder" class="type-icon folder" />
              <icon-file-image v-else-if="isImage(record.name)" class="type-icon image" />
              <icon-video-camera v-else-if="isVideo(record.name)" class="type-icon video" />
              <icon-code v-else-if="isText(record.name)" class="type-icon text" />
              <icon-file v-else class="type-icon file" />
              <span>{{ displayName(record.name) }}</span>
            </div>
          </template>
          <template #size="{ record }">
            <span :data-oss-key="record.name">{{ record.isFolder ? "-" : formatSize(record.size) }}</span>
          </template>
          <template #storageClass="{ record }">
            <span :data-oss-key="record.name">{{ record.isFolder ? "-" : formatStorageClass(record.storageClass || record.storage_class) }}</span>
          </template>
          <template #lastModified="{ record }">
            <span :data-oss-key="record.name">{{ formatTime(record.lastModified) }}</span>
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
      <div v-if="marquee.visible" class="marquee-box" :style="{
        left: marquee.left + 'px',
        top: marquee.top + 'px',
        width: marquee.width + 'px',
        height: marquee.height + 'px',
      }" />
    </Teleport>

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
            <button class="ctx-item" type="button" :disabled="!canWrite" @click="onBlankCtxPaste">
              <icon-paste class="ctx-ico blue" />粘贴
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
            <button class="ctx-item" type="button" @click="onCtxCopyToSystem">
              <icon-export class="ctx-ico blue" />复制到本地剪贴板
            </button>
            <button class="ctx-item" type="button" :disabled="!canWrite" @click="onCtxCopy">
              <icon-copy class="ctx-ico blue" />复制（桶内）
            </button>
            <button class="ctx-item" type="button" :disabled="!canWrite" @click="onCtxCut">
              <icon-scissor class="ctx-ico blue" />剪切（桶内）
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
            <button class="ctx-item" type="button" @click="onCtxVerify">
              <icon-safe class="ctx-ico green" />完整性校验
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

    <a-modal v-model:visible="openSettings" title="设置" :footer="false" width="60vw" top="10vh" :fullscreen="false" unmount-on-close modal-class="settings-modal" :modal-style="settingsModalStyle" :body-style="settingsModalBodyStyle">
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
    <VerifyModal v-model:visible="verifyModal.visible" :bucket="verifyModal.bucket" :region="verifyModal.region" :object-key="verifyModal.objectKey" :keys="verifyModal.keys" :prefix="verifyModal.prefix" :strip-prefix="verifyModal.stripPrefix" />

    <GlobalSearchModal v-model:visible="showGlobalSearch" :bucket-names="globalSearchBucketNames" :default-bucket="browser.bucket" @batch="onGlobalSearchBatch" />

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
        <AudioSpectrumPlayer v-else-if="preview.kind === 'audio' && preview.key" :url="preview.url" :title="preview.title" :bucket="browser.bucket" :object-key="preview.key" :region="browser.bucketRegion" />
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
import {
  readSystemClipboardFiles,
  writeSystemClipboardFiles,
} from "../lib/system-clipboard";
import { startSearchAutoIndexWatch } from "../lib/search-auto-index-watch";
import { listHistories, type AuthHistoryItem } from "../lib/tauri";
import TransferDock from "../components/TransferDock.vue";
import SettingsPanel from "../components/SettingsPanel.vue";
import GetAddressModal from "../components/GetAddressModal.vue";
import BatchGetAddressModal from "../components/BatchGetAddressModal.vue";
import CreateFolderModal from "../components/CreateFolderModal.vue";
import RenameModal from "../components/RenameModal.vue";
import ObjectAclModal from "../components/ObjectAclModal.vue";
import ObjectMetaModal from "../components/ObjectMetaModal.vue";
import VerifyModal from "../components/VerifyModal.vue";
import GlobalSearchModal from "../components/GlobalSearchModal.vue";
import type { SearchHit } from "../components/GlobalSearchModal.vue";
import RestoreModal from "../components/RestoreModal.vue";
import SymlinkModal from "../components/SymlinkModal.vue";
import BucketAclModal from "../components/BucketAclModal.vue";
import MultipartModal from "../components/MultipartModal.vue";
import VideoPlayer from "../components/VideoPlayer.vue";
import AudioSpectrumPlayer from "../components/AudioSpectrumPlayer.vue";

const auth = useAuthStore();
const browser = useBrowserStore();
const globalSearchBucketNames = computed(() =>
  browser.buckets.map((b) => b.name)
);
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
  const lines = ["点击打开账号菜单，选择后切换"];
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

const addressInput = ref(browser.address);
const addressInputRef = ref<{ focus?: () => void } | null>(null);
const showCreate = ref(false);
const showCreateFolder = ref(false);
const openSettings = ref(false);
/** 弹窗 Teleport 到 body，用内联 style 保证高度约 80vh、上下居中 */
const settingsModalStyle = {
  width: "60vw",
  maxWidth: "60vw",
  height: "80vh",
  maxHeight: "80vh",
  top: "10vh",
  margin: "0 auto",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column" as const,
  borderRadius: "12px",
};
const settingsModalBodyStyle = {
  flex: "1",
  minHeight: "0",
  height: "auto",
  maxHeight: "none",
  overflow: "hidden",
  padding: "12px 20px 16px",
  display: "flex",
  flexDirection: "column" as const,
};
const showFav = ref(false);
const showGlobalSearch = ref(false);

function onSettingsSaved() {
  openSettings.value = false;
  window.setTimeout(() => {
    Message.success("已保存设置");
  }, 120);
}
const dropZoneMode = ref<null | "ready" | "blocked-bucket" | "blocked-readonly">(null);

const dropOverlayTitle = computed(() => {
  if (dropZoneMode.value === "ready") return "松开以上传";
  if (dropZoneMode.value === "blocked-readonly") return "无法上传";
  if (dropZoneMode.value === "blocked-bucket") return "无法上传";
  return "";
});

const dropOverlayDesc = computed(() => {
  if (dropZoneMode.value === "ready") {
    const prefix = browser.prefix ? `当前目录：${browser.prefix}` : "当前 Bucket 根目录";
    return prefix;
  }
  if (dropZoneMode.value === "blocked-readonly") return "当前为只读权限";
  if (dropZoneMode.value === "blocked-bucket") return "请先进入 Bucket 后再拖入文件";
  return "";
});

function setDropZoneFromContext() {
  if (!browser.bucket) {
    dropZoneMode.value = "blocked-bucket";
    return;
  }
  if (!canWrite.value) {
    dropZoneMode.value = "blocked-readonly";
    return;
  }
  dropZoneMode.value = "ready";
}

function clearDropZone() {
  dropZoneMode.value = null;
}
const OSS_DRAG_MIME = "application/x-hyh-oss-keys";
const objectDrag = reactive({
  active: false,
  keys: [] as string[],
  preparing: false,
});
let unlistenNativeDrop: null | (() => void) = null;
let unlistenNativeClipboard: null | (() => void) = null;
const selectedKeys = ref<(string | number)[]>([]);
const listRef = ref<HTMLElement | null>(null);

/** 框选拖拽状态 */
const marquee = reactive({
  tracking: false,
  active: false,
  visible: false,
  additive: false,
  suppressClick: false,
  startClientX: 0,
  startClientY: 0,
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  baseKeys: [] as string[],
});
const MARQUEE_THRESHOLD = 5;
let marqueeRaf = 0;

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
const verifyModal = reactive({
  visible: false,
  bucket: "",
  region: "",
  objectKey: "",
  keys: [] as string[],
  prefix: "",
  stripPrefix: "",
});
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

/** 列表 Shift 连选锚点（按当前可见列表下标） */
let lastSelectIndex = -1;

function onSelectionChange(keys: (string | number)[]) {
  // v-model 已同步 selectedKeys；这里统一成 string 并写回 store
  selectedKeys.value = keys.map((k) => String(k));
  browser.selected = selectedKeys.value.map(String);
  const visible = browser.bucket
    ? browser.filteredObjects.map((o) => o.name)
    : browser.filteredBuckets.map((b) => b.name);
  const lastKey = selectedKeys.value.length
    ? String(selectedKeys.value[selectedKeys.value.length - 1])
    : "";
  lastSelectIndex = lastKey ? visible.indexOf(lastKey) : -1;
}

function applyRowSelect(
  key: string,
  index: number,
  ev: MouseEvent | undefined,
  visibleKeys: string[]
) {
  const cur = new Set(selectedKeys.value.map(String));
  const shift = !!ev?.shiftKey;
  const meta = !!(ev?.ctrlKey || ev?.metaKey);

  if (shift && lastSelectIndex >= 0 && index >= 0 && visibleKeys.length) {
    const from = Math.min(lastSelectIndex, index);
    const to = Math.max(lastSelectIndex, index);
    const next = visibleKeys.slice(from, to + 1);
    selectedKeys.value = next;
  } else if (meta) {
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    selectedKeys.value = [...cur];
    lastSelectIndex = index;
  } else {
    selectedKeys.value = [key];
    lastSelectIndex = index;
  }
  browser.selected = selectedKeys.value.map(String);
}

function onObjectPropClick(record: { name: string }, ev: Event) {
  const e = ev as MouseEvent;
  const target = e.target as HTMLElement | null;
  if (!target) return;
  // 名称列打开/预览；勾选框由表格接管；操作列单独处理；框选结束后不再点选
  if (marquee.suppressClick) return;
  if (target.closest(".arco-checkbox, .name-cell, .row-actions, button, a, input")) return;
  const list = browser.filteredObjects.map((o) => o.name);
  const index = list.indexOf(record.name);
  applyRowSelect(record.name, index, e, list);
}

function onBucketRowClick(record: { name: string }, ev: Event) {
  const e = ev as MouseEvent;
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (marquee.suppressClick) return;
  if (target.closest(".arco-checkbox, .name-cell, button, a, input")) return;
  const list = browser.filteredBuckets.map((b) => b.name);
  const index = list.indexOf(record.name);
  applyRowSelect(record.name, index, e, list);
}

function visibleRowKeys(): string[] {
  return browser.bucket
    ? browser.filteredObjects.map((o) => o.name)
    : browser.filteredBuckets.map((b) => b.name);
}

function collectMarqueeHits(boxClient: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): string[] {
  const root = listRef.value;
  if (!root) return [];

  const order = visibleRowKeys();
  const orderIndex = new Map(order.map((k, i) => [k, i]));
  const hits: string[] = [];
  const seen = new Set<string>();

  // 用名称单元格定位行；勾选固定列时取主表体行矩形
  root.querySelectorAll("[data-oss-key]").forEach((node) => {
    const key = node.getAttribute("data-oss-key") || "";
    if (!key || seen.has(key) || !orderIndex.has(key)) return;
    const row = (node.closest("tr") as HTMLElement | null) || (node as HTMLElement);
    const r = row.getBoundingClientRect();
    if (r.height < 2) return;
    // 行选：竖直方向相交即可（更接近资源管理器手感）
    if (boxClient.bottom < r.top || boxClient.top > r.bottom) return;
    // 水平方向也要求与行有交集，避免误选
    if (boxClient.right < r.left || boxClient.left > r.right) return;
    seen.add(key);
    hits.push(key);
  });

  hits.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
  return hits;
}

function applyMarqueeSelection(hits: string[]) {
  const next = marquee.additive
    ? [...new Set([...marquee.baseKeys, ...hits])]
    : hits.slice();
  selectedKeys.value = next;
  browser.selected = next;
  if (hits.length) {
    lastSelectIndex = visibleRowKeys().indexOf(hits[hits.length - 1]);
  }
}

function updateMarqueeBox(clientX: number, clientY: number) {
  const x1 = marquee.startClientX;
  const y1 = marquee.startClientY;
  // 使用视口坐标 + fixed，避免被表格 stacking context 盖住
  marquee.left = Math.min(x1, clientX);
  marquee.top = Math.min(y1, clientY);
  marquee.width = Math.abs(clientX - x1);
  marquee.height = Math.abs(clientY - y1);
  marquee.visible = true;
  applyMarqueeSelection(
    collectMarqueeHits({
      left: Math.min(x1, clientX),
      top: Math.min(y1, clientY),
      right: Math.max(x1, clientX),
      bottom: Math.max(y1, clientY),
    })
  );
}

function endMarquee(didSelect: boolean) {
  window.removeEventListener("mousemove", onMarqueeMouseMove, true);
  window.removeEventListener("mouseup", onMarqueeMouseUp, true);
  window.removeEventListener("blur", onMarqueeCancel);
  if (marqueeRaf) {
    cancelAnimationFrame(marqueeRaf);
    marqueeRaf = 0;
  }
  const wasActive = marquee.active;
  marquee.tracking = false;
  marquee.active = false;
  marquee.visible = false;
  marquee.width = 0;
  marquee.height = 0;
  if (wasActive && didSelect) {
    marquee.suppressClick = true;
    window.setTimeout(() => {
      marquee.suppressClick = false;
    }, 50);
  }
}

function onMarqueeCancel() {
  endMarquee(false);
}

function onMarqueeMouseMove(e: MouseEvent) {
  if (!marquee.tracking) return;
  const dx = e.clientX - marquee.startClientX;
  const dy = e.clientY - marquee.startClientY;
  if (!marquee.active) {
    if (Math.abs(dx) < MARQUEE_THRESHOLD && Math.abs(dy) < MARQUEE_THRESHOLD) return;
    marquee.active = true;
    marquee.suppressClick = true;
    if (!marquee.additive) {
      selectedKeys.value = [];
      browser.selected = [];
    }
  }
  e.preventDefault();
  e.stopPropagation();
  if (marqueeRaf) cancelAnimationFrame(marqueeRaf);
  const x = e.clientX;
  const y = e.clientY;
  marqueeRaf = requestAnimationFrame(() => {
    marqueeRaf = 0;
    updateMarqueeBox(x, y);
  });
}

function onMarqueeMouseUp(e: MouseEvent) {
  if (!marquee.tracking) return;
  if (marquee.active) {
    updateMarqueeBox(e.clientX, e.clientY);
    endMarquee(true);
  } else {
    endMarquee(false);
  }
}

function isKeySelected(name: string) {
  return selectedKeys.value.map(String).includes(String(name));
}

function onBucketNameClick(e: MouseEvent, record: any) {
  if (marquee.suppressClick) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  onBucketRow(record);
}

function onNameCellClick(e: MouseEvent, record: any) {
  if (marquee.suppressClick) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (record.isFolder) browser.enterFolder(record);
  else previewItem(record);
}

/** 勾选/行内按钮/表头不启动框选 */
function shouldIgnoreMarqueeTarget(target: HTMLElement): boolean {
  return !!target.closest(
    ".arco-checkbox, .row-actions, .arco-table-th, .arco-table-header, .drop-overlay, .ctx-menu, .marquee-box, a, input, textarea, button.icon-btn, button.ctx-item, .col-sort"
  );
}

function keyFromMarqueeTarget(target: HTMLElement): string {
  return (
    target.closest("[data-oss-key]")?.getAttribute("data-oss-key") ||
    target.closest("tr")?.querySelector("[data-oss-key]")?.getAttribute("data-oss-key") ||
    ""
  );
}

function onMarqueeMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  if (marquee.tracking) return;
  if (hasBlockingOverlay()) return;
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const list = listRef.value;
  if (!list || !list.contains(target)) return;
  if (shouldIgnoreMarqueeTarget(target)) return;

  // 已选中的行留给「拖到桌面」；从空白/未选中行仍可框选
  const hitKey = keyFromMarqueeTarget(target);
  if (hitKey && isKeySelected(hitKey) && !e.ctrlKey && !e.metaKey) {
    return;
  }

  // 立刻禁止原生选字
  e.preventDefault();
  window.getSelection()?.removeAllRanges();

  marquee.tracking = true;
  marquee.active = false;
  marquee.visible = false;
  marquee.additive = !!(e.ctrlKey || e.metaKey);
  marquee.baseKeys = marquee.additive ? selectedKeys.value.map(String) : [];
  marquee.startClientX = e.clientX;
  marquee.startClientY = e.clientY;
  marquee.suppressClick = false;

  window.addEventListener("mousemove", onMarqueeMouseMove, true);
  window.addEventListener("mouseup", onMarqueeMouseUp, true);
  window.addEventListener("blur", onMarqueeCancel);
}

function bindMarqueeListeners() {
  // 窗口级捕获：不依赖列表 DOM 是否被 HMR 换掉
  window.removeEventListener("mousedown", onMarqueeMouseDown, true);
  window.addEventListener("mousedown", onMarqueeMouseDown, true);
}

function unbindMarqueeListeners() {
  window.removeEventListener("mousedown", onMarqueeMouseDown, true);
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
    lastSelectIndex = -1;
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

onMounted(() => {
  showThumb.value = localStorage.getItem("hyh-oss-show-thumb") === "YES";
  // 快捷键必须尽早挂上，不能等 bootstrap / 拖放初始化（否则 Ctrl+C 会一直无响应）
  window.addEventListener("keydown", onBrowserShortcut, true);
  window.addEventListener("copy", onWindowCopy, true);
  window.addEventListener("cut", onWindowCut, true);
  window.addEventListener("paste", onWindowPaste, true);
  void setupNativeFileClipboardListener();
  void nextTick(() => bindMarqueeListeners());

  refreshAccountHistories();
  transfer.startListening();
  stopJobFinished = transfer.onJobFinished((job) => {
    onTransferJobFinished(job);
  });
  stopAutoIndexWatch = startSearchAutoIndexWatch();
  void (async () => {
    await browser.bootstrapFromSession();
    loadThumbs();
    await setupNativeFileDrop();
    void nextTick(() => bindMarqueeListeners());
  })();
});

onUnmounted(() => {
  endMarquee(false);
  unbindMarqueeListeners();
  unlistenNativeDrop?.();
  unlistenNativeDrop = null;
  unlistenNativeClipboard?.();
  unlistenNativeClipboard = null;
  stopJobFinished?.();
  stopJobFinished = null;
  stopAutoIndexWatch?.();
  stopAutoIndexWatch = null;
  if (listRefreshTimer) {
    clearTimeout(listRefreshTimer);
    listRefreshTimer = 0;
  }
  window.removeEventListener("keydown", onBrowserShortcut, true);
  window.removeEventListener("copy", onWindowCopy, true);
  window.removeEventListener("cut", onWindowCut, true);
  window.removeEventListener("paste", onWindowPaste, true);
});

let stopJobFinished: null | (() => void) = null;
let stopAutoIndexWatch: null | (() => void) = null;
let listRefreshTimer = 0;

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target.getAttribute("type") || "text").toLowerCase();
    // 表格勾选框/按钮不算“正在输入”
    if (
      ["checkbox", "radio", "button", "submit", "reset", "file", "image", "hidden"].includes(type)
    ) {
      return false;
    }
    return true;
  }
  // 点在 checkbox 包装节点上时，closest 到 arco-checkbox 也不应拦截粘贴上传
  if (target.closest(".arco-checkbox, .arco-radio, .arco-table-td, .arco-table-tr, .arco-table")) {
    // 仍可能落在单元格内的真实输入框（极少），再精确判断
    if (target.closest(".arco-input, .arco-textarea, .arco-input-tag, .arco-select-view, .arco-picker")) {
      return true;
    }
    return false;
  }
  return !!target.closest(
    ".arco-input, .arco-textarea, .arco-input-tag, .arco-select-view, .arco-picker, [contenteditable='true']"
  );
}

/** 输入框内是否有文字选区（此时 Ctrl+C 应复制文字，不抢文件复制） */
function hasInputTextSelection(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    const el = target instanceof HTMLElement ? target.closest("input, textarea") : null;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    return typeof start === "number" && typeof end === "number" && end > start;
  }
  const start = target.selectionStart;
  const end = target.selectionEnd;
  return typeof start === "number" && typeof end === "number" && end > start;
}

/**
 * 文件剪贴板快捷键是否应被输入框拦截。
 * 选中对象后点行/勾选时焦点常仍在过滤框，若一律拦截会导致 Ctrl+C 无效果。
 */
function shouldBlockFileClipboardShortcut(e: KeyboardEvent): boolean {
  if (!isEditableShortcutTarget(e.target)) return false;
  const el = e.target instanceof HTMLElement ? e.target : null;
  // 弹层内输入始终交给文本编辑
  if (
    el?.closest(
      ".arco-modal, .arco-drawer, .arco-image-preview, .arco-trigger-popup, .settings-modal, .global-search-modal, .ctx-menu"
    )
  ) {
    return true;
  }
  // 输入框有文字选区：优先复制/剪切文字
  if (hasInputTextSelection(e.target)) return true;

  const lower = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const isPaste = lower === "v" || e.code === "KeyV";
  // 地址栏粘贴保留给路径文本；复制在已选对象时仍走文件复制
  if (el?.closest(".chrome .addr")) {
    if (isPaste) return true;
    if (!selectedKeys.value.length) return true;
  }
  return false;
}

function hasBlockingOverlay() {
  if (imagePreview.visible || preview.visible) return true;
  if (ctxMenu.visible) return false; // Esc 可关，其它导航仍可用
  if (
    openSettings.value ||
    showFav.value ||
    showCreate.value ||
    showCreateFolder.value ||
    showGlobalSearch.value ||
    pathPrompt.visible ||
    addressModal.visible ||
    batchAddressModal.visible ||
    renameModal.visible ||
    aclModal.visible ||
    metaModal.visible ||
    verifyModal.visible ||
    restoreModal.visible ||
    symlinkModal.visible ||
    bucketAclModal.visible ||
    multipartModal.visible
  ) {
    return true;
  }
  // Arco ImagePreview 关闭后仍挂着 .arco-image-preview（带 -hide），不能仅凭类名判断
  return !!document.querySelector(
    ".arco-image-preview:not(.arco-image-preview-hide)"
  );
}

function focusAddressBar() {
  addressInputRef.value?.focus?.();
  void nextTick(() => {
    const input = document.querySelector(".chrome .addr input") as HTMLInputElement | null;
    input?.focus();
    input?.select();
  });
}

/** 是否应把浏览器原生 copy/cut/paste 转成文件操作 */
function shouldHandleFileClipboardEvent(kind: "copy" | "cut" | "paste"): boolean {
  if (hasBlockingOverlay()) return false;
  const active = document.activeElement;
  if (hasInputTextSelection(active)) return false;
  if (active instanceof HTMLElement) {
    if (
      active.closest(
        ".arco-modal, .arco-drawer, .arco-image-preview, .arco-trigger-popup, .settings-modal, .global-search-modal, .ctx-menu"
      )
    ) {
      return false;
    }
    if (kind === "paste" && active.closest(".chrome .addr")) return false;
    if (
      kind !== "paste" &&
      active.closest(".chrome .addr") &&
      !selectedKeys.value.length
    ) {
      return false;
    }
  }
  if (kind === "paste") return !!browser.bucket && canWrite.value;
  if (kind === "cut") return !!browser.bucket && canWrite.value && selectedKeys.value.length > 0;
  return !!browser.bucket && selectedKeys.value.length > 0;
}

async function copyActiveTextSelection() {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (end <= start) return;
  try {
    await navigator.clipboard.writeText(el.value.slice(start, end));
  } catch (e) {
    console.warn("copy text selection failed", e);
  }
}

async function pasteTextIntoActiveInput() {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    el.value = next;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    const caret = start + text.length;
    el.setSelectionRange(caret, caret);
  } catch (e) {
    console.warn("paste text into input failed", e);
  }
}

/**
 * WebView2 会吞掉 Ctrl+C/V/X，Rust 侧 AcceleratorKeyPressed 转发到此事件。
 */
function onNativeFileClipboard(payload: { action?: string; shift?: boolean } | null) {
  if (!payload?.action) return;
  const action = String(payload.action);
  const shift = !!payload.shift;

  if (hasBlockingOverlay()) return;

  if (action === "copy") {
    if (shift) {
      if (canWrite.value) copySelected();
      return;
    }
    if (!shouldHandleFileClipboardEvent("copy")) {
      void copyActiveTextSelection();
      return;
    }
    void copySelectedToSystem();
    return;
  }

  if (action === "cut") {
    if (!shouldHandleFileClipboardEvent("cut")) {
      // 文本剪切：复制后删除选区
      void (async () => {
        await copyActiveTextSelection();
        const el = document.activeElement;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          const start = el.selectionStart ?? 0;
          const end = el.selectionEnd ?? 0;
          if (end > start) {
            el.value = el.value.slice(0, start) + el.value.slice(end);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.setSelectionRange(start, start);
          }
        }
      })();
      return;
    }
    if (canWrite.value) cutSelected();
    return;
  }

  if (action === "paste") {
    if (shift) {
      if (canWrite.value) void pasteInAppClipboard();
      return;
    }
    if (!shouldHandleFileClipboardEvent("paste")) {
      void pasteTextIntoActiveInput();
      return;
    }
    if (canWrite.value) void smartPaste();
  }
}

async function setupNativeFileClipboardListener() {
  if (!isTauri()) return;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    unlistenNativeClipboard = await listen<{ action?: string; shift?: boolean }>(
      "native-file-clipboard",
      (event) => {
        onNativeFileClipboard(event.payload || null);
      }
    );
  } catch (e) {
    console.warn("native-file-clipboard listener unavailable", e);
  }
}

function onWindowCopy(e: ClipboardEvent) {
  if (!shouldHandleFileClipboardEvent("copy")) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  void copySelectedToSystem();
}

function onWindowCut(e: ClipboardEvent) {
  if (!shouldHandleFileClipboardEvent("cut")) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  cutSelected();
}

function onWindowPaste(e: ClipboardEvent) {
  if (!shouldHandleFileClipboardEvent("paste")) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  void smartPaste();
}

function onBrowserShortcut(e: KeyboardEvent) {
  const key = e.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  const mod = e.ctrlKey || e.metaKey;
  const alt = e.altKey;
  const shift = e.shiftKey;
  const isFileClipKey =
    mod &&
    !alt &&
    (e.code === "KeyC" ||
      e.code === "KeyX" ||
      e.code === "KeyV" ||
      lower === "c" ||
      lower === "x" ||
      lower === "v");

  // 中文输入法 composing 时仍放行 Ctrl+C/X/V；其它键保持原逻辑
  if (!isFileClipKey && (e.defaultPrevented || e.isComposing)) return;
  if (isFileClipKey && e.defaultPrevented) return;

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

  // 文件剪贴板：选中后即使焦点在过滤框也要生效；其它快捷键仍避开输入态
  if (isFileClipKey) {
    if (hasBlockingOverlay() || shouldBlockFileClipboardShortcut(e)) return;
  } else if (typing || hasBlockingOverlay()) {
    return;
  }

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
    return;
  }

  // 全局搜索：Ctrl+Shift+F
  if (mod && shift && !alt && (lower === "f" || e.code === "KeyF")) {
    e.preventDefault();
    openGlobalSearch();
    return;
  }

  // Ctrl+X：桶内剪切；Ctrl+C：复制到系统剪贴板；Ctrl+Shift+C：桶内复制
  // 注：普通 Ctrl+C/V/X 也由 copy/cut/paste 事件兜底（WebView 有时不派发 keydown）
  if (mod && !alt && !shift && (lower === "x" || e.code === "KeyX")) {
    e.preventDefault();
    e.stopPropagation();
    if (canWrite.value) cutSelected();
    return;
  }
  if (mod && !alt && !shift && (lower === "c" || e.code === "KeyC")) {
    e.preventDefault();
    e.stopPropagation();
    void copySelectedToSystem();
    return;
  }
  if (mod && !alt && shift && (lower === "c" || e.code === "KeyC")) {
    e.preventDefault();
    e.stopPropagation();
    if (canWrite.value) copySelected();
    return;
  }
  // Ctrl+V：智能粘贴（本地文件优先上传）；Ctrl+Shift+V：仅桶内粘贴
  if (mod && !alt && !shift && (lower === "v" || e.code === "KeyV")) {
    e.preventDefault();
    e.stopPropagation();
    if (canWrite.value) void smartPaste();
    return;
  }
  if (mod && !alt && shift && (lower === "v" || e.code === "KeyV")) {
    e.preventDefault();
    e.stopPropagation();
    if (canWrite.value) void pasteInAppClipboard();
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
  if (job.status !== "finished" && job.status !== "verifying") return;
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
        setDropZoneFromContext();
      } else if (payload.type === "leave" || (payload as { type: string }).type === "cancel") {
        clearDropZone();
      } else if (payload.type === "drop") {
        clearDropZone();
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

function openVerifySelected() {
  const keys = selectedKeys.value.map(String);
  if (!keys.length) {
    Message.warning("请先选择对象或目录");
    return;
  }
  if (keys.length === 1) {
    const rec = browser.filteredObjects.find((o: any) => o.name === keys[0]);
    if (rec?.isFolder) {
      const prefix = keys[0].endsWith("/") ? keys[0] : `${keys[0]}/`;
      openVerifyModal({ prefix, stripPrefix: prefix });
      return;
    }
    openVerifyModal({ objectKey: keys[0] });
    return;
  }
  // 多选：文件直接校验；若含目录则用当前前缀作为 strip，仅校验选中的非目录项
  const fileKeys = keys.filter((k) => {
    const rec = browser.filteredObjects.find((o: any) => o.name === k);
    return !rec?.isFolder && !k.endsWith("/");
  });
  if (!fileKeys.length) {
    Message.warning("请选择文件，或单独选择一个目录做批量校验");
    return;
  }
  openVerifyModal({
    keys: fileKeys,
    stripPrefix: browser.prefix || "",
  });
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
  const types = e.dataTransfer?.types ? Array.from(e.dataTransfer.types) : [];
  // 仅外部文件拖入高亮；内部对象拖拽不触发上传态
  if (types.includes("Files") && !types.includes(OSS_DRAG_MIME)) {
    setDropZoneFromContext();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = dropZoneMode.value === "ready" ? "copy" : "none";
    }
  }
}

function onDragLeave(e: DragEvent) {
  // 离开到子元素时不清除，避免闪烁
  const related = e.relatedTarget as Node | null;
  const list = e.currentTarget as HTMLElement | null;
  if (list && related && list.contains(related)) return;
  clearDropZone();
}

async function handleUploadPaths(paths: string[]) {
  clearDropZone();
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
    if (result.queued <= 0 && result.skipped <= 0) return;
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
  clearDropZone();
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
  // 框选进行中时不要启动拖出下载
  if (marquee.tracking || marquee.active) {
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

  // 桌面端：先拖到目标文件夹松手，再识别路径并入队下载（不预先下载）
  if (isTauri()) {
    e.preventDefault();
    void beginDragOutToFolder(keys);
  }
}

/** 剪贴板：同步下载到临时目录，返回本地路径 */
async function prepareLocalPathsForKeys(
  keys: string[],
  tempFolder: string,
  opts?: { showPanel?: boolean }
): Promise<string[]> {
  if (!browser.bucket || !keys.length) return [];
  const { tempDir, join } = await import("@tauri-apps/api/path");
  const { invoke } = await import("@tauri-apps/api/core");
  const base = await tempDir();
  const localDir = await join(base, tempFolder, String(Date.now()));
  if (opts?.showPanel !== false) {
    transfer.openPanel("download");
  }
  await transfer.refresh();
  const res = await api.downloadNow({
    bucket: browser.bucket,
    keys,
    localDir,
    ...(browser.bucketRegion ? { region: browser.bucketRegion } : {}),
    stripPrefix: browser.prefix || "",
  });
  await transfer.refresh();
  const paths = (res.data?.paths || []).filter(Boolean);
  if (!paths.length) return [];
  const alive = await invoke<boolean>("paths_exist", { paths });
  if (!alive) {
    throw new Error("临时文件未就绪，请重试或改用下载按钮");
  }
  return paths;
}

/**
 * 拖出到文件夹：松手后再解析目标路径并加入下载队列。
 * 不预先下载到临时目录。
 */
async function beginDragOutToFolder(keys: string[]) {
  if (!browser.bucket || !keys.length || objectDrag.preparing) return;
  objectDrag.preparing = true;
  Message.info({ content: "拖到文件夹或桌面后松开，将加入下载队列", duration: 2000 });
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const dir = await invoke<string>("await_drop_folder_path");
    if (!dir) return;
    rememberDownloadDirectory(dir);
    const result = await transfer.download(
      browser.bucket,
      keys,
      dir,
      browser.bucketRegion,
      browser.prefix || ""
    );
    if (result.queued > 0) {
      Message.success(`已加入下载队列 ${result.queued} 个 → ${dir}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("CANCELLED")) {
      Message.info("请拖到窗口外的文件夹或桌面后再松开");
    } else if (msg.includes("UNRECOGNIZED")) {
      Message.warning(
        "未识别到目标文件夹。请先打开资源管理器并进入目标目录，再拖到该窗口或桌面松开"
      );
    } else {
      Message.error(msg || "拖拽下载失败");
    }
  } finally {
    objectDrag.preparing = false;
    objectDrag.active = false;
    objectDrag.keys = [];
  }
}

function onObjectDragEnd() {
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
  lastSelectIndex = browser.filteredObjects.findIndex((o) => o.name === record.name);
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

function onBlankCtxPaste() {
  closeCtxMenu();
  if (!canWrite.value) return;
  void smartPaste();
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

function onCtxCopyToSystem() {
  const rec = ctxMenu.record;
  closeCtxMenu();
  if (!rec) return;
  const key = String(rec.name || "");
  const selected = selectedKeys.value.map(String);
  const keys = selected.includes(key) && selected.length ? selected : [key];
  void copyKeysToSystem(keys);
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

function openVerifyModal(opts: {
  objectKey?: string;
  keys?: string[];
  prefix?: string;
  stripPrefix?: string;
}) {
  if (!browser.bucket) {
    Message.warning("请先选择 Bucket");
    return;
  }
  verifyModal.bucket = browser.bucket;
  verifyModal.region = browser.bucketRegion || "";
  verifyModal.objectKey = opts.objectKey || "";
  verifyModal.keys = opts.keys || [];
  verifyModal.prefix = opts.prefix || "";
  verifyModal.stripPrefix = opts.stripPrefix || "";
  verifyModal.visible = true;
}

function onCtxVerify() {
  const rec = ctxMenu.record;
  closeCtxMenu();
  if (!rec) return;
  if (rec.isFolder) {
    const prefix = String(rec.name || "").endsWith("/")
      ? String(rec.name)
      : `${rec.name}/`;
    openVerifyModal({
      prefix,
      stripPrefix: prefix,
    });
    return;
  }
  openVerifyModal({ objectKey: rec.name });
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

function openGlobalSearch() {
  showGlobalSearch.value = true;
}

function parentPrefixOfKey(key: string) {
  const k = String(key || "");
  const i = k.lastIndexOf("/");
  if (i < 0) return "";
  return k.slice(0, i + 1);
}

function groupSearchHitsByBucket(items: SearchHit[]) {
  const map = new Map<string, SearchHit[]>();
  for (const it of items) {
    const list = map.get(it.bucket) || [];
    list.push(it);
    map.set(it.bucket, list);
  }
  return map;
}

async function onGlobalSearchBatch(
  action: "download" | "delete" | "address" | "verify" | "open",
  items: SearchHit[]
) {
  if (!items.length) return;
  if (action === "open") {
    const first = items[0];
    const prefix = parentPrefixOfKey(first.key);
    showGlobalSearch.value = false;
    await browser.go(`oss://${first.bucket}/${prefix}`);
    return;
  }

  if (action === "address") {
    const groups = groupSearchHitsByBucket(items);
    if (groups.size > 1) {
      Message.warning("获取地址请选择同一 Bucket 内的对象");
      return;
    }
    const [bucket, list] = [...groups.entries()][0];
    if (bucket !== browser.bucket) {
      await browser.go(`oss://${bucket}/`);
    }
    openBatchAddressWithKeys(list.map((i) => i.key));
    return;
  }

  if (action === "verify") {
    const groups = groupSearchHitsByBucket(items);
    if (groups.size > 1) {
      Message.warning("完整性校验请选择同一 Bucket 内的对象");
      return;
    }
    const [bucket, list] = [...groups.entries()][0];
    const region = browser.resolveRegionFor(bucket) || "";
    verifyModal.bucket = bucket;
    verifyModal.region = region;
    verifyModal.prefix = "";
    verifyModal.stripPrefix = "";
    if (list.length === 1) {
      verifyModal.objectKey = list[0].key;
      verifyModal.keys = [];
    } else {
      verifyModal.objectKey = "";
      verifyModal.keys = list.map((i) => i.key);
    }
    verifyModal.visible = true;
    return;
  }

  if (action === "download") {
    try {
      const dir = await resolveDownloadDirectory(askLocalPath, { preferPrompt: true });
      if (!dir) return;
      rememberDownloadDirectory(dir);
      let queued = 0;
      for (const [bucket, list] of groupSearchHitsByBucket(items)) {
        const region = browser.resolveRegionFor(bucket) || undefined;
        const result = await transfer.download(
          bucket,
          list.map((i) => i.key),
          dir,
          region,
          ""
        );
        queued += result.queued;
      }
      Message.success(`已加入下载队列 ${queued} 个 → ${dir}`);
    } catch (e) {
      Message.error(e instanceof Error ? e.message : "下载失败");
    }
    return;
  }

  if (action === "delete") {
    if (!canWrite.value) {
      Message.warning("当前为只读权限");
      return;
    }
    const names = items.map((i) => i.key);
    Modal.warning({
      title: "确认删除",
      content: deleteConfirmContent(names),
      hideCancel: false,
      onOk: async () => {
        try {
          for (const [bucket, list] of groupSearchHitsByBucket(items)) {
            const region = browser.resolveRegionFor(bucket) || undefined;
            await api.deleteObjects({
              bucket,
              keys: list.map((i) => i.key),
              region,
            });
          }
          Message.success("已删除");
          await browser.refresh();
        } catch (e) {
          Message.error(e instanceof Error ? e.message : "删除失败");
        }
      },
    });
  }
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
    if (result.queued <= 0 && result.skipped <= 0) return;
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

let downloadBusy = false;

async function startDownload(keys: string[], opts?: { chooseDir?: boolean }) {
  if (!keys.length) {
    Message.warning("请先选择要下载的对象");
    return;
  }
  if (downloadBusy) return;
  downloadBusy = true;
  try {
    const dir = await resolveDownloadDirectory(askLocalPath, {
      preferPrompt: !!opts?.chooseDir,
    });
    if (!dir) return;
    rememberDownloadDirectory(dir);
    const result = await transfer.download(
      browser.bucket,
      keys,
      dir,
      browser.bucketRegion,
      browser.prefix || ""
    );
    if (result.queued > 0) {
      Message.success(`已加入下载队列 ${result.queued} 个 → ${dir}`);
    }
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "下载失败");
  } finally {
    downloadBusy = false;
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
  Message.success(`已剪切 ${keys.length} 项，请切换目录后粘贴（Ctrl+Shift+V）`);
}

function copySelected() {
  const keys = selectedKeys.value.map(String);
  if (!keys.length) {
    Message.warning("请先选择对象");
    return;
  }
  clipboard.copy(clipboardPayload(keys));
  Message.success(`已复制 ${keys.length} 项到应用内，请切换目录后 Ctrl+Shift+V 粘贴`);
}

function copySelectedToSystem() {
  void copyKeysToSystem(selectedKeys.value.map(String));
}

let copyToSystemBusy = false;

async function copyKeysToSystem(keys: string[]) {
  if (!keys.length) {
    Message.warning("请先选择对象");
    return;
  }
  if (!browser.bucket) {
    Message.warning("请先进入 Bucket");
    return;
  }
  if (!isTauri()) {
    Message.warning("复制到系统剪贴板需在桌面客户端中使用");
    return;
  }
  if (copyToSystemBusy) return;
  copyToSystemBusy = true;
  const loadingMsg = Message.loading({ content: "正在下载到剪贴板，进度见传输列表…", duration: 0 });
  try {
    const paths = await prepareLocalPathsForKeys(keys, "hyh-oss-clipboard", { showPanel: true });
    if (!paths.length) throw new Error("没有可复制的文件");
    await writeSystemClipboardFiles(paths);
    Message.success(`已复制 ${paths.length} 项到系统剪贴板，可在桌面或资源管理器中粘贴`);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : "复制到系统剪贴板失败");
  } finally {
    try {
      loadingMsg?.close?.();
    } catch {
      /* ignore */
    }
    copyToSystemBusy = false;
  }
}

function cutOne(record: any) {
  clipboard.cut(clipboardPayload([record.name]));
  Message.success("已剪切，请切换目录后 Ctrl+Shift+V 粘贴");
}

function copyOne(record: any) {
  clipboard.copy(clipboardPayload([record.name]));
  Message.success("已复制到应用内，请切换目录后 Ctrl+Shift+V 粘贴");
}

/** 智能粘贴：优先系统剪贴板本地文件上传，否则桶内移动/复制 */
async function smartPaste() {
  if (!canWrite.value) {
    Message.warning("当前为只读权限");
    return;
  }
  if (!browser.bucket) {
    Message.warning("请先进入目标 Bucket");
    return;
  }
  if (isTauri()) {
    try {
      const paths = await readSystemClipboardFiles();
      if (paths.length) {
        await handleUploadPaths(paths);
        return;
      }
    } catch (e) {
      console.warn("read system clipboard failed", e);
    }
  }
  await pasteInAppClipboard();
}

async function pasteInAppClipboard() {
  const clip = clipboard.item;
  if (!clip?.keys.length) {
    Message.warning(
      isTauri()
        ? "剪切板中没有可粘贴内容（可先在资源管理器复制文件，或在应用内复制对象）"
        : "应用内剪切板为空"
    );
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

function onThumbError(key: string) {
  if (!key) return;
  delete thumbMap[key];
  delete imageUrlCache[key];
  delete imageUrlCacheAt[key];
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
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #fff;
  /* 永久禁止列表文字选中，否则拖拽会变成蓝底选字而不是框选 */
  user-select: none !important;
  -webkit-user-select: none !important;
}

.list :deep(.arco-table),
.list :deep(.arco-table-td),
.list :deep(.arco-table-cell),
.list :deep(.name-cell),
.list :deep(.name-cell *) {
  user-select: none !important;
  -webkit-user-select: none !important;
}

/* 未选中时禁止原生拖图；已选中名称列可拖到桌面 */
.list :deep(.name-cell:not([draggable="true"])),
.list :deep(.name-cell:not([draggable="true"]) *) {
  -webkit-user-drag: none;
}

.list.is-marquee {
  cursor: crosshair;
  touch-action: none;
}

.list.is-marquee :deep(.arco-table-td),
.list.is-marquee :deep(.name-cell) {
  cursor: crosshair;
}

.marquee-box {
  position: fixed;
  z-index: 10000;
  box-sizing: border-box;
  border: 1px solid rgba(0, 122, 255, 0.75);
  background: rgba(0, 122, 255, 0.16);
  border-radius: 2px;
  pointer-events: none;
}

.list :deep(.type-icon),
.list :deep(.name-cell img),
.list :deep(.name-cell svg) {
  pointer-events: none;
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

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  backdrop-filter: blur(1px);
}

.drop-overlay.is-ready {
  background: rgba(0, 122, 255, 0.1);
  box-shadow: inset 0 0 0 2px #007aff;
}

.drop-overlay.is-blocked {
  background: rgba(255, 159, 10, 0.12);
  box-shadow: inset 0 0 0 2px #ff9f0a;
}

.drop-overlay-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 220px;
  max-width: min(420px, 86%);
  padding: 20px 28px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.08);
  text-align: center;
}

.drop-overlay.is-ready .drop-overlay-card {
  border: 1px solid rgba(0, 122, 255, 0.35);
}

.drop-overlay.is-blocked .drop-overlay-card {
  border: 1px solid rgba(255, 159, 10, 0.4);
}

.drop-overlay-icon {
  font-size: 28px;
  margin-bottom: 4px;
}

.drop-overlay.is-ready .drop-overlay-icon {
  color: #007aff;
}

.drop-overlay.is-blocked .drop-overlay-icon {
  color: #ff9f0a;
}

.drop-overlay-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1d1d1f;
}

.drop-overlay-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: #6e6e73;
  word-break: break-all;
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
  cursor: pointer;
  text-align: left;
  font: inherit;
  outline: none;
}

.name-cell[draggable="true"]:active {
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

<style>
/* Modal 挂到 body，需非 scoped 才能命中 */
.arco-modal-wrapper:has(.arco-modal.settings-modal) {
  overflow: hidden !important;
}

.arco-modal.settings-modal {
  width: 60vw !important;
  max-width: 60vw !important;
  height: 80vh !important;
  max-height: 80vh !important;
  top: 10vh !important;
  margin: 0 auto !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  border-radius: 12px;
  box-sizing: border-box;
}

.arco-modal.settings-modal .arco-modal-header {
  flex-shrink: 0;
}

.arco-modal.settings-modal .arco-modal-body {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}

.arco-modal.settings-modal .arco-modal-body>* {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
</style>
