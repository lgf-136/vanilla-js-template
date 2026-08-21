/* ============================================================
 * menu.js — 标签右键/⋯ 菜单（自 index.js 拆出，红线 12）
 * ------------------------------------------------------------
 * 职责（拆分设计总览见 index.js 头注）：
 *   - tagMenuItemsHtml：菜单项 HTML（重命名 / 改色 / 删除，
 *     复用公共 App.ui.contextMenu 的 item/separator）
 *   - 浮层生命周期：showCtx 打开 body 级 fixed 浮层（右键坐标或
 *     ⋯ 按钮锚定）、hideCtx 收起、toggleCtx 同一按钮再点收起；
 *     ctxPopup / ctxTrigger 为本文件私有单例（全组件唯一一份）
 * 触发入口（contextmenu / click 委托）在 events.js；Esc 关闭由
 * popover.js 的全局 keydown 调 hideCtx。浮层挂在 body 下（不在
 * [data-tp] 内），实例引用经 ctxPopup._tpInst 供委托解析。
 * ============================================================ */
'use strict';

import { escAttr } from './model.js';

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

  /* ---------- 右键/⋯ 菜单浮层(公共 App.ui.contextMenu,body 级 fixed) ---------- */
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
  /** ⋯ 按钮:同一按钮再次点击收起,否则锚定按钮打开(与右键同款浮层) */
  function toggleCtx(inst, tag, anchorEl) {
    if (ctxPopup && ctxTrigger === anchorEl) hideCtx();
    else showCtx(inst, tag, 0, 0, anchorEl);
  }

export { hideCtx, showCtx, toggleCtx };
