// import-worker.js - Web Worker for heavy dictionary import operations
// Handles CPU-intensive parsing in background thread to prevent UI blocking

// Import utilities (worker context)
importScripts('import-utils.js');

// Worker message handler
self.onmessage = async function(event) {
  const { type, data, requestId } = event.data;

  try {
    let result;

    switch (type) {
      case 'INIT':
        result = { type: 'WORKER_READY' };
        break;

      case 'BUILD_STARDICT_INDEX':
        result = await buildStarDictIndex(data);
        break;

      case 'EXTRACT_STARDICT_DATA':
        result = await extractStarDictData(data);
        break;

      case 'PARSE_YOMITAN_DATA':
        result = await parseYomitanData(data);
        break;

      case 'PROCESS_CHUNK':
        result = await processChunk(data);
        break;

      case 'STARDICT_PARSE_CHUNK':
        result = await processStarDictChunk(data);
        break;

      case 'PARSE_YOMITAN_TERMS':
        result = await processYomitanTerms(data);
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    // Send success response
    self.postMessage({
      type: 'SUCCESS',
      requestId,
      result
    });

  } catch (error) {
    // Send error response
    self.postMessage({
      type: 'ERROR',
      requestId,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    });
  }
};

/**
 * Builds StarDict index in chunks to avoid blocking
 */
async function buildStarDictIndex({ idxData, wordCount, chunkSize = 10000 }) {
  const wordOffsets = [];
  let pos = 0;
  let processed = 0;
  const startTime = performance.now();

  console.log(`Worker: Building index for ${wordCount} words in chunks of ${chunkSize}`);

  // Process in chunks
  for (let chunkStart = 0; chunkStart < wordCount; chunkStart += chunkSize) {
    const chunkEnd = Math.min(chunkStart + chunkSize, wordCount);
    const chunkOffsets = [];

    for (let i = chunkStart; i < chunkEnd; i++) {
      if (pos >= idxData.length) {
        throw new Error(`Worker: .idx file too short: reached end at word ${i + 1}/${wordCount}`);
      }

      const wordEnd = idxData.indexOf(0, pos);
      if (wordEnd === -1) {
        throw new Error(`Worker: Invalid .idx structure: no null terminator at position ~${pos} (word ${i + 1})`);
      }

      const wordBytes = idxData.subarray(pos, wordEnd);
      const word = ImportUtils.decodeUTF8(wordBytes);
      const offsetPos = wordEnd + 1;

      if (offsetPos + 8 > idxData.length) {
        throw new Error(`Worker: Invalid offsets at word ${i + 1}: beyond file end`);
      }

      const dictOffset = readUint32(idxData, offsetPos);
      const dictSize = readUint32(idxData, offsetPos + 4);

      chunkOffsets.push({ word, startByte: pos, dictOffset, dictSize });

      pos = wordEnd + 9; // 1 null + 8 bytes (two uint32)
    }

    wordOffsets.push(...chunkOffsets);
    processed += chunkOffsets.length;

    // Report progress
    const progress = Math.round((processed / wordCount) * 100);
    self.postMessage({
      type: 'PROGRESS',
      operation: 'index_build',
      progress,
      current: processed,
      total: wordCount
    });

    // Yield control between chunks
    await ImportUtils.yieldToEventLoop();
  }

  const endTime = performance.now();
  const duration = (endTime - startTime).toFixed(2);

  console.log(`Worker: Index built in ${duration}ms with ${wordOffsets.length} entries`);

  return {
    wordOffsets,
    duration: parseFloat(duration),
    wordCount: wordOffsets.length
  };
}

/**
 * Extracts StarDict data in chunks
 */
async function extractStarDictData({ wordOffsets, dictData, dictionaryName, chunkSize = 5000 }) {
  const terms = [];
  const totalEntries = wordOffsets.length;
  let processed = 0;
  const startTime = performance.now();

  console.log(`Worker: Extracting ${totalEntries} terms in chunks of ${chunkSize}`);

  // Group entries by word for merging duplicates
  const termMap = new Map();

  // Process in chunks
  for (let chunkStart = 0; chunkStart < totalEntries; chunkStart += chunkSize) {
    const chunkEnd = Math.min(chunkStart + chunkSize, totalEntries);
    const chunk = wordOffsets.slice(chunkStart, chunkEnd);

    for (const entry of chunk) {
      const slice = ImportUtils.sliceBuffer(dictData, entry.dictOffset, entry.dictOffset + entry.dictSize);
      const definition = ImportUtils.decodeUTF8(slice);

      const key = `${entry.word}|${entry.word}`; // expression|reading (same for StarDict)

      if (termMap.has(key)) {
        // Merge glossary with existing term
        termMap.get(key).glossary.push(definition);
      } else {
        // Create new term entry
        const termEntry = {
          expression: entry.word,
          reading: entry.word,
          definitionTags: [],
          rules: [],
          score: 0,
          glossary: [definition],
          termTags: [],
          dictionary: dictionaryName
        };
        termMap.set(key, termEntry);
      }
    }

    processed += chunk.length;

    // Report progress
    const progress = Math.round((processed / totalEntries) * 100);
    self.postMessage({
      type: 'PROGRESS',
      operation: 'data_extraction',
      progress,
      current: processed,
      total: totalEntries
    });

    // Yield control between chunks
    await ImportUtils.yieldToEventLoop();
  }

  // Convert Map to array and assign sequential IDs
  const termsArray = Array.from(termMap.values());
  termsArray.forEach((term, index) => {
    term.sequence = index + 1;
  });

  const endTime = performance.now();
  const duration = (endTime - startTime).toFixed(2);

  console.log(`Worker: Extracted ${termsArray.length} unique terms in ${duration}ms`);

  return {
    terms: termsArray,
    duration: parseFloat(duration),
    totalExtracted: termsArray.length,
    originalEntries: totalEntries
  };
}

/**
 * Parses Yomitan data in chunks
 */
async function parseYomitanData({ data, chunkSize = 1000 }) {
  const startTime = performance.now();
  let processed = 0;
  const totalItems = data.length;

  console.log(`Worker: Parsing ${totalItems} Yomitan items in chunks of ${chunkSize}`);

  const results = [];

  for (let i = 0; i < totalItems; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);

    // Process chunk (placeholder - actual Yomitan parsing logic would go here)
    for (const item of chunk) {
      results.push(item); // Pass through for now
    }

    processed += chunk.length;

    // Report progress
    const progress = Math.round((processed / totalItems) * 100);
    self.postMessage({
      type: 'PROGRESS',
      operation: 'yomitan_parse',
      progress,
      current: processed,
      total: totalItems
    });

    await ImportUtils.yieldToEventLoop();
  }

  const endTime = performance.now();
  const duration = (endTime - startTime).toFixed(2);

  return {
    results,
    duration: parseFloat(duration),
    processed: processed
  };
}

