import { GoogleGenAI } from '@google/genai';

export type LLMProviderType = 'gemini' | 'openai_compatible' | 'anthropic';

export interface LLMConfig {
  provider: LLMProviderType;
  apiKey: string;
  baseUrl?: string;
  model: string;
  supportsVision: boolean;
}

export interface ChatHistoryMessage {
  sender: 'user' | 'assistant' | 'model';
  text: string;
}

export interface ChatImageInput {
  dataBase64: string; // bare base64 without data URI prefix
  mimeType: string;
  caption?: string;
}

export interface UnifiedChatOptions {
  message?: string;
  history?: ChatHistoryMessage[];
  systemInstruction?: string;
  images?: ChatImageInput[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface UnifiedChatResult {
  text: string;
  provider: LLMProviderType;
  model: string;
  source: string;
  visionUsed: boolean;
  timestamp: number;
}

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: (result: { provider: LLMProviderType; model: string; source: string; visionUsed: boolean }) => void;
  onError: (error: Error, fallbackNeeded: boolean) => void;
}

// Model defaults per provider
export const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  gemini: 'gemini-3.8-flash',
  openai_compatible: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
};

// Base URL defaults
export const DEFAULT_BASE_URLS: Record<LLMProviderType, string> = {
  gemini: 'https://generativelanguage.googleapis.com',
  openai_compatible: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
};

/**
 * Heuristic to detect if an LLM model supports vision/image inputs
 */
export function modelSupportsVision(provider: LLMProviderType, model: string): boolean {
  if (provider === 'gemini') {
    // All current and recent Gemini models support multimodal inputs
    return true;
  }

  const m = model.toLowerCase();
  if (provider === 'openai_compatible') {
    // Models known to be strictly text-only
    if (
      m.includes('gpt-3.5') ||
      m.includes('o1-mini') ||
      m.includes('o1-preview') ||
      m.includes('instruct') ||
      m.includes('deepseek-r1') ||
      m.includes('deepseek-v3') ||
      m.includes('text-embedding')
    ) {
      return false;
    }

    // OpenAI models: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4-vision
    // Open-source / hosted: vl (vision language), pixtral, qwen-vl, minicpm, vision
    if (
      m.includes('4o') ||
      m.includes('vision') ||
      m.includes('-vl') ||
      m.includes('vl-') ||
      m.includes('pixtral') ||
      m.includes('gpt-4-turbo') ||
      m.includes('gemini') ||
      m.includes('claude') ||
      m.includes('llava')
    ) {
      return true;
    }
    return true; // default optimistic for modern endpoints
  }

  if (provider === 'anthropic') {
    // Claude 3 and 3.5 models support vision
    return m.includes('claude-3') || m.includes('claude-3-5') || m.includes('claude-sonnet') || m.includes('claude-opus');
  }

  return false;
}

/**
 * Standardize and clean API key
 */
export function cleanKey(key: string | undefined | null): string | null {
  if (!key) return null;
  const cleaned = key.trim().replace(/^["']|["']$/g, '');
  return cleaned.length > 5 ? cleaned : null;
}

/**
 * Probe a provider with a minimal 1-token call to verify credentials and connectivity
 */
export async function probeProvider(
  provider: LLMProviderType,
  apiKey: string,
  model?: string,
  baseUrl?: string
): Promise<{ success: boolean; model: string; error?: string }> {
  const chosenModel = model?.trim() || DEFAULT_MODELS[provider];
  const url = baseUrl?.trim() || DEFAULT_BASE_URLS[provider];

  try {
    if (provider === 'gemini') {
      const client = new GoogleGenAI({ apiKey });
      const probe = await client.models.generateContent({
        model: chosenModel,
        contents: 'ping',
        config: { maxOutputTokens: 1 },
      });
      if (probe) {
        return { success: true, model: chosenModel };
      }
      return { success: false, model: chosenModel, error: 'Empty probe response from Gemini.' };
    }

    if (provider === 'openai_compatible') {
      const targetUrl = `${url.replace(/\/+$/, '')}/chat/completions`;
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return {
          success: false,
          model: chosenModel,
          error: `HTTP ${res.status}: ${errText.slice(0, 200)}`,
        };
      }
      return { success: true, model: chosenModel };
    }

    if (provider === 'anthropic') {
      const targetUrl = `${url.replace(/\/+$/, '')}/messages`;
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return {
          success: false,
          model: chosenModel,
          error: `HTTP ${res.status}: ${errText.slice(0, 200)}`,
        };
      }
      return { success: true, model: chosenModel };
    }

    return { success: false, model: chosenModel, error: `Unsupported provider: ${provider}` };
  } catch (err: any) {
    return {
      success: false,
      model: chosenModel,
      error: err?.message || String(err),
    };
  }
}

