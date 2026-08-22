/* ============================================================
 * chat-view.js — chats 模块·视图控制层(重绘唯一入口)
 * ------------------------------------------------------------
 * 渲染函数(painters)由 index.js 装配期注入,本模块不静态依赖
 * 渲染域文件,打破「动作层 → 重绘 → 渲染层」双向耦合。
 *   renderFull()      整页重绘(三栏)
 *   rerenderLeft()    仅左栏
 *   rerenderCenter()  仅中栏(保留输入框焦点:重绘后恢复)
 *   rerenderRight()   仅右栏
 *   rerenderHeader()  仅中栏顶栏(标题/停止按钮/参数开关)
 * ============================================================ */
'use strict';

var painters = {};

export function registerPainters(p) {
  Object.assign(painters, p);
}

/** 整页重绘 */
export function renderFull() {
  var area = document.querySelector('[data-content-area]');
  if (!area || !painters.page) return;
  area.innerHTML = painters.page();
}

/** 仅左栏(搜索输入时避免抢焦点) */
export function rerenderLeft() {
  var el = document.querySelector('[data-ch-left]');
  if (el && painters.left) el.innerHTML = painters.left();
}

/** 仅中栏(恢复输入框焦点与光标) */
export function rerenderCenter() {
  var el = document.querySelector('[data-ch-center]');
  if (!el || !painters.center) return;
  var inp = el.querySelector('[data-ch-input]');
  var caret = inp ? inp.selectionStart : -1;
  el.innerHTML = painters.center();
  if (caret >= 0) {
    var next = el.querySelector('[data-ch-input]');
    if (next) {
      next.focus();
      try {
        next.setSelectionRange(Math.min(caret, next.value.length), Math.min(caret, next.value.length));
      } catch (e) {
        /* noop */
      }
    }
  }
}

/** 仅右栏 */
export function rerenderRight() {
  var el = document.querySelector('[data-ch-right]');
  if (el && painters.right) el.innerHTML = painters.right();
}

/** 仅中栏顶栏 */
export function rerenderHeader() {
  var el = document.querySelector('[data-ch-header]');
  if (el && painters.header) el.innerHTML = painters.header();
}

export { };
