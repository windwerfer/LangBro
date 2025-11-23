// dict-import-utils.js - Shared utilities for dictionary imports
// ZIP handling, format detection, worker management, progress, validation

class DictImportUtils {
  /**
   * Detect dictionary format from ZIP files
   */
  static detectFormat(zip) {
    const files = Object.keys(zip.files);
    const hasIfo = files.some(f => f.endsWith('.ifo'));
    const hasIdx = files.some(f => f.endsWith('.idx') || f.endsWith('.idx.gz'));
    const hasDict = files.some(f => f.endsWith('.dict') || f.endsWith('.dict.gz') || f.endsWith('.dict.dz'));
    const hasYomitanIndex = files.some(f => f === 'index.json');
    const hasYomitanTerms = files.some(f => f === 'term_bank_1.json' || f === 'term_bank_2.json');

    if (hasIfo && hasIdx && hasDict) return 'stardict';
    if (hasYomitanIndex || hasYomitanTerms) return 'yomitan';
    throw new Error('Unrecognized format');
  }

  /**
   * Extract all non-dir files from ZIP as Map<fname, Uint8Array>
   */
  static async extractZipFiles(zip) {
    const files = new Map();
    for (const [fname, entry] of Object.entries(zip.files)) {
      if (!entry.dir) {
        files.set(fname, await entry.async('uint8array'));
      }
    }
    return files;
  }

  /**
   * Create configured import worker
   */
  static async createWorker() {
    return new Promise((resolve, reject) => {
      const worker = new Worker(chrome.runtime.getURL('import-worker.js'));
      worker.onerror = e => reject(new Error(`Worker error: ${e.message}`));
      const onMsg = e => {
        if (e.data.type === 'WORKER_READY') {
          worker.removeEventListener('message', onMsg);
          resolve(worker);
        }
      };
      worker.addEventListener('message', onMsg);
      worker.postMessage({type: 'INIT'});
    });
  }

  /**
   * Send cancellable task to worker, handle chunks/progress/errors
   */
  static async runWorkerTask(worker, taskType, data, onChunk, onProgress, onError) {
    const abort = new AbortController();
    const id = Date.now();
    worker.postMessage({type: taskType, data, requestId: id, signal: abort.signal});

    return new Promise((resolve, reject) => {
      const onMsg = e => {
        const {type, requestId, chunk, progress, error} = e.data;
        if (requestId !== id) return;
        if (type === 'CHUNK') onChunk?.(chunk);
        if (type === 'PROGRESS') onProgress?.(progress);
        if (type === 'SUCCESS') {
          worker.removeEventListener('message', onMsg);
          resolve();
        }
        if (type === 'ERROR') {
          worker.removeEventListener('message', onMsg);
          reject(new Error(error.message));
        }
      };
      worker.addEventListener('message', onMsg);
    });
  }

  /**
   * Format progress string
   */
  static formatProgress(current, total, unit = 'entries') {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    return `${current}/${total} ${unit} (${pct}%)`;
  }

  /**
   * Validate import size, return warnings
   */
  static validateSize(fileSizeMB, estEntries) {
    const warnings = [];
    if (fileSizeMB > 500) warnings.push(`Large file: ${fileSizeMB}MB RAM expected`);
    if (estEntries > 1e6) warnings.push(`Huge dict: ${estEntries.toLocaleString()} entries`);
    return {valid: warnings.length === 0, warnings};
  }

  /**
   * Decompress if gz/dz using pako
   */
  static decompressIfNeeded(buffer, ext) {
    const u8 = new Uint8Array(buffer);
    if (ext === '.gz') return pako.inflate(u8, {to: 'uint8array'});
    if (ext === '.dz') return pako.inflate(u8, {to: 'uint8array'});
    return u8;
  }
}

// Export
if (typeof module !== 'undefined') module.exports = DictImportUtils;
else window.DictImportUtils = DictImportUtils;