/**
 * Execute non-streaming call to OpenAI-Compatible provider
 */
async function callOpenAICompatible(
  config: LLMConfig,
  options: UnifiedChatOptions
): Promise<UnifiedChatResult> {
  const targetUrl = `${(config.baseUrl || DEFAULT_BASE_URLS.openai_compatible).replace(/\/+$/, '')}/chat/completions`;
  const timeoutMs = options.timeoutMs || 20000;
  const supportsVision = config.supportsVision && options.images && options.images.length > 0;

  const messages: any[] = [];
  if (options.systemInstruction) {
    messages.push({ role: 'system', content: options.systemInstruction });
  }

  if (options.history && options.history.length > 0) {
    for (const h of options.history.slice(-10)) {
      messages.push({
        role: h.sender === 'user' ? 'user' : 'assistant',
        content: h.text,
      });
    }
  }

  // Construct user turn
  let visionUsed = false;
  if (supportsVision) {
    visionUsed = true;
    const contentParts: any[] = [];
    for (const img of options.images!) {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.mimeType};base64,${img.dataBase64}`,
        },
      });
      if (img.caption) {
        contentParts.push({ type: 'text', text: img.caption });
      }
    }
    contentParts.push({
      type: 'text',
      text: options.message || 'Please analyze this surveillance scene.',
    });
    messages.push({ role: 'user', content: contentParts });
  } else {
    let textContent = options.message || 'Please analyze this surveillance scene.';
    if (options.images && options.images.length > 0 && !config.supportsVision) {
      textContent = `[Note: model cannot see the video - analyzing telemetry only]\n\n${textContent}`;
    }
    messages.push({ role: 'user', content: textContent });
  }

  async function executeFetch(msgs: any[]): Promise<Response> {
    return await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: msgs,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 1024,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  let res = await executeFetch(messages);

  // If failed with 400 and images were attached, fall back to text-only with label
  if (!res.ok && visionUsed && res.status === 400) {
    const errText = await res.text().catch(() => '');
    const isImageError = /image|vision|unsupported|content/i.test(errText);
    if (isImageError) {
      console.warn(`[IBVAP LLM] Provider ${config.provider} rejected image payload (HTTP 400). Retrying with text-only telemetry fallback.`);
      const textOnlyMessages = messages.map((m) => {
        if (Array.isArray(m.content)) {
          const textPart = m.content.find((p: any) => p.type === 'text')?.text || '';
          return {
            role: m.role,
            content: `[Note: model cannot see the video - analyzing telemetry only]\n\n${textPart}`,
          };
        }
        return m;
      });
      visionUsed = false;
      res = await executeFetch(textOnlyMessages);
    }
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`OpenAI-compatible call failed (${res.status}): ${errBody.slice(0, 300)}`);
  }

  const data = (await res.json()) as any;
  const replyText = data?.choices?.[0]?.message?.content?.trim() || '';
  if (!replyText) {
    throw new Error('EMPTY_RESPONSE');
  }

  return {
    text: replyText,
    provider: config.provider,
    model: config.model,
    source: config.provider,
    visionUsed,
    timestamp: Date.now(),
  };
}

/**
 * Execute streaming call to OpenAI-Compatible provider
 */
async function streamOpenAICompatible(
  config: LLMConfig,
  options: UnifiedChatOptions,
  callbacks: StreamCallbacks
): Promise<void> {
  const targetUrl = `${(config.baseUrl || DEFAULT_BASE_URLS.openai_compatible).replace(/\/+$/, '')}/chat/completions`;
  const timeoutMs = options.timeoutMs || 25000;
  const supportsVision = config.supportsVision && options.images && options.images.length > 0;

  const messages: any[] = [];
  if (options.systemInstruction) {
    messages.push({ role: 'system', content: options.systemInstruction });
  }

  if (options.history && options.history.length > 0) {
    for (const h of options.history.slice(-10)) {
      messages.push({
        role: h.sender === 'user' ? 'user' : 'assistant',
        content: h.text,
      });
    }
  }

  let visionUsed = false;
  if (supportsVision) {
    visionUsed = true;
    const contentParts: any[] = [];
    for (const img of options.images!) {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.mimeType};base64,${img.dataBase64}`,
        },
      });
      if (img.caption) {
        contentParts.push({ type: 'text', text: img.caption });
      }
    }
    contentParts.push({
      type: 'text',
      text: options.message || 'Please analyze this surveillance scene.',
    });
    messages.push({ role: 'user', content: contentParts });
  } else {
    let textContent = options.message || 'Please analyze this surveillance scene.';
    if (options.images && options.images.length > 0 && !config.supportsVision) {
      textContent = `[Note: model cannot see the video - analyzing telemetry only]\n\n${textContent}`;
    }
    messages.push({ role: 'user', content: textContent });
  }

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options.temperature ?? 0.3,
      stream: true,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`OpenAI-compatible stream failed (${res.status}): ${errBody.slice(0, 300)}`);
  }

  if (!res.body) {
    throw new Error('NO_STREAM_BODY');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') {
          callbacks.onDone({
            provider: config.provider,
            model: config.model,
            source: config.provider,
            visionUsed,
          });
          return;
        }
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) {
              callbacks.onChunk(delta);
            }
          } catch {
            // Ignore malformed partial chunks
          }
        }
      }
    }

    callbacks.onDone({
      provider: config.provider,
      model: config.model,
      source: config.provider,
      visionUsed,
    });
  } catch (err: any) {
    callbacks.onError(err, true);
  }
}

