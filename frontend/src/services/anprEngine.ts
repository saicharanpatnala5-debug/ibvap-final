import { createWorker, Worker } from 'tesseract.js';
import { ANPRResult, BoundingBox, VehicleDossier } from '../types';
import seededRegistryJson from './seededDemoRegistry.json';

let ocrWorkerPromise: Promise<Worker | null> | null = null;

async function getOcrWorker(): Promise<Worker | null> {
  if (ocrWorkerPromise) return ocrWorkerPromise;

  ocrWorkerPromise = (async () => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
      const worker = await createWorker('eng', 1, {
        langPath: origin,
        gzip: false,
        errorHandler: (err) => console.warn('[IBVAP ANPR Tesseract Notice]', err),
      });

      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      });

      return worker;
    } catch (err) {
      console.warn('[IBVAP ANPR] Local offline traineddata load notice, retrying with standard loader:', err);
      try {
        const worker = await createWorker('eng');
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        });
        return worker;
      } catch (fallbackErr) {
        console.error('[IBVAP ANPR] Tesseract worker initialization failed:', fallbackErr);
        return null;
      }
    }
  })();

  return ocrWorkerPromise;
}

export const INDIAN_STATE_RTO_NAMES: Record<string, string> = {
  AN: 'Andaman & Nicobar Islands',
  AP: 'Andhra Pradesh',
  AR: 'Arunachal Pradesh',
  AS: 'Assam',
  BR: 'Bihar',
  CG: 'Chhattisgarh',
  CH: 'Chandigarh',
  DD: 'Daman and Diu',
  DL: 'Delhi NCT',
  DN: 'Dadra and Nagar Haveli',
  DNH: 'Dadra and Nagar Haveli and Daman and Diu',
  GA: 'Goa',
  GJ: 'Gujarat',
  HP: 'Himachal Pradesh',
  HR: 'Haryana',
  JH: 'Jharkhand',
  JK: 'Jammu & Kashmir',
  KA: 'Karnataka',
  KL: 'Kerala',
  LA: 'Ladakh',
  LD: 'Lakshadweep',
  MH: 'Maharashtra',
  ML: 'Meghalaya',
  MN: 'Manipur',
  MP: 'Madhya Pradesh',
  MZ: 'Mizoram',
  NL: 'Nagaland',
  OD: 'Odisha',
  OR: 'Odisha (Pre-2012)',
  PB: 'Punjab',
  PY: 'Puducherry',
  RJ: 'Rajasthan',
  SK: 'Sikkim',
  TN: 'Tamil Nadu',
  TR: 'Tripura',
  TS: 'Telangana',
  TG: 'Telangana',
  UA: 'Uttarakhand (Pre-2007)',
  UK: 'Uttarakhand',
  UP: 'Uttar Pradesh',
  WB: 'West Bengal',
};

export const VALID_INDIAN_STATE_CODES = new Set(Object.keys(INDIAN_STATE_RTO_NAMES));

/**
 * Character confusion correction maps for OCR error recovery
 * (O↔0, I↔1, S↔5, B↔8, Z↔2)
 */
export function correctCharToLetter(char: string): string {
  const map: Record<string, string> = {
    '0': 'O',
    '1': 'I',
    '2': 'Z',
    '5': 'S',
    '8': 'B',
  };
  return map[char] || char;
}

export function correctCharToDigit(char: string): string {
  const map: Record<string, string> = {
    'O': '0',
    'I': '1',
    'Z': '2',
    'S': '5',
    'B': '8',
  };
  return map[char] || char;
}

export interface PlateValidationResult {
  plateText: string;
  confidence: number;
  isReadable: boolean;
  isValidFormat: boolean;
  formatType?: 'standard' | 'bharat' | 'invalid';
  validationStatus: 'Valid format' | 'Unreadable / invalid format';
  stateCode?: string;
  rtoCode?: string;
  series?: string;
  plateNumber?: string;
}

