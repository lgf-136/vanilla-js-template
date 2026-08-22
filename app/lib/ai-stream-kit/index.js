// src/core/types.ts
var SSEClientError = class extends Error {
  /** 具体的 HTTP 状态码（如果有） */
  statusCode;
  /** 这个错误是否允许重新尝试连接 */
  retryable;
  /** 引发该错误的原始 Error 堆栈 */
  cause;
  constructor(message, options) {
    super(message);
    this.name = "SSEClientError";
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? true;
    this.cause = options?.cause;
  }
};

// src/core/sse-parser.ts
var SSEParser = class {
  /** 用于存放因被阶段而等待跟后续 feed() 相结合并进行拼接缝合的字符缓冲区 */
  buffer = "";
  /** 存放目前正在发酵并有待组合输出的这一个单件 Event 属性成员池子 */
  currentData = [];
  currentId = void 0;
  currentEvent = void 0;
  currentRetry = void 0;
  /** 保留所见过的最新的一条事件 ID（此 ID 常态驻留以用在网络断连时恢复定位使用） */
  _lastEventId = void 0;
  /** 决定是否已经在第一块进来的数据里头砍掉了 BOM 前缀标识 (Zero Width No-Break Space) */
  bomStripped = false;
  /** 标记前一个缓冲区残片结尾是否悬空着一个 \r 字符 (用来预测 \r\n 连体情况) */
  trailingCR = false;
  /** 最终将成果转手导出的接收回调函式体 */
  onEvent;
  constructor(onEvent) {
    this.onEvent = onEvent;
  }
  /**
   * 被登记保存的最后的一笔事件 ID (也就是 `Last-Event-ID` 向后端声明的断点游标)。
   */
  get lastEventId() {
    return this._lastEventId;
  }
  /**
   * 将碎渣一样的数据小碎块灌注投喂给这段机制解析器。
   * 这里自带一套对付由于 TCP 发包分错位置导致片段截断的精巧处理逻辑。
   */
  feed(chunk) {
    if (!this.bomStripped) {
      if (chunk.charCodeAt(0) === 65279) {
        chunk = chunk.slice(1);
      }
      this.bomStripped = true;
    }
    if (this.trailingCR && chunk.length > 0 && chunk[0] !== "\n") {
      this.buffer += "\n";
      this.trailingCR = false;
    } else if (this.trailingCR && chunk.length > 0 && chunk[0] === "\n") {
      this.trailingCR = false;
    }
    this.buffer += chunk;
    this.processBuffer();
    if (this.buffer.endsWith("\r")) {
      this.buffer = this.buffer.slice(0, -1);
      this.trailingCR = true;
    }
  }
  /**
   * 给解析器下发一份终止停喂通知信号。
   * 该机制能够把滞存在缓存尾部的孤独悬空 \r 行符号变现为最后收口的阶段分批指令。
   */
  feedEnd() {
    if (this.trailingCR) {
      this.buffer += "\n";
      this.trailingCR = false;
      this.processBuffer();
    }
  }
  /**
   * 把这套状态机大重置洗刷至最初形态去迎接新的一波访问。
   */
  reset() {
    this.buffer = "";
    this.currentData = [];
    this.currentId = void 0;
    this.currentEvent = void 0;
    this.currentRetry = void 0;
    this._lastEventId = void 0;
    this.bomStripped = false;
    this.trailingCR = false;
  }
  /**
   * 在当前装配的缓存字符串块中，尽最大搜素挖掘提取出合法完整行，并层层往下送出执行命令。
   * 依 SSE 标规：将独立出现的 \r\n、\r、亦或是 \n 都能同等地判定成一条完美的分隔终结横线。
   */
  processBuffer() {
    while (true) {
      const lineEnd = this.findLineEnd();
      if (lineEnd === -1) {
        break;
      }
      const { index, length } = lineEnd;
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + length);
      this.processLine(line);
    }
  }
  /**
   * 去查找位于当前寄存区内的第一处分行标志节点。
   * 会同时带回包含标志符游标以及该标志符号所占篇幅长度的信息包。
   */
  findLineEnd() {
    for (let i = 0; i < this.buffer.length; i++) {
      const char = this.buffer[i];
      if (char === "\r") {
        if (i + 1 < this.buffer.length && this.buffer[i + 1] === "\n") {
          return { index: i, length: 2 };
        }
        return { index: i, length: 1 };
      }
      if (char === "\n") {
        return { index: i, length: 1 };
      }
    }
    return -1;
  }
  /**
   * 对依据拆出来的单独纯文本行执行对应的协议规则拆包及组装操作。
   */
  processLine(line) {
    if (line === "") {
      this.dispatchEvent();
      return;
    }
    if (line.startsWith(":")) {
      return;
    }
    const colonIndex = line.indexOf(":");
    let field;
    let value;
    if (colonIndex === -1) {
      field = line;
      value = "";
    } else {
      field = line.slice(0, colonIndex);
      value = line.slice(colonIndex + 1);
      if (value.startsWith(" ")) {
        value = value.slice(1);
      }
    }
    this.processField(field, value);
  }
  /**
   * 根据标准的 Server-Sent Events 文件流结构，按照其命名给其对应值安排到缓存坑位之中。
   */
  processField(field, value) {
    switch (field) {
      case "data":
        this.currentData.push(value);
        break;
      case "id":
        if (!value.includes("\0")) {
          this.currentId = value;
        }
        break;
      case "event":
        this.currentEvent = value;
        break;
      case "retry":
        if (/^\d+$/.test(value)) {
          this.currentRetry = parseInt(value, 10);
        }
        break;
    }
  }
  /**
   * 对将就完组装了的参数库集合发起派遣调用命令抛至用户方。
   * 该逻辑多是在读取中遇到光秃秃毫无内容的一条空白行而点燃发条的。
   */
  dispatchEvent() {
    if (this.currentData.length === 0 && !this.currentEvent) {
      this.resetCurrentEvent();
      return;
    }
    if (this.currentId !== void 0) {
      this._lastEventId = this.currentId;
    }
    const event = {
      data: this.currentData.join("\n")
    };
    if (this._lastEventId !== void 0) {
      event.id = this._lastEventId;
    }
    if (this.currentEvent !== void 0) {
      event.event = this.currentEvent;
    }
    if (this.currentRetry !== void 0) {
      event.retry = this.currentRetry;
    }
    this.onEvent(event);
    this.resetCurrentEvent();
  }
  /**
   * 倾销一切单向组件的暂时遗留历史存活记录。
   */
  resetCurrentEvent() {
    this.currentData = [];
    this.currentId = void 0;
    this.currentEvent = void 0;
    this.currentRetry = void 0;
  }
};

