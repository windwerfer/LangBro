// Yomitan Dictionary Importer for LangBro Extension
// Clean room implementation - no code copied from Yomitan
// Compatible with Yomitan dictionary format (ZIP archives with JSON data)

class YomitanDictionaryImporter {
    constructor(mediaLoader = null) {
        this.mediaLoader = mediaLoader;
        this.progressCallback = null;
        this.currentProgress = { index: 0, count: 0 };
    }

    /**
     * Import a Yomitan dictionary from a ZIP archive
     * @param {StructuredDictionaryDatabase} database - The database to store data in
     * @param {ArrayBuffer} archiveContent - The ZIP archive content
     * @param {Object} options - Import options
     * @returns {Promise<Object>} Import result
     */
    async importDictionary(database, archiveContent, options = {}) {
        console.log('Starting Yomitan dictionary import...');

        this._resetProgress();

        try {
            // Extract files from ZIP archive
            const files = await this._extractZipArchive(archiveContent);

            // Read and validate index.json
            const index = await this._readAndValidateIndex(files);

            // Check if dictionary already exists
            const exists = await database.dictionaryExists(index.title);
            if (exists) {
                return {
                    success: false,
                    error: `Dictionary "${index.title}" is already imported`
                };
            }

            // Parse data files
            const data = await this._parseDataFiles(files, index);

            // Store in database
            await this._storeInDatabase(database, index, data);

            console.log(`Successfully imported Yomitan dictionary: ${index.title}`);

            return {
                success: true,
                dictionary: {
                    title: index.title,
                    revision: index.revision,
                    version: index.version || index.format,
                    termCount: data.terms.length,
                    kanjiCount: data.kanji.length,
                    tagCount: data.tags.length,
                    mediaCount: data.media.length
                }
            };

        } catch (error) {
            console.error('Yomitan dictionary import failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Extract files from ZIP archive
     * @param {ArrayBuffer} archiveContent
     * @returns {Promise<Map>} Map of filename -> file content
     */
    async _extractZipArchive(archiveContent) {
        // Using zip.js library (already included in the extension)
        const { ZipReader, Uint8ArrayReader } = window.zip;
        const zipReader = new ZipReader(new Uint8ArrayReader(new Uint8Array(archiveContent)));
        const entries = await zipReader.getEntries();

        const files = new Map();

        for (const entry of entries) {
            if (!entry.directory) {
                const content = await entry.getData(new window.zip.Uint8ArrayWriter());
                files.set(entry.filename, content);
            }
        }

        await zipReader.close();
        return files;
    }

    /**
     * Read and validate index.json
     * @param {Map} files
     * @returns {Promise<Object>} Parsed index data
     */
    async _readAndValidateIndex(files) {
        const indexFile = files.get('index.json');
        if (!indexFile) {
            throw new Error('No index.json found in archive');
        }

        const indexContent = new TextDecoder('utf-8').decode(indexFile);
        const index = JSON.parse(indexContent);

        // Basic validation
        if (!index.title || !index.revision) {
            throw new Error('Invalid index.json: missing required fields');
        }

        // Determine version
        index.version = index.version || index.format || 3;

        console.log(`Dictionary: ${index.title} v${index.version}, revision: ${index.revision}`);

        return index;
    }

    /**
     * Parse all data files according to Yomitan format
     * @param {Map} files
     * @param {Object} index
     * @returns {Promise<Object>} Parsed data
     */
    async _parseDataFiles(files, index) {
        const version = index.version;
        const data = {
            terms: [],
            termMeta: [],
            kanji: [],
            kanjiMeta: [],
            tags: [],
            media: []
        };

        // Parse term banks
        const termFiles = this._findFiles(files, /^term_bank_\d+\.json$/);
        for (const [filename, content] of termFiles) {
            const terms = this._parseJsonFile(content);
            const converted = this._convertTerms(terms, index.title, version);
            data.terms.push(...converted);
            this._updateProgress(converted.length);
        }

        // Parse term meta banks
        const termMetaFiles = this._findFiles(files, /^term_meta_bank_\d+\.json$/);
        for (const [filename, content] of termMetaFiles) {
            const termMeta = this._parseJsonFile(content);
            const converted = this._convertTermMeta(termMeta, index.title);
            data.termMeta.push(...converted);
            this._updateProgress(converted.length);
        }

        // Parse kanji banks
        const kanjiFiles = this._findFiles(files, /^kanji_bank_\d+\.json$/);
        for (const [filename, content] of kanjiFiles) {
            const kanji = this._parseJsonFile(content);
            const converted = this._convertKanji(kanji, index.title, version);
            data.kanji.push(...converted);
            this._updateProgress(converted.length);
        }

        // Parse kanji meta banks
        const kanjiMetaFiles = this._findFiles(files, /^kanji_meta_bank_\d+\.json$/);
        for (const [filename, content] of kanjiMetaFiles) {
            const kanjiMeta = this._parseJsonFile(content);
            const converted = this._convertKanjiMeta(kanjiMeta, index.title);
            data.kanjiMeta.push(...converted);
            this._updateProgress(converted.length);
        }

        // Parse tag banks
        const tagFiles = this._findFiles(files, /^tag_bank_\d+\.json$/);
        for (const [filename, content] of tagFiles) {
            const tags = this._parseJsonFile(content);
            const converted = this._convertTags(tags, index.title);
            data.tags.push(...converted);
            this._updateProgress(converted.length);
        }

        // Handle media files and structured content
        data.media = await this._processMediaAndStructuredContent(data.terms, files, index.title);

        return data;
    }

    /**
     * Find files matching a regex pattern
     * @param {Map} files
     * @param {RegExp} pattern
     * @returns {Array} Array of [filename, content] pairs
     */
    _findFiles(files, pattern) {
        const matches = [];
        for (const [filename, content] of files) {
            if (pattern.test(filename)) {
                matches.push([filename, content]);
            }
        }
        return matches.sort(); // Ensure consistent ordering
    }

    /**
     * Parse JSON file content
     * @param {Uint8Array} content
     * @returns {Array} Parsed JSON data
     */
    _parseJsonFile(content) {
        const text = new TextDecoder('utf-8').decode(content);
        return JSON.parse(text);
    }

    /**
     * Convert Yomitan term format to LangBro format
     * @param {Array} terms
     * @param {string} dictionary
     * @param {number} version
     * @returns {Array} Converted terms
     */
    _convertTerms(terms, dictionary, version) {
        return terms.map((term, index) => {
            let [expression, reading, definitionTags, rules, score, glossary, sequence, termTags] = term;

            // Handle different versions
            if (version === 1) {
                [expression, reading, definitionTags, rules, score, ...glossary] = term;
                sequence = index + 1;
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
                    // For structured content, convert to string representation
                    return this._structuredContentToString(item);
                }
            });

            return {
                expression,
                reading,
                definitionTags: definitionTags || [],
                rules: rules || '',
                score: score || 0,
                glossary: processedGlossary,
                sequence: sequence || (index + 1),
                termTags: termTags || [],
                dictionary
            };
        });
    }

    /**
     * Convert structured content to string representation
     * @param {Object} content
     * @returns {string}
     */
    _structuredContentToString(content) {
        if (typeof content === 'string') {
            return content;
        }

        if (Array.isArray(content)) {
            return content.map(item => this._structuredContentToString(item)).join('');
        }

        if (content.tag === 'img') {
            return `[Image: ${content.path || 'unknown'}]`;
        }

        if (content.tag === 'a') {
            const href = content.href || '#';
            const text = content.content ? this._structuredContentToString(content.content) : href;
            return text; // For now, just return the text without link formatting
        }

        if (content.content) {
            return this._structuredContentToString(content.content);
        }

        return '';
    }

    /**
     * Convert term meta data
     * @param {Array} termMeta
     * @param {string} dictionary
     * @returns {Array}
     */
    _convertTermMeta(termMeta, dictionary) {
        return termMeta.map(([expression, mode, data]) => ({
            expression,
            mode,
            data,
            dictionary
        }));
    }

    /**
     * Convert kanji data
     * @param {Array} kanji
     * @param {string} dictionary
     * @param {number} version
     * @returns {Array}
     */
    _convertKanji(kanji, dictionary, version) {
        return kanji.map(item => {
            if (version === 1) {
                const [character, onyomi, kunyomi, tags, ...meanings] = item;
                return {
                    character,
                    onyomi: onyomi || '',
                    kunyomi: kunyomi || '',
                    tags: tags || [],
                    meanings,
                    stats: {},
                    dictionary
                };
            } else {
                const [character, onyomi, kunyomi, tags, meanings, stats] = item;
                return {
                    character,
                    onyomi: onyomi || '',
                    kunyomi: kunyomi || '',
                    tags: tags || [],
                    meanings,
                    stats: stats || {},
                    dictionary
                };
            }
        });
    }

    /**
     * Convert kanji meta data
     * @param {Array} kanjiMeta
     * @param {string} dictionary
     * @returns {Array}
     */
    _convertKanjiMeta(kanjiMeta, dictionary) {
        return kanjiMeta.map(([character, mode, data]) => ({
            character,
            mode,
            data,
            dictionary
        }));
    }

    /**
     * Convert tag data
     * @param {Array} tags
     * @param {string} dictionary
     * @returns {Array}
     */
    _convertTags(tags, dictionary) {
        return tags.map(([name, category, order, notes, score]) => ({
            name,
            category: category || '',
            order: order || 0,
            notes: notes || '',
            score: score || 0,
            dictionary
        }));
    }

    /**
     * Process media files and structured content
     * @param {Array} terms
     * @param {Map} files
     * @param {string} dictionary
     * @returns {Promise<Array>}
     */
    async _processMediaAndStructuredContent(terms, files, dictionary) {
        const media = [];

        // Extract media files referenced in structured content
        for (const term of terms) {
            for (const item of term.glossary) {
                if (typeof item === 'object' && item.type === 'structured-content') {
                    await this._extractMediaFromStructuredContent(item.content, files, media, dictionary);
                }
            }
        }

        return media;
    }

    /**
     * Extract media from structured content
     * @param {*} content
     * @param {Map} files
     * @param {Array} media
     * @param {string} dictionary
     */
    async _extractMediaFromStructuredContent(content, files, media, dictionary) {
        if (typeof content === 'string') {
            return;
        }

        if (Array.isArray(content)) {
            for (const item of content) {
                await this._extractMediaFromStructuredContent(item, files, media, dictionary);
            }
            return;
        }

        if (content.tag === 'img' && content.path) {
            const mediaFile = files.get(content.path);
            if (mediaFile) {
                // Basic image processing - in a full implementation you'd want to get dimensions
                media.push({
                    dictionary,
                    path: content.path,
                    mediaType: this._getMediaType(content.path),
                    width: content.width || 100,
                    height: content.height || 100,
                    content: mediaFile
                });
            }
        }

        if (content.content) {
            await this._extractMediaFromStructuredContent(content.content, files, media, dictionary);
        }
    }

    /**
     * Get media type from file extension
     * @param {string} path
     * @returns {string}
     */
    _getMediaType(path) {
        const ext = path.split('.').pop().toLowerCase();
        const types = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'svg': 'image/svg+xml',
            'webp': 'image/webp'
        };
        return types[ext] || 'application/octet-stream';
    }