/**
 * Validates, corrects OCR confusion, and normalizes registration plates against:
 * 1. Standard Indian NHAI/RTO Format: [State Code: 2 letters] [RTO Code: 1-2 digits] [Series: 1-3 letters] [Number: 4 digits]
 * 2. Bharat (BH) Series Format: [Year: 2 digits] "BH" [4 digits] [2 letters]
 *
 * If raw OCR does not cleanly match, attempts best-effort correction of commonly confused characters (O↔0, I↔1, S↔5, B↔8, Z↔2).
 * If it still fails, outputs "Unreadable" rather than presenting an invalid plate as confirmed.
 */
export function sanitizePlateText(rawText: string, ocrConf: number): PlateValidationResult {
  const unreadableResult: PlateValidationResult = {
    plateText: 'Unreadable',
    confidence: 0,
    isReadable: false,
    isValidFormat: false,
    formatType: 'invalid',
    validationStatus: 'Unreadable / invalid format',
  };

  if (!rawText || ocrConf < 40) {
    return unreadableResult;
  }

  // Strip all non-alphanumeric characters (strictly NO spaces, NO dashes)
  const clean = rawText
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

  if (clean.length < 8 || clean.length > 12) {
    return unreadableResult;
  }

  // Reject uniform single-character noise (e.g. "IIIIIIII", "00000000")
  const uniqueChars = new Set(clean.split('')).size;
  if (uniqueChars <= 2) {
    return unreadableResult;
  }

  const baseConfidence = Math.min(99, Math.max(54, Math.round(ocrConf)));

  // ----------------------------------------------------
  // PASS 1: Direct Clean Match Check
  // ----------------------------------------------------
  // A. Bharat (BH) Series: [Year: 2 digits] "BH" [4 digits] [2 letters]
  const bharatDirect = clean.match(/^(\d{2})BH(\d{4})([A-Z]{2})$/);
  if (bharatDirect) {
    return {
      plateText: clean,
      confidence: baseConfidence,
      isReadable: true,
      isValidFormat: true,
      formatType: 'bharat',
      validationStatus: 'Valid format',
      stateCode: 'BH',
      rtoCode: bharatDirect[1],
      series: 'BH',
      plateNumber: bharatDirect[2],
    };
  }

  // B. Standard Indian Format: [State Code: 2 letters] [RTO: 1-2 digits] [Series: 1-3 letters] [Number: 4 digits]
  const standardDirect = clean.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{4})$/);
  if (standardDirect && VALID_INDIAN_STATE_CODES.has(standardDirect[1])) {
    return {
      plateText: clean,
      confidence: baseConfidence,
      isReadable: true,
      isValidFormat: true,
      formatType: 'standard',
      validationStatus: 'Valid format',
      stateCode: standardDirect[1],
      rtoCode: standardDirect[2],
      series: standardDirect[3],
      plateNumber: standardDirect[4],
    };
  }

  // ----------------------------------------------------
  // PASS 2: OCR Confusion Correction & Re-Validation
  // ----------------------------------------------------

  // Attempt Candidate Substrings if length is 11 or 12 with edge noise
  const candidateStrings = [clean];
  if (clean.length > 10) {
    candidateStrings.push(clean.slice(0, 10));
    candidateStrings.push(clean.slice(1, 11));
    if (clean.length === 12) {
      candidateStrings.push(clean.slice(2, 12));
    }
  }

  for (const candidate of candidateStrings) {
    // 1. Try correcting as Bharat (BH) Series (length exactly 10)
    if (candidate.length === 10) {
      const yearPart = candidate.slice(0, 2).split('').map(correctCharToDigit).join('');
      const bhPart = candidate.slice(2, 4).split('').map(correctCharToLetter).join('');
      const numPart = candidate.slice(4, 8).split('').map(correctCharToDigit).join('');
      const suffixPart = candidate.slice(8, 10).split('').map(correctCharToLetter).join('');

      if (
        bhPart === 'BH' &&
        /^\d{2}$/.test(yearPart) &&
        /^\d{4}$/.test(numPart) &&
        /^[A-Z]{2}$/.test(suffixPart)
      ) {
        const corrected = `${yearPart}${bhPart}${numPart}${suffixPart}`;
        return {
          plateText: corrected,
          confidence: Math.max(50, baseConfidence - 5),
          isReadable: true,
          isValidFormat: true,
          formatType: 'bharat',
          validationStatus: 'Valid format',
          stateCode: 'BH',
          rtoCode: yearPart,
          series: 'BH',
          plateNumber: numPart,
        };
      }
    }

    // 2. Try correcting as Standard Indian Format (length 8 to 11)
    if (candidate.length >= 8 && candidate.length <= 11) {
      // Last 4 characters are always the registration number digits
      const rawNumber = candidate.slice(-4);
      const correctedNumber = rawNumber.split('').map(correctCharToDigit).join('');
      if (!/^\d{4}$/.test(correctedNumber)) {
        continue;
      }

      // First 2 characters are always the state code letters
      const rawState = candidate.slice(0, 2);
      const correctedState = rawState.split('').map(correctCharToLetter).join('');
      if (!VALID_INDIAN_STATE_CODES.has(correctedState)) {
        continue;
      }

      // Middle characters: between index 2 and length - 4
      const rawMiddle = candidate.slice(2, candidate.length - 4);
      const middleLen = rawMiddle.length; // Can be 2, 3, 4, or 5 (rtoLen 1-2 + seriesLen 1-3)

      // Test all possible partitions of (rtoLen: 1..2, seriesLen: 1..3)
      for (const rtoLen of [1, 2]) {
        const seriesLen = middleLen - rtoLen;
        if (seriesLen >= 1 && seriesLen <= 3) {
          const rawRto = rawMiddle.slice(0, rtoLen);
          const rawSeries = rawMiddle.slice(rtoLen);

          const correctedRto = rawRto.split('').map(correctCharToDigit).join('');
          const correctedSeries = rawSeries.split('').map(correctCharToLetter).join('');

          if (/^\d+$/.test(correctedRto) && /^[A-Z]+$/.test(correctedSeries)) {
            const correctedPlate = `${correctedState}${correctedRto}${correctedSeries}${correctedNumber}`;
            return {
              plateText: correctedPlate,
              confidence: Math.max(50, baseConfidence - 5),
              isReadable: true,
              isValidFormat: true,
              formatType: 'standard',
              validationStatus: 'Valid format',
              stateCode: correctedState,
              rtoCode: correctedRto,
              series: correctedSeries,
              plateNumber: correctedNumber,
            };
          }
        }
      }
    }
  }

  // If validation fails after all correction attempts, return best-guess text marked for operator review
  return {
    plateText: clean,
    confidence: ocrConf,
    isReadable: clean.length >= 4,
    isValidFormat: false,
    formatType: 'invalid',
    validationStatus: 'Unreadable / invalid format',
  };
}

