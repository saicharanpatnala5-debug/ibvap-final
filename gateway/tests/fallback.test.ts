import { describe, it, expect } from 'vitest';
import { generateGroundedFallbackResponse } from '../server';

describe('Grounded Local Heuristic Fallback Engine', () => {
  const sampleContext = {
    cameras: [{ id: 'cam-1', name: 'Perimeter West Gate' }],
    alerts: [
      {
        id: 'alert-1234',
        title: 'Virtual Fence Crossing',
        severity: 'critical',
        riskScore: 85,
        zoneName: 'North Gate Perimeter',
        cameraName: 'Perimeter West Gate',
      },
    ],
    entities: [
      {
        id: 101,
        class: 'person',
        confidence: 0.92,
        direction: 'Eastbound',
        velocity: 18,
        appearance: { clothingDescription: 'Navy blue jacket, dark trousers' },
      },
      {
        id: 102,
        class: 'car',
        confidence: 0.88,
        direction: 'Southbound',
        velocity: 32,
        appearance: { vehicleTypeDescription: 'White Sedan' },
      },
    ],
  };

  it('includes honest disclaimer stating it summarizes detections without raw image processing', () => {
    const res = generateGroundedFallbackResponse('explain scene', sampleContext);
    expect(res).toContain('IBVAP local heuristic engine');
    expect(res).toContain('does not perform optical/visual image analysis');
  });

  it('triggers scene analysis on "explain" and "scene" and "what is happening"', () => {
    const res1 = generateGroundedFallbackResponse('explain the area', sampleContext);
    expect(res1).toContain('Scene Analysis');
    expect(res1).toContain('Perimeter West Gate');

    const res2 = generateGroundedFallbackResponse('what is happening right now', sampleContext);
    expect(res2).toContain('Scene Analysis');
    expect(res2).toContain('Observed Entities');
  });

  it('uses word-boundary matching so "who" does not match "whole"', () => {
    // "whole perimeter" should not match the people/pedestrian branch
    const res = generateGroundedFallbackResponse('Show the whole perimeter', sampleContext);
    expect(res).not.toContain('Identified Persons');

    // "who was involved" should match people branch
    const resWho = generateGroundedFallbackResponse('who was involved?', sampleContext);
    expect(resWho).toContain('Identified Persons');
    expect(resWho).toContain('Navy blue jacket');
  });

  it('uses word-boundary matching so "car" does not match "careful"', () => {
    // "be careful" should not match vehicle branch
    const res = generateGroundedFallbackResponse('be careful with alerts', {
      cameras: sampleContext.cameras,
      alerts: [],
      entities: [],
    });
    expect(res).not.toContain('Vehicle & ANPR Intelligence');

    // "show cars" should match vehicle branch
    const resCar = generateGroundedFallbackResponse('show the cars detected', sampleContext);
    expect(resCar).toContain('Vehicle & ANPR Intelligence');
    expect(resCar).toContain('Vehicles in Frame');
  });

  it('handles missing or undefined telemetry fields safely without throwing', () => {
    expect(() => generateGroundedFallbackResponse('explain', null)).not.toThrow();
    expect(() => generateGroundedFallbackResponse('who', {})).not.toThrow();
    expect(() => generateGroundedFallbackResponse('vehicles', { alerts: [null, undefined], entities: [{}] })).not.toThrow();
  });

  // 10 Question Patterns Verification Tests
  it('Pattern 1: answers entity counts by class accurately', () => {
    const res = generateGroundedFallbackResponse('how many vehicles and pedestrians were detected?', sampleContext);
    expect(res).toContain('Tracked Entity Counts by Class');
    expect(res).toContain('Pedestrians / Persons');
    expect(res).toContain('Cars / Sedans');
    expect(res).toContain('Total Vehicles');
  });

  it('Pattern 2: answers why an alert fired with root-cause analysis', () => {
    const res = generateGroundedFallbackResponse('why did the alert fire?', sampleContext);
    expect(res).toContain('Incident Root-Cause Analysis');
    expect(res).toContain('Reason for Trigger');
    expect(res).toContain('Threat Index');
  });

  it('Pattern 3: answers plates read and needing review', () => {
    const contextWithPlates = {
      ...sampleContext,
      plates: [
        { plateNumber: 'KA01KW4498', status: 'Valid', isValidFormat: true, confidence: 72 },
        { plateNumber: 'KA114444', status: 'Needs review', isValidFormat: false, confidence: 58 },
      ],
    };
    const res = generateGroundedFallbackResponse('show license plates read and needing review', contextWithPlates);
    expect(res).toContain('License Plate (ANPR) Summary');
    expect(res).toContain('KA01KW4498');
    expect(res).toContain('Needs Review');
  });

  it('Pattern 4: answers timeline event at specific video timestamp (e.g. 5.2s)', () => {
    const res = generateGroundedFallbackResponse('what happened at 5.2s in the footage?', sampleContext);
    expect(res).toContain('Video Time Event');
    expect(res).toContain('Pedestrian #10');
    expect(res).toContain('Loitering Alert #1');
  });

  it('Pattern 5: answers timeline event at 10.0s for auto-rickshaw classification', () => {
    const res = generateGroundedFallbackResponse('what occurred at 10s?', sampleContext);
    expect(res).toContain('auto-rickshaw');
    expect(res).toContain('Track #88');
    expect(res).toContain('98.71% confidence');
  });

  it('Pattern 6: answers timeline event at 14.3s for fast-moving vehicle', () => {
    const res = generateGroundedFallbackResponse('what happened at 14.3s?', sampleContext);
    expect(res).toContain('High-velocity vehicle');
    expect(res).toContain('ID #9');
  });

  it('Pattern 7: answers which zone had security activity', () => {
    const contextWithZone = {
      ...sampleContext,
      zones: [{ name: 'Restricted Perimeter Shoulder', enabled: true }],
    };
    const res = generateGroundedFallbackResponse('which zone had security activity?', contextWithZone);
    expect(res).toContain('Monitored Virtual Zones');
    expect(res).toContain('Restricted Perimeter Shoulder');
  });

  it('Pattern 8: answers alerts and incident status', () => {
    const res = generateGroundedFallbackResponse('show all active alerts and their status', sampleContext);
    expect(res).toContain('Security Incidents Status');
    expect(res).toContain('Total Logged');
  });

  it('Pattern 9: answers tactical recommendations for operator', () => {
    const res = generateGroundedFallbackResponse('what action do you recommend for this situation?', sampleContext);
    expect(res).toContain('Tactical Recommendations');
    expect(res).toContain('Dispatch patrol unit');
  });

  it('Pattern 10: answers vehicle-specific query', () => {
    const res = generateGroundedFallbackResponse('which vehicles were observed?', sampleContext);
    expect(res).toContain('Vehicle & ANPR Intelligence');
    expect(res).toContain('Vehicles in Frame');
  });
});
