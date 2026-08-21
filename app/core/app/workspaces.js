/* ============================================================
 * app/core/app/workspaces.js — 工作空间域（切换/新增/编辑/删除）
 * ------------------------------------------------------------
 * 切换协议(防串库):旧数据立即落库(flushSettingsSync,跳过防抖) →
 * 重置工作空间字段为默认(保留注册表/当前指针/本地语言) → 只写全局
 * 注册表与当前指针(pushGlobalSettingsToServer,不携带空间数据) →
 * 后台加载目标工作空间数据并渲染(loadWorkspaceSettings,空空间回退默认)。
 *   - switchWorkspace / saveWorkspace / deleteWorkspace:对外动作
 *     (App.switchWorkspace / App.saveWorkspace / App.deleteWorkspace)
 *   - purgeWorkspaceData:删除前后台清理该空间在 app_settings 的数据行
 * 依赖方向：state ← server-sync ← render/shell-ui ← 本文件。
 * ============================================================ */
'use strict';

import { settings, setSettings } from './state.js';
import {
  flushSettingsSync,
  mergeServerSettings,
  pushGlobalSettingsToServer,
} from './server-sync.js';
import { renderApp } from './render.js';
import { refreshSidebar } from './shell-ui.js';

/** 重置工作空间字段为默认,保留注册表 / 当前指针 / 本地语言 */
function applyWorkspaceSwitch(registry, id) {
  var locale = settings.locale;
  var fresh = App.settings.resetAllSettings();
  fresh.workspaces = registry;
  fresh.activeWorkspace = id;
  fresh.locale = locale;
  setSettings(fresh);
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
      if (merged) setSettings(merged);
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
export function switchWorkspace(id) {
  if (!id || id === settings.activeWorkspace) return;
  flushSettingsSync();
  applyWorkspaceSwitch(settings.workspaces, id);
  pushGlobalSettingsToServer();
  loadWorkspaceSettings(id);
}

/** 新增 / 编辑工作空间。isEdit=false 时切入新空间;true 时仅更新注册表(标识不变)。 */
export function saveWorkspace(ws, isEdit) {
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
    setSettings(Object.assign({}, settings, { workspaces: list }));
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
export function deleteWorkspace(id) {
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
  setSettings(Object.assign({}, settings, { workspaces: list }));
  App.settings.persistSettings(settings);
  pushGlobalSettingsToServer();
  refreshSidebar();
}
