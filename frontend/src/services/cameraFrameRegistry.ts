import { TrackedObject } from '../types';

export interface CameraFrameSnapshot {
  dataUrl: string;
  motionDataUrl?: string;
  width: number;
  height: number;
  trackedObjects: TrackedObject[];
  clipTotalEntities?: TrackedObject[];
  isNightMode: boolean;
  currentTime: number;
  cameraId?: string;
  cameraName?: string;
}

interface FrameProvider {
  cameraId: string;
  cameraName: string;
  getSnapshot: () => CameraFrameSnapshot | null;
}

const frameRegistry = new Map<string, FrameProvider>();
let lastKnownSnapshot: CameraFrameSnapshot | null = null;

export function registerCameraFrameProvider(
  cameraId: string,
  cameraName: string,
  getSnapshot: () => CameraFrameSnapshot | null
) {
  frameRegistry.set(cameraId, { cameraId, cameraName, getSnapshot });
}

export function unregisterCameraFrameProvider(cameraId: string) {
  frameRegistry.delete(cameraId);
}

export function setLastCameraFrameSnapshot(snapshot: CameraFrameSnapshot | null) {
  if (snapshot) {
    lastKnownSnapshot = snapshot;
  }
}

export function getActiveCameraFrameSnapshot(preferredCameraId?: string): CameraFrameSnapshot | null {
  if (preferredCameraId && frameRegistry.has(preferredCameraId)) {
    const provider = frameRegistry.get(preferredCameraId)!;
    const snap = provider.getSnapshot();
    if (snap) {
      const fullSnap = {
        ...snap,
        cameraId: provider.cameraId,
        cameraName: provider.cameraName,
      };
      lastKnownSnapshot = fullSnap;
      return fullSnap;
    }
  }

  // Fallback to any active registered camera
  for (const provider of frameRegistry.values()) {
    const snap = provider.getSnapshot();
    if (snap) {
      const fullSnap = {
        ...snap,
        cameraId: provider.cameraId,
        cameraName: provider.cameraName,
      };
      lastKnownSnapshot = fullSnap;
      return fullSnap;
    }
  }

  return lastKnownSnapshot;
}
