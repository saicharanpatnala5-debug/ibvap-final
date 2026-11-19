import { describe, it, expect } from 'vitest';
import {
  determinePlateStatus,
  determineRecognitionState,
  lookupVehicleDossier,
  SIMULATED_VEHICLE_DATABASE,
  ANPR_CONF_HIGH,
  ANPR_CONF_MEDIUM,
  ANPR_CONF_MIN,
} from '../src/services/anprEngine';
import { cleanCameraName } from '../src/services/storageService';

describe('Phase 7 - ANPR Registry & Data Integrity Tests', () => {
  describe('determinePlateStatus', () => {
    it('returns "Valid format" for compliant Indian HSRP plates above threshold', () => {
      expect(determinePlateStatus('DL01AB1234', 92).status).toBe('Valid format');
      expect(determinePlateStatus('MH12CD5678', 85).status).toBe('Valid format');
      expect(determinePlateStatus('22BH1234AA', 88).status).toBe('Valid format');
      // 1-4 digit number support (MoRTH CMVR Rule 50)
      expect(determinePlateStatus('KA03S453', 88).status).toBe('Valid format');
      expect(determinePlateStatus('KA51AB130', 85).status).toBe('Valid format');
    });

    it('returns "Low confidence - needs review" for medium confidence compliant plates', () => {
      // Valid format but confidence between 60 and 80
      expect(determinePlateStatus('DL01AB1234', 65).status).toBe('Low confidence - needs review');
      expect(determinePlateStatus('MH12CD5678', 72).status).toBe('Low confidence - needs review');
      expect(determinePlateStatus('DL01AB12', 75).status).toBe('Low confidence - needs review');
    });

    it('returns "Unreadable" for low confidence, invalid format, or empty text', () => {
      expect(determinePlateStatus('UNREADABLE', 27).status).toBe('Unreadable');
      expect(determinePlateStatus('ABC', 30).status).toBe('Unreadable');
      expect(determinePlateStatus('', 95).status).toBe('Unreadable');
      expect(determinePlateStatus('DL01AB1234', 35).status).toBe('Unreadable');
      expect(determinePlateStatus('INVALID999', 75).status).toBe('Unreadable');
    });

    it('uses named confidence constants properly', () => {
      expect(ANPR_CONF_HIGH).toBe(80);
      expect(ANPR_CONF_MEDIUM).toBe(60);
      expect(ANPR_CONF_MIN).toBe(40);
    });
  });

  describe('Part 3 - Explicit Recognition States & MoRTH Disentanglement', () => {
    it('strictly classifies low-confidence near-match KA51ABK51 at 67.2% as NEEDS_REVIEW (never CONFIRMED)', () => {
      const state = determineRecognitionState('KA51ABK51', 67.2, 1);
      expect(state).toBe('NEEDS_REVIEW');
      // Even if vote count was 2, confidence < 80% MUST be NEEDS_REVIEW
      expect(determineRecognitionState('KA51ABK51', 67.2, 2)).toBe('NEEDS_REVIEW');
    });

    it('requires confidence >= 80% AND >= 2 agreeing frames for CONFIRMED status', () => {
      // High confidence but single frame -> TENTATIVE
      expect(determineRecognitionState('KA01MW4498', 92.0, 1)).toBe('TENTATIVE');
      // High confidence + 2 votes -> CONFIRMED
      expect(determineRecognitionState('KA01MW4498', 92.0, 2)).toBe('CONFIRMED');
      // Very high single frame (>= 95%) can also be CONFIRMED
      expect(determineRecognitionState('TN55CZ5446', 99.6, 1)).toBe('CONFIRMED');
    });

    it('demotes to NEEDS_REVIEW when any character confidence is below 50%', () => {
      // Overall 85% but one character has 45% confidence
      const charConfs = [95, 90, 85, 92, 45, 88, 90, 92, 95, 90];
      expect(determineRecognitionState('DL01AB1234', 85.0, 2, charConfs)).toBe('NEEDS_REVIEW');
    });

    it('supports 1-4 digit registration numbers per CMVR Rule 50', () => {
      // 3-digit number KA03S453 confirmed with 2 votes
      expect(determineRecognitionState('KA03S453', 88.0, 2)).toBe('CONFIRMED');
      // 3-digit number KA51AB130 confirmed with 2 votes
      expect(determineRecognitionState('KA51AB130', 85.0, 2)).toBe('CONFIRMED');
    });

    it('correctly tags UNREADABLE on empty, distance-gated, or garbage input', () => {
      expect(determineRecognitionState('UNREADABLE', 20.0, 1)).toBe('UNREADABLE');
      expect(determineRecognitionState('', 90.0, 1)).toBe('UNREADABLE');
      expect(determineRecognitionState('AB', 35.0, 1)).toBe('UNREADABLE');
    });
  });

  describe('lookupVehicleDossier & No Synthesized Records', () => {
    it('returns real simulated dossier ONLY for known plates', () => {
      const known = lookupVehicleDossier('DL01AB1234');
      expect(known).not.toBeNull();
      expect(known?.registeredOwner).toBeDefined();
      expect(known?.isSimulated).toBe(true);
      expect(known?.registeredOwner).toContain('Simulated');
    });

    it('returns null for unreadable or unknown plates (NEVER synthesizes fake owners)', () => {
      expect(lookupVehicleDossier('UNREADABLE')).toBeNull();
      expect(lookupVehicleDossier('XY99ZZ0000')).toBeNull();
      expect(lookupVehicleDossier('')).toBeNull();
      expect(lookupVehicleDossier('ABC1234')).toBeNull();
    });

    it('guarantees unique owners across all simulated vehicles (no owner duplication)', () => {
      const owners = Object.values(SIMULATED_VEHICLE_DATABASE).map((d) => d.registeredOwner);
      const uniqueOwners = new Set(owners);
      expect(owners.length).toBe(uniqueOwners.size);
    });

    it('labels all mock/simulated dossier data with isSimulated: true', () => {
      for (const dossier of Object.values(SIMULATED_VEHICLE_DATABASE)) {
        expect(dossier.isSimulated).toBe(true);
        expect(dossier.registeredOwner).toMatch(/Simulated/i);
      }
    });
  });

  describe('cleanCameraName Utility', () => {
    it('strips WhatsApp video and timestamp boilerplate', () => {
      expect(cleanCameraName('WhatsApp Video 2026-09-09 at 8.42.08 PM.mp4', 1)).toBe('Camera 1');
      expect(cleanCameraName('VID_20260909_204208.mp4', 2)).toBe('Camera 2');
    });

    it('preserves clean descriptive names', () => {
      expect(cleanCameraName('North Gate Perimeter.mp4', 1)).toBe('North Gate Perimeter');
      expect(cleanCameraName('Checkpoint Bravo Highway', 2)).toBe('Checkpoint Bravo Highway');
    });

    it('falls back to Camera N on empty or invalid string', () => {
      expect(cleanCameraName('', 3)).toBe('Camera 3');
      expect(cleanCameraName('.mp4', 4)).toBe('Camera 4');
    });
  });
});
