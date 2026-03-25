// stardict-importer.js - Chunked StarDict import via worker
// Extracts .ifo/.idx/.dict → structured term chunks → progressive DB store

class StarDictImporter {
  constructor({ showStatus, getDB }) {
    this.showStatus = showStatus;
    this.getDB = getDB;
    // Use the global DictImportUtils (ensure dict-import-utils.js is loaded first)
    this.utils = typeof DictImportUtils !== 'undefined' ? DictImportUtils : null;
  }

  async importFromZip(zip) {
    if (!this.utils) throw new Error('DictImportUtils not loaded');
    const files = await this.utils.extractZipFiles(zip);
    const required = this.extractRequiredFiles(files);
    
    // Validate
    if (!required.ifo || !required.idx || !required.dict) {
      throw new Error('Missing .ifo/.idx/.dict files in ZIP');
    }

    // Parse metadata first
    const metadata = this.parseMetadata(required.ifo);
    const dictName = required.ifoName.replace('.ifo', '').split('/').pop();

    this.showStatus(`Importing StarDict: ${dictName} (${metadata.wordcount} entries)`);
    
    const validation = this.utils.validateSize(required.dict.length / 1e6, metadata.wordcount);
    if (validation.warnings.length) {
        this.showStatus(validation.warnings.join('; '), 'warning');
    }

    // Use streaming import for better memory efficiency
    await this.runStreamingImport(dictName, metadata, required);
  }

  extractRequiredFiles(files) {
    const required = {};
    let stylesCss = null;
    const ignore = ['.xoft', '.oft'];

    for (const [path, data] of files) {
      if (ignore.some(p => path.includes(p))) continue;
      
      if (path.endsWith('.ifo')) { 
        required.ifo = data; 
        required.ifoName = path; 
      } else if (path.match(/\.idx(\.gz)?$/)) { 
        required.idx = data; 
        required.idxName = path; 
      } else if (path.match(/\.dict(\.gz|\.dz)?$/)) { 
        required.dict = data; 
        required.dictName = path; 
      } else if (path.endsWith('.syn')) {
        required.syn = data;
      } else if (path.endsWith('.res.zip')) {
        stylesCss = this.extractStylesFromRes(data);
      }
    }
    required.styles = stylesCss;
    return required;
  }

  parseMetadata(ifoData) {
    const text = new TextDecoder('utf-8').decode(ifoData);
    const meta = { wordcount: 0, idxfilesize: 0, sametypesequence: 'h' };
    text.split('\n').forEach(line => {
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) return;
      
      const key = line.substring(0, eqIdx).trim();
      const val = line.substring(eqIdx + 1).trim();
      
      if (key === 'wordcount') meta.wordcount = parseInt(val, 10);
      if (key === 'idxfilesize') meta.idxfilesize = parseInt(val, 10);
      if (key === 'sametypesequence') meta.sametypesequence = val;
    });
    
    if (meta.wordcount === 0) throw new Error('Invalid .ifo: wordcount is 0 or missing');
    return meta;
  }

  async runStreamingImport(dictName, metadata, required) {
    const db = await this.getDB();
    const workerPool = await this.utils.createWorkerPool(3);
    const batchProcessor = this.utils.createBatchProcessor(2000, async (batch) => {
      await db.storeBatch('terms', batch, dictName);
    });

    let totalProcessed = 0;
    const startTime = performance.now();

    try {
      // Store metadata first
      const summary = {
        title: dictName,
        revision: '1.0',
        counts: { terms: { total: metadata.wordcount } },
        importDate: Date.now(),
        version: 3,
        sequenced: true,
        styles: required.styles || ''
      };
      await db.storeDictionaryMetadata(summary);

      this.showStatus('Building word index...', 'info');

      // 1. Build the index first using a single worker
      const idxData = this.utils.decompressIfNeeded(required.idx, required.idxName);
      const indexResult = await workerPool.execute(
        'BUILD_STARDICT_INDEX',
        { 
          idxData, 
          wordCount: metadata.wordcount 
        },
        {
          onProgress: (p) => this.showStatus(`Building index: ${p.progress}%`, 'info')
        }
      );

      const wordOffsets = indexResult.wordOffsets;
      this.showStatus(`Index built: ${wordOffsets.length} entries. Starting data extraction...`, 'success');

      // 2. Process in parallel chunks using the offsets
      const dictData = this.utils.decompressIfNeeded(required.dict, required.dictName);
      const chunkSize = 5000;
      const chunks = [];
      for (let i = 0; i < wordOffsets.length; i += chunkSize) {
        chunks.push(wordOffsets.slice(i, i + chunkSize));
      }

      const processingPromises = chunks.map(async (offsetChunk, index) => {
        return workerPool.execute(
          'EXTRACT_STARDICT_DATA',
          {
            wordOffsets: offsetChunk,
            dictData,
            dictionaryName: dictName,
            chunkSize: 1000
          },
          {
            onChunk: async (terms) => {
              for (const term of terms) {
                await batchProcessor.add(term);
              }
              totalProcessed += terms.length;

              const elapsed = (performance.now() - startTime) / 1000;
              const rate = totalProcessed / elapsed;
              this.showStatus(
                `Processed ${this.utils.formatProgress(totalProcessed, metadata.wordcount)} ` +
                `(${Math.round(rate)} terms/sec)`
              );
            },
            onProgress: (p) => {
                // Individual chunk progress is less useful here, we use totalProcessed
            },
            onError: (error) => {
              console.error(`Chunk ${index} failed:`, error);
              this.showStatus(`Chunk ${index} failed: ${error.message}`, 'error');
            }
          }
        );
      });

      // Wait for all chunks to complete
      await Promise.all(processingPromises);

      // Flush remaining batch
      await batchProcessor.flush();

      const totalTime = (performance.now() - startTime) / 1000;
      this.showStatus(
        `Import complete: ${totalProcessed} terms in ${totalTime.toFixed(1)}s ` +
        `(${Math.round(totalProcessed / totalTime)} terms/sec)`,
        'success'
      );

    } catch (error) {
        this.showStatus(`Import failed: ${error.message}`, 'error');
        throw error;
    } finally {
      workerPool.terminate();
    }
  }

  async extractStylesFromRes(resZipData) {
    try {
      const resZip = await JSZip.loadAsync(resZipData);
      const styles = resZip.file('styles.css');
      return styles ? await styles.async('string') : null;
    } catch (e) {
      console.warn('Could not extract styles from .res.zip', e);
      return null;
    }
  }
}

// Export for both module and non-module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StarDictImporter };
} else {
  window.StarDictImporter = StarDictImporter;
}