/**
 * Execute non-streaming call to Anthropic provider
 */
async function callAnthropic(
  config: LLMConfig,
  options: UnifiedChatOptions
): Promise<UnifiedChatResult> {
  const targetUrl = `${(config.baseUrl || DEFAULT_BASE_URLS.anthropic).replace(/\/+$/, '')}/messages`;
  const timeoutMs = options.timeoutMs || 20000;
  const supportsVision = config.supportsVision && options.images && options.images.length > 0;

  const messages: any[] = [];
  if (options.history && options.history.length > 0) {
    for (const h of options.history.slice(-10)) {
      messages.push({
        role: h.sender === 'user' ? 'user' : 'assistant',
        content: h.text,
      });
    }
  }

  let visionUsed = false;
  if (supportsVision) {
    visionUsed = true;
    const contentParts: any[] = [];
    for (const img of options.images!) {
      contentParts.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType,
          data: img.dataBase64,
        },
      });
      if (img.caption) {
        contentParts.push({ type: 'text', text: img.caption });
      }
    }
    contentParts.push({
      type: 'text',
      text: options.message || 'Please analyze this surveillance scene.',
    });
    messages.push({ role: 'user', content: contentParts });
  } else {
    let textContent = options.message || 'Please analyze this surveillance scene.';
    if (options.images && options.images.length > 0 && !config.supportsVision) {
      textContent = `[Note: model cannot see the video - analyzing telemetry only]\n\n${textContent}`;
    }
    messages.push({ role: 'user', content: textContent });
  }

  const payload: any = {
    model: config.model,
    messages,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.3,
  };
  if (options.systemInstruction) {
    payload.system = options.systemInstruction;
  }

  async function executeFetch(bodyObj: any): Promise<Response> {
    return await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(bodyObj),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  let res = await executeFetch(payload);

  // If 400 rejection on images, fall back to text-only telemetry
  if (!res.ok && visionUsed && res.status === 400) {
    const errText = await res.text().catch(() => '');
    const isImageError = /image|vision|media_type/i.test(errText);
    if (isImageError) {
      console.warn(`[IBVAP LLM] Anthropic rejected image payload (HTTP 400). Retrying with text-only telemetry.`);
      const textOnlyMessages = messages.map((m) => {
        if (Array.isArray(m.content)) {
          const textPart = m.content.find((p: any) => p.type === 'text')?.text || '';
          return {
            role: m.role,
            content: `[Note: model cannot see the video - analyzing telemetry only]\n\n${textPart}`,
          };
        }
        return m;
      });
      visionUsed = false;
      payload.messages = textOnlyMessages;
      res = await executeFetch(payload);
    }
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Anthropic call failed (${res.status}): ${errBody.slice(0, 300)}`);
  }

  const data = (await res.json()) as any;
  const replyText = data?.content?.[0]?.text?.trim() || '';
  if (!replyText) {
    throw new Error('EMPTY_RESPONSE');
  }

  return {
    text: replyText,
    provider: config.provider,
    model: config.model,
    source: config.provider,
    visionUsed,
    timestamp: Date.now(),
  };
}

/**
 * Execute streaming call to Anthropic provider
 */
async function streamAnthropic(
  config: LLMConfig,
  options: UnifiedChatOptions,
  callbacks: StreamCallbacks
): Promise<void> {
  const targetUrl = `${(config.baseUrl || DEFAULT_BASE_URLS.anthropic).replace(/\/+$/, '')}/messages`;
  const timeoutMs = options.timeoutMs || 25000;
  const supportsVision = config.supportsVision && options.images && options.images.length > 0;

  const messages: any[] = [];
  if (options.history && options.history.length > 0) {
    for (const h of options.history.slice(-10)) {
      messages.push({
        role: h.sender === 'user' ? 'user' : 'assistant',
        content: h.text,
      });
    }
  }

  let visionUsed = false;
  if (supportsVision) {
    visionUsed = true;
    const contentParts: any[] = [];
    for (const img of options.images!) {
      contentParts.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType,
          data: img.dataBase64,
        },
      });
      if (img.caption) {
        contentParts.push({ type: 'text', text: img.caption });
      }
    }
    contentParts.push({
      type: 'text',
      text: options.message || 'Please analyze this surveillance scene.',
    });
    messages.push({ role: 'user', content: contentParts });
  } else {
    let textContent = options.message || 'Please analyze this surveillance scene.';
    if (options.images && options.images.length > 0 && !config.supportsVision) {
      textContent = `[Note: model cannot see the video - analyzing telemetry only]\n\n${textContent}`;
    }
    messages.push({ role: 'user', content: textContent });
  }

  const payload: any = {
    model: config.model,
    messages,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.3,
    stream: true,
  };
  if (options.systemInstruction) {
    payload.system = options.systemInstruction;
  }

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Anthropic stream failed (${res.status}): ${errBody.slice(0, 300)}`);
  }

  if (!res.body) {
    throw new Error('NO_STREAM_BODY');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed?.type === 'content_block_delta' && parsed?.delta?.text) {
              callbacks.onChunk(parsed.delta.text);
            } else if (parsed?.type === 'message_stop') {
              callbacks.onDone({
                provider: config.provider,
                model: config.model,
                source: config.provider,
                visionUsed,
              });
              return;
            }
          } catch {
            // Ignore partial SSE JSON chunks
          }
        }
      }
    }

    callbacks.onDone({
      provider: config.provider,
      model: config.model,
      source: config.provider,
      visionUsed,
    });
  } catch (err: any) {
    callbacks.onError(err, true);
  }
}

