// Options page script for WordClick Dictionary v2
document.addEventListener('DOMContentLoaded', () => {
  console.log('Options page loaded');

  // Navigation elements
  const navButtons = document.querySelectorAll('.nav button');
  const pages = document.querySelectorAll('.page');

  // Main settings elements
  const darkModeCheckbox = document.getElementById('darkModeCheckbox');

  // Import page elements
  const filesInput = document.getElementById('filesInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const statusDiv = document.getElementById('status');
  const checkDictsBtn = document.getElementById('checkDictsBtn');

  // Query groups elements
  const addGroupBtn = document.getElementById('addGroupBtn');
  const groupsList = document.getElementById('groupsList');
  const groupForm = document.getElementById('groupForm');
  const formTitle = document.getElementById('formTitle');
  const groupNameInput = document.getElementById('groupName');
  const iconSelector = document.getElementById('iconSelector');
  const queryTypeSelect = document.getElementById('queryType');
  const saveGroupBtn = document.getElementById('saveGroupBtn');
  const cancelGroupBtn = document.getElementById('cancelGroupBtn');

  // Query type settings
  const offlineSettings = document.getElementById('offlineSettings');
  const webSettings = document.getElementById('webSettings');
  const aiSettings = document.getElementById('aiSettings');

  let currentEditingGroup = null;

  // Navigation setup
  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetPage = button.id.replace('nav-', 'page-');
      showPage(targetPage);
    });
  });

  function showPage(pageId) {
    // Hide all pages
    pages.forEach(page => page.classList.remove('active'));
    // Show target page
    document.getElementById(pageId).classList.add('active');
    // Update nav button states
    navButtons.forEach(btn => btn.classList.remove('active'));
    document.getElementById('nav-' + pageId.replace('page-', '')).classList.add('active');
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



  // Check dictionaries button
  checkDictsBtn.addEventListener('click', async () => {
    try {
      showStatus('Checking dictionary integrity...', 'info');
      const db = await getStructuredDB();
      const counts = await db.getActualTermCounts();

      let resultText = 'Dictionary Check Results:\n\n';
      for (const [dictName, countInfo] of Object.entries(counts)) {
        const status = countInfo.expected === countInfo.actual ? '✓ OK' : '✗ MISMATCH';
        resultText += `${dictName}: ${countInfo.actual}/${countInfo.expected} words ${status}\n`;
      }

      if (Object.keys(counts).length === 0) {
        resultText = 'No dictionaries found in database.';
      }

      showStatus(resultText, Object.values(counts).some(c => c.expected !== c.actual) ? 'error' : 'success');
    } catch (error) {
      showStatus('Error checking dictionaries: ' + error.message, 'error');
    }
  });

  uploadBtn.addEventListener('click', async () => {
    const files = Array.from(filesInput.files);

    // Identify files by extension
    const ifoFile = files.find(file => file.name.endsWith('.ifo'));
    const idxFile = files.find(file => file.name.endsWith('.idx') || file.name.endsWith('.idx.gz'));
    const dictFile = files.find(file => file.name.endsWith('.dict') || file.name.endsWith('.dict.gz') || file.name.endsWith('.dict.dz'));

    // Check for synonym file
    const synFile = files.find(file => file.name.endsWith('.syn'));

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

      // Read synonym file if present
      let synBuffer = null;
      if (synFile) {
        synBuffer = await synFile.arrayBuffer();
        console.log('Found synonym file:', synFile.name);
      }

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

      // Parse StarDict and convert to structured format
      const parser = new StarDictParser();
      parser.metadata = metadata;
      parser.idxData = new Uint8Array(idxBuffer);
      parser.dictData = new Uint8Array(dictBuffer);
      parser.wordCount = metadata.wordcount;

      // Set synonym data if available
      parser.setAliasData(null, synBuffer);

      // Build word index
      await parser.buildWordIndex();

      // Parse synonym file if available
      if (synBuffer) {
        await parser.parseSynFile(parser.synonymData);
      }

      // Extract structured data
      const dictionaryName = ifoFile.name.replace('.ifo', '');
      const structuredData = parser.extractStructuredData(dictionaryName);

      // Save to structured database
      const db = await getStructuredDB();
      await db.storeDictionary(structuredData, (message) => {
        showStatus(message, 'info');
      });

      showStatus(`Dictionary "${dictionaryName}" loaded successfully! (${metadata.wordcount} words)`, 'success');
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

  // Structured database instance
  let structuredDB = null;

  async function getStructuredDB() {
    if (!structuredDB) {
      structuredDB = new StructuredDictionaryDatabase();
      await structuredDB.open();
    }
    return structuredDB;
  }

  // Load and display current dict on open
  loadCurrentDict();

  async function loadCurrentDict() {
    try {
      const db = await getStructuredDB();
      const dicts = await db.getAllDictionaries();
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
          nameSpan.textContent = `${dict.title} (${dict.counts.terms.total} words)`;

          const deleteBtn = document.createElement('button');
          deleteBtn.textContent = 'Delete';
          deleteBtn.style.marginLeft = '10px';
          deleteBtn.onclick = () => deleteDict(dict.title);

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
      const db = await getStructuredDB();
      await db.deleteDictionary(dictName); // Delete only the specific dictionary
      showStatus(`Dictionary "${dictName}" deleted.`, 'info');
      loadCurrentDict(); // Refresh list

      // Notify background script to reload parser
      chrome.runtime.sendMessage({ action: 'reloadParser' });
    } catch (error) {
      showStatus('Error deleting dictionary: ' + error.message, 'error');
    }
  }

  // Query Groups functionality
  loadQueryGroups();

  // Add group button
  addGroupBtn.addEventListener('click', () => {
    currentEditingGroup = null;
    showGroupForm();
  });

  // Icon selector
  iconSelector.addEventListener('click', (e) => {
    if (e.target.classList.contains('icon-option')) {
      // Remove selected class from all options
      iconSelector.querySelectorAll('.icon-option').forEach(option => {
        option.classList.remove('selected');
      });
      // Add selected class to clicked option
      e.target.classList.add('selected');
    }
  });

  // Query type change
  queryTypeSelect.addEventListener('change', () => {
    showQueryTypeSettings(queryTypeSelect.value);
    if (queryTypeSelect.value === 'offline') {
      loadAvailableDictionaries();
    }
  });

  // Save group button
  saveGroupBtn.addEventListener('click', () => {
    saveQueryGroup();
  });

  // Cancel group button
  cancelGroupBtn.addEventListener('click', () => {
    hideGroupForm();
  });

  async function loadQueryGroups() {
    try {
      const result = await chrome.storage.local.get(['queryGroups']);
      const groups = result.queryGroups || [];
      renderQueryGroups(groups);
    } catch (error) {
      console.error('Error loading query groups:', error);
    }
  }

  function renderQueryGroups(groups) {
    groupsList.innerHTML = '';

    if (groups.length === 0) {
      groupsList.innerHTML = '<p>No query groups configured. Click "Add Query Group" to create one.</p>';
      return;
    }

    groups.forEach((group, index) => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'query-group';

      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.alignItems = 'center';
      headerDiv.style.justifyContent = 'space-between';

      const infoDiv = document.createElement('div');
      infoDiv.style.display = 'flex';
      infoDiv.style.alignItems = 'center';
      infoDiv.style.gap = '10px';

      const iconSpan = document.createElement('span');
      iconSpan.textContent = group.icon;
      iconSpan.style.fontSize = '18px';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = group.name;

      const typeSpan = document.createElement('span');
      typeSpan.textContent = `(${group.queryType})`;
      typeSpan.style.fontSize = '12px';
      typeSpan.style.color = '#666';

      const enabledCheckbox = document.createElement('input');
      enabledCheckbox.type = 'checkbox';
      enabledCheckbox.checked = group.enabled;
      enabledCheckbox.addEventListener('change', () => {
        toggleGroupEnabled(index, enabledCheckbox.checked);
      });

      infoDiv.appendChild(iconSpan);
      infoDiv.appendChild(nameSpan);
      infoDiv.appendChild(typeSpan);
      infoDiv.appendChild(enabledCheckbox);

      const buttonsDiv = document.createElement('div');

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => editQueryGroup(index);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.style.marginLeft = '5px';
      deleteBtn.onclick = () => deleteQueryGroup(index);

      buttonsDiv.appendChild(editBtn);
      buttonsDiv.appendChild(deleteBtn);

      headerDiv.appendChild(infoDiv);
      headerDiv.appendChild(buttonsDiv);

      groupDiv.appendChild(headerDiv);
      groupsList.appendChild(groupDiv);
    });
  }

  function showGroupForm(group = null) {
    if (group) {
      formTitle.textContent = 'Edit Query Group';
      groupNameInput.value = group.name;
      // Set selected icon
      iconSelector.querySelectorAll('.icon-option').forEach(option => {
        option.classList.toggle('selected', option.dataset.icon === group.icon);
      });
      queryTypeSelect.value = group.queryType;
      showQueryTypeSettings(group.queryType);

      // Populate type-specific settings
      if (group.queryType === 'web') {
        document.getElementById('webUrl').value = group.settings?.url || '';
        document.getElementById('webApiKey').value = group.settings?.apiKey || '';
      } else if (group.queryType === 'ai') {
        document.getElementById('aiProvider').value = group.settings?.provider || 'openai';
        document.getElementById('aiApiKey').value = group.settings?.apiKey || '';
        document.getElementById('aiModel').value = group.settings?.model || '';
        document.getElementById('aiPrompt').value = group.settings?.prompt || '';
      } else if (group.queryType === 'offline') {
        // Load selected dictionaries for offline groups
        loadAvailableDictionaries(group.settings?.selectedDictionaries || []);
      }
    } else {
      formTitle.textContent = 'Add Query Group';
      groupNameInput.value = '';
      // Reset icon selection to first option
      iconSelector.querySelectorAll('.icon-option').forEach((option, index) => {
        option.classList.toggle('selected', index === 0);
      });
      queryTypeSelect.value = 'offline';
      showQueryTypeSettings('offline');
      // Load available dictionaries for new offline groups
      loadAvailableDictionaries();
    }

    groupForm.style.display = 'block';
  }

  function hideGroupForm() {
    groupForm.style.display = 'none';
    currentEditingGroup = null;
  }

  function showQueryTypeSettings(queryType) {
    // Hide all settings
    document.querySelectorAll('.query-type-settings').forEach(setting => {
      setting.style.display = 'none';
    });

    // Show relevant settings
    if (queryType === 'offline') {
      offlineSettings.style.display = 'block';
    } else if (queryType === 'web') {
      webSettings.style.display = 'block';
    } else if (queryType === 'ai') {
      aiSettings.style.display = 'block';
    }
  }

  async function saveQueryGroup() {
    const name = groupNameInput.value.trim();
    if (!name) {
      alert('Please enter a group name.');
      return;
    }

    const selectedIcon = iconSelector.querySelector('.selected');
    if (!selectedIcon) {
      alert('Please select an icon.');
      return;
    }

    const queryType = queryTypeSelect.value;
    const icon = selectedIcon.dataset.icon;

    // Build settings based on query type
    let settings = {};
    if (queryType === 'offline') {
      // Collect selected dictionaries
      const selectedDictionaries = [];
      const checkboxes = document.querySelectorAll('#dictionarySelection input[type="checkbox"]:checked');
      checkboxes.forEach(checkbox => {
        selectedDictionaries.push(checkbox.value);
      });

      if (selectedDictionaries.length === 0) {
        alert('Please select at least one dictionary for this offline query group.');
        return;
      }

      settings = { selectedDictionaries };
    } else if (queryType === 'web') {
      const url = document.getElementById('webUrl').value.trim();
      const apiKey = document.getElementById('webApiKey').value;
      if (!url) {
        alert('Please enter a valid API URL.');
        return;
      }
      settings = { url, apiKey };
    } else if (queryType === 'ai') {
      const provider = document.getElementById('aiProvider').value;
      const apiKey = document.getElementById('aiApiKey').value;
      const model = document.getElementById('aiModel').value.trim();
      const prompt = document.getElementById('aiPrompt').value.trim();

      if (!apiKey || !model || !prompt) {
        alert('Please fill in all AI settings.');
        return;
      }
      settings = { provider, apiKey, model, prompt };
    }

    const group = {
      id: currentEditingGroup !== null ? currentEditingGroup.id : Date.now().toString(),
      name,
      icon,
      queryType,
      settings,
      enabled: currentEditingGroup ? currentEditingGroup.enabled : true
    };

    try {
      const result = await chrome.storage.local.get(['queryGroups']);
      const groups = result.queryGroups || [];

      if (currentEditingGroup !== null) {
        // Update existing group
        const index = groups.findIndex(g => g.id === currentEditingGroup.id);
        if (index !== -1) {
          groups[index] = group;
        }
      } else {
        // Add new group
        groups.push(group);
      }

      await chrome.storage.local.set({ queryGroups: groups });
      renderQueryGroups(groups);
      hideGroupForm();

      // Notify content script to update icons
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'updateQueryGroups', groups });
        });
      });
    } catch (error) {
      console.error('Error saving query group:', error);
      alert('Error saving query group.');
    }
  }

  function editQueryGroup(index) {
    chrome.storage.local.get(['queryGroups'], (result) => {
      const groups = result.queryGroups || [];
      currentEditingGroup = groups[index];
      showGroupForm(currentEditingGroup);
    });
  }

  async function deleteQueryGroup(index) {
    if (!confirm('Are you sure you want to delete this query group?')) {
      return;
    }

    try {
      const result = await chrome.storage.local.get(['queryGroups']);
      const groups = result.queryGroups || [];
      groups.splice(index, 1);
      await chrome.storage.local.set({ queryGroups: groups });
      renderQueryGroups(groups);

      // Notify content script to update icons
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'updateQueryGroups', groups });
        });
      });
    } catch (error) {
      console.error('Error deleting query group:', error);
    }
  }

  async function toggleGroupEnabled(index, enabled) {
    try {
      const result = await chrome.storage.local.get(['queryGroups']);
      const groups = result.queryGroups || [];
      groups[index].enabled = enabled;
      await chrome.storage.local.set({ queryGroups: groups });

      // Notify content script to update icons
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'updateQueryGroups', groups });
        });
      });
    } catch (error) {
      console.error('Error toggling group enabled state:', error);
    }
  }

  // Load available dictionaries for selection
  async function loadAvailableDictionaries(selectedDictionaries = []) {
    try {
      const db = await getStructuredDB();
      const dictionaries = await db.getAllDictionaries();

      const dictionarySelection = document.getElementById('dictionarySelection');
      dictionarySelection.innerHTML = '';

      if (dictionaries.length === 0) {
        dictionarySelection.innerHTML = '<p style="color: #666; font-style: italic;">No dictionaries available. Please import dictionaries first.</p>';
        return;
      }

      dictionaries.forEach(dict => {
        const dictDiv = document.createElement('div');
        dictDiv.style.display = 'flex';
        dictDiv.style.alignItems = 'center';
        dictDiv.style.margin = '5px 0';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = dict.title;
        checkbox.id = `dict-${dict.title}`;
        checkbox.checked = selectedDictionaries.includes(dict.title);

        const label = document.createElement('label');
        label.htmlFor = `dict-${dict.title}`;
        label.style.marginLeft = '8px';
        label.style.flex = '1';
        label.textContent = `${dict.title} (${dict.counts.terms.total} words)`;

        dictDiv.appendChild(checkbox);
        dictDiv.appendChild(label);
        dictionarySelection.appendChild(dictDiv);
      });
    } catch (error) {
      console.error('Error loading available dictionaries:', error);
      const dictionarySelection = document.getElementById('dictionarySelection');
      dictionarySelection.innerHTML = '<p style="color: #d9534f;">Error loading dictionaries.</p>';
    }
  }
});
