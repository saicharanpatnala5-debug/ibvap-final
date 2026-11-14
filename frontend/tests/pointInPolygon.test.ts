import { describe, it, expect } from 'vitest';
import {
  isPointInsidePolygon,
  matchesCrossingDirection,
  doLineSegmentsIntersect,
} from '../src/services/detectionEngine';

describe('Point-in-Polygon & Virtual Fence Logic', () => {
  // Unit square: (0.2, 0.2) to (0.8, 0.8)
  const unitSquare = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ];

  it('detects point clearly inside polygon', () => {
    expect(isPointInsidePolygon({ x: 0.5, y: 0.5 }, unitSquare)).toBe(true);
    expect(isPointInsidePolygon({ x: 0.3, y: 0.3 }, unitSquare)).toBe(true);
  });

  it('detects point clearly outside polygon', () => {
    expect(isPointInsidePolygon({ x: 0.1, y: 0.5 }, unitSquare)).toBe(false);
    expect(isPointInsidePolygon({ x: 0.9, y: 0.5 }, unitSquare)).toBe(false);
    expect(isPointInsidePolygon({ x: 0.5, y: 0.9 }, unitSquare)).toBe(false);
    expect(isPointInsidePolygon({ x: 0.5, y: 0.1 }, unitSquare)).toBe(false);
  });

  it('handles concave polygon correctly', () => {
    // L-shaped polygon
    const lPolygon = [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.5, y: 0.3 },
      { x: 0.3, y: 0.3 },
      { x: 0.3, y: 0.5 },
      { x: 0.1, y: 0.5 },
    ];
    expect(isPointInsidePolygon({ x: 0.2, y: 0.2 }, lPolygon)).toBe(true);
    // In the hollow of the L:
    expect(isPointInsidePolygon({ x: 0.4, y: 0.4 }, lPolygon)).toBe(false);
  });

  it('returns false for degenerate polygons (< 3 points)', () => {
    expect(isPointInsidePolygon({ x: 0.5, y: 0.5 }, [])).toBe(false);
    expect(isPointInsidePolygon({ x: 0.5, y: 0.5 }, [{ x: 0.1, y: 0.1 }])).toBe(false);
    expect(
      isPointInsidePolygon({ x: 0.5, y: 0.5 }, [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.9 },
      ])
    ).toBe(false);
  });

  it('validates line crossing segment intersection', () => {
    const fenceP1 = { x: 0.5, y: 0.1 };
    const fenceP2 = { x: 0.5, y: 0.9 };

    // Vector traversing across the fence line
    const trajPrev = { x: 0.4, y: 0.5 };
    const trajCurr = { x: 0.6, y: 0.5 };
    expect(doLineSegmentsIntersect(trajPrev, trajCurr, fenceP1, fenceP2)).toBe(true);

    // Vector that does not cross the line
    const trajParallel = { x: 0.4, y: 0.2 };
    const trajParallel2 = { x: 0.4, y: 0.8 };
    expect(doLineSegmentsIntersect(trajParallel, trajParallel2, fenceP1, fenceP2)).toBe(false);
  });

  it('evaluates directional fence crossings correctly', () => {
    const prev = { x: 0.3, y: 0.4 };
    const currEast = { x: 0.5, y: 0.4 };
    const currWest = { x: 0.1, y: 0.4 };
    const currSouth = { x: 0.3, y: 0.6 };
    const currNorth = { x: 0.3, y: 0.2 };

    expect(matchesCrossingDirection(prev, currEast, 'left_to_right')).toBe(true);
    expect(matchesCrossingDirection(prev, currWest, 'left_to_right')).toBe(false);

    expect(matchesCrossingDirection(prev, currWest, 'right_to_left')).toBe(true);
    expect(matchesCrossingDirection(prev, currEast, 'right_to_left')).toBe(false);

    expect(matchesCrossingDirection(prev, currSouth, 'inbound')).toBe(true);
    expect(matchesCrossingDirection(prev, currNorth, 'inbound')).toBe(false);

    expect(matchesCrossingDirection(prev, currNorth, 'outbound')).toBe(true);
    expect(matchesCrossingDirection(prev, currSouth, 'outbound')).toBe(false);

    expect(matchesCrossingDirection(prev, currEast, 'any')).toBe(true);
  });
});
