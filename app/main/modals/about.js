angular.module('web').controller('aboutCtrl', [
  '$scope',
  '$uibModalInstance',
  function($scope, $modalInstance) {
    angular.extend($scope, {
      cancel: cancel,
      open: open,
      app_logo: Global.app.logo,
      info: {
        currentVersion: Global.app.version
      },
      custom_about_html: Global.about_html
    });

    function open(a) {
      openExternal(a);
    }

    function cancel() {
      $modalInstance.dismiss('close');
    }
  }
]);
