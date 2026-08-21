/* ============================================================
 * app.js — 应用内核(零依赖)
 * ------------------------------------------------------------
 * - 模块注册表:manifest.js 声明元信息(registerModule),
 *   实现文件懒加载(defineModule),首次访问路由时才下载
 * - Hash 路由:支持 file:// 直接打开,无需任何服务器
 * - 事件全部走 document 委托,重渲染后无需重新绑定
 * ============================================================ */
(function () {
  'use strict';

  // ---------- 模块注册表 ----------
  /** @type {Object<string, {meta: object, loaded: boolean}>} */
  var modules = {};
  /** @type {Object<string, object>} 父模块实现 id -> {render} */
  var impls = {};
  /** @type {Object<string, object>} 子模块实现 'id:sub' -> {render} */
  var subImpls = {};
  /** @type {Object<string, Array<Function>>} 等待加载完成的回调 key -> [resolve, reject] */
  var pending = {};
  var loadedScripts = {};
  var loadedCss = {};

  function moduleDir(id) {
    return 'app/modules/' + id + '/';
  }

  /** 加载经典脚本(纯 <script> 注入):仅用于 deps 预注入与 i18n 词典等非模块文件;
   *  模块实现走动态 import()(见 ensureModuleLoaded,ADR-002)。 */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (loadedScripts[src]) {
        resolve();
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () {
        loadedScripts[src] = true;
        resolve();
      };
      s.onerror = function () {
        reject(new Error('模块脚本加载失败: ' + src));
      };
      document.head.appendChild(s);
    });
  }

  /** 加载样式(注入 <link>,按 href 去重) */
  function loadCss(href) {
    if (loadedCss[href]) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.onload = function () {
        loadedCss[href] = true;
        resolve();
      };
      l.onerror = function () {
        reject(new Error('模块样式加载失败: ' + href));
      };
      document.head.appendChild(l);
    });
  }

  function waitFor(key) {
    return new Promise(function (resolve, reject) {
      pending[key] = [resolve, reject];
    });
  }

  /** 模块清单注册:manifest.js 调用(仅元信息,体积极小) */
  function registerModule(meta) {
    if (!meta || !meta.id) {
      App.logger.error('core', 'registerModule 缺少 id', meta);
      return;
    }
    var m = {
      meta: {
        id: meta.id,
        title: meta.title || {},
        icon: meta.icon || 'circle-check',
        order: Number(meta.order) || 0,
        route: meta.route || '/' + meta.id,
        load: meta.load || 'index.js',
        loadRoot: typeof meta.loadRoot === 'function' ? meta.loadRoot : null,
        css: meta.css || null,
        deps: Array.isArray(meta.deps) ? meta.deps.slice() : [],
        i18n: meta.i18n || null,
        i18nFile: meta.i18nFile || null, // 模块词典懒加载文件(可选),加载后写入 meta.i18n
        children: (meta.children || []).map(function (c) {
          return {
            id: c.id,
            title: c.title || {},
            route: c.route || '/' + meta.id + '/' + c.id,
            order: Number(c.order) || 0,
            load: c.load || meta.load || 'index.js',
            css: c.css || null,
          };
        }),
      },
      loaded: false,
    };
    modules[meta.id] = m;
  }

  /** 模块实现注册:module.js / 子模块文件调用 */
  function defineModule(def) {
    if (!def || !def.id) {
      App.logger.error('core', 'defineModule 缺少 id', def);
      return;
    }
    var key = def.sub ? def.id + ':' + def.sub : def.id;
    if (def.sub) {
      subImpls[key] = def;
    } else {
      impls[def.id] = def;
    }
    if (pending[key]) {
      var cb = pending[key];
      delete pending[key];
      cb[0]();
    }
  }

  /** 解析路由 → 模块元信息 + 子模块(找不到返回 null) */
  function findRoute(path) {
    if (path === '' || path === '/') {
      var dash = modules['dashboard'];
      return dash ? { module: dash, child: null } : null;
    }
    var ids = Object.keys(modules);
    for (var i = 0; i < ids.length; i++) {
      var m = modules[ids[i]];
      if (m.meta.route === path) return { module: m, child: null };
      var children = m.meta.children || [];
      for (var j = 0; j < children.length; j++) {
        if (children[j].route === path) return { module: m, child: children[j] };
      }
    }
    return null;
  }

  /** 加载模块实现(懒加载:首次访问才下载脚本与样式) */
  function ensureModuleLoaded(m, child) {
    var meta = m.meta;
    var tasks = [];
    // meta.css 支持字符串或数组(按序加载,数组顺序即 <link> 插入顺序,保证层叠优先级)
    var cssFiles = Array.isArray(meta.css) ? meta.css : meta.css ? [meta.css] : [];
    cssFiles.forEach(function (f) {
      tasks.push(loadCss(moduleDir(meta.id) + f));
    });
    (meta.deps || []).forEach(function (src) {
      tasks.push(loadScript(src));
    });
    if (child && child.css) tasks.push(loadCss(moduleDir(meta.id) + child.css));
    // 模块词典懒加载(manifest 仅声明 i18nFile,不内联文案)
    if (meta.i18nFile && !meta.i18n) {
      tasks.push(
        loadScript(moduleDir(meta.id) + meta.i18nFile).then(function () {
          meta.i18n = window.__moduleI18n[meta.id] || null;
        })
      );
    }

    if (child) {
      var ckey = meta.id + ':' + child.id;
      // 子模块实现未定义时才加载子模块文件(父模块可能已统一实现)
      if (!subImpls[ckey] && !impls[meta.id]) {
        tasks.push(
          import(moduleDir(meta.id) + child.load).then(function () {
            if (!subImpls[ckey] && !impls[meta.id]) {
              return waitFor(ckey).then(function () {
                return undefined;
              });
            }
          })
        );
      }
    } else if (!impls[meta.id]) {
      // 模块实现经原生动态 import() 懒加载(ADR-002):支持 ESM 组织的模块内部拆分
      // (如 apihub 的 hub-*.js);清单未提供 loadRoot 时按 load 路径兜底。
      tasks.push(
        (meta.loadRoot ? meta.loadRoot() : import(moduleDir(meta.id) + meta.load)).then(
          function () {
            m.loaded = true;
            if (!impls[meta.id]) {
              return waitFor(meta.id).then(function () {
                return undefined;
              });
            }
          }
        )
      );
    } else {
      m.loaded = true;
    }
    return Promise.all(tasks);
  }

  /** 渲染路由:返回 { html, status };ctx.t 在词典懒加载完成后构建 */
  function resolveRoute(path, settings) {
    var hit = findRoute(path);
    if (!hit) {
      return Promise.resolve({
        html: App.ui.notFound(App.i18n.makeT(settings.locale)),
        status: 404,
      });
    }
    var m = hit.module;
    var meta = m.meta;
    return ensureModuleLoaded(m, hit.child).then(function () {
      // 子路由优先用子模块实现,未定义时回退到父模块实现(按路由分发)
      var def = null;
      if (hit.child) {
        def = subImpls[meta.id + ':' + hit.child.id] || impls[meta.id] || null;
      } else {
        def = impls[meta.id] || null;
      }
      if (!def || typeof def.render !== 'function') {
        throw new Error(
          '模块 ' + meta.id + (hit.child ? '/' + hit.child.id : '') + ' 未定义 render'
        );
      }
      var ctx = {
        path: path,
        settings: settings,
        t: App.i18n.makeT(settings.locale, meta.i18n),
        App: App,
      };
      return { html: def.render(path, ctx), status: 200 };
    });
  }

  /** 构建全部侧边栏导航项(从模块注册表,不过滤隐藏项) */
  function buildAllNavItems(locale) {
    return Object.keys(modules)
      .sort(function (a, b) {
        return modules[a].meta.order - modules[b].meta.order;
      })
      .map(function (id) {
      var meta = modules[id].meta;
      var item = {
        id: id,
        title: App.i18n.pick(meta.title, locale),
        icon: meta.icon,
        href: meta.route,
      };
      if (meta.children && meta.children.length) {
        item.children = meta.children.map(function (c) {
          return { id: c.id, title: App.i18n.pick(c.title, locale), href: c.route };
        });
      }
      return item;
    });
  }

  /** 构建侧边栏导航项:过滤显示页隐藏的菜单项(支持父级 'id' 与子级 'parent:child') */
  function buildNavItems(locale) {
    return buildAllNavItems(locale).filter(function (item) {
      if (settings.hiddenNav.indexOf(item.id) !== -1) return false;
      if (item.children && item.children.length) {
        item.children = item.children.filter(function (c) {
          return settings.hiddenNav.indexOf(item.id + ':' + c.id) === -1;
        });
      }
      return true;
    });
  }

  // ---------- 全局状态 ----------
  var app = document.getElementById('app');
  var settings = App.settings.readSettings();
  var sheetOpen = false;

  /** 各可折叠父菜单的展开状态(模块 id → true/false),如 docs / settings */
  var openSubmenus = (function () {
    var o = {};
    var hit = findRoute(currentPath());
    if (hit && hit.module.meta.children && hit.module.meta.children.length) {
      o[hit.module.meta.id] = true;
    }
    return o;
  })();

  App.settings.applySettings(settings);

  function currentPath() {
    var h = window.location.hash || '';
    if (h.charAt(0) === '#') h = h.slice(1);
    if (h === '' || h === '/' || h === '#') return '/';
    // 支持查询参数深链(如 #/apihub?r=GET%20/api/settings):路由匹配仅看路径段
    var q = h.indexOf('?');
    if (q !== -1) h = h.slice(0, q);
    return h;
  }

  // ---------- 设置更新 ----------
  /**
   * @param {object} patch 部分设置(浅合并;子对象需整体替换,如 { profile: {...} })
   * @param {object} [opts] { noRerender: true } 用于输入框逐键更新时避免重渲染抢焦点
   */
  /** 判断 patch 是否触及某类设置(避免每次击键都重建整棵侧边栏/顶栏) */
  function patchTouches(patch, keys) {
    return keys.some(function (k) {
      return Object.prototype.hasOwnProperty.call(patch, k);
    });
  }

  /** 配置文件域:命中这些键时把当前设置同步进激活配置文件的快照(VSCode 行为:改动即保存) */
  var PROFILE_DOMAIN_KEYS = [
    'theme',
    'appearance',
    'notifications',
    'sidebarOpen',
    'sidebarVariant',
    'sidebarCollapsible',
    'sidebarWidth',
    'hiddenNav',
  ];

  /** 把当前设置写回激活配置文件的快照(值未变化则跳过,避免无谓写存储) */
  function syncActiveProfileSnapshot() {
    var list = settings.profiles || [];
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === settings.activeProfile) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return;
    var snap = App.settings.profileCapture(settings);
    if (JSON.stringify(list[idx].snapshot) === JSON.stringify(snap)) return;
    var next = list.slice();
    next[idx] = Object.assign({}, list[idx], { snapshot: snap });
    settings = Object.assign({}, settings, { profiles: next });
  }

  function updateSettings(patch, opts) {
    opts = opts || {};
    settings = Object.assign({}, settings, patch);
    // 外观/通知/显示发生变化时同步激活配置文件快照(须在 pushSettingsToServer 之前)
    if (patchTouches(patch, PROFILE_DOMAIN_KEYS)) syncActiveProfileSnapshot();
    App.settings.applySettings(settings);
    App.settings.persistSettings(settings);
    pushSettingsToServer(); // 双向同步:本地改动异步写入数据库 app_settings
    // 仅在相关设置变化时刷新顶栏/侧边栏:profile/account/notifications 等
    // 表单击键不重建侧边栏,避免高频输入触发不必要的整树 DOM 重建。
    if (patchTouches(patch, ['theme'])) syncHeaderThemeButtons();
    // 主题/外观变化后通知模块重建图表配色(如 dashboard 的 Chart.js)
    if (patchTouches(patch, ['theme', 'appearance']))
      document.dispatchEvent(new CustomEvent('app:themechange'));
    if (patchTouches(patch, ['profile'])) syncUserMenu();
    if (
      patchTouches(patch, [
        'locale',
        'sidebarVariant',
        'sidebarCollapsible',
        'sidebarWidth',
        'hiddenNav',
        'workspaces',
        'activeWorkspace',
      ])
    )
      refreshSidebar();
    if (sheetOpen) App.shell.rerenderSheetContent(settings, tFor(settings.locale));
    // 设置页与右上角面板同源:任一侧修改,当前设置页内容同步刷新(双向同步)
    if (!opts.noRerender && currentPath().indexOf('/settings') === 0) rerenderContent();
  }

  /* ---------- 设置表单字段(个人资料/账号/通知)数据绑定 ---------- */
  /** 写设置字段(路径如 profile.email / account.dob / notifications.mobile),自定义控件也可复用 */
  function applySettingValue(setting, value, noRerender) {
    var parts = String(setting || '').split('.');
    if (parts.length < 2) return;
    var domain = parts[0];
    if (domain !== 'profile' && domain !== 'account' && domain !== 'notifications') return;
    var fields = parts.slice(1);
    var current = Object.assign({}, settings[domain]);
    var target = current;
    for (var i = 0; i < fields.length - 1; i++) {
      var seg = fields[i];
      if (!target[seg] || typeof target[seg] !== 'object') target[seg] = {};
      target = target[seg];
    }
    target[fields[fields.length - 1]] = value;
    var patch = {};
    patch[domain] = current;
    updateSettings(patch, noRerender ? { noRerender: true } : undefined);
  }

  /** data-setting="domain.field[.index]" → 更新嵌套值并同步数据库 */
  function applySettingField(el, noRerender) {
    var value = el.type === 'checkbox' ? !!el.checked : el.value;
    applySettingValue(el.getAttribute('data-setting'), value, noRerender);
  }

  // change:选择/复选/单选/失焦(可重渲染同步 UI);input:逐键输入(不重渲染,避免抢焦点)
  document.addEventListener('change', function (e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-setting')) {
      applySettingField(e.target, false);
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-setting')) {
      applySettingField(e.target, true);
    }
  });

  /* ---------- 数据库 app_settings 双向同步 ---------- */
  /** 本地设置 → 数据库 KV(键遵循 README 命名规范:settings:* 全局设置) */
  function serverSettingsPayload() {
    var a = settings.appearance;
    return {
      'settings:appearance': JSON.stringify({
        theme: settings.theme,
        style: a.style,
        baseColor: a.baseColor,
        chartColor: a.chartColor,
        radius: a.radius,
        bodyFont: a.bodyFont,
        headingFont: a.headingFont,
        menuColor: a.menuColor,
        menuAppearance: a.menuAppearance,
        useBase: a.useBase !== false,
        useAccent: a.useAccent !== false,
      }),
      'settings:display': JSON.stringify({
        sidebarOpen: !!settings.sidebarOpen,
        sidebarVariant: settings.sidebarVariant,
        sidebarCollapsible: settings.sidebarCollapsible,
        sidebarWidth: settings.sidebarWidth,
        hiddenNav: settings.hiddenNav || [],
      }),
      'settings:profile': JSON.stringify(settings.profile || {}),
      'settings:account': JSON.stringify(settings.account || {}),
      'settings:notifications': JSON.stringify(settings.notifications || {}),
      'settings:workspaces': JSON.stringify(settings.workspaces || []),
      'settings:activeWorkspace': String(settings.activeWorkspace || ''),
      'settings:profiles': JSON.stringify(settings.profiles || []),
      'settings:activeProfile': String(settings.activeProfile || ''),
    };
  }

  /** 写入数据库(防抖:拖拽调宽等高频调用只合并一次) */
  var serverSyncTimer = null;
  function pushSettingsToServer() {
    if (!App.auth || !App.auth.token()) return; // 未登录(如 file:// 直开)仅本地
    if (serverSyncTimer) clearTimeout(serverSyncTimer);
    serverSyncTimer = setTimeout(function () {
      serverSyncTimer = null;
      App.api.put('/api/settings', { settings: serverSettingsPayload() }).catch(function (e) {
        if (e && e.status !== 401) App.logger.warn('core', '设置同步到数据库失败', e);
      });
    }, 400);
  }

  /** 数据库值 → 本地存储键(白名单校验由 readSettings 兜底),返回合并后的设置对象 */
  function mergeServerSettings(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var appearance = null;
    var display = null;
    try {
      appearance = JSON.parse(raw['settings:appearance'] || 'null');
    } catch (e) {
      appearance = null;
    }
    try {
      display = JSON.parse(raw['settings:display'] || 'null');
    } catch (e) {
      display = null;
    }
    var K = App.settings.K;
    var set = App.settings.writeStorage;
    if (appearance && typeof appearance === 'object') {
      if (appearance.theme) set(K('theme'), String(appearance.theme));
      if (appearance.style) set(K('style'), String(appearance.style));
      if (appearance.baseColor) set(K('base'), String(appearance.baseColor));
      if (appearance.chartColor) set(K('chart'), String(appearance.chartColor));
      if (appearance.radius) {
        var r = App.settings.RADII.find(function (x) {
          return x.value === appearance.radius;
        });
        if (r) set(K('radius'), r.px);
      }
      if (appearance.bodyFont) {
        var bf = App.settings.FONTS.find(function (x) {
          return x.value === appearance.bodyFont;
        });
        if (bf) set(K('font'), bf.stack);
      }
      if (appearance.headingFont) {
        var hf = App.settings.FONTS.find(function (x) {
          return x.value === appearance.headingFont;
        });
        if (hf) set(K('heading-font'), hf.stack);
      }
      if (appearance.menuColor) set(K('menu-color'), String(appearance.menuColor));
      if (appearance.menuAppearance) set(K('menu-appearance'), String(appearance.menuAppearance));
      if (typeof appearance.useBase === 'boolean') set(K('use-base'), appearance.useBase ? '1' : '0');
      if (typeof appearance.useAccent === 'boolean') set(K('use-accent'), appearance.useAccent ? '1' : '0');
    }
    if (display && typeof display === 'object') {
      if (display.sidebarOpen != null) set(K('sidebar-open'), String(!!display.sidebarOpen));
      if (display.sidebarVariant) set(K('sidebar-variant'), String(display.sidebarVariant));
      if (display.sidebarCollapsible)
        set(K('sidebar-collapsible'), String(display.sidebarCollapsible));
      if (display.sidebarWidth != null) set(K('sidebar-width'), String(display.sidebarWidth));
      if (Array.isArray(display.hiddenNav)) set(K('hidden-nav'), JSON.stringify(display.hiddenNav));
    }
    // 设置子页数据(profile/account/notifications):合法 JSON 直接写存储键,readSettings 会做形状校验
    ['profile', 'account', 'notifications'].forEach(function (domain) {
      var rawKey = 'settings:' + domain;
      if (typeof raw[rawKey] !== 'string' || !raw[rawKey]) return;
      try {
        JSON.parse(raw[rawKey]);
        set(K(domain), raw[rawKey]);
      } catch (e) {
        /* 脏数据忽略,保持本地值 */
      }
    });
    if (typeof raw['settings:workspaces'] === 'string' && raw['settings:workspaces']) {
      try {
        var ws = JSON.parse(raw['settings:workspaces']);
        if (Array.isArray(ws) && ws.length) set(K('workspaces'), JSON.stringify(ws));
      } catch (e) {
        /* 脏数据忽略,保持本地值 */
      }
    }
    if (typeof raw['settings:activeWorkspace'] === 'string' && raw['settings:activeWorkspace']) {
      set(K('active-workspace'), raw['settings:activeWorkspace']);
    }
    if (typeof raw['settings:profiles'] === 'string' && raw['settings:profiles']) {
      try {
        var ps = JSON.parse(raw['settings:profiles']);
        if (Array.isArray(ps) && ps.length) set(K('profiles'), JSON.stringify(ps));
      } catch (e) {
        /* 脏数据忽略,保持本地值 */
      }
    }
    if (typeof raw['settings:activeProfile'] === 'string' && raw['settings:activeProfile']) {
      set(K('active-profile'), raw['settings:activeProfile']);
    }
    return App.settings.readSettings();
  }

  /** 服务端可覆盖的设置子集(排除 locale 等仅本地字段),用于变化检测 */
  function serverSettingsSnapshot(s) {
    return JSON.stringify({
      theme: s.theme,
      appearance: s.appearance,
      sidebarOpen: s.sidebarOpen,
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      sidebarWidth: s.sidebarWidth,
      hiddenNav: s.hiddenNav,
      profile: s.profile,
      account: s.account,
      notifications: s.notifications,
      workspaces: s.workspaces,
      activeWorkspace: s.activeWorkspace,
      profiles: s.profiles,
      activeProfile: s.activeProfile,
    });
  }

  /** 登录后从数据库拉取设置并应用(服务端为准;失败时静默回退本地)。
   *  优先使用本地缓存:启动时已从 localStorage 渲染;仅当服务端数据
   *  与当前值不同才整页刷新,避免无变化时的重复渲染。 */
  function syncSettingsFromServer() {
    if (!App.auth || !App.auth.token()) return;
    App.api
      .get('/api/settings')
      .then(function (raw) {
        var merged = mergeServerSettings(raw);
        if (!merged) return;
        if (serverSettingsSnapshot(settings) === serverSettingsSnapshot(merged)) return;
        settings = merged;
        App.settings.applySettings(settings);
        document.documentElement.lang = settings.locale;
        renderApp();
      })
      .catch(function (e) {
        if (e && e.status !== 401) App.logger.warn('core', '从数据库同步设置失败', e);
      });
  }

  /* ---------- 工作空间切换(缓存优先 + 后台加载目标工作空间) ---------- */
  /** 全局键:工作空间注册表 + 当前指针(唯一跨工作空间共享的服务端设置) */
  function globalSettingsPayload() {
    return {
      'settings:workspaces': JSON.stringify(settings.workspaces || []),
      'settings:activeWorkspace': String(settings.activeWorkspace || ''),
    };
  }

  /** 只写全局注册表,不携带任何工作空间数据,避免切换时污染新工作空间 */
  function pushGlobalSettingsToServer() {
    if (!App.auth || !App.auth.token()) return;
    App.api.put('/api/settings', { settings: globalSettingsPayload() }).catch(function (e) {
      if (e && e.status !== 401) App.logger.warn('core', '全局工作空间设置同步失败', e);
    });
  }

  /** 立即把当前(旧)工作空间数据落库(跳过防抖),确保切换前不丢改动、不串库 */
  function flushSettingsSync() {
    if (serverSyncTimer) {
      clearTimeout(serverSyncTimer);
      serverSyncTimer = null;
    }
    if (!App.auth || !App.auth.token()) return;
    App.api.put('/api/settings', { settings: serverSettingsPayload() }).catch(function (e) {
      if (e && e.status !== 401) App.logger.warn('core', '工作空间设置落库失败', e);
    });
  }

  /** 重置工作空间字段为默认,保留注册表 / 当前指针 / 本地语言 */
  function applyWorkspaceSwitch(registry, id) {
    var locale = settings.locale;
    var fresh = App.settings.resetAllSettings();
    fresh.workspaces = registry;
    fresh.activeWorkspace = id;
    fresh.locale = locale;
    settings = fresh;
    App.settings.applySettings(settings);
    App.settings.persistSettings(settings);
    document.documentElement.lang = settings.locale;
  }

  /** 从服务端加载目标工作空间数据并渲染(空工作空间回退默认) */
  function loadWorkspaceSettings(id) {
    App.api
      .get('/api/settings?workspace=' + encodeURIComponent(id))
      .then(function (raw) {
        var merged = mergeServerSettings(raw);
        if (merged) settings = merged;
        else settings.activeWorkspace = id;
        App.settings.applySettings(settings);
        document.documentElement.lang = settings.locale;
        renderApp();
      })
      .catch(function (e) {
        if (e && e.status !== 401) App.logger.warn('core', '加载工作空间设置失败', e);
        renderApp();
      });
  }

  /** 切换到指定工作空间:旧数据落库 → 重置 → 写全局指针 → 加载新数据 */
  function switchWorkspace(id) {
    if (!id || id === settings.activeWorkspace) return;
    flushSettingsSync();
    applyWorkspaceSwitch(settings.workspaces, id);
    pushGlobalSettingsToServer();
    loadWorkspaceSettings(id);
  }

  /** 新增 / 编辑工作空间。isEdit=false 时切入新空间;true 时仅更新注册表(标识不变)。 */
  function saveWorkspace(ws, isEdit) {
    if (!ws || !ws.names || !ws.names.en) return;
    var list = (settings.workspaces || []).slice();
    var entry = App.settings.normalizeWorkspace(ws);
    if (isEdit) {
      if (!entry.id) return;
      var found = false;
      list = list.map(function (w) {
        if (w.id === entry.id) {
          found = true;
          return entry;
        }
        return w;
      });
      if (!found) return;
      settings = Object.assign({}, settings, { workspaces: list });
      App.settings.persistSettings(settings);
      pushGlobalSettingsToServer();
      refreshSidebar();
      return;
    }
    // 新增:英文名生成 id(重名自动追加序号),写入注册表后切入
    entry.id =
      entry.id ||
      App.settings.uniqueWorkspaceId('ws-' + App.settings.slugify(ws.names.en), list, '');
    if (!entry.id) return;
    flushSettingsSync();
    applyWorkspaceSwitch(list.concat([entry]), entry.id);
    pushGlobalSettingsToServer();
    loadWorkspaceSettings(entry.id);
  }

  /** 删除工作空间前,后台清理该工作空间在 app_settings 中的全部数据行 */
  function purgeWorkspaceData(id) {
    if (!App.auth || !App.auth.token()) return;
    App.api
      .get('/api/settings?workspace=' + encodeURIComponent(id))
      .then(function (raw) {
        var keys = Object.keys(raw || {}).filter(function (k) {
          return (
            k !== 'settings:workspaces' &&
            k !== 'settings:activeWorkspace' &&
            k.indexOf('settings:auth:') !== 0
          );
        });
        if (!keys.length) return null;
        return App.api.del('/api/settings?workspace=' + encodeURIComponent(id), { keys: keys });
      })
      .catch(function (e) {
        if (e && e.status !== 401) App.logger.warn('core', '清理工作空间数据失败', e);
      });
  }

  /** 删除工作空间:更新注册表与当前指针,至少保留一个工作空间 */
  function deleteWorkspace(id) {
    var list = (settings.workspaces || []).filter(function (w) {
      return w.id !== id;
    });
    if (!list.length) return; // 至少保留一个工作空间
    var wasActive = settings.activeWorkspace === id;
    var nextActive = wasActive ? list[0].id : settings.activeWorkspace;
    flushSettingsSync();
    purgeWorkspaceData(id);
    if (wasActive) {
      applyWorkspaceSwitch(list, nextActive);
      pushGlobalSettingsToServer();
      loadWorkspaceSettings(nextActive);
      return;
    }
    settings = Object.assign({}, settings, { workspaces: list });
    App.settings.persistSettings(settings);
    pushGlobalSettingsToServer();
    refreshSidebar();
  }

  /* ---------- 配置文件(VSCode 风格:切换/新建/重命名/删除,保存 外观/通知/显示) ---------- */
  /** 切换配置文件:先把当前设置存进当前激活配置的快照,再应用目标快照 */
  function switchProfile(id) {
    var list = (settings.profiles || []).slice();
    var target = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        target = list[i];
        break;
      }
    }
    if (!target || id === settings.activeProfile) return;
    for (var j = 0; j < list.length; j++) {
      if (list[j].id === settings.activeProfile) {
        list[j] = Object.assign({}, list[j], {
          snapshot: App.settings.profileCapture(settings),
        });
      }
    }
    settings = App.settings.profileApply(
      Object.assign({}, settings, { profiles: list }),
      target.snapshot
    );
    settings.activeProfile = target.id;
    App.settings.applySettings(settings);
    App.settings.persistSettings(settings);
    pushSettingsToServer();
    renderApp();
  }

  /** 新建(基于当前设置快照并激活)或重命名当前配置文件;返回是否成功 */
  function saveProfile(name, isEdit) {
    name = String(name == null ? '' : name).trim();
    if (!name) return false;
    var list = (settings.profiles || []).slice();
    if (isEdit) {
      var found = false;
      list = list.map(function (p) {
        if (p.id === settings.activeProfile) {
          found = true;
          return Object.assign({}, p, { name: name, nameKey: '' });
        }
        return p;
      });
      if (!found) return false;
      settings = Object.assign({}, settings, { profiles: list });
    } else {
      var id = 'p-' + Date.now().toString(36);
      while (
        list.some(function (p) {
          return p.id === id;
        })
      ) {
        id = 'p-' + Date.now().toString(36);
      }
      list = list.concat([
        { id: id, name: name, nameKey: '', snapshot: App.settings.profileCapture(settings) },
      ]);
      settings = Object.assign({}, settings, { profiles: list, activeProfile: id });
    }
    App.settings.applySettings(settings);
    App.settings.persistSettings(settings);
    pushSettingsToServer();
    renderApp();
    return true;
  }

  /** 删除配置文件:至少保留一个;删除激活配置时切换到剩余第一个 */
  function deleteProfile(id) {
    var list = (settings.profiles || []).filter(function (p) {
      return p.id !== id;
    });
    if (!list.length) return;
    var wasActive = settings.activeProfile === id;
    settings = Object.assign({}, settings, {
      profiles: list,
      activeProfile: wasActive ? list[0].id : settings.activeProfile,
    });
    if (wasActive) {
      settings = App.settings.profileApply(settings, list[0].snapshot);
      settings.activeProfile = list[0].id;
    }
    App.settings.applySettings(settings);
    App.settings.persistSettings(settings);
    pushSettingsToServer();
    renderApp();
  }

  function setTheme(theme) {
    updateSettings({ theme: theme });
  }

  function setLocale(locale) {
    settings = Object.assign({}, settings, { locale: locale });
    App.settings.applySettings(settings);
    App.settings.persistSettings(settings);
    document.documentElement.lang = locale;
    renderApp();
    if (sheetOpen) App.shell.rerenderSheetContent(settings, tFor(locale));
  }

  function setAppearance(patch) {
    updateSettings({ appearance: Object.assign({}, settings.appearance, patch) });
  }

  function setSidebarVariant(v) {
    updateSettings({ sidebarVariant: v });
  }

  function setSidebarCollapsible(c) {
    updateSettings({ sidebarCollapsible: c });
  }

  function setSidebarWidth(w) {
    var clamped = Math.min(
      App.settings.SIDEBAR_MAX_WIDTH,
      Math.max(App.settings.SIDEBAR_MIN_WIDTH, Math.round(w))
    );
    updateSettings({ sidebarWidth: clamped });
  }

  function setLayout(v) {
    if (v === 'default') {
      setSidebarOpen(true);
    } else {
      setSidebarOpen(false);
      setSidebarCollapsible(v === 'icon' ? 'icon' : 'offcanvas');
    }
  }

  /** 重置外观(主题/布局/外观),与 mpages Settings → Appearance 一致,不清除语言与宽度 */
  function resetAppearance() {
    updateSettings({
      theme: 'system',
      appearance: Object.assign({}, App.settings.APPEARANCE_DEFAULTS),
      sidebarVariant: 'inset',
      sidebarCollapsible: 'icon',
    });
    setSidebarOpen(true);
  }

  /** 仅重渲染当前内容区(保留滚动位置),供设置页与面板双向同步 */
  function rerenderContent() {
    var contentArea = app.querySelector('[data-content-area]');
    var viewport = app.querySelector('[data-slot="scroll-area-viewport"]');
    var scrollTop = viewport ? viewport.scrollTop : 0;
    // 设置页左右两栏各自独立滚动:重渲染后同样保留右侧内容栏的滚动位置
    var spContent = contentArea ? contentArea.querySelector('.sp-content') : null;
    var spScrollTop = spContent ? spContent.scrollTop : 0;
    resolveRoute(currentPath(), settings)
      .then(function (result) {
        if (contentArea) contentArea.innerHTML = result.html;
        if (viewport) viewport.scrollTop = scrollTop;
        var next = contentArea ? contentArea.querySelector('.sp-content') : null;
        if (next) next.scrollTop = spScrollTop;
        updateNavActive(currentPath());
      })
      .catch(function (e) {
        App.logger.error('core', '设置同步重渲染失败', e);
      });
  }

  function resetSettings() {
    settings = App.settings.resetAllSettings();
    openSubmenus = {};
    App.settings.applySettings(settings);
    document.documentElement.lang = settings.locale;
    pushSettingsToServer(); // 重置结果写回数据库
    renderApp();
    if (sheetOpen) App.shell.rerenderSheetContent(settings, tFor(settings.locale));
  }

  function tFor(locale) {
    return App.i18n.makeT(locale);
  }

  // ---------- Sidebar(展开/收起状态纳入 settings.sidebarOpen,随配置文件与数据库同步) ----------
  function setSidebarOpen(open) {
    updateSettings({ sidebarOpen: !!open }, { noRerender: true });
    syncSidebarState();
  }

  function syncSidebarState() {
    var open = !!settings.sidebarOpen;
    var root = app.querySelector('[data-slot="sidebar"]');
    if (!root) return;
    root.setAttribute('data-state', open ? 'expanded' : 'collapsed');
    root.setAttribute('data-collapsible', open ? '' : settings.sidebarCollapsible);
    root.setAttribute('data-variant', settings.sidebarVariant);
    var container = app.querySelector('[data-slot="sidebar-container"]');
    if (container)
      container.setAttribute('data-collapsible', open ? '' : settings.sidebarCollapsible);
    var sidebarEl = app.querySelector('[data-slot="sidebar"]');
    if (sidebarEl) sidebarEl.setAttribute('data-open', String(open));
  }

  function refreshSidebar() {
    var sidebarEl = app.querySelector('[data-slot="sidebar"]');
    if (!sidebarEl) return;
    var pathname = currentPath();
    var navItems = buildNavItems(settings.locale);
    sidebarEl.outerHTML = App.shell.sidebarHtml(
      navItems,
      settings,
      tFor(settings.locale),
      pathname,
      openSubmenus
    );
    syncSidebarState();
  }

  function toggleSubmenu(id) {
    openSubmenus[id] = !openSubmenus[id];
    refreshSidebar();
  }

  // ---------- 路由 ----------
  function navigate(path) {
    if (currentPath() === path) {
      renderRoute();
      return;
    }
    window.location.hash = '#' + path;
  }

  window.addEventListener('hashchange', function () {
    renderRoute();
  });

  // 切回前台时后台核对一次最新设置:本地缓存优先展示,服务端有变化才刷新
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') syncSettingsFromServer();
  });

  var navToken = 0;

  function renderRoute() {
    var path = currentPath();
    var token = ++navToken;
    var contentArea = app.querySelector('[data-content-area]');
    var viewport = app.querySelector('[data-slot="scroll-area-viewport"]');
    resolveRoute(path, settings)
      .then(function (result) {
        if (token !== navToken) return; // 已有更新的导航,丢弃过期结果
        if (contentArea) contentArea.innerHTML = result.html;
        // 内容挂载完成通知:模块(如 dashboard 图表)据此初始化 DOM 后逻辑
        document.dispatchEvent(new CustomEvent('app:afterRender', { detail: { path: path } }));
        if (viewport) viewport.scrollTop = 0;
        var hit = findRoute(path);
        var opened = false;
        if (
          hit &&
          hit.module.meta.children &&
          hit.module.meta.children.length &&
          !openSubmenus[hit.module.meta.id]
        ) {
          openSubmenus[hit.module.meta.id] = true; // 导航进入父模块时自动展开其子菜单
          opened = true;
        }
        if (opened) refreshSidebar();
        else updateNavActive(path);
        App.interactions.closeMobileSidebar();
        closeDropdowns();
      })
      .catch(function (e) {
        App.logger.error('core', '路由渲染失败: ' + path, e);
        if (token !== navToken) return;
        if (contentArea) contentArea.innerHTML = App.ui.notFound(tFor(settings.locale));
        updateNavActive(path);
      });
  }

  function updateNavActive(path) {
    app.querySelectorAll('[data-slot="sidebar-menu-button"]').forEach(function (el) {
      var href = el.getAttribute('data-link');
      if (href == null) return;
      var active = href === path;
      el.classList.toggle('data-active', active);
      el.classList.toggle('bg-sidebar-accent', active);
      el.classList.toggle('font-medium', active);
      if (el.getAttribute('aria-current')) el.setAttribute('aria-current', active ? 'page' : '');
    });
  }

  function renderApp() {
    var pathname = currentPath();
    var viewport = app.querySelector('[data-slot="scroll-area-viewport"]');
    var scrollTop = viewport ? viewport.scrollTop : 0;
    var navItems = buildNavItems(settings.locale);
    var html = App.shell.renderShell(
      settings,
      tFor(settings.locale),
      pathname,
      navItems,
      openSubmenus
    );
    app.innerHTML = html;
    var newViewport = app.querySelector('[data-slot="scroll-area-viewport"]');
    if (newViewport) newViewport.scrollTop = scrollTop;
    syncSidebarState();
    renderRoute();
  }

  // ---------- Dropdown ----------
  function closeDropdowns() {
    document.querySelectorAll('[data-dropdown-menu]').forEach(function (m) {
      m.classList.remove('open');
    });
    document.querySelectorAll('[data-dropdown-trigger]').forEach(function (tr) {
      tr.removeAttribute('aria-expanded');
    });
  }

  function toggleDropdown(trigger) {
    var wrap = trigger.closest('[data-dropdown]');
    if (!wrap) return;
    var menu = wrap.querySelector('[data-dropdown-menu]');
    if (!menu) return;
    var wasOpen = menu.classList.contains('open');
    closeDropdowns();
    if (wasOpen) return;
    var rect = wrap.getBoundingClientRect();
    if (rect.bottom > window.innerHeight * 0.7) {
      menu.style.bottom = '100%';
      menu.style.top = 'auto';
      menu.style.marginBottom = '4px';
    } else {
      menu.style.top = '100%';
      menu.style.bottom = 'auto';
      menu.style.marginTop = '4px';
    }
    menu.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }

  // ---------- 设置面板(Sheet) ----------
  function openSheet() {
    if (sheetOpen) return;
    var overlay = document.createElement('div');
    overlay.dataset.sheetOverlay = '';
    overlay.className = 'fixed inset-0 z-40 bg-black/50';
    overlay.addEventListener('click', closeSheet);
    var holder = document.createElement('div');
    holder.innerHTML = App.shell.renderSettingsSheet(settings, tFor(settings.locale));
    var sheetEl = holder.firstElementChild;
    document.body.append(overlay, sheetEl);
    sheetOpen = true;
  }

  function closeSheet() {
    if (!sheetOpen) return;
    var overlay = document.querySelector('[data-sheet-overlay]');
    if (overlay) overlay.remove();
    var sheet = document.querySelector('[data-settings-sheet]');
    if (sheet) sheet.remove();
    sheetOpen = false;
  }

  // ---------- 事件委托 ----------
  document.addEventListener('click', function (e) {
    var target = e.target;

    // 登出(顶栏按钮 / 侧边栏用户菜单)
    if (target.closest && target.closest('[data-signout]')) {
      closeSheet();
      App.auth.logout();
      return;
    }
    // 导航链接
    var link = target.closest ? target.closest('a[data-link]') : null;
    if (link) {
      e.preventDefault();
      navigate(link.getAttribute('data-link') || '/');
      return;
    }
    // 主题切换
    var themeBtn = target.closest ? target.closest('[data-theme-btn]') : null;
    if (themeBtn) {
      setTheme(themeBtn.dataset.themeBtn);
      return;
    }
    // 语言切换
    var langBtn = target.closest ? target.closest('[data-lang]') : null;
    if (langBtn) {
      setLocale(langBtn.dataset.lang);
      return;
    }
    // 下拉
    var ddTrigger = target.closest ? target.closest('[data-dropdown-trigger]') : null;
    if (ddTrigger) {
      toggleDropdown(ddTrigger);
      return;
    }
    // 设置面板
    if (target.closest && target.closest('[data-sheet-trigger]')) {
      openSheet();
      return;
    }
    if (
      target.closest &&
      (target.closest('[data-sheet-close]') || target.closest('[data-sheet-overlay]'))
    ) {
      closeSheet();
      return;
    }
    // 侧边栏折叠 / 移动端(移动端抽屉在 app/core/interactions.js)
    var sidebarTrigger = target.closest ? target.closest('[data-sidebar-trigger]') : null;
    if (sidebarTrigger) {
      if (App.interactions.isMobile()) App.interactions.openMobileSidebar();
      else setSidebarOpen(!settings.sidebarOpen);
      return;
    }
    // 子菜单展开/收起(文档、设置等含 children 的父菜单)
    var submenuToggle = target.closest ? target.closest('[data-submenu-toggle]') : null;
    if (submenuToggle) {
      toggleSubmenu(submenuToggle.dataset.submenuToggle);
      return;
    }
    // 设置面板卡片
    var settingsCard = target.closest ? target.closest('[data-settings-card]') : null;
    if (settingsCard) {
      var parts = (settingsCard.dataset.settingsCard || ':').split(':');
      var kind = parts[0];
      var value = parts[1];
      if (kind === 'theme') setTheme(value);
      else if (kind === 'sidebar') setSidebarVariant(value);
      else if (kind === 'layout') setLayout(value);
      return;
    }
    // 基础色/强调色启用开关
    var themeToggle = target.closest ? target.closest('[data-theme-toggle]') : null;
    if (themeToggle) {
      var tk = themeToggle.getAttribute('data-theme-toggle');
      if (tk === 'base') setAppearance({ useBase: settings.appearance.useBase === false });
      else if (tk === 'chart') setAppearance({ useAccent: settings.appearance.useAccent === false });
      return;
    }
    // 色板
    var swatch = target.closest ? target.closest('[data-swatch]') : null;
    if (swatch) {
      var val = swatch.dataset.value || '';
      if (swatch.dataset.swatch === 'base') setAppearance({ baseColor: val });
      else if (swatch.dataset.swatch === 'chart') setAppearance({ chartColor: val });
      return;
    }
    // 分段控件
    var segmented = target.closest ? target.closest('[data-segmented]') : null;
    if (segmented) {
      var v = segmented.dataset.value || '';
      switch (segmented.dataset.segmented) {
        case 'style':
          setAppearance({ style: v });
          break;
        case 'body-font':
          setAppearance({ bodyFont: v });
          break;
        case 'heading-font':
          setAppearance({ headingFont: v });
          break;
        case 'radius':
          setAppearance({ radius: v });
          break;
        case 'menu-color':
          setAppearance({ menuColor: v });
          break;
        case 'menu-appearance':
          setAppearance({ menuAppearance: v });
          break;
      }
      return;
    }
    if (target.closest && target.closest('[data-reset-settings]')) {
      resetSettings();
      return;
    }
    // 仅重置外观(设置页 外观 → 重置外观,不清语言/宽度)
    if (target.closest && target.closest('[data-reset-appearance]')) {
      resetAppearance();
      return;
    }
    // 显示页:切换侧边栏菜单项可见性(设置项锁定,不可切换)
    var navToggle = target.closest ? target.closest('[data-nav-toggle]') : null;
    if (navToggle) {
      var navId = navToggle.dataset.navToggle;
      if (navId && navId !== 'settings') {
        var hidden = settings.hiddenNav.slice();
        var idx = hidden.indexOf(navId);
        if (idx === -1) hidden.push(navId);
        else hidden.splice(idx, 1);
        updateSettings({ hiddenNav: hidden });
      }
      return;
    }
    // 点击外部关闭下拉
    if (!target.closest || !target.closest('[data-dropdown]')) closeDropdowns();
  });

  function syncHeaderThemeButtons() {
    app.querySelectorAll('[data-theme-btn]').forEach(function (btn) {
      var pressed = btn.dataset.themeBtn === settings.theme;
      btn.setAttribute('aria-pressed', String(pressed));
      btn.classList.toggle('is-checked', pressed); // 胶囊式 radio group:选中项反白填充
    });
  }

  /** 个人资料变化时原位更新侧边栏用户菜单(头像/用户名/邮箱),避免整树重建 */
  function syncUserMenu() {
    var profile = settings.profile || {};
    var avatarHtml = App.ui.avatarHtml(profile, 'size-8');
    var name = profile.username || 'Admin';
    var email = profile.email || 'admin@example.com';
    app.querySelectorAll('[data-user-avatar]').forEach(function (el) {
      el.innerHTML = avatarHtml;
    });
    app.querySelectorAll('[data-user-name]').forEach(function (el) {
      el.textContent = name;
    });
    app.querySelectorAll('[data-user-email]').forEach(function (el) {
      el.textContent = email;
    });
  }

  // ---------- 启动 ----------
  /** 鉴权门禁:未登录渲染登录页,登录成功后由 auth.js 再次调用 start() */
  function start() {
    if (App.auth && !App.auth.isAuthed()) {
      App.auth.renderLogin();
      return;
    }
    document.documentElement.lang = settings.locale;
    renderApp();
    syncSettingsFromServer();
  }

  window.App = window.App || {};
  App.registerModule = registerModule;
  App.defineModule = defineModule;
  App.resolveRoute = resolveRoute;
  App.buildNavItems = buildNavItems;
  App.buildAllNavItems = buildAllNavItems;
  App.currentPath = currentPath;
  App.updateSettings = updateSettings; // 设置表单字段/模块改动统一入口(自动持久化 + 同步数据库)
  App.applySettingValue = applySettingValue; // 自定义控件(下拉/日历等)写设置字段统一入口
  App.setSidebarWidth = setSidebarWidth; // 拖拽调宽收尾持久化(interactions.js 使用)
  App.getShellContext = function () {
    // 移动端抽屉构建侧边栏所需上下文(interactions.js 使用)
    return {
      settings: settings,
      navItems: buildNavItems(settings.locale),
      pathname: currentPath(),
      openSubmenus: openSubmenus,
    };
  };
  App.start = start;
  App.switchWorkspace = switchWorkspace;
  App.saveWorkspace = saveWorkspace;
  App.deleteWorkspace = deleteWorkspace;
  App.switchProfile = switchProfile;
  App.saveProfile = saveProfile;
  App.deleteProfile = deleteProfile;
})();
