angular.module('web').factory('Fav', [
  '$q',
  'AuthInfo',
  'Toast',
  function($q, AuthInfo, Toast) {
    var MAX = 100;
    var fs = require('fs');
    var path = require('path');
    var os = require('os');

    return {
      add: add,
      list: list,
      remove: remove,
      has: has,
      isFolderUrl: isFolderUrl,
      normalizeFolderUrl: normalizeFolderUrl,
      purgeInvalid: purgeInvalid
    };

    function normalizeFolderUrl(addr) {
      if (!addr || typeof addr !== 'string') {
        return '';
      }

      addr = addr.trim();

      if (addr === 'oss://') {
        return '';
      }

      if (addr.indexOf('oss://') !== 0) {
        return '';
      }

      var path = addr.substring(6).replace(/\/+$/, '');

      if (!path) {
        return '';
      }

      var slashIdx = path.indexOf('/');
      var bucket = slashIdx === -1 ? path : path.substring(0, slashIdx);
      var key = slashIdx === -1 ? '' : path.substring(slashIdx + 1);

      if (!bucket) {
        return '';
      }

      // 仅允许 Bucket 内的子文件夹，不含 Bucket 根目录
      if (!key) {
        return '';
      }

      if (/\/$/.test(addr)) {
        return 'oss://' + bucket + '/' + key.replace(/\/+$/, '') + '/';
      }

      var lastSeg = key.split('/').pop();

      if (/\.[^./\\]+$/.test(lastSeg)) {
        return '';
      }

      return 'oss://' + bucket + '/' + key.replace(/\/+$/, '') + '/';
    }

    function isFolderUrl(addr) {
      return !!normalizeFolderUrl(addr);
    }
    function has(addr) {
      var norm = normalizeFolderUrl(addr);

      if (!norm) {
        return false;
      }

      var arr = list();

      for (var i = 0; i < arr.length; i++) {
        if (normalizeFolderUrl(arr[i].url) === norm) {
          return true;
        }
      }

      return false;
    }

    function add(addr) {
      var norm = normalizeFolderUrl(addr);

      if (!norm) {
        return false;
      }

      var arr = list();

      if (arr.length >= MAX) { return false; }

      for (var i = 0; i < arr.length; i++) {
        if (normalizeFolderUrl(arr[i].url) === norm) {
          arr.splice(i, 1);
          i--;
        }
      }

      arr.push({ url: norm, time: new Date().getTime() });

      if (arr.length > MAX) {
        arr.splice(MAX, arr.length - MAX);
      }

      // localStorage.setItem('favs',JSON.stringify(arr));
      save(arr);

      return true;
    }

    function remove(addr) {
      var norm = normalizeFolderUrl(addr);

      if (!norm) {
        return;
      }

      var arr = list();

      for (var i = 0; i < arr.length; i++) {
        if (normalizeFolderUrl(arr[i].url) === norm) {
          arr.splice(i, 1);
          i--;
        }
      }

      // localStorage.setItem('favs',JSON.stringify(arr));
      save(arr);
    }

    function save(arr) {
      try {
        fs.writeFileSync(getFavFilePath(), JSON.stringify(arr));
      } catch (e) {
        Toast.error('保存收藏失败:' + e.message);
      }
    }

    function list() {
      try {
        var data = fs.readFileSync(getFavFilePath());

        return JSON.parse(data ? data.toString() : '[]');
        // var arr = JSON.parse(localStorage.getItem('favs')||'[]');
        // return arr;
      } catch (e) {
        return [];
      }
    }

    function purgeInvalid() {
      var arr = list();
      var valid = [];
      var removed = 0;
      var changed = false;

      for (var i = 0; i < arr.length; i++) {
        var norm = normalizeFolderUrl(arr[i].url);

        if (norm) {
          if (arr[i].url !== norm) {
            changed = true;
          }

          valid.push({
            url: norm,
            time: arr[i].time || new Date().getTime()
          });
        } else {
          removed++;
        }
      }

      if (valid.length !== arr.length || changed) {
        save(valid);
      }

      return {
        items: valid,
        removed: removed
      };
    }

    // 下载进度保存路径
    function getFavFilePath() {
      var folder = path.join(os.homedir(), '.oss-browser');

      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder);
      }

      var username = AuthInfo.get().id || '';

      return path.join(folder, 'fav_' + username + '.json');
    }
  }
]);
