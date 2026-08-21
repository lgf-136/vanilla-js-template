/* ============================================================
 * menu.js — 分组树·右键 / 行尾 ⋯ 菜单（自 index.js 拆出）
 * ------------------------------------------------------------
 * 职责：ctxItemsHtml 菜单项 HTML（⋯ 浮层 / 右键浮层共用，body 级
 *       按需渲染），showCtxMenu / hideCtxMenu 浮层生命周期
 *       （公共 App.ui.contextMenu，body 级 fixed），以及 ⋯ 按钮
 *       toggleMoreMenu（同一按钮再次点击收起）。
 *       浮层挂在 body 下（不在 [data-gt-tree] 内），实例引用挂在
 *       浮层元素上供 document 级委托解析。
 * 依赖：App.ui.contextMenu、App.escape（运行时全局）。
 * ============================================================ */
'use strict';

  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;

  function ctxItemsHtml(inst, id) {
    var L = inst.labels();
    function item(act, label, iconName, danger) {
      return App.ui.contextMenu.item(iconName, label, {
        attrs: 'data-gt-ctx="' + act + '" data-id="' + esc(id) + '"',
        danger: !!danger,
      });
    }
    return (
      item('newchild', L.newChild || '', 'plus') +
      item('newsibling', L.newSibling || '', 'circle-plus') +
      item('rename', L.rename || '', 'pencil') +
      item('move', L.moveTo || '', 'arrow-right') +
      App.ui.contextMenu.separator() +
      item('icon', L.icon || '', 'image-plus') +
      item('color', L.color || '', 'palette') +
      App.ui.contextMenu.separator() +
      item('del', L.delete || '', 'trash-2', true)
    );
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
  /** ⋯ 按钮：同一按钮再次点击收起，否则锚定按钮下方打开(修复被侧栏遮挡) */
  function toggleMoreMenu(inst, id, anchorEl) {
    if (ctxPopup && ctxTrigger === anchorEl) hideCtxMenu();
    else showCtxMenu(inst, id, 0, 0, anchorEl);
  }

export { ctxItemsHtml, showCtxMenu, hideCtxMenu, toggleMoreMenu };
