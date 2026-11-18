import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  loadEnvironmentVariables,
  getEffectiveGeminiKey,
  inMemoryApiKey,
  activeGeminiModel,
  PREFERRED_GEMINI_MODELS,
} from '../server';

describe('STEP 1 - Gemini API Key Loading & In-App Management', () => {
  const localEnvPath = path.resolve(__dirname, '../.env.local');
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    if (fs.existsSync(localEnvPath)) {
      try {
        fs.unlinkSync(localEnvPath);
      } catch {}
    }
  });

  afterEach(() => {
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    else delete process.env.GEMINI_API_KEY;

    if (originalModel) process.env.GEMINI_MODEL = originalModel;
    else delete process.env.GEMINI_MODEL;

    if (fs.existsSync(localEnvPath)) {
      try {
        fs.unlinkSync(localEnvPath);
      } catch {}
    }
  });

  it('correctly loads GEMINI_API_KEY from .env.local when present', () => {
    fs.writeFileSync(localEnvPath, 'GEMINI_API_KEY=AIzaSyLocalTestKey12345678\n');
    loadEnvironmentVariables();
    expect(getEffectiveGeminiKey()).toBe('AIzaSyLocalTestKey12345678');
  });

  it('falls through when a file has an empty GEMINI_API_KEY', () => {
    // When no file has a valid key, returns null
    loadEnvironmentVariables();
    // In our test workspace, .env has empty key, so effective key is null
    expect(getEffectiveGeminiKey()).toBeNull();
  });

  it('selects preferred model hierarchy without hardcoded gemini-2.5-flash', () => {
    expect(PREFERRED_GEMINI_MODELS[0]).toBe('gemini-3.8-flash');
    expect(PREFERRED_GEMINI_MODELS).toContain('gemini-3.5-flash');
    expect(PREFERRED_GEMINI_MODELS).toContain('gemini-3.5-flash-lite');
    expect(PREFERRED_GEMINI_MODELS).not.toContain('gemini-2.5-flash'); // being retired
  });
});
