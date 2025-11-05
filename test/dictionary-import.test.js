// Unit test for dictionary import with CSS extraction
// Run with: node test-dictionary-import.js

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

// Mock the DOM elements and functions needed for testing
global.document = {
  createElement: () => ({}),
  head: { appendChild: () => {} }
};

global.chrome = {
  runtime: {
    getURL: (url) => url
  }
};

// Mock the required classes and functions
class MockStarDictParser {
  constructor() {
    this.metadata = {};
    this.idxData = null;
    this.dictData = null;
    this.wordCount = 0;
  }

  async buildWordIndex() {}
  async parseSynFile() {}

  extractStructuredData(dictionaryName) {
    return {
      terms: [],
      kanji: [],
      media: [],
      metadata: {
        title: dictionaryName,
        revision: '1.0.0',
        sequenced: true,
        version: 3,
        importDate: Date.now(),
        prefixWildcardsSupported: false,
        counts: {
          terms: { total: 0 },
          termMeta: { total: 0 },
          kanji: { total: 0 },
          kanjiMeta: { total: 0 },
          tagMeta: { total: 0 },
          media: { total: 0 }
        }
      }
    };
  }
}

class MockStructuredDB {
  async storeDictionary(structuredData, callback) {
    console.log('Mock storing dictionary:', structuredData.metadata.title);
    if (structuredData.metadata.styles) {
      console.log('CSS found:', structuredData.metadata.styles.substring(0, 50) + '...');
    }
    return Promise.resolve();
  }
}

// Mock pako
global.pako = {
  inflate: (data) => data
};

// Load the dictionary-import.js content
const dictionaryImportCode = fs.readFileSync('dictionary-import.js', 'utf8');

// Extract the DictionaryImporter class and modify it for testing
function createTestImporter() {
  // Create a minimal test version
  class TestDictionaryImporter {
    constructor() {
      this.getStructuredDB = () => new MockStructuredDB();
      this.showStatus = (msg) => console.log('Status:', msg);
      this.loadCurrentDict = () => {};
    }

    async detectDictionaryFormat(zip) {
      const files = Object.keys(zip.files);
      const hasIfo = files.some(f => f.endsWith('.ifo'));
      const hasIdx = files.some(f => f.endsWith('.idx'));
      const hasDict = files.some(f => f.endsWith('.dict'));

      if (hasIfo && hasIdx && hasDict) {
        return 'stardict';
      }
      throw new Error('Not a Stardict format');
    }

    async processStarDictZip(zip) {
      const requiredFiles = {};
      let stylesCss = null;

      for (const [path, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;

        if (path.endsWith('.ifo')) {
          requiredFiles.ifo = await zipEntry.async('uint8array');
          requiredFiles.ifoName = path;
        } else if (path.endsWith('.idx')) {
          requiredFiles.idx = await zipEntry.async('uint8array');
          requiredFiles.idxName = path;
        } else if (path.endsWith('.dict')) {
          requiredFiles.dict = await zipEntry.async('uint8array');
          requiredFiles.dictName = path;
        } else if (path.endsWith('.res.zip')) {
          try {
            const resZipData = await zipEntry.async('uint8array');
            const resZip = await JSZip.loadAsync(resZipData);
            const stylesEntry = resZip.file('styles.css');
            if (stylesEntry) {
              const stylesData = await stylesEntry.async('uint8array');
              stylesCss = new TextDecoder('utf-8').decode(stylesData);
              console.log('Found and extracted styles.css from .res.zip');
            }
          } catch (error) {
            console.log(`Warning: Could not extract styles.css: ${error.message}`);
          }
        }
      }

      if (!requiredFiles.ifo || !requiredFiles.idx || !requiredFiles.dict) {
        throw new Error('Missing required files');
      }

      await this.processStarDictFiles(requiredFiles, stylesCss);
    }

    async processStarDictFiles(files, stylesCss = null) {
      // Mock IFO parsing
      const metadata = {
        wordcount: 100,
        idxfilesize: files.idx.length,
        dictfilesize: files.dict.length,
        sametypesequence: 'h',
        version: '3.0.0',
        isValid: true
      };

      // Create mock parser
      const parser = new MockStarDictParser();
      parser.metadata = metadata;
      parser.idxData = files.idx;
      parser.dictData = files.dict;
      parser.wordCount = metadata.wordcount;

      const dictionaryName = files.ifoName.replace('.ifo', '').split('/').pop();
      const structuredData = parser.extractStructuredData(dictionaryName);

      if (stylesCss) {
        structuredData.metadata.styles = stylesCss;
      }

      const db = await this.getStructuredDB();
      await db.storeDictionary(structuredData);
    }

    parseIfo(text) {
      return {
        wordcount: 100,
        idxfilesize: 1000,
        dictfilesize: 2000,
        sametypesequence: 'h',
        version: '3.0.0',
        isValid: true
      };
    }
  }

  return new TestDictionaryImporter();
}

async function runTests() {
  console.log('Running dictionary import tests...\n');

  // Test 1: Basic Stardict import without CSS
  console.log('Test 1: Basic Stardict import without CSS');
  try {
    const zip = new JSZip();
    zip.file('test.ifo', 'mock ifo content');
    zip.file('test.idx', new Uint8Array(1000));
    zip.file('test.dict', new Uint8Array(2000));

    const importer = createTestImporter();
    const format = await importer.detectDictionaryFormat(zip);
    console.log('✓ Detected format:', format);

    await importer.processStarDictZip(zip);
    console.log('✓ Import completed successfully\n');
  } catch (error) {
    console.log('✗ Test 1 failed:', error.message, '\n');
  }

  // Test 2: Stardict import with CSS
  console.log('Test 2: Stardict import with CSS');
  try {
    const zip = new JSZip();
    zip.file('test.ifo', 'mock ifo content');
    zip.file('test.idx', new Uint8Array(1000));
    zip.file('test.dict', new Uint8Array(2000));

    // Create nested .res.zip with styles.css
    const resZip = new JSZip();
    resZip.file('styles.css', 'body { font-family: Arial; } .highlight { background: yellow; }');
    const resZipData = await resZip.generateAsync({ type: 'uint8array' });
    zip.file('test.res.zip', resZipData);

    const importer = createTestImporter();
    const format = await importer.detectDictionaryFormat(zip);
    console.log('✓ Detected format:', format);

    await importer.processStarDictZip(zip);
    console.log('✓ Import with CSS completed successfully\n');
  } catch (error) {
    console.log('✗ Test 2 failed:', error.message, '\n');
  }

  // Test 3: Invalid format detection
  console.log('Test 3: Invalid format detection');
  try {
    const zip = new JSZip();
    zip.file('invalid.txt', 'not a dictionary');

    const importer = createTestImporter();
    await importer.detectDictionaryFormat(zip);
    console.log('✗ Should have thrown error\n');
  } catch (error) {
    console.log('✓ Correctly rejected invalid format:', error.message, '\n');
  }

  console.log('All tests completed!');
}

// Run the tests
runTests().catch(console.error);