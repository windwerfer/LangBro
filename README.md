# langbro Dictionary Extension

A Chrome/Firefox extension for looking up StarDict dictionary definitions by selecting words on web pages.

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
- Supports compressed dictionary files (.dict.gz, .dict.dz)
- HTML-formatted definitions
- Cross-browser compatible

## Development Installation

1. Clone or download the extension files
2. Modify `manifest.json` for your browser (see above)
3. Load as unpacked extension in your browser's developer mode
4. Go to extension options to upload dictionary files

## Packaging for Distribution

### Chrome/Brave/Edge (.crx or .zip):
1. Ensure `manifest.json` uses `"service_worker": "background.js"`
2. Select all extension files (excluding development files like README.md)
3. Create a ZIP archive of the selected files
4. For Chrome Web Store: Upload the ZIP to the Developer Dashboard
5. For manual installation: Rename .zip to .crx (optional)

### Firefox (.xpi):
1. Ensure `manifest.json` uses `"scripts": ["background.js"]`
2. Select all extension files
3. Create a ZIP archive
4. Rename the .zip file to .xpi
5. **For Development:** Use "Load Temporary Add-on" in Firefox debugging
6. **For Distribution:** Submit to AMO (addons.mozilla.org) for signing and verification
7. **Manual Installation:** Unsigned .xpi files cannot be installed permanently due to Firefox security policies

### Files to Include:
- manifest.json
- background.js
- content.js
- popup.html
- popup.js
- options.html
- options.js
- pako.min.js
- icon128.png
- parser.js (if not merged into background.js)

## Usage

1. Click the extension icon to check status
2. Use "Dictionary Settings" to upload StarDict files
3. Select words on web pages to see definitions
