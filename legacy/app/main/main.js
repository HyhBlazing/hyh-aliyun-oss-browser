angular.module('web').controller('mainCtrl', [
  '$scope',
  '$rootScope',
  '$state',
  'Const',
  'AuthInfo',
  function($scope, $rootScope, $state, Const, AuthInfo) {
    $rootScope.internalSupported = false;

    $scope.$on('$stateChangeSuccess', function() {
      var name = $state.current.name;

      if (name != 'login') {
        $rootScope.internalSupported =
          (AuthInfo.get().eptpl || '').indexOf('-internal') != -1;
      }
    });

    window.addEventListener('unload', function() {
      var shouldRemoveAuthInfo =
        localStorage.getItem(Const.KEEP_ME_LOGGED_IN) === 'NO';

      if (shouldRemoveAuthInfo) {
        AuthInfo.remove();
      }
    });
  }
]);
