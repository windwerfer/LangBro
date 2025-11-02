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

   const clearDatabaseBtn = document.getElementById('clearDatabaseBtn');
   const clearStatus = document.getElementById('clearStatus');

  // Main settings elements
  const extensionEnabledCheckbox = document.getElementById('extensionEnabledCheckbox');
  const darkModeCheckbox = document.getElementById('darkModeCheckbox');
  const hideGroupNamesCheckbox = document.getElementById('hideGroupNamesCheckbox');
  const cachingEnabledCheckbox = document.getElementById('cachingEnabledCheckbox');
  const cacheTimeoutContainer = document.getElementById('cacheTimeoutContainer');
  const cacheTimeoutInput = document.getElementById('cacheTimeoutInput');
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const iconPlacementSelect = document.getElementById('iconPlacement');
  const iconOffsetInput = document.getElementById('iconOffset');
  const iconSpacingInput = document.getElementById('iconSpacing');
  const rightSwipeGroupSelect = document.getElementById('rightSwipeGroup');
  const singleClickGroupSelect = document.getElementById('singleClickGroup');
  const simpleDictGroupSelect = document.getElementById('simpleDictGroup');

  // Import page elements
  const filesInput = document.getElementById('filesInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const importStatusDiv = document.getElementById('importStatus');
  const yomitanFileInput = document.getElementById('yomitanFileInput');
  const uploadYomitanBtn = document.getElementById('uploadYomitanBtn');
  const yomitanStatusDiv = document.getElementById('yomitanStatus');
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
      const result = await chrome.storage.local.get(['extensionEnabled', 'darkMode', 'hideGroupNames', 'cachingEnabled', 'cacheTimeoutDays', 'targetLanguage', 'iconPlacement', 'iconOffset', 'iconSpacing', 'rightSwipeGroup', 'singleClickGroup', 'simpleDictGroup']);
      console.log('Loaded settings:', result);
      extensionEnabledCheckbox.checked = result.extensionEnabled !== undefined ? result.extensionEnabled : true;
      darkModeCheckbox.checked = result.darkMode || false;
      hideGroupNamesCheckbox.checked = result.hideGroupNames || false;
      cachingEnabledCheckbox.checked = result.cachingEnabled || false;
      cacheTimeoutInput.value = result.cacheTimeoutDays || 0;
      cacheTimeoutContainer.style.display = result.cachingEnabled ? 'block' : 'none';
      targetLanguageSelect.value = result.targetLanguage || 'en';
      iconPlacementSelect.value = result.iconPlacement || 'word';
      iconOffsetInput.value = result.iconOffset || 50;
      iconSpacingInput.value = result.iconSpacing || 10;
      rightSwipeGroupSelect.value = result.rightSwipeGroup || '';
      singleClickGroupSelect.value = result.singleClickGroup || '';
      simpleDictGroupSelect.value = result.simpleDictGroup || '';
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  // Initial load
  loadSettings();

  // Save settings when changed
  extensionEnabledCheckbox.addEventListener('change', () => {
    console.log('Saving extension enabled setting:', extensionEnabledCheckbox.checked);
    chrome.storage.local.set({ extensionEnabled: extensionEnabledCheckbox.checked });
  });

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

   simpleDictGroupSelect.addEventListener('change', () => {
     console.log('Saving simple dict group setting:', simpleDictGroupSelect.value);
     chrome.storage.local.set({ simpleDictGroup: simpleDictGroupSelect.value });
   });

  rightSwipeGroupSelect.addEventListener('change', () => {
    console.log('Saving right swipe group setting:', rightSwipeGroupSelect.value);
    chrome.storage.local.set({ rightSwipeGroup: rightSwipeGroupSelect.value });
  });

  // Caching settings event handlers
  cachingEnabledCheckbox.addEventListener('change', () => {
    const enabled = cachingEnabledCheckbox.checked;
    console.log('Saving caching enabled setting:', enabled);
    chrome.storage.local.set({ cachingEnabled: enabled });
    cacheTimeoutContainer.style.display = enabled ? 'block' : 'none';
  });

  cacheTimeoutInput.addEventListener('input', () => {
    const timeout = parseInt(cacheTimeoutInput.value) || 0;
    console.log('Saving cache timeout setting:', timeout);
    chrome.storage.local.set({ cacheTimeoutDays: timeout });
  });



  // Check dictionaries button
  checkDictsBtn.addEventListener('click', async () => {
    try {
      showStatus('Checking dictionary integrity...', 'info');
      const db = await getStructuredDB();
      const counts = await db.getActualTermCounts();

      let resultText = 'Dictionary Check Results:\n\n';
      for (const [dictName, countInfo] of Object.entries(counts)) {
        const status = countInfo.expected === countInfo.actual.total ? '✓ OK' : '✗ MISMATCH';
        resultText += `${dictName}: ${countInfo.actual.total}/${countInfo.expected} words ${status}\n`;
      }

      if (Object.keys(counts).length === 0) {
        resultText = 'No dictionaries found in database.';
      }

      showStatus(resultText, Object.values(counts).some(c => c.expected !== c.actual.total) ? 'error' : 'success');
    } catch (error) {
      showStatus('Error checking dictionaries: ' + error.message, 'error');
    }
  });





  function showStatus(message, type) {
    importStatusDiv.textContent = message;
    importStatusDiv.className = type;
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
           const termCount = dict.counts.terms.total;
           const metaCount = dict.counts.termMeta ? dict.counts.termMeta.total : 0;
           const displayName = dict.displayName || dict.title;
           nameSpan.textContent = `${displayName} (${termCount} ${termCount === 0 && metaCount > 0 ? 'meta entries' : 'words'})`;

           const editBtn = document.createElement('button');
           editBtn.textContent = 'Rename';
           editBtn.style.marginLeft = '10px';
           editBtn.onclick = () => editDict(dict.title);

           const deleteBtn = document.createElement('button');
           deleteBtn.textContent = 'Delete';
           deleteBtn.style.marginLeft = '10px';
           deleteBtn.onclick = () => deleteDict(dict.title);

           dictDiv.appendChild(nameSpan);
           dictDiv.appendChild(editBtn);
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

   async function editDict(dictName) {
     // Find the dict to get current displayName
     const db = await getStructuredDB();
     const dicts = await db.getAllDictionaries();
     const dict = dicts.find(d => d.title === dictName);
     if (!dict) return;
     const currentName = dict.displayName || dict.title;
     const newName = prompt(`Enter new display name for dictionary "${currentName}":`, currentName);
     if (!newName || newName.trim() === '' || newName.trim() === currentName) return;

     try {
       showStatus(`Renaming dictionary display name to "${newName.trim()}"...`, 'info');
       await db.renameDictionary(dictName, newName.trim());
       showStatus(`Dictionary display name updated successfully.`, 'success');
       loadCurrentDict(); // Refresh list
     } catch (error) {
       showStatus('Error updating display name: ' + error.message, 'error');
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

    const updateSimpleDictDropdown = (selectElement) => {
      selectElement.innerHTML = '<option value="">None</option>';
      groups.filter(group => group.showSearchField && group.showSearchField !== 'none').forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        const displayText = group.icon && group.icon.endsWith('.png') ? group.name : `${group.icon} ${group.name}`;
        option.textContent = displayText;
        selectElement.appendChild(option);
      });
    };

    updateSimpleDictDropdown(simpleDictGroupSelect);

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

      const clearCacheBtn = document.createElement('button');
      clearCacheBtn.textContent = 'Clear cache';
      clearCacheBtn.onclick = () => clearGroupCache(group.id);

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.style.marginLeft = '30px';
      editBtn.onclick = () => editQueryGroup(index);

      const duplicateBtn = document.createElement('button');
      duplicateBtn.textContent = 'Duplicate';
      duplicateBtn.style.marginLeft = '5px';
      duplicateBtn.onclick = () => duplicateQueryGroup(index);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.style.marginLeft = '5px';
      deleteBtn.onclick = () => deleteQueryGroup(index);

      buttonsDiv.appendChild(clearCacheBtn);
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
         // Load selected dictionaries for offline groups with order
         const dictionaryOrder = group.settings?.dictionaryOrder || group.settings?.selectedDictionaries || [];
         loadAvailableDictionaries(dictionaryOrder);
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
      // Collect selected dictionaries and their order
      const selectedDictionaries = [];
      const dictionaryOrder = [];

      // Get order from sortable list
      const sortableItems = document.querySelectorAll('#selectedDicts .sortable-item');
      sortableItems.forEach(item => {
        const dictName = item.dataset.dict;
        dictionaryOrder.push(dictName);
        selectedDictionaries.push(dictName);
      });

      if (selectedDictionaries.length === 0) {
        alert('Please select at least one dictionary for this offline query group.');
        return;
      }

      settings = { selectedDictionaries, dictionaryOrder };
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

  // Clear cache for a specific group
  async function clearGroupCache(groupId) {
    if (!confirm('Are you sure you want to clear the cache for this query group? This action cannot be undone.')) {
      return;
    }

    try {
      const result = await chrome.storage.local.get(['queryGroupCaches']);
      const caches = result.queryGroupCaches || {};
      if (caches[groupId]) {
        delete caches[groupId];
        await chrome.storage.local.set({ queryGroupCaches: caches });
        alert('Cache cleared for this query group.');
      } else {
        alert('No cache found for this query group.');
      }
    } catch (error) {
      console.error('Error clearing group cache:', error);
      alert('Error clearing cache.');
    }
  }

  // Load available dictionaries for selection
  async function loadAvailableDictionaries(selectedDictionaries = []) {
    try {
      const db = await getStructuredDB();
      const dictionaries = await db.getAllDictionaries();

      const availableDicts = document.getElementById('availableDicts');
      const selectedDicts = document.getElementById('selectedDicts');

      availableDicts.innerHTML = '';
      selectedDicts.innerHTML = '';

      if (dictionaries.length === 0) {
        availableDicts.innerHTML = '<p style="color: #666; font-style: italic;">No dictionaries available. Please import dictionaries first.</p>';
        selectedDicts.innerHTML = '<p style="color: #666; font-style: italic;">No dictionaries available</p>';
        return;
      }

      // Create available dictionaries checkboxes
      dictionaries.forEach(dict => {
        const dictDiv = document.createElement('div');
        dictDiv.className = 'dict-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = dict.title;
        checkbox.id = `dict-${dict.title}`;
        checkbox.checked = selectedDictionaries.includes(dict.title);

        // Add change listener to update sortable list
        checkbox.addEventListener('change', () => {
          updateSelectedDictsList(dictionaries);
        });

        const label = document.createElement('label');
        label.htmlFor = `dict-${dict.title}`;
        label.textContent = `${dict.title} (${dict.counts.terms.total} words)`;

        dictDiv.appendChild(checkbox);
        dictDiv.appendChild(label);
        availableDicts.appendChild(dictDiv);
      });

       // Initialize the dictionary order manager
       const selectedDictsContainer = document.getElementById('selectedDicts');
       dictOrderManager.initialize(selectedDictsContainer, dictionaries);

       // Create initial selected dictionaries list
       updateSelectedDictsList(dictionaries, selectedDictionaries);

    } catch (error) {
      console.error('Error loading available dictionaries:', error);
      const availableDicts = document.getElementById('availableDicts');
      const selectedDicts = document.getElementById('selectedDicts');
      availableDicts.innerHTML = '<p style="color: #d9534f;">Error loading dictionaries.</p>';
      selectedDicts.innerHTML = '<p style="color: #d9534f;">Error loading dictionaries.</p>';
    }
  }

  // Unified Dictionary Order Manager
  class DictionaryOrderManager {
    constructor() {
      this.order = [];
      this.allDictionaries = [];
      this.inputAdapters = [];
      this.container = null;
    }

    initialize(container, allDictionaries) {
      this.container = container;
      this.allDictionaries = allDictionaries;
      this.inputAdapters = [
        new DragInput(this),
        new TouchInput(this)
      ];
    }

    setOrder(newOrder) {
      this.order = [...newOrder];
      this.render();
      this.updatePositionInputs();
    }

    getOrder() {
      return [...this.order];
    }

    moveItem(fromIndex, toIndex) {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= this.order.length || toIndex >= this.order.length) return;
      const item = this.order.splice(fromIndex, 1)[0];
      this.order.splice(toIndex, 0, item);
      this.render();
      this.updatePositionInputs();
    }

    moveItemUp(item) {
      const currentIndex = Array.from(this.container.children).indexOf(item);
      if (currentIndex > 0) {
        this.moveItem(currentIndex, currentIndex - 1);
      }
    }

    moveItemDown(item) {
      const currentIndex = Array.from(this.container.children).indexOf(item);
      if (currentIndex < this.order.length - 1) {
        this.moveItem(currentIndex, currentIndex + 1);
      }
    }

    updateAvailableDictionaries(allDictionaries, forcedOrder = null) {
      this.allDictionaries = allDictionaries;

      const checkedBoxes = document.querySelectorAll('#availableDicts input[type="checkbox"]:checked');
      const selectedNames = Array.from(checkedBoxes).map(cb => cb.value);

      if (forcedOrder && forcedOrder.length > 0) {
        // Use forced order (from loading existing group)
        this.order = forcedOrder.filter(name => selectedNames.includes(name));
        // Add any newly selected that aren't in the forced order
        selectedNames.forEach(name => {
          if (!this.order.includes(name)) {
            this.order.push(name);
          }
        });
      } else {
        // Use current checkbox order, preserving existing order where possible
        const newOrder = [];
        this.order.forEach(name => {
          if (selectedNames.includes(name)) {
            newOrder.push(name);
          }
        });
        selectedNames.forEach(name => {
          if (!newOrder.includes(name)) {
            newOrder.push(name);
          }
        });
        this.order = newOrder;
      }

      this.render();
      this.inputAdapters.forEach(adapter => adapter.attach());
    }

    render() {
      if (!this.container) return;

      this.container.innerHTML = '';

      if (this.order.length === 0) {
        this.container.innerHTML = '<p style="color: #666; font-style: italic; margin: 10px;">Select dictionaries above to add them here</p>';
        return;
      }

      this.order.forEach((dictName, index) => {
        const dict = this.allDictionaries.find(d => d.title === dictName);
        if (!dict) return;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'sortable-item';
        itemDiv.dataset.dict = dictName;

        // Position controls (input + arrows)
        const positionControls = document.createElement('div');
        positionControls.className = 'position-controls';

        const upBtn = document.createElement('button');
        upBtn.className = 'position-btn';
        upBtn.textContent = '▲';
        upBtn.title = 'Move up';
        upBtn.addEventListener('click', () => this.moveItemUp(itemDiv));

        const positionInput = document.createElement('input');
        positionInput.type = 'number';
        positionInput.className = 'position-input';
        positionInput.value = index + 1;
        positionInput.min = 1;
        positionInput.max = this.order.length;
        positionInput.title = 'Enter new position number';
        positionInput.addEventListener('change', (e) => this.handlePositionChange(itemDiv, parseInt(e.target.value)));
        positionInput.addEventListener('input', (e) => this.handlePositionInput(e.target));

        const downBtn = document.createElement('button');
        downBtn.className = 'position-btn';
        downBtn.textContent = '▼';
        downBtn.title = 'Move down';
        downBtn.addEventListener('click', () => this.moveItemDown(itemDiv));

        positionControls.appendChild(upBtn);
        positionControls.appendChild(positionInput);
        positionControls.appendChild(downBtn);

        const nameDiv = document.createElement('div');
        nameDiv.className = 'item-header';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'dict-name';
        nameSpan.textContent = `${dict.title} (${dict.counts.terms.total} words)`;

        nameDiv.appendChild(nameSpan);

        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'item-buttons';

        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.textContent = '⋮⋮';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove from selection';
        removeBtn.addEventListener('click', () => {
          const checkbox = document.getElementById(`dict-${dictName}`);
          if (checkbox) {
            checkbox.checked = false;
            this.updateAvailableDictionaries(this.allDictionaries);
          }
        });

        buttonsDiv.appendChild(positionControls);
        buttonsDiv.appendChild(dragHandle);
        buttonsDiv.appendChild(removeBtn);

        itemDiv.appendChild(nameDiv);
        itemDiv.appendChild(buttonsDiv);

        this.container.appendChild(itemDiv);
      });
    }

    updatePositionInputs() {
      const items = this.container.querySelectorAll('.sortable-item');
      items.forEach((item, index) => {
        const input = item.querySelector('.position-input');
        if (input) {
          input.value = index + 1;
          input.max = this.order.length;
          input.classList.remove('error');
        }
        // Update button states
        const upBtn = item.querySelector('.position-btn:first-child');
        const downBtn = item.querySelector('.position-btn:last-child');
        if (upBtn) upBtn.disabled = index === 0;
        if (downBtn) downBtn.disabled = index === this.order.length - 1;
      });
    }

    handlePositionChange(item, newPosition) {
      const currentIndex = Array.from(this.container.children).indexOf(item);
      const targetIndex = Math.max(0, Math.min(this.order.length - 1, newPosition - 1));

      if (currentIndex !== targetIndex) {
        this.moveItem(currentIndex, targetIndex);
        this.updatePositionInputs();
      }
    }

    handlePositionInput(input) {
      const value = parseInt(input.value);
      const max = this.order.length;

      // Auto-clamp invalid values
      if (isNaN(value) || value < 1) {
        input.value = 1;
        input.classList.remove('error');
      } else if (value > max) {
        input.value = max;
        input.classList.remove('error');
      } else {
        input.classList.remove('error');
      }

      input.title = `Enter new position number (1-${max})`;
    }
  }

  // Input Method Adapters
  class DragInput {
    constructor(manager) {
      this.manager = manager;
      this.draggedElement = null;
      this.isMobile = this.detectMobile();
    }

    detectMobile() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
             ('ontouchstart' in window && window.innerWidth <= 768);
    }

    attach() {
      if (this.isMobile) return; // Use TouchInput instead

      const items = this.manager.container.querySelectorAll('.sortable-item');
      items.forEach(item => {
        item.draggable = true;
        item.addEventListener('dragstart', this.handleDragStart.bind(this));
        item.addEventListener('dragend', this.handleDragEnd.bind(this));
        item.addEventListener('dragover', this.handleDragOver.bind(this));
        item.addEventListener('drop', this.handleDrop.bind(this));
      });
    }

    handleDragStart(e) {
      this.draggedElement = e.target;
      e.target.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    }

    handleDragEnd(e) {
      e.target.classList.remove('dragging');
      this.draggedElement = null;
    }

    handleDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const target = e.target.closest('.sortable-item');
      if (!target || target === this.draggedElement) return;

      const container = this.manager.container;
      const items = Array.from(container.children);
      const fromIndex = items.indexOf(this.draggedElement);
      const toIndex = items.indexOf(target);

      const rect = target.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;

      if (e.clientY < midpoint) {
        if (fromIndex > toIndex) {
          container.insertBefore(this.draggedElement, target);
          this.manager.moveItem(fromIndex, toIndex);
        }
      } else {
        if (fromIndex < toIndex) {
          container.insertBefore(this.draggedElement, target.nextSibling);
          this.manager.moveItem(fromIndex, toIndex + 1);
        }
      }
    }

    handleDrop(e) {
      e.preventDefault();
    }
  }

  class TouchInput {
    constructor(manager) {
      this.manager = manager;
      this.touchStartY = 0;
      this.touchStartX = 0;
      this.touchDraggedElement = null;
      this.isMobile = this.detectMobile();
    }

    detectMobile() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
             ('ontouchstart' in window && window.innerWidth <= 768);
    }

    attach() {
      if (!this.isMobile) return; // Use DragInput instead

      const items = this.manager.container.querySelectorAll('.sortable-item');
      items.forEach(item => {
        item.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        item.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        item.addEventListener('touchend', this.handleTouchEnd.bind(this));
        item.style.cursor = 'grab';
      });
    }

    handleTouchStart(e) {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;

      const target = e.target.closest('.sortable-item');
      if (!target) return;

      this.touchDraggedElement = target;
    }

    handleTouchMove(e) {
      if (!this.touchDraggedElement || e.touches.length !== 1) return;

      e.preventDefault();

      const touch = e.touches[0];
      const deltaY = Math.abs(touch.clientY - this.touchStartY);
      const deltaX = Math.abs(touch.clientX - this.touchStartX);

      if (deltaY < 10 || deltaX > deltaY) return;

      const target = e.target.closest('.sortable-item');
      if (!target || target === this.touchDraggedElement) return;

      const container = this.manager.container;
      const items = Array.from(container.children);
      const fromIndex = items.indexOf(this.touchDraggedElement);
      const toIndex = items.indexOf(target);

      const rect = target.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;

      if (touch.clientY < midpoint && fromIndex > toIndex) {
        container.insertBefore(this.touchDraggedElement, target);
        this.manager.moveItem(fromIndex, toIndex);
      } else if (touch.clientY >= midpoint && fromIndex < toIndex) {
        container.insertBefore(this.touchDraggedElement, target.nextSibling);
        this.manager.moveItem(fromIndex, toIndex + 1);
      }
    }

    handleTouchEnd(e) {
      if (!this.touchDraggedElement) return;
      this.touchDraggedElement.classList.remove('dragging');
      this.touchDraggedElement = null;
    }
  }



  // Initialize the unified sorting system
  const dictOrderManager = new DictionaryOrderManager();

  // Update the sortable selected dictionaries list
  function updateSelectedDictsList(allDictionaries, forcedOrder = null) {
    dictOrderManager.updateAvailableDictionaries(allDictionaries, forcedOrder);
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

        // Detect if this is an IPA dictionary (only has metadata entries)
        const isIPA = dictName.toLowerCase().includes('ipa');

        let structuredData;

        if (isIPA) {
          // Convert entries to termMeta format for IPA dictionaries
          const termMeta = importData.entries.map((entry, index) => ({
            dictionary: dictName,
            expression: entry.term,
            mode: 'default', // Default mode for IPA
            data: {
              reading: entry.reading || '',
              score: entry.score || 0,
              sequence: entry.sequence || index,
              termTags: entry.termTags || []
            }
          }));

          structuredData = {
            metadata: {
              title: dictName,
              format: 'StarDict',
              revision: '1',
              sequenced: true,
              counts: {
                terms: { total: 0 },
                termMeta: { total: termMeta.length },
                kanji: { total: 0 },
                media: { total: 0 }
              }
            },
            terms: [],
            termMeta: termMeta,
            kanji: [],
            media: []
          };
        } else {
          // Convert entries to terms format for regular dictionaries
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

          structuredData = {
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
        }

        await db.storeDictionary(structuredData, (message) => {
          showBackupStatus(message, 'info', 'dictStatus');
        });

        const entryType = isIPA ? 'IPA entries' : 'terms';
        showBackupStatus(`Dictionary "${dictName}" imported successfully! (${importData.entries.length} ${entryType})`, 'success', 'dictStatus');

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

   // Clear database button
   clearDatabaseBtn.addEventListener('click', async () => {
     const confirmed = confirm('⚠️ WARNING: This will permanently delete ALL imported dictionaries and their data!\n\nThis action CANNOT be undone. Make sure you have backups before proceeding.\n\nAre you REALLY sure you want to clear the entire database?');
     if (!confirmed) return;

     const doubleConfirmed = confirm('FINAL WARNING: This is your last chance to cancel.\n\nAll dictionary data will be lost forever.\n\nType "YES" below if you are absolutely certain:');
     if (!doubleConfirmed) return;

     try {
       showBackupStatus('Clearing database...', 'info', 'clearStatus');
       const db = await getStructuredDB();
       await db.clearAll();
       showBackupStatus('Database cleared successfully!', 'success', 'clearStatus');

       // Refresh dictionary list
       loadCurrentDict();

       // Notify background script to reload parser
       chrome.runtime.sendMessage({ action: 'reloadParser' });
     } catch (error) {
       showBackupStatus('Error clearing database: ' + error.message, 'error', 'clearStatus');
     }
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

  // Initialize dictionary importer
  const importer = new DictionaryImporter({
    getStructuredDB,
    showStatus,
    loadCurrentDict
  });
  importer.init();
});
