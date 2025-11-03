// StarDict Parser for Chrome Extension
// Handles loading, indexing, and lookups for .ifo/.idx/.dict files

class StarDictParser {
  constructor() {
    this.metadata = null;
    this.idxData = null;
    this.dictData = null;
    this.aliasData = null; // For .idx.oft/.idx.xoft files
    this.synonymData = null; // For .syn files
    this.wordOffsets = []; // Precomputed [startByte] for each word
    this.aliasOffsets = []; // Aliases pointing to main entries
    this.wordCount = 0;
    this.aliasCount = 0;
    this.sequenceType = 'h';
  }

  // Load from IndexedDB (called in background)
  async loadFromIndexedDB(stardict) {
    if (!stardict) {
      throw new Error('No dictionary loaded in IndexedDB');
    }

    this.metadata = stardict.metadata;
    this.wordCount = this.metadata.wordcount;
    this.sequenceType = this.metadata.sametypesequence || 'h';

    // Decode base64 to Uint8Array
    const decodeBuffer = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    this.idxData = decodeBuffer(stardict.idx);
    this.dictData = decodeBuffer(stardict.dict);

    // Data is already decompressed in options.js before saving

    // Build index: Precompute word start positions for binary search
    await this.buildWordIndex();
  }

  // Parse .ifo (already done in options, but for completeness)
  parseIfo(text) {
    const metadata = {
      wordcount: 0,
      idxfilesize: 0,
      dictfilesize: 0,
      sametypesequence: 'h',
      version: '3.0.0'
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
    return metadata;
  }

  // Build in-memory index: Array of {word, startByte} for binary search
  // Assumes .idx is already sorted (per StarDict spec)
  async buildWordIndex() {
    console.log(`Building index for ${this.wordCount} words...`); // Debug log
    this.wordOffsets = [];
    let pos = 0;
    let processed = 0;
    const startTime = performance.now();

    for (let i = 0; i < this.wordCount; i++) {
      if (pos >= this.idxData.length) {
        throw new Error(`.idx file too short: reached end at word ${i + 1}/${this.wordCount}`);
      }

      const wordEnd = this.idxData.indexOf(0, pos);
      if (wordEnd === -1) {
        throw new Error(`Invalid .idx structure: no null terminator at position ~${pos} (word ${i + 1})`);
      }

      const wordBytes = this.idxData.subarray(pos, wordEnd);
      const word = new TextDecoder('utf-8').decode(wordBytes);
      const offsetPos = wordEnd + 1;
      if (offsetPos + 8 > this.idxData.length) {
        throw new Error(`Invalid offsets at word ${i + 1}: beyond file end`);
      }
      const dictOffset = this.readUint32(this.idxData, offsetPos); // Big-endian
      const dictSize = this.readUint32(this.idxData, offsetPos + 4);

      this.wordOffsets.push({ word, startByte: pos, dictOffset, dictSize });

      pos = wordEnd + 9; // 1 null + 8 bytes (two uint32)
      processed++;

      // Progress log for large dicts (every 10k)
      if (processed % 10000 === 0) {
        console.log(`Processed ${processed}/${this.wordCount} words...`);
      }
    }

    const endTime = performance.now();
    console.log(`Index built in ${(endTime - startTime).toFixed(2)}ms with ${this.wordOffsets.length} entries (expected: ${this.wordCount})`);

    if (this.wordOffsets.length !== this.wordCount) {
      console.warn(`Warning: Parsed ${this.wordOffsets.length} entries but .ifo declared ${this.wordCount} words`);
    }

    // NO SORT NEEDED: StarDict .idx is pre-sorted
  }

  // Parse synonym file (.syn) - binary format per StarDict spec
  async parseSynFile(synData) {
    if (!synData) return;

    console.log(`Parsing synonym file, ${synData.length} bytes...`);

    this.aliasOffsets = [];
    let pos = 0;

    while (pos < synData.length) {
      // Find null terminator for synonym word
      const nullIndex = synData.indexOf(0, pos);
      if (nullIndex === -1) {
        console.log(`Invalid .syn structure: no null terminator found at position ${pos}`);
        break;
      }

      // Extract synonym word
      const wordBytes = synData.subarray(pos, nullIndex);
      const synonym = new TextDecoder('utf-8').decode(wordBytes);

      // Move past null terminator
      pos = nullIndex + 1;

      // Read 4 bytes for main word index (big-endian uint32)
      if (pos + 4 > synData.length) {
        console.log(`Invalid .syn structure: insufficient bytes for index at position ${pos}`);
        break;
      }

      const mainWordIndex = this.readUint32(synData, pos);
      pos += 4;

      // Validate index
      if (mainWordIndex >= this.wordOffsets.length) {
        console.log(`Invalid synonym index ${mainWordIndex} for "${synonym}" (max: ${this.wordOffsets.length - 1})`);
        continue;
      }

      // Get main entry
      const mainEntry = this.wordOffsets[mainWordIndex];

      // Add synonym as alias
      this.aliasOffsets.push({
        word: synonym,
        mainEntryOffset: mainEntry.dictOffset,
        dictSize: mainEntry.dictSize
      });

      console.log(`Added synonym: "${synonym}" -> "${mainEntry.word}" (index ${mainWordIndex})`);
    }

    console.log(`Parsed ${this.aliasOffsets.length} synonyms from .syn file`);

    // Log all found synonyms for verification
    if (this.aliasOffsets.length > 0) {
      console.log('All synonyms found:');
      this.aliasOffsets.forEach((alias, index) => {
        const mainEntry = this.wordOffsets.find(entry => entry.dictOffset === alias.mainEntryOffset);
        console.log(`${index + 1}. "${alias.word}" -> "${mainEntry ? mainEntry.word : 'UNKNOWN'}"`);
      });
    }
  }

  // Set alias data from files
  setAliasData(aliasBuffer, synonymBuffer = null) {
    if (aliasBuffer) {
      this.aliasData = new Uint8Array(aliasBuffer);
      // Don't estimate count, we'll parse until we can't find more entries
      this.aliasCount = 0; // Will be set by buildAliasIndex
    }
    if (synonymBuffer) {
      this.synonymData = new Uint8Array(synonymBuffer);
    }
  }

  // Lookup word: Binary search + extract definition
  lookup(word) {
    if (!this.wordOffsets.length) return null;

    // Binary search for exact match (case-sensitive; add fuzzy if needed)
    let low = 0;
    let high = this.wordOffsets.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midWord = this.wordOffsets[mid].word;
      if (midWord === word) {
        const entry = this.wordOffsets[mid];
        const slice = this.dictData.subarray(entry.dictOffset, entry.dictOffset + entry.dictSize);
        let def = new TextDecoder('utf-8').decode(slice);
        console.log('Parser received definition:', def);
        // Return HTML as-is for 'h' type, strip for others if needed
        return def;
      }
      if (midWord < word) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return null; // No exact match
  }

  // Extract structured data for Yomitan-style storage
  extractStructuredData(dictionaryName) {
    const kanji = [];
    const media = [];

    console.log(`Extracting structured data for ${this.wordOffsets.length} words (declared: ${this.wordCount})...`);

    // First, create a map of main entries for quick lookup by dictOffset
    const mainEntryMap = new Map();
    for (let i = 0; i < this.wordOffsets.length; i++) {
      const entry = this.wordOffsets[i];
      const slice = this.dictData.subarray(entry.dictOffset, entry.dictOffset + entry.dictSize);
      const definition = new TextDecoder('utf-8').decode(slice);
      mainEntryMap.set(entry.dictOffset, { entry, definition });
    }

    // Use a Map to group terms by [expression, reading] and merge glossaries
    const termMap = new Map();

    // Process main entries
    for (let i = 0; i < this.wordOffsets.length; i++) {
      const entry = this.wordOffsets[i];
      const mainData = mainEntryMap.get(entry.dictOffset);

      const key = `${entry.word}|${entry.word}`; // expression|reading (same for StarDict)

      const sanitizedDefinition = sanitizeDictHTML(mainData.definition);

      if (termMap.has(key)) {
        // Merge glossary with existing term
        termMap.get(key).glossary.push(sanitizedDefinition);
      } else {
        // Create new term entry
        const termEntry = {
          expression: entry.word,
          reading: entry.word, // StarDict doesn't separate reading from expression
          definitionTags: [],
          rules: [],
          score: 0,
          glossary: [sanitizedDefinition], // Array of definitions
          termTags: [],
          dictionary: dictionaryName
        };
        termMap.set(key, termEntry);
      }
    }

    // Process aliases from .syn files and .idx.oft/.idx.xoft files
    if (this.aliasOffsets.length > 0) {
      console.log(`Processing ${this.aliasOffsets.length} aliases...`);
      let aliasesProcessed = 0;

      for (let i = 0; i < this.aliasOffsets.length; i++) {
        const alias = this.aliasOffsets[i];
        const mainData = mainEntryMap.get(alias.mainEntryOffset);

        if (mainData) {
          const key = `${alias.word}|${alias.word}`; // expression|reading

          if (termMap.has(key)) {
            // Merge glossary with existing term
            termMap.get(key).glossary.push(mainData.definition);
          } else {
            // Create new term entry for alias
            const aliasEntry = {
              expression: alias.word,
              reading: alias.word,
              definitionTags: [],
              rules: [],
              score: 0,
              glossary: [mainData.definition], // Same definition as main entry
              termTags: [],
              dictionary: dictionaryName
            };
            termMap.set(key, aliasEntry);
          }
          aliasesProcessed++;
        } else {
          console.log(`Alias "${alias.word}" points to unknown offset ${alias.mainEntryOffset}`);
        }
      }

      console.log(`Successfully processed ${aliasesProcessed}/${this.aliasOffsets.length} aliases`);
    }

    // Convert Map to array and assign sequential IDs
    const terms = Array.from(termMap.values());
    terms.forEach((term, index) => {
      term.sequence = index + 1;
    });

    const totalTerms = terms.length;
    console.log(`Total unique terms extracted: ${totalTerms} (from ${this.wordOffsets.length} main + ${this.aliasOffsets.length} aliases)`);

    return {
      terms,
      kanji,
      media,
      metadata: {
        title: dictionaryName,
        revision: '1.0.0',
        sequenced: true,
        version: 3,
        importDate: Date.now(),
        prefixWildcardsSupported: false,
        counts: {
          terms: { total: totalTerms },
          termMeta: { total: 0 },
          kanji: { total: kanji.length },
          kanjiMeta: { total: 0 },
          tagMeta: { total: 0 },
          media: { total: media.length }
        }
      }
    };
  }

  // Utils
  readUint32(buffer, offset) {
    return (buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3];
  }

  stripHtmlTags(html) {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  // Decompression stubs (implement or use external libs)
  decompressGzip(data) {
    // Requires including pako.js (see notes below)
    // Example: return pako.inflate(data, { to: 'uint8array' });
    throw new Error('Gzip decompression requires pako.js - load it in manifest');
  }

  decompressLzo(data) {
    // Requires a JS LZO library (e.g., lzodecode.js)
    throw new Error('LZO decompression requires external lib');
  }
}

// Sanitize HTML using DOMPurify
function sanitizeDictHTML(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['span', 'b', 'i', 'em', 'strong', 'br', 'p', 'div', 'ul', 'li', 'ol'],
    ALLOWED_ATTR: ['class']
  });
}

// Export for use
if (typeof module !== 'undefined') {
  module.exports = StarDictParser;
} else if (typeof window !== 'undefined') {
  window.StarDictParser = StarDictParser;
}

