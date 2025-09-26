// Content script for WordClick Dictionary v2
// Handles text selection and displays multiple lookup icons for query groups

console.log('Content script loaded');

let lookupIcons = [];
let resultDivs = [];
let inlineDivs = [];
let bottomDivs = [];
let selectedWord = '';
let currentSelection = null;
let queryGroups = [];
let resultJustShown = false;
let iconPlacement = 'word';
let iconOffset = 50;
let iconSpacing = 10;
let boxIdCounter = 0;
let rightSwipeGroupId = '';
let tripleClickGroupId = '';
let hideGroupNames = false;

// Load settings and query groups on startup
loadSettings();
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
        displayMethod: 'popup',
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

// Function to extract selected text
function getSelectedText(selection) {
  return selection.toString().trim();
}

// Function to extract whole word around selection
function getWholeWord(selection) {
  if (selection.rangeCount === 0) return '';

  const range = selection.getRangeAt(0);
  const text = range.toString().trim();
  if (!text) return '';

  // Get the parent text node
  let node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) {
    // If not a text node, find the first text node descendant
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    node = walker.nextNode();
    if (!node) return text;
  }

  const fullText = node.textContent;
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;

  // Find word boundaries (space characters)
  let wordStart = startOffset;
  let wordEnd = endOffset;

  // Expand left until space or start
  while (wordStart > 0 && !/\s/.test(fullText[wordStart - 1])) {
    wordStart--;
  }

  // Expand right until space or end
  while (wordEnd < fullText.length && !/\s/.test(fullText[wordEnd])) {
    wordEnd++;
  }

  return fullText.substring(wordStart, wordEnd).trim();
}

// Function to extract whole paragraph around selection
function getWholeParagraph(selection) {
  if (selection.rangeCount === 0) return '';

  const range = selection.getRangeAt(0);
  let element = range.commonAncestorContainer;

  // If it's a text node, get the parent element
  if (element.nodeType === Node.TEXT_NODE) {
    element = element.parentElement;
  }

  // Find the closest P or DIV element
  while (element && element !== document.body) {
    if (element.tagName === 'P' || element.tagName === 'DIV') {
      return element.textContent.trim();
    }
    element = element.parentElement;
  }

  // Fallback: return selected text if no suitable paragraph found
  return selection.toString().trim();
}

// Function to handle selection changes
function handleSelectionChange() {
  console.log('Selection change detected');
  const selection = window.getSelection();
  const selectedText = getSelectedText(selection);
  console.log('Selected text:', selectedText);

  if (selectedText) {
    // Store the selection for later use
    currentSelection = {
      selectedText: selectedText,
      wholeWord: getWholeWord(selection),
      wholeParagraph: getWholeParagraph(selection)
    };
    console.log('Current selection object:', currentSelection);
    showLookupIcons(selection);
  } else {
    currentSelection = null;
    hideLookupIcons();
  }
}

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['iconPlacement', 'iconOffset', 'iconSpacing', 'rightSwipeGroup', 'tripleClickGroup', 'hideGroupNames']);
    iconPlacement = result.iconPlacement || 'word';
    iconOffset = result.iconOffset || 50;
    iconSpacing = result.iconSpacing || 10;
    rightSwipeGroupId = result.rightSwipeGroup || '';
    tripleClickGroupId = result.tripleClickGroup || '';
    hideGroupNames = result.hideGroupNames || false;
    console.log('Loaded icon settings:', { iconPlacement, iconOffset, iconSpacing, rightSwipeGroupId, tripleClickGroupId, hideGroupNames });
  } catch (error) {
    console.error('Error loading settings:', error);
    iconPlacement = 'word';
    iconOffset = 50;
    iconSpacing = 10;
    rightSwipeGroupId = '';
    tripleClickGroupId = '';
    hideGroupNames = false;
  }
}

