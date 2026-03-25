// yomitan-importer.js - Chunked & Resumable Yomitan Import
// Processes term banks sequentially to maintain low memory footprint and crash recovery

class YomitanDictionaryImporter {
    constructor() {
        this.progressCallback = null;
        this.onStatusUpdate = null;
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

            // 2. Initial Setup (if not resuming)
            if (startOffset === 0) {
                this.showStatus(`Initializing dictionary: ${title}...`);
                const summary = {
                    title: title,
                    revision: index.revision || '1.0',
                    sequenced: index.sequenced || false,
                    version: version,
                    importDate: Date.now(),
                    counts: { terms: { total: 0 } } // Will update later
                };
                // Use the database instance directly (structured-db methods)
                const db = new StructuredDictionaryDatabase(); 
                await db.storeDictionaryMetadata(summary);
            }

            // 3. Process Banks
            await this._processAllBanks(zip, title, version, startOffset, database, job);

            return { success: true, dictionary: { title } };

        } catch (error) {
            this.showStatus(`Import failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Process all JSON banks in the ZIP sequentially
     */
    async _processAllBanks(zip, title, version, startOffset, database, job) {
        const files = Object.keys(zip.files);
        const termBanks = files.filter(f => f.startsWith('term_bank_') && f.endsWith('.json')).sort();
        const kanjiBanks = files.filter(f => f.startsWith('kanji_bank_') && f.endsWith('.json')).sort();
        
        let globalCounter = 0;
        const db = new StructuredDictionaryDatabase();

        // --- Process Term Banks ---
        for (const bankFile of termBanks) {
            this.showStatus(`Processing ${bankFile}...`);
            const content = JSON.parse(await zip.file(bankFile).async('string'));
            
            // Chunk internal array to keep memory low and allow atomic commits
            const CHUNK_SIZE = 1000;
            for (let i = 0; i < content.length; i += CHUNK_SIZE) {
                // Check if we should skip this chunk (resuming)
                if (globalCounter + CHUNK_SIZE <= startOffset) {
                    globalCounter += Math.min(CHUNK_SIZE, content.length - i);
                    continue;
                }

                const chunk = content.slice(i, i + CHUNK_SIZE);
                const converted = chunk.map(item => this._convertTerm(item, title, version));
                
                // Start from middle of a chunk if necessary
                const sliceStart = Math.max(0, startOffset - globalCounter);
                const finalBatch = converted.slice(sliceStart);

                if (finalBatch.length > 0) {
                    await db.storeBatch('terms', finalBatch, title);
                    globalCounter += finalBatch.length;

                    // Update persistent job state
                    if (job && this.progressCallback) {
                        this.progressCallback({
                            index: globalCounter,
                            count: job.totalEntries || globalCounter, // total might be unknown initially
                            type: 'terms'
                        });
                    }
                } else {
                    globalCounter += chunk.length;
                }
            }
        }

        // --- Process Kanji Banks (simplified for now) ---
        for (const bankFile of kanjiBanks) {
            this.showStatus(`Processing ${bankFile}...`);
            const content = JSON.parse(await zip.file(bankFile).async('string'));
            const converted = content.map(item => this._convertKanji(item, title, version));
            await db.storeBatch('kanji', converted, title);
        }
    }

    _convertTerm(term, dictionary, version) {
        let [expression, reading, definitionTags, rules, score, glossary, sequence, termTags] = term;
        if (version === 1) {
            [expression, reading, definitionTags, rules, score, ...glossary] = term;
            sequence = 1;
            termTags = [];
        }
        
        return {
            expression,
            reading: reading || expression,
            definitionTags: definitionTags || [],
            rules: rules || '',
            score: score || 0,
            glossary: Array.isArray(glossary) ? glossary : [glossary],
            sequence: sequence || 0,
            termTags: termTags || [],
            dictionary
        };
    }

    _convertKanji(item, dictionary, version) {
        const [character, onyomi, kunyomi, tags, meanings, stats] = item;
        return {
            character,
            onyomi: onyomi || '',
            kunyomi: kunyomi || '',
            tags: tags || [],
            meanings: Array.isArray(meanings) ? meanings : [meanings],
            stats: stats || {},
            dictionary
        };
    }
}

window.YomitanDictionaryImporter = YomitanDictionaryImporter;
