// Options page script for uploading and validating StarDict files
document.addEventListener('DOMContentLoaded', () => {
  console.log('Options page loaded');
  const filesInput = document.getElementById('filesInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const statusDiv = document.getElementById('status');
  const darkModeCheckbox = document.getElementById('darkModeCheckbox');

  if (!darkModeCheckbox) {
    console.error('Dark mode checkbox not found!');
  } else {
    console.log('Dark mode checkbox found');
  }

  // Load dark mode setting
  chrome.storage.local.get(['darkMode'], (result) => {
    console.log('Loaded dark mode setting:', result.darkMode);
    darkModeCheckbox.checked = result.darkMode || false;
  });

  // Save dark mode setting when changed
  darkModeCheckbox.addEventListener('change', () => {
    console.log('Saving dark mode setting:', darkModeCheckbox.checked);
    chrome.storage.local.set({ darkMode: darkModeCheckbox.checked });
  });

  uploadBtn.addEventListener('click', async () => {
    const files = Array.from(filesInput.files);

    // Identify files by extension
    const ifoFile = files.find(file => file.name.endsWith('.ifo'));
    const idxFile = files.find(file => file.name.endsWith('.idx') || file.name.endsWith('.idx.gz'));
    const dictFile = files.find(file => file.name.endsWith('.dict') || file.name.endsWith('.dict.gz') || file.name.endsWith('.dict.dz'));

    if (!ifoFile) {
      showStatus('Please select the .ifo file.', 'error');
      return;
    }
    if (!idxFile) {
      showStatus('Please select the .idx file (.idx or .idx.gz).', 'error');
      return;
    }
    if (!dictFile) {
      showStatus('Please select the .dict file (.dict, .dict.gz, or .dict.dz).', 'error');
      return;
    }

    statusDiv.className = 'info';
    statusDiv.textContent = 'Validating and saving...';

    try {
      // Read files as ArrayBuffer
      const ifoBuffer = await ifoFile.arrayBuffer();
      let idxBuffer = await idxFile.arrayBuffer();
      let dictBuffer = await dictFile.arrayBuffer();

      // Detect and decompress .idx if .gz
      let isIdxCompressed = false;
      if (idxFile.name.endsWith('.gz')) {
        // Load pako dynamically or include in options.html <script src="pako.min.js"></script>
        const pako = window.pako; // Assume loaded
        idxBuffer = pako.inflate(new Uint8Array(idxBuffer), { to: 'uint8array' }).buffer;
        isIdxCompressed = true;
      }

      // Detect and decompress .dict if .dz
      let isDictCompressed = false;
      if (dictFile.name.endsWith('.dz')) {
        const pako = window.pako; // From <script src="pako.min.js">
        dictBuffer = pako.inflate(new Uint8Array(dictBuffer), { to: 'uint8array' }).buffer;
        isDictCompressed = true;
      }
      
      // Validate .ifo
      const ifoText = new TextDecoder('utf-8').decode(ifoBuffer);
      const metadata = parseIfo(ifoText);
      if (!metadata.isValid) {
        throw new Error(`Invalid .ifo: ${metadata.error}`);
      }

      // Basic structure checks
      if (metadata.wordcount <= 0) throw new Error('Invalid wordcount in .ifo');
      if (metadata.idxfilesize !== idxBuffer.byteLength) {
        throw new Error(`.idx size mismatch: expected ${metadata.idxfilesize}, got ${idxBuffer.byteLength}`);
      }
      // Note: dictfilesize check optional; add if needed

      // Helper function to convert Uint8Array to string in chunks to avoid call stack overflow
      function uint8ArrayToString(array) {
        const chunkSize = 8192; // Process in 8KB chunks
        let result = '';
        for (let i = 0; i < array.length; i += chunkSize) {
          const chunk = array.subarray(i, i + chunkSize);
          result += String.fromCharCode.apply(null, chunk);
        }
        return result;
      }

      // Save to IndexedDB for larger storage capacity
      const storageData = {
        dictName: ifoFile.name.replace('.ifo', ''),
        ifo: btoa(uint8ArrayToString(new Uint8Array(ifoBuffer))),
        idx: btoa(uint8ArrayToString(new Uint8Array(idxBuffer))),
        dict: btoa(uint8ArrayToString(new Uint8Array(dictBuffer))),
        metadata: metadata
      };

      await saveToIndexedDB(storageData);
      showStatus(`Dictionary "${storageData.dictName}" loaded successfully! (${metadata.wordcount} words)`, 'success');
      loadCurrentDict(); // Refresh display if needed

      // Notify background script to reload parser
      chrome.runtime.sendMessage({ action: 'reloadParser' });
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

  // IndexedDB functions
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('StarDictDB', 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('dictionaries')) {
          db.createObjectStore('dictionaries', { keyPath: 'dictName' });
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async function saveToIndexedDB(data) {
    const db = await openDB();
    const transaction = db.transaction(['dictionaries'], 'readwrite');
    const store = transaction.objectStore('dictionaries');
    await new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    db.close();
  }

  async function loadFromIndexedDB(dictName) {
    const db = await openDB();
    const transaction = db.transaction(['dictionaries'], 'readonly');
    const store = transaction.objectStore('dictionaries');
    return new Promise((resolve, reject) => {
      const request = store.get(dictName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAllDictsFromIndexedDB() {
    const db = await openDB();
    const transaction = db.transaction(['dictionaries'], 'readonly');
    const store = transaction.objectStore('dictionaries');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Load and display current dict on open
  loadCurrentDict();

  async function loadCurrentDict() {
    try {
      const dicts = await getAllDictsFromIndexedDB();
      const dictListDiv = document.getElementById('dictList');
      dictListDiv.innerHTML = '';

      if (dicts.length > 0) {
        dicts.forEach(dict => {
          const dictDiv = document.createElement('div');
          dictDiv.style.margin = '5px 0';
          dictDiv.style.padding = '5px';
          dictDiv.style.border = '1px solid #ccc';
          dictDiv.style.borderRadius = '4px';

          const nameSpan = document.createElement('span');
          nameSpan.textContent = `${dict.dictName} (${dict.metadata.wordcount} words)`;

          const deleteBtn = document.createElement('button');
          deleteBtn.textContent = 'Delete';
          deleteBtn.style.marginLeft = '10px';
          deleteBtn.onclick = () => deleteDict(dict.dictName);

          dictDiv.appendChild(nameSpan);
          dictDiv.appendChild(deleteBtn);
          dictListDiv.appendChild(dictDiv);
        });

        // Don't show status here, just update the list
      } else {
        dictListDiv.textContent = 'No dictionaries loaded.';
        // Don't show status here
      }
    } catch (error) {
      showStatus('Error loading dictionary: ' + error.message, 'error');
    }
  }

  async function deleteDict(dictName) {
    try {
      const db = await openDB();
      const transaction = db.transaction(['dictionaries'], 'readwrite');
      const store = transaction.objectStore('dictionaries');
      await new Promise((resolve, reject) => {
        const request = store.delete(dictName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      db.close();
      showStatus(`Dictionary "${dictName}" deleted.`, 'info');
      loadCurrentDict(); // Refresh list

      // Notify background script to reload parser
      chrome.runtime.sendMessage({ action: 'reloadParser' });
    } catch (error) {
      showStatus('Error deleting dictionary: ' + error.message, 'error');
    }
  }
});
