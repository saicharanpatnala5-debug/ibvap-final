export interface SampleFeedPreset {
  id: string;
  name: string;
  description: string;
  url: string;
  type: 'traffic' | 'pedestrian' | 'perimeter_night';
  suggestedZones?: {
    name: string;
    type: 'line' | 'polygon';
    points: { x: number; y: number }[];
  };
}

// Reliable, CORS-friendly public surveillance test feeds (MP4/WebM)
export const SAMPLE_FEED_PRESETS: SampleFeedPreset[] = [
  {
    id: 'sample-traffic-1',
    name: 'North Intersection (Vehicle & Traffic)',
    description: 'High-definition traffic intersection with cars, buses, vans, and turning trajectories.',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    type: 'traffic',
    suggestedZones: {
      name: 'Northbound Stop Line',
      type: 'line',
      points: [
        { x: 0.15, y: 0.65 },
        { x: 0.85, y: 0.65 },
      ],
    },
  },
  {
    id: 'sample-pedestrian-2',
    name: 'Walkway Concourse (Pedestrian & Crowd)',
    description: 'Active urban concourse with pedestrian walkways, cyclists, and perimeter tracking.',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    type: 'pedestrian',
    suggestedZones: {
      name: 'Restricted Concourse Zone',
      type: 'polygon',
      points: [
        { x: 0.25, y: 0.4 },
        { x: 0.75, y: 0.4 },
        { x: 0.85, y: 0.85 },
        { x: 0.15, y: 0.85 },
      ],
    },
  },
  {
    id: 'sample-night-3',
    name: 'East Depot Gate (Low-Light / Night Perimeter)',
    description: 'Low-light industrial perimeter scenario for testing automatic night-mode detection.',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
    type: 'perimeter_night',
    suggestedZones: {
      name: 'Perimeter Fence Line',
      type: 'line',
      points: [
        { x: 0.05, y: 0.55 },
        { x: 0.95, y: 0.55 },
      ],
    },
  },
];
