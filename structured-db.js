// Structured Database Handler for Yomitan-style storage
// Handles storing and querying dictionary data in structured IndexedDB format

class StructuredDictionaryDatabase {
  constructor() {
    this.db = null;
    this.dbVersion = 2; // Increment version for new schema
  }

  // Initialize database with structured schema
  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('YomitanDictionaryDB', this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('Upgrading structured database to version', this.dbVersion);

        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains('dictionaries')) {
          db.createObjectStore('dictionaries', { keyPath: 'title' });
        }
        if (!db.objectStoreNames.contains('terms')) {
          const termsStore = db.createObjectStore('terms', { keyPath: ['dictionary', 'expression', 'reading'] });
          termsStore.createIndex('expression', ['dictionary', 'expression']);
          termsStore.createIndex('reading', ['dictionary', 'reading']);
        }
        if (!db.objectStoreNames.contains('kanji')) {
          db.createObjectStore('kanji', { keyPath: ['dictionary', 'character'] });
        }
        if (!db.objectStoreNames.contains('media')) {
          db.createObjectStore('media', { keyPath: ['dictionary', 'path'] });
        }
        if (!db.objectStoreNames.contains('tagMeta')) {
          db.createObjectStore('tagMeta', { keyPath: ['dictionary', 'name'] });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('Structured database opened successfully');
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Failed to open structured database:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Store structured dictionary data
  async storeDictionary(structuredData) {
    if (!this.db) await this.open();

    const { terms, kanji, media, metadata } = structuredData;

    console.log(`Storing dictionary ${metadata.title} with ${terms.length} terms`);

    const transaction = this.db.transaction(['dictionaries', 'terms', 'kanji', 'media'], 'readwrite');

    // Store dictionary metadata
    const dictStore = transaction.objectStore('dictionaries');
    await this._put(dictStore, metadata);

    // Store terms in batches
    const termStore = transaction.objectStore('terms');
    await this._storeBatch(termStore, terms, 100);

    // Store kanji if any
    if (kanji.length > 0) {
      const kanjiStore = transaction.objectStore('kanji');
      await this._storeBatch(kanjiStore, kanji, 100);
    }

    // Store media if any
    if (media.length > 0) {
      const mediaStore = transaction.objectStore('media');
      await this._storeBatch(mediaStore, media, 100);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log('Dictionary stored successfully');
        resolve();
      };
      transaction.onerror = () => {
        console.error('Failed to store dictionary:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  // Lookup term in structured database
  async lookupTerm(expression, reading = expression) {
    if (!this.db) await this.open();

    // Get all dictionaries first
    const dictionaries = await this.getAllDictionaries();

    // Search through each dictionary
    for (const dict of dictionaries) {
      // Try exact match first
      let results = await this._queryTerms('expression', [dict.title, expression]);

      // If no results and reading differs, try reading match
      if (results.length === 0 && reading !== expression) {
        results = await this._queryTerms('reading', [dict.title, reading]);
      }

      if (results.length > 0) {
        // Return the first match's glossary
        return results[0].glossary.join('\n');
      }
    }

    return null;
  }

  // Check if dictionary exists
  async dictionaryExists(title) {
    if (!this.db) await this.open();

    const transaction = this.db.transaction(['dictionaries'], 'readonly');
    const store = transaction.objectStore('dictionaries');

    return new Promise((resolve) => {
      const request = store.get(title);
      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => resolve(false);
    });
  }

  // Get all dictionaries
  async getAllDictionaries() {
    if (!this.db) await this.open();

    const transaction = this.db.transaction(['dictionaries'], 'readonly');
    const store = transaction.objectStore('dictionaries');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Helper methods
  async _queryTerms(indexName, key) {
    const transaction = this.db.transaction(['terms'], 'readonly');
    const store = transaction.objectStore('terms');
    const index = store.index(indexName);

    return new Promise((resolve, reject) => {
      const request = index.getAll(key);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async _storeBatch(store, items, batchSize) {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      for (const item of batch) {
        await this._put(store, item);
      }
    }
  }

  async _put(store, item) {
    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Clear all data
  async clearAll() {
    if (!this.db) await this.open();

    const stores = ['dictionaries', 'terms', 'kanji', 'media', 'tagMeta'];
    const transaction = this.db.transaction(stores, 'readwrite');

    for (const storeName of stores) {
      const store = transaction.objectStore(storeName);
      store.clear();
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // Get actual term counts for verification
  async getActualTermCounts() {
    if (!this.db) await this.open();

    const dicts = await this.getAllDictionaries();
    const result = {};

    for (const dict of dicts) {
      const transaction = this.db.transaction(['terms'], 'readonly');
      const store = transaction.objectStore('terms');
      const index = store.index('expression');

      // Count terms for this dictionary
      const count = await new Promise((resolve, reject) => {
        let termCount = 0;
        const request = index.openCursor();

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            // Check if this term belongs to our dictionary
            if (cursor.value.dictionary === dict.title) {
              termCount++;
            }
            cursor.continue();
          } else {
            resolve(termCount);
          }
        };

        request.onerror = () => reject(request.error);
      });

      result[dict.title] = {
        expected: dict.counts.terms.total,
        actual: count
      };
    }

    return result;
  }
}

// Export for use
if (typeof module !== 'undefined') {
  module.exports = StructuredDictionaryDatabase;
} else {
  window.StructuredDictionaryDatabase = StructuredDictionaryDatabase;
}
