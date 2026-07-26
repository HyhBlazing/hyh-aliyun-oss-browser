angular.module("web").directive("xgPlayer", [
  "$timeout",
  "$sce",
  function ($timeout, $sce) {
    return {
      restrict: "E",
      scope: {
        src: "=",
        ext: "@",
      },
      template:
        '<div class="xgplayer-host"><div class="xgplayer-mount"></div></div>',
      link: linkFn,
    };

    function linkFn(scope, ele) {
      var player = null;
      var resizeHandler = null;
      var playerId =
        "xgplayer_" + Math.random().toString(36).slice(2).replace(/\./g, "");

      scope.$watchGroup(["src", "ext"], function () {
        destroyPlayer();

        var url = getUrlString(scope.src);

        if (!url) {
          return;
        }

        $timeout(function () {
          initPlayer(url);
        }, 80);
      });

      scope.$on("$destroy", destroyPlayer);

      function getUrlString(src) {
        if (!src) {
          return "";
        }

        try {
          return $sce.getTrustedResourceUrl(src) || src || "";
        } catch (e) {
          return src || "";
        }
      }

      function isFlv(url, ext) {
        ext = (ext || "").toLowerCase();

        if (ext === "flv") {
          return true;
        }

        return /\.flv(\?|$)/i.test(url);
      }

      function getPlayerCtor() {
        var Player = window.xgplayer;

        if (typeof Player === "function") {
          return Player;
        }

        if (Player && typeof Player.default === "function") {
          return Player.default;
        }

        return null;
      }

      function getFlvPlayerCtor() {
        var FlvJsPlayer = window["xgplayer-flv.js"];

        if (typeof FlvJsPlayer === "function") {
          return FlvJsPlayer;
        }

        if (FlvJsPlayer && typeof FlvJsPlayer.default === "function") {
          return FlvJsPlayer.default;
        }

        return null;
      }

      var CONTROLS_HEIGHT = 40;

      function calcContainerSize() {
        var host = ele[0].querySelector(".xgplayer-host");
        var modalBody = ele[0].closest(".preview-modal-body");
        var width = host && host.clientWidth ? host.clientWidth : 0;
        var height = host && host.clientHeight ? host.clientHeight : 0;

        if (modalBody) {
          if (width <= 0) {
            width = modalBody.clientWidth;
          }

          if (height <= 0) {
            height = modalBody.clientHeight - 56;
          }
        }

        if (width <= 0) {
          width = Math.min(868, window.innerWidth - 32);
        }

        if (height <= 0) {
          height = Math.min(480, Math.max(320, window.innerHeight - 300));
        }

        return {
          width: Math.max(280, width),
          height: Math.max(320, Math.min(height, 520)),
        };
      }

      function applyPlayerLayout(root, width, height) {
        if (!root) {
          return;
        }

        root.style.width = width + "px";
        root.style.height = height + "px";
        root.style.maxWidth = "100%";
        root.style.margin = "0 auto";
      }

      function fitPlayerToVideo(playerInstance) {
        if (!playerInstance || !playerInstance.root || !playerInstance.video) {
          return;
        }

        var video = playerInstance.video;
        var videoWidth = video.videoWidth;
        var videoHeight = video.videoHeight;

        if (!videoWidth || !videoHeight) {
          return;
        }

        var container = calcContainerSize();
        var maxWidth = container.width;
        var maxHeight = Math.max(240, container.height - CONTROLS_HEIGHT);
        var scale = Math.min(maxWidth / videoWidth, maxHeight / videoHeight);
        var fitWidth = Math.round(videoWidth * scale);
        var fitHeight = Math.round(videoHeight * scale) + CONTROLS_HEIGHT;

        applyPlayerLayout(playerInstance.root, fitWidth, fitHeight);
      }

      function bindPlayerResize(playerInstance) {
        var onVideoMeta = function () {
          fitPlayerToVideo(playerInstance);
        };

        if (playerInstance.on) {
          playerInstance.on("loadedmetadata", onVideoMeta);
          playerInstance.on("loadeddata", onVideoMeta);
        }

        resizeHandler = function () {
          fitPlayerToVideo(playerInstance);
        };

        window.addEventListener("resize", resizeHandler);
      }

      function initPlayer(url) {
        var Player = getPlayerCtor();

        if (!Player) {
          console.error("xgplayer 未加载");

          return;
        }

        var mount = ele[0].querySelector(".xgplayer-mount");

        if (!mount) {
          return;
        }

        mount.id = playerId;
        mount.innerHTML = "";

        var container = calcContainerSize();
        var opts = {
          id: playerId,
          url: url,
          width: container.width,
          height: container.height,
          lang: "zh-cn",
          autoplay: true,
          videoInit: true,
          fitVideoSize: "fixed",
          fluid: false,
          cssFullscreen: false,
          controls: true,
          closeInactive: false,
          closePlayVideoFocus: false,
          ignores: [],
        };

        if (isFlv(url, scope.ext)) {
          var FlvJsPlayer = getFlvPlayerCtor();

          if (
            FlvJsPlayer &&
            (!FlvJsPlayer.isSupported || FlvJsPlayer.isSupported())
          ) {
            player = new FlvJsPlayer(opts);
            applyPlayerLayout(player.root, container.width, container.height);
            bindPlayerResize(player);

            return;
          }
        }

        player = new Player(opts);
        applyPlayerLayout(player.root, container.width, container.height);
        bindPlayerResize(player);
      }

      function destroyPlayer() {
        if (resizeHandler) {
          window.removeEventListener("resize", resizeHandler);
          resizeHandler = null;
        }

        if (player && player.destroy) {
          try {
            player.destroy(true);
          } catch (e) {
            player.destroy();
          }

          player = null;
        }

        var mount = ele[0].querySelector(".xgplayer-mount");

        if (mount) {
          mount.innerHTML = "";
        }
      }
    }
  },
]);
