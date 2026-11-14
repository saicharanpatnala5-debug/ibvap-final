import { describe, it, expect } from 'vitest';
import { chatRequestSchema, explainSceneRequestSchema } from '../server';

describe('Zod Request Body Validation', () => {
  const validBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  it('accepts valid chat request with message', () => {
    const res = chatRequestSchema.safeParse({
      message: 'Analyze sector alpha',
      cameraName: 'Gate-01',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.message).toBe('Analyze sector alpha');
      expect(res.data.history).toEqual([]);
      expect(res.data.context).toEqual({ cameras: [], alerts: [], entities: [] });
    }
  });

  it('accepts valid chat request with frameBase64 and no message', () => {
    const res = chatRequestSchema.safeParse({
      frameBase64: validBase64,
    });
    expect(res.success).toBe(true);
  });

  it('rejects chat request with neither message nor frameBase64', () => {
    const res = chatRequestSchema.safeParse({
      cameraName: 'Gate-01',
    });
    expect(res.success).toBe(false);
  });

  it('rejects invalid frameBase64 (non-data-url or invalid mime)', () => {
    const res1 = chatRequestSchema.safeParse({
      message: 'test',
      frameBase64: 'not-a-valid-data-url',
    });
    expect(res1.success).toBe(false);

    const res2 = chatRequestSchema.safeParse({
      message: 'test',
      frameBase64: 'data:text/plain;base64,SGVsbG8=',
    });
    expect(res2.success).toBe(false);
  });

  it('enforces history boundaries (sender enum and max items)', () => {
    const validHistory = chatRequestSchema.safeParse({
      message: 'test',
      history: [
        { sender: 'user', text: 'hello' },
        { sender: 'ai', text: 'standing by' },
      ],
    });
    expect(validHistory.success).toBe(true);

    const invalidSender = chatRequestSchema.safeParse({
      message: 'test',
      history: [{ sender: 'admin', text: 'hello' }],
    });
    expect(invalidSender.success).toBe(false);

    const tooManyHistoryItems = chatRequestSchema.safeParse({
      message: 'test',
      history: Array.from({ length: 25 }, () => ({ sender: 'user', text: 'hi' })),
    });
    expect(tooManyHistoryItems.success).toBe(false);
  });

  it('validates explainSceneRequestSchema', () => {
    const valid = explainSceneRequestSchema.safeParse({
      frameBase64: validBase64,
      camera: { id: 'cam-1', name: 'West Gate' },
      alerts: [],
      entities: [],
      zones: [],
    });
    expect(valid.success).toBe(true);

    const invalid = explainSceneRequestSchema.safeParse({
      frameBase64: 'invalid-image-string',
    });
    expect(invalid.success).toBe(false);
  });
});