// Load query groups from storage
async function loadQueryGroups() {
  try {
    const result = await chrome.storage.local.get(['queryGroups']);
    let groups = result.queryGroups || [];

    // Ensure all groups have displayMethod set
    groups = groups.map(group => ({
      ...group,
      displayMethod: group.displayMethod || 'popup'
    }));

    // Save back if any groups were updated
    if (groups.some((group, index) => !result.queryGroups[index]?.displayMethod)) {
      await chrome.storage.local.set({ queryGroups: groups });
    }

    queryGroups = groups;
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
  console.log('Enabled query groups:', enabledGroups.length);
  if (enabledGroups.length === 0) return;

  // Apply dark mode styling
  chrome.storage.local.get(['darkMode'], (result) => {
    const isDarkMode = result.darkMode || false;

    // Position calculation
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const baseTop = rect.top + window.scrollY - 5;

    enabledGroups.forEach((group, index) => {
      console.log(`Creating icon for group: ${group.name} (${group.icon})`);
      const icon = document.createElement('div');
      icon.style.position = 'absolute';
      icon.style.borderRadius = '3px';
      icon.style.padding = '2px 4px';
      icon.style.cursor = 'pointer';
      icon.style.zIndex = '999999';
      icon.style.fontSize = '14px';
      icon.style.fontWeight = 'bold';
      icon.dataset.groupId = group.id;
      icon.dataset.groupIndex = index;

      // Handle image icons vs text icons
      if (group.icon && group.icon.endsWith('.png')) {
        // Image icon - create img element with proper extension URL
        const img = document.createElement('img');
        img.src = chrome.runtime.getURL(group.icon);
        img.style.width = '16px';
        img.style.height = '16px';
        img.style.verticalAlign = 'middle';
        icon.appendChild(img);
      } else {
        // Text icon
        icon.textContent = group.icon;
      }

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

      // Calculate position based on placement setting
      let left, top = baseTop + iconOffset;

      if (iconPlacement === 'right') {
        // Position on right side of screen, from right to left
        left = window.innerWidth + window.scrollX - 30 - 5 - (index * iconSpacing);
      } else if (iconPlacement === 'left') {
        // Position on left side of screen, from left to right
        left = window.scrollX + 5 + (index * iconSpacing);
      } else {
        // 'word' (default): Position near the selected word, from right to left
        left = rect.right + window.scrollX + 5 - (index * iconSpacing);

        // Ensure icons don't go off-screen to the left
        const iconWidth = 20; // Approximate icon width
        if (left < window.scrollX + 5) {
          // If icon would go off-screen, reposition to the right side of the word
          left = rect.right + window.scrollX + 5 + (index * iconSpacing);
        }
      }

      // Ensure icons stay within viewport bounds
      const iconWidth = 20;
      const viewportLeft = window.scrollX;
      const viewportRight = window.scrollX + window.innerWidth;

      if (left < viewportLeft + 5) {
        left = viewportLeft + 5;
      } else if (left + iconWidth > viewportRight - 5) {
        left = viewportRight - iconWidth - 5;
      }

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
  console.log(`Icon clicked for group: ${group.name} (${group.icon})`);
  event.preventDefault();
  event.stopPropagation();
  // console.log(currentSelection);console.log('xxx');
  if (currentSelection) {
    hideLookupIcons(); // Hide icons after click
    // Show loading state immediately and get the location info
    const locationInfo = showSpinner(group);

    // Choose text based on group's textSelectionMethod
    const textSelectionMethod = group.textSelectionMethod || 'selectedText';
    console.log(`Using text selection method: ${textSelectionMethod}`);
    console.log(currentSelection);
    const word = currentSelection[textSelectionMethod] || currentSelection.selectedText || '';
    console.log(`Sending Text: ${word}`);
    lookupWord(word, group, locationInfo);
  }
}

// Lookup the word via background script for specific query group
function lookupWord(word, group, locationInfo) {
  console.log(word);
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
          showResult('Dictionary updated! Please refresh this page to continue using word lookup.', group, locationInfo);
        } else {
          showResult(`Extension error: ${errorMsg}`, group, locationInfo);
        }
        return;
      }
      // Create group label with proper icon rendering
      const createGroupLabel = (group) => {
        if (group.icon && group.icon.endsWith('.png')) {
          const iconHtml = `<img src="${chrome.runtime.getURL(group.icon)}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;" alt="${group.icon}">`;
          return hideGroupNames ? iconHtml : `${iconHtml}${group.name}`;
        } else {
          return hideGroupNames ? group.icon : `${group.icon} ${group.name}`;
        }
      };

      if (response && response.error) {
        const groupLabel = createGroupLabel(group);
        showResult(`Lookup error (${groupLabel}): ${response.error}`, group, locationInfo);
      } else if (response && response.definition) {
        const groupLabel = createGroupLabel(group);
        showResult(`${groupLabel}\n\n${response.definition}`, group, locationInfo);
      } else {
        const groupLabel = createGroupLabel(group);
        showResult(`No definition found for "${word}" in ${groupLabel}.`, group, locationInfo);
      }
    });
  } catch (error) {
    showResult(`Unable to query ${group.name}. Please refresh the page.`, group, locationInfo);
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

// Show spinner based on group's display method
function showSpinner(group) {
  const displayMethod = group.displayMethod || 'popup';
  const boxId = ++boxIdCounter;

  if (displayMethod === 'inline') {
    return showInlineSpinner(group, boxId);
  } else if (displayMethod === 'bottom') {
    showBottomSpinner(group, boxId);
    return { boxId, displayMethod };
  } else {
    // Default to popup
    showPopupSpinner(group, boxId);
    return { boxId, displayMethod };
  }
}

// Show popup spinner
function showPopupSpinner(group, boxId) {
  resultJustShown = true;
  const resultDiv = document.createElement('div');
  resultDiv.dataset.boxId = boxId;
  resultDiv.style.setProperty('position', 'absolute', 'important');
  resultDiv.style.setProperty('width', '300px', 'important');
  resultDiv.style.setProperty('height', '100px', 'important');
  resultDiv.style.setProperty('border-radius', '4px', 'important');
  resultDiv.style.setProperty('padding', '0px', 'important'); // Add padding to parent
  resultDiv.style.setProperty('z-index', '999999', 'important');
  resultDiv.style.setProperty('font-size', '14px', 'important');
  resultDiv.style.setProperty('display', 'flex', 'important');
  resultDiv.style.setProperty('flex-direction', 'column', 'important');
  resultDiv.style.setProperty('box-sizing', 'border-box', 'important'); // Include padding in width calculation

  document.body.appendChild(resultDiv);
  resultDivs.push(resultDiv);

  // Apply dark mode
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
    if (top + 100 > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - 110;
    }

    resultDiv.style.setProperty('left', left + 'px', 'important');
    resultDiv.style.setProperty('top', top + 'px', 'important');
  }

  // Create header div for close button
  const headerDiv = document.createElement('div');
  headerDiv.className = 'popupResultHeader';
  // headerDiv.style.setProperty('width', '100%', 'important');
  headerDiv.style.setProperty('position', 'relative', 'important');
  headerDiv.style.setProperty('flex-shrink', '0', 'important');
  // headerDiv.style.setProperty('margin', '0px', 'important'); // Negative margin to counteract parent padding
  headerDiv.style.setProperty('padding', '10px', 'important');

  // Create content div for spinner
  const contentDiv = document.createElement('div');
  contentDiv.className = 'popupResultContent';
  // contentDiv.style.setProperty('width', '100%', 'important');
  contentDiv.style.setProperty('flex', '1', 'important');
  contentDiv.style.setProperty('display', 'flex', 'important');
  contentDiv.style.setProperty('align-items', 'center', 'important');
  contentDiv.style.setProperty('justify-content', 'center', 'important');
  contentDiv.style.setProperty('min-height', '70px', 'important');
  contentDiv.style.setProperty('padding', '0px 10px', 'important');

  contentDiv.innerHTML = `<div style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 10px; height: 10px; animation: spin 2s linear infinite;"></div><span style="margin-left: 10px;">Loading ${group.name}...</span><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>`;

  // Assemble the structure
  resultDiv.appendChild(headerDiv);
  resultDiv.appendChild(contentDiv);

  resultDiv.style.setProperty('display', 'flex', 'important');
}

// Show inline spinner
function showInlineSpinner(group, boxId) {
  // Find the parent text block of the selected text
  const selection = window.getSelection();
  if (selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  let parentElement = range.commonAncestorContainer;

  // If it's a text node, get the parent element
  if (parentElement.nodeType === Node.TEXT_NODE) {
    parentElement = parentElement.parentElement;
  }

  // Find the closest p or div element
  while (parentElement && parentElement !== document.body) {
    if (parentElement.tagName === 'P' || parentElement.tagName === 'DIV') {
      break;
    }
    parentElement = parentElement.parentElement;
  }

  if (!parentElement || parentElement === document.body) {
    // Fallback to popup if no suitable parent found
    showPopupSpinner(group, boxId);
    return { boxId, displayMethod: 'popup' };
  }

  // Create a new inline div for this specific location and group
  const inlineDiv = document.createElement('div');
  inlineDiv.dataset.boxId = boxId;
  inlineDiv.dataset.groupId = group.id;
  inlineDiv.dataset.parentId = parentElement.id || 'no-id';
  inlineDiv.style.setProperty('position', 'relative', 'important');
  inlineDiv.style.setProperty('margin-top', '10px', 'important');
  inlineDiv.style.setProperty('padding', '10px', 'important'); // Remove padding, let child divs handle it
  inlineDiv.style.setProperty('border-radius', '4px', 'important');
  inlineDiv.style.setProperty('border', '1px solid #ccc', 'important');
  inlineDiv.style.setProperty('font-size', '14px', 'important');
  inlineDiv.style.setProperty('min-height', '35px', 'important');
  inlineDiv.style.setProperty('display', 'flex', 'important');
  inlineDiv.style.setProperty('flex-direction', 'column', 'important');

  // Apply dark mode
  chrome.storage.local.get(['darkMode'], (result) => {
    const isDarkMode = result.darkMode || false;

    if (isDarkMode) {
      inlineDiv.style.setProperty('background-color', '#2d2d2d', 'important');
      inlineDiv.style.setProperty('color', '#ffffff', 'important');
      inlineDiv.style.setProperty('border-color', '#555', 'important');
    } else {
      inlineDiv.style.setProperty('background-color', 'white', 'important');
      inlineDiv.style.setProperty('color', 'black', 'important');
      inlineDiv.style.setProperty('border-color', '#ccc', 'important');
    }
  });

  // Create header div for close button (will be added later in showInlineResult)
  const headerDiv = document.createElement('div');
  headerDiv.className = 'inlineResultHeader';
  headerDiv.style.setProperty('width', '100%', 'important');
  headerDiv.style.setProperty('position', 'relative', 'important');
  headerDiv.style.setProperty('flex-shrink', '0', 'important');
  headerDiv.style.setProperty('padding', '5px 10px', 'important'); // Add padding to header

  // Create content div for spinner
  const contentDiv = document.createElement('div');
  contentDiv.className = 'inlineResultContent';
  contentDiv.style.setProperty('width', '100%', 'important');
  contentDiv.style.setProperty('flex', '1', 'important');
  contentDiv.style.setProperty('padding', '5px 10px', 'important'); // Add padding to content
  contentDiv.style.setProperty('display', 'flex', 'important');
  contentDiv.style.setProperty('align-items', 'center', 'important');
  contentDiv.style.setProperty('justify-content', 'center', 'important');
  contentDiv.style.setProperty('min-height', '25px', 'important');

  contentDiv.innerHTML = `<div style="border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; width: 10px; height: 10px; animation: spin 2s linear infinite;"></div><span style="margin-left: 6px;">Loading ${group.name}...</span><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>`;

  // Assemble the structure
  inlineDiv.appendChild(headerDiv);
  inlineDiv.appendChild(contentDiv);

  // Insert after the parent element
  parentElement.parentNode.insertBefore(inlineDiv, parentElement.nextSibling);

  // Store reference for later replacement
  inlineDivs.push(inlineDiv);

  inlineDiv.style.setProperty('display', 'flex', 'important');

  // Return location info for the result handler
  return { boxId, displayMethod: 'inline' };
}

// Show bottom spinner
function showBottomSpinner(group, boxId) {
  const bottomDiv = document.createElement('div');
  bottomDiv.dataset.boxId = boxId;
  bottomDiv.style.setProperty('position', 'fixed', 'important');
  bottomDiv.style.setProperty('bottom', '0', 'important');
  bottomDiv.style.setProperty('left', '0', 'important');
  bottomDiv.style.setProperty('width', '100%', 'important');
  bottomDiv.style.setProperty('height', '30%', 'important');
  bottomDiv.style.setProperty('border-top', '1px solid #ccc', 'important');
  bottomDiv.style.setProperty('padding', '0', 'important'); // Remove padding, let child divs handle it
  bottomDiv.style.setProperty('z-index', '999998', 'important');
  bottomDiv.style.setProperty('font-size', '14px', 'important');
  bottomDiv.style.setProperty('box-sizing', 'border-box', 'important');
  bottomDiv.style.setProperty('display', 'flex', 'important');
  bottomDiv.style.setProperty('flex-direction', 'column', 'important');
  bottomDiv.style.setProperty('overflow-y', 'visible', 'important'); // Main div doesn't scroll

  document.body.appendChild(bottomDiv);
  bottomDivs.push(bottomDiv);

  // Apply dark mode
  chrome.storage.local.get(['darkMode'], (result) => {
    const isDarkMode = result.darkMode || false;

    if (isDarkMode) {
      bottomDiv.style.setProperty('background-color', '#2d2d2d', 'important');
      bottomDiv.style.setProperty('color', '#ffffff', 'important');
      bottomDiv.style.setProperty('border-top-color', '#555', 'important');
    } else {
      bottomDiv.style.setProperty('background-color', 'white', 'important');
      bottomDiv.style.setProperty('color', 'black', 'important');
      bottomDiv.style.setProperty('border-top-color', '#ccc', 'important');
    }
  });

  // Create header div for close button
  const headerDiv = document.createElement('div');
  headerDiv.className = 'bottomResultHeader';
  headerDiv.style.setProperty('width', '100%', 'important');
  headerDiv.style.setProperty('position', 'relative', 'important');
  headerDiv.style.setProperty('flex-shrink', '0', 'important');
  headerDiv.style.setProperty('padding', '10px 15px', 'important'); // Keep original padding for header

  // Create content div for spinner
  const contentDiv = document.createElement('div');
  contentDiv.className = 'bottomResultContent';
  contentDiv.style.setProperty('width', '100%', 'important');
  contentDiv.style.setProperty('flex', '1', 'important');
  contentDiv.style.setProperty('padding', '0 15px 10px 15px', 'important'); // Bottom padding
  contentDiv.style.setProperty('display', 'flex', 'important');
  contentDiv.style.setProperty('align-items', 'center', 'important');
  contentDiv.style.setProperty('justify-content', 'center', 'important');
  contentDiv.style.setProperty('min-height', 'calc(100% - 40px)', 'important'); // Account for header

  contentDiv.innerHTML = `<div style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 10px; height: 10px; animation: spin 2s linear infinite;"></div><span style="margin-left: 10px;">Loading ${group.name}...</span><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>`;

  // Assemble the structure
  bottomDiv.appendChild(headerDiv);
  bottomDiv.appendChild(contentDiv);

  bottomDiv.style.setProperty('display', 'flex', 'important');
}

// Show the result based on group's display method
function showResult(definition, group, locationInfo) {
  const displayMethod = locationInfo.displayMethod || group.displayMethod || 'popup';
  const boxId = locationInfo.boxId;

  if (displayMethod === 'inline') {
    showInlineResult(definition, group, boxId);
  } else if (displayMethod === 'bottom') {
    showBottomResult(definition, group, boxId);
  } else {
    // Default to popup
    showPopupResult(definition, group, boxId);
  }
}

// Show the result in a popup div (original behavior)
function showPopupResult(definition, group, boxId) {
  resultJustShown = true;
  const resultDiv = resultDivs.find(div => div.dataset.boxId == boxId);
  if (!resultDiv) return;

  // Get popup settings
  const popupSettings = group.popupSettings || { width: '40%', height: '30%', hideOnClickOutside: false };

  // Clear existing content
  resultDiv.innerHTML = '';

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

    // Set width and height from popup settings
    resultDiv.style.setProperty('width', popupSettings.width, 'important');
    resultDiv.style.setProperty('height', popupSettings.height, 'important');
    resultDiv.style.setProperty('overflow-y', 'visible', 'important'); // Main div doesn't scroll
  });

  // Position near the original selection
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 5;

    // Adjust if it would go off screen
    const divWidth = popupSettings.width.includes('%') ?
      (parseFloat(popupSettings.width) / 100) * window.innerWidth :
      parseFloat(popupSettings.width);
    const divHeight = popupSettings.height.includes('%') ?
      (parseFloat(popupSettings.height) / 100) * window.innerHeight :
      parseFloat(popupSettings.height);

    if (left + divWidth > window.innerWidth + window.scrollX) {
      left = window.innerWidth + window.scrollX - divWidth - 10;
    }
    if (top + divHeight > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - divHeight - 10;
    }

    resultDiv.style.setProperty('left', left + 'px', 'important');
    resultDiv.style.setProperty('top', top + 'px', 'important');
  }

  // Create header div for close button
  const headerDiv = document.createElement('div');
  headerDiv.className = 'popupResultHeader';
  // headerDiv.style.setProperty('width', '100%', 'important');
  headerDiv.style.setProperty('position', 'relative', 'important');
  headerDiv.style.setProperty('flex-shrink', '0', 'important');
  headerDiv.style.setProperty('padding', '5px 10px', 'important');

  // Create content div for scrollable content
  const contentDiv = document.createElement('div');
  contentDiv.className = 'popupResultContent';
  // contentDiv.style.setProperty('width', '100%', 'important');
  contentDiv.style.setProperty('flex', '1', 'important');
  contentDiv.style.setProperty('overflow-y', 'auto', 'important');
  contentDiv.style.setProperty('padding', '5px 10px', 'important');

  // Set main div to flexbox
  resultDiv.style.setProperty('display', 'flex', 'important');
  resultDiv.style.setProperty('flex-direction', 'column', 'important');

  // Sanitize and display HTML in content div
  const sanitizedHTML = sanitizeDictHTML(definition);

  // Add CSS for dictionary classes
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    .dict-type { color: green; }
    .dict-pron { color: brown; }
    .dict-level { font-size: 0.7em; }
  `;
  contentDiv.appendChild(styleElement);
  contentDiv.innerHTML += sanitizedHTML;

  // Add close button to header
  const closeBtn = createCloseButton(resultDiv, '5px', '5px');
  headerDiv.appendChild(closeBtn);

  // Assemble the structure
  resultDiv.appendChild(headerDiv);
  resultDiv.appendChild(contentDiv);

  // Store hide on click outside setting for later use
  resultDiv.dataset.hideOnClickOutside = popupSettings.hideOnClickOutside;

  resultDiv.style.setProperty('display', 'flex', 'important');
}

// Show the result inline below the selected text
function showInlineResult(definition, group, boxId) {
  const inlineDiv = inlineDivs.find(div => div.dataset.boxId == boxId);
  if (!inlineDiv) {
    // Fallback to popup if div not found
    showPopupResult(definition, group, boxId);
    return;
  }

  // Clear existing content and apply dark mode
  inlineDiv.innerHTML = '';

  // Check if flexible height is enabled
  const flexibleHeight = group.inlineSettings?.flexibleHeight !== false;

  chrome.storage.local.get(['darkMode'], (result) => {
    const isDarkMode = result.darkMode || false;

    if (isDarkMode) {
      inlineDiv.style.setProperty('background-color', '#2d2d2d', 'important');
      inlineDiv.style.setProperty('color', '#ffffff', 'important');
      inlineDiv.style.setProperty('border-color', '#555', 'important');
    } else {
      inlineDiv.style.setProperty('background-color', 'white', 'important');
      inlineDiv.style.setProperty('color', 'black', 'important');
      inlineDiv.style.setProperty('border-color', '#ccc', 'important');
    }

    // Apply flexible height settings
    if (flexibleHeight) {
      // Flexible height: allow content to expand, no max height
      inlineDiv.style.setProperty('max-height', 'none', 'important');
      inlineDiv.style.setProperty('overflow-y', 'visible', 'important');
    } else {
      // Fixed height: show scrollbars if content is too tall
      inlineDiv.style.setProperty('max-height', '200px', 'important');
      inlineDiv.style.setProperty('overflow-y', 'visible', 'important'); // Main div doesn't scroll
    }
  });

  // Create header div for close button
  const headerDiv = document.createElement('div');
  headerDiv.className = 'inlineResultHeader';
  headerDiv.style.setProperty('width', '100%', 'important');
  headerDiv.style.setProperty('position', 'relative', 'important');
  headerDiv.style.setProperty('flex-shrink', '0', 'important');

  // Create content div for scrollable content
  const contentDiv = document.createElement('div');
  contentDiv.className = 'inlineResultContent';
  contentDiv.style.setProperty('width', '100%', 'important');
  contentDiv.style.setProperty('flex', '1', 'important');
  contentDiv.style.setProperty('overflow-y', 'auto', 'important');

  // Apply flexible height settings to content div
  if (flexibleHeight) {
    contentDiv.style.setProperty('max-height', 'none', 'important');
  } else {
    contentDiv.style.setProperty('max-height', '180px', 'important'); // Account for header
  }

  // Set main div to flexbox
  inlineDiv.style.setProperty('display', 'flex', 'important');
  inlineDiv.style.setProperty('flex-direction', 'column', 'important');

  // Sanitize and display HTML in content div
  const sanitizedHTML = sanitizeDictHTML(definition);

  // Add CSS for dictionary classes
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    .dict-type { color: green; }
    .dict-pron { color: brown; }
    .dict-level { font-size: 0.7em; }
  `;
  contentDiv.appendChild(styleElement);
  contentDiv.innerHTML += sanitizedHTML;

  // Add close button to header
  const closeBtn = createCloseButton(inlineDiv, '-40px', '5px');
  headerDiv.appendChild(closeBtn);

  // Assemble the structure
  inlineDiv.appendChild(headerDiv);
  inlineDiv.appendChild(contentDiv);

  inlineDiv.style.setProperty('display', 'flex', 'important');
}

