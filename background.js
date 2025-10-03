// Background script for langbro Dictionary
// Manages StarDictParser instance and message passing
try {
  importScripts('structured-db.js');
} catch (e) {
  // Fallback: Assume it's loaded via manifest (for Firefox)
  console.log('firefox detected');
}

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
  console.log('LOG', 'langbro Dictionary installed');
  await initDB();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('LOG', 'langbro Dictionary startup');
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
        const word = request.word || '';

        let definition = null;

        if (request.queryType === 'offline') {
          // Use selective StarDict lookup based on selected dictionaries
          const db = await getStructuredDB();
          const selectedDictionaries = request.settings?.selectedDictionaries || [];

          if (selectedDictionaries.length === 0) {
            definition = 'No dictionaries selected for this query group.';
          } else {
            // Query only selected dictionaries
            definition = await db.lookupTermInDictionaries(word, selectedDictionaries);
            console.log('LOG', 'Selective offline lookup result:', word, ' -> ',  definition);
          }
        } else if (request.queryType === 'web' || request.queryType === 'google_translate') {
          // Web API lookup (including Google Translate preset)
          definition = await performWebLookup(word, request.settings, request.groupId);
        } else if (request.queryType === 'ai') {
          // AI service lookup
          definition = await performAILookup(word, request.context || '', request.settings, request.groupId);
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
  } else if (request.action === 'getSuggestions') {
    (async () => {
      try {
        const word = request.word || '';
        const maxResults = request.maxResults || 10;
        const selectedDictionaries = request.selectedDictionaries || [];

        console.log('BACKGROUND: Received getSuggestions request for word:', word, 'maxResults:', maxResults, 'dictionaries:', selectedDictionaries);

        if (!word.trim()) {
          console.log('BACKGROUND: Word is empty, returning empty suggestions');
          sendResponse({ suggestions: [] });
          return;
        }

        const db = await getStructuredDB();
        // console.log('BACKGROUND: Calling db.getSuggestionsInDictionaries with word:', word, 'maxResults:', maxResults, 'dictionaries:', selectedDictionaries);
        const suggestions = await db.getSuggestionsInDictionaries(word, maxResults, selectedDictionaries);
        console.log('BACKGROUND: Sending response with suggestions:', suggestions);
        sendResponse({ suggestions: suggestions });
      } catch (error) {
        console.error('BACKGROUND: Error getting suggestions:', error);
        sendResponse({ suggestions: [] });
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
  } else if (request.action === 'didYouMean') {
    (async () => {
      try {
        const word = request.word || '';
        const nextChars = request.nextChars || '';
        const maxResults = request.maxResults || 10;
        const selectedDictionaries = request.selectedDictionaries || [];

        console.log('BACKGROUND: Received didYouMean request for word:', word, 'nextChars:', nextChars, 'maxResults:', maxResults, 'dictionaries:', selectedDictionaries);

        if (!word.trim()) {
          console.log('BACKGROUND: Word is empty, returning empty did-you-mean suggestions');
          sendResponse({ suggestions: [] });
          return;
        }

        if (!nextChars.trim()) {
          console.log('BACKGROUND: nextChars is empty, returning empty did-you-mean suggestions');
          sendResponse({ suggestions: [] });
          return;
        }

        const db = await getStructuredDB();
        console.log('BACKGROUND: Calling db.getDidYouMeanSuggestions with word:', word, 'nextChars:', nextChars, 'maxResults:', maxResults, 'dictionaries:', selectedDictionaries);
        const suggestions = await db.getDidYouMeanSuggestions(word, nextChars, maxResults, selectedDictionaries);
        console.log('BACKGROUND: Database returned did-you-mean suggestions:', suggestions);
        console.log('BACKGROUND: Sending response with did-you-mean suggestions:', suggestions);
        sendResponse({ suggestions: suggestions });
      } catch (error) {
        console.error('BACKGROUND: Error getting did-you-mean suggestions:', error);
        sendResponse({ suggestions: [] });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (request.action === 'reloadParser') {
    // No longer needed with structured DB, but keep for compatibility
    sendResponse({ success: true });
  }
  return false;
});

// Language mappings for {lang} and {lang_short} placeholders (sorted alphabetically by full language name)
const languageMap = {
  'ar': 'arabic',
  'bn': 'bengali',
  'zh': 'chinese',
  'hr': 'croatian',
  'cs': 'czech',
  'da': 'danish',
  'nl': 'dutch',
  'en': 'english',
  'fi': 'finnish',
  'fr': 'french',
  'de': 'german',
  'el': 'greek',
  'he': 'hebrew',
  'hi': 'hindi',
  'hu': 'hungarian',
  'it': 'italian',
  'ja': 'japanese',
  'jv': 'javanese',
  'ko': 'korean',
  'no': 'norwegian',
  'pa': 'punjabi',
  'pl': 'polish',
  'pt': 'portuguese',
  'ro': 'romanian',
  'ru': 'russian',
  'sk': 'slovak',
  'sl': 'slovenian',
  'es': 'spanish',
  'sv': 'swedish',
  'th': 'thai',
  'tr': 'turkish',
  'vi': 'vietnamese'
};

// Cache utility functions
async function getCacheKey(word, lang, queryType, context = '') {
  const langShort = lang;

  if (queryType === 'web' || queryType === 'google_translate') {
    // Web API: lang_short + "_" + hash(word)
    const hash = await hashString(word);
    return `${langShort}_${hash}`;
  } else if (queryType === 'ai') {
    // AI query: lang_short + "_" + hash(word + context)
    const hash = await hashString(word + context);
    return `${langShort}_${hash}`;
  }

  return null;
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

async function getCachedResult(groupId, cacheKey) {
  try {
    const result = await chrome.storage.local.get(['queryGroupCaches', 'cacheTimeoutDays']);
    const caches = result.queryGroupCaches || {};
    const timeoutDays = result.cacheTimeoutDays || 0;

    if (!caches[groupId] || !caches[groupId][cacheKey]) {
      return null;
    }

    const cached = caches[groupId][cacheKey];
    const now = Date.now();

    // Check if cache has expired
    if (timeoutDays > 0) {
      const cacheAge = now - cached.timestamp;
      const maxAge = timeoutDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds

      if (cacheAge > maxAge) {
        // Cache expired, remove it
        delete caches[groupId][cacheKey];
        await chrome.storage.local.set({ queryGroupCaches: caches });
        return null;
      }
    }

    return cached.result;
  } catch (error) {
    console.error('Error getting cached result:', error);
    return null;
  }
}

async function setCachedResult(groupId, cacheKey, result) {
  try {
    const storageResult = await chrome.storage.local.get(['queryGroupCaches']);
    const caches = storageResult.queryGroupCaches || {};

    if (!caches[groupId]) {
      caches[groupId] = {};
    }

    caches[groupId][cacheKey] = {
      result: result,
      timestamp: Date.now()
    };

    await chrome.storage.local.set({ queryGroupCaches: caches });
  } catch (error) {
    console.error('Error setting cached result:', error);
  }
}

async function clearGroupCache(groupId) {
  try {
    const result = await chrome.storage.local.get(['queryGroupCaches']);
    const caches = result.queryGroupCaches || {};

    if (caches[groupId]) {
      delete caches[groupId];
      await chrome.storage.local.set({ queryGroupCaches: caches });
    }
  } catch (error) {
    console.error('Error clearing group cache:', error);
  }
}

// JSON path extraction function - supports dot notation, bracket notation, and array indices
function extractJsonPath(data, path) {
  if (!path || !path.trim()) return data;

  try {
    // Handle complex paths like "0[0][1]", "result.translation", "data[0].text"
    const parts = parseJsonPath(path);
    let current = data;

    for (const part of parts) {
      if (current == null) return null;

      if (typeof part === 'number') {
        // Array index
        if (Array.isArray(current) && part < current.length) {
          current = current[part];
        } else {
          return null;
        }
      } else if (typeof part === 'string') {
        // Object property
        if (typeof current === 'object' && current !== null && part in current) {
          current = current[part];
        } else {
          return null;
        }
      }
    }

    return current;
  } catch (error) {
    console.error('JSON path extraction error:', error, 'path:', path);
    return null;
  }
}

// Parse JSON path supporting various formats
function parseJsonPath(path) {
  const parts = [];
  let current = '';
  let i = 0;

  while (i < path.length) {
    const char = path[i];

    if (char === '.' || char === '[') {
      // End of previous part
      if (current) {
        parts.push(parsePathPart(current));
        current = '';
      }

      if (char === '[') {
        // Parse bracketed content
        let bracketContent = '';
        i++; // Skip '['
        let depth = 1;

        while (i < path.length && depth > 0) {
          if (path[i] === '[') depth++;
          else if (path[i] === ']') depth--;
          else bracketContent += path[i];
          i++;
        }

        // Skip closing ']'
        if (path[i] === ']') i++;

        if (bracketContent) {
          parts.push(parsePathPart(bracketContent));
        }
      } else {
        i++; // Skip '.'
      }
    } else {
      current += char;
      i++;
    }
  }

  // Add remaining part
  if (current) {
    parts.push(parsePathPart(current));
  }

  return parts;
}

// Convert path part to appropriate type
function parsePathPart(part) {
  // Try to parse as number for array indices
  const num = parseInt(part, 10);
  if (!isNaN(num) && num.toString() === part) {
    return num;
  }
  return part;
}

// Perform web API lookup
async function performWebLookup(word, settings, groupId = null) {
  // Check cache first if caching is enabled
  if (groupId) {
    const cachingEnabled = await new Promise(resolve => {
      chrome.storage.local.get(['cachingEnabled'], (result) => {
        resolve(result.cachingEnabled || false);
      });
    });

    if (cachingEnabled) {
      const targetLanguage = await new Promise(resolve => {
        chrome.storage.local.get(['targetLanguage'], (result) => {
          resolve(result.targetLanguage || 'en');
        });
      });

      const cacheKey = await getCacheKey(word, targetLanguage, 'web');
      if (cacheKey) {
        const cachedResult = await getCachedResult(groupId, cacheKey);
        if (cachedResult) {
          console.log('Web lookup - cache hit for:', word);
          return cachedResult;
        }
      }
    }
  }

  let serviceSettings = settings;

  // If settings is just a serviceId reference, look up the full service config
  if (settings && settings.serviceId && !settings.url) {
    const serviceId = settings.serviceId;
    const webServices = await new Promise(resolve => {
      chrome.storage.local.get(['webServices'], (result) => {
        resolve(result.webServices || []);
      });
    });

    const webService = webServices.find(service => service.id === serviceId);
    if (!webService) {
      throw new Error(`Web service with ID "${serviceId}" not found`);
    }

    serviceSettings = webService;
  }

  if (!serviceSettings || !serviceSettings.url) {
    throw new Error('Web API settings not configured');
  }

  // Get target language setting
  const targetLanguage = await new Promise(resolve => {
    chrome.storage.local.get(['targetLanguage'], (result) => {
      resolve(result.targetLanguage || 'en');
    });
  });

  const langShort = targetLanguage;
  const lang = languageMap[targetLanguage] || targetLanguage;
  const text = encodeURIComponent(word);

  console.log('Web lookup - original word:', word, 'encoded text:', text, 'lang:', lang, 'langShort:', langShort);

  let url = serviceSettings.url;
  url = url.replace(/\{text\}/g, text);
  url = url.replace(/\{lang\}/g, lang);
  url = url.replace(/\{lang_short\}/g, langShort);


  console.log('Web lookup - final URL:', url);

  const headers = {};

  if (serviceSettings.apiKey) {
    headers['Authorization'] = `Bearer ${serviceSettings.apiKey}`;
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
  let result;
  if (contentType && contentType.includes('application/json')) {
    // JSON response
    const data = await response.json();

    // If JSON path is specified, extract the specific data
    if (serviceSettings.jsonPath) {
      const extracted = extractJsonPath(data, serviceSettings.jsonPath);
      if (extracted !== null) {
        // Return the extracted value, converting to string if needed
        result = typeof extracted === 'string' ? extracted : JSON.stringify(extracted, null, 2);
      } else {
        // If extraction failed, fall back to common patterns
        result = extractCommonJsonResult(data);
      }
    } else {
      result = extractCommonJsonResult(data);
    }
  } else {
    // HTML, text, or other response types
    const text = await response.text();
    console.log('Web API HTML response length:', text.length);
    console.log('Web API HTML preview:', text.substring(0, 500));

    result = extractFromHtmlResponse(text, contentType);
  }

  // Cache the result if caching is enabled
  if (groupId && result) {
    const cachingEnabled = await new Promise(resolve => {
      chrome.storage.local.get(['cachingEnabled'], (result) => {
        resolve(result.cachingEnabled || false);
      });
    });

    if (cachingEnabled) {
      const cacheKey = await getCacheKey(word, targetLanguage, 'web');
      if (cacheKey) {
        await setCachedResult(groupId, cacheKey, result);
        console.log('Web lookup - cached result for:', word);
      }
    }
  }

  return result;
}

// Helper function to extract common JSON result patterns
function extractCommonJsonResult(data) {
  // Try common response formats
  if (data.definition) return data.definition;
  if (data.meaning) return data.meaning;
  if (data.result) return data.result;
  if (data.translation) return data.translation;
  if (typeof data === 'string') return data;

  // Try Google Translate array patterns (data[0][n][0] where n = 0, 1, 2, ...)
  if (data && Array.isArray(data[0])) {
    const translations = [];
    for (let i = 0; i < Math.min(data[0].length, 5); i++) { // Try first 5 results
      if (data[0][i] && Array.isArray(data[0][i]) && data[0][i][0]) {
        translations.push(data[0][i][0]);
      }
    }
    if (translations.length > 0) {
      return translations.join(' ');
    }
  }

  // Fallback: return the full response as formatted JSON
  return JSON.stringify(data, null, 2);
}

// Helper function to extract from HTML responses
function extractFromHtmlResponse(text, contentType) {
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

// Parse common markup notations in AI responses (lightweight Markdown-like parser)
function parseAIMarkup(text) {
  if (!text || typeof text !== 'string') return text;

  let html = text;

  // Escape HTML entities first
  html = html.replace(/&/g, '&')
             .replace(/</g, '<')
             .replace(/>/g, '>');

  // Headers (# ## ###)
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold (**text** or __text__)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic (*text* or _text_)
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');

  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Code blocks (```code```)
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Unordered lists (- item or * item)
  html = html.replace(/^[\s]*[-*]\s+(.*)$/gm, '<li>$1</li>');
  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/(<li>.*<\/li>\s*)+/g, '<ul>$&</ul>');

  // Ordered lists (1. item, 2. item, etc.)
  html = html.replace(/^[\s]*\d+\.\s+(.*)$/gm, '<li>$1</li>');
  // Wrap consecutive numbered <li> elements in <ol>
  // This is trickier - we'll use a more specific pattern
  const lines = html.split('\n');
  let inOrderedList = false;
  let result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    if (line.includes('<li>') && /^\d+\./.test(lines[i - 1] || '')) {
      if (!inOrderedList) {
        result.push('<ol>');
        inOrderedList = true;
      }
      result.push(line);
      // Check if next line continues the list
      if (!nextLine || !nextLine.includes('<li>') || !/^\d+\./.test(lines[i + 1] || '')) {
        result.push('</ol>');
        inOrderedList = false;
      }
    } else {
      if (inOrderedList) {
        result.push('</ol>');
        inOrderedList = false;
      }
      result.push(line);
    }
  }

  if (inOrderedList) {
    result.push('</ol>');
  }

  html = result.join('\n');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Line breaks (double newline to <p>, single to <br>)
  html = html.replace(/\n\n+/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph if not already wrapped
  if (!html.includes('<p>') && !html.includes('<h') && !html.includes('<ul') && !html.includes('<ol')) {
    html = '<p>' + html + '</p>';
  }

  return html;
}

// Perform AI service lookup
async function performAILookup(word, context, settings, groupId = null) {
  // Check cache first if caching is enabled
  if (groupId) {
    const cachingEnabled = await new Promise(resolve => {
      chrome.storage.local.get(['cachingEnabled'], (result) => {
        resolve(result.cachingEnabled || false);
      });
    });

    if (cachingEnabled) {
      const targetLanguage = await new Promise(resolve => {
        chrome.storage.local.get(['targetLanguage'], (result) => {
          resolve(result.targetLanguage || 'en');
        });
      });

      // For AI queries, include context in cache key
      const contextToUse = settings.sendContext && context ? context : '';
      const cacheKey = await getCacheKey(word, targetLanguage, 'ai', contextToUse);
      if (cacheKey) {
        const cachedResult = await getCachedResult(groupId, cacheKey);
        if (cachedResult) {
          console.log('AI lookup - cache hit for:', word);
          return cachedResult;
        }
      }
    }
  }

  let serviceSettings = settings;

  // If settings is just a serviceId reference, look up the full service config
  if (settings && settings.serviceId && !settings.apiKey) {
    const serviceId = settings.serviceId;
    const aiServices = await new Promise(resolve => {
      chrome.storage.local.get(['aiServices'], (result) => {
        resolve(result.aiServices || []);
      });
    });

    const aiService = aiServices.find(service => service.id === serviceId);
    if (!aiService) {
      throw new Error(`AI service with ID "${serviceId}" not found`);
    }

    // Merge query group settings (maxTokens, prompt) with service config
    serviceSettings = {
      ...aiService,  // Base service config (apiKey, model, provider)
      ...settings,   // Override with query group settings (maxTokens, prompt)
    };
  }

  if (!serviceSettings || !serviceSettings.apiKey || !serviceSettings.model) {
    throw new Error('AI settings not configured');
  }

  // Get target language setting for placeholder substitution
  const targetLanguage = await new Promise(resolve => {
    chrome.storage.local.get(['targetLanguage'], (result) => {
      resolve(result.targetLanguage || 'en');
    });
  });

  const langShort = targetLanguage;
  const lang = languageMap[targetLanguage] || targetLanguage;

  let prompt = serviceSettings.prompt || 'You are a Tutor, give a grammar breakdown for: {text}';
  prompt = prompt.replace('{text}', word);
  prompt = prompt.replace('{lang}', lang);
  prompt = prompt.replace('{lang_short}', langShort);
  // Only include context if the group setting allows it
  const contextToUse = serviceSettings.sendContext && context ? context : '';
  prompt = prompt.replace('{context}', contextToUse);
  // Note: For AI prompts, we don't URL encode {text} as it's not being sent in a URL

  console.log('AI lookup - original word:', word, 'lang:', lang, 'langShort:', langShort, 'final prompt:', prompt);

  const maxTokens = serviceSettings.maxTokens || 2048;

  let apiUrl, requestBody, headers;

  switch (serviceSettings.provider) {
    case 'openai':
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      requestBody = {
        model: serviceSettings.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens
      };
      headers = {
        'Authorization': `Bearer ${serviceSettings.apiKey}`,
        'Content-Type': 'application/json'
      };
      break;

    case 'anthropic':
      apiUrl = 'https://api.anthropic.com/v1/messages';
      requestBody = {
        model: serviceSettings.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      };
      headers = {
        'x-api-key': serviceSettings.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      };
      break;

    case 'google':
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${serviceSettings.model}:generateContent?key=${serviceSettings.apiKey}`;
      requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens }
      };
      headers = {
        'Content-Type': 'application/json'
      };
      break;

    default:
      throw new Error(`Unsupported AI provider: ${serviceSettings.provider}`);
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
  let rawResponse;
  switch (serviceSettings.provider) {
    case 'openai':
      rawResponse = data.choices?.[0]?.message?.content || 'No response from OpenAI';
      break;
    case 'anthropic':
      rawResponse = data.content?.[0]?.text || 'No response from Anthropic';
      break;
    case 'google':
      rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Google AI';
      break;
    default:
      rawResponse = JSON.stringify(data, null, 2);
  }

  // Parse markup in AI response
  const result = parseAIMarkup(rawResponse);

  // Cache the result if caching is enabled
  if (groupId && result) {
    const cachingEnabled = await new Promise(resolve => {
      chrome.storage.local.get(['cachingEnabled'], (result) => {
        resolve(result.cachingEnabled || false);
      });
    });

    if (cachingEnabled) {
      const cacheKey = await getCacheKey(word, targetLanguage, 'ai', contextToUse);
      if (cacheKey) {
        await setCachedResult(groupId, cacheKey, result);
        console.log('AI lookup - cached result for:', word);
      }
    }
  }

  return result;
}
