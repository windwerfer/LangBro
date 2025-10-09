// dictionary-import.js
class DictionaryImporter {
  constructor(options) {
    this.getStructuredDB = options.getStructuredDB;
    this.showStatus = options.showStatus;
    this.loadCurrentDict = options.loadCurrentDict;
  }

  init() {
    const importBtn = document.getElementById('importDictionaryBtn');
    importBtn.addEventListener('click', () => this.handleUnifiedImport());
  }

  async detectDictionaryFormat(zip) {
    const files = Object.keys(zip.files);

    // Check for StarDict files
    const hasIfo = files.some(f => f.endsWith('.ifo'));
    const hasIdx = files.some(f => f.endsWith('.idx') || f.endsWith('.idx.gz'));
    const hasDict = files.some(f => f.endsWith('.dict') || f.endsWith('.dict.gz') || f.endsWith('.dict.dz'));

    // Check for Yomitan files
    const hasYomitanIndex = files.some(f => f === 'index.json');
    const hasYomitanTerms = files.some(f => f === 'term_bank_1.json' || f === 'term_bank_2.json');

    if (hasIfo && hasIdx && hasDict) {
      return 'stardict';
    } else if (hasYomitanIndex || hasYomitanTerms) {
      return 'yomitan';
    } else {
      throw new Error('Unrecognized dictionary format. ZIP must contain either StarDict (.ifo/.idx/.dict) or Yomitan files.');
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
        this.showStatus(error.message + '. Please refresh the page or check the extension installation.', 'error');
        return;
      }
    }

    // Check if required libraries are loaded
    if (typeof JSZip === 'undefined') {
      this.showStatus('Error: JSZip library still not available after loading. Please refresh the page or check the extension installation.', 'error');
      return;
    }
    if (typeof StarDictParser === 'undefined') {
      this.showStatus('Error: StarDictParser not loaded. Please refresh the page or check the extension installation.', 'error');
      return;
    }
    if (typeof YomitanDictionaryImporter === 'undefined') {
      this.showStatus('Error: YomitanDictionaryImporter not loaded. Please refresh the page or check the extension installation.', 'error');
      return;
    }

    const fileInput = document.getElementById('dictionaryZipInput');
    const files = Array.from(fileInput.files);
    if (files.length === 0) {
      this.showStatus('Please select one or more ZIP files.', 'error');
      return;
    }

    let processedCount = 0;
    const totalFiles = files.length;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        this.showStatus(`Processing file ${i + 1} of ${totalFiles}: ${file.name}`, 'info');

      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

        const format = await this.detectDictionaryFormat(zip);

        if (format === 'stardict') {
          await this.processStarDictZip(zip);
        } else if (format === 'yomitan') {
          await this.processYomitanZip(zip);
        }