/**
 * Execute non-streaming call to Gemini provider
 */
async function callGemini(
  config: LLMConfig,
  options: UnifiedChatOptions
): Promise<UnifiedChatResult> {
  const client = new GoogleGenAI({ apiKey: config.apiKey });
  const contents: any[] = [];

  if (options.history && options.history.length > 0) {
    for (const h of options.history.slice(-10)) {
      contents.push({
        role: h.sender === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      });
    }
  }

  const currentParts: any[] = [];
  let visionUsed = false;
  if (options.images && options.images.length > 0) {
    visionUsed = true;
    for (const img of options.images) {
      currentParts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.dataBase64,
        },
      });
      if (img.caption) {
        currentParts.push({ text: img.caption });
      }
    }
  }

  currentParts.push({
    text: options.message || 'Please analyze this surveillance scene.',
  });

  contents.push({
    role: 'user',
    parts: currentParts,
  });

  const geminiCall = client.models.generateContent({
    model: config.model,
    contents,
    config: {
      systemInstruction: options.systemInstruction,
      temperature: options.temperature ?? 0.3,
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), options.timeoutMs || 20000)
  );

  const response = await Promise.race([geminiCall, timeoutPromise]);
  const replyText = response?.text?.trim() || '';
  if (!replyText) {
    throw new Error('EMPTY_RESPONSE');
  }

  return {
    text: replyText,
    provider: config.provider,
    model: config.model,
    source: 'gemini',
    visionUsed,
    timestamp: Date.now(),
  };
}

