# langbro Dictionary Extension

A Chrome/Firefox extension for looking up StarDict dictionary definitions by selecting words on web pages.
Also includes Web dictionarys and AI lookups.

## Browser Compatibility

### For Chrome/Brave/Edge:
Change `manifest.json` line 11-13 from:

to:
```json
"background": {
  "service_worker": "background.js"
}
```

### For Firefox:
Keep the manifest as-is with:
```json
"background": {
  "scripts": ["background.js", "structured-db.js"]
}
```

## Features

- Select any word on web pages to see a lookup icon
- Click the icon to display dictionary definition in a popup
- Upload and manage multiple StarDict dictionaries
- **NEW:** Import Yomitan dictionary archives (.zip files) with full rich formatting support
- Supports compressed dictionary files (.dict.gz, .dict.dz)
- HTML-formatted definitions with rich structured content
- Cross-browser compatible
- Multiple query groups with different display methods
- Web dictionary APIs and AI integration
- Touch and mouse gesture support

## Dictionary Compatibility

### StarDict Format
- Traditional .ifo/.idx/.dict file format
- Supports compressed dictionaries (.gz, .dz)
- Widely available dictionary format

### Yomitan Format
- Modern ZIP archive format with JSON data files
- Supports structured content (rich formatting, images)
- Advanced features like kanji data, tags, and metadata
- **Clean Room Implementation**: This extension implements Yomitan dictionary support using a clean room approach, analyzing the published format specifications without copying any Yomitan source code. This ensures license compatibility while maintaining full format support.

## Yomitan Dictionary Import

LangBro now supports importing Yomitan dictionary archives with full preservation of rich formatting and structured content.

### Supported Yomitan Features

#### 📄 **Rich Structured Content**
- **Etymology sections** with collapsible `<details>/<summary>` tags
- **Definition lists** with proper `<ol>/<li>` formatting
- **Links** to external resources (Wiktionary, etc.)
- **Images** and media content
- **HTML formatting** preservation

#### 🔍 **Multiple Definitions**
- Combines multiple term entries for the same word
- Preserves all definition variations
- Maintains proper grouping and sequencing

#### 🏷️ **Advanced Metadata**
- Dictionary tags and categories
- Frequency data and scoring
- Kanji information and readings
- Source language/target language metadata

### Import Process

1. **Access Settings**: Go to extension options → "Offline Dictionary" tab
2. **Upload Archive**: Click "Upload Yomitan Dictionary" and select a `.zip` file
3. **Automatic Processing**:
   - Extracts ZIP archive contents
   - Parses JSON data files (`term_bank_*.json`, `kanji_bank_*.json`, etc.)
   - Converts structured content to HTML
   - Groups multiple definitions per term
   - Stores in IndexedDB with full metadata
4. **Progress Tracking**: Real-time progress display during import
5. **Ready to Use**: Dictionary appears in query groups immediately

### File Structure Support

Yomitan dictionaries contain multiple JSON files:
- `index.json` - Dictionary metadata and configuration
- `term_bank_*.json` - Term definitions and readings
- `kanji_bank_*.json` - Kanji data and information
- `tag_bank_*.json` - Tag definitions and categories
- `term_meta_bank_*.json` / `kanji_meta_bank_*.json` - Additional metadata

### Structured Content Examples

**Etymology Sections:**
```html
<details class="gloss-sc-details" data-sc-content="details-entry-Etymology">
  <summary class="gloss-sc-summary">Etymology</summary>
  <div>Del inglés medio wanten...</div>
</details>
```

**Definition Lists:**
```html
<ol class="gloss-sc-ol" data-sc-content="glosses">
  <li class="gloss-sc-li">Querer, desear.</li>
  <li class="gloss-sc-li">Faltar.</li>
</ol>
```

**Links:**
```html
<a href="https://es.wiktionary.org/wiki/want#English" target="_blank" rel="noreferrer noopener">
  <span>Wiktionary</span>
  <span>🔗</span>
</a>
```

### Compatibility Notes

- **License Compliant**: Uses MIT-licensed JSZip instead of Yomitan's zip.js
- **Format Versions**: Supports Yomitan v1, v2, and v3 dictionary formats
- **Cross-Platform**: Works identically on Chrome, Firefox, and other browsers
- **Performance**: Efficient batch processing with progress feedback
- **Data Integrity**: Preserves all original formatting and metadata

## Development Installation

1. Clone or download the extension files
2. Modify `manifest.json` for your browser (see above)
3. Load as unpacked extension in your browser's developer mode
4. Go to extension options to upload dictionary files

## Build and Packaging

### Automated Build Scripts

