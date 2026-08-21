/* ============================================================
 * avatar.js — 用户头像交互(零依赖)
 * ------------------------------------------------------------
 * 个人资料页的头像选择器:首字母 / 预设图标 / Emoji / 上传图片。
 * 上传图片与主流网站一致:自动裁切为方形(居中 cover)并压缩到
 * 256×256,原文件限制 200KB 以内,结果以 dataURL 存于 profile.avatar。
 * 渲染(avatarHtml)在 ui.js;状态(profile.avatar)由 settings.js
 * 校验并随个人资料同步数据库。
 * ============================================================ */
(function () {
  'use strict';

  var MAX_UPLOAD_BYTES = 200 * 1024; // 200KB 上传大小限制
  var AVATAR_SIZE = 256; // 裁切压缩后的边长(px)

  // 各类型当前值缓存(切换类型时保留已选值;image 存 dataURL)
  var VALUE_CACHE = { icon: 'user', emoji: '😀', image: '' };

  // 头像选择器样式内联注入(避免改动体积庞大的 vendored app.css)
  var AVATAR_STYLE =
    '.sp-avatar-lg{width:5rem;height:5rem}' +
    '.sp-avatar-row{display:flex;align-items:flex-start;gap:1.25rem}' +
    '.sp-avatar-col{display:flex;flex-direction:column;gap:.75rem;min-width:0;flex:1}' +
    '.sp-avatar-tabs{display:inline-flex;gap:.25rem;padding:.125rem;border:1px solid var(--border);border-radius:var(--radius-md);background:color-mix(in oklab, var(--muted) 40%, transparent)}' +
    '.sp-avatar-tab{height:2rem;padding:0 .75rem;border:0;border-radius:calc(var(--radius-md) - 2px);background:transparent;color:var(--muted-foreground);font-size:.875rem;cursor:pointer;outline:none}' +
    '.sp-avatar-tab:hover{background:var(--muted);color:var(--foreground)}' +
    '.sp-avatar-tab.is-active{background:var(--background);color:var(--foreground);box-shadow:0 1px 2px var(--shadow-color-card),0 0 0 1px var(--border)}' +
    '.sp-avatar-grid{display:grid;grid-template-columns:repeat(auto-fill,2.25rem);gap:.375rem}' +
    '.sp-avatar-opt{display:flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border:1px solid var(--border);border-radius:.5rem;background:var(--background);color:var(--foreground);font-size:1.125rem;line-height:1;cursor:pointer;outline:none}' +
    '.sp-avatar-opt:hover{background:var(--muted)}' +
    '.sp-avatar-opt.is-active{border-color:var(--primary);box-shadow:0 0 0 1px var(--primary);background:color-mix(in oklab, var(--primary) 8%, var(--background))}' +
    '.sp-avatar-opt svg{width:1rem;height:1rem}' +
    '.sp-avatar-upload{display:inline-flex;align-items:center;gap:.375rem}' +
    '.sp-avatar-error{min-height:1.25rem;font-size:.75rem;color:var(--destructive)}';

  function t() {
    var locale = document.documentElement.lang || App.i18n.DEFAULT_LOCALE;
    return App.i18n.makeT(locale);
  }

  function injectStyles() {
    if (document.head && !document.querySelector('style[data-avatar-style]')) {
      var style = document.createElement('style');
      style.setAttribute('data-avatar-style', '');
      style.textContent = AVATAR_STYLE;
      document.head.appendChild(style);
    }
  }

  function currentProfile() {
    return (App.getShellContext && App.getShellContext().settings.profile) || {};
  }

  /** 更新头像并立即生效(本地持久化 + 数据库同步 + 侧边栏/页面刷新) */
  function setAvatar(type, value) {
    VALUE_CACHE[type] = value;
    var profile = Object.assign({}, currentProfile(), {
      avatar: App.settings.sanitizeAvatar({ type: type, value: value }),
    });
    App.updateSettings({ profile: profile });
  }

  /** 切换类型标签:改用该类型的缓存值(首次使用默认值) */
  function setType(type) {
    if (App.settings.AVATAR_TYPES.indexOf(type) === -1) return;
    var cur = currentProfile().avatar || {};
    var value = cur.type === type ? cur.value : VALUE_CACHE[type];
    setAvatar(type, value);
  }

  /** 处理上传文件:校验类型与 200KB 大小 → 居中裁方 → 压缩为 256×256 dataURL */
  function processImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error('no_file'));
        return;
      }
      if (!/^image\//.test(file.type || '')) {
        reject(new Error('not_image'));
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        reject(new Error('too_large'));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error('read_failed'));
      };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () {
          reject(new Error('decode_failed'));
        };
        img.onload = function () {
          try {
            var side = Math.min(img.width, img.height);
            var sx = Math.max(0, Math.round((img.width - side) / 2));
            var sy = Math.max(0, Math.round((img.height - side) / 2));
            var canvas = document.createElement('canvas');
            canvas.width = AVATAR_SIZE;
            canvas.height = AVATAR_SIZE;
            var ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
            resolve(canvas.toDataURL('image/jpeg', 0.9));
          } catch (e) {
            reject(new Error('encode_failed'));
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function handleFile(file) {
    var errEl = document.querySelector('[data-avatar-error]');
    var tt = t();
    if (errEl) errEl.textContent = '';
    if (!file) return;
    processImage(file)
      .then(function (dataUrl) {
        setAvatar('image', dataUrl);
      })
      .catch(function (err) {
        var msg =
          err && err.message === 'too_large'
            ? tt('avatar.sizeError')
            : err && err.message === 'not_image'
              ? tt('avatar.typeError')
              : tt('avatar.readError');
        if (errEl) errEl.textContent = msg;
      });
  }

  // 点击:类型标签 / 图标 / Emoji / 上传按钮
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var tab = target.closest('[data-avatar-type]');
    if (tab) {
      setType(tab.getAttribute('data-avatar-type'));
      return;
    }
    var iconOpt = target.closest('[data-avatar-icon]');
    if (iconOpt) {
      setAvatar('icon', iconOpt.getAttribute('data-avatar-icon'));
      return;
    }
    var emojiOpt = target.closest('[data-avatar-emoji]');
    if (emojiOpt) {
      setAvatar('emoji', emojiOpt.getAttribute('data-avatar-emoji'));
      return;
    }
    if (target.closest('[data-avatar-upload]')) {
      var input = document.querySelector('[data-avatar-file]');
      if (input) input.click();
      return;
    }
  });

  // 文件选择
  document.addEventListener('change', function (e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-avatar-file')) {
      handleFile(e.target.files && e.target.files[0]);
    }
  });

  injectStyles();

  window.App = window.App || {};
  App.avatar = {
    setAvatar: setAvatar,
    setType: setType,
    processImage: processImage,
    MAX_UPLOAD_BYTES: MAX_UPLOAD_BYTES,
  };
})();
