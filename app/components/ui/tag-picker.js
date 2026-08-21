/* ============================================================
 * tag-picker.js — 公共标签组件(零依赖,多模块复用)
 * ------------------------------------------------------------
 * 设计要点(标签 ≠ 分组,两者功能刻意不同):
 *   - 标签是扁平集合,无层级、无拖拽、无自定义图标 —— 统一使用
 *     「#」符号 + 19 色调色板(强调色 accent 跟随主题 --primary)
 *     区分标签,类似 GitHub / Notion 的彩色标签体系。
 *   - App.ui.tagPicker.create(opts) 返回一个实例,提供两个视图:
 *       managerHtml()  侧栏标签管理列表:全部标签(清除筛选)/
 *                      未标记筛选 / 搜索 / 颜色过滤 / 计数角标 /
 *                      右键+⋯ 菜单(重命名 / 改色 / 删除)
 *       pickerHtml()   Gmail 式多选下拉:模糊搜索实时过滤 + 高亮、
 *                      点选即切换(不关闭,可连续多选)、
 *                      无匹配时「+ 创建新标签」、Enter 快速选中/新建、
 *                      ↑↓ 键盘导航、已选计数 + 完成。
 *   - 创建/重命名弹窗内置名称校验(空 / 重名),颜色选择为 19 色
 *     圆点色板 + hex 输入;改色复用 App.ui.colorPicker 圆形拾色器。
 * 事件:document 级委托,作用域限定 [data-tp],多实例共存。
 * 依赖:App.icon.iconSvg、App.ui.color、App.ui.colorPicker、App.ui.toast。
 * ============================================================ */
