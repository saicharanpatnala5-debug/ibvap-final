import { createWorker, Worker } from 'tesseract.js';
import { ANPRResult, BoundingBox, VehicleDossier } from '../types';

let ocrWorker: Worker | null = null;
let ocrInitializing = false;
let ocrFailed = false;

async function getOcrWorker(): Promise<Worker | null> {
  if (ocrWorker) return ocrWorker;
  if (ocrFailed) return null;
  if (ocrInitializing) {
    let attempts = 0;
    while (ocrInitializing && attempts < 30) {
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }
    return ocrWorker;
  }

  try {
    ocrInitializing = true;
    const worker = await createWorker('eng');
    ocrWorker = worker;
    ocrInitializing = false;
    return worker;
  } catch (err) {
    console.warn('Tesseract OCR worker initialization note:', err);
    ocrFailed = true;
    ocrInitializing = false;
    return null;
  }
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
    'Q': '0',
    'D': '0',
    'I': '1',
    'L': '1',
    'T': '1',
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

  // If validation fails after all correction attempts, output "Unreadable"
  return unreadableResult;
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

// Extract vehicle plate region from video element and run ANPR
export async function extractAndReadLicensePlate(
  video: HTMLVideoElement,
  vehicleBbox: BoundingBox
): Promise<ANPRResult> {
  const offscreenCanvas = document.createElement('canvas');
  const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !video.videoWidth || !video.videoHeight) {
    return {
      plateText: 'Unreadable',
      confidence: 0,
      isReadable: false,
      processedAt: Date.now(),
    };
  }

  const vW = video.videoWidth;
  const vH = video.videoHeight;

  // Real plate location on a detected vehicle:
  // Usually in the lower 35% of the vehicle box, and centered horizontally (width ~ 55%)
  const rawCropX = Math.max(0, (vehicleBbox.x + vehicleBbox.width * 0.20) * vW);
  const rawCropY = Math.max(0, (vehicleBbox.y + vehicleBbox.height * 0.62) * vH);
  const rawCropW = Math.min(vW - rawCropX, vehicleBbox.width * 0.60 * vW);
  const rawCropH = Math.min(vH - rawCropY, vehicleBbox.height * 0.34 * vH);

  if (rawCropW < 24 || rawCropH < 12) {
    return {
      plateText: 'Unreadable',
      confidence: 0,
      isReadable: false,
      processedAt: Date.now(),
    };
  }

  // First pass: capture candidate bumper area
  const candidateCanvas = document.createElement('canvas');
  const candCtx = candidateCanvas.getContext('2d', { willReadFrequently: true });
  if (!candCtx) {
    return { plateText: 'Unreadable', confidence: 0, isReadable: false, processedAt: Date.now() };
  }

  const candW = 320;
  const candH = 120;
  candidateCanvas.width = candW;
  candidateCanvas.height = candH;
  candCtx.drawImage(video, rawCropX, rawCropY, rawCropW, rawCropH, 0, 0, candW, candH);

  // Isolate plate character region precisely (strip dealership borders, bumper stickers, etc.)
  const region = isolatePlateCharacterRegion(candCtx, candW, candH);
  const isolatedW = Math.max(40, region.maxX - region.minX);
  const isolatedH = Math.max(18, region.maxY - region.minY);

  // Target high-res OCR canvas
  const targetW = 280;
  const targetH = 80;
  offscreenCanvas.width = targetW;
  offscreenCanvas.height = targetH;

  // Draw tightly isolated plate region
  ctx.drawImage(
    candidateCanvas,
    region.minX,
    region.minY,
    isolatedW,
    isolatedH,
    0,
    0,
    targetW,
    targetH
  );

  // Preprocess: Grayscale + Contrast Stretch + Otsu-style Binarization
  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const d = imgData.data;

  let minLum = 255;
  let maxLum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const lumRange = Math.max(1, maxLum - minLum);
  const midpoint = minLum + lumRange * 0.48;

  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const val = lum > midpoint ? 255 : 15;
    d[i] = val;
    d[i + 1] = val;
    d[i + 2] = val;
  }
  ctx.putImageData(imgData, 0, 0);

  const cropDataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.88);

  // Run OCR
  try {
    const worker = await getOcrWorker();
    if (worker) {
      const { data } = await worker.recognize(offscreenCanvas);
      const result = sanitizePlateText(data.text, data.confidence || 0);
      if (result.isReadable && result.isValidFormat) {
        return {
          plateText: result.plateText,
          confidence: result.confidence,
          isReadable: true,
          isValidFormat: true,
          formatType: result.formatType,
          validationStatus: result.validationStatus,
          stateCode: result.stateCode,
          rtoCode: result.rtoCode,
          series: result.series,
          plateNumber: result.plateNumber,
          cropDataUrl,
          processedAt: Date.now(),
        };
      }
    }
  } catch (ocrErr) {
    console.warn('OCR processing skipped:', ocrErr);
  }

  // If unreadable, blurred, obscured, or fails Indian NHAI/RTO format: output "Unreadable" — never guess
  return {
    plateText: 'Unreadable',
    confidence: 0,
    isReadable: false,
    isValidFormat: false,
    formatType: 'invalid',
    validationStatus: 'Unreadable / invalid format',
    cropDataUrl,
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

// Curated demo databases for realistic surveillance lookup
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

const DEMO_OWNERS = [
  'R. K. Sharma',
  'Aditi Deshmukh',
  'Vikram Malhotra',
  'Sunil K. Verma',
  'Pooja Nair',
  'Rajesh Singhal',
  'National Logistics Fleet',
  'Arun Patel',
  'Kavita Reddy',
  'Anand Swaminathan',
];

const DEMO_COLORS = [
  'Silver Metallic',
  'Midnight Black',
  'Arctic Pearl White',
  'Deep Navy Blue',
  'Dark Slate Gray',
  'Crimson Red',
  'Titanium Bronze',
];

// Curated explicit records
export const SIMULATED_VEHICLE_DATABASE: Record<string, Omit<VehicleDossier, 'isSimulatedDemo'>> = {
  'MH12AB4029': {
    plateNumber: 'MH12AB4029',
    registeredOwner: 'R. K. Sharma',
    vehicleMake: 'Toyota',
    vehicleModel: 'Innova Crysta',
    vehicleClass: 'Multi-Utility Vehicle (MUV)',
    color: 'Silver Metallic',
    fuelType: 'Diesel',
    registrationDate: '14 May 2021',
    registrationStatus: 'Valid',
    year: 2022,
    ownerPhone: '+91 98201 44821',
    lastKnownLocation: 'North Perimeter Gate - Node 01',
    validationStatus: 'Valid format',
    formatType: 'standard',
    stateName: 'Maharashtra (MH)',
    rtoOffice: 'Pune RTO (MH-12)',
  },
  'DL01CZ9876': {
    plateNumber: 'DL01CZ9876',
    registeredOwner: 'Vikram Malhotra',
    vehicleMake: 'Tata',
    vehicleModel: 'Nexon EV',
    vehicleClass: 'Compact Electric SUV',
    color: 'Arctic Pearl White',
    fuelType: 'Electric (BEV)',
    registrationDate: '19 Jan 2023',
    registrationStatus: 'Valid',
    year: 2023,
    ownerPhone: '+91 98110 52391',
    lastKnownLocation: 'East Terminal Checkpoint - Node 02',
    validationStatus: 'Valid format',
    formatType: 'standard',
    stateName: 'Delhi NCT (DL)',
    rtoOffice: 'Mall Road RTO (DL-01)',
  },
  'UP32EV8812': {
    plateNumber: 'UP32EV8812',
    registeredOwner: 'Sunil K. Verma',
    vehicleMake: 'Mahindra',
    vehicleModel: 'Scorpio-N',
    vehicleClass: 'Four-Wheel Drive SUV',
    color: 'Midnight Black',
    fuelType: 'Diesel',
    registrationDate: '04 Oct 2022',
    registrationStatus: 'Watchlist Flagged',
    flagReason: 'Restricted perimeter boundary alert: unauthorized entry queue',
    year: 2022,
    ownerPhone: '+91 94500 23114',
    lastKnownLocation: 'South Cargo Gate - Node 03',
    validationStatus: 'Valid format',
    formatType: 'standard',
    stateName: 'Uttar Pradesh (UP)',
    rtoOffice: 'Lucknow RTO (UP-32)',
  },
  '22BH1234AB': {
    plateNumber: '22BH1234AB',
    registeredOwner: 'National Logistics Fleet (Central Govt)',
    vehicleMake: 'Volvo',
    vehicleModel: 'FH16 Heavy Hauler',
    vehicleClass: 'Heavy Commercial Transport',
    color: 'Dark Slate Gray',
    fuelType: 'Diesel',
    registrationDate: '12 Sep 2022',
    registrationStatus: 'Valid',
    year: 2022,
    ownerPhone: '+91 97112 00412',
    lastKnownLocation: 'Loading Dock B - Node 04',
    validationStatus: 'Valid format',
    formatType: 'bharat',
    stateName: 'Bharat (BH) All-India Registry',
    rtoOffice: 'Ministry of Road Transport & Highways (MoRTH)',
  },
  '7XYZ892': {
    plateNumber: '7XYZ892',
    registeredOwner: 'Unverified Entity',
    vehicleMake: 'Ford',
    vehicleModel: 'Transit Cargo Van',
    vehicleClass: 'Commercial Cargo Van',
    color: 'Arctic Pearl White',
    fuelType: 'Diesel',
    registrationDate: '08 Nov 2020',
    registrationStatus: 'Watchlist Flagged',
    flagReason: 'Unregistered plate format rejected by NHAI/RTO verification filter',
    year: 2021,
    ownerPhone: '+1 (555) 014-9981',
    lastKnownLocation: 'Loading Dock B - Node 04',
    validationStatus: 'Unreadable / invalid format',
    formatType: 'invalid',
    stateName: 'Non-Indian / Unrecognized Format',
    rtoOffice: 'Unverified',
  },
};

/**
 * Consistent lookup for vehicle and owner details per plate.
 * Validates plate against Indian NHAI/RTO and Bharat series standards.
 */
export function lookupVehicleDossier(plateNumber: string): VehicleDossier {
  const cleanKey = plateNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const validation = sanitizePlateText(cleanKey, 95);

  const found = SIMULATED_VEHICLE_DATABASE[cleanKey];
  if (found) {
    return {
      ...found,
      plateNumber: cleanKey,
      isSimulatedDemo: true,
      validationStatus: validation.isValidFormat ? 'Valid format' : 'Unreadable / invalid format',
      formatType: validation.formatType || 'invalid',
      stateName: found.stateName || (validation.stateCode ? INDIAN_STATE_RTO_NAMES[validation.stateCode] : undefined),
    };
  }

  // Deterministic seed generation for any other plate
  const hash = hashPlateString(cleanKey);
  const makeModel = DEMO_MAKES_MODELS[hash % DEMO_MAKES_MODELS.length];
  const owner = DEMO_OWNERS[hash % DEMO_OWNERS.length];
  const color = DEMO_COLORS[hash % DEMO_COLORS.length];
  const year = 2018 + (hash % 6);
  const day = 1 + (hash % 28);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[hash % 12];
  const regDate = `${day.toString().padStart(2, '0')} ${month} ${year}`;

  const isWatchlist = hash % 5 === 0;
  const isExpired = !isWatchlist && hash % 7 === 0;
  const status: VehicleDossier['registrationStatus'] = isWatchlist
    ? 'Watchlist Flagged'
    : isExpired
    ? 'Expired'
    : 'Valid';

  const stateName = validation.stateCode ? INDIAN_STATE_RTO_NAMES[validation.stateCode] : undefined;
  const rtoOffice = validation.rtoCode
    ? `${validation.stateCode}-${validation.rtoCode} Regional Transport Office`
    : undefined;

  return {
    plateNumber: cleanKey,
    registeredOwner: owner,
    vehicleMake: makeModel.make,
    vehicleModel: makeModel.model,
    vehicleClass: makeModel.class,
    color,
    fuelType: makeModel.fuel,
    registrationDate: regDate,
    registrationStatus: status,
    year,
    ownerPhone: `+91 9${(hash % 8900) + 1000} ${(hash % 89000) + 10000}`,
    flagReason: isWatchlist ? 'Security audit flag: Unscheduled site access' : undefined,
    lastKnownLocation: `Surveillance Ingestion Node ${(hash % 6) + 1}`,
    isSimulatedDemo: true,
    validationStatus: validation.isValidFormat ? 'Valid format' : 'Unreadable / invalid format',
    formatType: validation.formatType || 'invalid',
    stateName,
    rtoOffice,
  };
}