/**
 * Locates and tightly isolates the license plate character region
 * Removes outer dealership frames, bumper stickers, badges, and background bodywork.
 */
export function isolatePlateCharacterRegion(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Compute horizontal and vertical high-frequency edge projections
  const horizEdges = new Float32Array(height);
  const vertEdges = new Float32Array(width);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const left = ((y * width + (x - 1)) * 4);
      const right = ((y * width + (x + 1)) * 4);
      const top = (((y - 1) * width + x) * 4);
      const bottom = (((y + 1) * width + x) * 4);

      // Sobel gradient magnitude
      const lumX = Math.abs(data[right] - data[left]);
      const lumY = Math.abs(data[bottom] - data[top]);
      const grad = lumX + lumY;

      if (grad > 45) {
        horizEdges[y] += grad;
        vertEdges[x] += grad;
      }
    }
  }

  // Find vertical window containing dense text characters
  let maxVertDensity = 0;
  let bestY = Math.floor(height * 0.2);
  const windowH = Math.floor(height * 0.55);

  for (let y = 0; y <= height - windowH; y++) {
    let sum = 0;
    for (let k = 0; k < windowH; k++) sum += horizEdges[y + k];
    if (sum > maxVertDensity) {
      maxVertDensity = sum;
      bestY = y;
    }
  }

  // Find horizontal character bounds inside that text band (trimming dealership borders & screw tabs)
  const marginX = Math.floor(width * 0.08);
  let minX = marginX;
  let maxX = width - marginX;

  const threshold = 150;
  for (let x = marginX; x < width - marginX; x++) {
    if (vertEdges[x] > threshold) {
      minX = x;
      break;
    }
  }
  for (let x = width - marginX; x > minX; x--) {
    if (vertEdges[x] > threshold) {
      maxX = x;
      break;
    }
  }

  return {
    minX: Math.max(0, minX - 4),
    minY: Math.max(0, bestY - 2),
    maxX: Math.min(width, maxX + 4),
    maxY: Math.min(height, bestY + windowH + 2),
  };
}

