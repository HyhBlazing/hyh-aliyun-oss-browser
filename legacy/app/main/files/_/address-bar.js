angular.module('web').controller('addressBarCtrl', [
  '$scope',
  '$timeout',
  '$translate',
  'AuthInfo',
  'Toast',
  'settingsSvs',
  function($scope, $timeout, $translate, AuthInfo, Toast, settingsSvs) {
    var DEF_ADDR = 'oss://';
    var T = $translate.instant;

    angular.extend($scope, {
      address: AuthInfo.get().osspath || DEF_ADDR,
      goUp: goUp,
      go: go,
      goHome: goHome,
      saveDefaultAddress: saveDefaultAddress,
      getDefaultAddress: getDefaultAddress,
      isShowSaveAsHome: isShowSaveAsHome,

      // 历史，前进，后退
      canGoAhead: false,
      canGoBack: false,
      goBack: goBack,
      goAhead: goAhead
    });

    /** ********** 历史记录前进后退 start **************/
    var His = new (function() {
      var arr = [];
      var index = -1;

      this.add = function(url) {
        if (index > -1 && url == arr[index].url) { return; }

        if (index < arr.length - 1) { arr.splice(index + 1, arr.length - index); }

        arr.push({ url: url, time: new Date().getTime() });
        index++;

        var MAX = settingsSvs.historiesLength.get();

        if (arr.length > MAX) {
          arr.splice(MAX, arr.length - MAX);
          index = arr.length - 1;
        }

        this._change(index, arr);
      };
      this.clear = function() {
        arr = [];
        index = -1;
        this._change(index, arr);
      };
      this.list = function() {
        return JSON.parse(JSON.stringify(arr));
      };
      this.goBack = function() {
        if (arr.length == 0) { return null; }

        if (index > 0) {
          index--;
          this._change(index, arr);
        }

        return arr[index];
      };
      this.goAhead = function() {
        if (arr.length == 0) { return null; }

        if (index < arr.length - 1) {
          index++;
          this._change(index, arr);
        }

        return arr[index];
      };

      // 监听事件
      this.onChange = function(fn) {
        this._change = fn;
      };
    })();

    His.onChange(function(index, arr) {
      if (arr.length == 0) {
        $scope.canGoBack = false;
        $scope.canGoAhead = false;
      } else {
        $scope.canGoBack = index > 0;
        $scope.canGoAhead = index < arr.length - 1;
      }
    });

    function goBack() {
      var addr = His.goBack();

      $scope.address = addr.url;
      $scope.$emit('ossAddressChange', addr.url);
    }
    function goAhead() {
      var addr = His.goAhead();

      $scope.address = addr.url;
      $scope.$emit('ossAddressChange', addr.url);
    }
    /** ********** 历史记录前进后退 end **************/

    var addressReady = false;

    function onFilesViewReady() {
      if (addressReady) {
        return;
      }

      addressReady = true;
      initAddress();

      $scope.$on('goToOssAddress', function(e, addr) {
        $scope.address = addr;
        go();
      });
    }

    $scope.$on('filesViewReady', onFilesViewReady);

    // 防止偶发错过 filesViewReady 导致页面一直 loading
    $timeout(function() {
      if (!addressReady) {
        onFilesViewReady();
      }
    }, 800);

    function initAddress() {
      var defaultAddress = getDefaultAddress();

      $scope.address = defaultAddress;
      His.add(defaultAddress);
      $scope.$emit('ossAddressChange', defaultAddress, true);
    }

    function goHome() {
      var defaultAddress = getDefaultAddress();

      if ($scope.address == defaultAddress) {
        return;
      }

      $scope.address = defaultAddress;
      go(true);
    }

    function saveDefaultAddress() {
      AuthInfo.saveToAuthInfo({ address: $scope.address });
      Toast.success(T('saveAsHome.success'), 1000);
    }
    function getDefaultAddress() {
      var info = AuthInfo.get();

      return info.osspath || info.address || DEF_ADDR;
    }
    function isShowSaveAsHome() {
      return settingsSvs.showSaveAsHome.get() == 1;
    }

    function getAddress() {
      var addr = $scope.address;

      if (!addr) {
        $scope.address = DEF_ADDR;

        return DEF_ADDR;
      }

      if (addr == DEF_ADDR) {
        return addr;
      }

      if (addr.indexOf(DEF_ADDR) !== 0) {
        addr = addr.replace(/(^\/*)|(\/*$)/g, '');
        $scope.address = addr ? DEF_ADDR + addr + '/' : DEF_ADDR;
      }

      return $scope.address;
    }

    function go(force) {
      var addr = getAddress();

      His.add(addr);
      $scope.$emit('ossAddressChange', addr, force);
    }

    function goUp() {
      var addr = getAddress();

      if (addr == DEF_ADDR) {
        return go();
      }

      addr = addr.substring(DEF_ADDR.length);
      addr = addr.replace(/(^\/*)|(\/*$)/g, '');

      var arr = addr.split('/');

      arr.pop();

      if (arr.length === 0) {
        addr = DEF_ADDR;
      } else {
        addr = DEF_ADDR + arr.join('/') + '/';
      }

      $scope.address = addr;
      go();
    }
  }
]);
