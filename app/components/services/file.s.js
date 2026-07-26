angular.module('web').factory('fileSvs', [
  '$q',
  'Const',
  function($q, Const) {
    var PICTURE_EXTS = {
      png: 1,
      jpg: 1,
      jpeg: 1,
      gif: 1,
      svg: 1,
      ico: 1,
      webp: 1,
      bmp: 1,
      tif: 1,
      tiff: 1,
      avif: 1,
      apng: 1,
      heic: 1,
      heif: 1
    };

    var DIRECT_IMAGE_EXTS = {
      svg: 1,
      ico: 1,
      gif: 1,
      bmp: 1,
      apng: 1
    };

    var VIDEO_TYPES = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      ogv: 'video/ogg',
      flv: 'video/x-flv',
      mkv: 'video/x-matroska',
      m4v: 'video/x-m4v',
      avi: 'video/x-msvideo',
      wmv: 'video/x-ms-wmv',
      ts: 'video/mp2t'
    };

    var AUDIO_TYPES = {
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      flac: 'audio/flac',
      aac: 'audio/aac',
      m4a: 'audio/mp4',
      wma: 'audio/x-ms-wma',
      opus: 'audio/opus'
    };

    var CODE_EXT_ALIASES = {
      log: 'text',
      txt: 'text',
      md: 'markdown',
      markdown: 'markdown',
      ini: 'properties',
      conf: 'nginx',
      cfg: 'properties',
      env: 'properties',
      properties: 'properties',
      yaml: 'yaml',
      yml: 'yaml',
      toml: 'toml',
      sql: 'sql',
      sh: 'shell',
      bash: 'shell',
      zsh: 'shell',
      bat: 'shell',
      cmd: 'shell',
      ps1: 'powershell',
      vue: 'vue',
      tsx: 'jsx',
      jsx: 'jsx',
      ts: 'typescript',
      csv: 'spreadsheet',
      less: 'css',
      scss: 'css',
      sass: 'css',
      styl: 'css',
      dockerfile: 'dockerfile',
      makefile: 'shell',
      gitignore: 'text',
      gitattributes: 'text',
      editorconfig: 'properties'
    };

    function getExt(item) {
      if (!item || !item.name || item.name.indexOf('.') === -1) {
        return '';
      }

      return item.name.toLowerCase().substring(item.name.lastIndexOf('.') + 1);
    }

    function resolveCodeMode(ext) {
      var codeMode = CodeMirror.findModeByExtension(ext);

      if (codeMode) {
        codeMode.type = 'code';

        return codeMode;
      }

      var alias = CODE_EXT_ALIASES[ext];

      if (alias) {
        codeMode =
          CodeMirror.findModeByName(alias) ||
          CodeMirror.findModeByExtension(alias);

        if (codeMode) {
          codeMode.type = 'code';

          return codeMode;
        }
      }

      return null;
    }

    return {
      /**
       * 根据后缀判断
       * @param  item = {name, size}
       * @return obj = {type, ...}
       *     type: [picture|code|others|doc|video|audio]
       */
      getFileType: function(item) {
        var ext = getExt(item);

        if (Const.IMM_DOC_TYPES.indexOf(ext) != -1) {
          return { type: 'doc', ext: [ext] };
        }

        if (PICTURE_EXTS[ext]) {
          return { type: 'picture', ext: [ext] };
        }

        if (VIDEO_TYPES[ext]) {
          return {
            type: 'video',
            ext: [ext],
            mimeType: VIDEO_TYPES[ext]
          };
        }

        if (AUDIO_TYPES[ext]) {
          return {
            type: 'audio',
            ext: [ext],
            mimeType: AUDIO_TYPES[ext]
          };
        }

        var codeMode = resolveCodeMode(ext);

        if (codeMode) {
          return codeMode;
        }

        return { type: 'others', ext: [ext] };
      },

      isPictureExt: function(ext) {
        return !!PICTURE_EXTS[ext];
      },

      needsDirectImageUrl: function(ext) {
        return !!DIRECT_IMAGE_EXTS[ext];
      }
    };
  }
]);
