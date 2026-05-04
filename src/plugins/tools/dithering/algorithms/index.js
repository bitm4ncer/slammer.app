// Stub dispatcher — replaced in Phase 4b with full algorithm modules.
// For now, exposes a minimal Floyd-Steinberg + threshold so the app is functional.

import { floydSteinberg } from './floyd-steinberg.js';
import { atkinson } from './atkinson.js';
import { ordered } from './ordered.js';
import { thresholdAlgo, randomAlgo } from './basic.js';
import { errorDiffusion } from './error-diffusion.js';
import { halftone, checker, mosaic, sineWave, gridlock, circuitGrid, diamond, wave, bitTone, radialBurst, vortex } from './patterns.js';

const map = {
  floydSteinberg, atkinson, jarvis: errorDiffusion.bind(null, 'jarvis'),
  stucki: errorDiffusion.bind(null, 'stucki'),
  burkes: errorDiffusion.bind(null, 'burkes'),
  sierra: errorDiffusion.bind(null, 'sierra'),
  sierra2Row: errorDiffusion.bind(null, 'sierra2Row'),
  sierraLite: errorDiffusion.bind(null, 'sierraLite'),
  bayer2: ordered.bind(null, 2),
  bayer4: ordered.bind(null, 4),
  bayer8: ordered.bind(null, 8),
  random: randomAlgo,
  threshold: thresholdAlgo,
  halftone, checker, mosaic, sineWave, gridlock, circuitGrid,
  diamond, wave, bitTone, radialBurst, vortex,
};

export function dither(imageData, params) {
  const fn = map[params.algorithm] || floydSteinberg;
  return fn(imageData, params);
}
