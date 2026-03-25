// import-utils.js - Shared utilities for efficient dictionary imports
// Provides Web Worker management, chunked processing, streaming, and memory-efficient operations

class ImportUtils {
  /**
   * Generates a fast fingerprint for a large file without reading the whole thing.
   * Uses file size, last modified, and small samples from start, middle, and end.
   * @param {File} file - The file to fingerprint
   * @returns {Promise<string>} A unique fingerprint string
   */
  static async generateSmartHash(file) {
    const size = file.size;
    const lastModified = file.lastModified;
    const sampleSize = 1024; // Bytes to sample per chunk

    const chunks = [];
    
    // Start chunk
    chunks.push(await file.slice(0, sampleSize).arrayBuffer());
    
    // Middle chunk
    if (size > sampleSize * 3) {
      const mid = Math.floor(size / 2) - Math.floor(sampleSize / 2);
      chunks.push(await file.slice(mid, mid + sampleSize).arrayBuffer());
    }
    
    // End chunk
    if (size > sampleSize) {
      chunks.push(await file.slice(size - sampleSize, size).arrayBuffer());
    }

    // Combine metadata and samples into a string for hashing
    const samples = chunks.map(c => {
      const u8 = new Uint8Array(c);
      let hex = '';
      for (let i = 0; i < u8.length; i++) {
        hex += u8[i].toString(16).padStart(2, '0');
      }
      return hex;
    });

    const dataString = `${size}_${lastModified}_${samples.join('_')}`;
    
    // Simple but effective string hash (Java-style hashCode)
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash | 0; // Convert to 32bit integer
    }
    