// Extract vehicle plate region from video element and run ANPR via Server-Side FastALPR
export async function extractAndReadLicensePlate(
  video: HTMLVideoElement,
  vehicleBbox: BoundingBox,
  trackId?: number
): Promise<ANPRResult> {
  const vW = video.videoWidth;
  const vH = video.videoHeight;
  if (!vW || !vH || video.readyState < 2) {
    return {
      plateText: '',
      confidence: 0,
      isReadable: false,
      isValidFormat: false,
      formatType: 'invalid',
      validationStatus: 'Video not ready',
      isDistanceGated: false,
      processedAt: Date.now(),
    };
  }

  // Extract full vehicle crop with 8% margin to preserve bumpers and plates
  const padX = vehicleBbox.width * 0.08;
  const padY = vehicleBbox.height * 0.08;
  const rawCropX = Math.max(0, (vehicleBbox.x - padX) * vW);
  const rawCropY = Math.max(0, (vehicleBbox.y - padY) * vH);
  const rawCropW = Math.min(vW - rawCropX, (vehicleBbox.width + padX * 2) * vW);
  const rawCropH = Math.min(vH - rawCropY, (vehicleBbox.height + padY * 2) * vH);

  // Microscopic fragment check (<20x10 px)
  if (rawCropW < 20 || rawCropH < 10) {
    return {
      plateText: '',
      confidence: 0,
      isReadable: false,
      isValidFormat: false,
      formatType: 'distance_gated',
      validationStatus: 'Plate not legible at this distance',
      isDistanceGated: true,
      attempts: 1,
      processedAt: Date.now(),
    };
  }

  const cropCanvas = document.createElement('canvas');
  // For small crops, preserve resolution or upscale 2x so high-frequency plate edges are preserved
  const scaleFactor = rawCropW < 300 ? 2 : 1;
  const targetW = Math.round(rawCropW * scaleFactor);
  const targetH = Math.round(rawCropH * scaleFactor);

  cropCanvas.width = targetW;
  cropCanvas.height = targetH;
  const cCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
  if (!cCtx) {
    return {
      plateText: '',
      confidence: 0,
      isReadable: false,
      isValidFormat: false,
      formatType: 'invalid',
      validationStatus: 'Canvas context error',
      isDistanceGated: false,
      attempts: 1,
      processedAt: Date.now(),
    };
  }
  // High quality image smoothing
  cCtx.imageSmoothingEnabled = true;
  cCtx.imageSmoothingQuality = 'high';
  cCtx.drawImage(video, rawCropX, rawCropY, rawCropW, rawCropH, 0, 0, targetW, targetH);
  const cropDataUrl = cropCanvas.toDataURL('image/jpeg', 0.88);

  // 1. Send vehicle crop to server-side Fast-ALPR pipeline (Multi-scale YOLOv9 + RapidOCR + CLAHE)
  try {
    const res = await fetch('/api/vision/anpr/read-crop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cropBase64: cropDataUrl,
        track_id: trackId,
        min_w: Math.max(35, Math.round(vW * 0.035)),
        min_h: Math.max(15, Math.round(vH * 0.02)),
      }),
      signal: AbortSignal.timeout(3500),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok') {
        const text = data.plateText || '';
        const isValid = Boolean(data.isValidFormat);
        const isDistGated = Boolean(data.isDistanceGated);
        let vstatus = data.validationStatus || (isValid ? 'Valid format' : 'Needs review');

        return {
          plateText: text,
          confidence: data.confidence || 0,
          isReadable: Boolean(data.isReadable),
          isValidFormat: isValid,
          formatType: data.formatType || 'invalid',
          validationStatus: vstatus,
          stateCode: data.stateCode,
          plateNumber: data.plateNumber || text,
          cropDataUrl: data.plateCropDataUrl || cropDataUrl,
          plateCropDataUrl: data.plateCropDataUrl,
          vehicleCropDataUrl: data.vehicleCropDataUrl || cropDataUrl,
          charConfidences: data.charConfidences,
          scaleUsed: data.scaleUsed,
          attempts: data.attempts || 1,
          isDistanceGated: isDistGated,
          processedAt: data.processedAt || Date.now(),
        };
      }
    }
  } catch {
    // Upstream server busy or unreachable; fallback below
  }

  // Fallback: If server is unavailable, mark distance gated only if vehicle box is genuinely tiny
  const isDistanceGated = rawCropW < Math.max(35, Math.round(vW * 0.035)) && rawCropH < Math.max(15, Math.round(vH * 0.02));
  return {
    plateText: '',
    confidence: 0,
    isReadable: false,
    isValidFormat: false,
    formatType: isDistanceGated ? 'distance_gated' : 'invalid',
    validationStatus: isDistanceGated ? 'Plate not legible at this distance' : 'Plate not detected / obscured',
    isDistanceGated,
    vehicleCropDataUrl: cropDataUrl,
    cropDataUrl,
    attempts: 1,
    processedAt: Date.now(),
  };
}