// src/core/retry-strategy.ts
var DEFAULT_RETRY_OPTIONS = {
  maxRetries: 5,
  baseDelay: 1e3,
  maxDelay: 3e4,
  jitter: true
};
function resolveRetryOptions(partial) {
  return {
    ...DEFAULT_RETRY_OPTIONS,
    ...partial
  };
}
function calculateDelay(attempt, options) {
  const exponential = options.baseDelay * Math.pow(2, attempt);
  const jitter = options.jitter ? Math.random() * options.baseDelay : 0;
  return Math.min(exponential + jitter, options.maxDelay);
}
function shouldRetry(attempt, options) {
  return attempt < options.maxRetries;
}
function waitForRetry(attempt, options, signal) {
  const delay = calculateDelay(attempt, options);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// src/core/sse-client.ts
function createSSEClient(options) {
  const retryOptions = resolveRetryOptions(options.retry);
  const deduplicate = options.deduplicate ?? true;
  let state = "idle";
  let lastEventId = options.lastEventId;
  let attempt = 0;
  let internalAbortController = null;
  let closed = false;
  const seenIds = /* @__PURE__ */ new Set();
  connect();
  function setState(newState) {
    state = newState;
  }
  function buildHeaders() {
    const headers = {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      ...options.headers
    };
    if (lastEventId) {
      headers["Last-Event-ID"] = lastEventId;
    }
    return headers;
  }
  async function connect() {
    if (closed) return;
    setState(attempt === 0 ? "connecting" : "reconnecting");
    internalAbortController = new AbortController();
    if (options.signal?.aborted) {
      handleClose();
      return;
    }
    const onExternalAbort = () => {
      internalAbortController?.abort();
    };
    options.signal?.addEventListener("abort", onExternalAbort, { once: true });
    try {
      const body = options.body && typeof options.body === "object" ? JSON.stringify(options.body) : options.body;
      const response = await fetch(options.url, {
        method: options.method ?? "GET",
        headers: buildHeaders(),
        body,
        signal: internalAbortController.signal
      });
      if (!response.ok) {
        throw new SSEClientError(
          `HTTP ${response.status}: ${response.statusText}`,
          {
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429
          }
        );
      }
      if (!response.body) {
        throw new SSEClientError("Response body is null", { retryable: false });
      }
      setState("connected");
      attempt = 0;
      options.onOpen?.();
      await readStream(response.body);
      options.signal?.removeEventListener("abort", onExternalAbort);
      handleStreamEnd();
    } catch (error) {
      options.signal?.removeEventListener("abort", onExternalAbort);
      if (isAbortError(error)) {
        handleClose();
        return;
      }
      const sseError = error instanceof SSEClientError ? error : new SSEClientError(
        error instanceof Error ? error.message : "Unknown error",
        {
          retryable: true,
          cause: error instanceof Error ? error : void 0
        }
      );
      options.onError?.(sseError);
      if (sseError.retryable) {
        handleRetry();
      } else {
        handleClose();
      }
    }
  }
  async function readStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");
    const parser = new SSEParser((event) => {
      if (event.id !== void 0) {
        lastEventId = event.id;
      }
      if (deduplicate && event.id) {
        if (seenIds.has(event.id)) {
          return;
        }
        seenIds.add(event.id);
        if (seenIds.size > 1e3) {
          const iterator = seenIds.values();
          const oldest = iterator.next().value;
          if (oldest !== void 0) {
            seenIds.delete(oldest);
          }
        }
      }
      if (event.retry !== void 0) {
        retryOptions.baseDelay = event.retry;
      }
      options.onMessage?.(event);
    });
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        parser.feed(text);
      }
      const remaining = decoder.decode();
      if (remaining) {
        parser.feed(remaining);
      }
    } finally {
      reader.releaseLock();
    }
  }
  function handleStreamEnd() {
    if (closed) return;
    handleRetry();
  }
  async function handleRetry() {
    if (closed) return;
    if (!shouldRetry(attempt, retryOptions)) {
      handleClose();
      return;
    }
    setState("reconnecting");
    try {
      await waitForRetry(attempt, retryOptions, options.signal);
      attempt++;
      connect();
    } catch {
      handleClose();
    }
  }
  function handleClose() {
    if (closed) return;
    closed = true;
    setState("closed");
    internalAbortController?.abort();
    seenIds.clear();
    options.onClose?.();
  }
  return {
    close() {
      handleClose();
    },
    get state() {
      return state;
    },
    get lastEventId() {
      return lastEventId;
    }
  };
}
function isAbortError(error) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }
  return false;
}

