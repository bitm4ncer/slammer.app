// Dithering — Tool. Phase 4b will replace this stub with the full v0.5 port.

import { sliderRow, pillGroup, makeToolRoot, colorRow } from '../../shared/ui-helpers.js';
import { dither } from './algorithms/index.js';
import { applyColorMode } from './color-modes.js';

export const ALGORITHMS = [
  { value: 'floydSteinberg', label: 'Floyd-Steinberg' },
  { value: 'atkinson', label: 'Atkinson' },
  { value: 'jarvis', label: 'Jarvis' },
  { value: 'stucki', label: 'Stucki' },
  { value: 'burkes', label: 'Burkes' },
  { value: 'sierra', label: 'Sierra' },
  { value: 'sierra2Row', label: 'Sierra 2-row' },
  { value: 'sierraLite', label: 'Sierra Lite' },
  { value: 'bayer2', label: 'Bayer 2x2' },
  { value: 'bayer4', label: 'Bayer 4x4' },
  { value: 'bayer8', label: 'Bayer 8x8' },
  { value: 'random', label: 'Random' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'halftone', label: 'Halftone' },
  { value: 'bitTone', label: 'Bit Tone' },
  { value: 'checker', label: 'Checker' },
  { value: 'radialBurst', label: 'Radial Burst' },
  { value: 'vortex', label: 'Vortex' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'wave', label: 'Wave' },
  { value: 'gridlock', label: 'Gridlock' },
  { value: 'mosaic', label: 'Mosaic' },
  { value: 'sineWave', label: 'Sine Wave' },
  { value: 'circuitGrid', label: 'Circuit Grid' },
];

export const COLOR_MODES = [
  { value: 'bw', label: 'B&W' },
  { value: 'custom', label: 'Custom' },
  { value: 'multi', label: 'Multi' },
  { value: 'rgb', label: 'RGB' },
  { value: 'cmyk', label: 'CMYK' },
];

export default {
  id: 'dithering',
  name: 'Dithering',
  version: '1.0.0',
  type: 'tool',
  icon: 'chess-board',
  category: 'crush',

  defaultParams() {
    return {
      algorithm: 'floydSteinberg',
      colorMode: 'bw',
      threshold: 128,
      strength: 1,
      // Custom (2-color) mode swatches.
      darkColor: '#000000',
      lightColor: '#FFFFFF',
      // Multi-color palette.
      palette: ['#000000', '#9392D9', '#FF6B5B', '#F7E45A', '#FFFFFF'],
      // Algorithm-specific:
      bitDepth: 1,
      mosaicSize: 8,
      patternSize: 4,
      patternAngle: 0,
      waveLength: 8,
      waveAmplitude: 4,
      waveCount: 12,
      waveThickness: 2,
      waveRotation: 0,
      waveDistance: 6,
      invert: false,
    };
  },

  process(imageData, params) {
    // Two-stage pipeline: dither into bw mask, then apply color mode.
    const out = dither(imageData, params);
    return applyColorMode(out, params);
  },

  renderUI(params, onChange) {
    const root = makeToolRoot();

    root.appendChild(pillGroup({
      label: 'Color Mode',
      options: COLOR_MODES,
      value: params.colorMode,
      onChange: (v) => onChange({ colorMode: v }),
    }));

    root.appendChild(pillGroup({
      label: 'Algorithm',
      options: ALGORITHMS,
      value: params.algorithm,
      onChange: (v) => onChange({ algorithm: v }),
    }));

    root.appendChild(sliderRow({
      label: 'Threshold', min: 0, max: 255, step: 1, value: params.threshold,
      onChange: (v) => onChange({ threshold: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Strength', min: 0, max: 1, step: 0.01, value: params.strength,
      onChange: (v) => onChange({ strength: v }),
    }));

    if (params.colorMode === 'custom') {
      root.appendChild(colorRow({
        label: 'Dark', value: params.darkColor,
        onChange: (v) => onChange({ darkColor: v }),
      }));
      root.appendChild(colorRow({
        label: 'Light', value: params.lightColor,
        onChange: (v) => onChange({ lightColor: v }),
      }));
    }

    if (params.colorMode === 'multi') {
      const swatches = document.createElement('div');
      swatches.className = 'effect-swatch-row';
      params.palette.forEach((hex, i) => {
        const sw = document.createElement('div');
        sw.className = 'effect-swatch';
        sw.style.background = hex;
        sw.innerHTML = `<input type="color" value="${hex}" />`;
        sw.querySelector('input').addEventListener('input', (e) => {
          const next = params.palette.slice();
          next[i] = e.target.value;
          onChange({ palette: next });
          sw.style.background = e.target.value;
        });
        swatches.appendChild(sw);
      });
      root.appendChild(swatches);
    }

    // Algorithm-specific extra rows.
    if (['mosaic'].includes(params.algorithm)) {
      root.appendChild(sliderRow({
        label: 'Mosaic Size', min: 2, max: 64, step: 1, value: params.mosaicSize,
        onChange: (v) => onChange({ mosaicSize: v }),
      }));
    }
    if (['sineWave', 'wave'].includes(params.algorithm)) {
      root.appendChild(sliderRow({
        label: 'Wavelength', min: 2, max: 64, step: 1, value: params.waveLength,
        onChange: (v) => onChange({ waveLength: v }),
      }));
      root.appendChild(sliderRow({
        label: 'Amplitude', min: 0, max: 32, step: 1, value: params.waveAmplitude,
        onChange: (v) => onChange({ waveAmplitude: v }),
      }));
    }
    if (['halftone', 'checker', 'gridlock', 'circuitGrid', 'diamond', 'bitTone'].includes(params.algorithm)) {
      root.appendChild(sliderRow({
        label: 'Pattern Size', min: 2, max: 32, step: 1, value: params.patternSize,
        onChange: (v) => onChange({ patternSize: v }),
      }));
    }
    if (['halftone', 'gridlock', 'mosaic'].includes(params.algorithm)) {
      root.appendChild(sliderRow({
        label: 'Angle', min: 0, max: 90, step: 1, value: params.patternAngle,
        onChange: (v) => onChange({ patternAngle: v }),
      }));
    }
    if (params.algorithm === 'bitTone') {
      root.appendChild(sliderRow({
        label: 'Bit Depth', min: 1, max: 7, step: 1, value: params.bitDepth,
        onChange: (v) => onChange({ bitDepth: v }),
      }));
    }

    return root;
  },
};