// Consistent deterministic hash for plate data lookup
function hashPlateString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// =========================================================================
// SIMULATED / DEMO VEHICLE REGISTRY DATA
// NOTE: All vehicle registration data, owners, contacts, and vehicle dossiers
// below are strictly SIMULATED / DEMO DATA for prototype verification. They are
// NOT sourced from or connected to real RTO, Vahan, or governmental databases.
// =========================================================================

// Curated demo databases for realistic surveillance lookup (SIMULATED / DEMO DATA)
const DEMO_MAKES_MODELS = [
  { make: 'Toyota', model: 'Innova Crysta', class: 'Multi-Utility Vehicle (MUV)', fuel: 'Diesel' },
  { make: 'Tata', model: 'Nexon EV', class: 'Compact Electric SUV', fuel: 'Electric (BEV)' },
  { make: 'Mahindra', model: 'Scorpio-N', class: 'Four-Wheel Drive SUV', fuel: 'Diesel' },
  { make: 'Maruti Suzuki', model: 'Ertiga Hybrid', class: 'Multi-Passenger MPV', fuel: 'Hybrid (CNG/Petrol)' },
  { make: 'Hyundai', model: 'Creta SX', class: 'Mid-Size SUV', fuel: 'Gasoline' },
  { make: 'Ford', model: 'Transit Cargo Van', class: 'Commercial Cargo Van', fuel: 'Diesel' },
  { make: 'Honda', model: 'City Sedan', class: 'Passenger Sedan', fuel: 'Gasoline' },
  { make: 'Volvo', model: 'FH16 Heavy Hauler', class: 'Heavy Commercial Transport', fuel: 'Diesel' },
  { make: 'Tata', model: 'Ace Gold Mini-Truck', class: 'Light Commercial Vehicle', fuel: 'Diesel' },
  { make: 'Royal Enfield', model: 'Classic 350', class: 'Motorcycle', fuel: 'Gasoline' },
];