/**
 * Generic chunk processing function
 */
async function processChunk({ items, processor, chunkSize = 1000 }) {
  const startTime = performance.now();
  let processed = 0;
  const totalItems = items.length;

  console.log(`Worker: Processing ${totalItems} items in chunks of ${chunkSize}`);

  const results = [];

  for (let i = 0; i < totalItems; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await processor(chunk);
    results.push(...chunkResults);

    processed += chunk.length;

    // Report progress
    const progress = Math.round((processed / totalItems) * 100);
    self.postMessage({
      type: 'PROGRESS',
      operation: 'chunk_process',
      progress,
      current: processed,
      total: totalItems
    });

    await ImportUtils.yieldToEventLoop();
  }

  const endTime = performance.now();
  const duration = (endTime - startTime).toFixed(2);

  return {
    results,
    duration: parseFloat(duration),
    processed: processed
  };
}

/**
 * Process a chunk of StarDict data with streaming
 */
async function processStarDictChunk({ metadata, idxReader, dictReader, synData, chunkIndex, wordStart, wordCount }) {
  const startTime = performance.now();
  const terms = [];

  try {
    // Create streaming readers for this chunk
    const idxStream = {
      data: idxReader.data,
      position: idxReader.startPos,
      getPosition: () => this.position,
      isEOF: () => this.position >= idxReader.endPos,
      readNext: function() {
        if (this.isEOF()) return null;
        const remaining = idxReader.endPos - this.position;
        const size = Math.min(1024, remaining);
        const chunk = this.data.subarray(this.position, this.position + size);
        this.position += size;
        return chunk;
      }
    };

    // Process words in this chunk
    let currentWordIndex = wordStart;
    let pos = idxReader.startPos;

    while (currentWordIndex < wordStart + wordCount && pos < idxReader.endPos) {
      if (pos >= idxReader.data.length) break;

      // Find null terminator
      const wordEnd = idxReader.data.indexOf(0, pos);
      if (wordEnd === -1 || wordEnd >= idxReader.endPos) break;

      const wordBytes = idxReader.data.subarray(pos, wordEnd);
      const word = ImportUtils.decodeUTF8(wordBytes);
      const offsetPos = wordEnd + 1;

      if (offsetPos + 8 > idxReader.data.length) break;

      const dictOffset = readUint32(idxReader.data, offsetPos);
      const dictSize = readUint32(idxReader.data, offsetPos + 4);

      // Extract definition from dict data
      if (dictOffset + dictSize <= dictReader.data.length) {
        const definitionBytes = dictReader.data.subarray(dictOffset, dictOffset + dictSize);
        const definition = ImportUtils.decodeUTF8(definitionBytes);

        terms.push({
          expression: word,
          reading: word, // StarDict doesn't separate reading
          definitionTags: [],
          rules: '',
          score: 0,
          glossary: [definition],
          sequence: currentWordIndex + 1,
          termTags: []
        });
      }

      pos = wordEnd + 9; // Move to next entry
      currentWordIndex++;

      // Yield control periodically
      if (terms.length % 100 === 0) {
        await ImportUtils.yieldToEventLoop();
      }
    }

    // Send chunk results
    self.postMessage({
      type: 'CHUNK',
      requestId: self.currentRequestId,
      chunk: terms
    });

  } catch (error) {
    console.error('Error processing StarDict chunk:', error);
    throw error;
  }

  const duration = performance.now() - startTime;
  console.log(`Worker: Processed StarDict chunk ${chunkIndex} with ${terms.length} terms in ${duration.toFixed(2)}ms`);

  return { processed: terms.length, duration };
}

