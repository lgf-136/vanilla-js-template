/* ============================================================
 * app/core/app/nav.js — 侧边栏导航清单推导
 * ------------------------------------------------------------
 * 从模块注册表(modules)派生导航项:
 *   - buildAllNavItems:全部菜单项(按 meta.order 排序,不过滤隐藏项)
 *   - buildNavItems:过滤显示页隐藏的菜单项(支持父级 'id' 与
 *     子级 'parent:child',读 settings.hiddenNav)
 * 依赖方向：state ← registry（只指向更底层）。
 * ============================================================ */
'use strict';

import { settings } from './state.js';
import { modules } from './registry.js';

/** 构建全部侧边栏导航项(从模块注册表,不过滤隐藏项) */
export function buildAllNavItems(locale) {
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
export function buildNavItems(locale) {
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
