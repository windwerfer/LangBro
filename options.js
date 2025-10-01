// Options page script for langbro Dictionary v2
document.addEventListener('DOMContentLoaded', () => {
  console.log('Options page loaded');

  // Navigation elements
  const navButtons = document.querySelectorAll('.nav button');
  const pages = document.querySelectorAll('.page');

  // Backup/Restore elements
  const exportSettingsBtn = document.getElementById('exportSettingsBtn');
  const importSettingsBtn = document.getElementById('importSettingsBtn');
  const importSettingsFile = document.getElementById('importSettingsFile');
  const settingsStatus = document.getElementById('settingsStatus');

  const exportDictBtn = document.getElementById('exportDictBtn');
  const importDictBtn = document.getElementById('importDictBtn');
  const importDictFile = document.getElementById('importDictFile');
  const dictStatus = document.getElementById('dictStatus');

  const exportAllBtn = document.getElementById('exportAllBtn');
  const importAllBtn = document.getElementById('importAllBtn');
  const importAllFile = document.getElementById('importAllFile');
  const fullBackupStatus = document.getElementById('fullBackupStatus');

  // Main settings elements
  const darkModeCheckbox = document.getElementById('darkModeCheckbox');
  const hideGroupNamesCheckbox = document.getElementById('hideGroupNamesCheckbox');
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const iconPlacementSelect = document.getElementById('iconPlacement');
  const iconOffsetInput = document.getElementById('iconOffset');
  const iconSpacingInput = document.getElementById('iconSpacing');
  const rightSwipeGroupSelect = document.getElementById('rightSwipeGroup');
  const singleClickGroupSelect = document.getElementById('singleClickGroup');
  const tripleClickGroupSelect = document.getElementById('tripleClickGroup');

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
  const showSearchFieldSelect = document.getElementById('showSearchField');
  const displaySuggestionsInput = document.getElementById('displaySuggestions');
  const showDidYouMeanSuggestionsCheckbox = document.getElementById('showDidYouMeanSuggestions');
  const saveGroupBtn = document.getElementById('saveGroupBtn');
  const cancelGroupBtn = document.getElementById('cancelGroupBtn');

  // Web services elements
  const addWebServiceBtn = document.getElementById('addWebServiceBtn');
  const webServicesList = document.getElementById('webServicesList');
  const webServiceForm = document.getElementById('webServiceForm');
  const webServiceFormTitle = document.getElementById('webServiceFormTitle');
  const webServiceNameInput = document.getElementById('webServiceName');
  const webServiceUrlInput = document.getElementById('webServiceUrl');
  const webServiceJsonPathInput = document.getElementById('webServiceJsonPath');
  const saveWebServiceBtn = document.getElementById('saveWebServiceBtn');
  const cancelWebServiceBtn = document.getElementById('cancelWebServiceBtn');

  // AI services elements
  const addAiServiceBtn = document.getElementById('addAiServiceBtn');
  const aiServicesList = document.getElementById('aiServicesList');
  const aiServiceForm = document.getElementById('aiServiceForm');
  const aiServiceFormTitle = document.getElementById('aiServiceFormTitle');
  const aiServiceNameInput = document.getElementById('aiServiceName');
  const aiServiceProviderSelect = document.getElementById('aiServiceProvider');
  const aiServiceApiKeyInput = document.getElementById('aiServiceApiKey');
  const aiServiceModelSelect = document.getElementById('aiServiceModel');
  const saveAiServiceBtn = document.getElementById('saveAiServiceBtn');
  const cancelAiServiceBtn = document.getElementById('cancelAiServiceBtn');

  // Query type settings
  const offlineSettings = document.getElementById('offlineSettings');
  const webSettings = document.getElementById('webSettings');
  const aiSettings = document.getElementById('aiSettings');
  const displayMethodSelect = document.getElementById('displayMethod');
  const textSelectionMethodSelect = document.getElementById('textSelectionMethod');

  // Display method settings elements
  const bottomHeightInput = document.getElementById('bottomHeight');

  let currentEditingGroup = null;
  let currentEditingWebService = null;
  let currentEditingAiService = null;

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

  // Load settings
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['darkMode', 'hideGroupNames', 'targetLanguage', 'iconPlacement', 'iconOffset', 'iconSpacing', 'rightSwipeGroup', 'singleClickGroup', 'tripleClickGroup']);
      console.log('Loaded settings:', result);
      darkModeCheckbox.checked = result.darkMode || false;
      hideGroupNamesCheckbox.checked = result.hideGroupNames || false;
      targetLanguageSelect.value = result.targetLanguage || 'en';
      iconPlacementSelect.value = result.iconPlacement || 'word';
      iconOffsetInput.value = result.iconOffset || 50;
      iconSpacingInput.value = result.iconSpacing || 10;
      rightSwipeGroupSelect.value = result.rightSwipeGroup || '';
      singleClickGroupSelect.value = result.singleClickGroup || '';
      tripleClickGroupSelect.value = result.tripleClickGroup || '';
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  // Initial load
  loadSettings();

  // Save settings when changed
  darkModeCheckbox.addEventListener('change', () => {
    console.log('Saving dark mode setting:', darkModeCheckbox.checked);
    chrome.storage.local.set({ darkMode: darkModeCheckbox.checked });
  });

  hideGroupNamesCheckbox.addEventListener('change', () => {
    console.log('Saving hide group names setting:', hideGroupNamesCheckbox.checked);
    chrome.storage.local.set({ hideGroupNames: hideGroupNamesCheckbox.checked });
  });

  targetLanguageSelect.addEventListener('change', () => {
    console.log('Saving target language setting:', targetLanguageSelect.value);
    chrome.storage.local.set({ targetLanguage: targetLanguageSelect.value });
  });

  iconPlacementSelect.addEventListener('change', () => {
    console.log('Saving icon placement setting:', iconPlacementSelect.value);
    chrome.storage.local.set({ iconPlacement: iconPlacementSelect.value });
  });

  iconOffsetInput.addEventListener('input', () => {
    const offset = parseInt(iconOffsetInput.value) || 0;
    console.log('Saving icon offset setting:', offset);
    chrome.storage.local.set({ iconOffset: offset });
  });

  iconSpacingInput.addEventListener('input', () => {
    const spacing = parseInt(iconSpacingInput.value) || 10;
    console.log('Saving icon spacing setting:', spacing);
    chrome.storage.local.set({ iconSpacing: spacing });
  });

  singleClickGroupSelect.addEventListener('change', () => {
    console.log('Saving single click group setting:', singleClickGroupSelect.value);
    chrome.storage.local.set({ singleClickGroup: singleClickGroupSelect.value });
  });

  rightSwipeGroupSelect.addEventListener('change', () => {
    console.log('Saving right swipe group setting:', rightSwipeGroupSelect.value);
    chrome.storage.local.set({ rightSwipeGroup: rightSwipeGroupSelect.value });
  });

  tripleClickGroupSelect.addEventListener('change', () => {
    console.log('Saving triple click group setting:', tripleClickGroupSelect.value);
    chrome.storage.local.set({ tripleClickGroup: tripleClickGroupSelect.value });
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
      showStatus(`Deleting dictionary "${dictName}"...`, 'info');
      const db = await getStructuredDB();
      await db.deleteDictionary(dictName, (message) => {
        showStatus(message, 'info');
      }); // Delete only the specific dictionary with progress callback
      showStatus(`Dictionary "${dictName}" deleted successfully.`, 'success');
      loadCurrentDict(); // Refresh list

      // Notify background script to reload parser
      chrome.runtime.sendMessage({ action: 'reloadParser' });
    } catch (error) {
      showStatus('Error deleting dictionary: ' + error.message, 'error');
    }
  }

  // Query Groups functionality
  loadQueryGroups();

  // Web Services functionality
  loadWebServices();

  // AI Services functionality
  loadAiServices();

  // Add web service button
  addWebServiceBtn.addEventListener('click', () => {
    currentEditingWebService = null;
    showWebServiceForm();
  });

  // Save web service button
  saveWebServiceBtn.addEventListener('click', () => {
    saveWebService();
  });

  // Cancel web service button
  cancelWebServiceBtn.addEventListener('click', () => {
    hideWebServiceForm();
  });

  // Add AI service button
  addAiServiceBtn.addEventListener('click', () => {
    currentEditingAiService = null;
    showAiServiceForm();
  });

  // AI provider change - always set default model
  const aiProviderElement = document.getElementById('aiServiceProvider');
  const aiModelElement = document.getElementById('aiServiceModel');

  if (aiProviderElement && aiModelElement) {
    aiProviderElement.addEventListener('change', () => {
      const provider = aiProviderElement.value;
      if (provider === 'google' && !aiModelElement.value) {
        aiModelElement.value = 'gemini-2.5-flash';
      }
    });
  }

  // Save AI service button
  saveAiServiceBtn.addEventListener('click', () => {
    saveAiService();
  });

  // Cancel AI service button
  cancelAiServiceBtn.addEventListener('click', () => {
    hideAiServiceForm();
  });

  // Add group button
  addGroupBtn.addEventListener('click', () => {
    currentEditingGroup = null;
    showGroupForm();
  });

  // Icon selector
  iconSelector.addEventListener('click', (e) => {
    // Find the icon-option element (could be the target or a parent)
    let iconOption = e.target;
    while (iconOption && !iconOption.classList.contains('icon-option')) {
      iconOption = iconOption.parentElement;
    }

    if (iconOption) {
      // Remove selected class from all options
      iconSelector.querySelectorAll('.icon-option').forEach(option => {
        option.classList.remove('selected');
      });
      // Add selected class to clicked option
      iconOption.classList.add('selected');
    }
  });

  // Function to update displaySuggestions and did-you-mean visibility
  function updateDisplaySuggestionsVisibility() {
    const queryType = queryTypeSelect.value;
    const showSearchField = showSearchFieldSelect.value;
    const displaySuggestionsRow = displaySuggestionsInput.closest('.form-group');
    const didYouMeanRow = showDidYouMeanSuggestionsCheckbox.closest('.form-group');

    // Show suggestions input only if search field is enabled AND it's an offline dictionary
    const shouldShow = showSearchField !== 'none' && queryType === 'offline';

    if (shouldShow) {
      displaySuggestionsRow.style.display = 'block';
      didYouMeanRow.style.display = 'block';
    } else {
      displaySuggestionsRow.style.display = 'none';
      didYouMeanRow.style.display = 'none';
    }
  }

  // Query type change
  queryTypeSelect.addEventListener('change', () => {
    showQueryTypeSettings(queryTypeSelect.value);
    if (queryTypeSelect.value === 'offline') {
      loadAvailableDictionaries();
    } else if (queryTypeSelect.value === 'web') {
      loadWebServicesForSelection();
    } else if (queryTypeSelect.value === 'ai') {
      loadAiServicesForSelection();
    }
    updateDisplaySuggestionsVisibility();
  });

  // Show search field change
  showSearchFieldSelect.addEventListener('change', () => {
    updateDisplaySuggestionsVisibility();
  });

  // Display method change
  displayMethodSelect.addEventListener('change', () => {
    showDisplayMethodSettings(displayMethodSelect.value);
  });

  // AI provider change - set default model (moved inside DOMContentLoaded)
  const queryAiProviderElement = document.getElementById('aiProvider');
  const queryAiModelElement = document.getElementById('aiModel');

  if (queryAiProviderElement && queryAiModelElement) {
    queryAiProviderElement.addEventListener('change', () => {
      const provider = queryAiProviderElement.value;
      if (provider === 'google' && !queryAiModelElement.value) {
        queryAiModelElement.value = 'gemini-2.5-flash';
      }
    });
  }

  // AI send context checkbox change
  const aiSendContextCheckbox = document.getElementById('aiSendContext');
  const aiContextSettings = document.getElementById('aiContextSettings');

  if (aiSendContextCheckbox && aiContextSettings) {
    aiSendContextCheckbox.addEventListener('change', () => {
      aiContextSettings.style.display = aiSendContextCheckbox.checked ? 'block' : 'none';
    });
  }

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

    // Update gesture dropdown options
    const updateDropdown = (selectElement) => {
      selectElement.innerHTML = '<option value="">None</option><option value="selectWord">Only select word</option>';
      groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        // For image icons, show just the name; for text icons, show icon + name
        const displayText = group.icon && group.icon.endsWith('.png') ? group.name : `${group.icon} ${group.name}`;
        option.textContent = displayText;
        selectElement.appendChild(option);
      });
    };

    updateDropdown(singleClickGroupSelect);
    updateDropdown(rightSwipeGroupSelect);
    updateDropdown(tripleClickGroupSelect);

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
      if (group.icon && group.icon.endsWith('.png')) {
        // Image icon - create img element
        const img = document.createElement('img');
        img.src = group.icon; // In options page, relative path works
        img.style.width = '18px';
        img.style.height = '18px';
        img.style.verticalAlign = 'middle';
        iconSpan.appendChild(img);
      } else {
        // Text icon
        iconSpan.textContent = group.icon;
        iconSpan.style.fontSize = '18px';
      }

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

      const duplicateBtn = document.createElement('button');
      duplicateBtn.textContent = 'Duplicate';
      duplicateBtn.style.marginLeft = '5px';
      duplicateBtn.onclick = () => duplicateQueryGroup(index);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.style.marginLeft = '5px';
      deleteBtn.onclick = () => deleteQueryGroup(index);

      buttonsDiv.appendChild(editBtn);
      buttonsDiv.appendChild(duplicateBtn);
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
      displayMethodSelect.value = group.displayMethod || 'popup';
      textSelectionMethodSelect.value = group.textSelectionMethod || 'selectedText';
      showSearchFieldSelect.value = group.showSearchField || 'none';
      displaySuggestionsInput.value = group.displaySuggestions !== undefined ? group.displaySuggestions : 20;
      showDidYouMeanSuggestionsCheckbox.checked = group.showDidYouMeanSuggestions !== false; // Default to true
      showQueryTypeSettings(group.queryType);
      showDisplayMethodSettings(group.displayMethod || 'popup');

      // Populate popup settings
      document.getElementById('popupWidth').value = group.popupSettings?.width || '40%';
      document.getElementById('popupHeight').value = group.popupSettings?.height || '30%';
      document.getElementById('popupHideOnClickOutside').checked = group.popupSettings?.hideOnClickOutside || false;

      // Populate inline settings
      document.getElementById('inlineFlexibleHeight').checked = group.inlineSettings?.flexibleHeight !== false;

      // Populate bottom panel settings
      bottomHeightInput.value = group.bottomSettings?.height || '200px';

      // Populate type-specific settings
      if (group.queryType === 'web') {
        loadWebServicesForSelection(group.settings?.serviceId || '');
      } else if (group.queryType === 'ai') {
        loadAiServicesForSelection(group.settings?.serviceId || '');
        document.getElementById('aiMaxTokens').value = group.settings?.maxTokens || 2048;
        document.getElementById('aiPrompt').value = group.settings?.prompt || 'You are a Tutor, give a grammar breakdown for: {text}';
        document.getElementById('aiSendContext').checked = group.settings?.sendContext || false;
        document.getElementById('aiWordsBefore').value = group.settings?.wordsBefore || 40;
        document.getElementById('aiWordsAfter').value = group.settings?.wordsAfter || 40;
        document.getElementById('aiCompleteContext').checked = group.settings?.completeContext || false;
        document.getElementById('aiContextSettings').style.display = group.settings?.sendContext ? 'block' : 'none';
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
      displayMethodSelect.value = 'popup';
      showQueryTypeSettings('offline');
      showDisplayMethodSettings('popup');
      // Load available dictionaries for new offline groups
      loadAvailableDictionaries();

      // Reset popup settings to defaults
      document.getElementById('popupWidth').value = '40%';
      document.getElementById('popupHeight').value = '30%';
      document.getElementById('popupHideOnClickOutside').checked = false;

      // Set AI defaults for new groups
      // document.getElementById('aiServiceProvider').value = 'google';
      // document.getElementById('aiServiceModel').value = 'gemini-2.5-flash';
    }

    groupForm.style.display = 'block';
    updateDisplaySuggestionsVisibility();
  }

  function hideGroupForm() {
    groupForm.style.display = 'none';
    currentEditingGroup = null;
  }

  function showQueryTypeSettings(queryType) {
    // Hide all settings and service selections
    document.querySelectorAll('.query-type-settings').forEach(setting => {
      setting.style.display = 'none';
    });
    document.getElementById('webServiceSelection').style.display = 'none';
    document.getElementById('aiServiceSelection').style.display = 'none';

    // Show relevant settings
    if (queryType === 'offline') {
      offlineSettings.style.display = 'block';
    } else if (queryType === 'web') {
      document.getElementById('webServiceSelection').style.display = 'block';
    } else if (queryType === 'ai') {
      document.getElementById('aiServiceSelection').style.display = 'block';
      aiSettings.style.display = 'block';
    }
  }

  // Load web services for selection dropdown
  async function loadWebServicesForSelection(selectedServiceId = '') {
    try {
      const result = await chrome.storage.local.get(['webServices']);
      const services = result.webServices || [];
      const selectElement = document.getElementById('selectedWebService');

      // Clear existing options except the first one
      selectElement.innerHTML = '<option value="">Select a web service...</option>';

      services.forEach(service => {
        const option = document.createElement('option');
        option.value = service.id;
        option.textContent = service.name;
        selectElement.appendChild(option);
      });

      // Set selected value
      selectElement.value = selectedServiceId;
    } catch (error) {
      console.error('Error loading web services for selection:', error);
    }
  }

  // Load AI services for selection dropdown
  async function loadAiServicesForSelection(selectedServiceId = '') {
    try {
      const result = await chrome.storage.local.get(['aiServices']);
      const services = result.aiServices || [];
      const selectElement = document.getElementById('selectedAiService');

      // Clear existing options except the first one
      selectElement.innerHTML = '<option value="">Select an AI service...</option>';

      services.forEach(service => {
        const option = document.createElement('option');
        option.value = service.id;
        option.textContent = service.name;
        selectElement.appendChild(option);
      });

      // Set selected value
      selectElement.value = selectedServiceId;
    } catch (error) {
      console.error('Error loading AI services for selection:', error);
    }
  }

  function showDisplayMethodSettings(displayMethod) {
    // Hide all display method settings by default
    document.getElementById('popupSettings').style.display = 'none';
    document.getElementById('inlineSettings').style.display = 'none';
    document.getElementById('bottomSettings').style.display = 'none';

    // Show relevant settings based on display method
    if (displayMethod === 'popup') {
      document.getElementById('popupSettings').style.display = 'block';
    } else if (displayMethod === 'inline') {
      document.getElementById('inlineSettings').style.display = 'block';
    } else if (displayMethod === 'bottom') {
      document.getElementById('bottomSettings').style.display = 'block';
    }
  }

  async function saveQueryGroup() {
    const name = groupNameInput.value.trim();
    if (!name) {
      alert('Please enter a group name.');
      return;
    }

    const selectedIcon = iconSelector.querySelector('.selected');
    const customIcon = document.getElementById('customIcon').value.trim();

    let icon;
    if (customIcon) {
      icon = customIcon;
    } else if (selectedIcon) {
      icon = selectedIcon.dataset.icon;
    } else {
      alert('Please select an icon or enter custom icon/text.');
      return;
    }

    const queryType = queryTypeSelect.value;

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
      const selectedWebServiceId = document.getElementById('selectedWebService').value;
      if (!selectedWebServiceId) {
        alert('Please select a web service. You must first create web services in the "Web Services" tab.');
        return;
      }
      settings = { serviceId: selectedWebServiceId };
    } else if (queryType === 'ai') {
      const selectedAiServiceId = document.getElementById('selectedAiService').value;
      if (!selectedAiServiceId) {
        alert('Please select an AI service. You must first create AI services in the "AI Services" tab.');
        return;
      }
      const maxTokens = parseInt(document.getElementById('aiMaxTokens').value) || 2048;
      const prompt = document.getElementById('aiPrompt').value.trim();
      const sendContext = document.getElementById('aiSendContext').checked;
      const wordsBefore = parseInt(document.getElementById('aiWordsBefore').value) || 40;
      const wordsAfter = parseInt(document.getElementById('aiWordsAfter').value) || 40;
      const completeContext = document.getElementById('aiCompleteContext').checked;
      settings = { serviceId: selectedAiServiceId, maxTokens, prompt, sendContext, wordsBefore, wordsAfter, completeContext };
    }

    // Build popup settings if display method is popup
    let popupSettings = {};
    if (displayMethodSelect.value === 'popup') {
      popupSettings = {
        width: document.getElementById('popupWidth').value || '40%',
        height: document.getElementById('popupHeight').value || '30%',
        hideOnClickOutside: document.getElementById('popupHideOnClickOutside').checked
      };
    }

    // Build inline settings if display method is inline
    let inlineSettings = {};
    if (displayMethodSelect.value === 'inline') {
      inlineSettings = {
        flexibleHeight: document.getElementById('inlineFlexibleHeight').checked
      };
    }

    // Build bottom panel settings if display method is bottom
    let bottomSettings = {};
    if (displayMethodSelect.value === 'bottom') {
      bottomSettings = {
        height: bottomHeightInput.value || '200px'
      };
    }

    const group = {
      id: currentEditingGroup !== null ? currentEditingGroup.id : Date.now().toString(),
      name,
      icon,
      queryType,
      displayMethod: displayMethodSelect.value,
      textSelectionMethod: textSelectionMethodSelect.value,
      showSearchField: showSearchFieldSelect.value,
      displaySuggestions: displaySuggestionsInput.value.trim() === '' ? 20 : (parseInt(displaySuggestionsInput.value) || 0),
      showDidYouMeanSuggestions: showDidYouMeanSuggestionsCheckbox.checked,
      popupSettings,
      inlineSettings,
      bottomSettings,
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

  async function duplicateQueryGroup(index) {
    try {
      const result = await chrome.storage.local.get(['queryGroups']);
      const groups = result.queryGroups || [];
      const originalGroup = groups[index];

      const duplicatedGroup = {
        ...originalGroup,
        id: Date.now().toString(),
        name: `${originalGroup.name} (Copy)`
      };

      groups.push(duplicatedGroup);
      await chrome.storage.local.set({ queryGroups: groups });
      renderQueryGroups(groups);

      // Notify content script to update icons
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'updateQueryGroups', groups });
        });
      });
    } catch (error) {
      console.error('Error duplicating query group:', error);
      alert('Error duplicating query group.');
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

  // Backup/Restore functionality
  function showBackupStatus(message, type, elementId) {
    const statusDiv = document.getElementById(elementId);
    statusDiv.textContent = message;
    statusDiv.className = type;
  }

  // Settings export
  exportSettingsBtn.addEventListener('click', async () => {
    try {
      showBackupStatus('Exporting settings...', 'info', 'settingsStatus');

      const settings = await chrome.storage.local.get(null);
      const exportData = {
        version: '1.0',
        type: 'settings',
        timestamp: new Date().toISOString(),
        data: settings
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `langbro-settings-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showBackupStatus('Settings exported successfully!', 'success', 'settingsStatus');
    } catch (error) {
      showBackupStatus('Error exporting settings: ' + error.message, 'error', 'settingsStatus');
    }
  });

  // Settings import
  importSettingsBtn.addEventListener('click', () => {
    importSettingsFile.click();
  });

  importSettingsFile.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      showBackupStatus('Importing settings...', 'info', 'settingsStatus');

      const text = await file.text();
      const importData = JSON.parse(text);

      if (importData.type !== 'settings') {
        throw new Error('Invalid settings file format');
      }

      // Preserve existing services if import doesn't contain them
      const existingSettings = await chrome.storage.local.get(['webServices', 'aiServices']);
      const mergedSettings = {
        ...importData.data,
        // Use services from import if they exist, otherwise preserve current ones
        webServices: importData.data.hasOwnProperty('webServices') ? importData.data.webServices : (existingSettings.webServices || []),
        aiServices: importData.data.hasOwnProperty('aiServices') ? importData.data.aiServices : (existingSettings.aiServices || [])
      };

      await chrome.storage.local.set(mergedSettings);

      // Reload settings in UI
      await loadSettings();

      // Reload query groups, web services, and AI services
      await loadQueryGroups();
      await loadWebServices();
      await loadAiServices();

      showBackupStatus('Settings imported successfully!', 'success', 'settingsStatus');
    } catch (error) {
      showBackupStatus('Error importing settings: ' + error.message, 'error', 'settingsStatus');
    }

    // Reset file input
    event.target.value = '';
  });

  // Dictionary export
  exportDictBtn.addEventListener('click', async () => {
    try {
      showBackupStatus('Exporting dictionaries...', 'info', 'dictStatus');

      const db = await getStructuredDB();
      const dictionaries = await db.getAllDictionaries();

      if (dictionaries.length === 0) {
        throw new Error('No dictionaries to export');
      }

      // Convert to Yomitan-compatible format
      const yomitanData = {
        version: 3,
        format: 'group',
        timestamp: Date.now(),
        id: 'langbro-export',
        title: 'langbro Dictionary Export',
        entries: []
      };

      for (const dict of dictionaries) {
        // Get all terms from this dictionary
        const terms = await db.getAllTerms(dict.title);

        for (const term of terms) {
          yomitanData.entries.push({
            term: term.term,
            reading: term.reading || '',
            definitionTags: term.tags || [],
            definitions: [{
              type: 'text',
              text: term.definition
            }],
            score: 0,
            glossary: [term.definition],
            sequence: term.sequence || 0,
            termTags: []
          });
        }
      }

      const blob = new Blob([JSON.stringify(yomitanData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `langbro-dictionaries-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showBackupStatus(`Dictionaries exported successfully! (${yomitanData.entries.length} terms)`, 'success', 'dictStatus');
    } catch (error) {
      showBackupStatus('Error exporting dictionaries: ' + error.message, 'error', 'dictStatus');
    }
  });

  // Dictionary import
  importDictBtn.addEventListener('click', () => {
    importDictFile.click();
  });

  importDictFile.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      showBackupStatus('Importing dictionaries...', 'info', 'dictStatus');

      const text = await file.text();
      const importData = JSON.parse(text);

      // Check if it's a Yomitan format
      if (importData.format === 'group' && importData.entries) {
        // Convert Yomitan format to our structured format
        const db = await getStructuredDB();
        const dictName = importData.title || 'Imported Dictionary';

        // Convert entries to the format expected by storeDictionary
        const terms = importData.entries.map((entry, index) => ({
          dictionary: dictName,
          expression: entry.term,
          reading: entry.reading || '',
          glossary: entry.glossary || (entry.definitions ? entry.definitions.map(d => d.text) : ['']),
          definitionTags: entry.definitionTags || [],
          termTags: entry.termTags || [],
          score: entry.score || 0,
          sequence: entry.sequence || index
        }));

        const structuredData = {
          metadata: {
            title: dictName,
            format: 'StarDict',
            revision: '1',
            sequenced: true,
            counts: {
              terms: { total: terms.length },
              kanji: { total: 0 },
              media: { total: 0 }
            }
          },
          terms: terms,
          kanji: [],
          media: []
        };

        await db.storeDictionary(structuredData, (message) => {
          showBackupStatus(message, 'info', 'dictStatus');
        });

        showBackupStatus(`Dictionary "${dictName}" imported successfully! (${importData.entries.length} terms)`, 'success', 'dictStatus');

        // Refresh dictionary list
        loadCurrentDict();

        // Notify background script to reload parser
        chrome.runtime.sendMessage({ action: 'reloadParser' });
      } else {
        throw new Error('Unsupported dictionary format. Please use Yomitan-compatible JSON format.');
      }
    } catch (error) {
      showBackupStatus('Error importing dictionaries: ' + error.message, 'error', 'dictStatus');
    }

    // Reset file input
    event.target.value = '';
  });

  // Full backup export
  exportAllBtn.addEventListener('click', async () => {
    try {
      showBackupStatus('Creating full backup...', 'info', 'fullBackupStatus');

      // Get settings
      const settings = await chrome.storage.local.get(null);

      // Get dictionaries
      const db = await getStructuredDB();
      const dictionaries = await db.getAllDictionaries();

      const backupData = {
        version: '1.0',
        type: 'full-backup',
        timestamp: new Date().toISOString(),
        settings: settings,
        dictionaries: dictionaries
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `langbro-full-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showBackupStatus('Full backup created successfully!', 'success', 'fullBackupStatus');
    } catch (error) {
      showBackupStatus('Error creating full backup: ' + error.message, 'error', 'fullBackupStatus');
    }
  });

  // Full backup import
  importAllBtn.addEventListener('click', () => {
    importAllFile.click();
  });

  importAllFile.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      showBackupStatus('Restoring full backup...', 'info', 'fullBackupStatus');

      const text = await file.text();
      const backupData = JSON.parse(text);

      if (backupData.type !== 'full-backup') {
        throw new Error('Invalid backup file format');
      }

      // Restore settings - preserve existing services if backup doesn't contain them
      const existingSettings = await chrome.storage.local.get(['webServices', 'aiServices']);
      const mergedSettings = {
        ...backupData.settings,
        // Use services from backup if they exist, otherwise preserve current ones
        webServices: backupData.settings.hasOwnProperty('webServices') ? backupData.settings.webServices : (existingSettings.webServices || []),
        aiServices: backupData.settings.hasOwnProperty('aiServices') ? backupData.settings.aiServices : (existingSettings.aiServices || [])
      };

      await chrome.storage.local.set(mergedSettings);

      // Restore dictionaries
      const db = await getStructuredDB();
      for (const dict of backupData.dictionaries || []) {
        await db.storeDictionary(dict, (message) => {
          showBackupStatus(message, 'info', 'fullBackupStatus');
        });
      }

      // Reload UI settings
      await loadSettings();

      await loadQueryGroups();
      await loadWebServices(); // Reload web services from backup
      await loadAiServices(); // Reload AI services from backup
      await loadCurrentDict();

      // Notify background script to reload parser
      chrome.runtime.sendMessage({ action: 'reloadParser' });

      showBackupStatus('Full backup restored successfully!', 'success', 'fullBackupStatus');
    } catch (error) {
      showBackupStatus('Error restoring backup: ' + error.message, 'error', 'fullBackupStatus');
    }

    // Reset file input
    event.target.value = '';
  });

  // Web Services functionality
  async function loadWebServices() {
    try {
      const result = await chrome.storage.local.get(['webServices']);
      const services = result.webServices || [];
      renderWebServices(services);
    } catch (error) {
      console.error('Error loading web services:', error);
    }
  }

  function renderWebServices(services) {
    webServicesList.innerHTML = '';

    if (services.length === 0) {
      webServicesList.innerHTML = '<p style="color: #666; font-style: italic;">No web services configured. Click "Add New Service" to create one.</p>';
      return;
    }

    services.forEach((service, index) => {
      const serviceDiv = document.createElement('div');
      serviceDiv.className = 'query-group'; // Reuse the same styling

      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.alignItems = 'center';
      headerDiv.style.justifyContent = 'space-between';

      const infoDiv = document.createElement('div');
      infoDiv.style.display = 'flex';
      infoDiv.style.alignItems = 'center';
      infoDiv.style.gap = '10px';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = service.name;
      nameSpan.style.fontWeight = 'bold';

      const urlSpan = document.createElement('span');
      urlSpan.textContent = service.url;
      urlSpan.style.fontSize = '12px';
      urlSpan.style.color = '#666';
      urlSpan.style.maxWidth = '300px';
      urlSpan.style.overflow = 'hidden';
      urlSpan.style.textOverflow = 'ellipsis';

      const jsonPathSpan = document.createElement('span');
      if (service.jsonPath) {
        jsonPathSpan.textContent = `Path: ${service.jsonPath}`;
        jsonPathSpan.style.fontSize = '11px';
        jsonPathSpan.style.color = '#888';
      }

      infoDiv.appendChild(nameSpan);
      infoDiv.appendChild(urlSpan);
      if (service.jsonPath) {
        infoDiv.appendChild(jsonPathSpan);
      }

      const buttonsDiv = document.createElement('div');

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => editWebService(index);

      const duplicateBtn = document.createElement('button');
      duplicateBtn.textContent = 'Duplicate';
      duplicateBtn.style.marginLeft = '5px';
      duplicateBtn.onclick = () => duplicateWebService(index);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.style.marginLeft = '5px';
      deleteBtn.onclick = () => deleteWebService(index);

      buttonsDiv.appendChild(editBtn);
      buttonsDiv.appendChild(duplicateBtn);
      buttonsDiv.appendChild(deleteBtn);

      headerDiv.appendChild(infoDiv);
      headerDiv.appendChild(buttonsDiv);

      serviceDiv.appendChild(headerDiv);
      webServicesList.appendChild(serviceDiv);
    });
  }

  function showWebServiceForm(service = null) {
    if (service) {
      webServiceFormTitle.textContent = 'Edit Web Service';
      webServiceNameInput.value = service.name || '';
      webServiceUrlInput.value = service.url || '';
      webServiceJsonPathInput.value = service.jsonPath || '';
    } else {
      webServiceFormTitle.textContent = 'Add Web Service';
      webServiceNameInput.value = '';
      webServiceUrlInput.value = '';
      webServiceJsonPathInput.value = '';
    }

    webServiceForm.style.display = 'block';
    webServiceNameInput.focus();
  }

  function hideWebServiceForm() {
    webServiceForm.style.display = 'none';
    currentEditingWebService = null;
  }

  async function saveWebService() {
    const name = webServiceNameInput.value.trim();
    const url = webServiceUrlInput.value.trim();
    const jsonPath = webServiceJsonPathInput.value.trim();

    if (!name) {
      alert('Please enter a service name.');
      return;
    }

    if (!url) {
      alert('Please enter a valid API URL.');
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch (error) {
      alert('Please enter a valid URL.');
      return;
    }

    const service = {
      id: currentEditingWebService !== null ? currentEditingWebService.id : Date.now().toString(),
      name,
      url,
      jsonPath: jsonPath || undefined
    };

    try {
      const result = await chrome.storage.local.get(['webServices']);
      const services = result.webServices || [];

      if (currentEditingWebService !== null) {
        // Update existing service
        const index = services.findIndex(s => s.id === currentEditingWebService.id);
        if (index !== -1) {
          services[index] = service;
        }
      } else {
        // Add new service
        services.push(service);
      }

      await chrome.storage.local.set({ webServices: services });
      renderWebServices(services);
      hideWebServiceForm();
    } catch (error) {
      console.error('Error saving web service:', error);
      alert('Error saving web service.');
    }
  }

  function editWebService(index) {
    chrome.storage.local.get(['webServices'], (result) => {
      const services = result.webServices || [];
      currentEditingWebService = services[index];
      showWebServiceForm(currentEditingWebService);
    });
  }

  async function duplicateWebService(index) {
    try {
      const result = await chrome.storage.local.get(['webServices']);
      const services = result.webServices || [];
      const originalService = services[index];

      const duplicatedService = {
        ...originalService,
        id: Date.now().toString(),
        name: `${originalService.name} (Copy)`
      };

      services.push(duplicatedService);
      await chrome.storage.local.set({ webServices: services });
      renderWebServices(services);
    } catch (error) {
      console.error('Error duplicating web service:', error);
      alert('Error duplicating web service.');
    }
  }

  async function deleteWebService(index) {
    if (!confirm('Are you sure you want to delete this web service?')) {
      return;
    }

    try {
      const result = await chrome.storage.local.get(['webServices']);
      const services = result.webServices || [];
      services.splice(index, 1);
      await chrome.storage.local.set({ webServices: services });
      renderWebServices(services);
    } catch (error) {
      console.error('Error deleting web service:', error);
    }
  }

  // AI Services functionality
  async function loadAiServices() {
    try {
      const result = await chrome.storage.local.get(['aiServices']);
      const services = result.aiServices || [];
      renderAiServices(services);
    } catch (error) {
      console.error('Error loading AI services:', error);
    }
  }

  function renderAiServices(services) {
    aiServicesList.innerHTML = '';

    if (services.length === 0) {
      aiServicesList.innerHTML = '<p style="color: #666; font-style: italic;">No AI services configured. Click "Add New AI Service" to create one.</p>';
      return;
    }

    services.forEach((service, index) => {
      const serviceDiv = document.createElement('div');
      serviceDiv.className = 'query-group'; // Reuse the same styling

      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.alignItems = 'center';
      headerDiv.style.justifyContent = 'space-between';

      const infoDiv = document.createElement('div');
      infoDiv.style.display = 'flex';
      infoDiv.style.alignItems = 'center';
      infoDiv.style.gap = '10px';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = service.name;
      nameSpan.style.fontWeight = 'bold';

      const providerSpan = document.createElement('span');
      providerSpan.textContent = service.provider;
      providerSpan.style.fontSize = '12px';
      providerSpan.style.color = '#666';
      providerSpan.style.textTransform = 'capitalize';

      const modelSpan = document.createElement('span');
      modelSpan.textContent = service.model;
      modelSpan.style.fontSize = '11px';
      modelSpan.style.color = '#888';

      infoDiv.appendChild(nameSpan);
      infoDiv.appendChild(providerSpan);
      infoDiv.appendChild(modelSpan);

      const buttonsDiv = document.createElement('div');

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => editAiService(index);

      const duplicateBtn = document.createElement('button');
      duplicateBtn.textContent = 'Duplicate';
      duplicateBtn.style.marginLeft = '5px';
      duplicateBtn.onclick = () => duplicateAiService(index);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.style.marginLeft = '5px';
      deleteBtn.onclick = () => deleteAiService(index);

      buttonsDiv.appendChild(editBtn);
      buttonsDiv.appendChild(duplicateBtn);
      buttonsDiv.appendChild(deleteBtn);

      headerDiv.appendChild(infoDiv);
      headerDiv.appendChild(buttonsDiv);

      serviceDiv.appendChild(headerDiv);
      aiServicesList.appendChild(serviceDiv);
    });
  }

  function showAiServiceForm(service = null) {
    if (service) {
      aiServiceFormTitle.textContent = 'Edit AI Service';
      aiServiceNameInput.value = service.name || '';
      aiServiceProviderSelect.value = service.provider || 'google';
      aiServiceModelSelect.value = service.model || '';
      aiServiceApiKeyInput.value = service.apiKey || '';
    } else {
      aiServiceFormTitle.textContent = 'Add AI Service';
      aiServiceNameInput.value = '';
      aiServiceProviderSelect.value = 'google';
      aiServiceModelSelect.value = 'gemini-2.5-flash';
      aiServiceApiKeyInput.value = '';
    }

    aiServiceForm.style.display = 'block';
    aiServiceNameInput.focus();
  }

  function hideAiServiceForm() {
    aiServiceForm.style.display = 'none';
    currentEditingAiService = null;
  }



  async function saveAiService() {
    const name = aiServiceNameInput.value.trim();
    const provider = aiServiceProviderSelect.value;
    const apiKey = aiServiceApiKeyInput.value.trim();
    const model = aiServiceModelSelect.value.trim();

    if (!name) {
      alert('Please enter a service name.');
      return;
    }

    if (!apiKey) {
      alert('Please enter an API key.');
      return;
    }

    if (!model) {
      alert('Please enter a model name.');
      return;
    }

    const service = {
      id: currentEditingAiService !== null ? currentEditingAiService.id : Date.now().toString(),
      name,
      provider,
      apiKey,
      model
    };

    try {
      const result = await chrome.storage.local.get(['aiServices']);
      const services = result.aiServices || [];

      if (currentEditingAiService !== null) {
        // Update existing service
        const index = services.findIndex(s => s.id === currentEditingAiService.id);
        if (index !== -1) {
          services[index] = service;
        }
      } else {
        // Add new service
        services.push(service);
      }

      await chrome.storage.local.set({ aiServices: services });
      renderAiServices(services);
      hideAiServiceForm();
    } catch (error) {
      console.error('Error saving AI service:', error);
      alert('Error saving AI service.');
    }
  }

  function editAiService(index) {
    chrome.storage.local.get(['aiServices'], (result) => {
      const services = result.aiServices || [];
      currentEditingAiService = services[index];
      showAiServiceForm(currentEditingAiService);
    });
  }

  async function duplicateAiService(index) {
    try {
      const result = await chrome.storage.local.get(['aiServices']);
      const services = result.aiServices || [];
      const originalService = services[index];

      const duplicatedService = {
        ...originalService,
        id: Date.now().toString(),
        name: `${originalService.name} (Copy)`
      };

      services.push(duplicatedService);
      await chrome.storage.local.set({ aiServices: services });
      renderAiServices(services);
    } catch (error) {
      console.error('Error duplicating AI service:', error);
      alert('Error duplicating AI service.');
    }
  }

  async function deleteAiService(index) {
    if (!confirm('Are you sure you want to delete this AI service?')) {
      return;
    }

    try {
      const result = await chrome.storage.local.get(['aiServices']);
      const services = result.aiServices || [];
      services.splice(index, 1);
      await chrome.storage.local.set({ aiServices: services });
      renderAiServices(services);
    } catch (error) {
      console.error('Error deleting AI service:', error);
    }
  }
});
