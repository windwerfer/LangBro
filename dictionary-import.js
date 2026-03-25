// dictionary-import.js - Non-blocking dictionary import system coordination
// Uses StarDictImporter and YomitanDictionaryImporter for actual processing

class DictionaryImporter {
  constructor(options) {
    this.getStructuredDB = options.getStructuredDB;
    this.showStatus = options.showStatus;
    this.loadCurrentDict = options.loadCurrentDict;
  }

  init() {
    const importBtn = document.getElementById('importDictionaryBtn');
    if (importBtn) {
      importBtn.addEventListener('click', () => this.handleUnifiedImport());
    }
  }

  async handleUnifiedImport() {
    // Load JSZip if not available
    if (typeof JSZip === 'undefined') {
      this.showStatus('Loading JSZip library...', 'info');
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = chrome.runtime.getURL('jszip.min.js');
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load JSZip library'));
          document.head.appendChild(script);
        });
        this.showStatus('JSZip library loaded successfully.', 'info');
      } catch (error) {
        this.showStatus(error.message + '. Please refresh the page.', 'error');
        return;
      }
    }

    // Check if required libraries are loaded
    if (typeof StarDictImporter === 'undefined') {
      this.showStatus('Error: StarDictImporter not loaded.', 'error');
      return;
    }
    if (typeof YomitanDictionaryImporter === 'undefined') {
      this.showStatus('Error: YomitanDictionaryImporter not loaded.', 'error');
      return;
    }

    const fileInput = document.getElementById('dictionaryZipInput');
    const files = Array.from(fileInput.files);
    if (files.length === 0) {
      this.showStatus('Please select one or more ZIP files.', 'error');
      return;
    }

    // Process files in parallel with concurrency control
    await this.processFilesInParallel(files);
  }

  /**
   * Process multiple files in parallel with controlled concurrency
   */
  async processFilesInParallel(files, maxConcurrency = 2) {
    const semaphore = new Semaphore(maxConcurrency);
    let processedCount = 0;
    const totalFiles = files.length;
    let lastProgressUpdate = 0;

    this.showStatus(`Starting import of ${totalFiles} file(s)...`, 'info');

    const processFile = async (file, index) => {
      await semaphore.acquire();
      try {
        this.showStatus(`Processing file ${index + 1} of ${totalFiles}: ${file.name}`, 'info');
        
        // Use JSZip to load the zip
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        // Detect format
        const format = await this.detectDictionaryFormat(zip);
        this.showStatus(`Detected ${format} format for ${file.name}`, 'info');

        if (format === 'stardict') {
          const importer = new StarDictImporter({
            showStatus: (msg, type) => this.showStatus(`[${file.name}] ${msg}`, type),
            getDB: this.getStructuredDB
          });
          await importer.importFromZip(zip);
        } else if (format === 'yomitan') {
          const db = await this.getStructuredDB();
          const importer = new YomitanDictionaryImporter();
          if (importer.setStatusCallback) {
            importer.setStatusCallback((msg, type) => this.showStatus(`[${file.name}] ${msg}`, type));
          }
          importer.setProgressCallback((progress) => {
            const typeLabel = progress.type ? `${progress.type}: ` : '';
            this.showStatus(`[${file.name}] Importing... ${typeLabel}${progress.index}/${progress.count}`, 'info');
          });
          const result = await importer.importDictionary(db, arrayBuffer);
          if (!result.success) throw new Error(result.error);
        }

        processedCount++;
        this.showStatus(`Successfully imported ${file.name}`, 'success');
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        this.showStatus(`Error processing ${file.name}: ${error.message}`, 'error');
      } finally {
        semaphore.release();
      }
    };

    // Start all file processing tasks
    const promises = files.map((file, index) => processFile(file, index));

    try {
      await Promise.all(promises);
      this.showStatus(`${processedCount} of ${totalFiles} dictionaries processed!`, 'success');
      this.loadCurrentDict();
      const fileInput = document.getElementById('dictionaryZipInput');
      if (fileInput) fileInput.value = ''; 
    } catch (error) {
      this.showStatus(`Import completed with errors.`, 'warning');
    }
  }

  async detectDictionaryFormat(zip) {
    const files = Object.keys(zip.files);

    // Check for StarDict files
    const hasIfo = files.some(f => f.endsWith('.ifo'));
    const hasIdx = files.some(f => f.endsWith('.idx') || f.endsWith('.idx.gz'));
    const hasDict = files.some(f => f.endsWith('.dict') || f.endsWith('.dict.gz') || f.endsWith('.dict.dz'));

    // Check for Yomitan files
    const hasYomitanIndex = files.some(f => f === 'index.json');
    const hasYomitanTerms = files.some(f => f.startsWith('term_bank_'));

    if (hasIfo && hasIdx && hasDict) {
      return 'stardict';
    } else if (hasYomitanIndex || hasYomitanTerms) {
      return 'yomitan';
    } else {
      throw new Error('Unrecognized dictionary format.');
    }
  }
}

/**
 * Semaphore for controlling concurrency
 */
class Semaphore {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.currentConcurrent = 0;
    this.waitQueue = [];
  }

  async acquire() {
    if (this.currentConcurrent < this.maxConcurrent) {
      this.currentConcurrent++;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release() {
    this.currentConcurrent--;
    if (this.waitQueue.length > 0) {
      this.currentConcurrent++;
      const resolve = this.waitQueue.shift();
      resolve();
    }
  }
}

// Export for non-module environment
window.DictionaryImporter = DictionaryImporter;
