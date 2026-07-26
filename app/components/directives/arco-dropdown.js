angular.module('web').directive('dropdownToggle', [
  '$document',
  function($document) {
    function bindDropdown(element) {
      var parent = element[0].closest('.btn-group, .dropdown');

      if (!parent || element.data('arcoDropdownBound')) {
        return;
      }

      element.data('arcoDropdownBound', true);

      element.on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        angular.forEach(
          $document[0].querySelectorAll('.btn-group.open, .dropdown.open'),
          function(node) {
            if (node !== parent) {
              angular.element(node).removeClass('open');
            }
          }
        );
        angular.element(parent).toggleClass('open');
      });

      element.on('$destroy', function() {
        element.off('click');
        element.removeData('arcoDropdownBound');
      });
    }

    return {
      restrict: 'AC',
      link: function(scope, element, attrs) {
        if (
          attrs.dropdownToggle !== undefined ||
          attrs.dataToggle === 'dropdown' ||
          element.hasClass('dropdown-toggle')
        ) {
          bindDropdown(element);
        }
      }
    };
  }
]);

angular.module('web').run([
  '$document',
  function($document) {
    $document.on('click', function() {
      angular.forEach(
        $document[0].querySelectorAll('.btn-group.open, .dropdown.open'),
        function(node) {
          angular.element(node).removeClass('open');
        }
      );
    });
  }
]);
