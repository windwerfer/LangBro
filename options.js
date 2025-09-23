// Options page script for uploading and validating StarDict files
document.addEventListener('DOMContentLoaded', () => {
  const ifoInput = document.getElementById('ifoFile');
  const idxInput = document.getElementById('idxFile');
  const dictInput = document.getElementById('dictFile');
  const uploadBtn = document.getElementById('uploadBtn');
  const statusDiv = document.getElementById('status');

  uploadBtn.addEventListener('click', async () => {

    const ifoFile = ifoInput.files[0];
    const idxFile = idxInput.files[0];
    const dictFile = dictInput.files[0];

    if (!ifoFile || !idxFile || !dictFile) {
      showStatus('Please select all three files.', 'error');
      return;
    }

    statusDiv.className = 'info';
    statusDiv.textContent = 'Validating and saving...';
	alert('trying to load');
    try { 
      // Read files as ArrayBuffer
      const ifoBuffer = await ifoFile.arrayBuffer();
      const idxBuffer = await idxFile.arrayBuffer();
      const dictBuffer = await dictFile.arrayBuffer();

      // Detect and decompress .idx if .gz
      let isIdxCompressed = false;
      if (idxFile.name.endsWith('.gz')) {
		alert('is compressed - .gz');
        // Load pako dynamically or include in options.html <script src="pako.min.js"></script>
        const pako = window.pako; // Assume loaded
        idxBuffer = pako.inflate(new Uint8Array(idxBuffer), { to: 'uint8array' }).buffer;
        isIdxCompressed = true;
		alert('unpacked');
      }

      // After reading dictBuffer
      if (dictFile.name.endsWith('.dz')) {
		alert('is compressed - .dz');
        const pako = window.pako; // From <script src="pako.min.js">
        dictBuffer = pako.inflate(new Uint8Array(dictBuffer), { to: 'uint8array' }).buffer;
        isIdxCompressed = true;
      }
      
      // Validate .ifo
      const ifoText = new TextDecoder('utf-8').decode(ifoBuffer);
      const metadata = parseIfo(ifoText);
	  alert(ifoText);
      if (!metadata.isValid) {
        throw new Error(`Invalid .ifo: ${metadata.error}`);
      }

      // Basic structure checks
      if (metadata.wordcount <= 0) throw new Error('Invalid wordcount in .ifo');
      if (metadata.idxfilesize !== idxBuffer.byteLength) {
        throw new Error(`.idx size mismatch: expected ${metadata.idxfilesize}, got ${idxBuffer.byteLength}`);
      }
      // Note: dictfilesize check optional; add if needed

      // Save to storage (base64 for ArrayBuffer)
      const storageData = {
        dictName: ifoFile.name.replace('.ifo', ''),
        ifo: btoa(String.fromCharCode(...new Uint8Array(ifoBuffer))),
        idx: btoa(String.fromCharCode(...new Uint8Array(idxBuffer))),
        dict: btoa(String.fromCharCode(...new Uint8Array(dictBuffer))),
        metadata: metadata
      };

      await chrome.storage.local.set({ stardict: storageData });
      showStatus(`Dictionary "${storageData.dictName}" loaded successfully! (${metadata.wordcount} words)`, 'success');
      loadCurrentDict(); // Refresh display if needed
    } catch (error) {
      showStatus(error.message, 'error');
    }
  });

  // Parse .ifo metadata
  function parseIfo(text) {
    const metadata = {
      wordcount: 0,
      idxfilesize: 0,
      dictfilesize: 0,
      sametypesequence: 'h',
      version: '3.0.0',
      isValid: true,
      error: ''
    };
    const lines = text.split('\n');
    for (const line of lines) {
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex).trim();
        const value = line.substring(eqIndex + 1).trim();
        switch (key) {
          case 'wordcount': metadata.wordcount = parseInt(value, 10); break;
          case 'idxfilesize': metadata.idxfilesize = parseInt(value, 10); break;
          case 'dictfilesize': metadata.dictfilesize = parseInt(value, 10); break;
          case 'sametypesequence': metadata.sametypesequence = value; break;
          case 'version': metadata.version = value; break;
        }
      }
    }
    if (metadata.wordcount === 0 || metadata.idxfilesize === 0) {
      metadata.isValid = false;
      metadata.error = 'Missing required metadata';
    }
    return metadata;
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = type;
  }

  // Load and display current dict on open
  loadCurrentDict();

  async function loadCurrentDict() {
    const { stardict } = await chrome.storage.local.get('stardict');
    if (stardict) {
      showStatus(`Loaded: ${stardict.dictName} (${stardict.metadata.wordcount} words)`, 'info');
    } else {
      showStatus('No dictionary loaded. Upload one to start.', 'info');
    }
  }
});