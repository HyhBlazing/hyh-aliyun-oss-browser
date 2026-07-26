angular.module('web').controller('pictureModalCtrl', [
  '$scope',
  '$uibModalInstance',
  '$timeout',
  '$uibModal',
  'ossSvs2',
  'safeApply',
  'showFn',
  'bucketInfo',
  'objectInfo',
  'AuthInfo',
  'fileType',
  'fileSvs',
  function(
      $scope,
      $modalInstance,
      $timeout,
      $modal,
      ossSvs2,
      safeApply,
      showFn,
      bucketInfo,
      objectInfo,
      AuthInfo,
      fileType,
      fileSvs
  ) {
    angular.extend($scope, {
      bucketInfo: bucketInfo,
      objectInfo: objectInfo,
      fileType: fileType,
      afterCheckSuccess: afterCheckSuccess,
      afterRestoreSubmit: afterRestoreSubmit,

      previewBarVisible: false,
      showFn: showFn,
      cancel: cancel,

      MAX_SIZE: 5 * 1024 * 1024 // 5MB
    });

    function afterRestoreSubmit() {
      showFn.callback(true);
    }

    function afterCheckSuccess() {
      $scope.previewBarVisible = true;
      getContent();
    }

    function cancel() {
      $modalInstance.dismiss('close');
    }

    function getContent() {
      var info = AuthInfo.get();
      var ext = fileType.ext && fileType.ext[0];
      var useDirectUrl = fileSvs.needsDirectImageUrl(ext);

      if (info.id.indexOf('STS.') == 0) {
        ossSvs2
            .getImageBase64Url(
                bucketInfo.region,
                bucketInfo.bucket,
                objectInfo.path
            )
            .then(function(data) {
              if (data.ContentType.indexOf('image/') == 0) {
                var base64str = new Buffer(data.Body).toString('base64');

                $scope.imgsrc =
                'data:' + data.ContentType + ';base64,' + base64str;
              }
            });
      } else {
        var url = ossSvs2.signatureUrl2(
            bucketInfo.region,
            bucketInfo.bucket,
            objectInfo.path
        );
        var urlPreview = url;

        if (!useDirectUrl && objectInfo.size >= $scope.MAX_SIZE) {
          urlPreview = ossSvs2.signatureUrl2(
              bucketInfo.region,
              bucketInfo.bucket,
              objectInfo.path,
              3600,
              'image/quality,q_10'
          );
        }

        $timeout(function() {
          $scope.imgsrc = urlPreview;
        }, 300);
      }
    }
  }
]);