The project includes automated build scripts for creating browser-specific extension packages:

#### Chrome/Brave/Edge Extension:
```bash
npm run build:chrome-ext
```
This command:
1. Builds the RxJS components (`npm run build:rxjs`)
2. Creates a Chrome-compatible manifest and packages the extension
3. Generates a `.crx` file in the `chrome-ext/` directory
4. Builds development assets for debugging

#### Firefox Extension:
```bash
npm run build:ff-ext
```
This command:
1. Builds the RxJS components (`npm run build:rxjs`)
2. Packages the extension with Firefox-compatible manifest
3. Generates a `.zip` file in the `ff-ext/` directory
4. Builds development assets for debugging

#### Development Build:
```bash
npm run build:dev
```
Builds the extension in development mode with source maps for debugging.

#### Watch Mode:
```bash
npm run watch
```
Continuously watches for file changes and rebuilds automatically during development.

### Manual Packaging (Alternative)

#### Chrome/Brave/Edge (.crx or .zip):
1. Ensure `manifest.json` uses `"service_worker": "background.js"`
2. Select all extension files (excluding development files like README.md)
3. Create a ZIP archive of the selected files
4. For Chrome Web Store: Upload the ZIP to the Developer Dashboard
5. For manual installation: Rename .zip to .crx (optional)

#### Firefox (.xpi):
1. Ensure `manifest.json` uses `"scripts": ["background.js"]`
2. Select all extension files
3. Create a ZIP archive
4. Rename the .zip file to .xpi
5. **For Development:** Use "Load Temporary Add-on" in Firefox debugging
6. **For Distribution:** Submit to AMO (addons.mozilla.org) for signing and verification
7. **Manual Installation:** Unsigned .xpi files cannot be installed permanently due to Firefox security policies

### Files Included in Packages:
The build scripts automatically exclude files listed in `.gitignore` and include:
- manifest.json (modified for target browser)
- background.js
- content-rxjs.js
- popup.html
- popup.js
- options.html
- options.js
- pako.min.js
- jszip.min.js
- icon128.png
- parser.js
- settings-store.js
- structured-db.js
- yomitan-importer.js

## Source Code Submission for Mozilla Review

This section provides the required information for submitting source code to Mozilla Add-ons (AMO) for review.

### Operating System and Build Environment Requirements
- **OS**: Linux (primary), macOS, or Windows
- **Node.js**: Version 18 or higher (LTS recommended)
- **npm**: Version 8 or higher (included with Node.js)

### Program Installation Instructions
1. Download and install Node.js from https://nodejs.org/ (choose LTS version)
2. npm is automatically included with Node.js installation
3. Verify installation: `node --version` and `npm --version`

### Step-by-Step Build Instructions
To create an exact copy of the extension from source:

1. **Clone/Download Source**: Obtain all source files from the repository
2. **Install Dependencies**: Run `npm install` in the project root directory
3. **Build RxJS Components**: Run `npm run build:rxjs` to generate bundled JavaScript (this creates `dist/` directory with transpiled files)
4. **Package for Firefox**: Run `npm run build:ff-ext` to create the Firefox extension package
5. **Output**: The exact extension package will be created as `ff-ext/ff_LangBro_[version].zip`

### Build Script
The build script `npm run build:ff-ext` executes all necessary technical steps:
- Builds RxJS components with Webpack
- Modifies manifest.json for Firefox compatibility
- Packages all required files into a ZIP archive

### Source Files
All source files are included in the repository:
- JavaScript files (.js) - not transpiled, concatenated, or minified except for third-party libraries
- HTML, CSS, JSON files
- Build configuration files (webpack.config.js, package.json)
- Documentation (README.md, README_DEV.md)

Note: The `dist/` directory contains machine-generated files and is excluded from source code submission. Reviewers can regenerate them using the build instructions above.

### Third-Party Libraries and Licenses
The extension uses the following open-source third-party libraries:

- **JSZip** (MIT License): For ZIP file handling. Source: https://github.com/Stuk/jszip
- **Pako** (MIT License): For zlib compression. Source: https://github.com/nodeca/pako
- **RxJS** (Apache License 2.0): For reactive programming. Source: https://github.com/ReactiveX/rxjs
- **opencode-ai** (MIT License): For AI integration. Source: https://github.com/sst/opencode

All licenses are included in the respective library files or repositories. The extension complies with all license terms.

## Usage

1. Click the extension icon to check status
2. Use "Dictionary Settings" to upload StarDict files or import Yomitan dictionary archives
3. Configure query groups in the settings to customize lookup behavior
4. Select words on web pages to see definitions with rich formatting
5. Use touch gestures or mouse clicks for quick lookups