    return `f_${size}_${(hash >>> 0).toString(36)}`;
  }

  /**
   * Checks if enough disk space is available (approximate)
   * @param {number} requiredBytes - Bytes needed
   * @returns {Promise<Object|null>} Space estimate or null if unavailable
   */
  static async checkDiskSpace(requiredBytes) {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const available = estimate.quota - estimate.usage;
      return {
        available,
        isLow: available < requiredBytes * 2, // Require 2x for safety during import
        quota: estimate.quota,
        usage: estimate.usage
      };
    }
    return null;
  }

  /**
   * Detect dictionary format from ZIP files
   * @param {JSZip} zip - Loaded JSZip instance
   * @returns {string} 'stardict' or 'yomitan'
   * @throws {Error} if format unrecognized
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
    throw new Error('Unrecognized dictionary format');
  }

  /**
   * Extract all non-directory files from ZIP as Map<filename, Uint8Array>
   * @param {JSZip} zip - Loaded JSZip instance
   * @returns {Promise<Map<string, Uint8Array>>}
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
   * Creates and initializes a Web Worker
   * @param {string} scriptPath - Path to worker script (defaults to import-worker.js)
   * @returns {Promise<Worker>}
   */
  static async createWorker(scriptPath = 'import-worker.js') {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(chrome.runtime.getURL(scriptPath));
        
        worker.onerror = e => reject(new Error(`Worker error: ${e.message}`));
        
        const onMsg = e => {
          if (e.data.type === 'WORKER_READY') {
            worker.removeEventListener('message', onMsg);
            resolve(worker);
          }
        };
        
        worker.addEventListener('message', onMsg);
        worker.postMessage({type: 'INIT'});
      } catch (err) {
        reject(new Error(`Failed to initialize worker: ${err.message}`));
      }
    });
  }

  /**
   * Send a task to a worker and handle its lifecycle
   * @param {Worker} worker - The worker instance
   * @param {string} taskType - Name of the task
   * @param {Object} data - Data to send
   * @param {Object} options - Callbacks and transferables
   * @returns {Promise<any>} Resolves when task completes
   */
  static async runWorkerTask(worker, taskType, data, { onChunk, onProgress, transfer = [] } = {}) {
    const requestId = Date.now() + Math.random();
    
    return new Promise((resolve, reject) => {
      const onMsg = e => {
        if (e.data.requestId !== requestId) return;
        
        const { type, chunk, progress, error, result } = e.data;
        
        if (type === 'CHUNK') onChunk?.(chunk);
        if (type === 'PROGRESS') onProgress?.(progress);
        if (type === 'SUCCESS') {
          worker.removeEventListener('message', onMsg);
          resolve(result);
        }
        if (type === 'ERROR') {
          worker.removeEventListener('message', onMsg);
          reject(new Error(error.message || 'Worker task failed'));
        }
      };
      
      worker.addEventListener('message', onMsg);
      worker.postMessage({ type: taskType, data, requestId }, transfer);
    });
  }

  /**
   * Create a pool of workers for parallel processing
   * @param {number} size - Number of workers
   * @returns {Promise<Object>} Worker pool interface
   */
  static async createWorkerPool(size = navigator.hardwareConcurrency || 4) {
    const workers = [];
    const queue = [];

    for (let i = 0; i < size; i++) {
      const worker = await this.createWorker();
      workers.push({
        instance: worker,
        id: i,
        busy: false
      });
    }

    const getAvailableWorker = () => workers.find(w => !w.busy);

    const processQueue = async () => {
      if (queue.length === 0) return;
      
      const worker = getAvailableWorker();
      if (!worker) return;

      const { taskType, data, options, resolve, reject } = queue.shift();
      worker.busy = true;

      try {
        const result = await this.runWorkerTask(worker.instance, taskType, data, options);
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        worker.busy = false;
        processQueue();
      }
    };

    return {
      execute: (taskType, data, options = {}) => {
        return new Promise((resolve, reject) => {
          queue.push({ taskType, data, options, resolve, reject });
          processQueue();
        });
      },
      broadcast: (taskType, data, transfer = []) => {
        const promises = workers.map((w, index) => {
          // If we have transferables, we can only transfer them to the LAST worker.
          // For previous workers, we must not transfer, which causes cloning.
          // Note: In some environments, we might need to manually clone data if transfer is used.
          const isLast = index === workers.length - 1;
          const currentTransfer = isLast ? transfer : [];
          return ImportUtils.runWorkerTask(w.instance, taskType, data, { transfer: currentTransfer });
        });
        return Promise.all(promises);
      },
      terminate: () => {
        workers.forEach(w => w.instance.terminate());
        queue.length = 0;
      },
      getStats: () => ({
        total: workers.length,
        busy: workers.filter(w => w.busy).length,
        queued: queue.length
      })
    };
  }

  /**
   * Decodes UTF-8 strings from Uint8Array efficiently
   */
  static decodeUTF8(buffer, start = 0, length = buffer.length - start) {
    const slice = buffer.subarray(start, start + length);
    return new TextDecoder('utf-8').decode(slice);
  }

  /**
   * Reads a big-endian uint32 from buffer correctly (unsigned)
   */
  static readUint32(buffer, offset) {
    return ((buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3]) >>> 0;
  }

  /**
   * Yields control to the event loop
   */
  static yieldToEventLoop() {
    return new Promise(resolve => {
      if (typeof setImmediate !== 'undefined') {
        setImmediate(resolve);
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  /**
   * Decompress if gz/dz using pako
   */
  static decompressIfNeeded(buffer, ext) {
    if (typeof pako === 'undefined') {
      throw new Error('pako library not loaded');
    }
    const u8 = new Uint8Array(buffer);
    if (ext.endsWith('.gz') || ext.endsWith('.dz')) {
      return pako.inflate(u8, { to: 'uint8array' });
    }
    return u8;
  }

  /**
   * Formats progress messages consistently
   */
  static formatProgress(operation, current, total, unit = 'entries') {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    return `${operation}: ${current.toLocaleString()}/${total.toLocaleString()} ${unit} (${pct}%)`;
  }

  /**
   * Validates file size and provides memory usage warnings
   */
  static validateImportSize(fileSize, estimatedEntries) {
    const warnings = [];
    const fileSizeMB = Math.round(fileSize / (1024 * 1024));
    
    if (fileSizeMB > 500) {
      warnings.push(`Large file: ${fileSizeMB}MB (high memory usage expected)`);
    }
    if (estimatedEntries > 1000000) {
      warnings.push(`Huge dictionary: ${estimatedEntries.toLocaleString()} entries`);
    }
    
    return {
      valid: warnings.length === 0,
      warnings,
      fileSizeMB,
      estimatedEntries
    };
  }

  /**
   * Memory-efficient JSON streaming parser for large Yomitan files
   * @param {Uint8Array} data - Raw UTF-8 bytes of a JSON array
   * @param {number} chunkSize - Read buffer size
   */
  static async *streamJsonArray(data, chunkSize = 1024 * 1024) {
    let position = 0;
    let buffer = '';
    const decoder = new TextDecoder('utf-8');
    
    let inString = false;
    let escapeNext = false;
    let braceDepth = 0;
    let bracketDepth = 0;
    let itemStart = -1;

    while (position < data.length) {
      const size = Math.min(chunkSize, data.length - position);
      const chunk = data.subarray(position, position + size);
      position += size;

      buffer += decoder.decode(chunk, { stream: true });

      let i = 0;
      while (i < buffer.length) {
        const char = buffer[i];

        if (escapeNext) {
          escapeNext = false;
          i++;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          i++;
          continue;
        }

        if (inString) {
          if (char === '"') inString = false;
          i++;
          continue;
        }

        if (char === '"') {
          inString = true;
          i++;
          continue;
        }

        if (char === '{' || char === '[') {
          // If we are at depth 1 (inside the top-level array), this is the start of a new item
          if (braceDepth === 0 && bracketDepth === 1) itemStart = i;
          
          if (char === '{') braceDepth++; else bracketDepth++;
        } else if (char === '}' || char === ']') {
          if (char === '}') braceDepth--; else bracketDepth--;
          
          // If we just finished an item at depth 1, yield it
          if (braceDepth === 0 && bracketDepth === 1 && itemStart !== -1) {
            const itemStr = buffer.substring(itemStart, i + 1);
            try {
              yield JSON.parse(itemStr);
            } catch (e) {
              console.warn('JSON stream parse error:', e.message);
            }
            itemStart = -1;
          }
        }

        i++;
      }

      // Keep only the part of the buffer from itemStart onwards
      if (itemStart !== -1) {
        buffer = buffer.substring(itemStart);
        itemStart = 0;
      } else {
        buffer = '';
      }

      await this.yieldToEventLoop();
    }
  }

  /**
   * Memory-efficient batch processor
   */
  static createBatchProcessor(batchSize = 1000, processFn) {
    let batch = [];
    let total = 0;

    return {
      add: async (item) => {
        batch.push(item);
        if (batch.length >= batchSize) {
          await processFn(batch);
          total += batch.length;
          batch = [];
          await ImportUtils.yieldToEventLoop();
        }
      },
      flush: async () => {
        if (batch.length > 0) {
          await processFn(batch);
          total += batch.length;
          batch = [];
        }
        return total;
      }
    };
  }
}

// Export
const exportObj = typeof self !== 'undefined' ? self : window;
exportObj.ImportUtils = ImportUtils;
exportObj.DictImportUtils = ImportUtils;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImportUtils;
}
