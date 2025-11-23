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

    // Decompress
    const idxData = DictImportUtils.decompressIfNeeded(required.idx, required.idxName);
    const dictData = DictImportUtils.decompressIfNeeded(required.dict, required.dictName);

    // Parse metadata
    const metadata = this.parseMetadata(required.ifo);

    // Progressive import via worker
    await this.runWorkerPipeline(dictName, metadata, idxData, dictData, required.syn);
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

  async runWorkerPipeline(dictName, metadata, idxData, dictData, synData) {
    const worker = await DictImportUtils.createWorker();
    const db = await this.getDB();
    let totalProcessed = 0;

    // Metadata first
    const summary = {
      title: dictName,
      revision: '1.0',
      counts: { terms: { total: metadata.wordcount } },
      // ...
    };
    await db.storeDictionaryMetadata(summary); // Assume new method

    // Pipeline: post data, receive chunks
    await DictImportUtils.runWorkerTask(
      worker,
      'STARDICT_PARSE',
      { metadata, idxData, dictData, synData, chunkSize: 5000 },
      async (chunk) => {
        // Receive term chunk, store
        await db.storeChunk('terms', chunk, dictName);
        totalProcessed += chunk.length;
        this.showStatus(DictImportUtils.formatProgress(totalProcessed, metadata.wordcount));
      },
      progress => this.showStatus(`Parsing: ${progress}%`),
      () => worker.terminate()
    );
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
