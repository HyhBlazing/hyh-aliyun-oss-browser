angular
  .module("web")
  .filter("canSetHeader", function () {
    return (sel) =>
      sel && sel.has && sel.has.length && sel.has.every((f) => !f.isFolder);
  })
  .controller("filesCtrl", [
    "$scope",
    "$rootScope",
    "$uibModal",
    "$timeout",
    "$translate",
    "$sce",
    "$state",
    "$filter",
    "AuthInfo",
    "ossSvs2",
    "settingsSvs",
    "fileSvs",
    "safeApply",
    "Toast",
    "Dialog",
    "Fav",
    function (
      $scope,
      $rootScope,
      $modal,
      $timeout,
      $translate,
      $sce,
      $state,
      $filter,
      AuthInfo,
      ossSvs2,
      settingsSvs,
      fileSvs,
      safeApply,
      Toast,
      Dialog,
      Fav,
    ) {
      var T = $translate.instant;

      Fav.purgeInvalid();

      angular.extend($scope, {
        ref: {
          isBucketList: false,
        },

        keepMoveOptions: null,
        isMac: os.platform() == "darwin",

        isReadOnlyAuth: isReadOnlyAuth,
        isNonStsAuth: isNonStsAuth,

        sch: {
          bucketName: "",
          objectName: "",
        },
        searchObjectName: searchObjectName,
        objects: [],
        nextObjectsMarker: null,
        loadingNext: false,

        goIn: goIn,
        favFolder: favFolder,
        isFavFolderItem: isFavFolderItem,

        transVisible: localStorage.getItem("transVisible") == "true",
        toggleTransVisible: function (f) {
          $scope.transVisible = f;
          localStorage.setItem("transVisible", f);
        },

        // object 相关
        showAddFolder: showAddFolder,
        showDeleteFiles: showDeleteFiles,
        showRestoreBatch: showRestoreBatch,
        showDeleteFilesSelected: showDeleteFilesSelected,
        showRename: showRename,
        showMove: showMove,
        showSymlink: showSymlink,

        // bucket相关
        showDeleteBucket: showDeleteBucket,
        showAddBucket: showAddBucket,
        showUpdateBucket: showUpdateBucket,
        showBucketMultipart: showBucketMultipart,

        // 全选相关
        sel: {
          hasArchive: false,
          all: false, // boolean
          has: false, // [] item: ossObject={name,path,...}
          x: {}, // {} {'i_'+$index, true|false}
        },
        selectAll: selectAll,
        selectChanged: selectChanged,
        onObjectCheckClick: onObjectCheckClick,
        itemKey: itemKey,
        isObjectSelected: isObjectSelected,

        // bucket 单选
        bucket_sel: {
          item: null,
        },
        selectBucket: selectBucket,

        // 上传， 下载
        handlers: {
          uploadFilesHandler: null,
          downloadFilesHandler: null,
        },
        handlerDrop: handlerDrop, // 拖拽释放
        showUploadDialog: showUploadDialog,
        showDownloadDialog: showDownloadDialog,

        // 预览 编辑
        showPreview: showPreview,
        // item 下载
        showDownload: showDownload,

        // 授权
        showGrant: showGrant,
        showGrantToken: showGrantToken,
        showUserList: showUserList,
        // 地址
        showAddress: showAddress,
        showACL: showACL,

        showHttpHeaders: showHttpHeaders,

        showRestore: showRestore,

        loadNext: loadNext,

        showPaste: showPaste,
        cancelPaste: cancelPaste,
        getCurrentOssPath: getCurrentOssPath,

        mock: {
          uploads: "",
          downloads: "",
          uploadsChange: uploadsChange,
          downloadsChange: downloadsChange,
        },

        objectLengthI18nTip: "",
        loadObjectSymlinkMeta,
        getSymlinkTooltipTpl,

        tableSort: {
          bucket: { field: "name", reverse: true },
          file: { field: "name", reverse: true },
        },
        sortBy: sortBy,
        getSortIcon: getSortIcon,
        fileOrderBy: fileOrderBy,
      });

      function isReadOnlyAuth() {
        return ($scope.currentAuthInfo || {}).privilege === "readOnly";
      }

      function isNonStsAuth() {
        var id = ($scope.currentAuthInfo || {}).id || "";

        return id.indexOf("STS.") !== 0;
      }

      function canWriteSelection() {
        return !!$scope.sel.has && !isReadOnlyAuth();
      }

      function sortBy(type, field) {
        var sort = $scope.tableSort[type];

        if (sort.field === field) {
          sort.reverse = !sort.reverse;
        } else {
          sort.field = field;
          sort.reverse = false;
        }
      }

      function getSortIcon(type, field) {
        var sort = $scope.tableSort[type];

        if (sort.field !== field) {
          return "fa-sort";
        }

        return sort.reverse ? "fa-sort-desc" : "fa-sort-asc";
      }

      function fileOrderBy() {
        return ["-isFolder", $scope.tableSort.file.field];
      }

      function itemKey(item) {
        if (!item) {
          return "";
        }

        return item.path || item.name || "";
      }

      // 与列表 orderBy 保持一致，避免选中索引和可见行错位
      function getVisibleObjects() {
        return $filter("orderBy")(
          $scope.objects || [],
          fileOrderBy(),
          $scope.tableSort.file.reverse,
        );
      }

      function isObjectSelected(item) {
        return !!$scope.sel.x[itemKey(item)];
      }

      $scope.fileSpacerMenuOptions = [];

      if ($scope.isMac) {
        $scope.fileSpacerMenuOptions.push([
          function () {
            return '<i class="fa fa-upload text-info"></i> ' + T("upload");
          },
          function () {
            showUploadDialog();
          },
          function () {
            return !isReadOnlyAuth();
          },
        ]);
      } else {
        $scope.fileSpacerMenuOptions.push(
          [
            function () {
              return '<i class="fa fa-upload text-info"></i> ' + T("file");
            },
            function () {
              showUploadDialog();
            },
            function () {
              return !isReadOnlyAuth();
            },
          ],
          [
            function () {
              return '<i class="fa fa-upload text-info"></i> ' + T("folder");
            },
            function () {
              showUploadDialog(true);
            },
            function () {
              return !isReadOnlyAuth();
            },
          ],
        );
      }

      $scope.fileSpacerMenuOptions = $scope.fileSpacerMenuOptions.concat([
        [
          function () {
            return (
              '<i class="glyphicon glyphicon-plus text-success"></i> ' +
              T("folder.create")
            );
          },
          function () {
            showAddFolder();
          },
          function () {
            return !isReadOnlyAuth();
          },
        ],
        [
          function () {
            return (
              '<i class="fa fa-paste text-primary"></i> ' +
              T("paste") +
              ($scope.keepMoveOptions
                ? "(" + $scope.keepMoveOptions.items.length + ")"
                : "")
            );
          },
          function () {
            showPaste();
          },
          function () {
            return $scope.keepMoveOptions;
          },
        ],
      ]);

      $scope.fileMenuOptions = function (item, $index) {
        if (!isObjectSelected(item)) {
          $scope.sel.x = {};
          $scope.sel.x[itemKey(item)] = true;
          selectChanged(null, item);
        }

        return [
          [
            function () {
              return getFavMenuLabel(item);
            },
            function ($itemScope, $event, modelValue, text, $li) {
              favFolder(item, $li);

              return false;
            },
            function () {
              return item.isFolder && isNonStsAuth();
            },
          ],
          [
            function () {
              return (
                '<i class="fa fa-download text-primary"></i> ' + T("download")
              );
            },
            function () {
              showDownloadDialog();
            },
            function () {
              return $scope.sel.has;
            },
          ],
          [
            function () {
              return '<i class="fa fa-clone text-primary"></i> ' + T("copy");
            },
            function () {
              showMove($scope.sel.has, true);
            },
            function () {
              return canWriteSelection();
            },
          ],
          [
            function () {
              return '<i class="fa fa-cut text-primary"></i> ' + T("move");
            },
            function () {
              showMove($scope.sel.has);
            },
            function () {
              return canWriteSelection();
            },
          ],
          [
            function () {
              return '<i class="fa fa-edit text-info"></i> ' + T("rename");
            },
            function () {
              showRename($scope.sel.has[0]);
            },
            function () {
              return (
                $scope.sel.has &&
                $scope.sel.has.length == 1 &&
                !isReadOnlyAuth() &&
                $scope.sel.has[0].storageClass != "Archive"
              );
            },
          ],
          [
            function () {
              return '<i class="fa fa-shield text-success"></i> ' + T("acl");
            },
            function () {
              showACL($scope.sel.has[0]);
            },
            function () {
              return (
                $scope.sel.has &&
                $scope.sel.has.length == 1 &&
                !$scope.sel.has[0].isFolder &&
                !isReadOnlyAuth()
              );
            },
          ],
          [
            function () {
              return (
                '<i class="fa fa-shield text-warning"></i> ' + T("simplePolicy")
              );
            },
            function () {
              showGrant($scope.sel.has);
            },
            function () {
              return $scope.sel.has && isNonStsAuth();
            },
          ],
          [
            function () {
              return (
                '<i class="fa fa-shield text-success"></i> ' + T("genAuthToken")
              );
            },
            function () {
              showGrantToken($scope.sel.has[0]);
            },
            function () {
              return (
                $scope.sel.has &&
                $scope.sel.has.length == 1 &&
                $scope.sel.has[0].isFolder &&
                isNonStsAuth()
              );
            },
          ],
          [
            function () {
              return '<i class="fa fa-download"></i> ' + T("getAddress");
            },
            function () {
              showAddress($scope.sel.has[0]);
            },
            function () {
              return (
                $scope.sel.has &&
                $scope.sel.has.length == 1 &&
                !$scope.sel.has[0].isFolder &&
                isNonStsAuth()
              );
            },
          ],
          [
            function () {
              return '<i class="fa fa-cog"></i> ' + T("http.headers");
            },
            function () {
              showHttpHeaders($scope.sel.has);
            },
            function () {
              return (
                $scope.sel.has &&
                $scope.sel.has.length &&
                $scope.sel.has.every(function (f) {
                  return !f.isFolder;
                })
              );
            },
          ],
          [
            function () {
              return '<i class="fa fa-link"></i>' + T("file.op.set_symlink");
            },
            function () {
              showSymlink($scope.sel.has[0]);
            },
            function () {
              return (
                $scope.sel.has &&
                $scope.sel.has.length === 1 &&
                !$scope.sel.has[0].isFolder &&
                $scope.sel.has[0].type !== "Symlink"
              );
            },
          ],
          [
            function () {
              return '<i class="fa fa-remove text-danger"></i> ' + T("delete");
            },
            function () {
              showDeleteFilesSelected();
            },
            function () {
              return canWriteSelection();
            },
          ],
        ];
      };

      $scope.bucketSpacerMenuOptions = [
        [
          function () {
            return (
              '<i class="glyphicon glyphicon-plus text-success"></i> ' +
              T("bucket.add")
            );
          },
          function () {
            showAddBucket();
          },
        ],
      ];

      $scope.bucketMenuOptions = [
        [
          function ($itemScope) {
            $scope.bucket_sel.item = $itemScope.item;

            return '<i class="fa fa-copy"></i> ' + T("bucket.multipart");
          },
          function () {
            showBucketMultipart($scope.bucket_sel.item);
          },
        ],
        [
          function ($itemScope) {
            $scope.bucket_sel.item = $itemScope.item;

            return '<i class="fa fa-shield text-success"></i> ' + T("acl");
          },
          function () {
            showUpdateBucket($scope.bucket_sel.item);
          },
        ],
        [
          function ($itemScope) {
            $scope.bucket_sel.item = $itemScope.item;

            return (
              '<i class="fa fa-shield text-warning"></i> ' + T("simplePolicy")
            );
          },
          function () {
            showGrant([$scope.bucket_sel.item]);
          },
        ],
        [
          function ($itemScope) {
            $scope.bucket_sel.item = $itemScope.item;

            return '<i class="fa fa-remove text-danger"></i> ' + T("delete");
          },
          function () {
            showDeleteBucket($scope.bucket_sel.item);
          },
        ],
      ];

      // ///////////////////////////////

      var tid_uploads;

      function uploadsChange() {
        $timeout.cancel(tid_uploads);
        tid_uploads = $timeout(function () {
          if ($scope.mock.uploads) {
            var arr = $scope.mock.uploads.split(",");

            $scope.handlers.uploadFilesHandler(arr, $scope.currentInfo);
          }
        }, 600);
      }
      var tid_downloads;

      function downloadsChange() {
        $timeout.cancel(tid_downloads);
        tid_downloads = $timeout(function () {
          if ($scope.mock.downloads) {
            _downloadMulti($scope.mock.downloads);
          }
        }, 600);
      }

      var ttid;

      $scope.$on("needrefreshfilelists", function (e) {
        console.log("on:needrefreshfilelists");
        $timeout.cancel(ttid);
        ttid = $timeout(function () {
          goIn($scope.currentInfo.bucket, $scope.currentInfo.key);
        }, 600);
      });

      $timeout(init, 100);

      function init() {
        var authInfo = AuthInfo.get() || {};

        $rootScope.currentAuthInfo = authInfo;

        // 未登录时不要挂在 Bucket 列表请求上，否则会一直转圈
        if (!authInfo.id) {
          $scope.isLoading = false;
          $state.go("login");

          return;
        }

        if (authInfo.osspath) {
          $scope.ref.isBucketList = false;
          $rootScope.bucketMap = {};
          var bucket = ossSvs2.parseOSSPath(authInfo.osspath).bucket;

          $rootScope.bucketMap[bucket] = {
            region: authInfo.region,
          };
        } else {
          $scope.ref.isBucketList = true;
        }

        // 先注册事件再通知地址栏，由地址栏驱动列表加载，避免卡在 listBuckets 回调
        $timeout(function () {
          addEvents();
          $scope.$broadcast("filesViewReady");
        });
      }

      // 按名称过滤
      var ttid2;
      var lastListedPath = null;
      var listFilesRequestId = 0;

      function clearObjectSearch() {
        $timeout.cancel(ttid2);
        $scope.sch.objectName = "";
      }

      function getListInfo(baseInfo) {
        var info = angular.copy(baseInfo || $scope.currentInfo);

        if ($scope.sch.objectName) {
          info.key += $scope.sch.objectName;
        }

        return info;
      }

      function searchObjectName() {
        $timeout.cancel(ttid2);
        ttid2 = $timeout(function () {
          listFiles(getListInfo());
        }, 600);
      }

      function addEvents() {
        $scope.$on("ossAddressChange", function (e, addr, forceRefresh) {
          var info = ossSvs2.parseOSSPath(addr);
          var fileName;

          if (info.key) {
            var lastGan = info.key.lastIndexOf("/");

            if (info.key && lastGan != info.key.length - 1) {
              // if not endswith /
              fileName = info.key.substring(lastGan + 1);
              info.key = info.key.substring(0, lastGan + 1);
            }
          }

          $scope.currentInfo = info;

          if (info.bucket) {
            // has bucket , list objects
            $scope.currentBucket = info.bucket;

            if (!$rootScope.bucketMap[info.bucket]) {
              Toast.error("No permission");
              clearObjectsList();
              return;
            }

            info.region = $rootScope.bucketMap[info.bucket].region;
            $scope.ref.isBucketList = false;

            var pathKey = (info.bucket || "") + "\0" + (info.key || "");
            var pathChanged = pathKey !== lastListedPath;

            lastListedPath = pathKey;

            // 离开 Bucket 列表时清空 Bucket 过滤
            if (pathChanged) {
              $scope.sch.bucketName = "";
            }

            if (fileName) {
              // 地址中带文件名时立即按前缀搜索，避免 600ms 空窗
              $scope.sch.objectName = fileName;
              listFiles(getListInfo());
            } else {
              // 进入目录 / 返回时清空搜索；同路径刷新保留
              if (pathChanged) {
                clearObjectSearch();
              }

              listFiles();
            }
          } else {
            // list buckets
            $scope.currentBucket = null;
            $scope.ref.isBucketList = true;
            lastListedPath = "\0";
            clearObjectSearch();

            // 只有从来没有 list buckets 过，才list，减少http请求开销
            if (!$scope.buckets || forceRefresh) {
              listBuckets();
            }

            clearObjectsList();
          }
        });
      }

      function goIn(bucket, prefix) {
        var ossPath = "oss://";

        if (bucket) {
          ossPath = "oss://" + bucket + "/" + (prefix || "");
        }

        $rootScope.$broadcast("goToOssAddress", ossPath);
      }

      function getFavFolderUrl(item) {
        if (!item) {
          return "";
        }

        if (item.isFolder && $scope.currentInfo.bucket) {
          return Fav.normalizeFolderUrl(
            "oss://" + $scope.currentInfo.bucket + "/" + item.path,
          );
        }

        return "";
      }

      function getFavMenuLabel(item) {
        return (
          '<i class="fa fa-star text-orange"></i> ' +
          (isFavFolderItem(item) ? T("unfavFolder") : T("favFolder"))
        );
      }

      function refreshFavContextMenuLabel($li, item) {
        if (!$li || !$li.find) {
          return;
        }

        var $a = $li.find("a").first();

        if ($a.length) {
          $a.html(getFavMenuLabel(item));
        }
      }

      function closeOpenContextMenus() {
        angular.element(document.body).find("> ul.dropdown-menu").remove();
      }

      function isFavFolderItem(item) {
        var url = getFavFolderUrl(item);

        return !!(url && Fav.has(url));
      }

      function favFolder(item, $li) {
        var url = getFavFolderUrl(item);

        if (!url) {
          Toast.warn(T("bookmark.add.error2"));

          return;
        }

        if (Fav.has(url)) {
          Fav.remove(url);
          Toast.warn(T("bookmark.remove.success"));
        } else if (Fav.add(url)) {
          Toast.success(T("bookmark.add.success"));
        } else {
          Toast.warn(T("bookmark.add.error1"));
        }

        safeApply($scope);

        if ($li) {
          refreshFavContextMenuLabel($li, item);
        } else {
          closeOpenContextMenus();
        }
      }

      function listFiles(info, marker, fn) {
        clearObjectsList();
        info = info || getListInfo();
        $scope.isLoading = true;

        var requestId = ++listFilesRequestId;

        doListFiles(info, marker, function (err) {
          // 忽略过期请求，避免搜索/跳转竞态把旧结果写回
          if (requestId !== listFilesRequestId) {
            return;
          }

          $scope.isLoading = false;
          safeApply($scope);

          if (err) {
            console.error(err);
            Toast.error(err);
          }

          if (fn) {
            fn(err);
          }
        });
      }

      function doListFiles(info, marker, fn) {
        var requestId = listFilesRequestId;

        ossSvs2
          .listFiles(info.region, info.bucket, info.key, marker || "")
          .then(
            function (result) {
              if (requestId !== listFilesRequestId) {
                return;
              }

              const arr = result.data;

              // eslint-disable-next-line no-unused-expressions
              settingsSvs.showImageSnapshot.get() == 1
                ? signPicURL(info, arr)
                : null;
              let oldFolderIndex = Math.max(
                0,
                $scope.objects.findIndex((i) => !i.isFolder),
              );
              let comingFolderIndex = Math.max(
                0,
                arr.findIndex((i) => !i.isFolder),
              );
              let addFolders = [];
              let folders = arr.slice(0, comingFolderIndex);
              let prevFolders = $scope.objects.slice(0, oldFolderIndex);

              folders.forEach((i) => {
                const index = prevFolders.findIndex(
                  (j) => i.name === j.name && i.path === j.path,
                );

                if (index === -1) {
                  addFolders.push(i);
                }
              });
              $scope.objects.splice(oldFolderIndex, 0, ...addFolders);
              $scope.objects = $scope.objects.concat(
                arr.slice(comingFolderIndex),
              );

              $scope.nextObjectsMarker = result.marker || null;

              // 分页追加后同步全选状态
              if (marker) {
                syncSelectionState();
              }

              safeApply($scope);
              $scope.$broadcast("objectsListUpdated");

              if (fn) {
                fn(null);
              }
            },
            function (err) {
              if (requestId !== listFilesRequestId) {
                return;
              }

              console.error(err);
              clearObjectsList();

              if (fn) {
                fn(err);
              }
            },
          );
      }

      $scope.$watch(
        () => $scope.objects.length,
        () => {
          $scope.objectLengthI18nTip = T("search.files.num_msg", {
            num: $scope.objects.length,
          });
        },
      );

      let isLoadingObjectSymlinkMeta = false;
      let cacheSymlinkTooltipTpl = new Map();

      function loadObjectSymlinkMeta(item) {
        if (isLoadingObjectSymlinkMeta) {
          return;
        }

        cacheSymlinkTooltipTpl["delete"](item);
        isLoadingObjectSymlinkMeta = true;
        const { region, bucket } = $scope.currentInfo;

        ossSvs2
          .loadObjectSymlinkMeta(region, bucket, item.Key)
          .then((result) => {
            item.targetName = result.targetName;
            cacheSymlinkTooltipTpl.set(
              item,
              $sce.trustAsHtml(`
              <div style="text-align: left;">
                ${T("file.message.symlink_help{target}!lines", {
                  target: result.targetName,
                })}
              </div>
              `),
            );
            safeApply($scope);
          })
          .finally(() => {
            $timeout(() => {
              isLoadingObjectSymlinkMeta = false;
            }, 500);
          });
      }

      function getSymlinkTooltipTpl(item) {
        return cacheSymlinkTooltipTpl.get(item) || "loading...";
      }

      function loadNext() {
        if (
          !$scope.nextObjectsMarker ||
          $scope.loadingNext ||
          $scope.isLoading
        ) {
          return;
        }

        var marker = $scope.nextObjectsMarker;

        $scope.loadingNext = true;
        doListFiles(getListInfo(), marker, function (err) {
          $scope.loadingNext = false;
          safeApply($scope);

          if (err) {
            Toast.error(err);
          }
        });
      }

      function clearObjectsList() {
        initSelect();
        $scope.loadingNext = false;
        $scope.objects = [];
        $scope.nextObjectsMarker = null;
      }

      function signPicURL(info, result) {
        var authInfo = AuthInfo.get();

        if (authInfo.id.indexOf("STS.") == 0) {
          angular.forEach(result, function (n) {
            if (!n.isFolder && fileSvs.getFileType(n).type == "picture") {
              ossSvs2
                .getImageBase64Url(info.region, info.bucket, n.path)
                .then(function (data) {
                  if (data.ContentType.indexOf("image/") == 0) {
                    var base64str = new Buffer(data.Body).toString("base64");

                    n.pic_url =
                      "data:" + data.ContentType + ";base64," + base64str;
                  }
                });
            }
          });
        } else {
          angular.forEach(result, function (n) {
            if (!n.isFolder && fileSvs.getFileType(n).type == "picture") {
              var ext =
                n.name.indexOf(".") != -1
                  ? n.name.toLowerCase().substring(n.name.lastIndexOf(".") + 1)
                  : "";
              var process = fileSvs.needsDirectImageUrl(ext)
                ? null
                : "image/resize,w_48";

              n.pic_url = ossSvs2.signatureUrl2(
                info.region,
                info.bucket,
                n.path,
                3600,
                process,
              );
            }
          });
        }
        // return result;
      }

      function listBuckets(fn) {
        $scope.isLoading = true;
        ossSvs2.listAllBuckets().then(
          function (buckets) {
            $scope.isLoading = false;
            $scope.buckets = buckets;

            var m = {};

            angular.forEach(buckets, function (n) {
              m[n.name] = n;
            });
            $rootScope.bucketMap = m;

            safeApply($scope);

            if (fn) {
              fn();
            }
          },
          function (err) {
            console.error(err);
            $scope.isLoading = false;

            clearObjectsList();

            // $scope.buckets = [];
            // $rootScope.bucketMap = {};

            safeApply($scope);

            if (fn) {
              fn();
            }
          },
        );
      }

      function showDeleteBucket(item) {
        var title = T("bucket.delete.title");
        var message = T("bucket.delete.message", {
          name: item.name,
          region: item.region,
        });

        Dialog.confirm(
          title,
          message,
          function (b) {
            if (b) {
              ossSvs2.deleteBucket(item.region, item.name).then(function () {
                Toast.success(T("bucket.delete.success")); // 删除Bucket成功
                // 删除Bucket不是实时的，等待1秒后刷新
                $timeout(function () {
                  listBuckets();
                }, 1000);
              });
            }
          },
          1,
        );
      }

      function showDeleteFilesSelected() {
        showDeleteFiles($scope.sel.has);
      }

      function showDeleteFiles(items) {
        $modal.open({
          templateUrl: "main/files/modals/delete-files-modal.html",
          controller: "deleteFilesModalCtrl",
          backdrop: "static",
          resolve: {
            items: function () {
              return items;
            },
            currentInfo: function () {
              return angular.copy($scope.currentInfo);
            },
            callback: function () {
              return function () {
                $timeout(function () {
                  listFiles();
                }, 300);
              };
            },
          },
        });
      }

      function showAddBucket() {
        $modal.open({
          templateUrl: "main/files/modals/add-bucket-modal.html",
          controller: "addBucketModalCtrl",
          resolve: {
            item: function () {
              return null;
            },
            callback: function () {
              return function () {
                Toast.success(T("bucket.add.success")); // '创建Bucket成功'
                // 创建Bucket不是实时的，等待1秒后刷新
                $timeout(function () {
                  listBuckets();
                }, 1000);
              };
            },
          },
        });
      }

      function showAddFolder() {
        $modal.open({
          templateUrl: "main/files/modals/add-folder-modal.html",
          controller: "addFolderModalCtrl",
          resolve: {
            currentInfo: function () {
              return angular.copy($scope.currentInfo);
            },
            callback: function () {
              return function () {
                Toast.success(T("folder.create.success")); // '创建目录成功'
                $timeout(function () {
                  listFiles();
                }, 300);
              };
            },
          },
        });
      }

      function showUpdateBucket(item) {
        $modal.open({
          templateUrl: "main/files/modals/update-bucket-modal.html",
          controller: "updateBucketModalCtrl",
          resolve: {
            item: function () {
              return item;
            },
            callback: function () {
              return function () {
                Toast.success(T("bucketACL.update.success")); // '修改Bucket权限成功'
                $timeout(function () {
                  listBuckets();
                }, 300);
              };
            },
          },
        });
      }

      function showBucketMultipart(item) {
        $modal.open({
          templateUrl: "main/files/modals/bucket-multipart-modal.html",
          controller: "bucketMultipartModalCtrl",
          size: "lg",
          backdrop: "static",
          resolve: {
            bucketInfo: function () {
              return item;
            },
          },
        });
      }

      function showPreview(item, type) {
        var fileType = fileSvs.getFileType(item);

        fileType.type = type || fileType.type;
        // console.log(fileType);

        // type: [picture|code|others|doc]

        var templateUrl = "main/files/modals/preview/others-modal.html";
        var controller = "othersModalCtrl";
        var backdrop = true;

        if (fileType.type == "code") {
          templateUrl = "main/files/modals/preview/code-modal.html";
          controller = "codeModalCtrl";
          backdrop = "static";
        } else if (fileType.type == "picture") {
          templateUrl = "main/files/modals/preview/picture-modal.html";
          controller = "pictureModalCtrl";
          // backdrop = 'static';
        } else if (fileType.type == "video") {
          templateUrl = "main/files/modals/preview/media-modal.html";
          controller = "mediaModalCtrl";
        } else if (fileType.type == "audio") {
          templateUrl = "main/files/modals/preview/media-modal.html";
          controller = "mediaModalCtrl";
        } else if (fileType.type == "doc") {
          templateUrl = "main/files/modals/preview/doc-modal.html";
          controller = "docModalCtrl";
        }

        $modal.open({
          templateUrl: templateUrl,
          controller: controller,
          size: "lg",
          windowClass: "preview-modal-window",
          // backdrop: backdrop,
          resolve: {
            bucketInfo: function () {
              return angular.copy($scope.currentInfo);
            },
            objectInfo: function () {
              return item;
            },
            fileType: function () {
              return fileType;
            },
            showFn: function () {
              return {
                callback: function (reloadStorageStatus) {
                  if (reloadStorageStatus) {
                    $timeout(function () {
                      // listFiles();
                      ossSvs2.loadStorageStatus(
                        $scope.currentInfo.region,
                        $scope.currentInfo.bucket,
                        [item],
                      );
                    }, 300);
                  }
                },
                preview: showPreview,
                download: function () {
                  showDownload(item);
                },
                grant: function () {
                  showGrant([item]);
                },
                move: function (isCopy) {
                  showMove([item], isCopy);
                },
                remove: function () {
                  showDeleteFiles([item]);
                },
                rename: function () {
                  showRename(item);
                },
                address: function () {
                  showAddress(item);
                },
                acl: function () {
                  showACL(item);
                },
                httpHeaders: function () {
                  showHttpHeaders(item);
                },
                crc: function () {
                  showCRC(item);
                },
              };
            },
          },
        });
      }

      function showCRC(item) {
        $modal.open({
          templateUrl: "main/files/modals/crc-modal.html",
          controller: "crcModalCtrl",
          resolve: {
            item: function () {
              return angular.copy(item);
            },
            currentInfo: function () {
              return angular.copy($scope.currentInfo);
            },
          },
        });
      }

      function showDownload(item) {
        var bucketInfo = angular.copy($scope.currentInfo);
        var fromInfo = angular.copy(item);

        fromInfo.region = bucketInfo.region;
        fromInfo.bucket = bucketInfo.bucket;

        Dialog.showDownloadDialog(function (folderPaths) {
          if (!folderPaths || folderPaths.length == 0) {
            return;
          }

          var to = folderPaths[0];

          to = to.replace(/(\/*$)/g, "");

          $scope.handlers.downloadFilesHandler([fromInfo], to);
        });
      }

      // //////////////////////
      function initSelect() {
        $scope.sel.all = false;
        $scope.sel.has = false;
        $scope.sel.x = {};
        lastSelectKey = null;
      }

      function selectAll() {
        var f = $scope.sel.all;
        var list = getVisibleObjects();

        $scope.sel.x = {};
        angular.forEach(list, function (item) {
          $scope.sel.x[itemKey(item)] = f;
        });
        $scope.sel.has = f && list.length ? list.slice() : false;
        lastSelectKey = null;
      }

      var lastSelectKey = null;

      function onObjectCheckClick(e, item) {
        if (e) {
          e.stopPropagation();
        }

        var key = itemKey(item);

        // 以浏览器勾选状态为准，避免 ng-click / ng-model 时序导致选中态错乱
        if (e && e.target) {
          $scope.sel.x[key] = !!e.target.checked;
        }

        selectChanged(e, item);
      }

      function syncSelectionState() {
        var list = getVisibleObjects();
        var all = list.length > 0;
        var has = [];

        for (var j = 0; j < list.length; j++) {
          if ($scope.sel.x[itemKey(list[j])]) {
            has.push(list[j]);
          } else {
            all = false;
          }
        }

        $scope.sel.all = all;
        $scope.sel.has = has.length ? has : false;
      }

      function selectChanged(e, item) {
        var list = getVisibleObjects();
        var currentKey = item ? itemKey(item) : null;

        // Shift 按当前可见排序批量选中（用 item key，避免排序后下标错位）
        if (e && e.shiftKey && lastSelectKey && currentKey) {
          var start = -1;
          var end = -1;

          for (var i = 0; i < list.length; i++) {
            var k = itemKey(list[i]);

            if (k === lastSelectKey) {
              start = i;
            }

            if (k === currentKey) {
              end = i;
            }
          }

          if (start > -1 && end > -1) {
            var min = Math.min(start, end);
            var max = Math.max(start, end);

            for (var n = min; n <= max; n++) {
              $scope.sel.x[itemKey(list[n])] = true;
            }
          }
        }

        syncSelectionState();

        if (currentKey) {
          lastSelectKey = currentKey;
        }
      }
      // //////////////////////////////

      function selectBucket(item) {
        if ($scope.bucket_sel.item == item) {
          $scope.bucket_sel.item = null;
        } else {
          $scope.bucket_sel.item = item;
        }
      }

      // 上传下载
      var oudtid;
      var oddtid;

      function showUploadDialog(isFolder) {
        if (oudtid) {
          return;
        }

        oudtid = true;
        $timeout(function () {
          oudtid = false;
        }, 600);

        Dialog.showUploadDialog(function (filePaths) {
          if (!filePaths || filePaths.length == 0) {
            return;
          }

          $scope.handlers.uploadFilesHandler(filePaths, $scope.currentInfo);
        }, isFolder);
      }

      function showDownloadDialog() {
        if (oddtid) {
          return;
        }

        oddtid = true;
        $timeout(function () {
          oddtid = false;
        }, 600);

        Dialog.showDownloadDialog(function (folderPaths) {
          if (!folderPaths || folderPaths.length == 0 || !$scope.sel.has) {
            return;
          }

          var to = folderPaths[0];

          _downloadMulti(to);
        });
      }

      function _downloadMulti(to) {
        to = to.replace(/(\/*$)/g, "");

        var fromArr = angular.copy($scope.sel.has);

        angular.forEach(fromArr, function (n) {
          n.region = $scope.currentInfo.region;
          n.bucket = $scope.currentInfo.bucket;
        });

        /**
         * @param fromOssPath {array}  item={region, bucket, path, name, size }
         * @param toLocalPath {string}
         */
        $scope.handlers.downloadFilesHandler(fromArr, to);
      }

      /**
       * 监听 drop
       * @param e
       * @returns {boolean}
       */
      function handlerDrop(e) {
        var evt = e.originalEvent || e;
        var dt = evt.dataTransfer;
        var filePaths = [];

        if (!dt || !dt.files || !dt.files.length) {
          return false;
        }

        angular.forEach(dt.files, function (n) {
          if (n.path) {
            filePaths.push(n.path);
          }
        });

        if (!filePaths.length) {
          return false;
        }

        if (!$scope.handlers.uploadFilesHandler) {
          return false;
        }

        $scope.handlers.uploadFilesHandler(filePaths, $scope.currentInfo);

        if (e.preventDefault) {
          e.preventDefault();
        }

        if (e.stopPropagation) {
          e.stopPropagation();
        }

        return false;
      }

      // 授权
      function showGrant(items) {
        $modal.open({
          templateUrl: "main/files/modals/grant-modal.html",
          controller: "grantModalCtrl",
          resolve: {
            items: function () {
              return items;
            },
            currentInfo: function () {
              return angular.copy($scope.currentInfo);
            },
          },
        });
      }

      // 生成授权码
      function showGrantToken(item) {
        $modal.open({
          templateUrl: "main/files/modals/grant-token-modal.html",
          controller: "grantTokenModalCtrl",
          resolve: {
            item: function () {
              return item;
            },
            currentInfo: function () {
              return angular.copy($scope.currentInfo);
            },
          },
        });
      }

      // 重命名
      function showRename(item) {
        $modal.open({
          templateUrl: "main/files/modals/rename-modal.html",
          controller: "renameModalCtrl",
          backdrop: "static",
          resolve: {
            item: function () {
              return angular.copy(item);
            },
            moveTo: function () {
              return angular.copy($scope.currentInfo);
            },
            currentInfo: function () {
              return angular.copy($scope.currentInfo);
            },
            isCopy: function () {
              return false;
            },
            callback: function () {
              return function () {
                $timeout(function () {
                  listFiles();
                }, 300);
              };
            },
          },
        });
      }

      function getCurrentOssPath() {
        return (
          "oss://" + $scope.currentInfo.bucket + "/" + $scope.currentInfo.key
        );
      }
      function cancelPaste() {
        $scope.keepMoveOptions = null;
        safeApply($scope);
      }
      function showPaste() {
        var keyword = $scope.keepMoveOptions.isCopy ? T("copy") : T("move");
        var keepmove = $scope.keepMoveOptions.currentInfo;
        var current = $scope.currentInfo;

        if (
          $scope.keepMoveOptions.items.length == 1 &&
          $scope.currentInfo.bucket == $scope.keepMoveOptions.currentInfo.bucket
        ) {
          // 1个支持重命名
          $modal.open({
            templateUrl: "main/files/modals/rename-modal.html",
            controller: "renameModalCtrl",
            backdrop: "static",
            resolve: {
              item: function () {
                return angular.copy($scope.keepMoveOptions.items[0]);
              },
              moveTo: function () {
                return angular.copy($scope.currentInfo);
              },
              currentInfo: function () {
                return angular.copy($scope.keepMoveOptions.currentInfo);
              },
              isCopy: function () {
                return $scope.keepMoveOptions.isCopy;
              },
              callback: function () {
                return function () {
                  $scope.keepMoveOptions = null;
                  $timeout(function () {
                    listFiles();
                  }, 100);
                };
              },
            },
          });

          return;
        }

        if (
          current.key === keepmove.key &&
          keyword === T("move") &&
          current.bucket === keepmove.bucket
        ) {
          Toast.warn(T("forbidden"));
        } else {
          var msg = T("paste.message1", {
            name: $scope.keepMoveOptions.items[0].name,
            action: keyword,
          });

          Dialog.confirm(keyword, msg, function (b) {
            if (b) {
              $modal.open({
                templateUrl: "main/files/modals/move-modal.html",
                controller: "moveModalCtrl",
                backdrop: "static",
                resolve: {
                  items: function () {
                    return angular.copy($scope.keepMoveOptions.items);
                  },
                  moveTo: function () {
                    return angular.copy($scope.currentInfo);
                  },
                  isCopy: function () {
                    return $scope.keepMoveOptions.isCopy;
                  },
                  renamePath: function () {
                    return "";
                  },
                  fromInfo: function () {
                    return angular.copy($scope.keepMoveOptions.currentInfo);
                  },
                  callback: function () {
                    return function () {
                      $scope.keepMoveOptions = null;
                      $timeout(function () {
                        listFiles();
                      }, 100);
                    };
                  },
                },
              });
            }
          });
        }
      }

      // 移动
      function showMove(items, isCopy) {
        $scope.keepMoveOptions = {
          items: items,
          isCopy: isCopy,
          currentInfo: angular.copy($scope.currentInfo),
          originPath: getCurrentOssPath(),
        };
      }
      // 地址
      function showAddress(item) {
        $modal.open({
          templateUrl: "main/files/modals/get-address.html",
          controller: "getAddressModalCtrl",
          resolve: {
            item: function () {
              return angular.copy(item);
            },
            currentInfo: function () {
              return angular.copy($scope.currentInfo);
            },
          },
        });
      }

      // acl
      function showACL(item) {
        $modal.open({
          templateUrl: "main/files/modals/update-acl-modal.html",
          controller: "updateACLModalCtrl",
          resolve: {
            item: function () {
              return angular.copy(item);
            },
            currentInfo: function () {
              return angular.copy($scope.currentInfo);
            },
          },
        });
      }

      function showHttpHeaders(item) {
        $modal.open({
          templateUrl: "main/files/modals/update-http-headers-modal.html",
          controller: "updateHttpHeadersModalCtrl",
          resolve: {
            item: function () {
              return angular.copy(Array.isArray(item) ? item : [item]);
            },
            currentInfo: function () {
              return angular.copy($scope.currentInfo);
            },
          },
        });
      }

      function showSymlink(item) {
        $modal.open({
          templateUrl: "main/files/modals/set-symlink-modal.html",
          controller: "setSymlinkModalCtrl",
          resolve: {
            item: function () {
              return angular.copy(item);
            },
            currentInfo: function () {
              return angular.copy($scope.currentInfo);
            },
            callback: function () {
              return function () {
                $timeout(function () {
                  listFiles();
                }, 300);
              };
            },
          },
        });
      }

      function showRestoreBatch() {
        let selectObjects = $scope.sel.has;
        let SelRestore = [];

        if (selectObjects && selectObjects.length > 0) {
          for (let i in selectObjects) {
            if (
              selectObjects[i].storageStatus !== 3 &&
              selectObjects[i].storageClass === "Archive"
            ) {
              SelRestore.push(selectObjects[i]);
            }
          }

          if (!SelRestore.length) {
            Toast.info(T("restore.msg"));
          } else {
            showSelrestores(SelRestore);
          }
        }
      }

      function showSelrestores(items) {
        $modal.open({
          templateUrl: "main/files/modals/batch-restore-modal.html",
          controller: "batchRestoreModalCtrl",
          resolve: {
            item: function () {
              return angular.copy(items);
            },
            currentInfo: function () {
              return angular.copy($scope.currentInfo);
            },
            callback: function () {
              return function () {
                $timeout(function () {
                  ossSvs2.loadStorageStatus(
                    $scope.currentInfo.region,
                    $scope.currentInfo.bucket,
                    items,
                  );
                }, 300);
              };
            },
          },
        });
      }

      function showRestore(item) {
        $modal.open({
          templateUrl: "main/files/modals/restore-modal.html",
          controller: "restoreModalCtrl",
          resolve: {
            item: function () {
              return angular.copy(item);
            },
            currentInfo: function () {
              return angular.copy($scope.currentInfo);
            },
            callback: function () {
              return function () {
                $timeout(function () {
                  // listFiles();
                  ossSvs2.loadStorageStatus(
                    $scope.currentInfo.region,
                    $scope.currentInfo.bucket,
                    [item],
                  );
                }, 300);
              };
            },
          },
        });
      }

      function showUserList() {
        $modal.open({
          templateUrl: "main/modals/users.html",
          controller: "usersCtrl",
          size: "lg",
          backdrop: "static",
        });
      }
    },
  ]);