        processedCount++;
      }

      this.showStatus(`${processedCount} dictionary(ies) imported successfully!`, 'success');
      this.loadCurrentDict();
      fileInput.value = ''; // Reset input

    } catch (error) {
      this.showStatus(`Error processing file ${processedCount + 1}: ${error.message}`, 'error');
    }
  }

  async processStarDictZip(zip) {
    // Extract required files, ignore redundant ones
    const requiredFiles = {};
    const ignorePatterns = ['.xoft', '.oft']; // Ignore redundant StarDict files

    for (const [path, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue;

      const shouldIgnore = ignorePatterns.some(pattern => path.includes(pattern));
      if (shouldIgnore) continue;

      if (path.endsWith('.ifo')) {
        requiredFiles.ifo = await zipEntry.async('uint8array');
        requiredFiles.ifoName = path;
      } else if (path.endsWith('.idx') || path.endsWith('.idx.gz')) {
        requiredFiles.idx = await zipEntry.async('uint8array');
        requiredFiles.idxName = path;
      } else if (path.endsWith('.dict') || path.endsWith('.dict.gz') || path.endsWith('.dict.dz')) {
        requiredFiles.dict = await zipEntry.async('uint8array');
        requiredFiles.dictName = path;
      } else if (path.endsWith('.syn')) {
        requiredFiles.syn = await zipEntry.async('uint8array');
      }
    }

    // Validate required files
    if (!requiredFiles.ifo) throw new Error('No .ifo file found in ZIP');
    if (!requiredFiles.idx) throw new Error('No .idx file found in ZIP');
    if (!requiredFiles.dict) throw new Error('No .dict file found in ZIP');

    this.showStatus('Processing StarDict files...', 'info');

    // Process like existing StarDict import
    await this.processStarDictFiles(requiredFiles);
  }

  async processStarDictFiles(files) {
    // Reuse existing StarDict processing logic
    const ifoBuffer = files.ifo.buffer;
    let idxBuffer = files.idx.buffer;
    let dictBuffer = files.dict.buffer;
    let synBuffer = files.syn ? files.syn.buffer : null;

    // Decompress if needed (reuse existing logic)
    if (files.idxName.endsWith('.gz')) {
      idxBuffer = pako.inflate(new Uint8Array(idxBuffer), { to: 'uint8array' }).buffer;
    }
    if (files.dictName.endsWith('.dz')) {
      dictBuffer = pako.inflate(new Uint8Array(dictBuffer), { to: 'uint8array' }).buffer;
    }

    // Parse IFO
    const ifoText = new TextDecoder('utf-8').decode(ifoBuffer);
    const metadata = this.parseIfo(ifoText);
    if (!metadata.isValid) {
      throw new Error(`Invalid .ifo: ${metadata.error}`);
    }

    // Validate sizes
    if (metadata.idxfilesize !== idxBuffer.byteLength) {
      throw new Error(`.idx size mismatch: expected ${metadata.idxfilesize}, got ${idxBuffer.byteLength}`);
    }

    // Create parser and process
    const parser = new StarDictParser();
    parser.metadata = metadata;
    parser.idxData = new Uint8Array(idxBuffer);
    parser.dictData = new Uint8Array(dictBuffer);
    parser.wordCount = metadata.wordcount;

    parser.setAliasData(null, synBuffer);
    await parser.buildWordIndex();
    if (synBuffer) {
      await parser.parseSynFile(parser.synonymData);
    }

    const dictionaryName = files.ifoName.replace('.ifo', '').split('/').pop(); // Extract filename
    const structuredData = parser.extractStructuredData(dictionaryName);

    // Store with progress feedback
    const db = await this.getStructuredDB();
    const totalEntries = structuredData.terms.length;
    let lastUpdate = 0;
    await db.storeDictionary(structuredData, (message) => {
      const now = Date.now();
      if (now - lastUpdate > 2000) { // Update every 2 seconds
        // Extract current count from database message (e.g., "Saved 150 entries to database so far...")
        const match = message.match(/Saved (\d+) entries/);
        if (match) {
          const currentCount = parseInt(match[1]);
          this.showStatus(`Importing... ${currentCount} / ${totalEntries} entries`, 'info');
        } else {
          this.showStatus(message, 'info');
        }
        lastUpdate = now;
      }
    });
  }

  async processYomitanZip(zip) {
    this.showStatus('Processing Yomitan dictionary...', 'info');

    // Convert JSZip object back to ArrayBuffer for the importer
    const zipData = await zip.generateAsync({type: 'uint8array'});
    const archiveContent = zipData.buffer.slice(zipData.byteOffset, zipData.byteOffset + zipData.byteLength);

    // Use the full Yomitan importer
    const importer = new YomitanDictionaryImporter();
    importer.setProgressCallback((progress) => {
      this.showStatus(`Importing... ${progress.index}/${progress.count} entries`, 'info');
    });

    const db = await this.getStructuredDB();
    const result = await importer.importDictionary(db, archiveContent);

    if (!result.success) {
      throw new Error(result.error);
    }

    this.showStatus(`Successfully imported Yomitan dictionary: ${result.dictionary.title}`, 'success');
  }

  parseIfo(text) {
    // Move existing parseIfo logic here
    const metadata = {
      wordcount: 0,
      idxfilesize: 0,
      dictfilesize: 0,
      sametypesequence: 'h',
      version: '3.0.0',
      isValid: true,
      error: ''
    };
    const lines = text.split('\n');
    for (const line of lines) {
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex).trim();
        const value = line.substring(eqIndex + 1).trim();
        switch (key) {
          case 'wordcount': metadata.wordcount = parseInt(value, 10); break;
          case 'idxfilesize': metadata.idxfilesize = parseInt(value, 10); break;
          case 'dictfilesize': metadata.dictfilesize = parseInt(value, 10); break;
          case 'sametypesequence': metadata.sametypesequence = value; break;
          case 'version': metadata.version = value; break;
        }
      }
    }
    if (metadata.wordcount === 0 || metadata.idxfilesize === 0) {
      metadata.isValid = false;
      metadata.error = 'Missing required metadata';
    }
    return metadata;
  }
}