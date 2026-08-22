/* ============================================================
 * chat-rag.js — chats 模块·可选端侧 RAG(基于 ai-stream-kit)
 * ------------------------------------------------------------
 * 技能携带 knowledgeDocs 时,用 ai-stream-kit 的 EmbeddingManager
 * (Transformers.js v4 + WebGPU → WASM 降级)本地分块向量化,
 * 检索 Top-K 拼入上下文后发送。
 *
 * 优雅降级:模型/Worker 加载失败、设备不支持或超时 → 仅用系统
 * 提示词、不带检索上下文,不阻塞对话(返回 null)。
 * 实现要点:
 *   - 单例 EmbeddingManager + 10s 初始化超时
 *   - chunkText 分块 → processDocument → retrieve
 *   - 同一技能文档向量缓存(会话内 Map)
 * ============================================================ */
'use strict';

import { EmbeddingManager, chunkText, cosineSimilarity, VectorStore } from '../../lib/ai-stream-kit/index.js';

var manager = null;
var storeCache = new Map(); // docKey -> Promise<VectorStore|null>
var initPromise = null;
var initFailed = false;

/** 初始化 EmbeddingManager(单例,失败置 initFailed 永久降级) */
function ensureManager() {
  if (initFailed) return Promise.resolve(null);
  if (initPromise) return initPromise;
  initPromise = new Promise(function (resolve) {
    try {
      manager = new EmbeddingManager({ device: 'auto' });
      // 10 秒超时:模型下载/加载过慢时直接降级
      var timer = setTimeout(function () {
        initFailed = true;
        resolve(null);
      }, 10000);
      manager
        .init()
        .then(function () {
          clearTimeout(timer);
          resolve(manager);
        })
        .catch(function () {
          clearTimeout(timer);
          initFailed = true;
          resolve(null);
        });
    } catch (e) {
      initFailed = true;
      resolve(null);
    }
  });
  return initPromise;
}

/**
 * 检索知识文档 Top-K 分块。
 * @param {string} doc 文档全文
 * @param {string} query 查询文本
 * @param {number} topK
 * @returns {Promise<Array<{text, score}>|null>} 失败返回 null
 */
export async function retrieveKnowledge(doc, query, topK) {
  try {
    if (!doc || !query) return null;
    var mgr = await ensureManager();
    if (!mgr || !mgr.isReady) return null;
    var key = hash(doc);
    var task = storeCache.get(key);
    if (!task) {
      task = mgr.processDocument(doc).catch(function () {
        return null;
      });
      storeCache.set(key, task);
    }
    var store = await task;
    if (!store) return null;
    var results = await mgr.retrieve(query.slice(0, 500), store, topK || 3);
    if (!Array.isArray(results) || !results.length) return null;
    return results.map(function (r) {
      return { text: r.text || '', score: r.score || 0 };
    });
  } catch (e) {
    // 优雅降级:任何失败不阻塞对话
    return null;
  }
}

/** 简单文档指纹(避免超长 key) */
function hash(text) {
  var h = 0;
  var s = String(text || '');
  for (var i = 0; i < s.length && i < 4000; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return 'd' + h.toString(36);
}

export { chunkText, cosineSimilarity, VectorStore };
