/* ============================================================
 * chat-popover.js — chats 模块·fixed 定位浮层(下拉/弹层共用)
 * ------------------------------------------------------------
 * 需求:右栏内部下拉用 fixed 定位避免被 overflow 裁剪;视口边缘
 * 自动翻转(下方空间不足时向上展开)。
 * 单例:同一时刻只允许一个浮层(互斥关闭)。
 *   openPopover(anchorEl, html, opts) → popup 元素
 *     opts: { className, width, flip } 
 *   closePopover() 关闭当前浮层(幂等)
 * 点击浮层外关闭由 chat-events 委托处理(data-ch-pop 作用域)。
 * ============================================================ */
'use strict';

export var popoverEl = null;

export function openPopover(anchorEl, html, opts) {
  closePopover();
  var o = opts || {};
  var pop = document.createElement('div');
  pop.className = 'ch-pop' + (o.className ? ' ' + o.className : '');
  pop.setAttribute('data-ch-pop', '');
  if (o.width) pop.style.width = o.width;
  pop.innerHTML = html;
  document.body.appendChild(pop);
  positionPopover(pop, anchorEl, o);
  popoverEl = pop;
  return pop;
}

function positionPopover(pop, anchorEl, o) {
  var w = pop.offsetWidth || 240;
  var h = pop.offsetHeight || 200;
  var rect = anchorEl.getBoundingClientRect();
  var spaceBelow = window.innerHeight - rect.bottom;
  var spaceAbove = rect.top;
  var left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
  var top;
  var flip = o.flip !== false;
  if (flip && spaceBelow < h && spaceAbove > h) {
    top = Math.max(8, rect.top - h - 6);
    pop.classList.add('ch-pop-up');
  } else {
    top = Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - h - 8));
  }
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}

export function closePopover() {
  if (popoverEl && popoverEl.parentNode) popoverEl.parentNode.removeChild(popoverEl);
  popoverEl = null;
}

export function isPopoverOpen() {
  return !!popoverEl;
}
