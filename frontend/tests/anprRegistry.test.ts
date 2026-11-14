import { describe, it, expect } from 'vitest';
import {
  determinePlateStatus,
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
    });

    it('returns "Low confidence - needs review" for medium confidence compliant plates', () => {
      // Valid format but confidence between 60 and 80
      expect(determinePlateStatus('DL01AB1234', 65).status).toBe('Low confidence - needs review');
      expect(determinePlateStatus('MH12CD5678', 72).status).toBe('Low confidence - needs review');
    });

    it('returns "Unreadable" for low confidence, invalid format, or empty text', () => {
      expect(determinePlateStatus('UNREADABLE', 27).status).toBe('Unreadable');
      expect(determinePlateStatus('ABC', 30).status).toBe('Unreadable');
      expect(determinePlateStatus('', 95).status).toBe('Unreadable');
      expect(determinePlateStatus('DL01AB1234', 35).status).toBe('Unreadable');
      expect(determinePlateStatus('DL01AB12', 75).status).toBe('Unreadable');
    });

    it('uses named confidence constants properly', () => {
      expect(ANPR_CONF_HIGH).toBe(80);
      expect(ANPR_CONF_MEDIUM).toBe(60);
      expect(ANPR_CONF_MIN).toBe(40);
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
