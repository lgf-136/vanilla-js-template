/* ============================================================
 * data-table.js — 通用数据表格(公共组件,受控组件铁律)
 * ------------------------------------------------------------
 * 用法:
 *   var table = App.ui.dataTable({
 *     id: 'tasks',                       // 实例唯一 id(事件路由 + 重渲染定位,必填)
 *     data: function () { return rows; },// 数据源:数组或返回数组的函数(每次渲染读取)
 *     rowKey: 'id',                      // 行唯一键字段
 *     searchPlaceholder: function (t) { return t('x.searchPlaceholder'); },
 *     searchKeys: ['title'],             // 缺省搜索字段;或提供 search(row, q) 自定义
 *     columns: [                         // 列定义(首列为选择框,末列为行操作,均自动)
 *       { key: 'id', label: function (t) { return t('x.col.id'); },
 *         sortable: false, hideable: false, cellClass: 'w-20 text-muted-foreground',
 *         render: function (row) { return row.id; } }
 *     ],
 *     filters: [                         // 分面过滤器(工具栏左侧,可在「过滤」菜单显隐)
 *       { key: 'status', label: function (t) { return t('x.filter.status'); },
 *         options: [{ value, label, icon }], getValue: function (row) { return row.status; } }
 *     ],
 *     pageSizeOptions: [10, 20, 30, 40, 50],
 *     bulk: {                            // 批量操作条(选中后浮现)
 *       groups: [{ action: 'status', label: function (t) { ... }, icon: 'x', options: [...] }],
 *       items:  [{ action: 'delete', label: function (t) { ... }, icon: 'trash-2', variant: 'destructive' }],
 *       onGroup: function (action, value, rows) { ... },   // 子菜单项点击(不清选择,由宿主决定)
 *       onItem:  function (action, rows) { ... },          // 图标按钮点击
 *     },
 *     rowActionsHtml: function (row, t) { return '...'; }, // 行尾操作菜单(可选)
 *     toolbarExtra: function (t) { return '...'; },        // 工具栏右侧附加内容(可选)
 *   });
 *   // 模块 render 内: return table.render(t);
 *   // 数据变更后: table.refresh(); 清空选择: table.clearSelection(); 读取选中: table.selected();
 * ------------------------------------------------------------
 * 特性:模糊搜索 / 分面过滤(可搜选项+计数) / 「过滤」显隐切换 / 列显隐 / 排序(默认|升|降|隐藏)
 *      行选择(全选/半选) / 批量操作条 / 分页(页码省略号)
 * 受控:全部视觉消费 tokens.css 变量(含注入样式,带 var(--token, fallback) 回退链路),
 *      不写死任何颜色;明暗两套主题与全部风格下行为一致。
 * i18n:通用文案走 core 词典 dataTable.*(宿主传入的 t 自动兜底到核心词典)。
 * ============================================================ */
