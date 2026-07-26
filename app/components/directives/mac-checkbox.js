angular.module("web").directive("macCheckbox", [
  function () {
    return {
      restrict: "C",
      link: function (scope, element) {
        // 鼠标点击时阻止获焦，去掉 Windows 黄色焦点框；键盘 Tab/空格仍可用
        element.on("mousedown", function (e) {
          e.preventDefault();
        });

        scope.$on("$destroy", function () {
          element.off("mousedown");
        });
      },
    };
  },
]);
