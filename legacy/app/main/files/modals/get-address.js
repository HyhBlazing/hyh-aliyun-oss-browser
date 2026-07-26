angular.module('web').controller('getAddressModalCtrl', [
  '$scope',
  '$rootScope',
  '$q',
  '$translate',
  '$uibModalInstance',
  'item',
  'currentInfo',
  'ossSvs2',
  'safeApply',
  '$timeout',
  'Toast',
  function(
      $scope,
      $rootScope,
      $q,
      $translate,
      $modalInstance,
      item,
      currentInfo,
      ossSvs2,
      safeApply,
      $timeout,
      Toast
  ) {
    var T = $translate.instant;

    const LastSelectedDomainCtor = {
      key: '_lastSelectedDomain',
      get() {
        return window.localStorage.getItem(LastSelectedDomainCtor.key);
      },
      set(v) {
        window.localStorage.setItem(LastSelectedDomainCtor.key, v);
      }
    };

    angular.extend($scope, {
      item: item,
      currentInfo: currentInfo,
      info: {
        sec: 3600,
        url: null,
        originUrl: null,
        custom_domain: undefined
      },
      customDomainList: [],
      onCustomDomainChange: onCustomDomainChange,
      cancel: cancel,
      onSubmit: onSubmit,
      copyQrcode: copyQrcode
    });

    function cancel() {
      $modalInstance.dismiss('close');
    }

    function copyQrcode() {
      var canvas = document.querySelector('#addr-qrcode-wrap canvas');

      if (!canvas) {
        Toast.error(T('qrcode.copy.fail'));
        return;
      }

      var clipboard = require('electron').clipboard;
      var nativeImage = require('electron').nativeImage;
      var image = nativeImage.createFromDataURL(canvas.toDataURL('image/png'));

      clipboard.writeImage(image);
      Toast.success(T('copy.successfully'));
    }

    init();

    function init() {
      $scope.isLoading = true;

      $.ajax({
        url: item.url,
        headers: {
          Range: 'bytes=0-1',
          'x-random': Math.random(),
          'Cache-Control': 'no-cache'
        },
        complete: function(xhr) {
          $scope.err = null;

          if (xhr.status >= 200 && xhr.status <= 300) {
            $scope.info.originUrl = $scope.item.url;
            $scope.step = 1;
          } else if (xhr.status == 403) {
            $scope.step = 2;
          } else {
            $scope.err = xhr.responseText;
            $scope.step = 3;
          }

          Promise.all([
            new Promise((resolve) => {
              // 如果不是Cname方式登录的，获取自有域名列表
              if (!$rootScope.currentAuthInfo.cname) {
                resolve(ossSvs2.listAllCustomDomains(currentInfo.bucket));
              } else {
                resolve([]);
              }
            }),
            ossSvs2.listUsableAccelarateDomains(currentInfo.bucket)
          ])
              .then(([cnameList, accList]) => {
                const domainOptions = []
                    .concat(
                        (cnameList || []).map((domain) => ({
                          label: domain,
                          value: domain
                        }))
                    )
                    .concat(
                        (accList || []).map((domain) => ({
                          label: `${currentInfo.bucket}.${domain}`,
                          value: `${currentInfo.bucket}.${domain}`
                        }))
                    );

                if (domainOptions.length) {
                  $scope.customDomainList = [
                    {
                      label: T('not_use_own_domain'),
                      value: undefined
                    }
                  ].concat(domainOptions);

                  const domainValues = domainOptions.map((li) => li.value);
                  const last = LastSelectedDomainCtor.get();

                  if (last && domainValues.includes(last)) {
                    $scope.info.custom_domain = last;
                  } else {
                    $scope.info.custom_domain = domainOptions[0].value;
                    LastSelectedDomainCtor.set(domainOptions[0].value);
                  }

                  coerceRefDisplayUrl();
                }

                $scope.isLoading = false;
                safeApply($scope);
              })['catch']((e) => {
                console.log(e);
                $scope.isLoading = false;
                safeApply($scope);
              });
        }
      });
    }

    function onSubmit(form1) {
      if (!form1.$valid) { return; }

      var v = $scope.info.sec;
      var url = ossSvs2.signatureUrl2(
          currentInfo.region,
          currentInfo.bucket,
          item.path,
          v
      );

      $scope.info.originUrl = url;
      safeApply($scope);
    }

    $scope.$watch('info.originUrl', coerceRefDisplayUrl);

    function onCustomDomainChange(v) {
      LastSelectedDomainCtor.set(v);
      coerceRefDisplayUrl();
    }

    function coerceRefDisplayUrl() {
      $timeout(() => {
        const { originUrl, custom_domain } = $scope.info;

        // 初始化时 originUrl 为 null，确保其值合法
        if (!originUrl || typeof originUrl !== 'string') {
          return;
        }

        const newUrlWithCustomDomain = custom_domain
          ? originUrl.replace(/\/\/[^/]+\//, `//${custom_domain}/`)
          : originUrl;

        $scope.item.url = newUrlWithCustomDomain;
        $scope.info.url = newUrlWithCustomDomain;
      }, 1);
    }
  }
]);
