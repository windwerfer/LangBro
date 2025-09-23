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

// Listen for storage changes (e.g., new dict uploaded)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.stardict) {
    console.log('Dictionary changed, reinitializing parser');
    initParser().catch(console.error);
  }
});

// Initialize parser from storage
async function initParser() {
  try {
    if (!parser) {
      parser = new StarDictParser();
      await parser.loadFromStorage();
      console.log(`Parser initialized with ${parser.wordCount} words`);
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
  }
  return false;
});