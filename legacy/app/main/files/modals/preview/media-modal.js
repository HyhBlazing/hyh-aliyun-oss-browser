angular.module('web').controller('mediaModalCtrl', [
  '$scope',
  '$uibModalInstance',
  '$timeout',
  '$uibModal',
  'ossSvs2',
  'safeApply',
  'showFn',
  'bucketInfo',
  'objectInfo',
  'fileType',
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
      fileType
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
      genURL();
    }

    function cancel() {
      $modalInstance.dismiss('close');
    }

    function genURL() {
      var url = ossSvs2.signatureUrl2(
          bucketInfo.region,
          bucketInfo.bucket,
          objectInfo.path,
          3600
      );

      $timeout(function() {
        $scope.audioUrl = url;
        $scope.videoUrl = url;
      }, 300);
    }
  }
]);
