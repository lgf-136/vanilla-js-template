/* ============================================================
 * chat-shared.js — Chats 模块服务端常量与纯工具(无 IO)
 * ------------------------------------------------------------
 * 职责:
 *   - 22 家内置供应商目录(kind: openai|anthropic,多模态标记,默认模型)
 *   - 默认配置(分组/标签/自定义供应商/全局默认值/提示词/技能/MCP)
 *   - 内置提示词(9 个角色)与内置技能(8 个,可与提示词体系打通)
 *   - 参数白名单与钳制、思维链档位映射、工具定义构建
 *   - 通用工具:isPlainObject/parseJson/getHeader/slugify/uid/clamp
 * 纯逻辑文件,供 service / stream / llm / mcp 与测试直接复用。
 * ============================================================ */
'use strict';

/* ---------- 基础工具 ---------- */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function parseJson(text, fallback) {
  try {
    const v = JSON.parse(text);
    return v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
/** 兼容 Node req.headers / Worker Headers 的头读取 */
function getHeader(req, name) {
  if (!req || !req.headers) return '';
  if (typeof req.headers.get === 'function') return req.headers.get(name) || '';
  const v = req.headers[name] || req.headers[String(name).toLowerCase()];
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] || '' : '';
}
/** 名称 slug 化(cust-<name>;重名后缀由调用方处理) */
function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'provider';
}
function uid(prefix) {
  return (
    (prefix || 'id') +
    '-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 8)
  );
}
function clamp(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function asBool(v, fallback) {
  if (v === true || v === false) return v;
  if (v === 1 || v === '1' || v === 'true') return true;
  if (v === 0 || v === '0' || v === 'false') return false;
  return fallback;
}

/* ---------- 内置供应商目录(用户无需手填 baseURL) ---------- */
/**
 * 字段:id/name/kind/baseUrl/multimodal/models[](默认模型节选)/keyUrl(可选)
 * models 仅为便捷下拉项,真实列表以「自动获取模型列表」({baseUrl}/models)为准。
 */
const PROVIDERS = [
  { id: 'opencode-zen', name: 'OpenCode Zen', kind: 'openai', baseUrl: 'https://opencode.ai/zen/v1', multimodal: true, keyUrl: 'https://opencode.ai', models: ['x-preview-f-free'] },
  { id: 'opencode-go', name: 'OpenCode Go', kind: 'openai', baseUrl: 'https://opencode.ai/zen/go/v1', multimodal: true, keyUrl: 'https://opencode.ai', models: ['mimo-v2.5'] },
  { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', multimodal: true, keyUrl: 'https://platform.openai.com/api-keys', models: ['gpt-5', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini', 'gpt-4.1'] },
  { id: 'anthropic', name: 'Claude (Anthropic)', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', multimodal: true, keyUrl: 'https://console.anthropic.com/settings/keys', models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-3-7-sonnet', 'claude-3-5-sonnet'] },
  { id: 'gemini', name: 'Gemini (Google)', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', multimodal: true, keyUrl: 'https://aistudio.google.com/apikey', models: ['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'] },
  { id: 'grok', name: 'Grok (xAI)', kind: 'openai', baseUrl: 'https://api.x.ai/v1', multimodal: true, keyUrl: 'https://console.x.ai', models: ['grok-4', 'grok-3', 'grok-3-mini'] },
  { id: 'groq', name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', multimodal: false, keyUrl: 'https://console.groq.com/keys', models: ['llama-4-maverick', 'llama-3.3-70b-versatile', 'qwen-3-32b'] },
  { id: 'huggingface', name: 'Hugging Face', kind: 'openai', baseUrl: 'https://api-inference.huggingface.co/v1', multimodal: false, keyUrl: 'https://huggingface.co/settings/tokens', models: ['Llama-4-Maverick', 'Qwen3', 'DeepSeek-V3'] },
  { id: 'cerebras', name: 'Cerebras', kind: 'openai', baseUrl: 'https://api.cerebras.ai/v1', multimodal: false, keyUrl: 'https://cloud.cerebras.ai', models: ['llama-3.3-70b', 'gpt-oss-120b'] },
  { id: 'openrouter', name: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', multimodal: true, keyUrl: 'https://openrouter.ai/settings/keys', models: ['openai/gpt-5', 'openai/gpt-4o', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-pro'] },
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', multimodal: false, keyUrl: 'https://platform.deepseek.com/api_keys', models: ['deepseek-v4', 'deepseek-reasoner', 'deepseek-chat'] },
  { id: 'kimi', name: 'Kimi (Moonshot)', kind: 'openai', baseUrl: 'https://api.moonshot.cn/v1', multimodal: true, keyUrl: 'https://platform.moonshot.cn', models: ['kimi-k2.5', 'moonshot-v1-128k', 'moonshot-v1-32k'] },
  { id: 'glm', name: 'GLM (智谱)', kind: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', multimodal: true, keyUrl: 'https://open.bigmodel.cn', models: ['glm-5', 'glm-4.6', 'glm-z1-air', 'glm-4.5-air'] },
  { id: 'qwen', name: 'Qwen (通义千问)', kind: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', multimodal: true, keyUrl: 'https://dashscope.console.aliyun.com', models: ['qwen3-max', 'qwen3-plus', 'qwen-vl-max', 'qwen2.5-72b-instruct'] },
  { id: 'siliconflow', name: '硅基流动 (SiliconFlow)', kind: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', multimodal: true, keyUrl: 'https://cloud.siliconflow.cn', models: ['DeepSeek-V3.1', 'DeepSeek-R1', 'Qwen3', 'GLM-4.5-Air'] },
  { id: 'mistral', name: 'Mistral', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', multimodal: false, keyUrl: 'https://console.mistral.ai', models: ['mistral-large-latest', 'codestral-latest', 'mistral-small-latest'] },
  { id: 'perplexity', name: 'Perplexity', kind: 'openai', baseUrl: 'https://api.perplexity.ai', multimodal: false, keyUrl: 'https://www.perplexity.ai/settings/api', models: ['sonar-pro', 'sonar-reasoning', 'sonar'] },
  { id: 'cohere', name: 'Cohere', kind: 'openai', baseUrl: 'https://api.cohere.com/v1', multimodal: false, keyUrl: 'https://dashboard.cohere.com', models: ['command-r-plus', 'command-r', 'command-a'] },
  { id: 'together', name: 'Together AI', kind: 'openai', baseUrl: 'https://api.together.xyz/v1', multimodal: false, keyUrl: 'https://api.together.ai/settings/api-keys', models: ['Llama-4', 'DeepSeek-V3.1', 'Qwen3'] },
  { id: 'fireworks', name: 'Fireworks AI', kind: 'openai', baseUrl: 'https://api.fireworks.ai/inference/v1', multimodal: false, keyUrl: 'https://fireworks.ai/api-keys', models: ['llama4-maverick', 'qwen3', 'deepseek-v3'] },
  { id: 'ollama', name: 'Ollama (本地)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', multimodal: false, keyUrl: '', models: ['llama3.3', 'qwen3', 'deepseek-r1', 'gemma3'] },
  { id: 'lmstudio', name: 'LM Studio (本地)', kind: 'openai', baseUrl: 'http://localhost:1234/v1', multimodal: false, keyUrl: '', models: [] },
];
const PROVIDER_INDEX = {};
PROVIDERS.forEach(function (p) {
  PROVIDER_INDEX[p.id] = p;
});

/* ---------- 参数白名单与钳制 ---------- */
/** 参数名 → [最小值, 最大值];maxTokens 独立处理(1–2000000) */
const PARAM_RANGES = {
  temperature: [-0, 2],
  topP: [0, 1],
  topK: [0, 1000],
  maxTokens: [1, 2000000],
  presencePenalty: [-2, 2],
  frequencyPenalty: [-2, 2],
};
const DEFAULT_PARAMS = {
  temperature: 0.7,
  topP: 0.95,
  topK: 0,
  maxTokens: 8192,
  presencePenalty: 0,
  frequencyPenalty: 0,
};

/** 思维链档位 → Anthropic 思考预算(与前端档位一致) */
const THINKING_BUDGET = {
  none: 0,
  low: 1024,
  medium: 4096,
  high: 8192,
  max: 16384,
};

/* ---------- 内置提示词(9 个角色) ---------- */
const DEFAULT_PROMPTS = [
  { id: 'general', name: '通用助手', zhName: '通用助手', twName: '通用助手', enName: 'General Assistant', content: '你是一个乐于助人、严谨可靠的 AI 助手。请用简洁清晰的语言回答用户的问题,不确定时如实说明。' },
  { id: 'translator', name: '翻译家', zhName: '翻译家', twName: '翻譯家', enName: 'Translator', content: '你是一位专业翻译家。请将用户提供的内容准确翻译为目标语言,保持原文语气与专业术语,输出流畅自然。' },
  { id: 'mathematician', name: '数学家', zhName: '数学家', twName: '數學家', enName: 'Mathematician', content: '你是一位严谨的数学家。解答数学问题时请分步推导,公式使用 LaTeX 表示,关键步骤给出解释。' },
  { id: 'react-engineer', name: 'React 工程师', zhName: 'React 工程师', twName: 'React 工程師', enName: 'React Engineer', content: '你是一位资深 React 前端工程师。编写代码时遵循函数式组件与 Hooks 最佳实践,给出完整可运行的示例,并解释关键实现。' },
  { id: 'python-expert', name: 'Python 专家', zhName: 'Python 专家', twName: 'Python 專家', enName: 'Python Expert', content: '你是一位 Python 专家。编写代码时遵循 PEP 8,优先使用标准库与成熟第三方库,提供类型注解与文档字符串。' },
  { id: 'code-reviewer', name: '代码审查员', zhName: '代码审查员', twName: '程式碼審查員', enName: 'Code Reviewer', content: '你是一位严格的代码审查员。审查代码时指出可读性、性能、安全与边界问题,按严重程度排序并给出改进建议。' },
  { id: 'writing-assistant', name: '写作助手', zhName: '写作助手', twName: '寫作助手', enName: 'Writing Assistant', content: '你是一位写作助手。帮助用户润色、扩写或精简文字,保持风格统一,提供结构清晰的修改建议。' },
  { id: 'sql-expert', name: 'SQL 专家', zhName: 'SQL 专家', twName: 'SQL 專家', enName: 'SQL Expert', content: '你是一位 SQL 专家。编写查询时优先使用参数化写法,注意索引与执行计划,给出可读且高效的标准 SQL。' },
  { id: 'plain-explainer', name: '通俗解释者', zhName: '通俗解释者', twName: '通俗解釋者', enName: 'Plain Explainer', content: '你擅长把复杂概念讲得通俗易懂。请用生活化的类比、简短的例子和朴实的语言解释,避免堆砌术语。' },
];

/* ---------- 内置技能(与提示词体系打通:promptId 可映射为技能) ---------- */
const DEFAULT_SKILLS = [
  { id: 'general', name: '通用助手', icon: 'sparkles', description: '默认的通用对话能力,适用于大多数场景。', systemPrompt: '你是一个乐于助人、严谨可靠的 AI 助手。请用简洁清晰的语言回答用户的问题,不确定时如实说明。' },
  { id: 'code-reviewer', name: '代码审查员', icon: 'search', description: '对代码进行专业审查,输出按严重程度排序的问题与建议。', systemPrompt: '你是一位严格的代码审查员。审查代码时指出可读性、性能、安全与边界问题,按严重程度排序并给出改进建议。' },
  { id: 'translator', name: '翻译家', icon: 'languages', description: '专业翻译,保持原文语气与术语准确。', systemPrompt: '你是一位专业翻译家。请将用户提供的内容准确翻译为目标语言,保持原文语气与专业术语,输出流畅自然。' },
  { id: 'python-expert', name: 'Python 专家', icon: 'code', description: 'Python 专家级代码生成与解答。', systemPrompt: '你是一位 Python 专家。编写代码时遵循 PEP 8,优先使用标准库与成熟第三方库,提供类型注解与文档字符串。' },
  { id: 'react-engineer', name: 'React 工程师', icon: 'blocks', description: 'React 最佳实践代码生成与讲解。', systemPrompt: '你是一位资深 React 前端工程师。编写代码时遵循函数式组件与 Hooks 最佳实践,给出完整可运行的示例,并解释关键实现。' },
  { id: 'sql-expert', name: 'SQL 专家', icon: 'database', description: '高效、参数化、可读的标准 SQL。', systemPrompt: '你是一位 SQL 专家。编写查询时优先使用参数化写法,注意索引与执行计划,给出可读且高效的标准 SQL。' },
  { id: 'writing-assistant', name: '写作助手', icon: 'pencil', description: '润色、扩写与精简文字,保持风格统一。', systemPrompt: '你是一位写作助手。帮助用户润色、扩写或精简文字,保持风格统一,提供结构清晰的修改建议。' },
  { id: 'plain-explainer', name: '通俗解释者', icon: 'message-square', description: '把复杂概念讲得通俗易懂。', systemPrompt: '你擅长把复杂概念讲得通俗易懂。请用生活化的类比、简短的例子和朴实的语言解释,避免堆砌术语。' },
];

/* ---------- 默认配置 ---------- */
function defaultConfig() {
  return {
    version: 1,
    groups: [],
    tags: [],
    providers: [], // 自定义供应商
    defaults: {
      providerId: 'opencode-zen',
      model: 'x-preview-f-free',
      promptId: 'general',
      skillId: 'general',
      params: Object.assign({}, DEFAULT_PARAMS),
      thinking: 'none',
      webSearch: false,
      webSearchProvider: 'duckduckgo',
      searchResults: 5,
      mcpEnabled: false,
    },
    prompts: DEFAULT_PROMPTS.map(function (p) {
      return { id: p.id, name: p.name, content: p.content };
    }),
    skills: DEFAULT_SKILLS.map(function (s) {
      return {
        id: s.id,
        name: s.name,
        icon: s.icon,
        description: s.description,
        systemPrompt: s.systemPrompt,
        toolIds: [],
        paramsPreset: {},
        knowledgeDocs: [],
      };
    }),
    mcp: [], // 服务器列表
  };
}

/** 供应商覆盖表:按供应商 id 的参数覆盖(如某供应商专属的 max_tokens 上限) */
const PROVIDER_OVERRIDES = {
  groq: { maxTokens: 131072 },
  deepseek: { maxTokens: 65536 },
  kimi: { maxTokens: 131072 },
};

/** 默认联网搜索供应商(duckduckgo 免 Key,其余需 searchKeys) */
const WEB_SEARCH_PROVIDERS = ['duckduckgo', 'serper', 'tavily', 'bing', 'google'];

/** 工具循环上限(防止无限工具调用) */
const TOOL_LOOP_LIMIT = 8;
/** SSE 事件缓冲:单流事件数 / 保留时长 / 清理间隔 */
const EVENT_BUFFER_CAP = 8000;
const EVENT_BUFFER_TTL_MS = 30 * 60 * 1000;

module.exports = {
  PROVIDERS,
  PROVIDER_INDEX,
  PARAM_RANGES,
  DEFAULT_PARAMS,
  THINKING_BUDGET,
  DEFAULT_PROMPTS,
  DEFAULT_SKILLS,
  PROVIDER_OVERRIDES,
  WEB_SEARCH_PROVIDERS,
  TOOL_LOOP_LIMIT,
  EVENT_BUFFER_CAP,
  EVENT_BUFFER_TTL_MS,
  defaultConfig,
  isPlainObject,
  parseJson,
  getHeader,
  slugify,
  uid,
  clamp,
  asBool,
};
