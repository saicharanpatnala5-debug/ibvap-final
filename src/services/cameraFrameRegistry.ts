import { TrackedObject } from '../types';

export interface CameraFrameSnapshot {
  dataUrl: string;
  width: number;
  height: number;
  trackedObjects: TrackedObject[];
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

export function getActiveCameraFrameSnapshot(preferredCameraId?: string): CameraFrameSnapshot | null {
  if (preferredCameraId && frameRegistry.has(preferredCameraId)) {
    const provider = frameRegistry.get(preferredCameraId)!;
    const snap = provider.getSnapshot();
    if (snap) {
      return {
        ...snap,
        cameraId: provider.cameraId,
        cameraName: provider.cameraName,
      };
    }
  }

  // Fallback to any active registered camera
  for (const provider of frameRegistry.values()) {
    const snap = provider.getSnapshot();
    if (snap) {
      return {
        ...snap,
        cameraId: provider.cameraId,
        cameraName: provider.cameraName,
      };
    }
  }

  return null;
}