/**
 * Execute streaming call to Gemini provider
 */
async function streamGemini(
  config: LLMConfig,
  options: UnifiedChatOptions,
  callbacks: StreamCallbacks
): Promise<void> {
  const client = new GoogleGenAI({ apiKey: config.apiKey });
  const contents: any[] = [];

  if (options.history && options.history.length > 0) {
    for (const h of options.history.slice(-10)) {
      contents.push({
        role: h.sender === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      });
    }
  }

  const currentParts: any[] = [];
  let visionUsed = false;
  if (options.images && options.images.length > 0) {
    visionUsed = true;
    for (const img of options.images) {
      currentParts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.dataBase64,
        },
      });
      if (img.caption) {
        currentParts.push({ text: img.caption });
      }
    }
  }

  currentParts.push({
    text: options.message || 'Please analyze this surveillance scene.',
  });

  contents.push({
    role: 'user',
    parts: currentParts,
  });

  const streamResponse = await client.models.generateContentStream({
    model: config.model,
    contents,
    config: {
      systemInstruction: options.systemInstruction,
      temperature: options.temperature ?? 0.3,
    },
  });

  for await (const chunk of streamResponse) {
    if (chunk.text) {
      callbacks.onChunk(chunk.text);
    }
  }

  callbacks.onDone({
    provider: config.provider,
    model: config.model,
    source: 'gemini',
    visionUsed,
  });
}

/**
 * Dispatch unified chat to the configured provider
 */
export async function executeUnifiedChat(
  config: LLMConfig,
  options: UnifiedChatOptions
): Promise<UnifiedChatResult> {
  if (config.provider === 'gemini') {
    return await callGemini(config, options);
  }
  if (config.provider === 'openai_compatible') {
    return await callOpenAICompatible(config, options);
  }
  if (config.provider === 'anthropic') {
    return await callAnthropic(config, options);
  }
  throw new Error(`Unsupported provider: ${config.provider}`);
}

/**
 * Dispatch unified streaming chat to the configured provider
 */
export async function executeUnifiedStreamChat(
  config: LLMConfig,
  options: UnifiedChatOptions,
  callbacks: StreamCallbacks
): Promise<void> {
  if (config.provider === 'gemini') {
    return await streamGemini(config, options, callbacks);
  }
  if (config.provider === 'openai_compatible') {
    return await streamOpenAICompatible(config, options, callbacks);
  }
  if (config.provider === 'anthropic') {
    return await streamAnthropic(config, options, callbacks);
  }
  throw new Error(`Unsupported provider: ${config.provider}`);
}