    /**
     * Store parsed data in database
     * @param {StructuredDictionaryDatabase} database
     * @param {Object} index
     * @param {Object} data
     */
    async _storeInDatabase(database, index, data) {
        // Create dictionary summary
        const summary = {
            title: index.title,
            revision: index.revision,
            sequenced: index.sequenced || false,
            version: index.version,
            importDate: Date.now(),
            prefixWildcardsSupported: false, // Can be enabled later if needed
            counts: {
                terms: { total: data.terms.length },
                termMeta: this._getMetaCounts(data.termMeta),
                kanji: { total: data.kanji.length },
                kanjiMeta: this._getMetaCounts(data.kanjiMeta),
                tagMeta: { total: data.tags.length },
                media: { total: data.media.length }
            },
            styles: '', // Could extract from styles.css if present
            yomitanVersion: '1.0.0' // Placeholder
        };

        // Add optional metadata
        if (index.author) summary.author = index.author;
        if (index.url) summary.url = index.url;
        if (index.description) summary.description = index.description;
        if (index.attribution) summary.attribution = index.attribution;
        if (index.frequencyMode) summary.frequencyMode = index.frequencyMode;
        if (index.sourceLanguage) summary.sourceLanguage = index.sourceLanguage;
        if (index.targetLanguage) summary.targetLanguage = index.targetLanguage;

        // Store data
        await database.storeDictionary({
            terms: data.terms,
            kanji: data.kanji,
            media: data.media.map(m => ({
                dictionary: m.dictionary,
                path: m.path,
                mediaType: m.mediaType,
                width: m.width,
                height: m.height,
                content: m.content
            }))
        });

        // Store additional data if database supports it
        if (database.storeTags) {
            await database.storeTags(data.tags);
        }
        if (database.storeTermMeta) {
            await database.storeTermMeta(data.termMeta);
        }
        if (database.storeKanjiMeta) {
            await database.storeKanjiMeta(data.kanjiMeta);
        }
    }

    /**
     * Get meta counts by mode
     * @param {Array} metaData
     * @returns {Object}
     */
    _getMetaCounts(metaData) {
        const counts = { total: metaData.length };
        const modes = {};

        for (const item of metaData) {
            modes[item.mode] = (modes[item.mode] || 0) + 1;
        }

        Object.assign(counts, modes);
        return counts;
    }

    /**
     * Reset progress tracking
     */
    _resetProgress() {
        this.currentProgress = { index: 0, count: 0 };
    }

    /**
     * Update progress
     * @param {number} increment
     */
    _updateProgress(increment) {
        this.currentProgress.index += increment;
        if (this.progressCallback) {
            this.progressCallback(this.currentProgress);
        }
    }

    /**
     * Set progress callback
     * @param {Function} callback
     */
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }
}

// Export for use
if (typeof module !== 'undefined') {
    module.exports = YomitanDictionaryImporter;
} else if (typeof window !== 'undefined') {
    window.YomitanDictionaryImporter = YomitanDictionaryImporter;
}
