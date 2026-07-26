angular.module('web').controller('codeModalCtrl', [
  '$scope',
  '$uibModalInstance',
  '$translate',
  '$timeout',
  '$uibModal',
  'bucketInfo',
  'objectInfo',
  'fileType',
  'showFn',
  'Toast',
  'DiffModal',
  'ossSvs2',
  'safeApply',
  function(
      $scope,
      $modalInstance,
      $translate,
      $timeout,
      _$modal,
      bucketInfo,
      objectInfo,
      fileType,
      showFn,
      Toast,
      DiffModal,
      ossSvs2,
      safeApply
  ) {
    var T = $translate.instant;

    angular.extend($scope, {
      bucketInfo: bucketInfo,
      objectInfo: objectInfo,
      fileType: fileType,
      afterCheckSuccess: afterCheckSuccess,
      afterRestoreSubmit: afterRestoreSubmit,

      previewBarVisible: false,
      showFn: showFn,

      cancel: cancel,
      getContent: getContent,
      saveContent: saveContent,
      // showDownload: showDownload,
      MAX_SIZE: 5 * 1024 * 1024
    });

    function afterCheckSuccess() {
      $scope.previewBarVisible = true;

      if (objectInfo.size < $scope.MAX_SIZE) {
        // 修复ubuntu下无法获取的bug
        $timeout(function() {
          getContent();
        }, 100);
      }
    }

    function afterRestoreSubmit() {
      showFn.callback(true);
    }

    function saveContent() {
      var originalContent = $scope.originalContent;
      var v = editor.getValue();

      $scope.content = v;

      if (originalContent != v) {
        DiffModal.show('Diff', originalContent, v, function(v) {
          Toast.info(T('saving')); // '正在保存...'

          ossSvs2
              .saveContent(
                  bucketInfo.region,
                  bucketInfo.bucket,
                  objectInfo.path,
                  v,
                  true
              )
              .then(function() {
                Toast.success(T('save.successfully')); // '保存成功'
                cancel();
              });
        });
      } else {
        Toast.info(T('content.isnot.modified')); // 内容没有修改
      }
    }

    function getContent() {
      $scope.isLoading = true;
      ossSvs2
          .getContent(bucketInfo.region, bucketInfo.bucket, objectInfo.path)
          .then(function(result) {
          // 在data为空时，用safeApply手动触发更新
            safeApply($scope, () => {
              $scope.isLoading = false;
              const data = result.content.toString();

              $scope.originalContent = data;
              $scope.content = data;
              editor.setValue(data);
              $timeout(function() {
                resizeEditor(0);
              }, 100);
            });
          });
    }

    function cancel() {
      angular.element(window).off('resize.previewModal');
      $modalInstance.dismiss('close');
    }

    function resizeEditor(retry) {
      retry = retry || 0;

      if (!editor) {
        return;
      }

      var wrap = document.querySelector(
          '.preview-modal-window .preview-modal-editor-wrap'
      );

      if (!wrap) {
        return;
      }

      var height = wrap.clientHeight;

      if (height <= 0 && retry < 12) {
        $timeout(function() {
          resizeEditor(retry + 1);
        }, 50);

        return;
      }

      if (height <= 0) {
        height = Math.max(180, window.innerHeight - 280);
      }

      editor.setSize('100%', height);
      editor.refresh();
    }

    $scope.codeOptions = {
      lineNumbers: true,
      lineWrapping: true,
      autoFocus: true,
      readOnly: objectInfo.type === 'Symlink',
      mode: fileType.mode
    };

    var editor;

    $scope.codemirrorLoaded = function(_editor) {
      editor = _editor;
      // Editor part
      var _doc = _editor.getDoc();

      _editor.focus();

      _doc.markClean();

      $timeout(function() {
        resizeEditor(0);
        angular.element(window).on('resize.previewModal', function() {
          resizeEditor(0);
        });
      }, 100);
    };

    $scope.$on('$destroy', function() {
      angular.element(window).off('resize.previewModal');
    });
  }
]);
