// Structured Database Handler for Yomitan-style storage
// Handles storing and querying dictionary data in structured IndexedDB format

class StructuredDictionaryDatabase {
  constructor() {
    this.db = null;
    this.dbVersion = 7; // Force upgrade to ensure termMeta and kanjiMeta object stores exist
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
          termsStore.createIndex('expressionOnly', 'expression');
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
        if (!db.objectStoreNames.contains('termMeta')) {
          db.createObjectStore('termMeta', { keyPath: ['dictionary', 'expression', 'mode'] });
        }
        if (!db.objectStoreNames.contains('kanjiMeta')) {
          db.createObjectStore('kanjiMeta', { keyPath: ['dictionary', 'character', 'mode'] });
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
  async lookupTermInDictionaries(expression, selectedDictionaryNames, reading = expression, dictionaryOrder = null) {
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

    const stores = ['dictionaries', 'terms', 'kanji', 'media', 'tagMeta', 'termMeta', 'kanjiMeta'];
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

  // Store tags data
  async storeTags(tags) {
    if (!this.db) await this.open();

    if (tags.length === 0) return;

    const transaction = this.db.transaction(['tagMeta'], 'readwrite');
    const store = transaction.objectStore('tagMeta');

    for (const tag of tags) {
      await this._put(store, tag);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // Store term metadata
  async storeTermMeta(termMeta) {
    if (!this.db) await this.open();

    if (termMeta.length === 0) return;

    const transaction = this.db.transaction(['termMeta'], 'readwrite');
    const store = transaction.objectStore('termMeta');

    for (const meta of termMeta) {
      await this._put(store, meta);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // Store kanji metadata
  async storeKanjiMeta(kanjiMeta) {
    if (!this.db) await this.open();

    if (kanjiMeta.length === 0) return;

    const transaction = this.db.transaction(['kanjiMeta'], 'readwrite');
    const store = transaction.objectStore('kanjiMeta');

    for (const meta of kanjiMeta) {
      await this._put(store, meta);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // Delete a specific dictionary and all its data
  async deleteDictionary(dictName, progressCallback = null) {
    if (!this.db) await this.open();

    const stores = ['dictionaries', 'terms', 'kanji', 'media', 'tagMeta', 'termMeta', 'kanjiMeta'];
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

    // Delete term metadata for this dictionary (scan all since meta is less common)
    console.log(`Starting deletion of term metadata for dictionary: ${dictName}`);
    const termMetaStore = transaction.objectStore('termMeta');
    await deleteWithCursor(termMetaStore, null, null, 'termMeta');

    // Delete kanji metadata for this dictionary (scan all since meta is less common)
    console.log(`Starting deletion of kanji metadata for dictionary: ${dictName}`);
    const kanjiMetaStore = transaction.objectStore('kanjiMeta');
    await deleteWithCursor(kanjiMetaStore, null, null, 'kanjiMeta');

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

  // Get suggestions for autocomplete (terms that start with the given word) from specific dictionaries
  async getSuggestionsInDictionaries(word, maxResults = 10, selectedDictionaryNames = []) {
    if (!this.db) await this.open();

    console.log('DB: getSuggestionsInDictionaries called with word:', word, 'maxResults:', maxResults, 'dictionaries:', selectedDictionaryNames);

    if (selectedDictionaryNames.length === 0) {
      console.log('DB: No dictionaries selected, returning empty suggestions');
      return [];
    }

    const transaction = this.db.transaction(['terms'], 'readonly');
    const store = transaction.objectStore('terms');
    const index = store.index('expression'); // Use compound index [dictionary, expression]

    return new Promise((resolve, reject) => {
      const suggestions = new Set(); // Use Set to avoid duplicates

      // We need to query each selected dictionary separately
      let dictionariesProcessed = 0;
      const totalDictionaries = selectedDictionaryNames.length;

      const processDictionary = (dictName) => {
        console.log('DB: Processing dictionary:', dictName, 'for suggestions');
        const range = IDBKeyRange.bound([dictName, word], [dictName, word + '\uffff'], false, false);

        const request = index.openCursor(range);

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor && suggestions.size < maxResults) {
            const expression = cursor.value.expression;
            console.log('DB: Found expression:', expression, 'in dict:', dictName, 'starts with word?', expression.startsWith(word));
            // Only add if it starts with our word (the range should already filter this, but double-check)
            if (expression.startsWith(word)) {
              suggestions.add(expression);
              console.log('DB: Added suggestion:', expression, 'total suggestions:', suggestions.size);
            }
            cursor.continue();
          } else {
            // Finished this dictionary
            dictionariesProcessed++;
            console.log('DB: Finished processing dictionary:', dictName, 'processed:', dictionariesProcessed, '/', totalDictionaries);

            if (dictionariesProcessed >= totalDictionaries) {
              // All dictionaries processed
              const result = Array.from(suggestions).sort();
              console.log('DB: Returning suggestions from selected dictionaries:', result);
              resolve(result);
            } else {
              // Process next dictionary
              const nextDict = selectedDictionaryNames[dictionariesProcessed];
              processDictionary(nextDict);
            }
          }
        };

        request.onerror = (event) => {
          console.error('DB: Error processing dictionary:', dictName, event.target.error);
          // Continue with other dictionaries
          dictionariesProcessed++;
          if (dictionariesProcessed >= totalDictionaries) {
            const result = Array.from(suggestions).sort();
            console.log('DB: Returning suggestions (with error):', result);
            resolve(result);
          } else {
            const nextDict = selectedDictionaryNames[dictionariesProcessed];
            processDictionary(nextDict);
          }
        };
      };

      // Start processing the first dictionary
      processDictionary(selectedDictionaryNames[0]);
    });
  }

  // Get suggestions for autocomplete (terms that start with the given word) - LEGACY: searches all dictionaries
  async getSuggestions(word, maxResults = 10) {
    if (!this.db) await this.open();

    console.log('DB: getSuggestions called with word:', word, 'maxResults:', maxResults);

    const transaction = this.db.transaction(['terms'], 'readonly');
    const store = transaction.objectStore('terms');
    const index = store.index('expressionOnly'); // Use the new expression-only index

    return new Promise((resolve, reject) => {
      const suggestions = new Set(); // Use Set to avoid duplicates
      const range = IDBKeyRange.bound(word, word + '\uffff', false, false); // Single key, not array

      console.log('DB: Created range for word:', word, 'range:', range);

      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        console.log('DB: Cursor result:', cursor ? 'has cursor' : 'no cursor', 'suggestions size:', suggestions.size);
        if (cursor && suggestions.size < maxResults) {
          const expression = cursor.key; // The key is just the expression now
          console.log('DB: Found expression:', expression, 'starts with word?', expression.startsWith(word));
          // The range query already filters to expressions that start with our word
          suggestions.add(expression);
          console.log('DB: Added suggestion:', expression, 'total suggestions:', suggestions.size);
          cursor.continue();
        } else {
          // Convert Set to Array and sort alphabetically
          const result = Array.from(suggestions).sort();
          console.log('DB: Returning suggestions:', result);
          resolve(result);
        }
      };

      request.onerror = (event) => {
        console.error('DB: Error in getSuggestions:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Helper function to generate all combinations of word + nextChars prefixes
  generateCombinations(word, chars) {
    const combinations = [];
    // Generate prefixes from length 1 to full length (max 15)
    const maxLength = Math.min(chars.length, 15);
    for (let i = 1; i <= maxLength; i++) {
      combinations.push(word + chars.substring(0, i));
    }
    return combinations;
  }

  // Get "did you mean" suggestions - comprehensive search for word + nextChars combinations
  async getDidYouMeanSuggestions(word, nextChars, maxResults = 10, selectedDictionaryNames = []) {
    if (!this.db) await this.open();

    console.log('DB: getDidYouMeanSuggestions called with word:', word, 'nextChars:', nextChars, 'maxResults:', maxResults, 'dictionaries:', selectedDictionaryNames);

    if (selectedDictionaryNames.length === 0) {
      console.log('DB: No dictionaries selected, returning empty suggestions');
      return [];
    }

    if (!nextChars || nextChars.trim().length === 0) {
      console.log('DB: No nextChars provided, returning empty suggestions');
      return [];
    }

    // Clean nextChars: remove double spaces and trim
    nextChars = nextChars.replace(/\s+/g, ' ').trim();
    console.log('DB: Cleaned nextChars:', nextChars);

    const transaction = this.db.transaction(['terms'], 'readonly');
    const store = transaction.objectStore('terms');
    const index = store.index('expression'); // Use compound index [dictionary, expression]

    return new Promise((resolve, reject) => {
      const suggestions = new Set(); // Use Set to avoid duplicates

      // Generate all combinations for original nextChars
      const combinations = this.generateCombinations(word, nextChars);

      // If nextChars contains spaces, also generate combinations for spaceless version
      const nextCharsNoSpaces = nextChars.replace(/\s/g, '');
      if (nextCharsNoSpaces !== nextChars) {
        console.log('DB: nextChars contains spaces, also checking spaceless version:', nextCharsNoSpaces);
        combinations.push(...this.generateCombinations(word, nextCharsNoSpaces));
      }

      console.log('DB: Generated', combinations.length, 'combinations to check:', combinations);

      // We need to query each selected dictionary separately
      let dictionariesProcessed = 0;
      const totalDictionaries = selectedDictionaryNames.length;

      const processDictionary = (dictName) => {
        console.log('DB: Processing dictionary:', dictName, 'for did-you-mean suggestions');

        const checkPattern = (pattern) => {
          return new Promise((resolvePattern) => {
            const range = IDBKeyRange.only([dictName, pattern]);
            const request = index.openCursor(range);

            request.onsuccess = (event) => {
              const cursor = event.target.result;
              if (cursor) {
                const expression = cursor.value.expression;
                console.log('DB: Found exact match:', expression, 'in dict:', dictName);
                suggestions.add(expression);
                console.log('DB: Added did-you-mean suggestion:', expression, 'total suggestions:', suggestions.size);
              }
              resolvePattern();
            };

            request.onerror = (event) => {
              console.error('DB: Error checking pattern:', pattern, 'in dict:', dictName, event.target.error);
              resolvePattern(); // Continue with other patterns
            };
          });
        };

        // Check ALL combinations concurrently for this dictionary
        const patternChecks = combinations.map(combination => checkPattern(combination));

        Promise.all(patternChecks).then(() => {
          dictionariesProcessed++;
          console.log('DB: Finished processing dictionary:', dictName, 'processed:', dictionariesProcessed, '/', totalDictionaries);

          if (dictionariesProcessed >= totalDictionaries) {
            // All dictionaries processed
            const result = Array.from(suggestions).sort();

            // If only original word found, return empty (did-you-mean should show alternatives)
            if (result.length === 1 && result[0] === word) {
              console.log('DB: Only original word found, returning empty did-you-mean suggestions');
              resolve([]);
            } else if (result.length === 0) {
              // No suggestions found at all, return empty
              console.log('DB: No did-you-mean suggestions found');
              resolve([]);
            } else {
              // Always include original word if it exists in dictionary
              const originalExists = result.includes(word);
              if (!originalExists) {
                // Check if original word exists in any selected dictionary
                let originalFound = false;
                const checkOriginal = (dictName) => {
                  return new Promise((resolveCheck) => {
                    const range = IDBKeyRange.only([dictName, word]);
                    const request = index.openCursor(range);

                    request.onsuccess = (event) => {
                      if (event.target.result) {
                        originalFound = true;
                      }
                      resolveCheck();
                    };

                    request.onerror = () => resolveCheck();
                  });
                };

                // Check original word in all dictionaries
                const originalChecks = selectedDictionaryNames.map(dictName => checkOriginal(dictName));
                Promise.all(originalChecks).then(() => {
                  if (originalFound) {
                    result.unshift(word); // Add original word at the beginning
                  }
                  console.log('DB: Returning did-you-mean suggestions:', result);
                  resolve(result);
                });
              } else {
                console.log('DB: Returning did-you-mean suggestions:', result);
                resolve(result);
              }
            }
          } else {
            // Process next dictionary
            const nextDict = selectedDictionaryNames[dictionariesProcessed];
            processDictionary(nextDict);
          }
        });
      };

      // Start processing the first dictionary
      processDictionary(selectedDictionaryNames[0]);
    });
  }

  // Get actual term counts for verification
  async getActualTermCounts() {
    if (!this.db) await this.open();

    const dicts = await this.getAllDictionaries();
    const result = {};

    for (const dict of dicts) {
      const transaction = this.db.transaction(['terms', 'termMeta'], 'readonly');
      const termsStore = transaction.objectStore('terms');
      const termMetaStore = transaction.objectStore('termMeta');

      // Count terms for this dictionary
      const termsCount = await new Promise((resolve, reject) => {
        let termCount = 0;
        const request = termsStore.openCursor();

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

      // Count termMeta entries for this dictionary
      const termMetaCount = await new Promise((resolve, reject) => {
        let metaCount = 0;
        const request = termMetaStore.openCursor();

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            // Check if this termMeta belongs to our dictionary
            if (cursor.value.dictionary === dict.title) {
              metaCount++;
            }
            cursor.continue();
          } else {
            resolve(metaCount);
          }
        };
        request.onerror = () => reject(request.error);
      });

      // Calculate total actual count (terms + termMeta)
      const totalActual = termsCount + termMetaCount;

      // Determine expected total based on which store has the data
      // If termMeta has entries, use termMeta count; otherwise use terms count
      let totalExpected;
      if (termMetaCount > 0) {
        totalExpected = dict.counts.termMeta ? dict.counts.termMeta.total : 0;
      } else {
        totalExpected = dict.counts.terms ? dict.counts.terms.total : 0;
      }

      console.log(`Dictionary ${dict.title}: terms=${termsCount}, termMeta=${termMetaCount}, total=${totalActual}, expected=${totalExpected}`);

      result[dict.title] = {
        expected: totalExpected,
        actual: { total: totalActual, terms: termsCount, termMeta: termMetaCount }
      };
    }

    return result;
  }
}

// Export for use
window.StructuredDictionaryDatabase = StructuredDictionaryDatabase;
