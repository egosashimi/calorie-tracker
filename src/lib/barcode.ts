import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

// Serve the decoder from this app (works offline, no third-party CDN).
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  },
});

export const RETAIL_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export function createDetector() {
  return new BarcodeDetector({ formats: [...RETAIL_FORMATS] });
}

export { upcEtoA, normalizeScan, validGtin } from './barcode-utils';
