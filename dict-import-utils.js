// dict-import-utils.js - Shared utilities for dictionary imports
// ZIP handling, format detection, worker management, progress, validation, streaming

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

  /**
   * Create a streaming reader for large files to avoid loading everything into memory
   */
  static createStreamingReader(data, chunkSize = 64 * 1024) {
    return {
      data,
      position: 0,
      chunkSize,
      eof: false,

      readNext() {
        if (this.eof) return null;

        const remaining = this.data.length - this.position;
        const size = Math.min(this.chunkSize, remaining);
        const chunk = this.data.subarray(this.position, this.position + size);

        this.position += size;
        this.eof = this.position >= this.data.length;

        return chunk;
      },

      peek(size = 1) {
        if (this.position + size > this.data.length) return null;
        return this.data.subarray(this.position, this.position + size);
      },

      skip(bytes) {
        this.position = Math.min(this.position + bytes, this.data.length);
        this.eof = this.position >= this.data.length;
      },

      getPosition() {
        return this.position;
      },

      isEOF() {
        return this.eof;
      },

      getProgress() {
        return this.data.length > 0 ? this.position / this.data.length : 1;
      }
    };
  }

  /**
   * Memory-efficient JSON streaming parser for large Yomitan files
   */
  static async *streamJsonArray(data, chunkSize = 1024 * 1024) {
    const reader = this.createStreamingReader(data, chunkSize);
    let buffer = '';
    let inString = false;
    let escapeNext = false;
    let braceDepth = 0;
    let bracketDepth = 0;
    let objectStart = -1;

    while (!reader.isEOF()) {
      const chunk = reader.readNext();
      if (!chunk) break;

      const text = new TextDecoder('utf-8').decode(chunk);
      buffer += text;

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
          if (char === '"') {
            inString = false;
          }
          i++;
          continue;
        }

        if (char === '"') {
          inString = true;
          i++;
          continue;
        }

        if (char === '{') {
          if (braceDepth === 0 && bracketDepth === 1) {
            objectStart = i;
          }
          braceDepth++;
        } else if (char === '}') {
          braceDepth--;
          if (braceDepth === 0 && bracketDepth === 1 && objectStart !== -1) {
            // Found complete object
            const objectStr = buffer.substring(objectStart, i + 1);
            try {
              const obj = JSON.parse(objectStr);
              yield obj;
            } catch (e) {
              console.warn('Failed to parse JSON object:', e.message);
            }
            objectStart = -1;
          }
        } else if (char === '[') {
          bracketDepth++;
        } else if (char === ']') {
          bracketDepth--;
        }

        i++;
      }

      // Keep only incomplete data in buffer
      if (objectStart !== -1) {
        buffer = buffer.substring(objectStart);
      } else {
        buffer = '';
      }

      // Yield control to prevent blocking
      await new Promise(resolve => setImmediate ? setImmediate(resolve) : setTimeout(resolve, 0));
    }
  }

  /**
   * Create worker pool for parallel processing
   */
  static async createWorkerPool(size = 4) {
    const workers = [];
    const queue = [];
    let nextWorkerId = 0;

    // Initialize workers
    for (let i = 0; i < size; i++) {
      const worker = await this.createWorker();
      workers.push({
        worker,
        id: i,
        busy: false,
        currentTask: null
      });
    }

    const getNextWorker = () => {
      const available = workers.filter(w => !w.busy);
      if (available.length > 0) {
        return available[0];
      }
      return null;
    };

    const processQueue = async () => {
      while (queue.length > 0) {
        const worker = getNextWorker();
        if (!worker) break;

        const task = queue.shift();
        await executeTask(worker, task);
      }
    };

    const executeTask = async (worker, { taskType, data, onChunk, onProgress, onComplete, onError }) => {
      worker.busy = true;
      worker.currentTask = { taskType, data };

      try {
        await this.runWorkerTask(
          worker.worker,
          taskType,
          data,
          (chunk) => {
            onChunk?.(chunk);
          },
          (progress) => {
            onProgress?.(progress);
          },
          (error) => {
            onError?.(error);
          }
        );
        onComplete?.();
      } catch (error) {
        onError?.(error);
      } finally {
        worker.busy = false;
        worker.currentTask = null;
        processQueue(); // Process next queued task
      }
    };

    return {
      execute: async (taskType, data, callbacks = {}) => {
        const worker = getNextWorker();
        if (worker) {
          return executeTask(worker, { taskType, data, ...callbacks });
        } else {
          // Queue task for later
          queue.push({ taskType, data, ...callbacks });
        }
      },

      terminate: () => {
        workers.forEach(w => w.worker.terminate());
        queue.length = 0;
      },

      getStats: () => ({
        totalWorkers: workers.length,
        busyWorkers: workers.filter(w => w.busy).length,
        queuedTasks: queue.length
      })
    };
  }

  /**
   * Memory-efficient batch processor with automatic cleanup
   */
  static createBatchProcessor(batchSize = 1000, processFn) {
    let batch = [];
    let totalProcessed = 0;

    const flush = async () => {
      if (batch.length === 0) return;

      try {
        await processFn(batch);
        totalProcessed += batch.length;
      } finally {
        batch = []; // Clear batch to free memory
        // Force garbage collection hint
        if (global.gc) {
          global.gc();
        }
      }
    };

    return {
      add: async (item) => {
        batch.push(item);
        if (batch.length >= batchSize) {
          await flush();
        }
      },

      flush: () => flush(),

      getStats: () => ({
        currentBatchSize: batch.length,
        totalProcessed
      })
    };
  }

  /**
   * Optimized memory pool for reusable buffers
   */
  static createBufferPool(initialSize = 10, bufferSize = 64 * 1024) {
    const pool = [];
    const used = new Set();

    // Pre-allocate buffers
    for (let i = 0; i < initialSize; i++) {
      pool.push(new Uint8Array(bufferSize));
    }

    return {
      acquire: () => {
        let buffer = pool.pop();
        if (!buffer) {
          buffer = new Uint8Array(bufferSize);
        }
        used.add(buffer);
        return buffer;
      },

      release: (buffer) => {
        if (used.has(buffer)) {
          used.delete(buffer);
          // Clear buffer contents
          buffer.fill(0);
          pool.push(buffer);
        }
      },

      getStats: () => ({
        available: pool.length,
        used: used.size,
        total: pool.length + used.size
      }),

      cleanup: () => {
        pool.length = 0;
        used.clear();
      }
    };
  }
}

// Export
if (typeof module !== 'undefined') module.exports = DictImportUtils;
else window.DictImportUtils = DictImportUtils;