(function () {
  'use strict';

  var SEQ = 0;
  var INSTANCES = {};

  /* ---------- 纯工具(可测试,无 DOM 依赖) ---------- */
  /** 模糊匹配:query 各字符需按序出现(不要求连续),忽略大小写 */
  function fuzzyMatch(text, query) {
    text = String(text || '');
    query = String(query || '').trim();
    if (!query) return true;
    var tl = text.toLowerCase();
    var ql = query.toLowerCase();
    var qi = 0;
    for (var i = 0; i < tl.length && qi < ql.length; i++) {
      if (tl.charAt(i) === ql.charAt(qi)) qi++;
    }
    return qi === ql.length;
  }

  /** 高亮命中片段(仅按 query 顺序命中的字符加 <mark>),返回 HTML */
  function highlight(text, query, esc) {
    text = String(text || '');
    query = String(query || '').trim();
    var e = esc || escapeHtml;
    if (!query) return e(text);
    var tl = text.toLowerCase();
    var ql = query.toLowerCase();
    var hits = {};
    var qi = 0;
    for (var i = 0; i < tl.length && qi < ql.length; i++) {
      if (tl.charAt(i) === ql.charAt(qi)) {
        hits[i] = true;
        qi++;
      }
    }
    var out = '';
    for (var j = 0; j < text.length; j++) {
      out += hits[j] ? '<mark>' + e(text.charAt(j)) + '</mark>' : e(text.charAt(j));
    }
    return out;
  }

  /** 默认标签颜色轮换:每次新建从 19 色循环(含 accent) */
  var colorCursor = 0;
  function nextColor() {
    var c = PALETTE[colorCursor % PALETTE.length];
    colorCursor++;
    return c;
  }

  /** 统一转义（shared/escape.js，红线 13）：保留局部别名以兼容既有调用点 */
  var escapeHtml = App.escape.escHtml;
  var esc = escapeHtml;
  var escAttr = App.escape.escAttr;
  function ic(name) {
    try {
      return App.icon.iconSvg(name, { class: 'size-3.5' });
    } catch (e) {
      return '';
    }
  }
  function resolveColor(name) {
    try {
      return App.ui.color.resolveColor(name);
    } catch (e) {
      return '';
    }
  }

  /** 19 色调色板:强调色(accent,跟随主题 --primary)+ 18 常用色 */
  var PALETTE = [
    'accent',
    'zinc',
    'amber',
    'blue',
    'cyan',
    'emerald',
    'fuchsia',
    'green',
    'indigo',
    'lime',
    'orange',
    'pink',
    'purple',
    'red',
    'rose',
    'sky',
    'teal',
    'violet',
    'yellow',
  ];

  /* ---------- 实例 ---------- */
  function create(opts) {
    opts = opts || {};
    var inst = {
      uid: 'tp-' + ++SEQ,
      opts: opts,
      pickerSearch: '',
      pickerIndex: -1,
      pickerQuery: '',
      managerFilter: '',
      managerColor: '',
      nodes: function () {
        var fn = opts.nodes;
        return typeof fn === 'function' ? fn() : [];
      },
      labels: function () {
        return opts.labels || {};
      },
      setPickerSearch: function (v) {
        inst.pickerSearch = String(v || '');
        inst.pickerIndex = -1;
      },
      setManagerFilter: function (v) {
        inst.managerFilter = String(v || '');
      },
      setManagerColor: function (v) {
        inst.managerColor = String(v || '');
      },
      /** 触发宿主整体重渲染(搜索/筛选/增删改后) */
      refresh: function () {
        if (typeof inst.opts.onRender === 'function') inst.opts.onRender();
      },
      render: function () {
        return managerHtml(inst);
      },
      pickerHtml: function (pickedIds) {
        return pickerHtml(inst, pickedIds);
      },
      /** 新建标签 Popover(anchorEl 为触发按钮,用于锚定定位) */
      openCreateDialog: function (anchorEl) {
        openTagDialog(inst, null, anchorEl || null);
      },
    };
    INSTANCES[inst.uid] = inst;
    return inst;
  }

  function instOf(el) {
    var root = el && el.closest ? el.closest('[data-tp]') : null;
    if (root) return INSTANCES[root.getAttribute('data-tp')] || null;
    // 多选下拉 Popover 可能挂在 body 下(无 [data-tp] 祖先),从 data-tp-picker 回退解析
    var picker = el && el.closest ? el.closest('[data-tp-picker]') : null;
    if (picker) return INSTANCES[picker.getAttribute('data-tp-picker')] || null;
    return null;
  }
  function nodeOf(inst, id) {
    var list = inst.nodes();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------- 侧栏管理列表 ---------- */
  function managerHtml(inst) {
    var L = inst.labels();
    var tags = inst.nodes();
    var filter = inst.managerFilter;
    var colorF = inst.managerColor;
    var activeId = inst.opts.activeId || '';
    var taggedCount = 0;
    var untaggedCount = 0;
    var byColor = {};
    var list = tags
      .filter(function (t) {
        if (colorF && (t.color || '') !== colorF) return false;
        if (filter && !fuzzyMatch(t.name, filter)) return false;
        return true;
      })
      .slice()
      .sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });
    if (typeof inst.opts.count === 'function') {
      tags.forEach(function (t) {
        byColor[t.color || ''] = (byColor[t.color || ''] || 0) + 1;
        taggedCount += inst.opts.count(t.id) || 0;
      });
      untaggedCount = inst.opts.count(null) || 0;
    }
    var html =
      '<div class="tp" data-tp="' +
      inst.uid +
      '">' +
      '<div class="tp-manager">' +
      '<div class="tp-search">' +
      App.ui.searchInput.html({
        placeholder: L.searchTags || '',
        value: filter,
        attrs: 'data-tp-search',
        class: 'is-compact',
        clearLabel: L.clear || '',
      }) +
      '</div>' +
      '<div class="tp-colorbar" data-tp-colorbar>' +
      '<button type="button" class="tp-swatch' +
      (colorF === '' ? ' is-on' : '') +
      '" data-tp-color="" data-tip="' +
      escAttr(L.allColors || '') +
      '" style="background:conic-gradient(from 0deg,var(--nova-palette-rose),var(--nova-palette-amber),var(--nova-palette-lime),var(--nova-palette-cyan),var(--nova-palette-indigo),var(--nova-palette-purple),var(--nova-palette-rose))" aria-label=""></button>' +
      PALETTE.map(function (name) {
        return (
          '<button type="button" class="tp-swatch' +
          (colorF === name ? ' is-on' : '') +
          '" data-tp-color="' +
          name +
          '" data-tip="' +
          name +
          (byColor[name] ? ' (' + byColor[name] + ')' : '') +
          '" style="background:' +
          resolveColor(name) +
          '" aria-label=""></button>'
        );
      }).join('') +
      '</div>' +
      '<div class="tp-body" data-tp-body>' +
      '<div class="tp-row tp-root' +
      (activeId === '' ? ' is-active' : '') +
      '" data-tp-clear>' +
      '<span class="tp-hash tp-hash-root">#</span>' +
      '<span class="tp-name">' +
      esc(L.allTags || '') +
      '</span>' +
      '<span class="tp-count">' +
      taggedCount +
      '</span>' +
      '</div>' +
      '<div class="tp-row tp-root' +
      (activeId === '__none__' ? ' is-active' : '') +
      '" data-tp-none>' +
      '<span class="tp-hash tp-hash-root">#</span>' +
      '<span class="tp-name">' +
      esc(L.untagged || '') +
      '</span>' +
      '<span class="tp-count">' +
      untaggedCount +
      '</span>' +
      '</div>';
    if (!list.length) {
      html +=
        '<div class="tp-empty">' +
        (filter || colorF ? esc(L.noMatch || '') : esc(L.empty || '')) +
        '</div>';
    } else {
      list.forEach(function (t) {
        html += tagRowHtml(inst, t, activeId);
      });
    }
    html += '</div></div></div>';
    return html;
  }

  function tagRowHtml(inst, t, activeId) {
    var L = inst.labels();
    var count = typeof inst.opts.count === 'function' ? inst.opts.count(t.id) : 0;
    var col = resolveColor(t.color);
    return (
      '<div class="tp-row' +
      (activeId === t.id ? ' is-active' : '') +
      '" data-tp-tag="' +
      escAttr(t.id) +
      '" data-tip="' +
      escAttr(L.renameHint || '') +
      '">' +
      '<span class="tp-hash" style="' +
      (col ? 'color:' + col + ';' : '') +
      '">#</span>' +
      '<span class="tp-name" data-tp-rename="' +
      escAttr(t.id) +
      '">' +
      esc(t.name) +
      '</span>' +
      (count ? '<span class="tp-count">' + count + '</span>' : '') +
      '<button type="button" class="tp-more" data-tp-more="' +
      escAttr(t.id) +
      '" aria-label="' +
      escAttr(L.menu || '') +
      '" data-tip="' +
      escAttr(L.menu || '') +
      '">' +
      ic('ellipsis') +
      '</button>' +
      '</div>'
    );
  }

  function tagMenuItemsHtml(inst, t) {
    var L = inst.labels();
    function item(act, label, iconName, danger) {
      return App.ui.contextMenu.item(iconName, label, {
        attrs: 'data-tp-act="' + act + '" data-id="' + escAttr(t.id) + '"',
        danger: !!danger,
      });
    }
    return (
      item('rename', L.rename || '', 'pencil') +
      item('color', L.color || '', 'palette') +
      App.ui.contextMenu.separator() +
      item('del', L.delete || '', 'trash-2', true)
    );
  }

  /* ---------- Gmail 式多选下拉 ---------- */
  function pickerHtml(inst, pickedIds) {
    var L = inst.labels();
    pickedIds = pickedIds || [];
    var q = inst.pickerSearch;
    var tags = inst.nodes();
    var list = tags.filter(function (t) {
      return fuzzyMatch(t.name, q);
    });
    var exact = list.some(function (t) {
      return t.name.toLowerCase() === q.trim().toLowerCase();
    });
    var canCreate = q.trim() && !exact;
    var html =
      '<div class="tp-picker" data-tp-picker="' +
      inst.uid +
      '">' +
      '<div class="tp-picker-search">' +
      App.ui.searchInput.html({
        placeholder: L.searchCreate || '',
        value: q,
        attrs: 'data-tp-pick-search',
        class: 'is-compact',
        clearLabel: L.clear || '',
      }) +
      '</div>' +
      '<div class="tp-pick-list" data-tp-pick-list>';
    if (canCreate) {
      html +=
        '<button type="button" class="tp-opt tp-opt-create" data-tp-create>' +
        '<span class="tp-opt-plus">' +
        ic('plus') +
        '</span>' +
        '<span class="tp-opt-name">' +
        esc(L.createTag || '') +
        ' "<b>' +
        escapeHtml(q.trim()) +
        '</b>"</span>' +
        '</button>';
    }
    if (!list.length && !canCreate) {
      html += '<div class="tp-empty">' + esc(L.empty || '') + '</div>';
    } else {
      list.forEach(function (t) {
        var on = pickedIds.indexOf(t.id) !== -1;
        var col = resolveColor(t.color);
        html +=
          '<button type="button" class="tp-opt' +
          (on ? ' is-on' : '') +
          '" data-tp-pick="' +
          escAttr(t.id) +
          '">' +
          '<span class="tp-check">' +
          (on ? ic('check') : '') +
          '</span>' +
          '<span class="tp-hash" style="' +
          (col ? 'color:' + col + ';' : '') +
          '">#</span>' +
          '<span class="tp-opt-name">' +
          highlight(t.name, q, escapeHtml) +
          '</span>' +
          '</button>';
      });
    }
    html +=
      '</div>' +
      '<div class="tp-pick-foot">' +
      '<span class="tp-pick-count">' +
      (pickedIds.length ? pickedIds.length + ' ' + esc(L.selected || '') : esc(L.noneSelected || '')) +
      '</span>' +
      '<button type="button" class="tp-btn" data-tp-done>' +
      esc(L.done || '') +
      '</button>' +
      '</div>' +
      '</div>';
    return html;
  }

  /* ---------- 弹窗(自研,禁用 window.prompt/confirm) ---------- */
  var overlay = null;
  function openDialog(opts) {
    closeDialog();
    overlay = document.createElement('div');
    overlay.className = 'tp-overlay';
    overlay.innerHTML =
      '<div class="tp-dialog">' +
      '<div class="tp-dialog-head">' +
      '<span class="tp-dialog-title">' +
      opts.title +
      '</span>' +
      '<button type="button" class="tp-dlg-x" data-tp-dlg-close aria-label="">' +
      ic('x') +
      '</button>' +
      '</div>' +
      (opts.desc ? '<div class="tp-dialog-desc">' + opts.desc + '</div>' : '') +
      '<div class="tp-dialog-body">' +
      (opts.body || '') +
      '</div>' +
      '<div class="tp-dialog-foot">' +
      '<button type="button" class="tp-btn" data-tp-dlg-close>' +
      esc(opts.cancelLabel || '') +
      '</button>' +
      '<button type="button" class="tp-btn tp-btn-primary" data-tp-dlg-ok>' +
      esc(opts.okLabel || '') +
      '</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }
  function closeDialog() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }
  document.addEventListener('click', function (e) {
    if (overlay && e.target && (!e.target.closest || !e.target.closest('.tp-dialog'))) {
      closeDialog();
    }
  });

  /** 标签名合法性:非空、长度、重名(忽略大小写) */
  function validateName(inst, name, selfId, requiredLabel) {
    var L = inst.labels();
    if (!name) return L.nameRequired || '';
    if (name.length > 40) return (L.nameTooLong || '') + ' (40)';
    var dup = inst.nodes().some(function (t) {
      return t.id !== selfId && t.name.toLowerCase() === name.toLowerCase();
    });
    if (dup) return L.nameExists || '';
    return '';
  }

  /* ---------- 标签新建/重命名:锚定 Popover(Chrome 添加联系人风格,无全屏遮罩) ---------- */
  var tagPop = null;
  /** 标签表单 HTML(名称 + 色板 + 自定义颜色 + 底部按钮) */
  function tagFormHtml(inst, isNew, curName, curColor, picked) {
    var L = inst.labels();
    return (
      '<div class="tp-pop-head">' +
      '<span class="tp-dialog-title">' +
      esc(isNew ? L.newTag || '' : L.rename || '') +
      '</span>' +
      '<button type="button" class="tp-dlg-x" data-tp-dlg-close aria-label="">' +
      ic('x') +
      '</button>' +
      '</div>' +
      (isNew && (L.newTagDesc || '')
        ? '<div class="tp-dialog-desc">' + esc(L.newTagDesc) + '</div>'
        : '') +
      '<div class="tp-dialog-body">' +
      '<div class="tp-field"><label>' +
      esc(L.name || '') +
      '</label>' +
      '<input type="text" class="tp-input" data-tp-name placeholder="' +
      escAttr(L.tagNamePlaceholder || '') +
      '" value="' +
      escAttr(curName) +
      '" maxlength="40" autocomplete="off" /></div>' +
      '<div class="tp-field"><label>' +
      esc(L.color || '') +
      '</label>' +
      '<div class="tp-swatches" data-tp-swatches>' +
      PALETTE.map(function (name) {
        return (
          '<button type="button" class="tp-swatch tp-swatch-lg' +
          (picked === name ? ' is-on' : '') +
          '" data-tp-palette="' +
          name +
          '" data-tip="' +
          name +
          '" style="background:' +
          resolveColor(name) +
          '" aria-label=""></button>'
        );
      }).join('') +
      '<span class="tp-swatch-custom" data-tp-custom-color style="--sw:' +
      (picked && PALETTE.indexOf(picked) === -1 ? resolveColor(picked) : '') +
      '">' +
      ic('palette') +
      '</span>' +
      '</div>' +
      (picked && PALETTE.indexOf(picked) === -1
        ? '<div class="tp-field" data-tp-custom-row><label>' +
          esc(L.customColor || '') +
          '</label><input type="text" class="tp-input" data-tp-hex placeholder="&#35;ff0000" value="' +
          escAttr(picked) +
          '" spellcheck="false" /></div>'
        : '') +
      '</div>' +
      '<div class="tp-dialog-foot">' +
      '<button type="button" class="tp-btn" data-tp-dlg-close>' +
      esc(L.cancel || '') +
      '</button>' +
      '<button type="button" class="tp-btn tp-btn-primary" data-tp-dlg-ok>' +
      esc(L.save || '') +
      '</button>' +
      '</div>'
    );
  }
  /** 定位 Popover:锚点下方右对齐,空间不足向上翻转;无锚点居中 */
  function positionTagPop(pop, anchorEl) {
    var w = pop.offsetWidth || 320;
    var h = pop.offsetHeight || 220;
    var left, top;
    if (anchorEl && anchorEl.getBoundingClientRect) {
      var rect = anchorEl.getBoundingClientRect();
      left = rect.left;
      top = rect.bottom + 4;
      if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
      if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 4);
    } else {
      left = Math.max(8, (window.innerWidth - w) / 2);
      top = Math.max(8, (window.innerHeight - h) / 2);
    }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  function closeTagPop() {
    if (tagPop && tagPop.parentNode) tagPop.parentNode.removeChild(tagPop);
    tagPop = null;
  }

  function openTagDialog(inst, tag, anchorEl) {
    var L = inst.labels();
    var isNew = !tag;
    var curName = tag ? tag.name : '';
    var curColor = tag ? tag.color || '' : '';
    var picked = curColor || '';
    closeTagPop();
    tagPop = document.createElement('div');
    tagPop.className = 'tp-pop';
    tagPop.setAttribute('data-tp-pop', '');
    tagPop.innerHTML = tagFormHtml(inst, isNew, curName, curColor, picked);
    document.body.appendChild(tagPop);
    positionTagPop(tagPop, anchorEl);
    // 自定义颜色按钮 → 圆形拾色器弹窗
    tagPop.querySelector('[data-tp-custom-color]').addEventListener('click', function () {
      App.ui.colorPicker.pickerDialog(
        picked,
        function (val) {
          picked = val || '';
          var row = tagPop.querySelector('[data-tp-custom-row]');
          if (!row) {
            var body = tagPop.querySelector('.tp-dialog-body');
            var div = document.createElement('div');
            div.className = 'tp-field';
            div.setAttribute('data-tp-custom-row', '');
            div.innerHTML =
              '<label>' +
              escapeHtml(L.customColor || '') +
              '</label><input type="text" class="tp-input" data-tp-hex value="' +
              escAttr(val || '') +
              '" spellcheck="false" />';
            body.appendChild(div);
          } else {
            var hex = row.querySelector('[data-tp-hex]');
            if (hex) hex.value = val || '';
          }
          var sw = tagPop.querySelector('[data-tp-custom-color]');
          if (sw) sw.style.setProperty('--sw', App.ui.color.resolveColor(val));
        },
        {
          title: L.color || '',
          cancelLabel: L.cancel || '',
          applyLabel: L.save || '',
          copiedLabel: L.copied || '',
          clearLabel: L.clear || '',
          copyTip: L.copyTip || '',
          hint: L.pickerHint || '',
          labels: L,
        }
      );
    });
    // 色板点击
    tagPop.addEventListener('click', function (e) {
      var sw = e.target.closest ? e.target.closest('[data-tp-palette]') : null;
      if (!sw) return;
      picked = sw.getAttribute('data-tp-palette');
      tagPop.querySelectorAll('[data-tp-palette]').forEach(function (el) {
        el.classList.toggle('is-on', el === sw);
      });
      var row = tagPop.querySelector('[data-tp-custom-row]');
      if (row) row.parentNode.removeChild(row);
    });
    // hex 输入
    tagPop.addEventListener('input', function (e) {
      var hex = e.target;
      if (!hex || !hex.hasAttribute || !hex.hasAttribute('data-tp-hex')) return;
      picked = hex.value.trim();
    });
    // 确定:校验 → 回调
    tagPop.querySelector('[data-tp-dlg-ok]').addEventListener('click', function () {
      var name = tagPop.querySelector('[data-tp-name]').value.trim();
      var err = validateName(inst, name, tag ? tag.id : '', L.nameRequired);
      if (err) {
        toast(inst, err, true);
        return;
      }
      var finalColor = picked;
      if (finalColor && PALETTE.indexOf(finalColor) === -1) {
        var parsed = parseColorSafe(finalColor);
        finalColor = parsed ? App.ui.color.formatHex(parsed) : '';
      }
      closeTagPop();
      if (isNew) {
        if (typeof inst.opts.onCreate === 'function') inst.opts.onCreate(name, finalColor);
      } else if (typeof inst.opts.onRename === 'function') {
        inst.opts.onRename(tag.id, name, finalColor);
      }
    });
    // 回车提交
    tagPop.querySelector('[data-tp-name]').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tagPop.querySelector('[data-tp-dlg-ok]').click();
    });
    var inp = tagPop.querySelector('[data-tp-name]');
    setTimeout(function () {
      inp.focus();
      if (isNew) inp.select();
      else {
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }, 30);
  }
  // 点击 Popover 外部关闭(触发打开的动作项除外,避免同一次点击关闭刚打开的弹层)
  document.addEventListener('click', function (e) {
    if (!tagPop) return;
    if (e.target && e.target.closest && e.target.closest('[data-tp-dlg-close]')) {
      closeTagPop();
      return;
    }
    if (e.target && e.target.closest && e.target.closest('[data-tp-pop], [data-tp-act], [data-tp-create]')) return;
    closeTagPop();
  });
  // Esc 关闭 Popover / 右键浮层
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeTagPop();
    hideCtx();
  });

  function parseColorSafe(v) {
    try {
      return App.ui.color.parseColor(v);
    } catch (e) {
      return null;
    }
  }

  function openDeleteDialog(inst, tag) {
    var L = inst.labels();
    var overlayEl = openDialog({
      title: L.deleteConfirm || '',
      desc: L.deleteTagMsg || '',
      body: '',
      okLabel: L.delete || '',
      cancelLabel: L.cancel || '',
    });
    overlayEl.querySelector('[data-tp-dlg-ok]').classList.add('tp-btn-danger');
    overlayEl.querySelector('[data-tp-dlg-ok]').addEventListener('click', function () {
      closeDialog();
      if (typeof inst.opts.onDelete === 'function') inst.opts.onDelete(tag.id);
    });
  }

  function toast(inst, msg, isError) {
    try {
      App.ui.toast(msg, isError ? 'error' : '');
    } catch (e) {
      /* 无 toast 环境静默 */
    }
  }

  /* ---------- 事件委托 ---------- */
  function doManagerAction(inst, el) {
    var act = el.getAttribute('data-tp-act');
    var id = el.getAttribute('data-id');
    var tag = nodeOf(inst, id);
    if (!tag) return;
    if (act === 'rename') openTagDialog(inst, tag, el);
    else if (act === 'color') {
      App.ui.colorPicker.pickerDialog(tag.color || '', function (val) {
        if (typeof inst.opts.onColorChange === 'function') inst.opts.onColorChange(tag.id, val || '');
      }, {
          title: inst.labels().color || '',
          cancelLabel: inst.labels().cancel || '',
          applyLabel: inst.labels().save || '',
          copiedLabel: inst.labels().copied || '',
          clearLabel: inst.labels().clear || '',
          copyTip: inst.labels().copyTip || '',
          hint: inst.labels().pickerHint || '',
          labels: inst.labels(),
        });
    } else if (act === 'del') openDeleteDialog(inst, tag);
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    // 右键浮层挂在 body 下,先尝试从浮层取实例,再回退到树内解析
    var ctxpop = t.closest('.tp-ctxpop');
    var inst = ctxpop && ctxpop._tpInst ? ctxpop._tpInst : instOf(t);
    if (!inst) return;
    var L = inst.labels();

    // ⋯ 按钮 → 与右键同款 body 级浮层,锚定按钮下方(修复被侧栏遮挡);再次点击收起
    var more = t.closest('[data-tp-more]');
    if (more) {
      var mt = nodeOf(inst, more.getAttribute('data-tp-more'));
      if (mt) {
        if (ctxPopup && ctxTrigger === more) hideCtx();
        else showCtx(inst, mt, 0, 0, more);
      }
      return;
    }

    // 管理列表:标签行选中(筛选)/未标记/清除
    var clearRow = t.closest('[data-tp-clear]');
    if (clearRow) {
      if (typeof inst.opts.onSelect === 'function') inst.opts.onSelect('');
      return;
    }
    var noneRow = t.closest('[data-tp-none]');
    if (noneRow) {
      if (typeof inst.opts.onSelect === 'function') inst.opts.onSelect('__none__');
      return;
    }
    var tagRow = t.closest('[data-tp-tag]');
    if (tagRow && !t.closest('[data-tp-act], [data-tp-more]')) {
      if (typeof inst.opts.onSelect === 'function') {
        inst.opts.onSelect(tagRow.getAttribute('data-tp-tag'));
      }
      return;
    }
    // 行内 ⋯ 菜单动作 / 右键浮层项(先收起浮层,避免其盖住后续打开的弹窗)
    var actEl = t.closest('[data-tp-act]');
    if (actEl) {
      if (ctxpop) hideCtx();
      doManagerAction(inst, actEl);
      return;
    }
    // 颜色过滤条
    var colorBtn = t.closest('[data-tp-color]');
    if (colorBtn) {
      inst.setManagerColor(colorBtn.getAttribute('data-tp-color') || '');
      inst.refresh();
      return;
    }
    // 清除搜索由公共组件 search-input 处理(派发 input 事件)
    // 多选下拉:切换标签
    var pick = t.closest('[data-tp-pick]');
    if (pick) {
      if (typeof inst.opts.onToggle === 'function') {
        inst.opts.onToggle(pick.getAttribute('data-tp-pick'));
      }
      return;
    }
    // 多选下拉:创建新标签
    var createBtn = t.closest('[data-tp-create]');
    if (createBtn) {
      var q = inst.pickerSearch.trim();
      if (q) inst.openCreateDialog(createBtn);
      return;
    }
    // 完成
    var done = t.closest('[data-tp-done]');
    if (done) {
      try {
        App.ui.closeDropdowns ? App.ui.closeDropdowns() : null;
      } catch (err) {
        /* noop */
      }
      var wrap = t.closest('[data-dropdown]');
      var menu = wrap && wrap.querySelector('[data-dropdown-menu]');
      if (menu) menu.classList.remove('open');
      var trig = wrap && wrap.querySelector('[data-dropdown-trigger]');
      if (trig) trig.removeAttribute('aria-expanded');
      return;
    }
    // 右键菜单(管理列表行内)
    var ctx = t.closest('[data-tp-ctx]');
    if (ctx) {
      doManagerAction(inst, ctx);
      return;
    }
  });

  // 管理列表搜索输入
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var inst = instOf(t);
    if (!inst) return;
    if (t.hasAttribute('data-tp-search')) {
      inst.setManagerFilter(t.value);
      inst.refresh();
    }
  });

  // 多选下拉搜索输入(只重绘下拉内容,不重渲染整页以保焦点)
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    if (!t.hasAttribute('data-tp-pick-search')) return;
    var pickerRoot = t.closest('[data-tp-picker]');
    if (!pickerRoot) return;
    var inst = INSTANCES[pickerRoot.getAttribute('data-tp-picker')];
    if (!inst) return;
    inst.setPickerSearch(t.value);
    // 始终回调(标签 Popover 挂在 body 下,不在 [data-dropdown-menu] 内)
    if (typeof inst.opts.onRenderMenu === 'function') {
      inst.opts.onRenderMenu();
    }
  });

  // 键盘:多选下拉 ↑↓ 导航 / Enter 选中或创建 / Esc 关闭
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute || !t.hasAttribute('data-tp-pick-search')) return;
    var pickerRoot = t.closest('[data-tp-picker]');
    if (!pickerRoot) return;
    var inst = INSTANCES[pickerRoot.getAttribute('data-tp-picker')];
    if (!inst) return;
    var listEl = pickerRoot.querySelector('[data-tp-pick-list]');
    var opts = listEl ? listEl.querySelectorAll('[data-tp-pick]') : [];
    var createEl = listEl ? listEl.querySelector('[data-tp-create]') : null;
    var max = opts.length + (createEl ? 1 : 0);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var dir = e.key === 'ArrowDown' ? 1 : -1;
      inst.pickerIndex = ((inst.pickerIndex + dir) % max + max) % max;
      var target = inst.pickerIndex < opts.length ? opts[inst.pickerIndex] : createEl;
      if (target) {
        listEl.querySelectorAll('.is-hip').forEach(function (el) {
          el.classList.remove('is-hip');
        });
        target.classList.add('is-hip');
        target.scrollIntoView ? target.scrollIntoView({ block: 'nearest' }) : null;
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (inst.pickerIndex >= 0 && inst.pickerIndex < opts.length) {
        if (typeof inst.opts.onToggle === 'function') inst.opts.onToggle(opts[inst.pickerIndex].getAttribute('data-tp-pick'));
      } else if (createEl && inst.pickerSearch.trim()) {
        inst.openCreateDialog(createEl);
      }
    } else if (e.key === 'Escape') {
      var wrap = t.closest('[data-dropdown]');
      var menu = wrap && wrap.querySelector('[data-dropdown-menu]');
      if (menu) menu.classList.remove('open');
      var trig = wrap && wrap.querySelector('[data-dropdown-trigger]');
      if (trig) trig.removeAttribute('aria-expanded');
      t.blur();
    }
  });

  // 右键/⋯ 菜单浮层(公共 App.ui.contextMenu,body 级 fixed)
  var ctxPopup = null;
  var ctxTrigger = null;
  function showCtx(inst, tag, x, y, anchorEl) {
    hideCtx();
    ctxPopup = App.ui.contextMenu.open(tagMenuItemsHtml(inst, tag), {
      anchorEl: anchorEl,
      x: x,
      y: y,
      className: 'tp-ctxpop',
      keepOpenOn: '[data-tp-more]',
      onClose: function () {
        // 外部点击 / Esc / 新菜单打开时:清理实例引用与触发按钮状态
        ctxPopup = null;
        if (ctxTrigger) {
          ctxTrigger.removeAttribute('aria-expanded');
          ctxTrigger = null;
        }
      },
    });
    // 浮层挂在 body 下(不在 [data-tp] 内),把实例引用挂到元素上,
    // 供 document 级 click 委托解析,否则菜单项点击不生效。
    ctxPopup._tpInst = inst;
    if (anchorEl) {
      ctxTrigger = anchorEl;
      anchorEl.setAttribute('aria-expanded', 'true');
    }
  }
  function hideCtx() {
    App.ui.contextMenu.close(); // onClose 统一清理 ctxPopup / ctxTrigger
  }
  document.addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var inst = instOf(t);
    if (!inst) return;
    var row = t.closest('[data-tp-tag]');
    if (!row) return;
    e.preventDefault();
    var tag = nodeOf(inst, row.getAttribute('data-tp-tag'));
    if (!tag) return;
    showCtx(inst, tag, e.clientX, e.clientY);
  });
  /* ---------- 样式注入 ---------- */
  function injectStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    var style = document.createElement('style');
    style.setAttribute('data-tag-picker-style', '');
    style.textContent =
      /* 管理列表 */
      '.tp{display:flex;flex-direction:column;min-height:0;flex:1 1 auto}' +
      '.tp-manager{display:flex;flex-direction:column;min-height:0;gap:.25rem;flex:1 1 auto}' +
      '.tp-search{padding:.125rem .375rem}' +
      '.tp-picker-search{display:flex;align-items:center;padding:0 .125rem}' +
      '.tp-input{width:100%;height:1.625rem;border-radius:.4375rem;border:1px solid var(--border);background:transparent;color:inherit;padding:0 1.5rem;font-size:.75rem;outline:none}' +
      '.tp-input:focus{border-color:var(--ring);box-shadow:0 0 0 2px color-mix(in oklab,var(--ring) 40%,transparent)}' +
      '.tp-colorbar{display:flex;align-items:center;gap:.1875rem;padding:.125rem .375rem .25rem;flex-wrap:wrap}' +
      '.tp-swatch{width:.875rem;height:.875rem;border-radius:9999px;border:1px solid var(--border);padding:0;cursor:pointer;flex-shrink:0}' +
      '.tp-swatch.is-on{outline:2px solid var(--ring);outline-offset:1px}' +
      '.tp-body{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:1px;padding:.125rem .375rem .375rem}' +
      '.tp-row{display:flex;align-items:center;gap:.375rem;height:1.625rem;padding:0 .375rem;border-radius:.4375rem;cursor:pointer;user-select:none;position:relative}' +
      '.tp-row:hover{background:var(--accent)}' +
      '.tp-row.is-active{background:var(--accent);color:var(--foreground);box-shadow:inset 0 0 0 1px var(--border)}' +
      '.tp-row.tp-root{color:var(--muted-foreground);font-weight:500}' +
      '.tp-hash{display:inline-flex;align-items:center;justify-content:center;width:.9375rem;height:.9375rem;flex-shrink:0;font-size:.75rem;font-weight:700;line-height:1;border-radius:.25rem;background:color-mix(in oklab,currentColor 14%,transparent)}' +
      '.tp-hash.tp-hash-root{background:transparent;color:var(--muted-foreground)}' +
      '.tp-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8125rem}' +
      '.tp-count{flex-shrink:0;min-width:1.125rem;padding:0 .25rem;height:1rem;line-height:1rem;border-radius:9999px;background:var(--muted);color:var(--muted-foreground);font-size:.625rem;text-align:center}' +
      '.tp-more{display:inline-flex;align-items:center;justify-content:center;width:1.25rem;height:1.25rem;flex-shrink:0;border-radius:.375rem;border:0;background:transparent;color:var(--muted-foreground);cursor:pointer;opacity:0}' +
      '.tp-row:hover .tp-more,.tp-more[aria-expanded="true"]{opacity:1}' +
      '.tp-more:hover{background:var(--background);color:inherit}' +
      '.tp-more svg{width:.8125rem;height:.8125rem}' +
      '.tp-empty{padding:.5rem .375rem;font-size:.75rem;color:var(--muted-foreground)}' +
      '.tp-body mark{background:transparent;color:inherit;font-weight:700;text-decoration:underline;text-decoration-color:var(--primary);text-underline-offset:2px}' +
      /* 多选下拉 */
      '.tp-picker{display:flex;flex-direction:column;width:16rem;max-height:22rem;gap:.25rem}' +
      '.tp-picker .tp-search{padding:0}' +
      '.tp-pick-list{overflow-y:auto;max-height:14rem;display:flex;flex-direction:column;gap:1px;padding:.125rem}' +
      '.tp-opt{display:flex;align-items:center;gap:.4375rem;padding:.3125rem .5rem;border:0;border-radius:.375rem;background:transparent;color:inherit;font-size:.8125rem;cursor:pointer;text-align:left;outline:none;width:100%}' +
      '.tp-opt:hover,.tp-opt.is-hip{background:var(--accent)}' +
      '.tp-opt.is-on{color:var(--foreground)}' +
      '.tp-opt.is-on .tp-check{background:var(--primary);color:var(--primary-foreground)}' +
      '.tp-check{display:inline-flex;align-items:center;justify-content:center;width:.9375rem;height:.9375rem;flex-shrink:0;border-radius:.25rem;border:1px solid var(--border);background:var(--background);color:transparent}' +
      '.tp-check svg{width:.75rem;height:.75rem}' +
      '.tp-opt-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.tp-opt-name b{font-weight:600}' +
      '.tp-opt-create{color:var(--primary)}' +
      '.tp-opt-plus{display:inline-flex;color:inherit}' +
      '.tp-opt-plus svg{width:.875rem;height:.875rem}' +
      '.tp-pick-foot{display:flex;align-items:center;justify-content:space-between;gap:.5rem;border-top:1px solid var(--border);padding:.375rem .125rem 0}' +
      '.tp-pick-count{font-size:.6875rem;color:var(--muted-foreground)}' +
      /* 弹窗 */
      /* 新建/重命名标签:锚定 Popover(Chrome 添加联系人风格) */
      '.tp-pop{position:fixed;z-index:1100;width:min(20rem,calc(100vw - 2rem));max-height:calc(100vh - 2rem);overflow-y:auto;border-radius:.75rem;background:var(--popover);color:var(--popover-foreground);box-shadow:0 10px 30px var(--shadow-color-popover);border:1px solid var(--border);padding:.875rem;display:flex;flex-direction:column;gap:.5rem}' +
      '.tp-pop-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem}' +
      '.tp-overlay{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:var(--overlay-bg-soft)}' +
      '.tp-dialog{width:min(22rem,calc(100vw-2rem));max-height:calc(100vh-4rem);display:flex;flex-direction:column;border-radius:.75rem;background:var(--popover);color:var(--popover-foreground);box-shadow:0 10px 30px var(--shadow-color-popover);padding:.875rem}' +
      '.tp-dialog-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem}' +
      '.tp-dialog-title{font-size:.875rem;font-weight:600}' +
      '.tp-dialog-desc{font-size:.75rem;color:var(--muted-foreground);margin-bottom:.5rem}' +
      '.tp-dialog-body{overflow-y:auto;display:flex;flex-direction:column;gap:.625rem;padding:.25rem 0}' +
      '.tp-dialog-foot{display:flex;justify-content:flex-end;gap:.375rem;padding-top:.625rem}' +
      '.tp-field{display:flex;flex-direction:column;gap:.3125rem}' +
      '.tp-field>label{font-size:.75rem;font-weight:500;color:var(--muted-foreground)}' +
      '.tp-swatches{display:flex;flex-wrap:wrap;gap:.375rem;align-items:center}' +
      '.tp-swatch-lg{width:1.375rem;height:1.375rem}' +
      '.tp-swatch-custom{display:inline-flex;align-items:center;justify-content:center;width:1.375rem;height:1.375rem;border-radius:9999px;border:1px dashed var(--border);cursor:pointer;color:var(--muted-foreground);background:var(--sw,transparent)}' +
      '.tp-swatch-custom svg{width:.8125rem;height:.8125rem}' +
      '.tp-btn{height:1.875rem;padding:0 .875rem;border-radius:.4375rem;font-size:.8125rem;font-weight:500;border:1px solid var(--border);background:var(--background);color:inherit;cursor:pointer}' +
      '.tp-btn:hover{opacity:.85}' +
      '.tp-btn-primary{background:var(--primary);color:var(--primary-foreground);border-color:transparent}' +
      '.tp-btn-danger{background:var(--destructive);color:var(--primary-foreground);border-color:transparent}' +
      '.tp-dlg-x{display:inline-flex;align-items:center;justify-content:center;width:1.5rem;height:1.5rem;border:0;border-radius:.375rem;background:transparent;color:var(--muted-foreground);cursor:pointer}' +
      '.tp-dlg-x:hover{background:var(--accent);color:inherit}' +
      '.tp-dlg-x svg{width:.875rem;height:.875rem}' +
      /* 深色主题微调 */
      '.dark .tp-row:hover,.dark .tp-row.is-active{background:color-mix(in oklab,var(--accent) 55%,transparent)}' +
      '.dark .tp-opt:hover,.dark .tp-opt.is-hip{background:color-mix(in oklab,var(--accent) 55%,transparent)}' +
      '.dark .tp-count{background:color-mix(in oklab,var(--muted) 40%,transparent)}';
    document.head.appendChild(style);
  }
  injectStyles();

  window.App = window.App || {};
  App.ui = App.ui || {};
  App.ui.tagPicker = {
    create: create,
    PALETTE: PALETTE,
    fuzzyMatch: fuzzyMatch,
    highlight: highlight,
    nextColor: nextColor,
  };
})();
