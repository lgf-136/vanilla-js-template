/* hub-events.js — 事件委托分发（data-hub-* 全量交互入口）（C5 拆分） */
import { closeDropdowns, renderFull, rerenderList } from './hub-view.js';
import { deleteCustomRoute, setDefaultApiKey, setDefaultAuth, toggleFav, togglePin, toggleRouteGroup, toggleRoutePublic, toggleRouteTag } from './hub-actions.js';
import { jsonTree, prettyJson, rerunHistory, runRequest, selectRoute } from './hub-builder.js';
import { authDialog, closeDialog, confirmDialog, copyLink, copyText, routeFormDialog } from './hub-dialogs.js';
import { closeRouteCtxPopup, routeCtxPopup } from './hub-filters.js';
import { closeTagPopover, ensureGroupTree, ensureTagTree, openTagPopover, toggleGroupPublic } from './hub-groups-tags.js';
import { findRoute, hasBody, load, persist, state, t, view } from './hub-store.js';

'use strict';

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;

    // 路由右键菜单项(⋯ 按钮/右键浮层共用)
    var ctxItem = target.closest('[data-hub-ctx]');
    if (ctxItem) {
      var cAct = ctxItem.getAttribute('data-hub-ctx');
      var cKey = ctxItem.getAttribute('data-key');
      var cId = ctxItem.getAttribute('data-id');
      closeRouteCtxPopup();
      if (cAct === 'run') {
        selectRoute(cKey);
        runRequest();
      } else if (cAct === 'fav') toggleFav(cKey);
      else if (cAct === 'pin') togglePin(cKey);
      else if (cAct === 'auth') authDialog(cKey);
      else if (cAct === 'copylink') copyLink(cKey);
      else if (cAct === 'copypath') {
        var cr = findRoute(cKey);
        if (cr) copyText(cr.path, t('apihub.copied'));
      }
      else if (cAct === 'editroute') routeFormDialog(cKey);
      else if (cAct === 'delroute') {
        confirmDialog(
          t('apihub.deleteConfirm'),
          t('apihub.deleteRouteMsg'),
          t('apihub.delete'),
          function () {
            deleteCustomRoute(cKey.slice(3));
          },
          true
        );
      } else if (cAct === 'setgroup') toggleRouteGroup(cKey, cId);
      else if (cAct === 'settag') toggleRouteTag(cKey, cId);
      return;
    }
    // 点击路由右键菜单外部 → 收起
    // 点击标签 Popover 外部(书签按钮除外)→ 收起;点「完成」也收起
    if (!target.closest('[data-hub-tagpop]') && !target.closest('[data-hub-act="addtag"]') && !target.closest('[data-tp-pop]')) closeTagPopover();
    if (target.closest('[data-tp-done]')) closeTagPopover();

    // 弹窗关闭
    if (target.closest('[data-hub-dlg-close]')) {
      closeDialog();
      return;
    }

    // 下拉触发器:交给核心层打开,不触发重渲染
    if (target.closest('[data-dropdown-trigger]')) return;

    // 公开开关(路由 / 分组)—— 须在树节点筛选之前处理(开关位于树行内)
    var sw = target.closest('[data-hub-toggle]');
    if (sw) {
      var kind = sw.getAttribute('data-hub-toggle');
      if (kind === 'routepub') toggleRoutePublic(sw.getAttribute('data-key'));
      else if (kind === 'grouppub') toggleGroupPublic(sw.getAttribute('data-id'));
      return;
    }

    // 标签胶囊移除
    var tagpill = target.closest('[data-hub-tagpill]');
    if (tagpill) {
      toggleRouteTag(tagpill.getAttribute('data-hub-tagpill'), tagpill.getAttribute('data-id'));
      return;
    }

    // 分组/标签成员选择(下拉项)
    var sg = target.closest('[data-hub-setgroup]');
    if (sg) {
      toggleRouteGroup(sg.getAttribute('data-hub-setgroup'), sg.getAttribute('data-id'));
      return;
    }

    // 默认鉴权下拉项
    var ao = target.closest('[data-hub-authopt]');
    if (ao) {
      closeDropdowns();
      setDefaultAuth(ao.getAttribute('data-mode'));
      return;
    }

    // 模块筛选下拉
    var md = target.closest('[data-hub-module]');
    if (md) {
      view.moduleFilter = md.getAttribute('data-hub-module') || '';
      closeDropdowns();
      renderFull();
      return;
    }

    // 通用动作(按钮)
    var actBtn = target.closest('[data-hub-act]');
    if (actBtn) {
      var a = actBtn.getAttribute('data-hub-act');
      var key = actBtn.getAttribute('data-key');
      closeDropdowns(); // 动作触发后收起所有下拉
      switch (a) {
        case 'run':
          selectRoute(key);
          runRequest();
          break;
        case 'fav':
          toggleFav(key);
          break;
        case 'pin':
          togglePin(key);
          break;
        case 'auth':
          authDialog(key);
          break;
        case 'copylink':
          copyLink(key);
          break;
        case 'editroute':
          routeFormDialog(key);
          break;
        case 'delroute':
          confirmDialog(
            t('apihub.deleteConfirm'),
            t('apihub.deleteRouteMsg'),
            t('apihub.delete'),
            function () {
              deleteCustomRoute(key.slice(3));
            },
            true
          );
          break;
        case 'newgroup':
          ensureGroupTree().createDialog('');
          break;
        case 'gt-expandall':
          ensureGroupTree().expandAll();
          renderFull();
          break;
        case 'gt-collapseall':
          ensureGroupTree().collapseAll();
          renderFull();
          break;
        case 'more':
          routeCtxPopup(key, actBtn);
          break;
        case 'addtag':
          if (document.querySelector('[data-hub-tagpop]')) closeTagPopover();
          else openTagPopover(key, actBtn);
          break;
        case 'newtag':
          ensureTagTree().openCreateDialog(actBtn);
          break;
        case 'newroute':
          routeFormDialog(null);
          break;
        case 'refresh':
          view.history = [];
          view.run = null;
          state.loaded = false;
          state.error = null;
          renderFull();
          load();
          break;
        case 'filfav':
          view.favOnly = !view.favOnly;
          renderFull();
          break;
        case 'filpub':
          view.pubOnly = !view.pubOnly;
          renderFull();
          break;
        case 'filcustom':
          view.customOnly = !view.customOnly;
          renderFull();
          break;
        case 'filall':
          view.favOnly = false;
          view.pubOnly = false;
          view.pinOnly = false;
          view.customOnly = false;
          renderFull();
          break;
        case 'filpin':
          view.pinOnly = !view.pinOnly;
          renderFull();
          break;
        case 'clrgroup':
          view.groupFilter = null;
          renderFull();
          break;
        case 'clrtag':
          view.tagFilter = null;
          renderFull();
          break;
        case 'send':
          runRequest();
          break;
        case 'copyres':
          if (view.run) {
            var txt = view.run.text;
            if (view.resView === 'pretty' && prettyJson(txt) !== null) txt = prettyJson(txt);
            copyText(txt);
          }
          break;
      }
      return;
    }

    // 请求方法选择
    var rm = target.closest('[data-hub-reqmethod]');
    if (rm) {
      view.req.method = rm.getAttribute('data-hub-reqmethod');
      if (!hasBody(view.req.method) && view.runTab === 'body') view.runTab = 'params';
      closeDropdowns();
      renderFull();
      return;
    }

    // 标签页切换
    var tab = target.closest('[data-hub-tab]');
    if (tab) {
      view.runTab = tab.getAttribute('data-hub-tab');
      renderFull();
      return;
    }

    // 响应视图切换
    var rv = target.closest('[data-hub-resview]');
    if (rv) {
      view.resView = rv.getAttribute('data-hub-resview');
      renderFull();
      return;
    }

    // JSON 树:全部展开/折叠(节点展开/折叠与复制由公共组件 json-tree 处理)
    var jx = target.closest('[data-jexpall]');
    if (jx) {
      var jm = jx.getAttribute('data-jexpall');
      if (jsonTree) {
        if (jm === 'all') jsonTree.expandAll();
        else jsonTree.collapseAll();
      }
      return;
    }

    // KV 行增删
    var kvdel = target.closest('[data-hub-kvdel]');
    if (kvdel) {
      var parts = kvdel.getAttribute('data-hub-kvdel').split(':');
      var list = parts[0] === 'params' ? view.req.params : view.req.headers;
      list.splice(parseInt(parts[1], 10), 1);
      renderFull();
      return;
    }
    var kvadd = target.closest('[data-hub-kvadd]');
    if (kvadd) {
      var which = kvadd.getAttribute('data-hub-kvadd');
      if (which === 'params') view.req.params.push({ k: '', v: '' });
      else view.req.headers.push({ k: '', v: '' });
      renderFull();
      return;
    }

    // 历史回放
    var replay = target.closest('[data-hub-replay]');
    if (replay) {
      var hts = replay.getAttribute('data-hub-replay');
      for (var i = 0; i < view.history.length; i++) {
        if (String(view.history[i].ts) === hts) {
          rerunHistory(view.history[i]);
          break;
        }
      }
      return;
    }

    // 路由行选中
    var row = target.closest('[data-hub-route]');
    if (row) {
      selectRoute(row.getAttribute('data-hub-route'));
      return;
    }
  });

  // 输入:搜索 / KV 行 / 请求路径/体 / 默认 API Key(实时更新,不重渲染以免抢焦点)
  document.addEventListener('input', function (e) {
    var target = e.target;
    if (!target || !target.getAttribute) return;

    if (target.hasAttribute('data-hub-search')) {
      view.search = target.value;
      rerenderList();
      return;
    }
    var kv = target.getAttribute('data-hub-kv');
    if (kv) {
      var parts = kv.split(':');
      var list = parts[0] === 'params' ? view.req.params : view.req.headers;
      var idx = parseInt(parts[1], 10);
      if (list[idx]) list[idx][parts[2]] = target.value;
      return;
    }
    if (target.hasAttribute('data-hub-reqpath')) {
      view.req.path = target.value;
      return;
    }
    if (target.hasAttribute('data-hub-reqbody')) {
      view.req.body = target.value;
      return;
    }
    if (target.hasAttribute('data-hub-default-apikey')) {
      setDefaultApiKey(target.value);
      return;
    }
  });

  // 日志设置变更(数字输入 / 复选框)
  document.addEventListener('change', function (e) {
    var target = e.target;
    if (!target || !target.getAttribute) return;
    if (!target.hasAttribute('data-hub-logset')) return;
    if (!state.config.logging) state.config.logging = {};
    var k = target.getAttribute('data-hub-logset');
    if (k === 'maxLogs' || k === 'retentionDays') {
      var v = parseInt(target.value, 10);
      if (!Number.isFinite(v)) return;
      state.config.logging[k] = v;
    } else {
      state.config.logging[k] = target.checked;
    }
    persist();
  });

  // 回车键:请求路径框 → 发送
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeRouteCtxPopup();
      closeTagPopover();
      return;
    }
    if (e.key !== 'Enter') return;
    var target = e.target;
    if (target && target.hasAttribute && target.hasAttribute('data-hub-reqpath')) {
      e.preventDefault();
      runRequest();
    }
  });

  // 路由行右键 → 上下文菜单(与 ⋯ 按钮共用)
  document.addEventListener('contextmenu', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var row = target.closest('[data-hub-route]');
    if (!row) return;
    e.preventDefault();
    routeCtxPopup(row.getAttribute('data-hub-route'), null, e.clientX, e.clientY);
  });