// Show the result in a bottom panel
function showBottomResult(definition, group, boxId) {
  const bottomDiv = bottomDivs.find(div => div.dataset.boxId == boxId);
  if (!bottomDiv) return;

  // Clear existing content
  bottomDiv.innerHTML = '';

  // Apply dark mode
  chrome.storage.local.get(['darkMode'], (result) => {
    const isDarkMode = result.darkMode || false;

    if (isDarkMode) {
      bottomDiv.style.setProperty('background-color', '#2d2d2d', 'important');
      bottomDiv.style.setProperty('color', '#ffffff', 'important');
      bottomDiv.style.setProperty('border-top-color', '#555', 'important');
    } else {
      bottomDiv.style.setProperty('background-color', 'white', 'important');
      bottomDiv.style.setProperty('color', 'black', 'important');
      bottomDiv.style.setProperty('border-top-color', '#ccc', 'important');
    }
  });

  // Set main div to flexbox and remove old padding
  bottomDiv.style.setProperty('display', 'flex', 'important');
  bottomDiv.style.setProperty('flex-direction', 'column', 'important');
  bottomDiv.style.setProperty('padding', '10px', 'important'); // Remove padding, let child divs handle it
  bottomDiv.style.setProperty('overflow-y', 'visible', 'important'); // Main div doesn't scroll

  // Create header div for close button
  const headerDiv = document.createElement('div');
  headerDiv.className = 'bottomResultHeader';
  headerDiv.style.setProperty('width', '100%', 'important');
  headerDiv.style.setProperty('position', 'relative', 'important');
  headerDiv.style.setProperty('flex-shrink', '0', 'important');
  headerDiv.style.setProperty('padding', '0px', 'important'); // Keep original padding for header

  // Create content div for scrollable content
  const contentDiv = document.createElement('div');
  contentDiv.className = 'bottomResultContent';
  contentDiv.style.setProperty('width', '100%', 'important');
  contentDiv.style.setProperty('flex', '1', 'important');
  contentDiv.style.setProperty('overflow-y', 'auto', 'important');
  contentDiv.style.setProperty('padding', '10px 0px', 'important'); // Bottom padding

  // Sanitize and display HTML in content div
  const sanitizedHTML = sanitizeDictHTML(definition);

  // Add CSS for dictionary classes
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    .dict-type { color: green; }
    .dict-pron { color: brown; }
    .dict-level { font-size: 0.7em; }
  `;
  contentDiv.appendChild(styleElement);
  contentDiv.innerHTML += sanitizedHTML;

  // Add close button to header
  const closeBtn = createCloseButton(bottomDiv, '-40px', '15px');
  headerDiv.appendChild(closeBtn);

  // Assemble the structure
  bottomDiv.appendChild(headerDiv);
  bottomDiv.appendChild(contentDiv);

  bottomDiv.style.setProperty('display', 'flex', 'important');
}

// Create close button for result div
function createCloseButton(targetDiv, top = '10px', right = '10px') {
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'X';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = top;
  closeBtn.style.right = right;
  closeBtn.style.background = 'black';
  closeBtn.style.color = 'white';
  closeBtn.style.border = '1px solid #666';
  closeBtn.style.borderRadius = '3px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.width = '20px';
  closeBtn.style.height = '20px';
  closeBtn.style.fontSize = '12px';
  closeBtn.style.lineHeight = '1';
  closeBtn.style.padding = '0px';
  closeBtn.style.zIndex = '1000001';
  closeBtn.onclick = (e) => {
    e.stopPropagation(); // Prevent event bubbling
    targetDiv.style.display = 'none';
  };
  return closeBtn;
}

// Touch gesture handling for swipe detection
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let isTrackingSwipe = false;

// Add touch event listeners to paragraphs for swipe gestures
function addSwipeListeners() {
  // Remove existing listeners first
  document.querySelectorAll('p, div').forEach(element => {
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchend', handleTouchEnd);
  });

  // Add listeners to paragraphs and divs
  document.querySelectorAll('p, div').forEach(element => {
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });
  });
}

function handleTouchStart(event) {
  if (event.touches.length === 1) {
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    isTrackingSwipe = true;
  }
}

function handleTouchEnd(event) {
  if (!isTrackingSwipe || !rightSwipeGroupId) return;

  const touch = event.changedTouches[0];
  const touchEndX = touch.clientX;
  const touchEndY = touch.clientY;
  const touchEndTime = Date.now();

  const deltaX = touchEndX - touchStartX;
  const deltaY = touchEndY - touchStartY;
  const deltaTime = touchEndTime - touchStartTime;

  // Check if it's a valid right swipe
  const minSwipeDistance = 50; // Minimum distance for swipe
  const maxVerticalMovement = 50; // Maximum vertical movement allowed
  const maxSwipeTime = 500; // Maximum time for swipe gesture

  if (deltaTime < maxSwipeTime &&
      Math.abs(deltaX) > minSwipeDistance &&
      Math.abs(deltaY) < maxVerticalMovement &&
      deltaX > 0) { // Right swipe

    // Find the paragraph that was swiped
    const targetElement = event.target.closest('p, div');
    if (targetElement && targetElement.textContent.trim()) {
      // Execute the selected query group with the paragraph text
      executeSwipeQuery(targetElement);
    }
  }

  isTrackingSwipe = false;
}

function executeSwipeQuery(element) {
  // Find the selected query group
  const selectedGroup = queryGroups.find(group => group.id === rightSwipeGroupId);
  if (!selectedGroup || !selectedGroup.enabled) return;

  console.log(`Executing right swipe query for group: ${selectedGroup.name}`);

  // Create a temporary selection object for the paragraph
  const paragraphText = element.textContent.trim();
  const tempSelection = {
    selectedText: paragraphText,
    wholeWord: paragraphText,
    wholeParagraph: paragraphText
  };

  // Show loading state
  const locationInfo = showSpinner(selectedGroup);

  // Choose text based on group's textSelectionMethod (default to wholeParagraph for swipe)
  const textSelectionMethod = selectedGroup.textSelectionMethod || 'wholeParagraph';
  const word = tempSelection[textSelectionMethod] || tempSelection.selectedText || '';

  console.log(`Swipe query text: ${word}`);
  lookupWord(word, selectedGroup, locationInfo);
}

// Mouse gesture handling for triple click detection
let clickCount = 0;
let clickTimer = null;
let lastClickElement = null;

// Add click event listeners to paragraphs for triple click gestures
function addClickListeners() {
  // Remove existing listeners first
  document.querySelectorAll('p, div').forEach(element => {
    element.removeEventListener('click', handleClick);
  });

  // Add listeners to paragraphs and divs
  document.querySelectorAll('p, div').forEach(element => {
    element.addEventListener('click', handleClick);
  });
}

function handleClick(event) {
  if (!tripleClickGroupId) return;

  const targetElement = event.target.closest('p, div');
  if (!targetElement || !targetElement.textContent.trim()) return;

  // Reset click count if clicking on a different element
  if (lastClickElement !== targetElement) {
    clickCount = 0;
    lastClickElement = targetElement;
  }

  clickCount++;

  // Clear existing timer
  if (clickTimer) {
    clearTimeout(clickTimer);
  }

  // Set timer to reset click count after 500ms
  clickTimer = setTimeout(() => {
    clickCount = 0;
    lastClickElement = null;
  }, 500);

  // Check for triple click
  if (clickCount === 3) {
    // Prevent default behavior and execute query
    event.preventDefault();
    event.stopPropagation();

    // Reset click tracking
    clickCount = 0;
    lastClickElement = null;
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }

    // Execute the selected query group with the paragraph text
    executeTripleClickQuery(targetElement);
  }
}

function executeTripleClickQuery(element) {
  // Find the selected query group
  const selectedGroup = queryGroups.find(group => group.id === tripleClickGroupId);
  if (!selectedGroup || !selectedGroup.enabled) return;

  console.log(`Executing triple click query for group: ${selectedGroup.name}`);

  // Create a temporary selection object for the paragraph
  const paragraphText = element.textContent.trim();
  const tempSelection = {
    selectedText: paragraphText,
    wholeWord: paragraphText,
    wholeParagraph: paragraphText
  };

  // Show loading state
  const locationInfo = showSpinner(selectedGroup);

  // Always use whole paragraph for triple click (as requested)
  const word = tempSelection.wholeParagraph || tempSelection.selectedText || '';

  console.log(`Triple click query text: ${word}`);
  lookupWord(word, selectedGroup, locationInfo);
}

// Initialize listeners when DOM is ready
function initializeListeners() {
  addSwipeListeners();
  addClickListeners();

  // Re-add listeners when content changes (for dynamic content)
  if (document.body) {
    const observer = new MutationObserver(() => {
      setTimeout(() => {
        addSwipeListeners();
        addClickListeners();
      }, 100); // Small delay to avoid excessive updates
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeListeners);
} else {
  initializeListeners();
}

// Hide result divs when clicking elsewhere
document.addEventListener('click', (e) => {
  if (resultJustShown) {
    resultJustShown = false;
    return;
  }

  // Hide popup result divs if clicked outside and hideOnClickOutside is enabled
  resultDivs.forEach(div => {
    if (div && !div.contains(e.target) && div.dataset.hideOnClickOutside === 'true') {
      div.style.display = 'none';
    }
  });

  // Note: Inline and bottom panel result divs do not auto-hide on click outside
  // They only hide when the X button is clicked
});