// src/renderer/auto-close.ts
function autoClose(partial) {
  const state = scan(partial);
  return partial + generateSuffix(state);
}
function scan(text) {
  const state = {
    inlineStack: [],
    inCodeBlock: false,
    codeFence: "",
    inInlineCode: false,
    linkState: { type: "none" }
  };
  const lines = text.split("\n");
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!state.inInlineCode) {
      const fenceMatch = matchCodeFence(line);
      if (fenceMatch) {
        if (state.inCodeBlock) {
          if (fenceMatch.fence.length >= state.codeFence.length && fenceMatch.char === state.codeFence[0]) {
            state.inCodeBlock = false;
            state.codeFence = "";
          }
        } else {
          state.inCodeBlock = true;
          state.codeFence = fenceMatch.fence;
        }
        continue;
      }
    }
    if (state.inCodeBlock) {
      continue;
    }
    scanInline(line, state);
  }
  return state;
}
function matchCodeFence(line) {
  const trimmed = line.trimStart();
  const match = /^(`{3,}|~{3,})(.*)$/.exec(trimmed);
  if (!match) return null;
  const fence = match[1];
  const char = fence[0];
  const rest = match[2];
  if (char === "`" && rest.includes("`")) {
    return null;
  }
  return { fence, char };
}
function scanInline(line, state) {
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      i += 2;
      continue;
    }
    if (ch === "`") {
      if (state.inInlineCode) {
        state.inInlineCode = false;
        i++;
        continue;
      } else {
        state.inInlineCode = true;
        i++;
        continue;
      }
    }
    if (state.inInlineCode) {
      i++;
      continue;
    }
    if (ch === "!" && i + 1 < line.length && line[i + 1] === "[") {
      state.linkState = { type: "image_bang" };
      i++;
      continue;
    }
    if (ch === "[") {
      const isImage = state.linkState.type === "image_bang";
      state.linkState = { type: "text", isImage };
      i++;
      continue;
    }
    if (ch === "]" && state.linkState.type === "text") {
      if (i + 1 < line.length && line[i + 1] === "(") {
        state.linkState = { type: "url", isImage: state.linkState.isImage };
        i += 2;
        continue;
      } else {
        state.linkState = { type: "none" };
        i++;
        continue;
      }
    }
    if (ch === ")" && state.linkState.type === "url") {
      state.linkState = { type: "none" };
      i++;
      continue;
    }
    if (state.linkState.type === "image_bang" && ch !== "[") {
      state.linkState = { type: "none" };
    }
    if (ch === "~" && i + 1 < line.length && line[i + 1] === "~") {
      toggleInline(state, "~~");
      i += 2;
      continue;
    }
    if (ch === "*" && i + 1 < line.length && line[i + 1] === "*") {
      toggleInline(state, "**");
      i += 2;
      continue;
    }
    if (ch === "_" && i + 1 < line.length && line[i + 1] === "_") {
      toggleInline(state, "__");
      i += 2;
      continue;
    }
    if (ch === "*") {
      toggleInline(state, "*");
      i++;
      continue;
    }
    if (ch === "_") {
      toggleInline(state, "_");
      i++;
      continue;
    }
    i++;
  }
}
function toggleInline(state, marker) {
  const lastIndex = findLastIndex(state.inlineStack, marker);
  if (lastIndex !== -1) {
    state.inlineStack.splice(lastIndex);
  } else {
    state.inlineStack.push(marker);
  }
}
function findLastIndex(stack, marker) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i] === marker) return i;
  }
  return -1;
}
function generateSuffix(state) {
  let suffix = "";
  if (state.linkState.type === "text") {
    suffix += "]()";
  } else if (state.linkState.type === "url") {
    suffix += ")";
  } else if (state.linkState.type === "image_bang") ;
  if (state.inInlineCode) {
    suffix += "`";
  }
  for (let i = state.inlineStack.length - 1; i >= 0; i--) {
    suffix += state.inlineStack[i];
  }
  if (state.inCodeBlock) {
    suffix += "\n" + state.codeFence;
  }
  return suffix;
}

