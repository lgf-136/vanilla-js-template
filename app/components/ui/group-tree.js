/* ============================================================
 * group-tree.js — 公共分组树组件(零依赖,多模块复用)
 * ------------------------------------------------------------
 * App.ui.groupTree
 *   - 多级分组(任意深度),创建时可选父分组(默认根)
 *   - 右键菜单 + 行尾 ⋯ 菜单:新建子分组 / 新建同级 / 重命名 /
 *     移动到… / 设置图标(图标库 + Emoji)/ 设置颜色(圆形拾色器)/ 删除
 *   - 父分组点击箭头展开/折叠;提供 expandAll / collapseAll(顶栏按钮)
 *   - 拖拽移动(插入前/后/内部,禁止移入自身或子孙)
 *   - 双击名称内联重命名;顶部搜索过滤
 *   - 节点图标:图标库 / Emoji / 自定义颜色(调色板名或 hex,accent 跟随主题)
 * 组件只渲染树本体;区块标题与「+」等由宿主模块排版。
 * 事件:本文件注册 document 级委托,作用域限定 [data-gt-tree],多实例共存。
 * 依赖:App.icon.iconSvg、App.ui.color、App.ui.colorPicker、App.ui.toast。
 * ============================================================ */
(function () {
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

  /* ---------- 图标 / Emoji 数据 ---------- */
  function allIcons() {
    try {
      var data = window.__iconData || {};
      return Object.keys(data).sort();
    } catch (e) {
      return [];
    }
  }
  var EMOJIS = [
    '📁', '📂', '🗂️', '📌', '⭐', '🔥', '✅', '💡', '🚀', '🎯',
    '📊', '📈', '💰', '🔑', '🔒', '🛠️', '⚙️', '📦', '📚', '🧪',
    '🐛', '🌐', '🧠', '🎨', '🎵', '🎮', '📱', '💻', '🖥️', '☁️',
    '🔮', '🧩', '🎁', '⏰', '📅', '👥', '🏆', '💎', '🌱', '🌙',
    '☀️', '🍀', '🔔', '🚦', '🧭', '🎬', '💬', '🔗',
  ];

  /* ---------- 实例 ---------- */
  var SEQ = 0;
  var INSTANCES = {};

  function isEmoji(v) {
    if (typeof v !== 'string' || !v) return false;
    for (var i = 0; i < v.length; i++) if (v.charCodeAt(i) > 127) return true;
    return false;
  }

  function create(opts) {
    opts = opts || {};
    var inst = {
      uid: 'gt-' + ++SEQ,
      opts: opts,
      expanded: {},
      filter: '',
      dragId: null,
      nodes: function () {
        var fn = opts.nodes;
        return typeof fn === 'function' ? fn() : [];
      },
      labels: function () {
        return opts.labels || {};
      },
      render: function () {
        return treeHtml(inst);
      },
      expandAll: function () {
        inst.nodes().forEach(function (n) {
          inst.expanded[n.id] = true;
        });
        return inst;
      },
      collapseAll: function () {
        inst.nodes().forEach(function (n) {
          inst.expanded[n.id] = false;
        });
        return inst;
      },
      setFilter: function (v) {
        inst.filter = String(v || '');
        return inst;
      },
      createDialog: function (parentId) {
        openCreateDialog(inst, parentId == null ? '' : parentId);
      },
      /** 菜单项 HTML(⋯ 浮层 / 右键浮层共用,body 级按需渲染) */
      menuHtml: function (id) {
        return ctxItemsHtml(inst, id);
      },
    };
    INSTANCES[inst.uid] = inst;
    return inst;
  }

  function instOf(el) {
    var root = el && el.closest ? el.closest('[data-gt-tree]') : null;
    if (!root) return null;
    return INSTANCES[root.getAttribute('data-gt-tree')] || null;
  }
  function nodeOf(inst, id) {
    return findNode(inst.nodes(), id);
  }

  /* ---------- 渲染 ---------- */
  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;
  function ic(name, cls) {
    try {
      return App.icon.iconSvg(name, { class: cls || 'size-3.5' });
    } catch (e) {
      return '';
    }
  }
  function iconHtml(node) {
    var raw = node && node.icon;
    if (isEmoji(raw)) return '<span class="gt-emoji">' + esc(raw) + '</span>';
    var name = raw && allIcons().indexOf(raw) !== -1 ? raw : 'folder';
    return ic(name);
  }
  function colorCss(node) {
    try {
      return App.ui.color.resolveColor(node && node.color);
    } catch (e) {
      return '';
    }
  }
  function expandedOf(inst, id) {
    return inst.expanded[id] !== false;
  }

  /** 过滤后可见节点集(命中节点 + 祖先 + 子孙) */
  function visibleSet(inst) {
    var nodes = inst.nodes();
    var q = (inst.filter || '').trim().toLowerCase();
    if (!q) return null;
    var hit = {};
    nodes.forEach(function (n) {
      if ((n.name || '').toLowerCase().indexOf(q) !== -1) hit[n.id] = true;
    });
    // 祖先
    var changed = true;
    while (changed) {
      changed = false;
      nodes.forEach(function (n) {
        if (hit[n.id] && n.parentId && !hit[n.parentId]) {
          hit[n.parentId] = true;
          changed = true;
        }
      });
    }
    // 子孙
    Object.keys(hit).forEach(function (id) {
      descendants(nodes, id).forEach(function (did) {
        hit[did] = true;
      });
    });
    return hit;
  }

  function rowHtml(inst, node, depth, visible) {
    var nodes = inst.nodes();
    var children = treeChildren(nodes, node.id);
    var expanded = expandedOf(inst, node.id) || !!visible;
    var active = inst.opts.activeId === node.id;
    var L = inst.labels();
    var count = typeof inst.opts.count === 'function' ? inst.opts.count(node) : 0;
    var extra = typeof inst.opts.rowExtra === 'function' ? inst.opts.rowExtra(node) : '';
    var color = colorCss(node);
    var html =
      '<div class="gt-row' +
      (active ? ' is-active' : '') +
      '" data-gt-id="' +
      esc(node.id) +
      '" draggable="true" style="padding-left:' +
      Math.min(depth * 0.875, 4) +
      'rem">' +
      '<span class="gt-caret' +
      (children.length ? '' : ' is-leaf') +
      (expanded ? ' is-open' : '') +
      '" data-gt-caret="' +
      esc(node.id) +
      '" aria-label="' +
      (expanded ? '折叠' : '展开') +
      '">' +
      ic('chevron-right') +
      '</span>' +
      '<span class="gt-ic" data-gt-icon="' +
      esc(node.id) +
      '" style="' +
      (color ? 'color:' + color + ';' : '') +
      '">' +
      iconHtml(node) +
      '</span>' +
      '<span class="gt-name" data-gt-name="' +
      esc(node.id) +
      '" data-tip="' +
      (L.renameHint || '双击重命名') +
      '">' +
      esc(node.name) +
      '</span>' +
      (count ? '<span class="gt-count">' + count + '</span>' : '') +
      extra +
      '<button type="button" class="gt-more" data-gt-more="' +
      esc(node.id) +
      '" aria-label="' +
      esc(L.menu || '菜单') +
      '" data-tip="' +
      esc(L.menu || '菜单') +
      '">' +
      ic('ellipsis') +
      '</button>' +
      '</div>';
    if (children.length && expanded) {
      html +=
        '<div class="gt-children">' +
        children
          .map(function (c) {
            return rowHtml(inst, c, depth + 1, visible && visible[c.id]);
          })
          .join('') +
        '</div>';
    }
    return html;
  }

  function treeHtml(inst) {
    var nodes = inst.nodes();
    var visible = visibleSet(inst);
    var roots = visible
      ? nodes.filter(function (n) {
          return !n.parentId && visible[n.id];
        })
      : treeChildren(nodes, '');
    var L = inst.labels();
    var rootActive = !inst.opts.activeId || inst.opts.activeId === 'root';
    var html =
      '<div class="gt-tree" data-gt-tree="' +
      inst.uid +
      '">' +
      (inst.opts.showFilter === false
        ? ''
        : '<div class="gt-filter">' +
          App.ui.searchInput.html({
            placeholder: L.search || '搜索分组…',
            value: inst.filter,
            attrs: 'data-gt-filter',
            class: 'is-compact',
            clearLabel: L.clear || '清除',
          }) +
          '</div>') +
      '<div class="gt-scroll" data-gt-body>' +
      (inst.opts.rootLabel
        ? '<div class="gt-row gt-root' +
          (rootActive ? ' is-active' : '') +
          '" data-gt-clear><span class="gt-caret is-leaf"></span>' +
          '<span class="gt-ic">' +
          ic('layers') +
          '</span><span class="gt-name">' +
          esc(inst.opts.rootLabel) +
          '</span></div>'
        : '');
    if (!roots.length) {
      html +=
        '<div class="gt-empty">' +
        (inst.filter ? esc(L.noMatch || '无匹配分组') : esc(L.empty || '暂无分组')) +
        '</div>';
    } else {
      html += roots
        .map(function (n) {
          return rowHtml(inst, n, 0, visible);
        })
        .join('');
    }
    html += '</div></div>';
    return html;
  }

  function ctxItemsHtml(inst, id) {
    var L = inst.labels();
    function item(act, label, iconName, danger) {
      return App.ui.contextMenu.item(iconName, label, {
        attrs: 'data-gt-ctx="' + act + '" data-id="' + esc(id) + '"',
        danger: !!danger,
      });
    }
    return (
      item('newchild', L.newChild || '新建子分组', 'plus') +
      item('newsibling', L.newSibling || '新建同级', 'circle-plus') +
      item('rename', L.rename || '重命名', 'pencil') +
      item('move', L.moveTo || '移动到…', 'arrow-right') +
      App.ui.contextMenu.separator() +
      item('icon', L.icon || '设置图标', 'image-plus') +
      item('color', L.color || '设置颜色', 'palette') +
      App.ui.contextMenu.separator() +
      item('del', L.delete || '删除', 'trash-2', true)
    );
  }

  /* ---------- 弹窗(自研,禁用 window.prompt/confirm) ---------- */
  function openDialog(opts) {
    closeDialog();
    var overlay = document.createElement('div');
    overlay.className = 'gt-overlay';
    overlay.innerHTML =
      '<div class="gt-dialog">' +
      '<div class="gt-dialog-head">' +
      '<span class="gt-dialog-title">' +
      opts.title +
      '</span>' +
      '<button type="button" class="gt-more" data-gt-dlg-close aria-label="关闭">' +
      ic('x') +
      '</button>' +
      '</div>' +
      (opts.desc ? '<div class="gt-dialog-desc">' + opts.desc + '</div>' : '') +
      '<div class="gt-dialog-body">' +
      (opts.body || '') +
      '</div>' +
      '<div class="gt-dialog-foot">' +
      (opts.foot || '') +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('[data-gt-dlg-close]')) closeDialog();
    });
    return overlay;
  }
  function closeDialog() {
    var list = document.querySelectorAll('.gt-overlay');
    list.forEach(function (ov) {
      ov.remove();
    });
  }
  function dialogFoot(inst, okLabel) {
    var L = inst.labels();
    return (
      '<button type="button" class="gt-btn gt-btn-ghost" data-gt-dlg-cancel>' +
      esc(L.cancel || '取消') +
      '</button>' +
      '<button type="button" class="gt-btn gt-btn-primary" data-gt-dlg-ok>' +
      esc(okLabel || L.save || '保存') +
      '</button>'
    );
  }
  function bindDialogFoot(overlay, onOk, validate) {
    overlay.querySelector('[data-gt-dlg-ok]').addEventListener('click', function () {
      var ok = validate ? validate() : true;
      if (ok === false) return; // 校验失败,保持弹窗
      closeDialog();
      onOk();
    });
    var cancel = overlay.querySelector('[data-gt-dlg-cancel]');
    if (cancel) cancel.addEventListener('click', closeDialog);
  }

  /** 目标父级选择列表(创建/移动共用;excludeId 禁选自身及子孙) */
  function parentOptionsHtml(inst, current, excludeId) {
    var nodes = inst.nodes();
    var L = inst.labels();
    var html =
      '<label class="gt-opt' +
      ((current || '') === '' ? ' is-on' : '') +
      '" data-gt-parent=""><span class="gt-opt-dot"></span>' +
      '<span class="gt-opt-name">' +
      esc(L.rootGroup || '根目录(无)') +
      '</span></label>';
    var forbid = excludeId ? descendants(nodes, excludeId) : [];
    function walk(parentId, depth) {
      treeChildren(nodes, parentId).forEach(function (n) {
        var disabled = forbid.indexOf(n.id) !== -1;
        html +=
          '<label class="gt-opt' +
          ((current || '') === n.id ? ' is-on' : '') +
          (disabled ? ' is-disabled' : '') +
          '" data-gt-parent="' +
          esc(n.id) +
          '" style="padding-left:' +
          (depth * 0.875 + 0.625) +
          'rem">' +
          '<span class="gt-opt-dot"></span>' +
          '<span class="gt-opt-name">' +
          (n.icon ? '<span class="gt-opt-ic">' + iconHtml(n) + '</span>' : '') +
          esc(n.name) +
          '</span></label>';
        walk(n.id, depth + 1);
      });
    }
    walk('', 0);
    return '<div class="gt-optlist">' + html + '</div>';
  }

  /** 新建分组(可选父分组,默认根);module 顶部 + 按钮复用 */
  function openCreateDialog(inst, defaultParentId) {
    var L = inst.labels();
    var picked = defaultParentId || '';
    var overlay = openDialog({
      title: esc(L.newGroup || '新建分组'),
      desc: '',
      body:
        '<div class="gt-field"><label>' +
        esc(L.name || '名称') +
        '</label>' +
        '<input type="text" class="gt-input" data-gt-name placeholder="' +
        esc(L.namePlaceholder || '分组名称') +
        '" /></div>' +
        '<div class="gt-field"><label>' +
        esc(L.parentGroup || '父分组') +
        '</label>' +
        parentOptionsHtml(inst, picked, null) +
        '</div>',
      foot: dialogFoot(inst, L.save || '保存'),
    });
    overlay.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('[data-gt-parent]') : null;
      if (!opt) return;
      picked = opt.getAttribute('data-gt-parent') || '';
      overlay.querySelectorAll('[data-gt-parent]').forEach(function (el) {
        el.classList.toggle('is-on', el === opt);
      });
    });
    bindDialogFoot(
      overlay,
      function () {
        var name = overlay.querySelector('[data-gt-name]').value.trim();
        if (typeof inst.opts.onCreate === 'function') inst.opts.onCreate(picked, name);
      },
      function () {
        var name = overlay.querySelector('[data-gt-name]').value.trim();
        if (!name) {
          toast(inst, L.nameRequired || '名称不能为空', true);
          return false;
        }
        return true;
      }
    );
    var inp = overlay.querySelector('[data-gt-name]');
    setTimeout(function () {
      inp.focus();
    }, 30);
  }

  function openRenameDialog(inst, id) {
    var node = nodeOf(inst, id);
    if (!node) return;
    var L = inst.labels();
    var overlay = openDialog({
      title: esc(L.rename || '重命名'),
      desc: '',
      body:
        '<div class="gt-field"><label>' +
        esc(L.name || '名称') +
        '</label><input type="text" class="gt-input" data-gt-name value="' +
        esc(node.name) +
        '" /></div>',
      foot: dialogFoot(inst, L.save || '保存'),
    });
    bindDialogFoot(
      overlay,
      function () {
        var name = overlay.querySelector('[data-gt-name]').value.trim();
        if (typeof inst.opts.onRename === 'function') inst.opts.onRename(id, name);
      },
      function () {
        var name = overlay.querySelector('[data-gt-name]').value.trim();
        if (!name) {
          toast(inst, L.nameRequired || '名称不能为空', true);
          return false;
        }
        return true;
      }
    );
    var inp = overlay.querySelector('[data-gt-name]');
    setTimeout(function () {
      inp.focus();
      inp.select();
    }, 30);
  }

  function openMoveDialog(inst, id) {
    var node = nodeOf(inst, id);
    if (!node) return;
    var L = inst.labels();
    var picked = node.parentId || '';
    var overlay = openDialog({
      title: esc(L.moveTo || '移动到…'),
      desc: '',
      body:
        '<div class="gt-field"><label>' +
        esc(L.chooseParent || '选择目标分组') +
        '</label>' +
        parentOptionsHtml(inst, picked, id) +
        '</div>',
      foot: dialogFoot(inst, L.save || '保存'),
    });
    overlay.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('[data-gt-parent]') : null;
      if (!opt || opt.classList.contains('is-disabled')) return;
      picked = opt.getAttribute('data-gt-parent') || '';
      overlay.querySelectorAll('[data-gt-parent]').forEach(function (el) {
        el.classList.toggle('is-on', el === opt);
      });
    });
    bindDialogFoot(overlay, function () {
      if (picked === (node.parentId || '')) return;
      if (typeof inst.opts.onMove === 'function') inst.opts.onMove(id, picked, 'inside');
    });
  }

  /** 图标选择弹窗:图标库 / Emoji 两个页签 */
  function openIconDialog(inst, id) {
    var node = nodeOf(inst, id);
    if (!node) return;
    var L = inst.labels();
    var overlay = openDialog({
      title: esc(L.icon || '设置图标'),
      desc: '',
      body:
        '<div class="gt-tabs">' +
        '<button type="button" class="gt-tab is-on" data-gt-ictab="icon">' +
        esc(L.icon || '图标') +
        '</button>' +
        '<button type="button" class="gt-tab" data-gt-ictab="emoji">' +
        esc(L.emoji || 'Emoji') +
        '</button>' +
        '</div>' +
        '<div class="gt-icpanel" data-gt-icpanel="icon">' +
        App.ui.searchInput.html({
          placeholder: L.iconSearch || '搜索图标…',
          attrs: 'data-gt-icsearch',
          class: 'is-compact gt-icsearch',
          clearLabel: L.clear || '清除',
        }) +
        '<div class="gt-icgrid" data-gt-icgrid></div>' +
        '</div>' +
        '<div class="gt-icpanel" data-gt-icpanel="emoji" style="display:none">' +
        '<div class="gt-icgrid" data-gt-emojigrid>' +
        EMOJIS.map(function (em) {
          return (
            '<button type="button" class="gt-icbtn is-emoji" data-gt-emojipick="' +
            esc(em) +
            '">' +
            em +
            '</button>'
          );
        }).join('') +
        '</div>' +
        '<div class="gt-emojirow">' +
        '<input type="text" class="gt-input" data-gt-emojiinput placeholder="' +
        esc(L.emojiInput || '粘贴任意 Emoji…') +
        '" />' +
        '<button type="button" class="gt-btn gt-btn-primary" data-gt-emojiok>' +
        esc(L.apply || '应用') +
        '</button>' +
        '</div>' +
        '</div>',
      foot:
        '<button type="button" class="gt-btn gt-btn-danger" data-gt-icclear>' +
        esc(L.clearIcon || '清除图标') +
        '</button>' +
        '<button type="button" class="gt-btn gt-btn-ghost" data-gt-dlg-cancel>' +
        esc(L.cancel || '取消') +
        '</button>',
    });
    var grid = overlay.querySelector('[data-gt-icgrid]');
    function renderGrid(q) {
      var names = allIcons().filter(function (n) {
        return !q || n.indexOf(q) !== -1;
      });
      grid.innerHTML = names
        .map(function (n) {
          return (
            '<button type="button" class="gt-icbtn" data-gt-icpick="' +
            esc(n) +
            '" data-tip="' +
            esc(n) +
            '">' +
            ic(n) +
            '</button>'
          );
        })
        .join('');
    }
    renderGrid('');
    overlay.addEventListener('click', function (e) {
      var tab = e.target.closest ? e.target.closest('[data-gt-ictab]') : null;
      if (tab) {
        var which = tab.getAttribute('data-gt-ictab');
        overlay.querySelectorAll('[data-gt-ictab]').forEach(function (el) {
          el.classList.toggle('is-on', el === tab);
        });
        overlay.querySelectorAll('[data-gt-icpanel]').forEach(function (el) {
          el.style.display = el.getAttribute('data-gt-icpanel') === which ? '' : 'none';
        });
        return;
      }
      var pick = e.target.closest ? e.target.closest('[data-gt-icpick]') : null;
      if (pick) {
        var name = pick.getAttribute('data-gt-icpick');
        closeDialog();
        if (typeof inst.opts.onIconChange === 'function') inst.opts.onIconChange(id, name);
        return;
      }
      var epick = e.target.closest ? e.target.closest('[data-gt-emojipick]') : null;
      if (epick) {
        closeDialog();
        if (typeof inst.opts.onIconChange === 'function')
          inst.opts.onIconChange(id, epick.getAttribute('data-gt-emojipick'));
        return;
      }
      if (e.target.closest('[data-gt-emojiok]')) {
        var v = overlay.querySelector('[data-gt-emojiinput]').value.trim();
        if (v) {
          closeDialog();
          if (typeof inst.opts.onIconChange === 'function') inst.opts.onIconChange(id, v);
        }
        return;
      }
      if (e.target.closest('[data-gt-icclear]')) {
        closeDialog();
        if (typeof inst.opts.onIconChange === 'function') inst.opts.onIconChange(id, '');
        return;
      }
    });
    overlay.addEventListener('input', function (e) {
      var t = e.target;
      if (t && t.hasAttribute && t.hasAttribute('data-gt-icsearch')) renderGrid(t.value.trim().toLowerCase());
    });
  }

  /** 颜色选择弹窗(内嵌公共圆形拾色器) */
  function openColorDialog(inst, id) {
    var node = nodeOf(inst, id);
    if (!node) return;
    var L = inst.labels();
    var overlay = openDialog({
      title: esc(L.color || '设置颜色'),
      desc: '',
      body: '<div class="gt-colorwrap"></div>',
      foot:
        '<button type="button" class="gt-btn gt-btn-ghost" data-gt-dlg-cancel>' +
        esc(L.cancel || '取消') +
        '</button>',
    });
    var wrap = overlay.querySelector('.gt-colorwrap');
    wrap.innerHTML = App.ui.colorPicker.pickerHtml(node.color || '', {
      showClear: true,
      clearLabel: L.clearColor || '清除颜色',
      applyLabel: L.apply || '应用',
      copiedLabel: L.copied || '已复制',
      onPick: function (value) {
        if (typeof inst.opts.onColorChange === 'function') inst.opts.onColorChange(id, value);
        closeDialog();
      },
      onClear: function () {
        if (typeof inst.opts.onColorChange === 'function') inst.opts.onColorChange(id, '');
        closeDialog();
      },
    });
    var scope = wrap.querySelector('[data-color-picker]');
    if (scope) {
      scope._cpkOpts = {
        showClear: true,
        clearLabel: L.clearColor || '清除颜色',
        applyLabel: L.apply || '应用',
        copiedLabel: L.copied || '已复制',
        onPick: function (value) {
          if (typeof inst.opts.onColorChange === 'function') inst.opts.onColorChange(id, value);
          closeDialog();
        },
        onClear: function () {
          if (typeof inst.opts.onColorChange === 'function') inst.opts.onColorChange(id, '');
          closeDialog();
        },
      };
    }
  }

  function openDeleteDialog(inst, id) {
    var node = nodeOf(inst, id);
    if (!node) return;
    var L = inst.labels();
    var overlay = openDialog({
      title: esc(L.deleteConfirm || '删除确认'),
      desc: esc((L.deleteMsg || '确定删除「{name}」及其子分组?路由不受影响。').split('{name}').join(node.name)),
      body: '',
      foot:
        '<button type="button" class="gt-btn gt-btn-ghost" data-gt-dlg-cancel>' +
        esc(L.cancel || '取消') +
        '</button>' +
        '<button type="button" class="gt-btn gt-btn-danger" data-gt-dlg-ok>' +
        esc(L.delete || '删除') +
        '</button>',
    });
    bindDialogFoot(overlay, function () {
      if (typeof inst.opts.onDelete === 'function') inst.opts.onDelete(id);
    });
  }

  function toast(inst, msg, error) {
    try {
      App.ui.toast(msg, error ? 'error' : 'default');
    } catch (e) {
      /* 静默 */
    }
  }

  /* ---------- 右键/⋯ 菜单浮层(公共 App.ui.contextMenu,body 级 fixed) ---------- */
  var ctxPopup = null;
  var ctxTrigger = null;
  function showCtxMenu(inst, id, x, y, anchorEl) {
    hideCtxMenu();
    ctxPopup = App.ui.contextMenu.open(ctxItemsHtml(inst, id), {
      anchorEl: anchorEl,
      x: x,
      y: y,
      className: 'gt-ctxpop',
      keepOpenOn: '[data-gt-more]',
      onClose: function () {
        // 外部点击 / Esc / 新菜单打开时:清理实例引用与触发按钮状态
        ctxPopup = null;
        if (ctxTrigger) {
          ctxTrigger.removeAttribute('aria-expanded');
          ctxTrigger = null;
        }
      },
    });
    // 浮层挂在 body 下(不在 [data-gt-tree] 内),把实例引用挂到元素上,
    // 供 document 级 click 委托解析,否则菜单项点击不生效。
    ctxPopup._gtInst = inst;
    if (anchorEl) {
      ctxTrigger = anchorEl;
      anchorEl.setAttribute('aria-expanded', 'true');
    }
  }
  function hideCtxMenu() {
    App.ui.contextMenu.close(); // onClose 统一清理 ctxPopup / ctxTrigger
  }

  /* ---------- 拖拽 ---------- */
  function clearDropIndicators() {
    document.querySelectorAll('[data-gt-zone]').forEach(function (el) {
      el.removeAttribute('data-gt-zone');
    });
    document.querySelectorAll('.gt-row.gt-dragging').forEach(function (el) {
      el.classList.remove('gt-dragging');
    });
  }

  /* ---------- 事件委托(全部 document 级,按 [data-gt-tree] 作用域) ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    // 右键浮层挂在 body 下,先尝试从浮层取实例,再回退到树内解析
    var ctxpop = t.closest('.gt-ctxpop');
    var inst = ctxpop && ctxpop._gtInst ? ctxpop._gtInst : instOf(t);
    if (!inst) return;
    // ⋯ 按钮 → 与右键同款 body 级浮层,锚定按钮下方(修复被侧栏遮挡);再次点击收起
    var more = t.closest('[data-gt-more]');
    if (more) {
      if (ctxPopup && ctxTrigger === more) hideCtxMenu();
      else showCtxMenu(inst, more.getAttribute('data-gt-more'), 0, 0, more);
      return;
    }
    // 菜单项(⋯ 浮层 / 右键浮层共用)
    var ctx = t.closest('[data-gt-ctx]');
    if (ctx) {
      doAction(inst, ctx.getAttribute('data-gt-ctx'), ctx.getAttribute('data-id'));
      return;
    }
    // 全部清除(根行)
    if (t.closest('[data-gt-clear]')) {
      if (typeof inst.opts.onSelect === 'function') inst.opts.onSelect(null);
      return;
    }
    // 箭头展开/折叠
    var caret = t.closest('[data-gt-caret]');
    if (caret) {
      var cid = caret.getAttribute('data-gt-caret');
      inst.expanded[cid] = !expandedOf(inst, cid);
      if (typeof inst.opts.onToggle === 'function') inst.opts.onToggle(cid, inst.expanded[cid]);
      rerender(inst);
      return;
    }
    // 节点选中(名称/图标;按钮/输入框/下拉内点击不触发)
    var row = t.closest('[data-gt-id]');
    if (row && !t.closest('button, input, textarea, [data-dropdown]')) {
      var id = row.getAttribute('data-gt-id');
      if (typeof inst.opts.onSelect === 'function') inst.opts.onSelect(id);
      return;
    }
  });

  function rerender(inst) {
    if (typeof inst.opts.onRender === 'function') inst.opts.onRender();
  }

  function doAction(inst, act, id) {
    var node = nodeOf(inst, id);
    if (!node) return;
    hideCtxMenu();
    if (act === 'newchild') openCreateDialog(inst, id);
    else if (act === 'newsibling') openCreateDialog(inst, node.parentId || '');
    else if (act === 'rename') openRenameDialog(inst, id);
    else if (act === 'move') openMoveDialog(inst, id);
    else if (act === 'icon') openIconDialog(inst, id);
    else if (act === 'color') openColorDialog(inst, id);
    else if (act === 'del') openDeleteDialog(inst, id);
  }

  document.addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var row = t.closest('[data-gt-id]');
    if (!row) return;
    var inst = instOf(row);
    if (!inst) return;
    e.preventDefault();
    showCtxMenu(inst, row.getAttribute('data-gt-id'), e.clientX, e.clientY);
  });

  document.addEventListener('dblclick', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var name = t.closest('[data-gt-name]');
    if (!name) return;
    var inst = instOf(name);
    if (!inst) return;
    var id = name.getAttribute('data-gt-name');
    var node = nodeOf(inst, id);
    if (!node) return;
    name.innerHTML =
      '<input type="text" class="gt-inline" data-gt-inline value="' +
      esc(node.name) +
      '" />';
    var inp = name.querySelector('[data-gt-inline]');
    inp.focus();
    inp.select();
    inp._gtId = id;
    inp._gtDone = false;
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var inst = instOf(t);
    if (!inst) return;
    if (t.hasAttribute('data-gt-filter')) {
      inst.setFilter(t.value);
      rerender(inst);
    }
  });

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    if (e.key === 'Escape') {
      hideCtxMenu();
      closeDialog();
    }
    if (t.hasAttribute('data-gt-inline')) {
      if (e.key === 'Enter') commitInline(instOf(t), t, false);
      else if (e.key === 'Escape') commitInline(instOf(t), t, true);
    }
  });

  function commitInline(inst, inp, cancel) {
    if (!inp || inp._gtDone) return;
    inp._gtDone = true;
    var id = inp._gtId;
    if (cancel) {
      rerender(inst);
      return;
    }
    var val = inp.value.trim();
    if (val && typeof inst.opts.onRename === 'function') inst.opts.onRename(id, val);
    else rerender(inst);
  }

  /* ---------- 拖拽事件 ---------- */
  document.addEventListener('dragstart', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var row = t.closest('[data-gt-id]');
    if (!row) return;
    var inst = instOf(row);
    if (!inst) return;
    inst.dragId = row.getAttribute('data-gt-id');
    row.classList.add('gt-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', inst.dragId);
    }
  });

  document.addEventListener('dragover', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var inst = instOf(t);
    if (!inst || !inst.dragId) return;
    var row = t.closest('[data-gt-id]');
    clearDropIndicators();
    if (row) {
      var targetId = row.getAttribute('data-gt-id');
      var valid = resolveDrop(inst.nodes(), inst.dragId, targetId, 'inside');
      if (!valid) {
        row.setAttribute('data-gt-zone', 'no');
        return;
      }
      var rect = row.getBoundingClientRect();
      var ratio = (e.clientY - rect.top) / Math.max(rect.height, 1);
      var zone = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside';
      var v2 = resolveDrop(inst.nodes(), inst.dragId, targetId, zone);
      if (!v2) {
        row.setAttribute('data-gt-zone', 'no');
        return;
      }
      row.setAttribute('data-gt-zone', zone);
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      e.preventDefault();
      return;
    }
    if (t.closest('[data-gt-body]')) {
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      e.preventDefault();
    }
  });

  document.addEventListener('drop', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var inst = instOf(t);
    if (!inst || !inst.dragId) return;
    e.preventDefault();
    var row = t.closest('[data-gt-id]');
    var dragId = inst.dragId;
    inst.dragId = null;
    clearDropIndicators();
    if (row) {
      var zone = row.getAttribute('data-gt-zone') || 'inside';
      if (zone !== 'no' && typeof inst.opts.onMove === 'function') {
        inst.opts.onMove(dragId, row.getAttribute('data-gt-id'), zone);
      }
      return;
    }
    if (t.closest('[data-gt-body]') && typeof inst.opts.onMove === 'function') {
      inst.opts.onMove(dragId, '', 'inside');
    }
  });

  document.addEventListener('dragend', function () {
    Object.keys(INSTANCES).forEach(function (key) {
      INSTANCES[key].dragId = null;
    });
    clearDropIndicators();
  });

  /* ---------- 样式注入 ---------- */
  function injectStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    var style = document.createElement('style');
    style.setAttribute('data-group-tree-style', '');
    style.textContent =
      /* 布局 */
      '.gt-tree{display:flex;flex-direction:column;min-height:0;gap:.125rem}' +
      '.gt-filter{padding:.125rem .375rem .25rem;flex-shrink:0}' +
      '.gt-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:1px;padding-bottom:.375rem}' +
      /* 行 */
      '.gt-row{display:flex;align-items:center;gap:.25rem;height:1.75rem;padding-right:.375rem;border-radius:.4375rem;cursor:pointer;user-select:none;position:relative}' +
      '.gt-row:hover{background:var(--accent)}' +
      '.gt-row.is-active{background:var(--accent);color:var(--foreground)}' +
      '.gt-row[data-gt-zone="before"]{box-shadow:0 -1px 0 0 var(--primary)}' +
      '.gt-row[data-gt-zone="after"]{box-shadow:0 1px 0 0 var(--primary)}' +
      '.gt-row[data-gt-zone="inside"]{outline:1px solid var(--primary);outline-offset:-1px}' +
      '.gt-row[data-gt-zone="no"]{opacity:.45}' +
      '.gt-row.gt-dragging{opacity:.45}' +
      '.gt-row.gt-root{color:var(--muted-foreground);font-weight:500}' +
      '.gt-caret{display:inline-flex;align-items:center;justify-content:center;width:1rem;height:1rem;flex-shrink:0;color:var(--muted-foreground);transition:transform .12s}' +
      '.gt-caret svg{width:.75rem;height:.75rem}' +
      '.gt-caret.is-open{transform:rotate(90deg)}' +
      '.gt-caret.is-leaf{visibility:hidden}' +
      '.gt-ic{display:inline-flex;align-items:center;justify-content:center;width:1.125rem;height:1.125rem;flex-shrink:0;color:var(--muted-foreground)}' +
      '.gt-ic svg{width:.9375rem;height:.9375rem}' +
      '.gt-emoji{font-size:.8125rem;line-height:1}' +
      '.gt-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8125rem}' +
      '.gt-count{flex-shrink:0;min-width:1.125rem;padding:0 .25rem;height:1rem;line-height:1rem;border-radius:9999px;background:var(--muted);color:var(--muted-foreground);font-size:.625rem;text-align:center}' +
      '.gt-inline{width:100%;height:1.375rem;border-radius:.3125rem;border:1px solid var(--ring);background:var(--background);color:inherit;padding:0 .25rem;font-size:.8125rem;outline:none}' +
      /* ⋯ 菜单 */
      '.gt-more{display:inline-flex;align-items:center;justify-content:center;width:1.375rem;height:1.375rem;flex-shrink:0;border-radius:.375rem;border:0;background:transparent;color:var(--muted-foreground);cursor:pointer;opacity:0}' +
      '.gt-row:hover .gt-more,.gt-more[aria-expanded="true"]{opacity:1}' +
      '.gt-more:hover{background:var(--background);color:inherit}' +
      '.gt-more svg{width:.875rem;height:.875rem}' +
      '.gt-empty{padding:.5rem .375rem;font-size:.75rem;color:var(--muted-foreground)}' +
      /* 弹窗 */
      '.gt-overlay{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}' +
      '.gt-dialog{width:min(22rem,calc(100vw-2rem));max-height:calc(100vh-4rem);display:flex;flex-direction:column;border-radius:.75rem;background:var(--popover);color:var(--popover-foreground);box-shadow:0 10px 30px rgba(0,0,0,.18);padding:.875rem}' +
      '.gt-dialog-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem}' +
      '.gt-dialog-head .gt-more{opacity:1}' +
      '.gt-dialog-title{font-size:.875rem;font-weight:600}' +
      '.gt-dialog-desc{font-size:.75rem;color:var(--muted-foreground);margin-bottom:.5rem}' +
      '.gt-dialog-body{overflow-y:auto;display:flex;flex-direction:column;gap:.5rem;padding:.25rem 0}' +
      '.gt-dialog-foot{display:flex;justify-content:flex-end;gap:.375rem;padding-top:.625rem}' +
      '.gt-field{display:flex;flex-direction:column;gap:.3125rem}' +
      '.gt-field>label{font-size:.75rem;font-weight:500;color:var(--muted-foreground)}' +
      '.gt-input{height:1.875rem;border-radius:.4375rem;border:1px solid var(--border);background:var(--background);color:inherit;padding:0 .5rem;font-size:.8125rem;outline:none}' +
      '.gt-input:focus{border-color:var(--ring);box-shadow:0 0 0 2px color-mix(in oklab,var(--ring) 40%,transparent)}' +
      '.gt-optlist{max-height:12rem;overflow-y:auto;border:1px solid var(--border);border-radius:.4375rem;padding:.25rem}' +
      '.gt-opt{display:flex;align-items:center;gap:.4375rem;padding:.3125rem .5rem;border-radius:.3125rem;font-size:.8125rem;cursor:pointer}' +
      '.gt-opt:hover{background:var(--accent)}' +
      '.gt-opt.is-on{background:var(--accent);font-weight:500}' +
      '.gt-opt.is-disabled{opacity:.4;cursor:not-allowed}' +
      '.gt-opt-dot{width:.5rem;height:.5rem;border-radius:9999px;border:1px solid var(--muted-foreground);flex-shrink:0}' +
      '.gt-opt.is-on .gt-opt-dot{border:2px solid var(--primary)}' +
      '.gt-opt-name{display:inline-flex;align-items:center;gap:.25rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.gt-opt-ic{display:inline-flex}' +
      '.gt-opt-ic svg{width:.8125rem;height:.8125rem}' +
      '.gt-btn{height:1.875rem;padding:0 .875rem;border-radius:.4375rem;font-size:.8125rem;font-weight:500;border:1px solid var(--border);background:var(--background);color:inherit;cursor:pointer}' +
      '.gt-btn:hover{opacity:.85}' +
      '.gt-btn-primary{background:var(--primary);color:var(--primary-foreground);border-color:transparent}' +
      '.gt-btn-ghost{border-color:transparent;background:transparent;color:var(--muted-foreground)}' +
      '.gt-btn-danger{background:var(--destructive);color:var(--primary-foreground);border-color:transparent}' +
      /* 图标页签 */
      '.gt-tabs{display:flex;gap:.25rem;border-bottom:1px solid var(--border);padding-bottom:.375rem}' +
      '.gt-tab{flex:1;height:1.75rem;border:0;border-radius:.375rem;background:transparent;color:var(--muted-foreground);font-size:.8125rem;cursor:pointer}' +
      '.gt-tab.is-on{background:var(--accent);color:var(--foreground);font-weight:500}' +
      '.gt-icpanel{display:flex;flex-direction:column;gap:.4375rem}' +
      '.gt-icgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(1.875rem,1fr));gap:.25rem;max-height:13rem;overflow-y:auto;padding:.125rem}' +
      '.gt-icbtn{display:inline-flex;align-items:center;justify-content:center;aspect-ratio:1;border:1px solid var(--border);border-radius:.375rem;background:var(--background);color:inherit;cursor:pointer;padding:0}' +
      '.gt-icbtn:hover{border-color:var(--ring);background:var(--accent)}' +
      '.gt-icbtn svg{width:1rem;height:1rem}' +
      '.gt-icbtn.is-emoji{font-size:1.0625rem;aspect-ratio:auto;height:1.875rem}' +
      '.gt-emojirow{display:flex;gap:.375rem}' +
      '.gt-emojirow .gt-input{flex:1;min-width:0}' +
      '.gt-colorwrap{display:flex;justify-content:center;padding:.125rem 0}' +
      /* 深色主题微调 */
      '.dark .gt-row:hover,.dark .gt-row.is-active{background:color-mix(in oklab,var(--accent) 55%,transparent)}' +
      '.dark .gt-opt:hover,.dark .gt-opt.is-on{background:color-mix(in oklab,var(--accent) 55%,transparent)}' +
      '.dark .gt-count{background:color-mix(in oklab,var(--muted) 40%,transparent)}';
    document.head.appendChild(style);
  }
  injectStyles();

  window.App = window.App || {};
  App.ui = App.ui || {};
  App.ui.groupTree = {
    create: create,
    descendants: descendants,
    isDescendant: isDescendant,
    treeChildren: treeChildren,
    resolveDrop: resolveDrop,
    moveNode: moveNode,
  };
})();
