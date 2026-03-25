// stardict-importer.js - Chunked StarDict import with resumable state
// Extracts .ifo/.idx/.dict → structured term chunks → progressive DB store

class StarDictImporter {
  constructor({ showStatus, getDB }) {
    this.showStatus = showStatus;
    this.getDB = getDB;
    this.utils = typeof DictImportUtils !== 'undefined' ? DictImportUtils : null;
  }

  async importFromZip(zip, job = null) {
    if (!this.utils) throw new Error('DictImportUtils not loaded');
    
    // Resume detection
    const startOffset = job ? (job.processedEntries || 0) : 0;
    
    const files = await this.utils.extractZipFiles(zip);
    const required = this.extractRequiredFiles(files);
    
    if (!required.ifo || !required.idx || !required.dict) {
      throw new Error('Missing .ifo/.idx/.dict files in ZIP');
    }

    const metadata = this.parseMetadata(required.ifo);
    const dictName = job ? job.title : required.ifoName.replace('.ifo', '').split('/').pop();

    if (startOffset === 0) {
      this.showStatus(`Starting import: ${dictName} (${metadata.wordcount} entries)`);
    } else {
      this.showStatus(`Resuming import: ${dictName} from entry ${startOffset}`);
    }

    await this.runStreamingImport(dictName, metadata, required, job);
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
      else if (path.endsWith('.res.zip')) {
        // StarDict .res.zip styles extraction (simplified)
      }
    }
    return required;
  }

  parseMetadata(ifoData) {
    const text = new TextDecoder('utf-8').decode(ifoData);
    const meta = { wordcount: 0, idxfilesize: 0, sametypesequence: 'h' };
    text.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length < 2) return;
      const key = parts[0].trim();
      const val = parts[1].trim();
      if (key === 'wordcount') meta.wordcount = parseInt(val, 10);
      if (key === 'idxfilesize') meta.idxfilesize = parseInt(val, 10);
    });
    return meta;
  }

  async runStreamingImport(dictName, metadata, required, job = null) {
    const db = await this.getDB();
    const workerPool = await this.utils.createWorkerPool(3);
    
    // Chunk size 1000 for stability and crash recovery
    const CHUNK_SIZE = 1000;
    
    let totalProcessed = job ? (job.processedEntries || 0) : 0;
    const startTime = performance.now();

    try {
      if (totalProcessed === 0) {
        await db.storeDictionaryMetadata({
          title: dictName,
          revision: '1.0',
          counts: { terms: { total: metadata.wordcount } },
          importDate: Date.now(),
          version: 3,
          sequenced: true
        });
      }

      this.showStatus('Building/Retrieving word index...', 'info');
      const idxData = this.utils.decompressIfNeeded(required.idx, required.idxName);
      
      const indexResult = await workerPool.execute(
        'BUILD_STARDICT_INDEX',
        { idxData, wordCount: metadata.wordcount }
      );

      const allWordOffsets = indexResult.wordOffsets;
      const dictData = this.utils.decompressIfNeeded(required.dict, required.dictName);

      // Start from the last processed entry
      for (let i = totalProcessed; i < allWordOffsets.length; i += CHUNK_SIZE) {
        const chunkOffsets = allWordOffsets.slice(i, i + CHUNK_SIZE);
        
        // Process this chunk
        const result = await workerPool.execute(
          'EXTRACT_STARDICT_DATA',
          {
            wordOffsets: chunkOffsets,
            dictData,
            dictionaryName: dictName,
            chunkSize: 1000
          }
        );

        const terms = result.terms;
        
        // ATOMIC COMMIT: Terms + Progress
        // In a real IndexedDB transaction, we'd wrap both. 
        // Here we ensure terms are stored before updating progress.
        await db.storeBatch('terms', terms, dictName);
        
        totalProcessed += terms.length;
        
        if (job) {
          await db.updateImportJob(job.id, { 
            processedEntries: totalProcessed,
            totalEntries: metadata.wordcount
          });
        }

        const elapsed = (performance.now() - startTime) / 1000;
        const progress = Math.round((totalProcessed / metadata.wordcount) * 100);
        this.showStatus(`Processed ${totalProcessed}/${metadata.wordcount} (${progress}%)`, 'info');
      }

      this.showStatus(`Import complete: ${totalProcessed} terms`, 'success');

    } catch (error) {
      this.showStatus(`Import failed at entry ${totalProcessed}: ${error.message}`, 'error');
      throw error;
    } finally {
      workerPool.terminate();
    }
  }
}

window.StarDictImporter = StarDictImporter;
