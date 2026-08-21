/* app/core/bootstrap.js — 当前项目的零构建模板运行时引导 */
(function () {
  'use strict';

  /* 登录首屏只加载鉴权所需能力；完整 Shell 与业务公共组件在鉴权后加载。 */
  var AUTH_CORE = [
    'shared/escape.js', // HTML 转义唯一实现（红线 13），必须最先就位
    'app/core/logger.js',
    'app/core/i18n.js',
    'app/components/ui/icons-data.js',
    'app/components/ui/icons.js',
    'app/core/api.js',
    'app/core/auth.js',
    'app/core/settings.js',
    'app/components/ui/ui.js',
  ];

  var APP_CORE = [
    'app/components/ui/tooltip.js',
    'app/components/ui/search-input.js',
    'app/components/ui/json-tree.js',
    'app/components/ui/color-picker.js',
    'app/components/ui/group-tree.js',
    'app/components/ui/tag-picker.js',
    'app/components/ui/data-table.js',
    'app/components/ui/avatar.js',
    'app/components/layout/shell.js',
    'app/core/app.js',
    'app/components/ui/workspace.js',
    'app/components/ui/profile.js',
    'app/core/interactions.js',
  ];

  var APP_STYLES = [
    'app/styles/tokens.css',
    'app/styles/semantic-tokens.css',
    'app/styles/utilities.css',
  ];
  var appRuntimePromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error('脚本加载失败: ' + src));
      };
      document.head.appendChild(script);
    });
  }

  function loadScripts(list) {
    return list.reduce(function (promise, src) {
      return promise.then(function () {
        return loadScript(src);
      });
    }, Promise.resolve());
  }

  function loadStyles(list) {
    return list.reduce(function (promise, href) {
      return promise.then(function () {
        return new Promise(function (resolve, reject) {
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          link.onload = resolve;
          link.onerror = function () {
            reject(new Error('样式加载失败: ' + href));
          };
          document.head.appendChild(link);
        });
      });
    }, Promise.resolve());
  }

  function loadRegistry() {
    var url = new URL('app/modules/registry.js', document.baseURI).href;
    return import(url).then(function (registry) {
      return registry.loadModuleConfigs();
    });
  }

  function showBootError(error) {
    if (window.App && App.logger) App.logger.error('boot', '应用启动失败', error);
    else console.error('[boot] 启动失败', error);
    var root = document.getElementById('app');
    if (root) {
      root.innerHTML =
        '<div class="boot-error">Boot failed: ' +
        String(error && error.message ? error.message : error) +
        '</div>';
    }
  }

  function loadApplicationRuntime() {
    if (!appRuntimePromise) {
      appRuntimePromise = loadScripts(APP_CORE)
        .then(loadRegistry)
        .then(function () {
          if (!window.App || typeof App.start !== 'function') {
            throw new Error('应用 Shell 未完成初始化');
          }
          if (App.logger) App.logger.info('boot', '核心运行时 + 模块注册表加载完成');
          return App.start();
        });
    }
    return appRuntimePromise;
  }

  function start() {
    if (!App.auth || !App.settings) return;
    if (!App.auth.isAuthed()) {
      App.auth.renderLogin();
      return Promise.resolve();
    }
    return loadApplicationRuntime();
  }

  loadStyles(APP_STYLES)
    .then(function () {
      return loadScripts(AUTH_CORE);
    })
    .then(function () {
      window.App = window.App || {};
      /* auth.js 的登录成功回调通过这个门进入完整应用运行时。 */
      App.start = start;
      return start();
    })
    .catch(showBootError);
})();
