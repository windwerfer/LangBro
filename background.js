// Background script for WordClick Dictionary
// Manages StarDictParser instance and message passing

let parser = null;

chrome.runtime.onInstalled.addListener(async () => {
  console.log('WordClick Dictionary installed');
  await initParser();
});

chrome.runtime.onStartup.addListener(async () => {
  await initParser();
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

// Initialize parser from IndexedDB
async function initParser() {
  try {
    if (!parser) {
      const dicts = await getAllDictsFromIndexedDB();
      if (dicts.length > 0) {
        parser = new StarDictParser();
        await parser.loadFromIndexedDB(dicts[0]);
        console.log(`Parser initialized with ${parser.wordCount} words`);
      } else {
        console.log('No dictionary in IndexedDB');
      }
    }
  } catch (error) {
    console.error('Failed to initialize parser:', error);
    parser = null;
  }
}

// Message listener for content scripts (e.g., lookup requests)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'lookup') {
    if (!parser) {
      sendResponse({ error: 'No dictionary loaded' });
      return;
    }
    try {
      const definition = parser.lookup(request.word);
      sendResponse({ definition: definition || 'No definition found' });
    } catch (error) {
      sendResponse({ error: error.message });
    }
    return true; // Async response
  } else if (request.action === 'isLoaded') {
    sendResponse({ isLoaded: !!parser, wordCount: parser ? parser.wordCount : 0 });
  } else if (request.action === 'reloadParser') {
    initParser().catch(console.error);
    sendResponse({ success: true });
  }
  return false;
});
