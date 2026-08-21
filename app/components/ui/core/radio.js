/* ============================================================
 * radio.js — 单选卡片族（ui.js ESM 拆分，拆分设计总览见 ../index.js 头注）
 * ------------------------------------------------------------
 * 职责：设置面板与外观页共用的 radio-group 卡片渲染
 *       （rg-grid 栅格 / 区块标题(可带启用开关) / 对勾徽标 /
 *       图标卡 / 色板卡 / 文本卡 / 只读信息行，样式见 app.css .rg-*）。
 * 纯字符串函数无副作用、无内部依赖（运行期消费 App.icon）；
 * 对外挂载统一由 core/index.js 完成。
 * ============================================================ */
'use strict';

  // ---------- Radio-group 卡片(设置面板与外观页共用,样式见 app.css .rg-*) ----------
  var RG_GRID_COLS = {
    2: 'rg-cols-2',
    3: 'rg-cols-3',
    4: 'rg-cols-4',
    6: 'rg-cols-6',
    7: 'rg-cols-7',
  };
  function rgGridClass(cols) {
    return 'rg-grid ' + (RG_GRID_COLS[cols] || 'rg-cols-3');
  }
  function radioSectionTitle(label) {
    return '<div class="rg-section-title"><span>' + label + '</span></div>';
  }
  /** 带启用开关的标题行(基础色/强调色):开关在标题同一行右侧,kind ∈ base|chart */
  function radioSectionTitleToggle(label, checked, kind, ariaLabel) {
    return (
      '<div class="rg-section-title">' +
      '<span>' +
      label +
      '</span>' +
      '<button type="button" role="switch" aria-checked="' +
      (checked ? 'true' : 'false') +
      '" aria-label="' +
      (ariaLabel || label) +
      '" data-theme-toggle="' +
      kind +
      '" class="ui-switch ms-auto' +
      (checked ? ' is-on' : '') +
      '"></button>' +
      '</div>'
    );
  }
  function radioCheck(selected) {
    return selected
      ? '<span class="rg-opt-check">' + App.icon.iconSvg('circle-check') + '</span>'
      : '';
  }
  /** 图标预览卡(主题/侧边栏/布局):选中描边 ring-primary + 阴影 + 对勾徽标 */
  function radioIconCard(iconName, label, selected, isTheme, extra) {
    var fill = isTheme
      ? ''
      : selected
        ? 'fill-primary stroke-primary'
        : 'fill-muted-foreground stroke-muted-foreground';
    return (
      '<button type="button" data-settings-card="' +
      extra +
      '" aria-pressed="' +
      selected +
      '" class="rg-opt' +
      (selected ? ' is-active' : '') +
      '">' +
      '<span class="rg-opt-frame">' +
      radioCheck(selected) +
      App.icon.previewIcon(iconName, fill) +
      '</span>' +
      '<span class="rg-opt-label">' +
      label +
      '</span>' +
      '</button>'
    );
  }
  /** 色板卡(基础色/强调色):bordered 卡片 + 对勾徽标 */
  function radioSwatchPicker(current, options, cols, kind) {
    return (
      '<div class="' +
      rgGridClass(cols) +
      '">' +
      options
        .map(function (c) {
          var sel = current === c;
          return (
            '<button type="button" data-swatch="' +
            kind +
            '" data-value="' +
            c +
            '" aria-pressed="' +
            sel +
            '" class="rg-opt' +
            (sel ? ' is-active' : '') +
            '">' +
            '<span class="rg-opt-swatch">' +
            radioCheck(sel) +
            '<span class="rg-opt-dot swatch-' +
            c +
            '"></span>' +
            '<span class="rg-opt-swatch-label">' +
            c +
            '</span>' +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }
  /** 文本卡(风格/字体/圆角/菜单):h-14 描边卡片 + 对勾徽标 */
  function radioSegmented(options, current, cols, kind) {
    return (
      '<div class="' +
      rgGridClass(cols) +
      '">' +
      options
        .map(function (o) {
          var sel = current === o.value;
          return (
            '<button type="button" data-segmented="' +
            kind +
            '" data-value="' +
            o.value +
            '" aria-pressed="' +
            sel +
            '" class="rg-opt' +
            (sel ? ' is-active' : '') +
            '">' +
            '<span class="rg-opt-text">' +
            radioCheck(sel) +
            '<span class="text-sm font-medium">' +
            o.label +
            '</span>' +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }
  /** 只读信息行(图标库/菜单强调色等) */
  function radioReadonlyRow(label, value) {
    return (
      '<div class="flex items-center justify-between">' +
      '<span class="text-sm font-semibold text-muted-foreground">' +
      label +
      '</span>' +
      '<span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">' +
      value +
      '</span>' +
      '</div>'
    );
  }

export {
  rgGridClass,
  radioSectionTitle,
  radioSectionTitleToggle,
  radioCheck,
  radioIconCard,
  radioSwatchPicker,
  radioSegmented,
  radioReadonlyRow,
};
