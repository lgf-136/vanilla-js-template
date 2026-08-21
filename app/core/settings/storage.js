/* ============================================================
 * settings/storage.js — 本地存储 IO 层(零依赖)
 * ------------------------------------------------------------
 * settings 目录拆分设计见 index.js 头部;本文件为最底层:
 * - 存储键前缀 html-template-(独立命名空间)与 K() 拼键规则
 * - localStorage 读/写/删(全部 try/catch,隐私模式等异常静默)
 * - readJsonObject:JSON 对象读取 + 白名单形状校验
 *   (对象则合并默认,数组字段按 listKeys 过滤非字符串项)
 * 不依赖本目录其它文件。
 * ============================================================ */
'use strict';

/** 存储键前缀(独立命名空间) */
var STORAGE_PREFIX = 'html-template';
var K = function (key) {
  return STORAGE_PREFIX + '-' + key;
};

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    /* ignore */
  }
}

function removeStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (e) {
    /* ignore */
  }
}

/** 读取 JSON 存储值(白名单形状校验:对象则合并默认,数组/字符串按类型) */
function readJsonObject(key, defaults, listKeys) {
  var stored = readStorage(K(key));
  if (!stored) return Object.assign({}, defaults);
  try {
    var parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return Object.assign({}, defaults);
    var out = Object.assign({}, defaults, parsed);
    if (listKeys) {
      listKeys.forEach(function (lk) {
        if (!Array.isArray(out[lk])) out[lk] = defaults[lk].slice();
        else
          out[lk] = out[lk].filter(function (x) {
            return typeof x === 'string';
          });
      });
    }
    return out;
  } catch (e) {
    return Object.assign({}, defaults);
  }
}

export { STORAGE_PREFIX, K, readStorage, writeStorage, removeStorage, readJsonObject };
