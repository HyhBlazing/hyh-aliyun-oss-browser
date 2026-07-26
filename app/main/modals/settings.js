angular.module('web').controller('settingsCtrl', [
  '$scope',
  '$state',
  '$timeout',
  '$uibModalInstance',
  '$translate',
  'callback',
  'settingsSvs',
  'Toast',
  function(
      $scope,
      $state,
      $timeout,
      $modalInstance,
      $translate,
      callback,
      settingsSvs,
      Toast
  ) {
    var T = $translate.instant;

    angular.extend($scope, {
      set: {
        maxUploadJobCount: settingsSvs.maxUploadJobCount.get(),
        maxDownloadJobCount: settingsSvs.maxDownloadJobCount.get(),
        showImageSnapshot: settingsSvs.showImageSnapshot.get(),
        showSaveAsHome: settingsSvs.showSaveAsHome.get(),
        historiesLength: settingsSvs.historiesLength.get(),
        connectTimeout: settingsSvs.connectTimeout.get(),
        uploadPartSize: settingsSvs.uploadPartSize.get(),
        downloadConcurrecyPartSize: settingsSvs.downloadConcurrecyPartSize.get(),
        listObjectNum: settingsSvs.listObjectNum.get(),
        uploadAndDownloadRetryTimes: settingsSvs.uploadAndDownloadRetryTimes.get()
      },
      setChange: setChange,
      cancel: cancel
    });
    var tid;
    var { ipcRenderer } = require('electron');

    function setChange(form1, key, ttl) {
      $timeout.cancel(tid);
      tid = $timeout(function() {
        if (!form1.$valid) { return; }

        settingsSvs[key].set($scope.set[key]);
        Toast.success(T('settings.success')); // 已经保存设置

        if (
          key == 'uploadPartSize' ||
          key == 'uploadAndDownloadRetryTimes'
        ) {
          ipcRenderer.send('asynchronous', { key: 'refreshPage' });
        }
      }, ttl || 100);
    }

    function cancel() {
      if (callback) { callback(); }

      $modalInstance.dismiss('close');
    }
  }
]);