// =============================================================================
// REGISTRY INTEGRITY & SIMULATED VEHICLE DATABASE
// =============================================================================

// Named confidence threshold constants
export const ANPR_CONF_HIGH = 80;
export const ANPR_CONF_MEDIUM = 60;
export const ANPR_CONF_MIN = 40;

// Curated simulated records with explicitly fake names and reserved test numbers
// Never shares the same owner across vehicles.
export const SIMULATED_VEHICLE_DATABASE: Record<string, any> = {
  ...(seededRegistryJson as Record<string, any>),
  'DL01AB1234': {
    plateNumber: 'DL01AB1234',
    registeredOwner: 'Simulated Citizen 01 (Test)',
    vehicleMake: 'Hyundai',
    vehicleModel: 'Creta SX',
    vehicleClass: 'Compact SUV',
    color: 'Titan Grey',
    fuelType: 'Gasoline',
    registrationDate: '10 Feb 2021',
    registrationStatus: 'Valid',
    year: 2021,
    ownerPhone: '+91 99999 00001',
    lastKnownLocation: 'North Perimeter Gate - Node 01',
    validationStatus: 'Valid format',
    formatType: 'standard',
    stateName: 'Delhi NCT (DL)',
    rtoOffice: 'Mall Road RTO (DL-01)',
    hasRecord: true,
    isSimulated: true,
  },
  'MH12AB4029': {
    plateNumber: 'MH12AB4029',
    registeredOwner: 'Simulated Citizen 02 (Test)',
    vehicleMake: 'Toyota',
    vehicleModel: 'Innova Crysta',
    vehicleClass: 'Multi-Utility Vehicle (MUV)',
    color: 'Silver Metallic',
    fuelType: 'Diesel',
    registrationDate: '14 May 2021',
    registrationStatus: 'Valid',
    year: 2022,
    ownerPhone: '+91 99999 00002',
    lastKnownLocation: 'North Perimeter Gate - Node 01',
    validationStatus: 'Valid format',
    formatType: 'standard',
    stateName: 'Maharashtra (MH)',
    rtoOffice: 'Pune RTO (MH-12)',
    hasRecord: true,
    isSimulated: true,
  },
  'DL01CZ9876': {
    plateNumber: 'DL01CZ9876',
    registeredOwner: 'Simulated Citizen 03 (Test)',
    vehicleMake: 'Tata',
    vehicleModel: 'Nexon EV',
    vehicleClass: 'Compact Electric SUV',
    color: 'Arctic Pearl White',
    fuelType: 'Electric (BEV)',
    registrationDate: '19 Jan 2023',
    registrationStatus: 'Valid',
    year: 2023,
    ownerPhone: '+91 99999 00003',
    lastKnownLocation: 'East Terminal Checkpoint - Node 02',
    validationStatus: 'Valid format',
    formatType: 'standard',
    stateName: 'Delhi NCT (DL)',
    rtoOffice: 'Mall Road RTO (DL-01)',
    hasRecord: true,
    isSimulated: true,
  },
  'UP32EV8812': {
    plateNumber: 'UP32EV8812',
    registeredOwner: 'Simulated Citizen 04 (Test)',
    vehicleMake: 'Mahindra',
    vehicleModel: 'Scorpio-N',
    vehicleClass: 'Four-Wheel Drive SUV',
    color: 'Midnight Black',
    fuelType: 'Diesel',
    registrationDate: '04 Oct 2022',
    registrationStatus: 'Watchlist Flagged',
    flagReason: 'Restricted perimeter boundary alert: unauthorized entry queue',
    year: 2022,
    ownerPhone: '+91 99999 00004',
    lastKnownLocation: 'South Cargo Gate - Node 03',
    validationStatus: 'Valid format',
    formatType: 'standard',
    stateName: 'Uttar Pradesh (UP)',
    rtoOffice: 'Lucknow RTO (UP-32)',
    hasRecord: true,
    isSimulated: true,
  },
  '22BH1234AB': {
    plateNumber: '22BH1234AB',
    registeredOwner: 'Simulated Fleet Logistics (Govt Test)',
    vehicleMake: 'Volvo',
    vehicleModel: 'FH16 Heavy Hauler',
    vehicleClass: 'Heavy Commercial Transport',
    color: 'Dark Slate Gray',
    fuelType: 'Diesel',
    registrationDate: '12 Sep 2022',
    registrationStatus: 'Valid',
    year: 2022,
    ownerPhone: '+91 99999 00005',
    lastKnownLocation: 'Loading Dock B - Node 04',
    validationStatus: 'Valid format',
    formatType: 'bharat',
    stateName: 'Bharat (BH) All-India Registry',
    rtoOffice: 'Ministry of Road Transport & Highways (MoRTH)',
    hasRecord: true,
    isSimulated: true,
  },
};

