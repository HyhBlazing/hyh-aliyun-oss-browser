angular.module('web').run([
  '$document',
  '$timeout',
  function($document, $timeout) {
    var DEBOUNCE_MS = 400;
    var selector =
      'button,' +
      'input[type="submit"],' +
      'input[type="button"],' +
      'a.btn,' +
      '.mac-segment-btn,' +
      '.address-bar-link-btn';

    function findActionTarget(node) {
      var el = node;

      while (el && el !== $document[0]) {
        if (el.matches && el.matches(selector)) {
          return el;
        }

        el = el.parentNode;
      }

      return null;
    }

    function isDisabled(el) {
      if (!el) {
        return true;
      }

      if (el.disabled || el.getAttribute('disabled') === 'disabled') {
        return true;
      }

      if (el.classList && el.classList.contains('disabled')) {
        return true;
      }

      return false;
    }

    function lockTarget(el) {
      if (el._debounceLock) {
        return false;
      }

      el._debounceLock = true;

      $timeout(function() {
        el._debounceLock = false;
      }, DEBOUNCE_MS);

      return true;
    }

    $document[0].addEventListener(
        'click',
        function(e) {
          var target = findActionTarget(e.target);

          if (!target || isDisabled(target)) {
            return;
          }

          if (target._debounceLock) {
            e.preventDefault();
            e.stopImmediatePropagation();

            return;
          }

          lockTarget(target);
        },
        true
    );

    $document[0].addEventListener(
        'submit',
        function(e) {
          var form = e.target;

          if (!form || form.tagName !== 'FORM') {
            return;
          }

          if (form._debounceLock) {
            e.preventDefault();
            e.stopImmediatePropagation();

            return;
          }

          lockTarget(form);
        },
        true
    );
  }
]);
