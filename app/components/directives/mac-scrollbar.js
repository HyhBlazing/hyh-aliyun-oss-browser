angular.module('web').directive('macScroll', [
  '$timeout',
  function($timeout) {
    return {
      restrict: 'C',
      link: function link(scope, ele) {
        var tid;

        ele.on('scroll', function() {
          ele.addClass('is-scrolling');
          $timeout.cancel(tid);
          tid = $timeout(function() {
            ele.removeClass('is-scrolling');
          }, 700);
        });

        scope.$on('$destroy', function() {
          ele.off('scroll');
          $timeout.cancel(tid);
        });
      }
    };
  }
]);