/**
 * Process Yomitan terms with streaming JSON parsing
 */
async function processYomitanTerms({ content, version, dictionary, filename, fileIndex }) {
  const startTime = performance.now();
  const terms = [];

  try {
    // Use streaming JSON parser for large files
    const stream = DictImportUtils.streamJsonArray(content);

    for await (const item of stream) {
      // Convert Yomitan format to LangBro format
      let [expression, reading, definitionTags, rules, score, glossary, sequence, termTags] = item;

      // Handle different versions
      if (version === 1) {
        [expression, reading, definitionTags, rules, score, ...glossary] = item;
        sequence = 1;
        termTags = [];
      }

      // Ensure reading is not empty
      reading = reading || expression;

      // Process glossary - handle structured content
      const processedGlossary = glossary.map(item => {
        if (typeof item === 'string') {
          return item;
        } else if (typeof item === 'object' && item.type === 'text') {
          return item.text;
        } else {
          // For structured content, convert to HTML (simplified)
          return typeof item === 'object' ? JSON.stringify(item) : String(item);
        }
      });

      terms.push({
        expression,
        reading,
        definitionTags: definitionTags || [],
        rules: rules || '',
        score: score || 0,
        glossary: processedGlossary,
        sequence: sequence || terms.length + 1,
        termTags: termTags || [],
        dictionary
      });

      // Send chunks periodically to avoid memory buildup
      if (terms.length % 1000 === 0) {
        self.postMessage({
          type: 'CHUNK',
          requestId: self.currentRequestId,
          chunk: terms.splice(0) // Send and clear
        });
        await ImportUtils.yieldToEventLoop();
      }
    }

    // Send remaining terms
    if (terms.length > 0) {
      self.postMessage({
        type: 'CHUNK',
        requestId: self.currentRequestId,
        chunk: terms
      });
    }

  } catch (error) {
    console.error('Error processing Yomitan terms:', error);
    throw error;
  }

  const duration = performance.now() - startTime;
  console.log(`Worker: Processed ${filename} with ${terms.length} terms in ${duration.toFixed(2)}ms`);

  return { processed: terms.length, duration };
}

/**
 * Reads a big-endian uint32 from buffer
 */
function readUint32(buffer, offset) {
  return (buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3];
}