angular.module("web").directive("bottomLoader", [
  "$timeout",
  "$parse",
  function ($timeout, $parse) {
    return {
      link: linkFn,
      restrict: "EA",
      // 不用 isolate scope，避免与同节点 drop-zone 冲突导致列表无法编译
    };

    function linkFn(scope, ele, attr) {
      ele.css({
        position: "relative",
      });

      var loadFn = $parse(attr.bottomLoader);
      var $scrollEl = ele.hasClass("file-list-box")
        ? ele
        : ele.closest(".file-list-box");

      if (!$scrollEl.length) {
        $scrollEl = ele;
        ele.css({ overflow: "auto" });
      }

      var tid2;

      function onScroll() {
        $timeout.cancel(tid2);
        tid2 = $timeout(function () {
          if (
            $scrollEl[0].scrollHeight > 0 &&
            $scrollEl.height() + $scrollEl.scrollTop() + 10 >=
              $scrollEl[0].scrollHeight
          ) {
            loadFn(scope);
          }
        }, 500);
      }

      onScroll();
      $(window).resize(onScroll);
      $scrollEl.scroll(onScroll);

      scope.$on("objectsListUpdated", function () {
        onScroll();
      });

      scope.$on("$destroy", function () {
        $timeout.cancel(tid2);
        $(window).off("resize", onScroll);
        $scrollEl.off("scroll", onScroll);
      });
    }
  },
]);
