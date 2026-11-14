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
});
