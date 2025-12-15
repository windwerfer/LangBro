// stardict-importer.js - Chunked StarDict import via worker
// Extracts .ifo/.idx/.dict → structured term chunks → progressive DB store

import { DictImportUtils } from './dict-import-utils.js';
import { StructuredDictionaryDatabase } from './structured-db.js'; // Assume available

class StarDictImporter {
  constructor({ showStatus, getDB }) {
    this.showStatus = showStatus;
    this.getDB = getDB;
  }

  async importFromZip(zip) {
    const files = await DictImportUtils.extractZipFiles(zip);
    const required = this.extractRequiredFiles(files);
    const dictName = required.ifoName.replace('.ifo', '').split('/').pop();

    // Validate
    if (!required.ifo || !required.idx || !required.dict) {
      throw new Error('Missing .ifo/.idx/.dict');
    }

    this.showStatus(`Importing StarDict: ${dictName}`);
    const validation = DictImportUtils.validateSize(required.dict.length / 1e6, required.metadata.wordcount);
    if (validation.warnings.length) this.showStatus(validation.warnings.join('; '), 'warning');

    // Parse metadata first
    const metadata = this.parseMetadata(required.ifo);

    // Use streaming import for better memory efficiency
    await this.runStreamingImport(dictName, metadata, required);
  }

  extractRequiredFiles(files) {
    const required = {};
    let stylesCss = null;
    const ignore = ['.xoft', '.oft'];

    for (const [path, data] of files) {
      if (ignore.some(p => path.includes(p))) continue;
      if (path.endsWith('.ifo')) { required.ifo = data; required.ifoName = path; }
      else if (path.match(/\.idx(\.gz)?$/)) { required.idx = data; required.idxName = path; }
      else if (path.match(/\.dict(\.gz|\.dz)?$/)) { required.dict = data; required.dictName = path; }
      else if (path.endsWith('.syn')) required.syn = data;
      else if (path.endsWith('.res.zip')) stylesCss = this.extractStylesFromRes(data);
    }
    required.styles = stylesCss;
    return required;
  }

  parseMetadata(ifoData) {
    const text = new TextDecoder().decode(ifoData);
    const meta = { wordcount: 0, idxfilesize: 0, sametypesequence: 'h' };
    text.split('\n').forEach(line => {
      const [key, ...val] = line.split('=');
      if (key?.trim() === 'wordcount') meta.wordcount = parseInt(val.join('=').trim());
      if (key?.trim() === 'idxfilesize') meta.idxfilesize = parseInt(val.join('=').trim());
      // Add more as needed
    });
    if (meta.wordcount === 0) throw new Error('Invalid .ifo');
    return meta;
  }

  async runStreamingImport(dictName, metadata, required) {
    const db = await this.getDB();
    const workerPool = await DictImportUtils.createWorkerPool(3); // Use 3 workers for parallel processing
    const batchProcessor = DictImportUtils.createBatchProcessor(2000, async (batch) => {
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
        sequenced: true
      };
      await db.storeDictionaryMetadata(summary);

      // Create streaming readers for large files
      const idxReader = DictImportUtils.createStreamingReader(
        DictImportUtils.decompressIfNeeded(required.idx, required.idxName)
      );
      const dictReader = DictImportUtils.createStreamingReader(
        DictImportUtils.decompressIfNeeded(required.dict, required.dictName)
      );

      // Process in parallel chunks
      const chunkSize = Math.min(10000, Math.max(1000, Math.floor(metadata.wordcount / 10)));
      const chunks = this.createProcessingChunks(metadata.wordcount, chunkSize);

      const processingPromises = chunks.map(async (chunk, index) => {
        return workerPool.execute(
          'STARDICT_PARSE_CHUNK',
          {
            metadata,
            idxReader: { data: idxReader.data, startPos: chunk.startPos, endPos: chunk.endPos },
            dictReader: { data: dictReader.data },
            synData: required.syn,
            chunkIndex: index,
            wordStart: chunk.wordStart,
            wordCount: chunk.wordCount
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
                `Processed ${DictImportUtils.formatProgress(totalProcessed, metadata.wordcount)} ` +
                `(${Math.round(rate)} terms/sec)`
              );
            },
            onProgress: (progress) => {
              this.showStatus(`Chunk ${index + 1}/${chunks.length}: ${progress}%`);
            },
            onError: (error) => {
              console.error(`Chunk ${index} failed:`, error);
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
        `(${Math.round(totalProcessed / totalTime)} terms/sec)`
      );

    } finally {
      workerPool.terminate();
    }
  }

  createProcessingChunks(totalWords, chunkSize) {
    const chunks = [];
    let currentPos = 0;

    for (let wordStart = 0; wordStart < totalWords; wordStart += chunkSize) {
      const wordCount = Math.min(chunkSize, totalWords - wordStart);
      chunks.push({
        wordStart,
        wordCount,
        startPos: currentPos,
        endPos: currentPos + (wordCount * 10) // Rough estimate: 10 bytes per word entry
      });
      currentPos += wordCount * 10;
    }

    return chunks;
  }

  extractStylesFromRes(resZipData) {
    try {
      const resZip = JSZip.loadAsync(resZipData);
      const styles = resZip.file('styles.css');
      return styles ? new TextDecoder().decode(await styles.async('uint8array')) : null;
    } catch {
      return null;
    }
  }
}

export { StarDictImporter };
