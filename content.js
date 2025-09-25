// Content script for WordClick Dictionary v2
// Handles text selection and displays multiple lookup icons for query groups

console.log('Content script loaded');

let lookupIcons = [];
let resultDiv = null;
let selectedWord = '';
let queryGroups = [];
let resultJustShown = false;

// Load query groups on startup
loadQueryGroups();
ensureDefaultQueryGroup();

// Create a default offline query group if none exist
async function ensureDefaultQueryGroup() {
  try {
    const result = await chrome.storage.local.get(['queryGroups']);
    let groups = result.queryGroups || [];

    if (groups.length === 0) {
      console.log('No query groups found, creating default offline group');

      // Get all available dictionaries to populate the default group
      let selectedDictionaries = [];
      try {
        // Try to get dictionaries from background script
        const db = await chrome.runtime.sendMessage({ action: 'getAllDictionaries' });
        if (db && db.dictionaries) {
          selectedDictionaries = db.dictionaries.map(dict => dict.title);
        }
      } catch (error) {
        console.log('Could not get dictionaries from background, will use empty list');
      }

      // Create a default offline group
      const defaultGroup = {
        id: 'default-offline',
        name: 'Dictionary',
        icon: '#',
        queryType: 'offline',
        settings: { selectedDictionaries: selectedDictionaries },
        enabled: true
      };
      groups.push(defaultGroup);
      await chrome.storage.local.set({ queryGroups: groups });
      queryGroups = groups;
      console.log('Created default query group:', defaultGroup);
    }
  } catch (error) {
    console.error('Error ensuring default query group:', error);
  }
}

// Listen for messages from background/options
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateQueryGroups') {
    queryGroups = message.groups || [];
    // Update icons if word is currently selected
    if (selectedWord) {
      const selection = window.getSelection();
      if (selection.toString().trim()) {
        showLookupIcons(selection);
      }
    }
  }
});

// Listen for text selection
document.addEventListener('selectionchange', handleSelectionChange);
document.addEventListener('keyup', handleSelectionChange);

// Function to handle selection changes
function handleSelectionChange() {
  console.log('Selection change detected');
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  console.log('Selected text:', selectedText);

  if (selectedText) {
    // Check if it's a single word (no spaces)
    if (!selectedText.includes(' ')) {
      selectedWord = selectedText;
      showLookupIcons(selection);
    } else {
      hideLookupIcons();
    }
  } else {
    hideLookupIcons();
  }
}

// Load query groups from storage
async function loadQueryGroups() {
  try {
    const result = await chrome.storage.local.get(['queryGroups']);
    queryGroups = result.queryGroups || [];
    console.log('Loaded query groups:', queryGroups);
  } catch (error) {
    console.error('Error loading query groups:', error);
    queryGroups = [];
  }
}

// Show multiple lookup icons near the selection
function showLookupIcons(selection) {
  // Hide existing icons
  hideLookupIcons();

  // Filter enabled groups
  const enabledGroups = queryGroups.filter(group => group.enabled);
  if (enabledGroups.length === 0) return;

  // Apply dark mode styling
  chrome.storage.local.get(['darkMode'], (result) => {
    const isDarkMode = result.darkMode || false;

    // Position calculation
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const baseTop = rect.top + window.scrollY - 5;
    const iconSpacing = 35; // Space between icons

    enabledGroups.forEach((group, index) => {
      const icon = document.createElement('div');
      icon.textContent = group.icon;
      icon.style.position = 'absolute';
      icon.style.borderRadius = '3px';
      icon.style.padding = '2px 4px';
      icon.style.cursor = 'pointer';
      icon.style.zIndex = '999999';
      icon.style.fontSize = '14px';
      icon.style.fontWeight = 'bold';
      icon.dataset.groupId = group.id;
      icon.dataset.groupIndex = index;

      // Apply dark mode styling
      if (isDarkMode) {
        icon.style.backgroundColor = 'black';
        icon.style.color = 'gray';
        icon.style.border = '1px solid gray';
      } else {
        icon.style.backgroundColor = 'white';
        icon.style.color = 'black';
        icon.style.border = '1px solid #ccc';
      }

      // Position icons horizontally from right to left
      const left = window.innerWidth + window.scrollX - 30 - 5 - (index * iconSpacing);
      const top = baseTop;
      icon.style.left = left + 'px';
      icon.style.top = top + 'px';
      icon.style.display = 'block';

      // Add event listeners
      icon.addEventListener('click', (e) => handleIconClick(e, group));
      icon.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      document.body.appendChild(icon);
      lookupIcons.push(icon);
    });
  });
}

// Hide all lookup icons
function hideLookupIcons() {
  lookupIcons.forEach(icon => {
    if (icon.parentNode) {
      icon.parentNode.removeChild(icon);
    }
  });
  lookupIcons = [];
}

// Handle icon click for specific group
function handleIconClick(event, group) {
  event.preventDefault();
  event.stopPropagation();
  // console.log(selectedWord);
  if (selectedWord) {
    hideLookupIcons(); // Hide icons after click
    lookupWord(selectedWord, group);
  }
}

