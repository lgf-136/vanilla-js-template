/* ============================================================
 * model.js — 分组树·树数据纯逻辑 + 实例注册表（自 index.js 拆出）
 * ------------------------------------------------------------
 * 职责：
 *   - 树数据纯逻辑（无 DOM，Node 可测）：findNode / descendants /
 *     isDescendant / treeChildren / resolveDrop / moveNode；
 *   - INSTANCES 单例注册表（全组件唯一一份）与 instOf / nodeOf
 *     实例解析；SEQ 计数与 create() 工厂留在 index.js 装配层，
 *     避免本文件反向依赖 render/dialog 形成循环依赖。
 * 依赖方向：model ← render ← dialog/menu ← events ← index。
 * ============================================================ */
'use strict';

  /* ---------- 纯工具(可测试,无 DOM 依赖) ---------- */
  function findIndex(nodes, id) {
    for (var i = 0; i < nodes.length; i++) if (nodes[i].id === id) return i;
    return -1;
  }
  function findNode(nodes, id) {
    var i = findIndex(nodes, id);
    return i === -1 ? null : nodes[i];
  }
  /** 节点自身 + 全部子孙 id */
  function descendants(nodes, id) {
    var out = [id];
    var changed = true;
    while (changed) {
      changed = false;
      nodes.forEach(function (n) {
        if (out.indexOf(n.id) === -1 && out.indexOf(n.parentId) !== -1) {
          out.push(n.id);
          changed = true;
        }
      });
    }
    return out;
  }
  /** id 是否位于 ancestorId 的子树内(含自身) */
  function isDescendant(nodes, ancestorId, id) {
    return descendants(nodes, ancestorId).indexOf(id) !== -1;
  }
  /** 某父级下的直接子节点(按 sort 后名称排序) */
  function treeChildren(nodes, parentId) {
    return nodes
      .filter(function (n) {
        return (n.parentId || '') === (parentId || '');
      })
      .sort(function (a, b) {
        return (a.sort || 0) - (b.sort || 0) || (a.name || '').localeCompare(b.name || '');
      });
  }
  /**
   * 解析拖放目标 → {parentId, index};无效(移入自身/子孙)返回 null。
   * targetId 为空表示拖到树底空区(追加到根);zone: before/after/inside。
   */
  function resolveDrop(nodes, dragId, targetId, zone) {
    if (dragId === targetId) return null;
    if (targetId && isDescendant(nodes, dragId, targetId)) return null;
    var t = targetId ? findNode(nodes, targetId) : null;
    var parentId = t ? (zone === 'inside' ? t.id : t.parentId || '') : '';
    var siblings = nodes.filter(function (n) {
      return (n.parentId || '') === parentId && n.id !== dragId;
    });
    var index;
    if (zone === 'inside' || !t) index = siblings.length;
    else {
      var ti = -1;
      for (var i = 0; i < siblings.length; i++) if (siblings[i].id === targetId) ti = i;
      index = ti === -1 ? siblings.length : zone === 'before' ? ti : ti + 1;
    }
    return { parentId: parentId, index: index };
  }
  /** 不可变移动:返回新数组(移动 + 重排目标父级 sort);无效返回 null */
  function moveNode(nodes, dragId, targetId, zone) {
    var idx = findIndex(nodes, dragId);
    if (idx === -1) return null;
    var drop = resolveDrop(nodes, dragId, targetId, zone);
    if (!drop) return null;
    var out = nodes.slice();
    var node = out.splice(idx, 1)[0];
    node = Object.assign({}, node, { parentId: drop.parentId });
    var sibIds = out.filter(function (n) {
      return (n.parentId || '') === drop.parentId;
    });
    var anchor = sibIds[drop.index] || null;
    var insertAt = anchor ? out.indexOf(anchor) : out.length;
    out.splice(insertAt, 0, node);
    // 按列表顺序重排目标父级的 sort
    var parentKey = drop.parentId || '';
    var n = 0;
    out.forEach(function (x) {
      if ((x.parentId || '') === parentKey) x.sort = n++;
    });
    return out;
  }

  /* ---------- 实例注册表（单例唯一份；create() 工厂见 index.js） ---------- */
  var INSTANCES = {};

  function instOf(el) {
    var root = el && el.closest ? el.closest('[data-gt-tree]') : null;
    if (!root) return null;
    return INSTANCES[root.getAttribute('data-gt-tree')] || null;
  }
  function nodeOf(inst, id) {
    return findNode(inst.nodes(), id);
  }

export {
  findNode,
  descendants,
  isDescendant,
  treeChildren,
  resolveDrop,
  moveNode,
  INSTANCES,
  instOf,
  nodeOf,
};
