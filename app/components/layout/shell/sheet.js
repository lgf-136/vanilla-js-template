/* ============================================================
 * shell/sheet.js — 设置 Sheet（渲染 + 原位重绘含滚动位置保持）
 * ------------------------------------------------------------
 * Shell 拆分（C5）：装配与对外挂载 App.shell 见 index.js。
 * ============================================================ */
'use strict';


  var ui = function () {
    return App.ui;
  };
  var icon = function () {
    return App.icon;
  };

  function renderSettingsSheet(s, t) {
    var settings = App.settings;
    var radio = App.ui.radio;
    var layout =
      s.sidebarVariant === 'inset'
        ? 'default'
        : s.sidebarCollapsible === 'offcanvas'
          ? 'offcanvas'
          : 'icon';
    var themeItems = App.settings.THEME_ITEMS;
    var sidebarItems = App.settings.SIDEBAR_ITEMS;
    var layoutItems = App.settings.LAYOUT_ITEMS;

    return (
      '<div data-settings-sheet role="dialog" aria-modal="true" class="fixed inset-y-0 right-0 z-50 flex h-full w-3/4 flex-col gap-4 border-l bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg sm:max-w-sm">' +
      '<div class="pb-0 pl-4 pr-4 pt-4 text-start">' +
      '<h2 class="font-heading text-lg font-semibold leading-snug">' +
      t('settings.title') +
      '</h2>' +
      '<p class="text-sm text-muted-foreground">' +
      t('settings.description') +
      '</p>' +
      '<button type="button" data-sheet-close data-slot="button" class="absolute top-3 right-3 ' +
      ui().buttonClass('ghost', 'icon-sm', 'size-7 rounded-lg') +
      '" aria-label="' +
      t('settings.close') +
      '">' +
      icon().iconSvg('x', { class: 'size-4' }) +
      '</button>' +
      '</div>' +
      '<div data-sheet-scroll class="min-h-0 flex-1 overflow-y-auto">' +
      '<div class="space-y-6 p-4">' +
      '<div>' +
      radio.sectionTitle(t('settings.theme')) +
      '<div class="' +
      radio.gridClass(3) +
      '">' +
      themeItems
        .map(function (item) {
          return radio.iconCard(
            item.icon,
            t(item.labelKey),
            s.theme === item.value,
            true,
            'theme:' + item.value
          );
        })
        .join('') +
      '</div></div>' +
      '<div class="max-md:hidden">' +
      radio.sectionTitle(t('settings.sidebar')) +
      '<div class="' +
      radio.gridClass(3) +
      '">' +
      sidebarItems
        .map(function (item) {
          return radio.iconCard(
            item.icon,
            t(item.labelKey),
            s.sidebarVariant === item.value,
            false,
            'sidebar:' + item.value
          );
        })
        .join('') +
      '</div></div>' +
      '<div class="max-md:hidden">' +
      radio.sectionTitle(t('settings.layout')) +
      '<div class="' +
      radio.gridClass(3) +
      '">' +
      layoutItems
        .map(function (item) {
          return radio.iconCard(
            item.icon,
            t(item.labelKey),
            layout === item.value,
            false,
            'layout:' + item.value
          );
        })
        .join('') +
      '</div></div>' +
      '<div>' +
      radio.sectionTitleToggle(
        t('settings.baseColor'),
        s.appearance.useBase !== false,
        'base',
        t('settings.useBase')
      ) +
      '<div>' +
      radio.swatchPicker(s.appearance.baseColor, settings.BASE_COLORS, 7, 'base') +
      '</div></div>' +
      '<div>' +
      radio.sectionTitleToggle(
        t('settings.chartColor'),
        s.appearance.useAccent !== false,
        'chart',
        t('settings.useAccent')
      ) +
      '<div>' +
      radio.swatchPicker(
        s.appearance.chartColor,
        [s.appearance.baseColor].concat(settings.CHART_COLORS),
        6,
        'chart'
      ) +
      '</div></div>' +
      '<div>' +
      radio.sectionTitle(t('settings.style')) +
      '<div>' +
      radio.segmented(
        settings.STYLES.map(function (st) {
          return { value: st, label: st };
        }),
        s.appearance.style,
        4,
        'style'
      ) +
      '</div></div>' +
      '<div>' +
      radio.sectionTitle(t('settings.bodyFont')) +
      '<div>' +
      radio.segmented(
        settings.FONTS.map(function (f) {
          return { value: f.value, label: f.label };
        }),
        s.appearance.bodyFont,
        3,
        'body-font'
      ) +
      '</div></div>' +
      '<div>' +
      radio.sectionTitle(t('settings.headingFont')) +
      '<div>' +
      radio.segmented(
        settings.FONTS.map(function (f) {
          return { value: f.value, label: f.label };
        }),
        s.appearance.headingFont,
        3,
        'heading-font'
      ) +
      '</div></div>' +
      radio.readonlyRow(t('settings.iconLibrary'), t('settings.lucide')) +
      '<div>' +
      radio.sectionTitle(t('settings.radius')) +
      '<div>' +
      radio.segmented(
        settings.RADII.map(function (r) {
          return { value: r.value, label: t(r.labelKey) };
        }),
        s.appearance.radius,
        3,
        'radius'
      ) +
      '</div></div>' +
      '<div>' +
      radio.sectionTitle(t('settings.menuColor')) +
      '<div>' +
      radio.segmented(
        [
          { value: 'default', label: t('settings.menuColorOptions.default') },
          { value: 'inverted', label: t('settings.menuColorOptions.inverted') },
        ],
        s.appearance.menuColor,
        2,
        'menu-color'
      ) +
      '</div></div>' +
      '<div>' +
      radio.sectionTitle(t('settings.menuAppearance')) +
      '<div>' +
      radio.segmented(
        [
          { value: 'solid', label: t('settings.menuAppearanceOptions.solid') },
          { value: 'translucent', label: t('settings.menuAppearanceOptions.translucent') },
        ],
        s.appearance.menuAppearance,
        2,
        'menu-appearance'
      ) +
      '</div></div>' +
      radio.readonlyRow(t('settings.menuAccent'), t('settings.subtle')) +
      '</div></div>' +
      '<div class="border-t p-4">' +
      '<button type="button" data-reset-settings data-slot="button" class="w-full ' +
      ui().buttonClass('destructive') +
      '">' +
      icon().iconSvg('rotate-ccw', { class: 'size-4' }) +
      t('settings.resetAll') +
      '</button></div></div>'
    );
  }

  /** 设置变更后重建设置面板(保留滚动位置) */
  function rerenderSheetContent(s, t) {
    var sheet = document.querySelector('[data-settings-sheet]');
    if (!sheet) return;
    var scrollEl = sheet.querySelector('[data-sheet-scroll]');
    var scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    var shell = document.createElement('div');
    shell.innerHTML = renderSettingsSheet(s, t);
    var fresh = shell.firstElementChild;
    sheet.replaceWith(fresh);
    var newScroll = document.querySelector('[data-settings-sheet] [data-sheet-scroll]');
    if (newScroll) newScroll.scrollTop = scrollTop;
  }

export {  };
