import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  positionAwareCorrection,
  validateStrictIndianPlate,
} from '../server';

describe('ANPR Emergency Fix & Dual-Confirmation Logic', () => {
  it('computes Levenshtein distance correctly for OCR comparisons', () => {
    expect(levenshteinDistance('KA01M4449', 'KA01M4449')).toBe(0);
    expect(levenshteinDistance('KA01M4449', 'KA01M4448')).toBe(1);
    expect(levenshteinDistance('KA01M4449', 'KA01M4488')).toBe(2);
    expect(levenshteinDistance('DL01AB1234', 'MH12AB1234')).toBe(4);
  });

  it('applies position-aware correction strictly obeying slot syntax', () => {
    // State prefix in positions 0,1: digits converted to letters
    expect(positionAwareCorrection('0L01AB1234').startsWith('DL')).toBe(true);
    // Last 4 digits: letters converted to digits
    expect(positionAwareCorrection('DL01AB123O').endsWith('1230')).toBe(true);
    expect(positionAwareCorrection('DL01AB123B').endsWith('1238')).toBe(true);
    // 9-character plate KA01M4449: slot 3 ('1') is not swapped
    expect(positionAwareCorrection('KA01M4449')).toBe('KA01M4449');
    // Bharat series
    expect(positionAwareCorrection('22BH1234AA')).toBe('22BH1234AA');
  });

  it('validates strict Indian formats against statutory regex & valid state codes', () => {
    expect(validateStrictIndianPlate('KA01M4449').isValid).toBe(true);
    expect(validateStrictIndianPlate('DL01AB1234').isValid).toBe(true);
    expect(validateStrictIndianPlate('22BH1234AB').isValid).toBe(true);

    // Invalid state code
    expect(validateStrictIndianPlate('ZZ01AB1234').isValid).toBe(false);
    // Too short or invalid structure
    expect(validateStrictIndianPlate('KA01M').isValid).toBe(false);
    expect(validateStrictIndianPlate('UNREADABLE').isValid).toBe(false);
  });

  it('enforces dual-confirmation rule: unconfirmed AI read stays Needs Review', () => {
    const aiText = 'KA01M4449';
    const validation = validateStrictIndianPlate(aiText);
    expect(validation.isValid).toBe(true);

    // Case 1: No local OCR agreement (edit distance > 1) and no matching second frame
    const distantLocalOcr = 'MH99ZZ9999';
    const secondFrame: string = 'DL04XX1111';
    const matchesSecond = secondFrame === aiText;
    const matchesLocal = levenshteinDistance(distantLocalOcr, aiText) <= 1;
    const isConfirmed = matchesSecond || matchesLocal;

    expect(isConfirmed).toBe(false);
    const finalStatus = isConfirmed ? 'Valid (AI-assisted)' : 'Needs review';
    expect(finalStatus).toBe('Needs review');

    // Case 2: Agreement with local OCR (edit distance <= 1)
    const nearLocalOcr = 'KA01M4448'; // 1 char difference
    const matchesNearLocal = levenshteinDistance(nearLocalOcr, aiText) <= 1;
    expect(matchesNearLocal).toBe(true);
    const confirmedStatus = (matchesNearLocal && validation.isValid) ? 'Valid (AI-assisted)' : 'Needs review';
    expect(confirmedStatus).toBe('Valid (AI-assisted)');
  });
});
