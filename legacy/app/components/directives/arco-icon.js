(function() {
  var SVG_PREFIX =
    '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';

  function strokeIcon(paths) {
    return SVG_PREFIX + paths + '</svg>';
  }

  var ICONS = {
    plus: strokeIcon(
      '<path d="M24 10v28M10 24h28" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
    ),
    close: strokeIcon(
      '<path d="M14.34 14.34l19.32 19.32M33.66 14.34L14.34 33.66" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
    ),
    check: strokeIcon(
      '<path d="M10 24.5l9.5 9.5L38 16" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    exclamation: strokeIcon(
      '<path d="M24 16v14M24 34.5v.5" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="4"/>'
    ),
    'exclamation-circle': strokeIcon(
      '<circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3"/><path d="M24 16v12M24 34v2" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    ),
    'play-arrow':
      SVG_PREFIX + '<path d="M18 14l16 10-16 10V14z" fill="currentColor"/></svg>',
    pause: strokeIcon(
      '<path d="M18 14v20M30 14v20" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
    ),
    delete: strokeIcon(
      '<path d="M14 16h20M20 16V12h8v4M18 22v10M30 22v10M16 16l1 24h14l1-24" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    'close-circle': strokeIcon(
      '<circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3"/><path d="M18 18l12 12M30 18L18 30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    ),
    menu: strokeIcon(
      '<path d="M10 16h28M10 24h28M10 32h28" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
    ),
    apps:
      SVG_PREFIX +
      '<rect x="12" y="12" width="10" height="10" rx="1" fill="currentColor"/><rect x="26" y="12" width="10" height="10" rx="1" fill="currentColor"/><rect x="12" y="26" width="10" height="10" rx="1" fill="currentColor"/><rect x="26" y="26" width="10" height="10" rx="1" fill="currentColor"/></svg>',
    download: strokeIcon(
      '<path d="M24 10v20M24 30l-8-8M24 30l8-8M14 38h20" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    upload: strokeIcon(
      '<path d="M24 38V18M24 18l-8 8M24 18l8 8M14 10h20" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    search: strokeIcon(
      '<circle cx="22" cy="22" r="12" stroke="currentColor" stroke-width="4"/><path d="M31 31l8 8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
    ),
    refresh: strokeIcon(
      '<path d="M34 18A14 14 0 1 0 34 30" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M34 10v8h-8" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    loading: strokeIcon(
      '<circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="60 120"/>'
    ),
    copy: strokeIcon(
      '<rect x="16" y="16" width="22" height="22" rx="2" stroke="currentColor" stroke-width="3"/><path d="M12 32V14a2 2 0 0 1 2-2h18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    ),
    scissors: strokeIcon(
      '<circle cx="16" cy="32" r="4" stroke="currentColor" stroke-width="3"/><circle cx="16" cy="16" r="4" stroke="currentColor" stroke-width="3"/><path d="M20 18l20 20M20 30L40 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    ),
    edit: strokeIcon(
      '<path d="M32 12l4 4-18 18H14v-4L32 12z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M28 16l4 4" stroke="currentColor" stroke-width="3"/>'
    ),
    safe: strokeIcon(
      '<path d="M24 8l14 6v12c0 10-6 16-14 18-8-2-14-8-14-18V14l14-6z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'
    ),
    settings: strokeIcon(
      '<circle cx="24" cy="24" r="5" stroke="currentColor" stroke-width="3"/><path d="M24 8v4M24 36v4M8 24h4M36 24h4M13.8 13.8l2.8 2.8M31.4 31.4l2.8 2.8M13.8 34.2l2.8-2.8M31.4 16.6l2.8-2.8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    ),
    link: strokeIcon(
      '<path d="M18 30l-4 4a6 6 0 0 1-8.5-8.5l4-4M30 18l4-4a6 6 0 1 1 8.5 8.5l-4 4M20 28l8-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    ),
    folder: strokeIcon(
      '<path d="M8 14h12l4 4h20v20a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V14z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'
    ),
    'folder-open': strokeIcon(
      '<path d="M8 18h34l-4 18H8V18zM8 18l6-8h12l4 4" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'
    ),
    file: strokeIcon(
      '<path d="M14 8h16l8 8v26a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M30 8v8h8" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'
    ),
    storage: strokeIcon(
      '<ellipse cx="24" cy="14" rx="16" ry="6" stroke="currentColor" stroke-width="3"/><path d="M8 14v20c0 3.3 7.2 6 16 6s16-2.7 16-6V14M8 24c0 3.3 7.2 6 16 6s16-2.7 16-6" stroke="currentColor" stroke-width="3"/>'
    ),
    'star-fill':
      SVG_PREFIX +
      '<path d="M24 8l4.9 9.9 11 1.6-8 7.8 1.9 11L24 33.4 14.2 38.3l1.9-11-8-7.8 11-1.6L24 8z" fill="currentColor"/></svg>',
    star: strokeIcon(
      '<path d="M24 8l4.9 9.9 11 1.6-8 7.8 1.9 11L24 33.4 14.2 38.3l1.9-11-8-7.8 11-1.6L24 8z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'
    ),
    'arrow-left': strokeIcon(
      '<path d="M28 10L14 24l14 14M14 24h26" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    'arrow-right': strokeIcon(
      '<path d="M20 10l14 14-14 14M8 24h26" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    'arrow-up': strokeIcon(
      '<path d="M10 28L24 14l14 14M24 14v26" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    'arrow-down': strokeIcon(
      '<path d="M10 20l14 14 14-14M24 38V12" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    home: strokeIcon(
      '<path d="M8 20l16-12 16 12v20a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V20z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M20 42V28h8v14" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'
    ),
    list: strokeIcon(
      '<path d="M14 16h24M14 24h24M14 32h24M10 16h.01M10 24h.01M10 32h.01" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
    ),
    user: strokeIcon(
      '<circle cx="24" cy="16" r="7" stroke="currentColor" stroke-width="3"/><path d="M10 40c0-8 6-14 14-14s14 6 14 14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    ),
    'user-group': strokeIcon(
      '<circle cx="18" cy="18" r="5" stroke="currentColor" stroke-width="3"/><circle cx="32" cy="18" r="5" stroke="currentColor" stroke-width="3"/><path d="M8 38c0-6 4.5-10 10-10M30 28c5.5 0 10 4 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    ),
    idcard: strokeIcon(
      '<rect x="8" y="12" width="32" height="24" rx="2" stroke="currentColor" stroke-width="3"/><circle cx="18" cy="24" r="4" stroke="currentColor" stroke-width="2"/><path d="M26 22h10M26 28h8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    ),
    'info-circle': strokeIcon(
      '<circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3"/><path d="M24 22v12M24 16v2" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    ),
    'question-circle': strokeIcon(
      '<circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3"/><path d="M18 18c1.5-3 4.5-4 8-4 4 0 7 2.5 7 6 0 4-4 5-6 7-1.2 1.2-1 2.5-1 3" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="34" r="1.5" fill="currentColor"/>'
    ),
    poweroff: strokeIcon(
      '<path d="M24 8v14M14 14a16 16 0 1 0 20 0" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
    ),
    'caret-down':
      SVG_PREFIX + '<path d="M14 20l10 10 10-10" fill="currentColor"/></svg>',
    'caret-left':
      SVG_PREFIX + '<path d="M28 14L18 24l10 10" fill="currentColor"/></svg>',
    'caret-right':
      SVG_PREFIX + '<path d="M20 14l10 10-10 10" fill="currentColor"/></svg>',
    'cloud-upload': strokeIcon(
      '<path d="M16 34h16M24 14v14M18 22l6-6 6 6M14 34h4a8 8 0 1 1 16 0h4" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    'cloud-download': strokeIcon(
      '<path d="M16 34h16M24 28V14M18 20l6 6 6-6M14 34h4a8 8 0 1 0 16 0h4" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    image: strokeIcon(
      '<rect x="8" y="10" width="32" height="28" rx="2" stroke="currentColor" stroke-width="3"/><circle cx="18" cy="20" r="3" stroke="currentColor" stroke-width="2"/><path d="M8 32l10-8 8 6 8-10 6 8" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'
    ),
    code: strokeIcon(
      '<path d="M16 16l-8 8 8 8M32 16l8 8-8 8M28 12l-8 28" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    'code-file': strokeIcon(
      '<path d="M14 8h16l8 8v26a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="3"/><path d="M20 24l-4 4 4 4M28 32h6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    ),
    save: strokeIcon(
      '<path d="M10 10h22l6 6v24a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="3"/><path d="M30 10v10H18V10M18 34h12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    ),
    paste: strokeIcon(
      '<rect x="18" y="8" width="22" height="28" rx="2" stroke="currentColor" stroke-width="3"/><rect x="8" y="14" width="22" height="28" rx="2" stroke="currentColor" stroke-width="3"/>'
    ),
    hourglass: strokeIcon(
      '<path d="M16 10h16v6c0 4-8 6-8 10s8 6 8 10v6H16v-6c0-4 8-6 8-10s-8-6-8-10v-6z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'
    ),
    checkbox: strokeIcon(
      '<rect x="12" y="12" width="24" height="24" rx="2" stroke="currentColor" stroke-width="3"/>'
    ),
    'checkbox-checked': strokeIcon(
      '<rect x="12" y="12" width="24" height="24" rx="2" stroke="currentColor" stroke-width="3"/><path d="M18 24l4 4 8-10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    sort: strokeIcon(
      '<path d="M24 10v28M18 32l6 6 6-6M18 16l6-6 6 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    'sort-asc': strokeIcon(
      '<path d="M24 14v24M18 20l6-6 6 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    'sort-desc': strokeIcon(
      '<path d="M24 10v24M18 34l6 6 6-6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    )
  };

  var MESSAGE_ICON = {
    success: 'check',
    info: 'info-circle',
    warning: 'exclamation-circle',
    danger: 'close-circle',
    error: 'close-circle'
  };

  angular.module('web').factory('arcoIconSvs', function() {
    return {
      icons: ICONS,
      getSvg: function(name, className) {
        var svg = ICONS[name];

        if (!svg) {
          return '';
        }

        className = className || '';

        return (
          '<span class="arco-icon' +
          (className ? ' ' + className : '') +
          '">' +
          svg +
          '</span>'
        );
      },
      getSpinHtml: function(className) {
        className = className || 'arco-spin-block';

        return (
          '<div class="arco-spin ' +
          className +
          '"><span class="arco-spin-icon">' +
          ICONS.loading +
          '</span></div>'
        );
      },
      getMessageIcon: function(type) {
        return MESSAGE_ICON[type] || MESSAGE_ICON.info;
      }
    };
  });

  angular.module('web').directive('arcoIcon', function() {
    return {
      restrict: 'E',
      replace: true,
      template: '<span class="arco-icon"></span>',
      link: function(scope, element, attrs) {
        var name = attrs.name;

        if (attrs.class) {
          angular.forEach(attrs.class.split(/\s+/), function(cls) {
            if (cls) {
              element.addClass(cls);
            }
          });
        }

        attrs.$observe('name', function(value) {
          if (value && ICONS[value]) {
            element[0].innerHTML = ICONS[value];
          }
        });

        if (name && ICONS[name]) {
          element[0].innerHTML = ICONS[name];
        }
      }
    };
  });
})();