// src/renderer/markdown-renderer.ts
var StreamMarkdownRenderer = class {
  /** 深埋着累加储存的原滋原味 Markdown 底层字符串 */
  accumulated = "";
  /** 渲染器的核心定制属性面板 */
  options;
  /** 本地缓存拦截，防止重复触发相同的废弃刷新事件 */
  lastOutput = "";
  constructor(options = {}) {
    this.options = options;
  }
  /**
   * 将一块全新收到的文本薄片添加到累加库的顶端里去。
   *
   * @param chunk - 这个小残片将会缝进全文中段
   * @returns 吐出目前被渲染成型的内容 (倘若提供了编译函数就是 HTML 代码，没有则只是缝满补丁的 Markdown 字句)
   */
  append(chunk) {
    this.accumulated += chunk;
    const output = this.render();
    if (this.options.container && output !== this.lastOutput) {
      this.options.container.innerHTML = output;
      if (this.options.autoScroll !== false) {
        this.scrollToBottom();
      }
    }
    this.lastOutput = output;
    return output;
  }
  /**
   * 按下暂定键仅仅获取下当前的渲染成果。
   */
  getHTML() {
    return this.render();
  }
  /**
   * 获取内部未遭任何修饰及保底闭合补丁打过的粗糙原石 Markdown 内容。
   */
  getRawMarkdown() {
    return this.accumulated;
  }
  /**
   * 获取历经闭合补丁修葺过的严实无缝的 Markdown 内容文本素材。
   */
  getPatchedMarkdown() {
    return autoClose(this.accumulated);
  }
  /**
   * 执行霸道式直接替换掉所有长途跋涉积累的内容文本，强硬注入你想要的全文。
   */
  setContent(content) {
    this.accumulated = content;
    const output = this.render();
    if (this.options.container && output !== this.lastOutput) {
      this.options.container.innerHTML = output;
    }
    this.lastOutput = output;
    return output;
  }
  /**
   * 粉碎重启全部内部暂存与 DOM 靶向指向区的内部字符信息，回到白纸状态。
   */
  reset() {
    this.accumulated = "";
    this.lastOutput = "";
    if (this.options.container) {
      this.options.container.innerHTML = "";
    }
  }
  /**
   * 获取当下的原本文档堆叠字符字数容量。
   */
  get length() {
    return this.accumulated.length;
  }
  /**
   * 隐藏流水控制系统流程：
   * 1. 使用 auto-close 将所有漏风的开口挂件填补死
   * 2. 如果存在转化机器，直接输出漂亮的网页 HTML 标记码
   */
  render() {
    const patched = autoClose(this.accumulated);
    if (this.options.markdownToHtml) {
      return this.options.markdownToHtml(patched);
    }
    return patched;
  }
  /**
   * 使用霸道且最暴力简单的算法帮助滚轴一路滚到底端深渊（实现全自动页面尾随的效果）。
   */
  scrollToBottom() {
    const container = this.options.container;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }
};