(function () {
  'use strict';

  var instances = {};
  var eventsBound = false;

  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;
  function ic(name, cls) {
    return App.icon.iconSvg(name, { class: cls || '' });
  }
  /** 标签支持字符串或函数(t) */
  function text(v, t) {
    return typeof v === 'function' ? v(t) : v;
  }
  function rawRows(inst) {
    var d = inst.opts.data;
    return typeof d === 'function' ? d() : d || [];
  }

  /* ---------- 数据管道:过滤 + 排序 + 分页 ---------- */
  function filteredRows(inst) {
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
  function pageCount(inst) {
    return Math.max(1, Math.ceil(filteredRows(inst).length / inst.state.pageSize));
  }
  function pageRows(inst) {
    var rows = filteredRows(inst);
    var start = (inst.state.page - 1) * inst.state.pageSize;
    return rows.slice(start, start + inst.state.pageSize);
  }
  function selectedRows(inst) {
    var key = inst.opts.rowKey || 'id';
    return rawRows(inst).filter(function (r) {
      return !!inst.state.selection[r[key]];
    });
  }
  function selectedCount(inst) {
    return selectedRows(inst).length;
  }

  /* ---------- 页码省略号 ---------- */
  function pageNumbers(current, total) {
    var max = 5;
    var out = [];
    if (total <= max) {
      for (var i = 1; i <= total; i++) out.push(i);
    } else {
      out.push(1);
      if (current <= 3) {
        for (var j = 2; j <= 4; j++) out.push(j);
        out.push('...', total);
      } else if (current >= total - 2) {
        out.push('...');
        for (var k = total - 3; k <= total; k++) out.push(k);
      } else {
        out.push('...');
        for (var m = current - 1; m <= current + 1; m++) out.push(m);
        out.push('...', total);
      }
    }
    return out;
  }

  /* ---------- 渲染:复选框 ---------- */
  function checkboxHtml(checked, indeterminate, attrs) {
    return (
      '<span class="dt-check' +
      (checked || indeterminate ? ' is-checked' : '') +
      (indeterminate ? ' is-indeterminate' : '') +
      '" data-role="check">' +
      (indeterminate
        ? '<span class="dt-indeterminate"></span>'
        : ic('check', 'size-3')) +
      '</span>' +
      '<input type="checkbox" ' +
      attrs +
      (checked ? ' checked' : '') +
      ' class="dt-check-input" />'
    );
  }

  /* ---------- 渲染:表头排序菜单(默认 | 升序 | 降序 | 隐藏) ---------- */
  function sortBtnHtml(inst, t, col) {
    var s = inst.state.sort;
    var key = col.key;
    var arrow =
      s.key === key ? (s.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'chevrons-up-down';
    var opt = function (value, iconName, optLabel, active) {
      return (
        '<button type="button" data-dt-sort-opt="' +
        value +
        '" data-key="' +
        key +
        '" class="' +
        App.ui.dropdownItemClass() +
        '">' +
        ic(iconName, 'size-3.5 text-muted-foreground/70') +
        optLabel +
        (active ? ic('check', 'ms-auto size-4') : '') +
        '</button>'
      );
    };
    var noneActive = !(s.key === key);
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-slot="button" data-dt-sort="' +
      key +
      '" class="' +
      App.ui.buttonClass('ghost', 'sm', 'h-8 px-2 font-semibold!') +
      '">' +
      '<span>' +
      text(col.label, t) +
      '</span>' +
      ic(arrow, 'size-3.5') +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('min-w-44') +
      '">' +
      opt('default', 'rotate-ccw', t('dataTable.sortDefault'), noneActive) +
      opt('asc', 'arrow-up', t('dataTable.sortAsc'), s.key === key && s.dir === 'asc') +
      opt('desc', 'arrow-down', t('dataTable.sortDesc'), s.key === key && s.dir === 'desc') +
      App.ui.dropdownSeparator() +
      '<button type="button" data-dt-hide-col data-key="' +
      key +
      '" class="' +
      App.ui.dropdownItemClass() +
      '">' +
      ic('eye-off', 'size-3.5 text-muted-foreground/70') +
      t('dataTable.sortHide') +
      '</button>' +
      '</div></div>'
    );
  }

  /* ---------- 渲染:分面过滤器 ---------- */
  function filterListHtml(inst, t, key) {
    var f = null;
    (inst.opts.filters || []).forEach(function (x) {
      if (x.key === key) f = x;
    });
    if (!f) return '';
    var sel = inst.state.filterSel[key] || [];
    var q = (inst.state.filterSearch[key] || '').toLowerCase();
    var visible = (f.options || []).filter(function (o) {
      return String(o.label).toLowerCase().indexOf(q) !== -1;
    });
    var get = f.getValue || function (r) {
      return r[f.key];
    };
    var rows = filteredRows(inst);
    var html = visible
      .map(function (o) {
        var isSel = sel.indexOf(o.value) !== -1;
        var count = rows.filter(function (r) {
          return get(r) === o.value;
        }).length;
        return (
          '<button type="button" data-dt-filter-opt="' +
          key +
          '" data-value="' +
          esc(o.value) +
          '" class="' +
          App.ui.dropdownItemClass('') +
          '">' +
          '<span class="dt-check' +
          (isSel ? ' is-checked' : '') +
          '">' +
          ic('check', 'size-3') +
          '</span>' +
          (o.icon ? '<span class="text-muted-foreground">' + ic(o.icon, 'size-4') + '</span>' : '') +
          '<span>' +
          esc(o.label) +
          '</span>' +
          '<span class="ms-auto font-mono text-xs">' +
          count +
          '</span>' +
          '</button>'
        );
      })
      .join('');
    if (!html) html = '<div class="dt-filter-empty">' + t('dataTable.noFilterResults') + '</div>';
    return html;
  }

  function filterBtnHtml(inst, t, f) {
    var sel = inst.state.filterSel[f.key] || [];
    var optSearch = inst.state.filterSearch[f.key] || '';
    var title = text(f.label, t);
    var badges = '';
    if (sel.length) {
      badges =
        '<span class="mx-2 h-4 w-px bg-border"></span>' +
        sel
          .map(function (v) {
            var o = null;
            (f.options || []).forEach(function (x) {
              if (x.value === v) o = x;
            });
            return o
              ? '<span class="hidden rounded-sm bg-secondary px-1.5 text-xs font-normal text-secondary-foreground lg:inline-block">' +
                esc(o.label) +
                '</span>'
              : '';
          })
          .join('') +
        (sel.length > 2
          ? '<span class="rounded-sm bg-secondary px-1.5 text-xs font-normal text-secondary-foreground">' +
            sel.length +
            ' selected</span>'
          : '');
    }
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-slot="button" data-dt-filter="' +
      f.key +
      '" class="' +
      App.ui.buttonClass('outline', 'sm', 'h-8 border-dashed') +
      '">' +
      ic('circle-plus', 'size-4') +
      title +
      badges +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('w-56') +
      '">' +
      App.ui.searchInput.html({
        placeholder: title,
        value: optSearch,
        attrs: 'data-dt-filter-search="' + f.key + '"',
        class: 'dt-filter-search-wrap',
      }) +
      '<div class="dt-filter-list">' +
      filterListHtml(inst, t, f.key) +
      '</div>' +
      (sel.length
        ? App.ui.dropdownSeparator() +
          '<button type="button" data-dt-filter-clear="' +
          f.key +
          '" class="' +
          App.ui.dropdownItemClass('justify-center! text-center') +
          '">' +
          t('dataTable.clearFilters') +
          '</button>'
        : '') +
      '</div></div>'
    );
  }

  /* ---------- 渲染:列显隐(视图) ---------- */
  function viewBtnHtml(inst, t) {
    var cols = (inst.opts.columns || []).filter(function (c) {
      return c.hideable !== false;
    });
    if (!cols.length) return '';
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-dt-view data-slot="button" class="' +
      App.ui.buttonClass('outline', 'sm', 'h-8') +
      '">' +
      ic('sliders-horizontal', 'size-4') +
      t('dataTable.view') +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('w-48') +
      '">' +
      '<div class="' +
      App.ui.dropdownLabelClass('') +
      '">' +
      t('dataTable.toggleCols') +
      '</div>' +
      App.ui.dropdownSeparator() +
      cols
        .map(function (c) {
          var vis = inst.state.visibility[c.key] !== false;
          return (
            '<button type="button" data-dt-view-col="' +
            c.key +
            '" class="' +
            App.ui.dropdownItemClass('') +
            '">' +
            '<span class="dt-check' +
            (vis ? ' is-checked' : '') +
            '">' +
            ic('check', 'size-3') +
            '</span>' +
            '<span class="capitalize">' +
            esc(text(c.label, t)) +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  /* ---------- 渲染:过滤显隐切换(过滤) ---------- */
  function filterToggleBtnHtml(inst, t) {
    var filters = inst.opts.filters || [];
    if (!filters.length) return '';
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-dt-filter-toggle data-slot="button" class="' +
      App.ui.buttonClass('outline', 'sm', 'h-8') +
      '">' +
      ic('list-filter', 'size-4') +
      t('dataTable.filterToggle') +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('w-48') +
      '">' +
      '<div class="' +
      App.ui.dropdownLabelClass('') +
      '">' +
      t('dataTable.toggleFilters') +
      '</div>' +
      App.ui.dropdownSeparator() +
      filters
        .map(function (f) {
          var vis = inst.state.filterVisibility[f.key] !== false;
          return (
            '<button type="button" data-dt-filter-toggle-opt="' +
            f.key +
            '" class="' +
            App.ui.dropdownItemClass('') +
            '">' +
            '<span class="dt-check' +
            (vis ? ' is-checked' : '') +
            '">' +
            ic('check', 'size-3') +
            '</span>' +
            '<span class="capitalize">' +
            esc(text(f.label, t)) +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  /* ---------- 渲染:工具栏 ---------- */
  function toolbarHtml(inst, t) {
    var opts = inst.opts;
    var isFiltered =
      inst.state.search !== '' ||
      (opts.filters || []).some(function (f) {
        return (inst.state.filterSel[f.key] || []).length;
      });
    return (
      '<div class="flex items-center justify-between">' +
      '<div class="flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2">' +
      '<div class="dt-search-wrap">' +
      App.ui.searchInput.html({
        placeholder: opts.searchPlaceholder ? text(opts.searchPlaceholder, t) : '',
        value: inst.state.search,
        attrs: 'data-dt-search',
        clearLabel: opts.searchPlaceholder ? text(opts.searchPlaceholder, t) : '',
      }) +
      '</div>' +
      '<div class="flex gap-x-2">' +
      (opts.filters || [])
        .map(function (f) {
          return inst.state.filterVisibility[f.key] !== false ? filterBtnHtml(inst, t, f) : '';
        })
        .join('') +
      '</div>' +
      (isFiltered
        ? '<button type="button" data-dt-reset data-slot="button" class="' +
          App.ui.buttonClass('ghost', 'sm', 'h-8 px-2 lg:px-3') +
          '">' +
          t('dataTable.reset') +
          ic('x', 'ms-2 size-4') +
          '</button>'
        : '') +
      '</div>' +
      '<div class="ms-auto hidden items-center gap-2 lg:flex">' +
      viewBtnHtml(inst, t) +
      filterToggleBtnHtml(inst, t) +
      (opts.toolbarExtra ? text(opts.toolbarExtra, t) : '') +
      '</div>' +
      '</div>'
    );
  }

  /* ---------- 渲染:表格 ---------- */
  function tableHtml(inst, t) {
    var opts = inst.opts;
    var key = opts.rowKey || 'id';
    var rows = pageRows(inst);
    var visCols = (opts.columns || []).filter(function (c) {
      return inst.state.visibility[c.key] !== false;
    });
    var hasActions = typeof opts.rowActionsHtml === 'function';
    var allPageSelected =
      rows.length > 0 &&
      rows.every(function (r) {
        return inst.state.selection[r[key]];
      });
    var somePageSelected = rows.some(function (r) {
      return inst.state.selection[r[key]];
    });
    var colspan = 1 + visCols.length + (hasActions ? 1 : 0);

    var bodyHtml;
    if (!rows.length) {
      bodyHtml =
        '<tr><td colspan="' +
        colspan +
        '" class="h-24 text-center text-muted-foreground">' +
        t('dataTable.noResults') +
        '</td></tr>';
    } else {
      bodyHtml = rows
        .map(function (r) {
          var isSel = !!inst.state.selection[r[key]];
          return (
            '<tr class="dt-row' +
            (isSel ? ' is-selected' : '') +
            '" data-dt-row="' +
            esc(r[key]) +
            '">' +
            '<td class="dt-td w-12"><label class="dt-checkbox" data-dt-check="' +
            esc(r[key]) +
            '">' +
            checkboxHtml(isSel, false, 'data-dt-check="' + esc(r[key]) + '"') +
            '</label></td>' +
            visCols
              .map(function (c) {
                var content = c.render ? c.render(r, t) : esc(r[c.key]);
                return (
                  '<td class="dt-td' +
                  (c.cellClass ? ' ' + c.cellClass : '') +
                  '">' +
                  content +
                  '</td>'
                );
              })
              .join('') +
            (hasActions ? '<td class="dt-td">' + opts.rowActionsHtml(r, t) + '</td>' : '') +
            '</tr>'
          );
        })
        .join('');
    }

    return (
      '<div class="dt-table-wrap">' +
      '<table class="dt-table">' +
      '<thead><tr class="border-b">' +
      '<th class="dt-th w-12"><label class="dt-checkbox" data-dt-check-all>' +
      checkboxHtml(allPageSelected, !allPageSelected && somePageSelected, 'data-dt-check-all') +
      '</label></th>' +
      visCols
        .map(function (c) {
          var cls = 'dt-th' + (c.headerClass ? ' ' + c.headerClass : '');
          if (c.sortable === false) {
            return '<th class="' + cls + '">' + esc(text(c.label, t)) + '</th>';
          }
          return '<th class="' + cls + '">' + sortBtnHtml(inst, t, c) + '</th>';
        })
        .join('') +
      (hasActions ? '<th class="dt-th"></th>' : '') +
      '</tr></thead>' +
      '<tbody>' +
      bodyHtml +
      '</tbody>' +
      '</table></div>'
    );
  }

  /* ---------- 渲染:分页 ---------- */
  function paginationHtml(inst, t) {
    var current = inst.state.page;
    var total = pageCount(inst);
    var nums = pageNumbers(current, total);
    var btnBase =
      'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50';
    return (
      '<div class="dt-pagination">' +
      '<div class="flex items-center gap-2">' +
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-slot="button" class="' +
      App.ui.buttonClass('outline', 'sm', 'h-8 w-20') +
      '">' +
      '<span>' +
      inst.state.pageSize +
      '</span>' +
      ic('chevrons-up-down', 'size-3.5') +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('min-w-16') +
      '">' +
      (inst.opts.pageSizeOptions || [10, 20, 30, 40, 50])
        .map(function (n) {
          return (
            '<button type="button" data-dt-page-size="' +
            n +
            '" class="' +
            App.ui.dropdownItemClass() +
            '">' +
            n +
            '</button>'
          );
        })
        .join('') +
      '</div></div>' +
      '<p class="hidden text-sm font-medium sm:block">' +
      t('dataTable.rowsPerPage') +
      '</p>' +
      '</div>' +
      '<div class="flex items-center gap-1 sm:space-x-1">' +
      '<span class="hidden w-28 text-center text-sm font-medium sm:block">' +
      t('dataTable.pageOf', current + ' / ' + total) +
      '</span>' +
      '<button type="button" data-dt-page="first" class="' +
      btnBase +
      '" ' +
      (current === 1 ? 'disabled' : '') +
      ' aria-label="' +
      t('dataTable.firstPage') +
      '">' +
      ic('chevrons-left', 'size-4') +
      '</button>' +
      '<button type="button" data-dt-page="prev" class="' +
      btnBase +
      '" ' +
      (current === 1 ? 'disabled' : '') +
      ' aria-label="' +
      t('dataTable.prevPage') +
      '">' +
      ic('chevron-left', 'size-4') +
      '</button>' +
      nums
        .map(function (n) {
          if (n === '...') {
            return '<span class="px-1 text-sm text-muted-foreground">...</span>';
          }
          return (
            '<button type="button" data-dt-page="' +
            n +
            '" class="' +
            btnBase +
            ' ' +
            (current === n
              ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80'
              : 'bg-background hover:bg-muted') +
            '" aria-label="' +
            t('dataTable.goToPage', n) +
            '">' +
            n +
            '</button>'
          );
        })
        .join('') +
      '<button type="button" data-dt-page="next" class="' +
      btnBase +
      '" ' +
      (current >= total ? 'disabled' : '') +
      ' aria-label="' +
      t('dataTable.nextPage') +
      '">' +
      ic('chevron-right', 'size-4') +
      '</button>' +
      '<button type="button" data-dt-page="last" class="' +
      btnBase +
      '" ' +
      (current >= total ? 'disabled' : '') +
      ' aria-label="' +
      t('dataTable.lastPage') +
      '">' +
      ic('chevrons-right', 'size-4') +
      '</button>' +
      '</div></div>'
    );
  }

  /* ---------- 渲染:批量操作浮动条 ---------- */
  function bulkBarHtml(inst, t) {
    var opts = inst.opts;
    var bulk = opts.bulk;
    var count = selectedCount(inst);
    if (!count) return '';
    var groups = (bulk && bulk.groups) || [];
    var items = (bulk && bulk.items) || [];
    return (
      '<div role="toolbar" class="dt-bulk-bar">' +
      '<button type="button" data-dt-clear-selection data-slot="button" class="' +
      App.ui.buttonClass('outline', 'icon', 'size-6 rounded-full!') +
      '" aria-label="' +
      t('dataTable.clearSelection') +
      '" data-tip="' +
      t('dataTable.clearSelection') +
      '">' +
      ic('x', 'size-4') +
      '</button>' +
      '<span class="mx-1 h-5 w-px bg-border"></span>' +
      '<div class="flex items-center gap-1 text-sm">' +
      '<span class="rounded-lg bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">' +
      count +
      '</span>' +
      '<span class="hidden sm:inline">' +
      t(count > 1 ? 'dataTable.selectedMany' : 'dataTable.selectedOne', count) +
      '</span>' +
      '</div>' +
      '<span class="mx-1 h-5 w-px bg-border"></span>' +
      groups
        .map(function (g) {
          var gLabel = text(g.label, t);
          return (
            '<div class="relative" data-dropdown>' +
            '<button type="button" data-dropdown-trigger data-slot="button" class="' +
            App.ui.buttonClass('outline', 'icon', 'size-8 rounded-md!') +
            '" data-tip="' +
            esc(gLabel) +
            '" aria-label="' +
            esc(gLabel) +
            '">' +
            ic(g.icon, 'size-4') +
            '</button>' +
            '<div data-dropdown-menu class="' +
            App.ui.dropdownContentClass('min-w-40') +
            '">' +
            (g.options || [])
              .map(function (o) {
                return (
                  '<button type="button" data-dt-bulk-group="' +
                  g.action +
                  '" data-value="' +
                  esc(o.value) +
                  '" class="' +
                  App.ui.dropdownItemClass() +
                  '">' +
                  (o.icon
                    ? '<span class="text-muted-foreground">' + ic(o.icon, 'size-4') + '</span>'
                    : '') +
                  esc(o.label) +
                  '</button>'
                );
              })
              .join('') +
            '</div></div>'
          );
        })
        .join('') +
      items
        .map(function (it) {
          var itLabel = text(it.label, t);
          return (
            '<button type="button" data-dt-bulk-item="' +
            it.action +
            '" data-slot="button" class="' +
            App.ui.buttonClass(it.variant || 'outline', 'icon', 'size-8 rounded-md!') +
            '" data-tip="' +
            esc(itLabel) +
            '" aria-label="' +
            esc(itLabel) +
            '">' +
            ic(it.icon, 'size-4') +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  /* ---------- 渲染入口 ---------- */
  function render(inst, t) {
    return toolbarHtml(inst, t) + tableHtml(inst, t) + paginationHtml(inst, t) + bulkBarHtml(inst, t);
  }

  function rerender(inst) {
    var root = document.querySelector('[data-dt-id="' + inst.id + '"]');
    if (root && inst.t) root.innerHTML = render(inst, inst.t);
  }

  /* ---------- 事件委托(全局仅绑定一次) ---------- */
  function bindEvents() {
    document.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || !target.closest) return;
      var root = target.closest('[data-dt-id]');
      if (!root) return;
      var inst = instances[root.getAttribute('data-dt-id')];
      if (!inst) return;
      var s = inst.state;
      var key;

      // 排序
      var sortOpt = target.closest('[data-dt-sort-opt]');
      if (sortOpt) {
        key = sortOpt.getAttribute('data-key');
        var dir = sortOpt.getAttribute('data-dt-sort-opt');
        s.sort = dir === 'default' ? { key: '', dir: '' } : { key: key, dir: dir };
        s.page = 1;
        rerender(inst);
        return;
      }
      var hideCol = target.closest('[data-dt-hide-col]');
      if (hideCol) {
        s.visibility[hideCol.getAttribute('data-key')] = false;
        rerender(inst);
        return;
      }
      // 列显隐
      var viewCol = target.closest('[data-dt-view-col]');
      if (viewCol) {
        key = viewCol.getAttribute('data-dt-view-col');
        s.visibility[key] = s.visibility[key] === false;
        rerender(inst);
        return;
      }
      // 分面过滤
      var filterOpt = target.closest('[data-dt-filter-opt]');
      if (filterOpt) {
        var fk = filterOpt.getAttribute('data-dt-filter-opt');
        var fv = filterOpt.getAttribute('data-value');
        var arr = s.filterSel[fk] || (s.filterSel[fk] = []);
        var idx = arr.indexOf(fv);
        if (idx === -1) arr.push(fv);
        else arr.splice(idx, 1);
        s.page = 1;
        rerender(inst);
        return;
      }
      var filterClear = target.closest('[data-dt-filter-clear]');
      if (filterClear) {
        var ck = filterClear.getAttribute('data-dt-filter-clear');
        s.filterSel[ck] = [];
        s.filterSearch[ck] = '';
        s.page = 1;
        rerender(inst);
        return;
      }
      // 过滤显隐切换
      var filterToggleOpt = target.closest('[data-dt-filter-toggle-opt]');
      if (filterToggleOpt) {
        var fvk = filterToggleOpt.getAttribute('data-dt-filter-toggle-opt');
        s.filterVisibility[fvk] = s.filterVisibility[fvk] === false;
        rerender(inst);
        return;
      }
      // 重置
      var reset = target.closest('[data-dt-reset]');
      if (reset) {
        s.search = '';
        s.filterSel = {};
        s.filterSearch = {};
        s.page = 1;
        rerender(inst);
        return;
      }
      // 分页
      var pageBtn = target.closest('[data-dt-page]');
      if (pageBtn) {
        var cmd = pageBtn.getAttribute('data-dt-page');
        if (cmd === 'first') s.page = 1;
        else if (cmd === 'prev') s.page = s.page - 1;
        else if (cmd === 'next') s.page = s.page + 1;
        else if (cmd === 'last') s.page = pageCount(inst);
        else s.page = parseInt(cmd, 10);
        var total = pageCount(inst);
        s.page = Math.max(1, Math.min(total, s.page));
        rerender(inst);
        return;
      }
      var pageSize = target.closest('[data-dt-page-size]');
      if (pageSize) {
        s.pageSize = parseInt(pageSize.getAttribute('data-dt-page-size'), 10);
        s.page = 1;
        rerender(inst);
        return;
      }
      // 行选择(label 点击与浏览器转发的 input 合成 click 都会到达,
      // 以 input 原生 checked 为准同步,避免双切换;非 input 目标直接翻转)
      var rowCheck = target.closest('[data-dt-check]');
      if (rowCheck) {
        var cid = rowCheck.getAttribute('data-dt-check');
        if (cid) {
          if (target.tagName === 'INPUT') s.selection[cid] = !!target.checked;
          else s.selection[cid] = !s.selection[cid];
          rerender(inst);
        }
        return;
      }
      var checkAll = target.closest('[data-dt-check-all]');
      if (checkAll) {
        var rows = pageRows(inst);
        var rkKey = inst.opts.rowKey || 'id';
        var selectAll = target.tagName === 'INPUT' ? target.checked : !(rows.length > 0 && rows.every(function (r) {
          return s.selection[r[rkKey]];
        }));
        rows.forEach(function (r) {
          if (selectAll) s.selection[r[rkKey]] = true;
          else delete s.selection[r[rkKey]];
        });
        rerender(inst);
        return;
      }
      var clearSel = target.closest('[data-dt-clear-selection]');
      if (clearSel) {
        s.selection = {};
        rerender(inst);
        return;
      }
      // 批量操作(选择保持,由宿主回调决定是否清空)
      var bulkGroup = target.closest('[data-dt-bulk-group]');
      if (bulkGroup) {
        var action = bulkGroup.getAttribute('data-dt-bulk-group');
        var value = bulkGroup.getAttribute('data-value');
        if (inst.opts.bulk && inst.opts.bulk.onGroup) {
          inst.opts.bulk.onGroup(action, value, selectedRows(inst));
        }
        return;
      }
      var bulkItem = target.closest('[data-dt-bulk-item]');
      if (bulkItem) {
        var ia = bulkItem.getAttribute('data-dt-bulk-item');
        if (inst.opts.bulk && inst.opts.bulk.onItem) {
          inst.opts.bulk.onItem(ia, selectedRows(inst));
        }
        return;
      }
    });

    document.addEventListener('input', function (e) {
      var target = e.target;
      if (!target || !target.closest) return;
      var root = target.closest('[data-dt-id]');
      if (!root) return;
      var inst = instances[root.getAttribute('data-dt-id')];
      if (!inst) return;
      var s = inst.state;
      if (target.closest('[data-dt-search]')) {
        s.search = target.value;
        s.page = 1;
        rerender(inst);
        return;
      }
      if (target.closest('[data-dt-filter-search]')) {
        var fk = target.getAttribute('data-dt-filter-search');
        s.filterSearch[fk] = target.value;
        // 就地重绘过滤器列表(保持下拉打开)
        var menu = target.closest('[data-dropdown-menu]');
        var list = menu ? menu.querySelector('.dt-filter-list') : null;
        if (list && inst.t) list.innerHTML = filterListHtml(inst, inst.t, fk);
      }
    });
  }

  /* ---------- 样式注入(全部消费 tokens 变量,带回退链路) ---------- */
  function injectStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    if (document.querySelector('[data-data-table-style]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-data-table-style', '');
    style.textContent =
      /* 工具栏搜索宽度 */
      '.dt-search-wrap{width:9.375rem;flex:none}' +
      '@media (min-width:1024px){.dt-search-wrap{width:15.625rem}}' +
      /* 过滤下拉 */
      '.dt-filter-list{max-height:18rem;overflow-y:auto;padding:.25rem}' +
      '.dt-filter-search-wrap{margin:.25rem .5rem .5rem;min-width:0}' +
      '.dt-filter-empty{padding:1.5rem .5rem;font-size:.875rem;color:var(--muted-foreground);text-align:center}' +
      /* 表格 */
      '.dt-table-wrap{border:1px solid var(--border);border-radius:var(--radius,0.5rem);overflow:auto;background:var(--card)}' +
      '.dt-table{width:100%;min-width:36rem;border-collapse:collapse;font-size:.875rem}' +
      '.dt-th{height:2.5rem;padding:0 .5rem;text-align:left;font-weight:500;color:var(--foreground);border-bottom:1px solid var(--border);white-space:nowrap;background:var(--card);vertical-align:middle}' +
      '.dt-th .dt-checkbox .dt-check,.dt-td .dt-checkbox .dt-check{transform:translateY(2px)}' +
      '.dt-td{height:3rem;padding:.75rem .5rem;border-bottom:1px solid var(--border);vertical-align:middle}' +
      '.dt-table tbody tr{transition:background-color .15s}' +
      '.dt-table tbody tr:hover{background:color-mix(in oklab,var(--muted) 50%,transparent)}' +
      '.dt-table tbody tr.is-selected{background:var(--muted)}' +
      '.dt-table tbody tr:last-child .dt-td{border-bottom:none}' +
      /* 复选框(视觉方块 + 隐藏 input) */
      '.dt-check{display:inline-flex;align-items:center;justify-content:center;width:1rem;height:1rem;flex:none;border-radius:calc(var(--radius,0.5rem)*.5);border:1px solid var(--border);background:var(--background);color:transparent;cursor:pointer;transition:background-color .15s,border-color .15s,color .15s}' +
      '.dt-check svg{opacity:0;width:.875rem;height:.875rem}' +
      '.dt-check.is-checked{background:var(--primary);border-color:var(--primary);color:var(--primary-foreground)}' +
      '.dt-check.is-checked svg{opacity:1}' +
      '.dt-check.is-indeterminate{background:var(--primary);border-color:var(--primary)}' +
      '.dt-check.is-indeterminate::after{content:\'\';display:block;width:.5rem;height:.125rem;border-radius:1px;background:var(--primary-foreground)}' +
      '.dt-check-input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
      /* 分页 */
      '.dt-pagination{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;padding:.5rem 1rem;border-top:1px solid var(--border);font-size:.875rem;color:var(--muted-foreground)}' +
      /* 批量操作浮动条(固定在视口底部居中,毛玻璃药丸) */
      '.dt-bulk-bar{position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);z-index:50;display:flex;align-items:center;gap:.5rem;border:1px solid var(--border);border-radius:calc(var(--radius,0.5rem)*1.5);background:color-mix(in oklab,var(--background) 95%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:var(--foreground);box-shadow:0 16px 48px var(--shadow-color-popover);padding:.5rem;transition:transform .3s ease}' +
      '.dt-bulk-bar:hover{transform:translateX(-50%) scale(1.05)}';
    document.head.appendChild(style);
  }
  injectStyles();

  /* ---------- 工厂 ---------- */
  window.App = window.App || {};
  App.ui = App.ui || {};
  App.ui.dataTable = function (opts) {
    opts = opts || {};
    if (!opts.id) throw new Error('dataTable: 缺少必填的 id');
    var inst = {
      id: opts.id,
      opts: opts,
      t: null,
      state: {
        search: '',
        filterSel: {},
        filterSearch: {},
        sort: { key: '', dir: '' },
        page: 1,
        pageSize: (opts.pageSizeOptions && opts.pageSizeOptions[0]) || 10,
        selection: {},
        visibility: {},
        filterVisibility: {},
      },
    };
    (opts.columns || []).forEach(function (c) {
      inst.state.visibility[c.key] = c.visible !== false;
    });
    (opts.filters || []).forEach(function (f) {
      inst.state.filterVisibility[f.key] = true;
    });
    instances[opts.id] = inst;
    if (!eventsBound) {
      bindEvents();
      eventsBound = true;
    }
    return {
      render: function (t) {
        inst.t = t;
        return render(inst, t);
      },
      refresh: function () {
        rerender(inst);
      },
      setPage: function (p) {
        inst.state.page = Math.max(1, Math.min(pageCount(inst), p));
        rerender(inst);
      },
      clearSelection: function () {
        inst.state.selection = {};
        rerender(inst);
      },
      selected: function () {
        return selectedRows(inst);
      },
      selectedCount: function () {
        return selectedCount(inst);
      },
      destroy: function () {
        delete instances[inst.id];
      },
    };
  };
})();
