// stardict-importer.js - Chunked StarDict import with resumable state
// Extracts .ifo/.idx/.dict → structured term chunks → progressive DB store

class StarDictImporter {
  constructor(options = {}) {
    this.showStatus = options.showStatus;
    this.onProgress = options.onProgress;
    this.getDB = options.getDB;
    this.utils = typeof ImportUtils !== 'undefined' ? ImportUtils : null;
  }

  async importFromZip(zip, job = null, sharedWorker = null) {
    if (!this.utils) throw new Error('ImportUtils not loaded');
    
    // Resume detection
    const startOffset = job ? (job.processedEntries || 0) : 0;
    
    this.showStatus('Scanning ZIP for StarDict files...', 'info');
    const files = zip.files;
    const requiredEntryPaths = this.findRequiredEntryPaths(files);
    
    if (!requiredEntryPaths.ifo || !requiredEntryPaths.idx || !requiredEntryPaths.dict) {
      throw new Error('Missing .ifo, .idx, or .dict files in ZIP archive');
    }

    // Extract only what we need to save memory
    this.showStatus('Extracting metadata...', 'info');
    const ifoData = await zip.file(requiredEntryPaths.ifo).async('uint8array');
    const metadata = this.parseMetadata(ifoData);
    
    const dictName = job ? job.title : requiredEntryPaths.ifo.replace('.ifo', '').split('/').pop();

    if (startOffset === 0) {
      this.showStatus(`Starting import: ${dictName} (${metadata.wordcount} entries)`, 'info');
    } else {
      this.showStatus(`Resuming import: ${dictName} from entry ${startOffset}`, 'info');
    }

    await this.runStreamingImport(dictName, metadata, requiredEntryPaths, zip, job, sharedWorker);
  }

  findRequiredEntryPaths(files) {
    const paths = {};
    const ignore = ['.xoft', '.oft'];

    for (const path of Object.keys(files)) {
      if (ignore.some(p => path.includes(p))) continue;
      if (path.endsWith('.ifo')) paths.ifo = path;
      else if (path.match(/\.idx(\.gz)?$/)) paths.idx = path;
      else if (path.match(/\.dict(\.gz|\.dz)?$/)) paths.dict = path;
      else if (path.endsWith('.syn')) paths.syn = path;
    }
    return paths;
  }

