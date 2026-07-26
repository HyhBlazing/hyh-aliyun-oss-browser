angular.module('web').controller('akHistoryModalCtrl', [
  '$scope',
  '$translate',
  '$uibModalInstance',
  'AuthInfo',
  'Dialog',
  'Toast',
  function($scope, $translate, $modalInstance, AuthInfo, Dialog, Toast) {
    var T = $translate.instant;
    var descBackup = {};

    function cancel() {
      $modalInstance.dismiss('close');
    }

    function selectHis(h) {
      $modalInstance.close(h);
    }

    function onDescFocus(h) {
      descBackup[h.id] = h.desc || '';
    }

    function saveDesc(h) {
      var desc = (h.desc || '').trim();

      h.desc = desc;

      if ((descBackup[h.id] || '') === desc) {
        return;
      }

      AuthInfo.updateHistory(h.id, { desc: desc });
      descBackup[h.id] = desc;
      Toast.success(T('auth.akHistories.descSaved'));
    }

    function showRemoveHis(h) {
      var title = T('auth.removeAK.title');
      var message = T('auth.removeAK.message', { id: h.id });

      Dialog.confirm(
          title,
          message,
          function(b) {
            if (b) {
              AuthInfo.removeFromHistories(h.id);
              listHistories();
            }
          },
          1
      );
    }

    function showCleanHistories() {
      var title = T('auth.clearAKHistories.title');
      var message = T('auth.clearAKHistories.message');
      var successMessage = T('auth.clearAKHistories.successMessage');

      Dialog.confirm(
          title,
          message,
          function(b) {
            if (b) {
              AuthInfo.cleanHistories();
              listHistories();
              Toast.success(successMessage);
            }
          },
          1
      );
    }

    function listHistories() {
      $scope.his = AuthInfo.listHistories();
    }

    angular.extend($scope, {
      his: [],
      cancel: cancel,
      selectHis: selectHis,
      onDescFocus: onDescFocus,
      saveDesc: saveDesc,
      showRemoveHis: showRemoveHis,
      showCleanHistories: showCleanHistories
    });

    listHistories();
  }
]);