// Lookup the word via background script for specific query group
function lookupWord(word, group) {
  try {
    const message = {
      action: 'lookup',
      word: word,
      groupId: group.id,
      queryType: group.queryType,
      settings: group.settings
    };

    chrome.runtime.sendMessage(message, (response) => {
      // console.log(message);
      console.log('Content script received response:', response);
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        if (errorMsg.includes('Extension context invalidated')) {
          showResult('Dictionary updated! Please refresh this page to continue using word lookup.');
        } else {
          showResult(`Extension error: ${errorMsg}`);
        }
        return;
      }
      if (response && response.error) {
        showResult(`Lookup error (${group.name}): ${response.error}`);
      } else if (response && response.definition) {
        showResult(`${group.icon} ${group.name}\n\n${response.definition}`);
      } else {
        showResult(`No definition found for "${word}" in ${group.name}.`);
      }
    });
  } catch (error) {
    showResult(`Unable to query ${group.name}. Please refresh the page.`);
  }
}

// Sanitize HTML to replace inline styles with classes
function sanitizeDictHTML(html) {
  // Replace common inline styles with classes
  let sanitized = html
    .replace(/style="color:green"/g, 'class="dict-type"')
    .replace(/style="color:brown"/g, 'class="dict-pron"')
    .replace(/style="font-size:0\.7em"/g, 'class="dict-level"')
    .replace(/<type/g, '<span')
    .replace(/<\/type>/g, '</span>')
    .replace(/<pron/g, '<span')
    .replace(/<\/pron>/g, '</span>')
    .replace(/<level/g, '<span')
    .replace(/<\/level>/g, '</span>')
    .replace(/<thai/g, '<span')
    .replace(/<\/thai>/g, '</span>')
    .replace(/<def/g, '<span')
    .replace(/<\/def>/g, '</span>');

  return sanitized;
}

// Show the result in a div below the text
function showResult(definition) {
  resultJustShown = true;
  if (!resultDiv) {
    resultDiv = document.createElement('div');
    resultDiv.style.setProperty('position', 'absolute', 'important');
    resultDiv.style.setProperty('width', '300px', 'important');
    resultDiv.style.setProperty('height', '300px', 'important');
    resultDiv.style.setProperty('border-radius', '4px', 'important');
    resultDiv.style.setProperty('padding', '10px', 'important');
    resultDiv.style.setProperty('overflow-y', 'auto', 'important');
    resultDiv.style.setProperty('z-index', '999999', 'important');
    resultDiv.style.setProperty('font-size', '14px', 'important');

    // Add close button
    resultDiv.appendChild(createCloseButton());

    document.body.appendChild(resultDiv);
  }

  // Apply dark mode if enabled
  chrome.storage.local.get(['darkMode'], (result) => {
    const isDarkMode = result.darkMode || false;

    if (isDarkMode) {
      resultDiv.style.setProperty('background-color', '#2d2d2d', 'important');
      resultDiv.style.setProperty('color', '#ffffff', 'important');
      resultDiv.style.setProperty('border', '1px solid #555', 'important');
      resultDiv.style.setProperty('box-shadow', '0 2px 8px rgba(0,0,0,0.3)', 'important');
    } else {
      resultDiv.style.setProperty('background-color', 'white', 'important');
      resultDiv.style.setProperty('color', 'black', 'important');
      resultDiv.style.setProperty('border', '1px solid #ccc', 'important');
      resultDiv.style.setProperty('box-shadow', '0 2px 8px rgba(0,0,0,0.1)', 'important');
    }

    // Update CSS for dictionary classes based on mode
    const styleElement = resultDiv.querySelector('style');
    if (styleElement) {
      if (isDarkMode) {
        styleElement.textContent = `
          .dict-type { color: #90EE90; }
          .dict-pron { color: #D2B48C; }
          .dict-level { font-size: 0.7em; color: #cccccc; }
        `;
      } else {
        styleElement.textContent = `
          .dict-type { color: green; }
          .dict-pron { color: brown; }
          .dict-level { font-size: 0.7em; }
        `;
      }
    }
  });

  // Position near the original selection
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 5;

    // Adjust if it would go off screen
    if (left + 300 > window.innerWidth + window.scrollX) {
      left = window.innerWidth + window.scrollX - 310;
    }
    if (top + 300 > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - 310;
    }

    resultDiv.style.setProperty('left', left + 'px', 'important');
    resultDiv.style.setProperty('top', top + 'px', 'important');
  }

  // Sanitize and display HTML
  const sanitizedHTML = sanitizeDictHTML(definition);

  // Add CSS for dictionary classes
  let styleElement = resultDiv.querySelector('style');
  if (!styleElement) {
    styleElement = document.createElement('style');
    resultDiv.appendChild(styleElement);
  }
  styleElement.textContent = `
    .dict-type { color: green; }
    .dict-pron { color: brown; }
    .dict-level { font-size: 0.7em; }
  `;

  resultDiv.innerHTML = sanitizedHTML;
  resultDiv.insertBefore(styleElement, resultDiv.firstChild);

  // Re-add close button since innerHTML clears it
  resultDiv.appendChild(createCloseButton());

  resultDiv.style.setProperty('display', 'block', 'important');
}

// Create close button for result div
function createCloseButton() {
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'X';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '5px';
  closeBtn.style.right = '5px';
  closeBtn.style.background = 'black';
  closeBtn.style.color = 'gray';
  closeBtn.style.border = 'none';
  closeBtn.style.borderRadius = '3px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.zIndex = '1000000';
  closeBtn.onclick = () => {
    resultDiv.style.display = 'none';
  };
  return closeBtn;
}

// Hide result div when clicking elsewhere
document.addEventListener('click', (e) => {
  if (resultJustShown) {
    resultJustShown = false;
    return;
  }
  if (resultDiv && !resultDiv.contains(e.target)) {
    resultDiv.style.display = 'none';
  }
});
