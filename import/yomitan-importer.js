// yomitan-importer.js - Chunked & Resumable Yomitan Import
// Processes term banks sequentially to maintain low memory footprint and crash recovery

class YomitanDictionaryImporter {
    constructor(options = {}) {
        this.progressCallback = options.onProgress;
        this.onStatusUpdate = options.onStatus;
        this.getDB = options.getDB;
    }

    showStatus(message, type = 'info') {
        if (this.onStatusUpdate) this.onStatusUpdate(message, type);
    }

    setStatusCallback(callback) {
        this.onStatusUpdate = callback;
    }

    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    /**
     * Main entry point for Yomitan import
     */
    async importDictionary(database, archiveContent, options = {}) {
        const job = options.job;
        const startOffset = job ? (job.processedEntries || 0) : 0;
        
        try {
            this.showStatus('Extracting ZIP archive...');
            const zip = await JSZip.loadAsync(archiveContent);
            
            // 1. Read Index
            const indexFile = zip.file('index.json');
            if (!indexFile) throw new Error('No index.json found');
            const index = JSON.parse(await indexFile.async('string'));
            const title = index.title;
            const version = index.version || index.format || 3;

            const db = database || (this.getDB ? await this.getDB() : null);
            if (!db) throw new Error('Database instance required');

            // 2. Initial Setup (if not resuming)
            if (startOffset === 0) {
                this.showStatus(`Initializing dictionary: ${title}...`);
                const summary = {
                    title: title,
                    revision: index.revision || '1.0',
                    sequenced: index.sequenced || false,
                    version: version,
                    importDate: Date.now(),
                    counts: { terms: { total: 0 } }
                };
                await db.storeDictionaryMetadata(summary);
            }

            // 3. Process Banks
            await this._processAllBanks(zip, title, version, startOffset, db, job);

            return { success: true, dictionary: { title } };

        } catch (error) {
            this.showStatus(`Import failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Process all JSON banks in the ZIP sequentially
     */
    async _processAllBanks(zip, title, version, startOffset, db, job) {
        const files = Object.keys(zip.files);
        const termBanks = files.filter(f => f.startsWith('term_bank_') && f.endsWith('.json')).sort();
        const kanjiBanks = files.filter(f => f.startsWith('kanji_bank_') && f.endsWith('.json')).sort();
        
        let globalCounter = 0;

        // --- Process Term Banks ---
        for (const bankFile of termBanks) {
            this.showStatus(`Processing ${bankFile}...`);
            const content = await zip.file(bankFile).async('uint8array');
            
            const batchProcessor = ImportUtils.createBatchProcessor(1000, async (batch) => {
                await db.storeBatch('terms', batch, title);
                
                if (job && this.progressCallback) {
                    this.progressCallback({
                        index: globalCounter,
                        count: job.totalEntries || globalCounter,
                        type: 'terms'
                    });
                }
            });

            // Use streaming JSON parser for the bank file
            const stream = ImportUtils.streamJsonArray(content);
            for await (const item of stream) {
                globalCounter++;
                
                // Skip if resuming
                if (globalCounter <= startOffset) continue;

                const converted = this._convertTerm(item, title, version, globalCounter);
                await batchProcessor.add(converted);
            }
            
            await batchProcessor.flush();
        }

        // --- Process Kanji Banks ---
        for (const bankFile of kanjiBanks) {
            this.showStatus(`Processing ${bankFile}...`);
            const content = JSON.parse(await zip.file(bankFile).async('string'));
            const converted = content.map(item => this._convertKanji(item, title, version));
            await db.storeBatch('kanji', converted, title);
        }
    }

    _convertTerm(term, dictionary, version, globalIndex = 0) {
        let [expression, reading, definitionTags, rules, score, glossary, sequence, termTags] = term;
        
        // Handle Yomitan version 1 format
        if (version === 1) {
            [expression, reading, definitionTags, rules, score, ...glossary] = term;
            sequence = 1;
            termTags = [];
        }
        
        // Ensure reading is not empty
        reading = reading || expression;

        // Process glossary - handle structured content and strings
        const processedGlossary = (Array.isArray(glossary) ? glossary : [glossary]).map(item => {
            if (typeof item === 'string') {
                return item;
            } else if (typeof item === 'object' && item !== null) {
                if (item.type === 'text') return item.text;
                // For other structured content, convert to JSON string (simplified)
                // In a full implementation, this might convert to HTML
                return JSON.stringify(item);
            }
            return String(item);
        });
        
        return {
            expression,
            reading,
            definitionTags: definitionTags || [],
            rules: rules || '',
            score: score || 0,
            glossary: processedGlossary,
            sequence: sequence || globalIndex,
            termTags: termTags || [],
            dictionary
        };
    }

    _convertKanji(item, dictionary, version) {
        const [character, onyomi, kunyomi, meanings, tags, stats] = item;
        
        // Process meanings (kanji meanings are usually strings, but handle arrays just in case)
        const processedMeanings = Array.isArray(meanings) ? meanings : [meanings];
        
        return {
            character,
            onyomi: onyomi || '',
            kunyomi: kunyomi || '',
            tags: tags || [],
            meanings: processedMeanings,
            stats: stats || {},
            dictionary
        };
    }
}

window.YomitanDictionaryImporter = YomitanDictionaryImporter;

