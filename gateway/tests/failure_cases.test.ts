import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import {
  executeUnifiedChat,
  executeUnifiedStreamChat,
  LLMConfig,
} from '../llmProvider';

describe('AI Chatbot 10 Critical Failure Cases Benchmark', () => {
  let mockServer: http.Server;
  let mockPort: number;
  let mockBaseUrl: string;
  let failureMode: string = 'none';

  beforeEach(async () => {
    failureMode = 'none';

    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        // Case 2: Invalid Key (401)
        if (failureMode === 'invalid_key') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Invalid API key provided', code: 401 } }));
          return;
        }

        // Case 3: Model Not Found (404)
        if (failureMode === 'model_not_found') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Model not found or deprecated', code: 404 } }));
          return;
        }

        // Case 4: Quota Exceeded (429)
        if (failureMode === 'quota_exceeded') {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Resource has been exhausted (rate limit)', code: 429 } }));
          return;
        }

        // Case 5: Timeout (simulated by delaying response)
        if (failureMode === 'timeout') {
          // Never respond within test timeout
          return;
        }

        // Case 6: Empty response
        if (failureMode === 'empty_response') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '' } }] }));
          return;
        }

        // Case 7: Blocked by Safety Filter
        if (failureMode === 'safety_blocked') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [
                {
                  message: { role: 'assistant', content: '' },
                  finish_reason: 'content_filter',
                },
              ],
            })
          );
          return;
        }

        // Case 8: Token Exhaustion (MAX_TOKENS)
        if (failureMode === 'max_tokens') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [
                {
                  message: { role: 'assistant', content: 'Observed vehicle KA01 entering North gate at high speed' },
                  finish_reason: 'length',
                },
              ],
            })
          );
          return;
        }

        // Case 9: Malformed SSE Chunk in streaming
        if (failureMode === 'malformed_sse') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          res.write('data: {"choices": [{"delta": {"content": "First valid chunk "}}]}\n\n');
          res.write('data: {MALFORMED_INVALID_JSON_CHUNK}\n\n');
          res.write('data: {"choices": [{"delta": {"content": "Second valid chunk"}}]}\n\n');
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }

        // Case 10: Server Error (500 / 503)
        if (failureMode === 'server_error') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Service Temporarily Unavailable', code: 503 } }));
          return;
        }

        // Default OK
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Normal observation response.' } }] }));
      });
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as any;
        mockPort = addr.port;
        mockBaseUrl = `http://127.0.0.1:${mockPort}/v1`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it('Case 1: No API key throws or rejects cleanly without unhandled rejection', async () => {
    const config: LLMConfig = {
      provider: 'openai_compatible',
      apiKey: '',
      baseUrl: mockBaseUrl,
      model: 'gpt-4o',
      supportsVision: true,
    };
    failureMode = 'invalid_key';
    await expect(executeUnifiedChat(config, { message: 'hello' })).rejects.toThrow();
  });

  it('Case 2: Invalid API key (401) is cleanly caught and reported', async () => {
    failureMode = 'invalid_key';
    const config: LLMConfig = {
      provider: 'openai_compatible',
      apiKey: 'bad-key',
      baseUrl: mockBaseUrl,
      model: 'gpt-4o',
      supportsVision: true,
    };
    await expect(executeUnifiedChat(config, { message: 'test' })).rejects.toThrow(/401/);
  });

  it('Case 3: Model not found (404) is caught and identified', async () => {
    failureMode = 'model_not_found';
    const config: LLMConfig = {
      provider: 'openai_compatible',
      apiKey: 'test-key',
      baseUrl: mockBaseUrl,
      model: 'non-existent-model',
      supportsVision: true,
    };
    await expect(executeUnifiedChat(config, { message: 'test' })).rejects.toThrow(/404/);
  });

  it('Case 4: Quota exceeded (429) throws rate limit error for failover', async () => {
    failureMode = 'quota_exceeded';
    const config: LLMConfig = {
      provider: 'openai_compatible',
      apiKey: 'test-key',
      baseUrl: mockBaseUrl,
      model: 'gpt-4o',
      supportsVision: true,
    };
    await expect(executeUnifiedChat(config, { message: 'test' })).rejects.toThrow(/429/);
  });

  it('Case 5: Timeout aborts request and does not hang forever', async () => {
    failureMode = 'timeout';
    const config: LLMConfig = {
      provider: 'openai_compatible',
      apiKey: 'test-key',
      baseUrl: mockBaseUrl,
      model: 'gpt-4o',
      supportsVision: true,
    };
    await expect(executeUnifiedChat(config, { message: 'test', timeoutMs: 200 })).rejects.toThrow();
  });

  it('Case 6: Empty response throws EMPTY_RESPONSE instead of blank bubble', async () => {
    failureMode = 'empty_response';
    const config: LLMConfig = {
      provider: 'openai_compatible',
      apiKey: 'test-key',
      baseUrl: mockBaseUrl,
      model: 'gpt-4o',
      supportsVision: true,
    };
    await expect(executeUnifiedChat(config, { message: 'test' })).rejects.toThrow(/EMPTY_RESPONSE/);
  });

  it('Case 7: Blocked by safety filter throws or reports safety cleanly', async () => {
    failureMode = 'safety_blocked';
    const config: LLMConfig = {
      provider: 'openai_compatible',
      apiKey: 'test-key',
      baseUrl: mockBaseUrl,
      model: 'gpt-4o',
      supportsVision: true,
    };
    await expect(executeUnifiedChat(config, { message: 'test' })).rejects.toThrow();
  });

  it('Case 8: Model token exhaustion preserves available text', async () => {
    failureMode = 'max_tokens';
    const config: LLMConfig = {
      provider: 'openai_compatible',
      apiKey: 'test-key',
      baseUrl: mockBaseUrl,
      model: 'gpt-4o',
      supportsVision: true,
    };
    const res = await executeUnifiedChat(config, { message: 'test' });
    expect(res.text).toContain('KA01');
  });

  it('Case 9: Malformed SSE stream ignores bad chunks and streams valid chunks', async () => {
    failureMode = 'malformed_sse';
    const config: LLMConfig = {
      provider: 'openai_compatible',
      apiKey: 'test-key',
      baseUrl: mockBaseUrl,
      model: 'gpt-4o',
      supportsVision: true,
    };

    const chunks: string[] = [];
    let completed = false;

    await executeUnifiedStreamChat(
      config,
      { message: 'stream test' },
      {
        onChunk: (t) => chunks.push(t),
        onDone: () => {
          completed = true;
        },
        onError: () => {},
      }
    );

    expect(chunks.length).toBe(2);
    expect(chunks.join('')).toBe('First valid chunk Second valid chunk');
    expect(completed).toBe(true);
  });

  it('Case 10: Server error (503) throws error and triggers fallback', async () => {
    failureMode = 'server_error';
    const config: LLMConfig = {
      provider: 'openai_compatible',
      apiKey: 'test-key',
      baseUrl: mockBaseUrl,
      model: 'gpt-4o',
      supportsVision: true,
    };
    await expect(executeUnifiedChat(config, { message: 'test' })).rejects.toThrow(/503/);
  });
});
