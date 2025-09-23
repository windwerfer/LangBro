// StarDict Parser for Chrome Extension
// Handles loading, indexing, and lookups for .ifo/.idx/.dict files

class StarDictParser {
  constructor() {
    this.metadata = null;
    this.idxData = null;
    this.dictData = null;
    this.wordOffsets = []; // Precomputed [startByte] for each word
    this.wordCount = 0;
    this.sequenceType = 'h';
  }

  // Load from chrome.storage (called in background)
  async loadFromStorage() {
    const { stardict } = await chrome.storage.local.get('stardict');
    if (!stardict) {
      throw new Error('No dictionary loaded in storage');
    }

    this.metadata = stardict.metadata;
    this.wordCount = this.metadata.wordcount;
    this.sequenceType = this.metadata.sametypesequence || 'h';

    // Decode base64 to Uint8Array
    const decodeBuffer = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    this.idxData = decodeBuffer(stardict.idx);
    this.dictData = decodeBuffer(stardict.dict);

    // Decompress if needed (stub; extend for .gz/.dz - see notes below)
    // For now, assumes uncompressed; add flags in storageData for compression
    if (stardict.isIdxCompressed) {
      this.idxData = this.decompressGzip(this.idxData); // Requires pako.js
    }
    if (stardict.isDictCompressed) {
      this.dictData = this.decompressLzo(this.dictData); // Requires LZO lib
    }

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
    console.log(`Index built in ${(endTime - startTime).toFixed(2)}ms with ${this.wordOffsets.length} entries`);
    // NO SORT NEEDED: StarDict .idx is pre-sorted
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
        if (this.sequenceType === 'h') {
          def = this.stripHtmlTags(def);
        }
        // Handle other types: 'm' = multi-part, etc. (extend as needed)
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

// Export for use
if (typeof module !== 'undefined') {
  module.exports = StarDictParser;
} else {
  window.StarDictParser = StarDictParser;
}