/**
 * Determine plate status per requirement:
 * - "Valid format": validated plate format and confidence >= 80%
 * - "Low confidence - needs review": validated plate format but confidence < 80%
 * - "Unreadable": unreadable OCR, format invalid, or garbage text
 */
export function determinePlateStatus(plateText: string, confidence: number): {
  status: 'Valid format' | 'Low confidence - needs review' | 'Unreadable';
  isValidFormat: boolean;
  formatType?: 'standard' | 'bharat' | 'invalid';
  cleanPlate: string;
} {
  const clean = (plateText || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean || clean.length < 8 || clean.includes('UNREADABLE') || confidence < ANPR_CONF_MIN) {
    return {
      status: 'Unreadable',
      isValidFormat: false,
      formatType: 'invalid',
      cleanPlate: clean || 'UNREADABLE',
    };
  }

  const validation = sanitizePlateText(clean, confidence);
  if (!validation.isValidFormat) {
    return {
      status: 'Unreadable',
      isValidFormat: false,
      formatType: 'invalid',
      cleanPlate: clean,
    };
  }

  if (confidence >= ANPR_CONF_HIGH) {
    return {
      status: 'Valid format',
      isValidFormat: true,
      formatType: validation.formatType,
      cleanPlate: validation.plateText || clean,
    };
  }

  return {
    status: 'Low confidence - needs review',
    isValidFormat: true,
    formatType: validation.formatType,
    cleanPlate: validation.plateText || clean,
  };
}

/**
 * Consistent lookup for vehicle and owner details per plate.
 * REGISTRY INTEGRITY:
 * - Dossier is ONLY returned for exact matches in the simulated dataset.
 * - Unreadable, low confidence, or un-matched plates return NULL (No registry record).
 * - Never invents fake owners for unread or unmatched plates.
 */
export function lookupVehicleDossier(plateNumber: string, confidence = 95): VehicleDossier | null {
  const statusInfo = determinePlateStatus(plateNumber, confidence);
  if (statusInfo.status !== 'Valid format') {
    // Unreadable and low confidence plates NEVER attach a registry dossier!
    return null;
  }

  const cleanKey = statusInfo.cleanPlate;
  const found = SIMULATED_VEHICLE_DATABASE[cleanKey];
  if (found) {
    return {
      ...found,
      plateNumber: cleanKey,
      isSimulatedDemo: true,
      isSimulated: true,
      hasRecord: true,
      validationStatus: 'Valid format',
      formatType: statusInfo.formatType || 'standard',
    };
  }

  // Exact match not in simulated database -> return null
  return null;
}
