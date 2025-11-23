// import-utils.js - Shared utilities for efficient dictionary imports
// Provides Web Worker management, chunked processing, and memory-efficient operations

class ImportUtils {
  /**
   * Creates and manages a Web Worker for import operations
   * @param {string} workerScript - Path to the worker script
   * @returns {Promise<Worker>} Configured worker instance
   */
  static async createImportWorker(workerScript) {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(chrome.runtime.getURL(workerScript));

        // Set up error handling
        worker.onerror = (error) => {
          console.error('Import worker error:', error);
          reject(new Error(`Worker error: ${error.message}`));
        };

        // Wait for worker ready signal
        const readyHandler = (event) => {
          if (event.data.type === 'WORKER_READY') {
            worker.removeEventListener('message', readyHandler);
            resolve(worker);
          }
        };

        worker.addEventListener('message', readyHandler);

        // Initialize worker
        worker.postMessage({ type: 'INIT' });

      } catch (error) {
        reject(new Error(`Failed to create worker: ${error.message}`));
      }
    });
  }

  /**
   * Processes data in chunks with progress callbacks
   * @param {Array} data - Data to process
   * @param {number} chunkSize - Size of each chunk
   * @param {Function} processor - Function to process each chunk
   * @param {Function} progressCallback - Called with progress updates
   * @param {Function} shouldCancel - Function that returns true if operation should cancel
   */
  static async processInChunks(data, chunkSize, processor, progressCallback = null, shouldCancel = () => false) {
    const totalItems = data.length;
    let processedItems = 0;

    for (let i = 0; i < totalItems; i += chunkSize) {
      if (shouldCancel()) {
        throw new Error('Operation cancelled');
      }

      const chunk = data.slice(i, i + chunkSize);
      await processor(chunk, i, totalItems);

      processedItems += chunk.length;

      if (progressCallback) {
        const progress = Math.round((processedItems / totalItems) * 100);
        progressCallback(progress, processedItems, totalItems);
      }

      // Yield control to prevent blocking
      await this.yieldToEventLoop();
    }
  }

  /**
   * Yields control to the event loop to prevent blocking
   */
  static yieldToEventLoop() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  /**
   * Efficiently decodes UTF-8 strings from Uint8Array with caching
   * @param {Uint8Array} buffer - Buffer to decode
   * @param {number} start - Start offset
   * @param {number} length - Length to decode
   * @returns {string} Decoded string
   */
  static decodeUTF8(buffer, start = 0, length = buffer.length - start) {
    // Use TextDecoder for better performance
    const slice = buffer.subarray(start, start + length);
    return new TextDecoder('utf-8').decode(slice);
  }

  /**
   * Memory-efficient buffer slicing that reuses memory when possible
   * @param {Uint8Array} buffer - Source buffer
   * @param {number} start - Start offset
   * @param {number} end - End offset
   * @returns {Uint8Array} Sliced buffer
   */
  static sliceBuffer(buffer, start, end) {
    return buffer.subarray(start, end);
  }

  /**
   * Creates a cancellable operation wrapper
   * @param {Function} operation - The operation to wrap
   * @returns {Object} Object with operation promise and cancel function
   */
  static createCancellableOperation(operation) {
    let cancelled = false;

    const cancel = () => {
      cancelled = true;
    };

    const promise = (async () => {
      try {
        const result = await operation(() => cancelled);
        if (cancelled) {
          throw new Error('Operation cancelled');
        }
        return result;
      } catch (error) {
        if (cancelled) {
          throw new Error('Operation cancelled');
        }
        throw error;
      }
    })();

    return { promise, cancel };
  }

  /**
   * Formats progress messages consistently
   * @param {string} operation - Current operation name
   * @param {number} current - Current progress
   * @param {number} total - Total items
   * @param {string} unit - Unit name (e.g., 'entries', 'bytes')
   * @returns {string} Formatted progress message
   */
  static formatProgress(operation, current, total, unit = 'entries') {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    return `${operation}: ${current}/${total} ${unit} (${percentage}%)`;
  }

  /**
   * Validates file size and provides memory usage estimates
   * @param {number} fileSize - File size in bytes
   * @param {number} estimatedEntries - Estimated number of entries
   * @returns {Object} Validation result with warnings
   */
  static validateImportSize(fileSize, estimatedEntries) {
    const warnings = [];
    const recommendations = [];

    // Memory usage estimates (rough)
    const estimatedMemoryMB = Math.ceil((fileSize * 2 + estimatedEntries * 200) / (1024 * 1024));

    if (estimatedMemoryMB > 500) {
      warnings.push(`Large import detected: ~${estimatedMemoryMB}MB memory usage expected`);
      recommendations.push('Consider importing smaller dictionaries or in batches');
    }

    if (estimatedEntries > 100000) {
      warnings.push(`Large dictionary: ${estimatedEntries.toLocaleString()} entries`);
      recommendations.push('Import may take several minutes');
    }

    return {
      valid: warnings.length === 0,
      warnings,
      recommendations,
      estimatedMemoryMB,
      estimatedEntries
    };
  }

  /**
   * Safely terminates a Web Worker
   * @param {Worker} worker - Worker to terminate
   */
  static terminateWorker(worker) {
    if (worker && typeof worker.terminate === 'function') {
      try {
        worker.terminate();
      } catch (error) {
        console.warn('Error terminating worker:', error);
      }
    }
  }

  /**
   * Creates a timeout promise that rejects after specified time
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise} Promise that rejects on timeout
   */
  static createTimeout(timeoutMs) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });
  }

  /**
   * Combines multiple promises with timeout and cancellation
   * @param {Promise[]} promises - Promises to combine
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {Function} shouldCancel - Cancellation check function
   * @returns {Promise} Combined promise
   */
  static async withTimeoutAndCancellation(promises, timeoutMs, shouldCancel = () => false) {
    const timeoutPromise = this.createTimeout(timeoutMs);

    while (!shouldCancel()) {
      try {
        return await Promise.race([...promises, timeoutPromise]);
      } catch (error) {
        if (error.message.includes('timed out')) {
          throw error;
        }
        // Retry on other errors unless cancelled
        await this.yieldToEventLoop();
      }
    }

    throw new Error('Operation cancelled');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined') {
  module.exports = ImportUtils;
} else if (typeof window !== 'undefined') {
  window.ImportUtils = ImportUtils;
}