// src/renderer/debounce-render.ts
var RenderScheduler = class {
  /** 暂押在内部等待接受判决下发的更新文本 */
  pending = null;
  /** 被打上标记挂在一旁的屏幕绘制 requestAnimationFrame 追踪号 */
  rafId = null;
  /** 被外带传入并延后候命的回调函式体 */
  pendingCallback = null;
  /** 防御项：标志着调度器是否遭遇外部手动强行解体释放 */
  disposed = false;
  /**
   * 将新收到的内容放入池子等待被安排调度展出。
   * 它采用覆盖机制，以最后放进来的为准。
   *
   * @param content - 等待涂抹的内容
   * @param callback - 挂靠的回调委托
   */
  schedule(content, callback) {
    if (this.disposed) return;
    this.pending = content;
    this.pendingCallback = callback;
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.flush();
      });
    }
  }
  /**
   * 无视帧等候强行释放清仓处理（往往在结束接收时用来保底避免丢下最后一口气）。
   */
  flush() {
    if (this.pending !== null && this.pendingCallback !== null) {
      const content = this.pending;
      const callback = this.pendingCallback;
      this.pending = null;
      this.pendingCallback = null;
      this.rafId = null;
      callback(content);
    } else {
      this.rafId = null;
    }
  }
  /**
   * 是否仍有存货被搁置在待发送序列未发送。
   */
  get hasPending() {
    return this.pending !== null;
  }
  /**
   * 给这位功成名就的调度器办离职，卸载清空相关动画帧钩子，安全地回收内存。
   */
  dispose() {
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pending = null;
    this.pendingCallback = null;
  }
};
var NodeRenderScheduler = class {
  pending = null;
  timerId = null;
  pendingCallback = null;
  disposed = false;
  schedule(content, callback) {
    if (this.disposed) return;
    this.pending = content;
    this.pendingCallback = callback;
    if (this.timerId === null) {
      this.timerId = setTimeout(() => {
        this.flush();
      }, 16);
    }
  }
  flush() {
    if (this.pending !== null && this.pendingCallback !== null) {
      const content = this.pending;
      const callback = this.pendingCallback;
      this.pending = null;
      this.pendingCallback = null;
      this.timerId = null;
      callback(content);
    } else {
      this.timerId = null;
    }
  }
  get hasPending() {
    return this.pending !== null;
  }
  dispose() {
    this.disposed = true;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.pending = null;
    this.pendingCallback = null;
  }
};

