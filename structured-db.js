// Structured Database Handler for Yomitan-style storage
// Handles storing and querying dictionary data in structured IndexedDB format

class StructuredDictionaryDatabase {
  constructor() {
    this.db = null;
    this.dbVersion = 3; // Increment version for new schema
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
  async storeDictionary(structuredData, progressCallback = null) {
    if (!this.db) await this.open();

    const { terms, kanji, media, metadata } = structuredData;

    console.log(`Storing dictionary ${metadata.title} with ${terms.length} terms`);

    const transaction = this.db.transaction(['dictionaries', 'terms', 'kanji', 'media'], 'readwrite');

    // Store dictionary metadata
    const dictStore = transaction.objectStore('dictionaries');
    await this._put(dictStore, metadata);

    // Store terms in batches
    const termStore = transaction.objectStore('terms');
    const termsStored = await this._storeBatch(termStore, terms, 100, progressCallback);
    console.log(`Terms storage: sent ${terms.length}, stored ${termsStored}`);

    // Store kanji if any
    if (kanji.length > 0) {
      const kanjiStore = transaction.objectStore('kanji');
      const kanjiStored = await this._storeBatch(kanjiStore, kanji, 100, progressCallback);
      console.log(`Kanji storage: sent ${kanji.length}, stored ${kanjiStored}`);
    }

    // Store media if any
    if (media.length > 0) {
      const mediaStore = transaction.objectStore('media');
      const mediaStored = await this._storeBatch(mediaStore, media, 100, progressCallback);
      console.log(`Media storage: sent ${media.length}, stored ${mediaStored}`);
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
    const dictionaryResults = [];

    // Search through each dictionary
    for (const dict of dictionaries) {
      // Try exact match first
      let results = await this._queryTerms('expression', [dict.title, expression]);

      // If no results and reading differs, try reading match
      if (results.length === 0 && reading !== expression) {
        results = await this._queryTerms('reading', [dict.title, reading]);
      }

      if (results.length > 0) {
        // Collect definitions for this dictionary
        const dictDefinitions = [];

        for (const result of results) {
          // Handle multiple definitions within the same term entry
          if (result.glossary.length > 1) {
            // Add <hr> between multiple definitions for the same term
            for (let i = 0; i < result.glossary.length; i++) {
              dictDefinitions.push(result.glossary[i]);
              if (i < result.glossary.length - 1) {
                dictDefinitions.push('<hr>');
              }
            }
          } else {
            dictDefinitions.push(...result.glossary);
          }
        }

        // Add this dictionary's results
        dictionaryResults.push({
          dictionary: dict.title,
          definitions: dictDefinitions
        });
      }
    }

    if (dictionaryResults.length > 0) {
      // Combine definitions from different dictionaries with <hr> separators
      const allDefinitions = [];
      for (let i = 0; i < dictionaryResults.length; i++) {
        allDefinitions.push(...dictionaryResults[i].definitions);
        // Add <hr> between different dictionaries (but not after the last one)
        if (i < dictionaryResults.length - 1) {
          allDefinitions.push('<hr>');
        }
      }

      return allDefinitions.join('\n\n');
    }

    return null;
  }

  // Lookup term in specific dictionaries only
  async lookupTermInDictionaries(expression, selectedDictionaryNames, reading = expression) {
    if (!this.db) await this.open();

    // Get all dictionaries first, then filter to selected ones
    const allDictionaries = await this.getAllDictionaries();
    const dictionaries = allDictionaries.filter(dict => selectedDictionaryNames.includes(dict.title));

    if (dictionaries.length === 0) {
      return null;
    }

    const dictionaryResults = [];

    // Search through each selected dictionary
    for (const dict of dictionaries) {
      // Try exact match first
      let results = await this._queryTerms('expression', [dict.title, expression]);

      // If no results and reading differs, try reading match
      if (results.length === 0 && reading !== expression) {
        results = await this._queryTerms('reading', [dict.title, reading]);
      }

      if (results.length > 0) {
        // Collect definitions for this dictionary
        const dictDefinitions = [];

        for (const result of results) {
          // Handle multiple definitions within the same term entry
          if (result.glossary.length > 1) {
            // Add <hr> between multiple definitions for the same term
            for (let i = 0; i < result.glossary.length; i++) {
              dictDefinitions.push(result.glossary[i]);
              if (i < result.glossary.length - 1) {
                dictDefinitions.push('<hr>');
              }
            }
          } else {
            dictDefinitions.push(...result.glossary);
          }
        }

        // Add this dictionary's results
        dictionaryResults.push({
          dictionary: dict.title,
          definitions: dictDefinitions
        });
      }
    }

    if (dictionaryResults.length > 0) {
      // Combine definitions from different dictionaries with <hr> separators
      const allDefinitions = [];
      for (let i = 0; i < dictionaryResults.length; i++) {
        allDefinitions.push(...dictionaryResults[i].definitions);
        // Add <hr> between different dictionaries (but not after the last one)
        if (i < dictionaryResults.length - 1) {
          allDefinitions.push('<hr>');
        }
      }

      return allDefinitions.join('\n\n');
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

  async _storeBatch(store, items, batchSize, progressCallback = null) {
    let storedCount = 0;
    let lastProgressTime = Date.now();

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      for (const item of batch) {
        try {
          await this._put(store, item);
          storedCount++;

          // Send progress update every 2 seconds
          if (progressCallback) {
            const currentTime = Date.now();
            if (currentTime - lastProgressTime >= 2000) { // 10 seconds
              progressCallback(`Saved ${storedCount} entries to database so far...`);
              lastProgressTime = currentTime;
            }
          }
        } catch (error) {
          console.error('Failed to store item:', item, error);
          // Continue with other items
        }
      }
    }

    // Send final progress update
    if (progressCallback) {
      progressCallback(`Saved ${storedCount} entries to database...`);
    }

    return storedCount;
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

  // Delete a specific dictionary and all its data
  async deleteDictionary(dictName, progressCallback = null) {
    if (!this.db) await this.open();

    const stores = ['dictionaries', 'terms', 'kanji', 'media', 'tagMeta'];
    const transaction = this.db.transaction(stores, 'readwrite');

    let totalDeleted = 0;
    let lastProgressTime = Date.now();

    // Delete dictionary metadata
    const dictStore = transaction.objectStore('dictionaries');
    dictStore.delete(dictName);

    // Helper function to delete with range queries where possible
    const deleteWithCursor = (store, indexName, keyRange, description) => {
      return new Promise((resolve) => {
        let localDeleted = 0;
        const request = indexName ?
          store.index(indexName).openCursor(keyRange) :
          store.openCursor(keyRange);

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            localDeleted++;
            totalDeleted++;

            // Send progress update every 2 seconds
            if (progressCallback) {
              const currentTime = Date.now();
              if (currentTime - lastProgressTime >= 2000) {
                progressCallback(`Deleted ${totalDeleted} entries so far...`);
                lastProgressTime = currentTime;
              }
            }

            cursor.continue();
          } else {
            console.log(`Deleted ${localDeleted} ${description} entries`);
            resolve();
          }
        };

        request.onerror = () => {
          console.error(`Error deleting ${description} entries`);
          resolve(); // Continue with other deletions
        };
      });
    };

    // Delete all terms for this dictionary using efficient range query
    console.log(`Starting deletion of terms for dictionary: ${dictName}`);
    const termStore = transaction.objectStore('terms');
    await deleteWithCursor(termStore, 'expression', IDBKeyRange.bound([dictName, ''], [dictName, '\uffff']), 'term');

    // Delete kanji for this dictionary (scan all since kanji is less common)
    console.log(`Starting deletion of kanji for dictionary: ${dictName}`);
    const kanjiStore = transaction.objectStore('kanji');
    await deleteWithCursor(kanjiStore, null, null, 'kanji');

    // Delete media for this dictionary (scan all since media is less common)
    console.log(`Starting deletion of media for dictionary: ${dictName}`);
    const mediaStore = transaction.objectStore('media');
    await deleteWithCursor(mediaStore, null, null, 'media');

    // Delete tag metadata for this dictionary (scan all since tags are less common)
    console.log(`Starting deletion of tag metadata for dictionary: ${dictName}`);
    const tagStore = transaction.objectStore('tagMeta');
    await deleteWithCursor(tagStore, null, null, 'tag');

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log(`Dictionary "${dictName}" and all its data deleted successfully (${totalDeleted} entries)`);
        resolve();
      };
      transaction.onerror = () => {
        console.error('Failed to delete dictionary:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  // Get all terms for a specific dictionary
  async getAllTerms(dictName) {
    if (!this.db) await this.open();

    const transaction = this.db.transaction(['terms'], 'readonly');
    const store = transaction.objectStore('terms');

    return new Promise((resolve, reject) => {
      const terms = [];
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          // Check if this term belongs to our dictionary
          if (cursor.value.dictionary === dictName) {
            terms.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve(terms);
        }
      };

      request.onerror = () => reject(request.error);
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

      // Count terms for this dictionary by iterating over the main store
      const count = await new Promise((resolve, reject) => {
        let termCount = 0;
        let totalProcessed = 0;
        const request = store.openCursor();

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            totalProcessed++;
            // Check if this term belongs to our dictionary
            if (cursor.value.dictionary === dict.title) {
              termCount++;
              // Debug: log first few matches
              if (termCount <= 3) {
                console.log(`Found term ${termCount} for ${dict.title}: "${cursor.value.expression}" (seq: ${cursor.value.sequence})`);
              }
            }
            cursor.continue();
          } else {
            console.log(`Counted ${termCount} terms for ${dict.title} (processed ${totalProcessed} total records)`);
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
// window.StructuredDictionaryDatabase = StructuredDictionaryDatabase;
