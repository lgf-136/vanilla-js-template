/* ============================================================
 * sp-account.js — 账号（语言下拉 + 自定义日历生日选择；本页专属事件委托一并收拢于此）
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

  /* ---------- 账号 ---------- */
  var ACCOUNT_LANGUAGES = [
    { label: 'English', value: 'en' },
    { label: 'French', value: 'fr' },
    { label: 'German', value: 'de' },
    { label: 'Spanish', value: 'es' },
    { label: 'Portuguese', value: 'pt' },
    { label: 'Russian', value: 'ru' },
    { label: 'Japanese', value: 'ja' },
    { label: 'Korean', value: 'ko' },
    { label: 'Chinese', value: 'zh' },
  ];

  /** 自定义下拉(替代原生 <select>,复用 [data-dropdown] 弹层机制,样式类 shadcn Select) */
  function languageSelectHtml(t, value) {
    var selected = null;
    for (var i = 0; i < ACCOUNT_LANGUAGES.length; i++) {
      if (ACCOUNT_LANGUAGES[i].value === value) {
        selected = ACCOUNT_LANGUAGES[i];
        break;
      }
    }
    var options = ACCOUNT_LANGUAGES.map(function (l) {
      var active = l.value === value;
      return (
        '<button type="button" role="option" aria-selected="' +
        active +
        '" data-select-option data-setting="account.language" data-value="' +
        l.value +
        '" class="' +
        App.ui.dropdownItemClass(active ? ' bg-accent text-accent-foreground' : '') +
        '">' +
        '<span class="flex-1 text-left">' +
        l.label +
        '</span>' +
        (active ? icon().iconSvg('check', { class: 'size-4' }) : '') +
        '</button>'
      );
    }).join('');
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger class="sp-select-trigger" aria-haspopup="listbox">' +
      '<span class="sp-select-label">' +
      (selected ? selected.label : t('account.language.selectPlaceholder')) +
      '</span>' +
      '<svg class="sp-select-chevron" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>' +
      '</button>' +
      '<div role="listbox" data-dropdown-menu class="' +
      App.ui.dropdownContentClass('sp-select-menu min-w-48') +
      '">' +
      options +
      '</div>' +
      '</div>'
    );
  }

  /* ---------- 自定义日历(替代原生 input[type=date],样式类 shadcn Calendar) ---------- */
  var calView = null; // { year, month } 当前浏览的年月(0 基)

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function isoToDate(iso) {
    if (!iso) return null;
    var d = new Date(String(iso) + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  function monthTitle(year, month, locale) {
    try {
      return new Date(year, month, 1).toLocaleDateString(locale === 'en' ? 'en-US' : locale, {
        year: 'numeric',
        month: 'long',
      });
    } catch (e) {
      return year + '-' + (month + 1);
    }
  }

  function formatDob(iso, locale) {
    var d = isoToDate(iso);
    if (!d) return '';
    try {
      return d.toLocaleDateString(locale === 'en' ? 'en-US' : locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (e) {
      return iso;
    }
  }

  function calendarInnerHtml(year, month, selected, t, locale) {
    var first = new Date(year, month, 1);
    var startWeekday = first.getDay(); // 0=周日
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var weekdays = String(t('account.dob.weekdays')).split(',');
    var today = todayIso();
    var cells = [];
    for (var w = 0; w < startWeekday; w++) cells.push('<span class="sp-cal-empty"></span>');
    for (var d = 1; d <= daysInMonth; d++) {
      var iso = year + '-' + pad2(month + 1) + '-' + pad2(d);
      var cls =
        'sp-cal-day' +
        (iso === selected ? ' is-selected' : '') +
        (iso === today ? ' is-today' : '');
      cells.push(
        '<button type="button" data-calendar-day data-value="' +
          iso +
          '" class="' +
          cls +
          '">' +
          d +
          '</button>'
      );
    }
    return (
      '<div class="sp-cal-head">' +
      '<button type="button" data-calendar-prev class="sp-cal-nav" aria-label="Previous month">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"></path></svg>' +
      '</button>' +
      '<div class="sp-cal-title">' +
      monthTitle(year, month, locale) +
      '</div>' +
      '<button type="button" data-calendar-next class="sp-cal-nav" aria-label="Next month">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>' +
      '</button>' +
      '</div>' +
      '<div class="sp-cal-weekdays">' +
      weekdays
        .map(function (w) {
          return '<span>' + w + '</span>';
        })
        .join('') +
      '</div>' +
      '<div class="sp-cal-grid">' +
      cells.join('') +
      '</div>' +
      '<button type="button" data-calendar-clear class="sp-cal-clear">' +
      t('account.dob.clear') +
      '</button>'
    );
  }

  function initCalView(iso) {
    var d = isoToDate(iso) || new Date();
    calView = { year: d.getFullYear(), month: d.getMonth() };
  }

  function rerenderCalendar(t, locale) {
    var root = document.querySelector('[data-cal-root]');
    if (!root || !calView) return;
    var selected = App.getShellContext().settings.account.dob;
    root.innerHTML = calendarInnerHtml(calView.year, calView.month, selected, t, locale);
  }

  /** 自定义日期触发器 + 日历弹层(替代原生 date 输入,复用 [data-dropdown] 机制) */
  function datePickerHtml(t, ac, locale) {
    initCalView(ac.dob);
    var shown = formatDob(ac.dob, locale);
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger class="sp-select-trigger" aria-haspopup="dialog">' +
      '<span class="sp-select-label' +
      (shown ? '' : ' sp-select-placeholder') +
      '">' +
      (shown || t('account.dob.placeholder')) +
      '</span>' +
      '<svg class="sp-select-chevron" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path></svg>' +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('sp-cal-pop min-w-64') +
      '">' +
      '<div data-cal-root data-year="' +
      calView.year +
      '" data-month="' +
      calView.month +
      '">' +
      calendarInnerHtml(calView.year, calView.month, ac.dob, t, locale) +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function pageAccount(ctx) {
    var t = ctx.t;
    var ac = ctx.settings.account || {};
    var body =
      '<form class="sp-form">' +
      '<div class="sp-field">' +
      '<label class="sp-label">' +
      t('account.name.label') +
      '</label>' +
      '<input class="' + App.ui.inputClass() + '" type="text" data-setting="account.name" value="' +
      escAttr(ac.name) +
      '" placeholder="' +
      t('account.name.placeholder') +
      '" />' +
      '<p class="sp-field-desc">' +
      t('account.name.description') +
      '</p>' +
      '</div>' +
      '<div class="sp-field">' +
      '<label class="sp-label">' +
      t('account.dob.label') +
      '</label>' +
      datePickerHtml(t, ac, ctx.settings.locale) +
      '<p class="sp-field-desc">' +
      t('account.dob.description') +
      '</p>' +
      '</div>' +
      '<div class="sp-field">' +
      '<label class="sp-label">' +
      t('account.language.label') +
      '</label>' +
      languageSelectHtml(t, ac.language) +
      '<p class="sp-field-desc">' +
      t('account.language.description') +
      '</p>' +
      '</div>' +
      '<button type="button" data-slot="button" class="' +
      App.ui.buttonClass('default') +
      '">' +
      t('account.submit') +
      '</button>' +
      '</form>';
    return contentSection(t, 'account.title', 'account.description', body);
  }

  /* ---------- 外观(mpages radio-group 风格):卡片统一用 App.ui.radio(样式 app.css .rg-*) ---------- */

  /* ---------- 自定义控件事件委托（下拉选项 / 日历翻页与选日，仅本页使用） ----------
   * 与核心层约定:真实 input 的 change/input 由 app.js 处理;纯按钮类自定义控件在此处理,
   * 写值统一走 App.applySettingValue。
   */
  /* ---------- 自定义控件事件委托(下拉选项 / 日历翻页与选日) ----------
   * 与核心层约定:真实 input 的 change/input 由 app.js 处理;纯按钮类自定义
   * 控件(下拉选项、日历日)在此处理,写值统一走 App.applySettingValue。
   */
  function moduleT() {
    var locale = App.getShellContext().settings.locale;
    return App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.settings);
  }

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;

    var opt = target.closest('[data-select-option]');
    if (opt) {
      App.applySettingValue(
        opt.getAttribute('data-setting'),
        opt.getAttribute('data-value'),
        false
      );
      return;
    }
    var calDay = target.closest('[data-calendar-day]');
    if (calDay) {
      App.applySettingValue('account.dob', calDay.getAttribute('data-value'), false);
      return;
    }
    var calClear = target.closest('[data-calendar-clear]');
    if (calClear) {
      App.applySettingValue('account.dob', '', false);
      return;
    }
    if (target.closest('[data-calendar-prev]') || target.closest('[data-calendar-next]')) {
      var delta = target.closest('[data-calendar-prev]') ? -1 : 1;
      if (calView) {
        calView.month += delta;
        if (calView.month < 0) {
          calView.month = 11;
          calView.year--;
        } else if (calView.month > 11) {
          calView.month = 0;
          calView.year++;
        }
        var t = moduleT();
        rerenderCalendar(t, App.getShellContext().settings.locale);
      }
      return;
    }
  });

export { pageAccount };
