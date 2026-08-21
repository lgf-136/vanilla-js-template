/* ============================================================
 * store.js — data-table 实例注册表 + 数据管道纯逻辑（自 index.js 拆出，红线 12）
 * ------------------------------------------------------------
 * 职责：实例表 instances 与一次性事件绑定标记（eventsBound）；
 *      数据源读取（rawRows）、过滤+排序+分页管道、选中行派生。
 * 无 DOM / 无渲染依赖；渲染见 toolbar/parts/render，委托见 events.js，
 * 对外挂载 App.ui.dataTable 由 index.js 负责（对外面不变）。
 * ============================================================ */
'use strict';

/* ---------- 实例表与一次性事件标记 ---------- */
export var instances = {};
var eventsBound = false;

/** 首个实例创建时执行一次 bind（全局委托只绑一次；语义与拆分前一致） */
export function ensureEventsOnce(bind) {
  if (!eventsBound) {
    bind();
    eventsBound = true;
  }
}

  function rawRows(inst) {
    var d = inst.opts.data;
    return typeof d === 'function' ? d() : d || [];
  }

  /* ---------- 数据管道:过滤 + 排序 + 分页 ---------- */
  export function filteredRows(inst) {
    var opts = inst.opts;
    var rows = rawRows(inst);
    var q = inst.state.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(function (r) {
        if (opts.search) return opts.search(r, q);
        var keys = opts.searchKeys || [];
        for (var i = 0; i < keys.length; i++) {
          var v = r[keys[i]];
          if (String(v == null ? '' : v).toLowerCase().indexOf(q) !== -1) return true;
        }
        return false;
      });
    }
    (opts.filters || []).forEach(function (f) {
      var sel = inst.state.filterSel[f.key] || [];
      if (!sel.length) return;
      var get = f.getValue || function (r) {
        return r[f.key];
      };
      rows = rows.filter(function (r) {
        return sel.indexOf(get(r)) !== -1;
      });
    });
    if (inst.state.sort.key) {
      var key = inst.state.sort.key;
      var dir = inst.state.sort.dir === 'desc' ? -1 : 1;
      rows = rows.slice().sort(function (a, b) {
        var av = String(a[key] == null ? '' : a[key]).toLowerCase();
        var bv = String(b[key] == null ? '' : b[key]).toLowerCase();
        return av < bv ? -dir : av > bv ? dir : 0;
      });
    }
    return rows;
  }
  export function pageCount(inst) {
    return Math.max(1, Math.ceil(filteredRows(inst).length / inst.state.pageSize));
  }
  export function pageRows(inst) {
    var rows = filteredRows(inst);
    var start = (inst.state.page - 1) * inst.state.pageSize;
    return rows.slice(start, start + inst.state.pageSize);
  }
  export function selectedRows(inst) {
    var key = inst.opts.rowKey || 'id';
    return rawRows(inst).filter(function (r) {
      return !!inst.state.selection[r[key]];
    });
  }
  export function selectedCount(inst) {
    return selectedRows(inst).length;
  }
