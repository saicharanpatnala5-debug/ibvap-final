import { TrackedObject } from '../types';

export interface EntityClassCounts {
  pedestrians: number;
  cars: number;
  autoRickshaws: number;
  twoWheelers: number;
  trucksBuses: number;
  totalVehicles: number;
  totalEntities: number;
}

export function computeEntityCounts(entities: TrackedObject[]): EntityClassCounts {
  let pedestrians = 0;
  let cars = 0;
  let autoRickshaws = 0;
  let twoWheelers = 0;
  let trucksBuses = 0;

  for (const ent of entities) {
    const cls = (ent.class || '').toLowerCase();
    if (cls === 'person' || cls === 'pedestrian') {
      pedestrians++;
    } else if (cls === 'car') {
      cars++;
    } else if (cls === 'auto-rickshaw' || cls === 'three-wheeler') {
      autoRickshaws++;
    } else if (cls === 'motorcycle' || cls === 'bicycle' || cls === 'two-wheeler') {
      twoWheelers++;
    } else if (cls === 'truck' || cls === 'bus' || cls === 'truck/bus') {
      trucksBuses++;
    }
  }

  const totalVehicles = cars + autoRickshaws + twoWheelers + trucksBuses;
  const totalEntities = pedestrians + totalVehicles;

  return {
    pedestrians,
    cars,
    autoRickshaws,
    twoWheelers,
    trucksBuses,
    totalVehicles,
    totalEntities,
  };
}

export interface SharedCameraEntityState {
  cameraId: string;
  cameraName: string;
  videoTime: number;
  timestamp: number;
  visibleEntitiesNow: TrackedObject[];
  visibleCountsNow: EntityClassCounts;
  cumulativeUniqueEntities: TrackedObject[];
  cumulativeCounts: EntityClassCounts;
}

class EntityStore {
  private states = new Map<string, SharedCameraEntityState>();
  private listeners = new Set<() => void>();

  public setCameraState(
    cameraId: string,
    cameraName: string,
    videoTime: number,
    visibleNow: TrackedObject[],
    cumulativeUnique: TrackedObject[]
  ) {
    const visibleCountsNow = computeEntityCounts(visibleNow);
    const cumulativeCounts = computeEntityCounts(cumulativeUnique);

    this.states.set(cameraId, {
      cameraId,
      cameraName,
      videoTime,
      timestamp: Date.now(),
      visibleEntitiesNow: visibleNow,
      visibleCountsNow,
      cumulativeUniqueEntities: cumulativeUnique,
      cumulativeCounts,
    });

    this.notify();
  }

  public getCameraState(cameraId?: string): SharedCameraEntityState | null {
    if (cameraId && this.states.has(cameraId)) {
      return this.states.get(cameraId)!;
    }
    const first = this.states.values().next();
    return first.done ? null : first.value;
  }

  public getAllStates(): SharedCameraEntityState[] {
    return Array.from(this.states.values());
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    for (const cb of this.listeners) {
      try {
        cb();
      } catch {
        // ignore
      }
    }
  }
}

export const entityStore = new EntityStore();
