import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import {
  modelSupportsVision,
  probeProvider,
  executeUnifiedChat,
  executeUnifiedStreamChat,
  LLMConfig,
} from '../llmProvider';
import {
  loadEnvironmentVariables,
  getEffectiveGeminiKey,
  getEffectiveLLMConfig,
  getFailoverChain,
} from '../server';

describe('COPILOT PROVIDER BACKUP & Multi-Provider Engine', () => {
  let mockServer: http.Server;
  let mockPort: number;
  let mockBaseUrl: string;
  let lastReceivedPayload: any = null;
  let mockResponseMode: 'success' | 'reject_image_once' | 'streaming' = 'success';
  let rejectCount = 0;

  beforeEach(async () => {
    rejectCount = 0;
    mockResponseMode = 'success';
    lastReceivedPayload = null;

    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          lastReceivedPayload = JSON.parse(body);
        } catch {
          lastReceivedPayload = body;
        }

        if (mockResponseMode === 'reject_image_once' && rejectCount === 0) {
          rejectCount++;
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'This model does not support image input' } }));
          return;
        }

        if (mockResponseMode === 'streaming') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          if (req.url?.includes('messages')) {
            // Anthropic stream format
            res.write('data: {"type": "content_block_delta", "delta": {"text": "Anthropic "}}\n\n');
            res.write('data: {"type": "content_block_delta", "delta": {"text": "streaming response"}}\n\n');
            res.write('data: {"type": "message_stop"}\n\n');
          } else {
            // OpenAI stream format
            res.write('data: {"choices": [{"delta": {"content": "OpenAI "}}]}\n\n');
            res.write('data: {"choices": [{"delta": {"content": "streaming chunk"}}]}\n\n');
            res.write('data: [DONE]\n\n');
          }
          res.end();
          return;
        }

        // Standard non-streaming success
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.url?.includes('messages')) {
          res.end(
            JSON.stringify({
              id: 'msg-123',
              content: [{ type: 'text', text: 'Anthropic surveillance observation: 2 cars present.' }],
            })
          );
        } else {
          res.end(
            JSON.stringify({
              id: 'chatcmpl-123',
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: 'OpenAI surveillance observation: sector clear.',
                  },
                },
              ],
            })
          );
        }
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

  describe('Vision Capability Detection', () => {
    it('accurately identifies vision-capable and text-only models', () => {
      expect(modelSupportsVision('gemini', 'gemini-3.8-flash')).toBe(true);
      expect(modelSupportsVision('gemini', 'gemini-3.5-flash-lite')).toBe(true);

      // OpenAI-compatible
      expect(modelSupportsVision('openai_compatible', 'gpt-4o')).toBe(true);
      expect(modelSupportsVision('openai_compatible', 'gpt-4o-mini')).toBe(true);
      expect(modelSupportsVision('openai_compatible', 'qwen-vl-max')).toBe(true);
      expect(modelSupportsVision('openai_compatible', 'gpt-3.5-turbo')).toBe(false);
      expect(modelSupportsVision('openai_compatible', 'deepseek-r1')).toBe(false);

      // Anthropic
      expect(modelSupportsVision('anthropic', 'claude-3-5-sonnet-20241022')).toBe(true);
      expect(modelSupportsVision('anthropic', 'claude-3-opus-20240229')).toBe(true);
    });
  });

  describe('Windows Notepad Trap Protection', () => {
    const notepadEnvFile = path.resolve(__dirname, '../.env.txt');

    afterEach(() => {
      if (fs.existsSync(notepadEnvFile)) {
        try {
          fs.unlinkSync(notepadEnvFile);
        } catch {}
      }
    });

    it('successfully loads credentials from .env.txt if Notepad saved with txt extension', () => {
      fs.writeFileSync(notepadEnvFile, 'GEMINI_API_KEY=AIzaSyNotepadTestTrap99999\n');
      loadEnvironmentVariables();
      expect(getEffectiveGeminiKey()).toBe('AIzaSyNotepadTestTrap99999');
    });
  });

  describe('OpenAI-Compatible Provider Integration', () => {
    it('correctly executes chat completions with images and system instructions', async () => {
      const config: LLMConfig = {
        provider: 'openai_compatible',
        apiKey: 'sk-mock-key-123456',
        baseUrl: mockBaseUrl,
        model: 'gpt-4o',
        supportsVision: true,
      };

      const result = await executeUnifiedChat(config, {
        message: 'How many vehicles are visible?',
        systemInstruction: 'You are a surveillance analyst.',
        images: [
          {
            dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            mimeType: 'image/jpeg',
          },
        ],
      });

      expect(result.provider).toBe('openai_compatible');
      expect(result.visionUsed).toBe(true);
      expect(result.text).toContain('OpenAI surveillance observation');

      // Verify structure received by mock server
      expect(lastReceivedPayload.messages[0].role).toBe('system');
      expect(lastReceivedPayload.messages[0].content).toBe('You are a surveillance analyst.');
      expect(lastReceivedPayload.messages[1].role).toBe('user');
      expect(Array.isArray(lastReceivedPayload.messages[1].content)).toBe(true);
      expect(lastReceivedPayload.messages[1].content[0].type).toBe('image_url');
    });

    it('falls back to text-only telemetry when model rejects image input with HTTP 400', async () => {
      mockResponseMode = 'reject_image_once';

      const config: LLMConfig = {
        provider: 'openai_compatible',
        apiKey: 'sk-mock-key-123456',
        baseUrl: mockBaseUrl,
        model: 'moonshot-v1-8k',
        supportsVision: true,
      };

      const result = await executeUnifiedChat(config, {
        message: 'Describe activity.',
        images: [
          {
            dataBase64: 'abc12345',
            mimeType: 'image/jpeg',
          },
        ],
      });

      expect(result.text).toContain('OpenAI surveillance observation');
      // Second attempt was sent without image and with explanatory note
      expect(rejectCount).toBe(1);
      const userContent = lastReceivedPayload.messages[0].content;
      expect(userContent).toContain('[Note: model cannot see the video - analyzing telemetry only]');
    });

    it('streams tokens via Server-Sent Events', async () => {
      mockResponseMode = 'streaming';

      const config: LLMConfig = {
        provider: 'openai_compatible',
        apiKey: 'sk-mock-key-123456',
        baseUrl: mockBaseUrl,
        model: 'gpt-4o',
        supportsVision: true,
      };

      let streamedText = '';
      let isDone = false;

      await executeUnifiedStreamChat(
        config,
        { message: 'Stream this test.' },
        {
          onChunk: (chunk) => {
            streamedText += chunk;
          },
          onDone: () => {
            isDone = true;
          },
          onError: (err) => {
            throw err;
          },
        }
      );

      expect(isDone).toBe(true);
      expect(streamedText).toBe('OpenAI streaming chunk');
    });
  });

  describe('Anthropic Provider Integration', () => {
    it('correctly executes messages API with Claude format', async () => {
      const config: LLMConfig = {
        provider: 'anthropic',
        apiKey: 'sk-ant-api03-mock-key-123456',
        baseUrl: mockBaseUrl,
        model: 'claude-3-5-sonnet-20241022',
        supportsVision: true,
      };

      const result = await executeUnifiedChat(config, {
        message: 'Count people.',
        systemInstruction: 'Strict analyst mode.',
        images: [
          {
            dataBase64: 'imagebase64mock',
            mimeType: 'image/jpeg',
          },
        ],
      });

      expect(result.provider).toBe('anthropic');
      expect(result.visionUsed).toBe(true);
      expect(result.text).toContain('Anthropic surveillance observation');

      expect(lastReceivedPayload.system).toBe('Strict analyst mode.');
      expect(lastReceivedPayload.messages[0].role).toBe('user');
      expect(lastReceivedPayload.messages[0].content[0].type).toBe('image');
      expect(lastReceivedPayload.messages[0].content[0].source.type).toBe('base64');
    });

    it('streams tokens from Anthropic messages endpoint', async () => {
      mockResponseMode = 'streaming';

      const config: LLMConfig = {
        provider: 'anthropic',
        apiKey: 'sk-ant-api03-mock-key-123456',
        baseUrl: mockBaseUrl,
        model: 'claude-3-5-sonnet-20241022',
        supportsVision: true,
      };

      let streamedText = '';
      let isDone = false;

      await executeUnifiedStreamChat(
        config,
        { message: 'Stream Anthropic test.' },
        {
          onChunk: (chunk) => {
            streamedText += chunk;
          },
          onDone: () => {
            isDone = true;
          },
          onError: (err) => {
            throw err;
          },
        }
      );

      expect(isDone).toBe(true);
      expect(streamedText).toBe('Anthropic streaming response');
    });
  });

  describe('Probe & Credentials Validation', () => {
    it('successfully validates credentials against mock OpenAI endpoint', async () => {
      const probe = await probeProvider('openai_compatible', 'valid-key', 'gpt-4o', mockBaseUrl);
      expect(probe.success).toBe(true);
      expect(probe.model).toBe('gpt-4o');
    });

    it('successfully validates credentials against mock Anthropic endpoint', async () => {
      const probe = await probeProvider('anthropic', 'valid-key', 'claude-3-5-sonnet-20241022', mockBaseUrl);
      expect(probe.success).toBe(true);
      expect(probe.model).toBe('claude-3-5-sonnet-20241022');
    });
  });
});