  parseMetadata(ifoData) {
    const text = new TextDecoder('utf-8').decode(ifoData);
    const meta = { wordcount: 0, idxfilesize: 0, sametypesequence: 'h' };
    text.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length < 2) return;
      const key = parts[0].trim().toLowerCase();
      const val = parts[1].trim();
      if (key === 'wordcount') meta.wordcount = parseInt(val, 10) || 0;
      if (key === 'idxfilesize') meta.idxfilesize = parseInt(val, 10) || 0;
    });
    
    if (meta.wordcount === 0) {
      console.warn('StarDict IFO: wordcount is 0 or missing');
    }
    return meta;
  }

  async runStreamingImport(dictName, metadata, paths, zip, job = null, sharedWorker = null) {
    console.log(`StarDict: Starting streaming import for ${dictName}`, metadata);
    const db = await this.getDB();
    
    let worker = sharedWorker;
    let ownWorker = false;

    if (!worker) {
      console.log('StarDict: Initializing own worker...');
      worker = await this.utils.createWorker();
      ownWorker = true;
    } else {
      console.log('StarDict: Using shared worker. Resetting...');
      await this.utils.runWorkerTask(worker, 'RESET', {});
    }

    // Chunk size 1000 for stability and crash recovery
    const CHUNK_SIZE = 1000;
    
    let totalProcessed = job ? (job.processedEntries || 0) : 0;
    const startTime = performance.now();

    try {
      if (totalProcessed === 0) {
        console.log('StarDict: Storing dictionary metadata...');
        await db.storeDictionaryMetadata({
          title: dictName,
          revision: '1.0',
          counts: { terms: { total: metadata.wordcount } },
          importDate: Date.now(),
          version: 3,
          sequenced: true
        });
      }

      this.showStatus('Extracting and decompressing index...', 'info');
      console.log(`StarDict: Loading index entry: ${paths.idx}`);
      const rawIdx = await zip.file(paths.idx).async('uint8array');
      console.log(`StarDict: Index loaded, size: ${rawIdx.length} bytes. Decompressing...`);
      const idxData = this.utils.decompressIfNeeded(rawIdx, paths.idx);
      console.log(`StarDict: Index decompressed, final size: ${idxData.length} bytes`);
      
      this.showStatus('Extracting and decompressing dictionary data...', 'info');
      console.log(`StarDict: Loading dictionary entry: ${paths.dict}`);
      const rawDict = await zip.file(paths.dict).async('uint8array');
      console.log(`StarDict: Dictionary loaded, size: ${rawDict.length} bytes. Decompressing...`);
      const dictData = this.utils.decompressIfNeeded(rawDict, paths.dict);
      console.log(`StarDict: Dictionary decompressed, final size: ${dictData.length} bytes`);

      // Send buffers to worker using TRANSFERABLES to avoid OOM
      this.showStatus('Uploading data to worker...', 'info');
      console.log('StarDict: Sending data to worker (using transferables)...');
      await this.utils.runWorkerTask(
        worker,
        'CACHE_DATA', 
        { idxData, dictData }, 
        { transfer: [idxData.buffer, dictData.buffer] }
      );
      console.log('StarDict: Data successfully sent to worker');

      this.showStatus('Building word index...', 'info');
      console.log(`StarDict: Sending BUILD_STARDICT_INDEX to worker (wordcount: ${metadata.wordcount})...`);
      const indexResult = await this.utils.runWorkerTask(
        worker,
        'BUILD_STARDICT_INDEX',
        { wordCount: metadata.wordcount },
        { 
          onProgress: (p) => {
             this.showStatus(`Building index: ${p.progress}%`, 'info');
             if (this.onProgress) {
                this.onProgress({ 
                  progress: p.progress, 
                  current: p.current, 
                  total: p.total 
                });
             }
          }
        }
      );
      console.log('StarDict: Word index built successfully', indexResult);

      const allWordOffsets = indexResult.wordOffsets;
      if (!allWordOffsets || allWordOffsets.length === 0) {
        throw new Error('Failed to build word index (0 entries found)');
      }

      this.showStatus(`Importing ${allWordOffsets.length} terms...`, 'info');
      console.log(`StarDict: Beginning chunk processing (starting at ${totalProcessed}/${allWordOffsets.length})...`);

      // Start from the last processed entry
      for (let i = totalProcessed; i < allWordOffsets.length; i += CHUNK_SIZE) {
        const chunkOffsets = allWordOffsets.slice(i, i + CHUNK_SIZE);
        
        // Process this chunk using cached data in worker
        const result = await this.utils.runWorkerTask(
          worker,
          'EXTRACT_STARDICT_DATA',
          {
            wordOffsets: chunkOffsets,
            dictionaryName: dictName,
            chunkSize: 1000
          },
          {
            onProgress: (p) => {
               // Sub-progress within chunk extraction (usually fast)
            }
          }
        );

        const terms = result.terms;
        await db.storeBatch('terms', terms, dictName);
        
        totalProcessed += terms.length;
        
        if (job) {
          await db.updateImportJob(job.id, { 
            processedEntries: totalProcessed,
            totalEntries: metadata.wordcount
          });
        }

        const progress = Math.round((totalProcessed / allWordOffsets.length) * 100);
        this.showStatus(`Progress: ${totalProcessed}/${allWordOffsets.length} (${progress}%)`, 'info');
        
        if (this.onProgress) {
          this.onProgress({ 
            progress, 
            current: totalProcessed, 
            total: allWordOffsets.length 
          });
        }
        
        // Yield to keep UI responsive
        await this.utils.yieldToEventLoop();
      }

      this.showStatus(`Successfully imported: ${dictName} (${totalProcessed} terms)`, 'success');
      console.log(`StarDict: Import complete for ${dictName} in ${(performance.now() - startTime).toFixed(2)}ms`);

    } catch (error) {
      console.error('StarDict Streaming Import Error:', error);
      this.showStatus(`Import failed: ${error.message}`, 'error');
      throw error;
    } finally {
      if (ownWorker) {
        console.log('StarDict: Terminating own worker');
        worker.terminate();
      }
    }
  }
}

window.StarDictImporter = StarDictImporter;

