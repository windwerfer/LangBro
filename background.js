// Background script for WordClick Dictionary
// Manages StarDictParser instance and message passing

console.log('BACKGROUND SCRIPT LOADED - WordClick Dictionary v2.0');
console.log('Background script initialization starting...');

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

      // Progress log for large dicts (every 2k)
      if (processed % 2000 === 0) {
        console.log(`Processed ${processed}/${this.wordCount} words so far...`);
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

let structuredDB = null;

async function getStructuredDB() {
  if (!structuredDB) {
    structuredDB = new StructuredDictionaryDatabase();
    await structuredDB.open();
  }
  return structuredDB;
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log('LOG', 'WordClick Dictionary installed');
  await initDB();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('LOG', 'WordClick Dictionary startup');
  await initDB();
});

// IndexedDB functions for background
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('StarDictDB', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('dictionaries')) {
        db.createObjectStore('dictionaries', { keyPath: 'dictName' });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function getAllDictsFromIndexedDB() {
  const db = await openDB();
  const transaction = db.transaction(['dictionaries'], 'readonly');
  const store = transaction.objectStore('dictionaries');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Initialize structured database
async function initDB() {
  try {
    const db = await getStructuredDB();
    const dicts = await db.getAllDictionaries();
    console.log('LOG', `Database initialized with ${dicts.length} dictionaries`);
  } catch (error) {
    console.error('ERROR', 'Failed to initialize database:', error);
  }
}

// Message listener for content scripts (e.g., lookup requests)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('LOG', 'Background received message:', request);

  if (request.action === 'lookup') {
    console.log('LOG', 'Lookup request for word:', request.word, 'via group:', request.groupId);

    // Handle async operation properly
    (async () => {
      try {
        let definition = null;

        if (request.queryType === 'offline') {
          // Use selective StarDict lookup based on selected dictionaries
          const db = await getStructuredDB();
          const selectedDictionaries = request.settings?.selectedDictionaries || [];

          if (selectedDictionaries.length === 0) {
            definition = 'No dictionaries selected for this query group.';
          } else {
            // Query only selected dictionaries
            definition = await db.lookupTermInDictionaries(request.word, selectedDictionaries);
            console.log('LOG', 'Selective offline lookup result:', definition);
          }
        } else if (request.queryType === 'web') {
          // Web API lookup
          definition = await performWebLookup(request.word, request.settings);
        } else if (request.queryType === 'ai') {
          // AI service lookup
          definition = await performAILookup(request.word, request.settings);
        } else {
          throw new Error(`Unknown query type: ${request.queryType}`);
        }

        sendResponse({ definition: definition || 'No definition found' });
      } catch (error) {
        console.error('ERROR', 'Lookup error:', error);
        sendResponse({ error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (request.action === 'isLoaded') {
    (async () => {
      try {
        const db = await getStructuredDB();
        const dicts = await db.getAllDictionaries();
        const totalWords = dicts.reduce((sum, dict) => sum + dict.counts.terms.total, 0);
        sendResponse({ isLoaded: dicts.length > 0, wordCount: totalWords });
      } catch (error) {
        console.error('ERROR', 'Error checking if loaded:', error);
        sendResponse({ isLoaded: false, wordCount: 0 });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (request.action === 'getAllDictionaries') {
    (async () => {
      try {
        const db = await getStructuredDB();
        const dictionaries = await db.getAllDictionaries();
        sendResponse({ dictionaries: dictionaries });
      } catch (error) {
        console.error('ERROR', 'Error getting dictionaries:', error);
        sendResponse({ dictionaries: [] });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (request.action === 'reloadParser') {
    // No longer needed with structured DB, but keep for compatibility
    sendResponse({ success: true });
  }
  return false;
});

// Perform web API lookup
async function performWebLookup(word, settings) {
  if (!settings || !settings.url) {
    throw new Error('Web API settings not configured');
  }

  const url = settings.url.replace('{word}', encodeURIComponent(word)).replace('{text}', encodeURIComponent(word));
  const headers = {};

  if (settings.apiKey) {
    headers['Authorization'] = `Bearer ${settings.apiKey}`;
    // Or other auth methods as needed
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: headers
  });

  if (!response.ok) {
    throw new Error(`Web API error: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');

  // Handle different response types
  if (contentType && contentType.includes('application/json')) {
    // JSON response
    const data = await response.json();

    // Try common response formats
    if (data.definition) return data.definition;
    if (data.meaning) return data.meaning;
    if (data.result) return data.result;
    if (data.translation) return data.translation;
    if (typeof data === 'string') return data;

    // Fallback: return the full response as formatted JSON
    return JSON.stringify(data, null, 2);
  } else {
    // HTML, text, or other response types
    const text = await response.text();
    console.log('Web API HTML response length:', text.length);
    console.log('Web API HTML preview:', text.substring(0, 500));

    // For HTML responses, try to extract meaningful content
    if (contentType && contentType.includes('text/html')) {
      // Google Translate specific patterns
      const googleTranslatePatterns = [
        /<span[^>]*jsname="[^"]*W297wb[^"]*"[^>]*>([^<]+)<\/span>/i,
        /<div[^>]*class="[^"]*result[^"]*"[^>]*>([^<]+)<\/div>/i,
        /<span[^>]*class="[^"]*tlid-translation[^"]*"[^>]*>([^<]+)<\/span>/i,
        /"tlid-translation"[^>]*>([^<]+)<\/span>/i
      ];

      // Try Google Translate patterns first
      for (const pattern of googleTranslatePatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].trim().length > 0) {
          return match[1].trim();
        }
      }

      // General translation patterns
      const generalPatterns = [
        /<span[^>]*id="result[^"]*"[^>]*>([^<]+)<\/span>/i,
        /<div[^>]*class="[^"]*result[^"]*"[^>]*>([^<]+)<\/div>/i,
        /<div[^>]*id="[^"]*translation[^"]*"[^>]*>([^<]+)<\/div>/i,
        /<span[^>]*class="[^"]*translation[^"]*"[^>]*>([^<]+)<\/span>/i,
        /<div[^>]*class="[^"]*translated[^"]*"[^>]*>([^<]+)<\/div>/i
      ];

      for (const pattern of generalPatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].trim().length > 0) {
          return match[1].trim();
        }
      }

      // Look for JSON data embedded in the HTML (common with modern web apps)
      const jsonMatch = text.match(/{"[^"]*":\s*"([^"]*(?:\\.[^"]*)*)"[^}]*}/);
      if (jsonMatch) {
        try {
          const jsonData = JSON.parse(jsonMatch[0]);
          if (jsonData.translation) return jsonData.translation;
          if (jsonData.result) return jsonData.result;
        } catch (e) {
          // Ignore JSON parsing errors
        }
      }

      // If no specific pattern found, return a cleaned version of the HTML
      // Remove scripts, styles, and basic HTML tags
      let cleaned = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      cleaned = cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      // Look for the most relevant text content
      const words = cleaned.split(' ');
      const relevantWords = words.filter(word =>
        word.length > 2 &&
        !word.match(/^(and|the|for|are|but|not|you|all|can|had|her|was|one|our|out|day|get|has|him|his|how|its|may|new|now|old|see|two|way|who|boy|did|has|let|put|say|she|too|use)$/i)
      );

      if (relevantWords.length > 0 && cleaned.length < 500) {
        return cleaned;
      }

      // If cleaning didn't work well, return a message
      return 'Translation page loaded. Please check the opened tab for results.';
    }

    // For plain text responses
    return text.trim();
  }
}

// Perform AI service lookup
async function performAILookup(word, settings) {
  if (!settings || !settings.apiKey || !settings.model) {
    throw new Error('AI settings not configured');
  }

  const prompt = (settings.prompt || 'Define the meaning of: {word}').replace('{word}', word);

  let apiUrl, requestBody, headers;

  switch (settings.provider) {
    case 'openai':
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      requestBody = {
        model: settings.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500
      };
      headers = {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      };
      break;

    case 'anthropic':
      apiUrl = 'https://api.anthropic.com/v1/messages';
      requestBody = {
        model: settings.model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      };
      headers = {
        'x-api-key': settings.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      };
      break;

    case 'google':
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;
      requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 500 }
      };
      headers = {
        'Content-Type': 'application/json'
      };
      break;

    default:
      throw new Error(`Unsupported AI provider: ${settings.provider}`);
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Extract response based on provider
  switch (settings.provider) {
    case 'openai':
      return data.choices?.[0]?.message?.content || 'No response from OpenAI';

    case 'anthropic':
      return data.content?.[0]?.text || 'No response from Anthropic';

    case 'google':
      return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Google AI';

    default:
      return JSON.stringify(data, null, 2);
  }
}
