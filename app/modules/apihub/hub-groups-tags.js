/* hub-groups-tags.js — 分组/标签业务域：CRUD 动作 + 公共树组件接线 + 标签 Popover */
import { renderFull, rerenderList, rerenderSideFilters } from './hub-view.js';
import { toggleRouteTag } from './hub-actions.js';
import { descendants, escAttr, findRoute, groupById, icon, memberships, persist, routeKeyOf, state, t, tagById, treeCount, uid, view } from './hub-store.js';

'use strict';

  function addGroup(name, parentId) {
    var g = state.config.groups;
    g.push({ id: uid('g'), name: name, parentId: parentId || '', public: false, sort: g.length });
    persist();
    renderFull();
  }
  function renameGroup(id, name) {
    var g = groupById(id);
    if (g) {
      g.name = name;
      persist();
      renderFull();
    }
  }
  function deleteGroup(id) {
    var g = state.config.groups;
    var removeIds = descendants(g, id);
    state.config.groups = g.filter(function (x) {
      return removeIds.indexOf(x.id) === -1;
    });
    [state.config.routes, state.config.customRoutes].forEach(function (coll) {
      if (!coll) return;
      if (Array.isArray(coll)) {
        coll.forEach(function (c) {
          c.groupIds = (c.groupIds || []).filter(function (gid) {
            return removeIds.indexOf(gid) === -1;
          });
        });
      } else {
        Object.keys(coll).forEach(function (key) {
          coll[key].groupIds = (coll[key].groupIds || []).filter(function (gid) {
            return removeIds.indexOf(gid) === -1;
          });
        });
      }
    });
    if (view.groupFilter && removeIds.indexOf(view.groupFilter) !== -1) view.groupFilter = null;
    persist();
    renderFull();
  }
  function toggleGroupPublic(id) {
    var g = groupById(id);
    if (!g) return;
    var on = !g.public;
    g.public = on;
    if (on) {
      // 父级公开 → 全部子孙组强制公开(与 server 端级联一致)
      descendants(state.config.groups, id).forEach(function (did) {
        var d = groupById(did);
        if (d) d.public = true;
      });
    }
    persist();
    renderFull();
  }
  /** 拖拽/移动到目标分组(zone: before/after/inside;targetId 空 → 根) */
  function moveGroup(id, targetId, zone) {
    var list = state.config.groups || [];
    var g = groupById(id);
    if (!g) return;
    var t = targetId ? groupById(targetId) : null;
    if (t && descendants(list, id).indexOf(t.id) !== -1) {
      App.ui.toast(t('apihub.noDrop'), 'error');
      return;
    }
    var next = App.ui.groupTree.moveNode(list, id, targetId, zone);
    if (!next) return; // 无效目标
    state.config.groups = next;
    persist();
    renderFull();
  }
  function setGroupIcon(id, icon) {
    var g = groupById(id);
    if (!g) return;
    g.icon = icon || '';
    persist();
    renderFull();
  }
  function setGroupColor(id, color) {
    var g = groupById(id);
    if (!g) return;
    g.color = color || '';
    persist();
    renderFull();
  }
  /** 标签:扁平彩色标签(id/name/color),新增/重命名/改色/删除 */
  /** 重绘打开的标签 Popover(创建/重命名/删除/改色后保持勾选与列表最新) */
  function refreshTagPopover() {
    var pop = document.querySelector('[data-hub-tagpop]');
    if (!pop) return;
    var key = pop.getAttribute('data-hub-tagpop');
    var r = findRoute(key);
    if (!r) return;
    ensureTagTree().setPickerSearch('');
    pop.innerHTML = ensureTagTree().pickerHtml(memberships(key, r).tagIds || []);
  }
  function addTag(name, color) {
    var tags = state.config.tags;
    tags.push({ id: uid('t'), name: name, color: color || '', sort: tags.length });
    persist();
    renderFull();
    refreshTagPopover();
  }
  function renameTag(id, name, color) {
    var tg = tagById(id);
    if (tg) {
      tg.name = name;
      if (arguments.length > 2) tg.color = color || '';
      persist();
      renderFull();
      refreshTagPopover();
    }
  }
  function deleteTag(id) {
    var tags = state.config.tags;
    state.config.tags = tags.filter(function (x) {
      return x.id !== id;
    });
    [state.config.routes, state.config.customRoutes].forEach(function (coll) {
      if (!coll) return;
      if (Array.isArray(coll)) {
        coll.forEach(function (c) {
          c.tagIds = (c.tagIds || []).filter(function (tid) {
            return tid !== id;
          });
        });
      } else {
        Object.keys(coll).forEach(function (key) {
          coll[key].tagIds = (coll[key].tagIds || []).filter(function (tid) {
            return tid !== id;
          });
        });
      }
    });
    if (view.tagFilter === id) view.tagFilter = null;
    persist();
    renderFull();
    refreshTagPopover();
  }
  function setTagColor(id, color) {
    var tg = tagById(id);
    if (tg) {
      tg.color = color || '';
      persist();
      renderFull();
      refreshTagPopover();
    }
  }
  /** 公共分组树组件(懒创建,展开/过滤等内部状态常驻) */
  var groupTree = null;
  function ensureGroupTree() {
    if (groupTree) return groupTree;
    groupTree = App.ui.groupTree.create({
      nodes: function () {
        return state.config.groups || [];
      },
      rootLabel: t('apihub.allGroups'),
      activeId: view.groupFilter || 'root',
      labels: {
        newGroup: t('apihub.newGroup'),
        newChild: t('apihub.newSubgroup'),
        newSibling: t('apihub.newSibling'),
        rename: t('apihub.rename'),
        moveTo: t('apihub.moveTo'),
        icon: t('apihub.icon'),
        color: t('apihub.color'),
        delete: t('apihub.delete'),
        deleteConfirm: t('apihub.deleteConfirm'),
        deleteMsg: t('apihub.deleteGroupMsg'),
        rootGroup: t('apihub.rootGroup'),
        search: t('apihub.searchGroups'),
        clear: t('apihub.clearSearch'),
        empty: t('apihub.noGroups'),
        noMatch: t('apihub.noGroupsMatch'),
        name: t('apihub.name'),
        namePlaceholder: t('apihub.groupNamePlaceholder'),
        nameRequired: t('apihub.nameRequired'),
        parentGroup: t('apihub.parentGroup'),
        chooseParent: t('apihub.chooseParent'),
        iconSearch: t('apihub.iconSearch'),
        emoji: t('apihub.emoji'),
        emojiInput: t('apihub.emojiInput'),
        clearIcon: t('apihub.clearIcon'),
        clearColor: t('apihub.clearColor'),
        apply: t('apihub.save'),
        cancel: t('apihub.cancel'),
        save: t('apihub.save'),
        copied: t('apihub.copied'),
        menu: t('apihub.menu'),
        renameHint: t('apihub.renameHint'),
        expand: t('apihub.expand'),
        collapse: t('apihub.collapse'),
        close: t('apihub.close'),
        copyTip: t('apihub.copyTip'),
        pickerHint: t('apihub.pickerHint'),
      },
      count: function (node) {
        return treeCount('group', node.id);
      },
      rowExtra: function (node) {
        return (
          '<button type="button" class="hub-switch' +
          (node.public ? ' is-on' : '') +
          '" data-hub-toggle="grouppub" data-id="' +
          escAttr(node.id) +
          '" data-tip="' +
          escAttr(t('apihub.publicHint')) +
          '" aria-label="' +
          escAttr(t('apihub.publicHint')) +
          '"><span class="hub-switch-thumb"></span></button>'
        );
      },
      onSelect: function (id) {
        view.groupFilter = id || null;
        rerenderList();
        rerenderSideFilters();
      },
      onCreate: function (parentId, name) {
        addGroup(name, parentId);
      },
      onRename: function (id, name) {
        renameGroup(id, name);
      },
      onDelete: function (id) {
        deleteGroup(id);
      },
      onMove: function (id, targetId, zone) {
        moveGroup(id, targetId, zone);
      },
      onIconChange: function (id, iconName) {
        setGroupIcon(id, iconName);
      },
      onColorChange: function (id, color) {
        setGroupColor(id, color);
      },
      onRender: function () {
        rerenderSideFilters();
      },
    });
    return groupTree;
  }
  /** 公共标签组件(扁平彩色 # 标签 + Gmail 式多选下拉,懒创建) */
  var tagTree = null;
  function ensureTagTree() {
    if (tagTree) return tagTree;
    tagTree = App.ui.tagPicker.create({
      nodes: function () {
        return state.config.tags || [];
      },
      activeId: view.tagFilter || '',
      labels: {
        newTag: t('apihub.newTag'),
        rename: t('apihub.rename'),
        color: t('apihub.color'),
        delete: t('apihub.delete'),
        deleteConfirm: t('apihub.deleteConfirm'),
        deleteTagMsg: t('apihub.deleteTagMsg'),
        searchTags: t('apihub.searchTags'),
        clear: t('apihub.clearSearch'),
        empty: t('apihub.noTags'),
        noMatch: t('apihub.noTagsMatch'),
        name: t('apihub.name'),
        namePlaceholder: t('apihub.tagNamePlaceholder'),
        nameRequired: t('apihub.nameRequired'),
        nameExists: t('apihub.nameExists'),
        nameTooLong: t('apihub.nameTooLong'),
        allTags: t('apihub.allTags'),
        untagged: t('apihub.untagged'),
        allColors: t('apihub.allColors'),
        customColor: t('apihub.customColor'),
        createTag: t('apihub.createTag'),
        selected: t('apihub.selected'),
        noneSelected: t('apihub.noneSelected'),
        done: t('apihub.done'),
        menu: t('apihub.menu'),
        renameHint: t('apihub.renameHint'),
        cancel: t('apihub.cancel'),
        save: t('apihub.save'),
        copied: t('apihub.copied'),
        searchCreate: t('apihub.searchCreate'),
        copyTip: t('apihub.copyTip'),
        pickerHint: t('apihub.pickerHint'),
      },
      count: function (id) {
        if (id === null) {
          // 未标记:没有任何标签的路由数
          var n = 0;
          (state.routes || []).forEach(function (r) {
            var m = memberships(routeKeyOf(r), r);
            if (!(m.tagIds || []).length) n++;
          });
          return n;
        }
        return treeCount('tag', id);
      },
      onSelect: function (id) {
        view.tagFilter = id || null;
        rerenderList();
        rerenderSideFilters();
      },
      onCreate: function (name, color) {
        addTag(name, color);
      },
      onRename: function (id, name, color) {
        renameTag(id, name, color);
      },
      onDelete: function (id) {
        deleteTag(id);
      },
      onColorChange: function (id, color) {
        setTagColor(id, color);
      },
      onToggle: function (id) {
        // 从当前打开的标签 Popover 取目标路由,避免误改选中路由
        var pop = document.querySelector('[data-hub-tagpop]');
        var key = pop ? pop.getAttribute('data-hub-tagpop') : null;
        if (!key) return;
        toggleRouteTag(key, id);
        var r = findRoute(key);
        // 延迟到本次点击事件派发结束后再重绘,避免重绘摘除点击目标导致外部点击判断误关闭
        if (pop && r) {
          var k2 = key;
          var r2 = r;
          var p2 = pop;
          setTimeout(function () {
            if (p2 && p2.parentNode) p2.innerHTML = ensureTagTree().pickerHtml(memberships(k2, r2).tagIds || []);
          }, 0);
        }
      },
      onRender: function () {
        rerenderSideFilters();
      },
      onRenderMenu: function () {
        // 只重绘标签 Popover 内容,保持搜索焦点
        var pop = document.querySelector('[data-hub-tagpop]');
        if (!pop) return;
        var key = pop.getAttribute('data-hub-tagpop');
        var r = findRoute(key);
        if (!r) return;
        var m = memberships(key, r);
        pop.innerHTML = ensureTagTree().pickerHtml(m.tagIds || []);
        var inp = pop.querySelector('[data-tp-pick-search]');
        if (inp) {
          inp.focus();
          try {
            inp.setSelectionRange(inp.value.length, inp.value.length);
          } catch (e) {
            /* noop */
          }
        }
      },
    });
    return tagTree;
  }
  /* ---------- 标签 Popover(书签图标触发,Chrome 添加联系人风格) ---------- */
  function openTagPopover(key, anchorEl) {
    closeTagPopover();
    var r = findRoute(key);
    if (!r) return;
    var m = memberships(key, r);
    var pop = document.createElement('div');
    pop.className = 'hub-tagpop';
    pop.setAttribute('data-hub-tagpop', key);
    pop.innerHTML = ensureTagTree().pickerHtml(m.tagIds || []);
    document.body.appendChild(pop);
    var w = pop.offsetWidth || 256;
    var h = pop.offsetHeight || 320;
    var left, top;
    if (anchorEl && anchorEl.getBoundingClientRect) {
      var rect = anchorEl.getBoundingClientRect();
      left = rect.right - w;
      top = rect.bottom + 4;
      if (left < 8) left = 8;
      if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 4);
    } else {
      left = Math.max(8, (window.innerWidth - w) / 2);
      top = Math.max(8, (window.innerHeight - h) / 2);
    }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  function closeTagPopover() {
    var pop = document.querySelector('[data-hub-tagpop]');
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
  }

export { addGroup, addTag, closeTagPopover, deleteGroup, deleteTag, ensureGroupTree, ensureTagTree, groupTree, moveGroup, openTagPopover, refreshTagPopover, renameGroup, renameTag, setGroupColor, setGroupIcon, setTagColor, tagTree, toggleGroupPublic };
