angular.module('web').directive('dropZone', function() {
  return {
    link: linkFn,
    restrict: 'EA',
    transclude: false,
    scope: {
      dropZone: '='
    }
  };

  function linkFn(scope, ele, attr) {
    var el = ele[0];
    var $ele = $(el);
    var overlay;
    var dragDepth = 0;

    if ($ele.css('position') === 'static') {
      $ele.css('position', 'relative');
    }

    function showOverlay() {
      if (overlay) {
        return;
      }

      overlay = $('<div class="drop-zone-overlay"></div>').appendTo($ele);
    }

    function hideOverlay() {
      dragDepth = 0;

      if (overlay) {
        overlay.remove();
        overlay = null;
      }
    }

    function containsTarget(target) {
      return target && (el === target || $.contains(el, target));
    }

    function onDragEnter(e) {
      e.preventDefault();

      if (containsTarget(e.relatedTarget)) {
        return;
      }

      dragDepth++;

      if (dragDepth === 1) {
        showOverlay();
      }
    }

    function onDragLeave(e) {
      e.preventDefault();

      if (containsTarget(e.relatedTarget)) {
        return;
      }

      dragDepth--;

      if (dragDepth <= 0) {
        hideOverlay();
      }
    }

    function onDragOver(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    function onDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      hideOverlay();

      if (typeof scope.dropZone !== 'function') {
        return;
      }

      var run = function() {
        scope.dropZone(e);
      };

      if (scope.$$phase) {
        run();
      } else {
        scope.$apply(run);
      }
    }

    function onDragEnd() {
      hideOverlay();
    }

    function onDocumentDrop(e) {
      if (!containsTarget(e.target)) {
        hideOverlay();
      }
    }

    el.addEventListener('dragenter', onDragEnter, true);
    el.addEventListener('dragleave', onDragLeave, true);
    el.addEventListener('dragover', onDragOver, true);
    el.addEventListener('drop', onDrop, true);
    document.addEventListener('dragend', onDragEnd);
    document.addEventListener('drop', onDocumentDrop, true);

    scope.$on('$destroy', function() {
      hideOverlay();
      el.removeEventListener('dragenter', onDragEnter, true);
      el.removeEventListener('dragleave', onDragLeave, true);
      el.removeEventListener('dragover', onDragOver, true);
      el.removeEventListener('drop', onDrop, true);
      document.removeEventListener('dragend', onDragEnd);
      document.removeEventListener('drop', onDocumentDrop, true);
    });
  }
});
