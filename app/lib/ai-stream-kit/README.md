<div align="center">

# 🚀 AI-Stream-Kit

**Industrial-grade AI Streaming SDK for the Modern Web**

[![npm version](https://img.shields.io/npm/v/ai-stream-kit?style=flat-square&color=667eea)](https://www.npmjs.com/package/ai-stream-kit)
[![tests](https://img.shields.io/badge/tests-168%20passed-4ade80?style=flat-square)](./tests)
[![coverage](https://img.shields.io/badge/coverage-90%25%2B-22d3ee?style=flat-square)](#testing)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript)](./tsconfig.json)
[![license](https://img.shields.io/badge/license-MIT-f093fb?style=flat-square)](./LICENSE)
[![bundle size](https://img.shields.io/badge/core-32KB-f6ad55?style=flat-square)](./dist)

*A zero-dependency, TypeScript-first SDK for building AI-powered streaming interfaces.*  
*Supports SSE reconnection, streaming Markdown rendering, and client-side RAG with WebGPU.*

[English](#features) · [中文文档](#中文文档)

</div>

---

## Features

| Module | Description |
|--------|-------------|
| 🔗 **SSE Client** | High-reliability streaming client with exponential backoff, `Last-Event-ID` resumption, `AbortController`, and event deduplication |
| 📝 **Markdown Renderer** | Stream-safe incremental Markdown renderer with auto-close algorithm for unclosed tags |
| 🧠 **Client-side RAG** | Browser-native document embedding via Transformers.js + WebGPU, with cosine similarity search |
| ⚛️ **React / Vue** | Framework adapters: `useAIStream` Hook (React) and Composable (Vue) |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Main Thread                               │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────────┐  │
│  │  SSE Client  │───▶│  SSE Parser  │───▶│  Stream Renderer     │  │
│  │  (fetch +    │    │  (State      │    │  ┌────────────────┐ │  │
│  │  reconnect)  │    │   Machine)   │    │  │  Auto-Close    │ │  │
│  └─────────────┘    └─────────────┘    │  │  Algorithm     │ │  │
│        │                                │  └────────────────┘ │  │
│        │ AbortController               │  ┌────────────────┐ │  │
│        │                                │  │  RAF Scheduler │ │  │
│        ▼                                │  └────────────────┘ │  │
│  ┌─────────────┐                        └──────────────────────┘  │
│  │   Retry      │                                                 │
│  │  Strategy    │    ┌─────────────┐    ┌──────────────────────┐  │
│  │  (Exp.       │    │  Embedding   │───▶│  Vector Store        │  │
│  │   Backoff)   │    │  Manager     │    │  (In-memory +        │  │
│  └─────────────┘    └──────┬──────┘    │   cosine search)     │  │
│                            │            └──────────────────────┘  │
│                     postMessage                                   │
│                            │                                      │
├────────────────────────────┼──────────────────────────────────────┤
│                            ▼            Worker Thread             │
│                     ┌─────────────┐                               │
│                     │ Transformers │                               │
│                     │ .js v4       │                               │
│                     │ (WebGPU /    │                               │
│                     │  WASM)       │                               │
│                     └─────────────┘                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Installation

```bash
npm install ai-stream-kit
```

### 1. SSE Streaming Client

```typescript
import { createSSEClient } from 'ai-stream-kit';

const controller = new AbortController();

const client = createSSEClient({
  url: '/api/chat/stream',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: '你好，请介绍一下 TypeScript' }),
  signal: controller.signal,

  // Exponential backoff: 1s → 2s → 4s → 8s (with jitter)
  retry: { maxRetries: 5, baseDelay: 1000, jitter: true },

  onMessage(event) {
    const data = JSON.parse(event.data);
    console.log(data.text);
  },

  onError(error) {
    console.error(`Error [${error.statusCode}]: ${error.message}`);
  },
});

// User clicks "Stop Generating"
document.getElementById('stop')!.onclick = () => controller.abort();
```

### 2. Streaming Markdown Renderer

```typescript
import { createSSEClient, StreamMarkdownRenderer } from 'ai-stream-kit';
import { marked } from 'marked'; // Bring your own Markdown engine

const renderer = new StreamMarkdownRenderer({
  markdownToHtml: (md) => marked.parse(md) as string,
  container: document.getElementById('output')!,
  autoScroll: true,
});

createSSEClient({
  url: '/api/chat/stream',
  method: 'POST',
  body: JSON.stringify({ prompt: '写一段 Python 代码' }),
  onMessage(event) {
    // Auto-closes unclosed Markdown tags before rendering!
    // e.g., "```python\ndef foo" → renders as valid code block
    renderer.append(JSON.parse(event.data).text);
  },
});
```

### 3. Auto-Close Algorithm (Standalone)

```typescript
import { autoClose } from 'ai-stream-kit';

autoClose('**bold text');           // → '**bold text**'
autoClose('```js\nconst x = 1');   // → '```js\nconst x = 1\n```'
autoClose('*italic');               // → '*italic*'
autoClose('[link text');            // → '[link text]()'
autoClose('normal text');           // → 'normal text' (unchanged)
```

### 4. Client-side RAG

```typescript
import { EmbeddingManager } from 'ai-stream-kit';

const manager = new EmbeddingManager({
  model: 'Xenova/all-MiniLM-L6-v2',
  device: 'auto', // WebGPU → WASM fallback
  onProgress: (stage, progress) => {
    console.log(`${stage}: ${(progress * 100).toFixed(0)}%`);
  },
});

await manager.init();

// Process a document: chunk → embed → store
const store = await manager.processDocument(longDocumentText, {
  chunkSize: 500,
  overlap: 50,
});

// Retrieve relevant context for AI prompt
const results = await manager.retrieve('What is TypeScript?', store, 3);
const context = results.map(r => r.entry.text).join('\n\n');

// Send enriched prompt to your AI backend
const prompt = `Context:\n${context}\n\nQuestion: What is TypeScript?`;
```

### 5. React Hook

```tsx
import { useAIStream } from 'ai-stream-kit/react';

function ChatMessage() {
  const { html, isStreaming, start, stop, reset } = useAIStream({
    sseOptions: {
      url: '/api/chat/stream',
      method: 'POST',
      retry: { maxRetries: 3 },
    },
  });

  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <button onClick={() => start({ prompt: '你好' })}>Send</button>
      {isStreaming && <button onClick={stop}>Stop</button>}
      <button onClick={reset}>Clear</button>
    </div>
  );
}
```

### 6. Vue Composable

```vue
<script setup>
import { useAIStream } from 'ai-stream-kit/vue';

const { html, isStreaming, start, stop } = useAIStream({
  sseOptions: {
    url: '/api/chat/stream',
    method: 'POST',
  },
});
</script>

<template>
  <div v-html="html" />
  <button @click="start({ prompt: '你好' })">Send</button>
  <button v-if="isStreaming" @click="stop">Stop</button>
</template>
```

---

## API Reference

### Core — SSE Client

| Export | Type | Description |
|--------|------|-------------|
| `createSSEClient(options)` | Function | Create a streaming SSE client instance |
| `SSEParser` | Class | Low-level SSE protocol parser (state machine) |
| `calculateDelay(attempt, options)` | Function | Calculate exponential backoff delay |
| `shouldRetry(attempt, options)` | Function | Check if retry is allowed |
| `SSEClientError` | Class | Typed error with `statusCode` and `retryable` |

### Renderer

| Export | Type | Description |
|--------|------|-------------|
| `autoClose(partial)` | Function | Auto-close unclosed Markdown tags |
| `StreamMarkdownRenderer` | Class | Incremental streaming Markdown renderer |
| `RenderScheduler` | Class | RAF-based render coalescing (browser) |
| `NodeRenderScheduler` | Class | setTimeout-based render coalescing (Node.js) |

### RAG

| Export | Type | Description |
|--------|------|-------------|
| `EmbeddingManager` | Class | Main-thread orchestrator for Web Worker embeddings |
| `VectorStore` | Class | In-memory vector store with Top-K cosine search |
| `chunkText(text, options?)` | Function | Split text into overlapping chunks |
| `cosineSimilarity(a, b)` | Function | Compute cosine similarity between two vectors |
| `euclideanDistance(a, b)` | Function | Compute Euclidean distance |
| `dotProduct(a, b)` | Function | Compute dot product |
| `normalize(v)` | Function | L2 normalize a vector |

---

## Testing

```bash
# Run all tests
npm test

# Run tests once (CI)
npm run test:run

# With coverage report
npm run test:coverage
```

**168 test cases** covering:

- SSE parser: protocol compliance, TCP fragmentation, BOM, line endings
- Retry strategy: exponential backoff, jitter, AbortSignal cancellation
- SSE client: connection lifecycle, abort, error handling, deduplication
- Auto-close: bold, italic, code blocks, links, images, nesting, escapes
- Markdown renderer: streaming simulation, state management
- Render scheduler: coalescing, disposal
- Text chunker: paragraphs, sentences, Chinese text, overlap
- Vector math: cosine similarity, euclidean distance, normalization
- Vector store: CRUD, Top-K search, JSON serialization

---

## Build

```bash
# Development (watch mode)
npm run dev

# Production build (ESM + CJS + DTS)
npm run build

# Type check
npm run lint
```

Output:
```
dist/
├── index.mjs      (32 KB)  — ESM
├── index.cjs      (33 KB)  — CJS
├── index.d.ts     (21 KB)  — Type declarations
├── react.mjs      (21 KB)  — React adapter
├── vue.mjs        (20 KB)  — Vue adapter
└── *.map          — Source maps
```

---

## 中文文档

### 项目简介

**AI-Stream-Kit** 是一个工业级的 AI 流式交互 SDK，专为现代 Web 应用设计。

### 核心能力

- 🔗 **高可靠 SSE 客户端**：支持指数退避重连、`Last-Event-ID` 断点续传、`AbortController` 主动打断、事件 ID 去重
- 📝 **流式 Markdown 渲染**：基于标签栈的自动闭合补全算法，解决 AI 输出半截 Markdown 导致页面崩溃的痛点
- 🧠 **端侧 RAG**：利用 Transformers.js v4 + WebGPU 在浏览器本地运行 Embedding 模型，实现不消耗服务器 Token 的文档向量化检索
- ⚡ **极致工程化**：TypeScript 严格模式、tsup 双格式打包、Vitest 单元测试 168 条、覆盖率 90%+

### 技术亮点

| 特性 | 实现方式 |
|------|---------|
| SSE 状态机解析 | 手写增量解析器，处理 TCP 分包、BOM、`\r\n`/`\r`/`\n` 三种行尾 |
| 指数退避 + 抖动 | `delay = min(base × 2^n + random, max)`，防雷群效应 |
| Markdown 自动闭合 | 栈结构追踪 `**` `*` `~~` `` ` `` ```` ``` ```` `[]()`，反向弹栈生成闭合后缀 |
| 按帧渲染 | `requestAnimationFrame` 合并同帧 DOM 更新，保证 60fps |
| Web Worker 推理 | 主线程零阻塞，`postMessage` 双向通信，Promise 化 API |
| WebGPU 加速 | 优先使用 WebGPU，自动降级 WASM，模型缓存到 IndexedDB |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Commit changes: `git commit -m 'feat: add amazing feature'`
4. Push: `git push origin feat/amazing-feature`
5. Open a Pull Request

---

## License

[MIT](./LICENSE) © 2026 AI-Stream-Kit Contributors