// src/rag/chunker.ts
var DEFAULT_CHUNK_OPTIONS = {
  chunkSize: 500,
  overlap: 50,
  separators: ["\n\n", "\n", "\u3002", ". ", "\uFF1B", "; ", "\uFF0C", ", ", " "]
};
function chunkText(text, options) {
  const opts = {
    ...DEFAULT_CHUNK_OPTIONS,
    ...options
  };
  if (!text || text.trim().length === 0) {
    return [];
  }
  if (text.length <= opts.chunkSize) {
    return [text.trim()];
  }
  return recursiveSplit(text, opts.separators, opts.chunkSize, opts.overlap);
}
function recursiveSplit(text, separators, chunkSize, overlap) {
  if (text.length <= chunkSize) {
    const trimmed = text.trim();
    return trimmed ? [trimmed] : [];
  }
  for (const sep of separators) {
    const splits = text.split(sep);
    if (splits.length <= 1) continue;
    return mergeSplitsIntoChunks(splits, sep, chunkSize, overlap);
  }
  return characterSplit(text, chunkSize, overlap);
}
function mergeSplitsIntoChunks(splits, separator, chunkSize, overlap) {
  const chunks = [];
  let currentParts = [];
  let currentLength = 0;
  for (const split of splits) {
    const addLength = currentParts.length > 0 ? separator.length + split.length : split.length;
    if (currentLength + addLength > chunkSize && currentParts.length > 0) {
      const chunk = currentParts.join(separator).trim();
      if (chunk) chunks.push(chunk);
      const overlapParts = [];
      let overlapLength = 0;
      for (let i = currentParts.length - 1; i >= 0; i--) {
        const part = currentParts[i];
        const newLength = overlapLength + part.length + (overlapParts.length > 0 ? separator.length : 0);
        if (newLength > overlap) break;
        overlapParts.unshift(part);
        overlapLength = newLength;
      }
      currentParts = [...overlapParts, split];
      currentLength = currentParts.join(separator).length;
    } else {
      currentParts.push(split);
      currentLength += addLength;
    }
  }
  if (currentParts.length > 0) {
    const chunk = currentParts.join(separator).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}
function characterSplit(text, chunkSize, overlap) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

// src/rag/similarity.ts
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }
  if (a.length === 0) {
    throw new Error("Cannot compute similarity of zero-length vectors");
  }
  let dotProduct2 = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    dotProduct2 += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }
  return dotProduct2 / denominator;
}
function euclideanDistance(a, b) {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}
function dotProduct(a, b) {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}
function normalize(v) {
  let norm = 0;
  for (let i = 0; i < v.length; i++) {
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return new Array(v.length).fill(0);
  return v.map((x) => x / norm);
}

// src/rag/vector-store.ts
var VectorStore = class _VectorStore {
  /** Internal storage */
  entries = [];
  /** Index for fast lookups by ID */
  idIndex = /* @__PURE__ */ new Map();
  /**
   * 将一枚实体塞入这座图书馆里头。
   * 要是之前早存在对应唯一辨识符号的纪录，将覆盖更新掉前身的资料痕迹。
   *
   * @param entry - 要记录起来的那条具有标识性质与向量特征的词条
   */
  add(entry) {
    const existingIndex = this.idIndex.get(entry.id);
    if (existingIndex !== void 0) {
      this.entries[existingIndex] = entry;
    } else {
      this.idIndex.set(entry.id, this.entries.length);
      this.entries.push(entry);
    }
  }
  /**
   * 批处理功能，一口气提交灌注多个向量信息进去。
   *
   * @param entries - 海量记录集合
   */
  addBatch(entries) {
    for (const entry of entries) {
      this.add(entry);
    }
  }
  /**
   * 在这个小天地里面翻箱倒柜找出跟你要的那个目标相似度匹配的 Top 几 名数据实体材料。
   *
   * @param queryEmbedding - 被查询检索目标的向量坐标轴
   * @param topK - 限定抓取出多少条最贴切相关的对象 (默认是: 3条)
   * @returns 已自带根据优劣度降序整理规整完毕的信息表
   */
  search(queryEmbedding, topK = 3) {
    if (this.entries.length === 0) {
      return [];
    }
    const scored = this.entries.map((entry) => ({
      entry,
      score: cosineSimilarity(queryEmbedding, entry.embedding)
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
  /**
   * 透过它的特有 ID 号把这根对应的实体凭空拉取出来。
   */
  get(id) {
    const index = this.idIndex.get(id);
    if (index === void 0) return void 0;
    return this.entries[index];
  }
  /**
   * 根据目标身上的身份铭牌(ID)把它狠心地踢除清理掉。
   *
   * @returns 假如确认在执行前此人还身在库中并完成了移交，它会发还 `true`。
   */
  remove(id) {
    const index = this.idIndex.get(id);
    if (index === void 0) return false;
    this.entries.splice(index, 1);
    this.rebuildIndex();
    return true;
  }
  /**
   * 掀桌操作：将存放库所有留存的档案焚烧殆尽恢复白纸。
   */
  clear() {
    this.entries = [];
    this.idIndex.clear();
  }
  /**
   * 得知此刻小黑屋里总计收压扣留的人头数字信息。
   */
  get size() {
    return this.entries.length;
  }
  /**
   * 把底层保存着的原始资料数组全部提档暴露出去（经常被用来做整体内容的导出保存转存）。
   */
  getAll() {
    return [...this.entries];
  }
  /**
   * 把存储内囊转化为能轻巧落笔落磁盘被转换成标准的 JSON 通讯形态。
   */
  toJSON() {
    return { entries: this.entries };
  }
  /**
   * 复读操作：吞服 JSON 产物并复原重建原模原样的 Vector Store 建筑。
   */
  static fromJSON(data) {
    const store = new _VectorStore();
    store.addBatch(data.entries);
    return store;
  }
  /**
   * 私底下将存放 ID 地图定位用的指针册进行重新洗牌排序跟进工作。
   */
  rebuildIndex() {
    this.idIndex.clear();
    for (let i = 0; i < this.entries.length; i++) {
      this.idIndex.set(this.entries[i].id, i);
    }
  }
};

// src/rag/embedding-manager.ts
var EmbeddingManager = class {
  worker = null;
  pendingRequests = /* @__PURE__ */ new Map();
  initialized = false;
  requestCounter = 0;
  options;
  constructor(options) {
    this.options = {
      model: options?.model ?? "Xenova/all-MiniLM-L6-v2",
      device: options?.device ?? "auto",
      onProgress: options?.onProgress ?? (() => {
      })
    };
  }
  /**
   * 初始化建立启动干活的 worker 奴隶并强令其载入庞大的大模型网络。
   * 此 API 强制且必须先于所有后续计算操作流程进行调用触发。
   *
   * @throws 当建立模型读取或是分发失败时甩给你 Error 定时炸弹
   */
  async init() {
    if (this.initialized) return;
    return new Promise((resolve, reject) => {
      this.worker = this.createWorker();
      this.worker.onmessage = (event) => {
        this.handleWorkerMessage(event.data);
      };
      this.worker.onerror = (error) => {
        reject(new Error(`Worker error: ${error.message}`));
      };
      this.pendingRequests.set("__init__", {
        resolve: () => {
          this.initialized = true;
          resolve();
        },
        reject
      });
      let device = "wasm";
      if (this.options.device === "auto" || this.options.device === "webgpu") {
        if (typeof navigator !== "undefined" && "gpu" in navigator) {
          device = "webgpu";
        }
      }
      const msg = {
        type: "init",
        model: this.options.model,
        device
      };
      this.worker.postMessage(msg);
    });
  }
  /**
   * 提供给批量字符串生硬地转换提取为数字特征多维坐标系的转换器。
   *
   * @param texts - 喂入模型咀嚼的一系列文本切片
   * @returns 换算后等长的空间坐标矩阵数组
   */
  async embed(texts) {
    this.assertInitialized();
    const id = `embed_${++this.requestCounter}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const msg = {
        type: "embed",
        id,
        texts
      };
      this.worker.postMessage(msg);
    });
  }
  /**
   * 处理消化一篇文稿的完整车间流水线: 原文 → 切割分组 → 送检产码 → 造册收进向量库。
   *
   * @param text - 又长又臭没有任何排版的原文原句
   * @param chunkOptions - 你能够微调干涉切碎机的相关设定参数
   * @returns 包含被整顿收编好特征的知识索引库VectorStore本体
   */
  async processDocument(text, chunkOptions) {
    this.assertInitialized();
    const chunks = chunkText(text, chunkOptions);
    if (chunks.length === 0) {
      return new VectorStore();
    }
    const batchSize = 32;
    const store = new VectorStore();
    let chunkIndex = 0;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await this.embed(batch);
      for (let j = 0; j < batch.length; j++) {
        store.add({
          id: `chunk_${chunkIndex++}`,
          text: batch[j],
          embedding: embeddings[j],
          metadata: {
            index: chunkIndex - 1,
            charOffset: text.indexOf(batch[j])
          }
        });
      }
    }
    return store;
  }
  /**
   * 提着你要找的话柄子，去找馆长(VectorStore)寻觅关系相近的片段。
   *
   * @param query - 要寻人启事的大概意思文字
   * @param store - 去那座藏书库里进行翻找
   * @param topK - 选头前几个最有可能中签的句子(默认传回三块)
   * @returns 富有说服力相似度计分的排列结构数组集
   */
  async retrieve(query, store, topK = 3) {
    this.assertInitialized();
    const [queryEmbedding] = await this.embed([query]);
    if (!queryEmbedding) {
      throw new Error("Failed to generate query embedding");
    }
    return store.search(queryEmbedding, topK);
  }
  /**
   * 窥探当前车间和底盘管理人员是否均已就位能接受委托。
   */
  get isReady() {
    return this.initialized;
  }
  /**
   * 解散工人包工头并清理现场资源，顺带强制掐断打断那些遥遥无期干不完还没提交回应的任务清单。
   */
  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.initialized = false;
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("EmbeddingManager disposed"));
    }
    this.pendingRequests.clear();
  }
  /**
   * 守站门卫：对接收到返回主干路口的所有由 Web Worker 投递过来的快报包裹做拆分识别与投递处理。
   */
  handleWorkerMessage(msg) {
    switch (msg.type) {
      case "ready": {
        const initRequest = this.pendingRequests.get("__init__");
        if (initRequest) {
          this.pendingRequests.delete("__init__");
          initRequest.resolve([]);
        }
        break;
      }
      case "result": {
        const request = this.pendingRequests.get(msg.id);
        if (request) {
          this.pendingRequests.delete(msg.id);
          request.resolve(msg.embeddings);
        }
        break;
      }
      case "error": {
        const errorRequest = this.pendingRequests.get(msg.id);
        if (errorRequest) {
          this.pendingRequests.delete(msg.id);
          errorRequest.reject(new Error(msg.message));
        }
        break;
      }
      case "progress": {
        this.options.onProgress(msg.stage, msg.progress);
        break;
      }
    }
  }
  /**
   * 生成配置并创建一个标准的 Web Worker。
   * 当你需要应付并配合那些恶心的脚手架去改造导入规则时你可以重写重置覆盖这座函数的实现。
   */
  createWorker() {
    return new Worker(
      new URL("./embedding.worker.js", import.meta.url),
      { type: "module" }
    );
  }
  /**
   * 兜底防君子防不住小人，判断如果越权没加载直接强压就报错抛异常。
   */
  assertInitialized() {
    if (!this.initialized || !this.worker) {
      throw new Error(
        "EmbeddingManager not initialized. Call init() first."
      );
    }
  }
};

export { DEFAULT_CHUNK_OPTIONS, DEFAULT_RETRY_OPTIONS, EmbeddingManager, NodeRenderScheduler, RenderScheduler, SSEClientError, SSEParser, StreamMarkdownRenderer, VectorStore, autoClose, calculateDelay, chunkText, cosineSimilarity, createSSEClient, dotProduct, euclideanDistance, normalize, resolveRetryOptions, shouldRetry, waitForRetry };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map