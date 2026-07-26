angular
    .module('web', [
      'ui.router',
      'ui.bootstrap',
      'ui.codemirror',
      'pascalprecht.translate',
      'ngSanitize',
      'templates',
      'ui.bootstrap.contextMenu'
    ])
    .config([
      '$stateProvider',
      '$urlRouterProvider',
      '$translateProvider',
      function($stateProvider, $urlRouterProvider, $translateProvider) {
        moment.locale('zh-CN');

        $stateProvider
            .state('files', {
              url: '/',
              templateUrl: 'main/files/files.html',
              controller: 'filesCtrl'
            })
            .state('login', {
              url: '/login',
              templateUrl: 'main/auth/login.html',
              controller: 'loginCtrl'
            });

        $urlRouterProvider.otherwise('/');

        // 仅中文
        $translateProvider.translations(
            'zh-CN',
            (Global.i18n['zh-CN'] && Global.i18n['zh-CN'].content) || Global.i18n
        );
        $translateProvider.preferredLanguage('zh-CN');
        $translateProvider.useSanitizeValueStrategy('escapeParameters');
      }
    ])
    .run([
      '$rootScope',
      '$translate',
      function($rootScope, $translate) {
        $rootScope.openURL = function(url) {
          openExternal(url);
        };

        // 固定中文，不再提供多语言切换
        $rootScope.langSettings = {
          lang: 'zh-CN',
          langList: [{ lang: 'zh-CN', label: '简体中文' }]
        };
        $translate.use('zh-CN');
        localStorage.setItem('lang', 'zh-CN');

        console.log('ready');
      }
    ]);
