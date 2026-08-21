/* ============================================================
 * sp-appearance.js — 外观（mpages radio-group 风格卡片，卡片统一用 App.ui.radio）
 * ------------------------------------------------------------
 * 设置项独立文件（一设置项一文件，见 index.js 拆分设计说明）。
 * ============================================================ */
'use strict';

import { contentSection } from './sp-common.js';

  var S = function () {
    return App.settings;
  };
  var icon = function () {
    return App.icon;
  };
  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;
  var escAttr = App.escape.escAttr;
  var escHtml = App.escape.escHtml;

  function optSection(t, titleKey, inner) {
    return '<div class="sp-opt-group">' + App.ui.radio.sectionTitle(t(titleKey)) + inner + '</div>';
  }

  function pageAppearance(ctx) {
    var t = ctx.t;
    var s = ctx.settings;
    var ap = s.appearance;
    var st = S();
    var radio = App.ui.radio;

    var layout =
      s.sidebarVariant === 'inset'
        ? 'default'
        : s.sidebarCollapsible === 'offcanvas'
          ? 'offcanvas'
          : 'icon';
    var themeItems = st.THEME_ITEMS;
    var sidebarItems = st.SIDEBAR_ITEMS;
    var layoutItems = st.LAYOUT_ITEMS;

    var body =
      '<div class="sp-form">' +
      optSection(
        t,
        'settings.theme',
        '<div class="' +
          radio.gridClass(3) +
          '">' +
          themeItems
            .map(function (it) {
              return radio.iconCard(
                it.icon,
                t(it.labelKey),
                s.theme === it.value,
                true,
                'theme:' + it.value
              );
            })
            .join('') +
          '</div>'
      ) +
      optSection(
        t,
        'settings.sidebar',
        '<div class="' +
          radio.gridClass(3) +
          '">' +
          sidebarItems
            .map(function (it) {
              return radio.iconCard(
                it.icon,
                t(it.labelKey),
                s.sidebarVariant === it.value,
                false,
                'sidebar:' + it.value
              );
            })
            .join('') +
          '</div>'
      ) +
      optSection(
        t,
        'settings.layout',
        '<div class="' +
          radio.gridClass(3) +
          '">' +
          layoutItems
            .map(function (it) {
              return radio.iconCard(
                it.icon,
                t(it.labelKey),
                layout === it.value,
                false,
                'layout:' + it.value
              );
            })
            .join('') +
          '</div>'
      ) +
      '<div class="sp-opt-group">' +
      radio.sectionTitleToggle(
        t('settings.baseColor'),
        ap.useBase !== false,
        'base',
        t('settings.useBase')
      ) +
      radio.swatchPicker(ap.baseColor, st.BASE_COLORS, 7, 'base') +
      '</div>' +
      '<div class="sp-opt-group">' +
      radio.sectionTitleToggle(
        t('settings.chartColor'),
        ap.useAccent !== false,
        'chart',
        t('settings.useAccent')
      ) +
      radio.swatchPicker(ap.chartColor, [ap.baseColor].concat(st.CHART_COLORS), 6, 'chart') +
      '</div>' +
      optSection(
        t,
        'settings.style',
        radio.segmented(
          st.STYLES.map(function (v) {
            return { value: v, label: v };
          }),
          ap.style,
          4,
          'style'
        )
      ) +
      optSection(
        t,
        'settings.bodyFont',
        radio.segmented(
          st.FONTS.map(function (f) {
            return { value: f.value, label: f.label };
          }),
          ap.bodyFont,
          3,
          'body-font'
        )
      ) +
      optSection(
        t,
        'settings.headingFont',
        radio.segmented(
          st.FONTS.map(function (f) {
            return { value: f.value, label: f.label };
          }),
          ap.headingFont,
          3,
          'heading-font'
        )
      ) +
      radio.readonlyRow(t('settings.iconLibrary'), t('settings.lucide')) +
      optSection(
        t,
        'settings.radius',
        radio.segmented(
          st.RADII.map(function (r) {
            return { value: r.value, label: t(r.labelKey) };
          }),
          ap.radius,
          3,
          'radius'
        )
      ) +
      optSection(
        t,
        'settings.menuColor',
        radio.segmented(
          [
            { value: 'default', label: t('settings.menuColorOptions.default') },
            { value: 'inverted', label: t('settings.menuColorOptions.inverted') },
          ],
          ap.menuColor,
          2,
          'menu-color'
        )
      ) +
      optSection(
        t,
        'settings.menuAppearance',
        radio.segmented(
          [
            { value: 'solid', label: t('settings.menuAppearanceOptions.solid') },
            { value: 'translucent', label: t('settings.menuAppearanceOptions.translucent') },
          ],
          ap.menuAppearance,
          2,
          'menu-appearance'
        )
      ) +
      radio.readonlyRow(t('settings.menuAccent'), t('settings.subtle')) +
      '<button type="button" data-reset-appearance data-slot="button" class="' +
      App.ui.buttonClass('destructive') +
      '">' +
      t('appearance.reset') +
      '</button>' +
      '</div>';
    return contentSection(t, 'appearance.title', 'appearance.description', body);
  }

export { pageAppearance };
