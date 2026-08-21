/* ============================================================
 * app/core/app/profiles.js — 配置文件域（VSCode 风格）
 * ------------------------------------------------------------
 * 配置文件保存 外观/通知/显示 快照(profileCapture/profileApply):
 *   - switchProfile:先把当前设置存进当前激活配置的快照,再应用目标快照
 *   - saveProfile:新建(基于当前设置快照并激活)或重命名当前配置文件
 *   - deleteProfile:至少保留一个;删除激活配置时切换到剩余第一个
 * 对外动作挂载为 App.switchProfile / App.saveProfile / App.deleteProfile。
 * 依赖方向：state ← server-sync ← render ← 本文件。
 * ============================================================ */
'use strict';

import { settings, setSettings } from './state.js';
import { pushSettingsToServer } from './server-sync.js';
import { renderApp } from './render.js';

/** 切换配置文件:先把当前设置存进当前激活配置的快照,再应用目标快照 */
export function switchProfile(id) {
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
  setSettings(
    App.settings.profileApply(Object.assign({}, settings, { profiles: list }), target.snapshot)
  );
  settings.activeProfile = target.id;
  App.settings.applySettings(settings);
  App.settings.persistSettings(settings);
  pushSettingsToServer();
  renderApp();
}

/** 新建(基于当前设置快照并激活)或重命名当前配置文件;返回是否成功 */
export function saveProfile(name, isEdit) {
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
    setSettings(Object.assign({}, settings, { profiles: list }));
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
    setSettings(Object.assign({}, settings, { profiles: list, activeProfile: id }));
  }
  App.settings.applySettings(settings);
  App.settings.persistSettings(settings);
  pushSettingsToServer();
  renderApp();
  return true;
}

/** 删除配置文件:至少保留一个;删除激活配置时切换到剩余第一个 */
export function deleteProfile(id) {
  var list = (settings.profiles || []).filter(function (p) {
    return p.id !== id;
  });
  if (!list.length) return;
  var wasActive = settings.activeProfile === id;
  setSettings(
    Object.assign({}, settings, {
      profiles: list,
      activeProfile: wasActive ? list[0].id : settings.activeProfile,
    })
  );
  if (wasActive) {
    setSettings(App.settings.profileApply(settings, list[0].snapshot));
    settings.activeProfile = list[0].id;
  }
  App.settings.applySettings(settings);
  App.settings.persistSettings(settings);
  pushSettingsToServer();
  renderApp();
}
