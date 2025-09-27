// Content script for WordClick Dictionary v2
// Handles text selection and displays multiple lookup icons for query groups

console.log('Content script loaded');

// Selection state management constants
const SELECTION_STATES = {
  IDLE: 'idle',
  PROGRAMMATIC: 'programmatic',  // Extension-created selections
  USER_INITIATED: 'user_initiated'  // User mouse/text selections
};

// Centralized Event Manager for robust event handling
class EventManager {
  constructor() {
    this.listeners = new Map();
    this.selectionState = SELECTION_STATES.IDLE;
    this.debounceTimers = new Map();
    this.eventFilters = new Map();
  }

  // Set current selection state to prevent conflicts
  setSelectionState(state) {
    console.log(`EventManager: Selection state changed from ${this.selectionState} to ${state}`);
    this.selectionState = state;

    // Auto-reset to idle after a short delay for programmatic selections
    if (state === SELECTION_STATES.PROGRAMMATIC) {
      setTimeout(() => {
        if (this.selectionState === SELECTION_STATES.PROGRAMMATIC) {
          this.setSelectionState(SELECTION_STATES.IDLE);
        }
      }, 100);
    }
  }

  // Add event listener with optional filtering
  addListener(element, eventType, handler, options = {}) {
    const key = `${eventType}-${Date.now()}`;

    const wrappedHandler = (event) => {
      // Apply event filtering based on current state
      if (options.filter && !this.shouldHandleEvent(event, options.filter)) {
        return;
      }

      // Debounce if requested
      if (options.debounce) {
        this.debounceEvent(key, () => handler(event), options.debounce);
        return;
      }

      handler(event);
    };

    element.addEventListener(eventType, wrappedHandler, options.passive ? { passive: true } : undefined);
    this.listeners.set(key, { element, eventType, wrappedHandler });

    return key; // Return key for removal
  }

  // Add delegated event listener (more efficient for dynamic content)
  addDelegatedListener(eventType, selector, handler, options = {}) {
    const key = `delegated-${eventType}-${selector}-${Date.now()}`;

    const wrappedHandler = (event) => {
      const target = event.target.closest(selector);
      if (!target) return;

      // Apply event filtering
      if (options.filter && !this.shouldHandleEvent(event, options.filter)) {
        return;
      }

      // Debounce if requested
      if (options.debounce) {
        this.debounceEvent(key, () => handler(event, target), options.debounce);
        return;
      }

      handler(event, target);
    };

    document.addEventListener(eventType, wrappedHandler, options.passive ? { passive: true } : undefined);
    this.listeners.set(key, { element: document, eventType, wrappedHandler, delegated: true, selector });

    return key;
  }

  // Determine if event should be handled based on current state
  shouldHandleEvent(event, filter) {
    if (!filter) return true;

    switch (filter) {
      case 'ignoreProgrammaticSelections':
        return this.selectionState !== SELECTION_STATES.PROGRAMMATIC;
      case 'onlyUserSelections':
        return this.selectionState === SELECTION_STATES.USER_INITIATED;
      case 'ignoreDuringGestures':
        return !this.isGestureInProgress();
      default:
        return true;
    }
  }

  // Check if any gesture is currently in progress
  isGestureInProgress() {
    // Could be extended to track various gesture states
    return false; // For now, always allow
  }

  // Debounce event handling
  debounceEvent(key, callback, delay = 100) {
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key));
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      callback();
    }, delay);

    this.debounceTimers.set(key, timer);
  }

  // Remove specific listener
  removeListener(key) {
    const listener = this.listeners.get(key);
    if (listener) {
      listener.element.removeEventListener(listener.eventType, listener.wrappedHandler);
      this.listeners.delete(key);

      // Clear any pending debounce timer
      if (this.debounceTimers.has(key)) {
        clearTimeout(this.debounceTimers.get(key));
        this.debounceTimers.delete(key);
      }
    }
  }

  // Remove all listeners (cleanup)
  destroy() {
    for (const [key, listener] of this.listeners) {
      listener.element.removeEventListener(listener.eventType, listener.wrappedHandler);
    }
    this.listeners.clear();

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}

// Global event manager instance
const eventManager = new EventManager();

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
let singleClickGroupId = '';
let tripleClickGroupId = '';
let hideGroupNames = false;
let isDarkMode = false;

// Initialize extension asynchronously to ensure settings are loaded before listeners
async function init() {
  await loadSettings();
  await loadQueryGroups();
  await ensureDefaultQueryGroup();

  // Initialize listeners after settings are loaded
  if (document.readyState === 'loading') {
    eventManager.addListener(document, 'DOMContentLoaded', initializeListeners);
  } else {
    initializeListeners();
  }
}

// Start initialization
init();

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

// Listen for text selection using EventManager
eventManager.addListener(document, 'selectionchange', handleSelectionChange);
eventManager.addListener(document, 'keyup', handleSelectionChange);

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
    const result = await chrome.storage.local.get(['iconPlacement', 'iconOffset', 'iconSpacing', 'rightSwipeGroup', 'singleClickGroup', 'tripleClickGroup', 'hideGroupNames', 'darkMode']);
    iconPlacement = result.iconPlacement || 'word';
    iconOffset = result.iconOffset || 50;
    iconSpacing = result.iconSpacing || 10;
    rightSwipeGroupId = result.rightSwipeGroup || '';
    singleClickGroupId = result.singleClickGroup || '';
    tripleClickGroupId = result.tripleClickGroup || '';
    hideGroupNames = result.hideGroupNames || false;
    isDarkMode = result.darkMode || false;
    console.log('Loaded icon settings:', { iconPlacement, iconOffset, iconSpacing, rightSwipeGroupId, singleClickGroupId, tripleClickGroupId, hideGroupNames, isDarkMode });
  } catch (error) {
    console.error('Error loading settings:', error);
    iconPlacement = 'word';
    iconOffset = 50;
    iconSpacing = 10;
    rightSwipeGroupId = '';
    tripleClickGroupId = '';
    hideGroupNames = false;
    isDarkMode = false;
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

// Listen for dark mode changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.darkMode) {
    isDarkMode = changes.darkMode.newValue || false;
    console.log('Dark mode updated:', isDarkMode);
  }
});

// Show multiple lookup icons near the selection
function showLookupIcons(selection) {
  // Hide existing icons
  hideLookupIcons();

  // Filter enabled groups
  const enabledGroups = queryGroups.filter(group => group.enabled);
  console.log('Enabled query groups:', enabledGroups.length);
  if (enabledGroups.length === 0) return;

  // Position calculation
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const baseTop = rect.top + window.scrollY - 5;

  enabledGroups.forEach((group, index) => {
    // console.log(`Creating icon for group: ${group.name} (${group.icon})`);
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

    // Mark as interactive to prevent single-click delegation
    icon.classList.add('lookup-icon');

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

    // Add event listeners using EventManager
    eventManager.addListener(icon, 'click', (e) => handleIconClick(e, group));
    eventManager.addListener(icon, 'mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    document.body.appendChild(icon);
    lookupIcons.push(icon);
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
    // Choose text based on group's textSelectionMethod
    const textSelectionMethod = group.textSelectionMethod || 'selectedText';
    console.log(`Using text selection method: ${textSelectionMethod}`);
    console.log(currentSelection);
    const word = currentSelection[textSelectionMethod] || currentSelection.selectedText || '';
    console.log(`Sending Text: ${word}`);

    // Show result window immediately with spinner and initial word
    const locationInfo = showResult(null, group, null, word);
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

// Setup single-click delegation for result content (generic)
function setupSingleClickDelegation(resultDiv) {
  if (!singleClickGroupId) return;

  // Determine the correct content selector based on result type
  const contentSelector = resultDiv.classList.contains('popupResultDiv') ? '.popupResultContent *' :
                         resultDiv.classList.contains('inlineResultDiv') ? '.inlineResultContent *' :
                         '.bottomResultContent *';

  eventManager.addDelegatedListener('mousedown', contentSelector, (event, targetElement) => {
    if (!targetElement || !targetElement.textContent.trim()) return;

    // Don't trigger on interactive elements
    if (targetElement.tagName === 'BUTTON' ||
        targetElement.tagName === 'INPUT' ||
        targetElement.tagName === 'TEXTAREA' ||
        targetElement.tagName === 'SELECT' ||
        targetElement.tagName === 'A' ||
        targetElement.closest('button, input, textarea, select, a') ||
        targetElement.classList.contains('lookup-icon') ||
        targetElement.closest('.resultHeader')) {
      return;
    }

    // Store click data on the result div for mouseup to access
    resultDiv._clickStartTime = Date.now();
    resultDiv._clickStartX = event.clientX;
    resultDiv._clickStartY = event.clientY;
    resultDiv._clickTargetElement = targetElement;
  });

  const contentClass = resultDiv.classList.contains('popupResultDiv') ? '.popupResultContent' :
                      resultDiv.classList.contains('inlineResultDiv') ? '.inlineResultContent' :
                      '.bottomResultContent';

  eventManager.addDelegatedListener('mouseup', contentClass, (event) => {
    if (!resultDiv._clickStartTime || !resultDiv._clickTargetElement) return;

    const clickDuration = Date.now() - resultDiv._clickStartTime;
    const clickDistance = Math.sqrt(
      Math.pow(event.clientX - resultDiv._clickStartX, 2) +
      Math.pow(event.clientY - resultDiv._clickStartY, 2)
    );

    if (clickDuration < 250 && clickDistance < 5) {
      executeSingleClickQuery(resultDiv._clickTargetElement, event);
    }

    // Reset tracking
    resultDiv._clickStartTime = 0;
    resultDiv._clickStartX = 0;
    resultDiv._clickStartY = 0;
    resultDiv._clickTargetElement = null;
  });
}

// Create shared result div for all display types
function createResultDiv(type, group, boxId, initialWord = '') {
  let resultDiv;
  let divsArray;
  let classPrefix;
  let positionCallback;

  switch (type) {
    case 'popup':
      divsArray = resultDivs;
      classPrefix = 'popupResult';
      positionCallback = () => {
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
      };
      break;
    case 'inline':
      divsArray = inlineDivs;
      classPrefix = 'inlineResult';
      positionCallback = () => {
        // Find the parent text block of the selected text
        const selection = window.getSelection();
        if (selection.rangeCount === 0) {
          // Fallback to popup if no selection found
          return;
        }

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
          return;
        }

        // Insert after the parent element
        parentElement.parentNode.insertBefore(resultDiv, parentElement.nextSibling);
      };
      break;
    case 'bottom':
      divsArray = bottomDivs;
      classPrefix = 'bottomResult';
      positionCallback = () => {
        // Already positioned fixed
      };
      break;
    default:
      throw new Error(`Unknown result type: ${type}`);
  }

  resultDiv = divsArray.find(div => div.dataset.boxId == boxId);

  if (!resultDiv) {
    resultDiv = document.createElement('div');
    resultDiv.dataset.boxId = boxId;
    resultDiv.dataset.groupId = group.id;
    resultDiv.classList.add(`${classPrefix}Div`);
    resultDiv.style.setProperty('display', 'flex', 'important');
    resultDiv.style.setProperty('flex-direction', 'column', 'important');
    resultDiv.style.setProperty('box-sizing', 'border-box', 'important');
    resultDiv.style.setProperty('font-size', '14px', 'important');
    resultDiv.style.setProperty('z-index', type === 'bottom' ? '999998' : '999999', 'important');

    // Type-specific base styles
    if (type === 'popup') {
      resultDiv.style.setProperty('position', 'absolute', 'important');
      resultDiv.style.setProperty('border-radius', '4px', 'important');
      resultDiv.style.setProperty('padding', '10px', 'important');
      resultDiv.style.setProperty('width', '300px', 'important');
      resultDiv.style.setProperty('height', '100px', 'important');
    } else if (type === 'inline') {
      resultDiv.style.setProperty('position', 'relative', 'important');
      resultDiv.style.setProperty('margin-top', '10px', 'important');
      resultDiv.style.setProperty('padding', '10px', 'important');
      resultDiv.style.setProperty('border-radius', '4px', 'important');
      resultDiv.style.setProperty('min-height', '35px', 'important');
    } else if (type === 'bottom') {
      resultDiv.style.setProperty('position', 'fixed', 'important');
      resultDiv.style.setProperty('bottom', '0', 'important');
      resultDiv.style.setProperty('left', '0', 'important');
      resultDiv.style.setProperty('width', '100%', 'important');
      resultDiv.style.setProperty('height', '30%', 'important');
      resultDiv.style.setProperty('border-top', '1px solid #ccc', 'important');
      resultDiv.style.setProperty('padding', '10px', 'important');
      resultDiv.style.setProperty('overflow-y', 'visible', 'important');
    }

    // Apply dark mode
    if (isDarkMode) {
      resultDiv.style.setProperty('background-color', '#2d2d2d', 'important');
      resultDiv.style.setProperty('color', '#ffffff', 'important');
      resultDiv.style.setProperty('border', '1px solid #555', 'important');
      resultDiv.style.setProperty('box-shadow', type === 'popup' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none', 'important');
    } else {
      resultDiv.style.setProperty('background-color', 'white', 'important');
      resultDiv.style.setProperty('color', 'black', 'important');
      resultDiv.style.setProperty('border', '1px solid #ccc', 'important');
      resultDiv.style.setProperty('box-shadow', type === 'popup' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none', 'important');
    }

    // Create header div for close button and search field
    const headerDiv = document.createElement('div');
    headerDiv.className = `${classPrefix}Header`;
    headerDiv.style.setProperty('position', 'relative', 'important');
    headerDiv.style.setProperty('flex-shrink', '0', 'important');
    headerDiv.style.setProperty('padding', '5px 10px', 'important');

    // Create content div for scrollable content
    const contentDiv = document.createElement('div');
    contentDiv.className = `${classPrefix}Content`;
    contentDiv.style.setProperty('flex', '1', 'important');
    contentDiv.style.setProperty('overflow-y', 'auto', 'important');
    contentDiv.style.setProperty('padding', '5px 10px', 'important');

    // Set main div to flexbox
    resultDiv.style.setProperty('display', 'flex', 'important');
    resultDiv.style.setProperty('flex-direction', 'column', 'important');

    // Add close button to header
    const closeBtn = createCloseButton(resultDiv, '5px', type === 'bottom' ? '15px' : '5px');
    headerDiv.appendChild(closeBtn);

    // Add search field if enabled
    if (group.showSearchField && group.showSearchField !== 'none') {
      const searchContainer = createSearchField(group, resultDiv, boxId, initialWord);
      headerDiv.appendChild(searchContainer);
    }

    // Assemble the structure
    resultDiv.appendChild(headerDiv);
    resultDiv.appendChild(contentDiv);

    // Position and append
    if (type === 'popup' || type === 'bottom') {
      document.body.appendChild(resultDiv);
    } // Inline will be inserted later

    divsArray.push(resultDiv);

    // Setup single-click delegation
    setupSingleClickDelegation(resultDiv);

    // Position if needed
    if (positionCallback) {
      positionCallback();
    }
  }

  return resultDiv;
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



// Show the result in a popup div (using shared createResultDiv)
function showPopupResult(definition, group, boxId, initialWord = '') {
  let resultDiv = createResultDiv('popup', group, boxId, initialWord);

  // Get popup settings
  const popupSettings = group.popupSettings || { width: '40%', height: '30%', hideOnClickOutside: false };

  // Update width and height from popup settings
  resultDiv.style.setProperty('width', popupSettings.width, 'important');
  resultDiv.style.setProperty('height', popupSettings.height, 'important');

  // Get content div
  const contentDiv = resultDiv.querySelector('.popupResultContent');
  if (!contentDiv) return;

  // Clear content and show spinner or result
  contentDiv.innerHTML = '';

  if (!definition) {
    // Show spinner
    const spinner = createSpinner(`Loading ${group.name}...`);
    contentDiv.appendChild(spinner);
  } else {
    // Show result
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
  }

  // Store hide on click outside setting for later use
  resultDiv.dataset.hideOnClickOutside = popupSettings.hideOnClickOutside;

  resultDiv.style.setProperty('display', 'flex', 'important');
}

// Show the result based on group's display method
function showResult(definition, group, locationInfo, initialWord = '') {
  const displayMethod = locationInfo ? locationInfo.displayMethod : group.displayMethod || 'popup';
  const boxId = locationInfo ? locationInfo.boxId : ++boxIdCounter;

  if (displayMethod === 'inline') {
    showInlineResult(definition, group, boxId, initialWord);
  } else if (displayMethod === 'bottom') {
    showBottomResult(definition, group, boxId, initialWord);
  } else {
    // Default to popup
    showPopupResult(definition, group, boxId, initialWord);
  }

  // Return location info for the caller
  return { boxId, displayMethod };
}



// Show the result inline below the selected text (using shared createResultDiv)
function showInlineResult(definition, group, boxId, initialWord = '') {
  let inlineDiv = createResultDiv('inline', group, boxId, initialWord);

  // Check if flexible height is enabled
  const flexibleHeight = group.inlineSettings?.flexibleHeight !== false;

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

  // Get content div
  const contentDiv = inlineDiv.querySelector('.inlineResultContent');
  if (!contentDiv) return;

  // Clear content and show spinner or result
  contentDiv.innerHTML = '';

  if (!definition) {
    // Show spinner
    const spinner = createSpinner(`Loading ${group.name}...`);
    contentDiv.appendChild(spinner);
  } else {
    // Show result
    // Apply flexible height settings to content div
    if (flexibleHeight) {
      contentDiv.style.setProperty('max-height', 'none', 'important');
    } else {
      contentDiv.style.setProperty('max-height', '180px', 'important'); // Account for header
    }

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
  }

  inlineDiv.style.setProperty('display', 'flex', 'important');
}

// Show the result in a bottom panel (using shared createResultDiv)
function showBottomResult(definition, group, boxId, initialWord = '') {
  let bottomDiv = createResultDiv('bottom', group, boxId, initialWord);

  // Get content div
  const contentDiv = bottomDiv.querySelector('.bottomResultContent');
  if (!contentDiv) return;

  // Clear content and show spinner or result
  contentDiv.innerHTML = '';

  if (!definition) {
    // Show spinner
    const spinner = createSpinner(`Loading ${group.name}...`);
    contentDiv.appendChild(spinner);
  } else {
    // Show result
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
  }

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

// Create search field container for result windows
function createSearchField(group, resultDiv, boxId, initialWord = '') {
  const searchContainer = document.createElement('div');
  searchContainer.style.setProperty('display', 'flex', 'important');
  searchContainer.style.setProperty('align-items', 'center', 'important');
  searchContainer.style.setProperty('gap', '5px', 'important');
  searchContainer.style.setProperty('margin-right', '25px', 'important'); // Leave space for close button
  searchContainer.style.setProperty('flex', '1', 'important');

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search...';
  searchInput.value = initialWord; // Set initial word
  searchInput.style.setProperty('flex', '1', 'important');
  searchInput.style.setProperty('padding', '2px 5px', 'important');
  searchInput.style.setProperty('border', '1px solid #ccc', 'important');
  searchInput.style.setProperty('border-radius', '3px', 'important');
  searchInput.style.setProperty('font-size', '12px', 'important');
  searchInput.style.setProperty('min-width', '0', 'important');

  // Apply dark mode to input
  chrome.storage.local.get(['darkMode'], (result) => {
    const isDarkMode = result.darkMode || false;
    if (isDarkMode) {
      searchInput.style.setProperty('background-color', '#1e1e1e', 'important');
      searchInput.style.setProperty('color', '#ffffff', 'important');
      searchInput.style.setProperty('border-color', '#555', 'important');
    }
  });

  searchContainer.appendChild(searchInput);

  // Add search button if "on pressing enter" mode
  if (group.showSearchField === 'onPressingEnter') {
    const searchButton = document.createElement('button');
    searchButton.innerHTML = '🔍';
    searchButton.style.setProperty('padding', '2px 6px', 'important');
    searchButton.style.setProperty('border', '1px solid #ccc', 'important');
    searchButton.style.setProperty('border-radius', '3px', 'important');
    searchButton.style.setProperty('background', 'white', 'important');
    searchButton.style.setProperty('cursor', 'pointer', 'important');
    searchButton.style.setProperty('font-size', '12px', 'important');

    // Apply dark mode to button
    chrome.storage.local.get(['darkMode'], (result) => {
      const isDarkMode = result.darkMode || false;
      if (isDarkMode) {
        searchButton.style.setProperty('background-color', '#2d2d2d', 'important');
        searchButton.style.setProperty('color', '#ffffff', 'important');
        searchButton.style.setProperty('border-color', '#555', 'important');
      }
    });

    searchButton.onclick = () => performSearch(searchInput.value.trim(), group, resultDiv, boxId);
    searchContainer.appendChild(searchButton);

    // Handle Enter key using EventManager
    eventManager.addListener(searchInput, 'keydown', (e) => {
      if (e.key === 'Enter') {
        performSearch(searchInput.value.trim(), group, resultDiv, boxId);
      }
    });
  }

  // Check if suggestions should be enabled (only for offline groups with displaySuggestions > 0)
  const suggestionsEnabled = group.queryType === 'offline' && (group.displaySuggestions || 20) > 0;

  if (group.showSearchField === 'liveResults') {
    // Live results - add debounced input handler using EventManager
    eventManager.addListener(searchInput, 'input', () => {
      // Use the EventManager's debounce functionality
      eventManager.debounceEvent(`search-${boxId}`, async () => {
        const query = searchInput.value.trim();
        performSearch(query, group, resultDiv, boxId);

        // Get suggestions if enabled and query is not empty
        if (suggestionsEnabled && query.length > 0) {
          try {
            console.log('CONTENT: Requesting suggestions for word:', query, 'dictionaries:', group.settings?.selectedDictionaries);
            const response = await chrome.runtime.sendMessage({
              action: 'getSuggestions',
              word: query,
              maxResults: group.displaySuggestions || 20,
              selectedDictionaries: group.settings?.selectedDictionaries || []
            });
            console.log('CONTENT: Received suggestions response:', response);

            if (response.suggestions && response.suggestions.length > 0) {
              console.log('CONTENT: Showing suggestions:', response.suggestions);
              showSuggestions(response.suggestions, searchInput, resultDiv, group, boxId);
            } else {
              console.log('CONTENT: No suggestions to show, hiding dropdown');
              hideSuggestions(resultDiv);
            }
          } catch (error) {
            console.error('CONTENT: Error getting suggestions:', error);
            hideSuggestions(resultDiv);
          }
        } else if (suggestionsEnabled) {
          console.log('CONTENT: Query is empty, hiding suggestions');
          hideSuggestions(resultDiv);
        }
      }, 300); // 0.3 second delay for faster suggestions
    });

    // Show suggestions when input gains focus or is clicked (if it has content)
    if (suggestionsEnabled) {
      const showSuggestionsIfContent = async () => {
        const query = searchInput.value.trim();
        if (query.length > 0) {
          try {
            console.log('CONTENT: Requesting suggestions on focus/click for word:', query, 'dictionaries:', group.settings?.selectedDictionaries);
            const response = await chrome.runtime.sendMessage({
              action: 'getSuggestions',
              word: query,
              maxResults: group.displaySuggestions || 20,
              selectedDictionaries: group.settings?.selectedDictionaries || []
            });
            console.log('CONTENT: Received suggestions response on focus/click:', response);

            if (response.suggestions && response.suggestions.length > 0) {
              console.log('CONTENT: Showing suggestions on focus/click:', response.suggestions);
              showSuggestions(response.suggestions, searchInput, resultDiv, group, boxId);
            } else {
              console.log('CONTENT: No suggestions to show on focus/click, hiding dropdown');
              hideSuggestions(resultDiv);
            }
          } catch (error) {
            console.error('CONTENT: Error getting suggestions on focus/click:', error);
            hideSuggestions(resultDiv);
          }
        }
      };

      eventManager.addListener(searchInput, 'focus', showSuggestionsIfContent);
      eventManager.addListener(searchInput, 'click', showSuggestionsIfContent);

      // Hide suggestions when input loses focus
      eventManager.addListener(searchInput, 'blur', () => {
        // Delay hiding to allow clicking on suggestions
        setTimeout(() => hideSuggestions(resultDiv), 150);
      });
    }
  } else if (suggestionsEnabled) {
    // Show suggestions for onPressingEnter mode, but don't auto-search
    eventManager.addListener(searchInput, 'input', () => {
      // Use the EventManager's debounce functionality
      eventManager.debounceEvent(`suggestions-${boxId}`, async () => {
        const query = searchInput.value.trim();

        // Only get suggestions, don't perform search
        if (query.length > 0) {
          try {
            console.log('CONTENT: Requesting suggestions for word:', query, 'dictionaries:', group.settings?.selectedDictionaries);
            const response = await chrome.runtime.sendMessage({
              action: 'getSuggestions',
              word: query,
              maxResults: group.displaySuggestions || 20,
              selectedDictionaries: group.settings?.selectedDictionaries || []
            });
            console.log('CONTENT: Received suggestions response:', response);

            if (response.suggestions && response.suggestions.length > 0) {
              console.log('CONTENT: Showing suggestions:', response.suggestions);
              showSuggestions(response.suggestions, searchInput, resultDiv, group, boxId);
            } else {
              console.log('CONTENT: No suggestions to show, hiding dropdown');
              hideSuggestions(resultDiv);
            }
          } catch (error) {
            console.error('CONTENT: Error getting suggestions:', error);
            hideSuggestions(resultDiv);
          }
        } else {
          console.log('CONTENT: Query is empty, hiding suggestions');
          hideSuggestions(resultDiv);
        }
      }, 300); // 0.3 second delay for suggestions only
    });

    // Show suggestions when input gains focus or is clicked (if it has content)
    const showSuggestionsIfContent = async () => {
      const query = searchInput.value.trim();
      if (query.length > 0) {
        try {
          console.log('CONTENT: Requesting suggestions on focus/click for word:', query, 'dictionaries:', group.settings?.selectedDictionaries);
          const response = await chrome.runtime.sendMessage({
            action: 'getSuggestions',
            word: query,
            maxResults: group.displaySuggestions || 20,
            selectedDictionaries: group.settings?.selectedDictionaries || []
          });
          console.log('CONTENT: Received suggestions response on focus/click:', response);

          if (response.suggestions && response.suggestions.length > 0) {
            console.log('CONTENT: Showing suggestions on focus/click:', response.suggestions);
            showSuggestions(response.suggestions, searchInput, resultDiv, group, boxId);
          } else {
            console.log('CONTENT: No suggestions to show on focus/click, hiding dropdown');
            hideSuggestions(resultDiv);
          }
        } catch (error) {
          console.error('CONTENT: Error getting suggestions on focus/click:', error);
          hideSuggestions(resultDiv);
        }
      }
    };

    eventManager.addListener(searchInput, 'focus', showSuggestionsIfContent);
    eventManager.addListener(searchInput, 'click', showSuggestionsIfContent);

    // Hide suggestions when input loses focus
    eventManager.addListener(searchInput, 'blur', () => {
      // Delay hiding to allow clicking on suggestions
      setTimeout(() => hideSuggestions(resultDiv), 150);
    });
  }

  return searchContainer;
}

// Show suggestions dropdown below search input
function showSuggestions(suggestions, searchInput, resultDiv, group, boxId) {
  // Remove existing suggestions
  hideSuggestions(resultDiv);

  // Get dark mode setting once for the entire function
  chrome.storage.local.get(['darkMode'], (result) => {
    const isDarkMode = result.darkMode || false;

    // Create suggestions container
    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.className = 'search-suggestions';
    suggestionsDiv.style.setProperty('position', 'absolute', 'important');
    suggestionsDiv.style.setProperty('top', '100%', 'important');
    suggestionsDiv.style.setProperty('left', '0', 'important');
    suggestionsDiv.style.setProperty('right', '0', 'important');
    suggestionsDiv.style.setProperty('max-height', '200px', 'important');
    suggestionsDiv.style.setProperty('overflow-y', 'auto', 'important');
    suggestionsDiv.style.setProperty('border', '1px solid #ccc', 'important');
    suggestionsDiv.style.setProperty('border-top', 'none', 'important');
    suggestionsDiv.style.setProperty('border-radius', '0 0 3px 3px', 'important');
    suggestionsDiv.style.setProperty('z-index', '1000000', 'important');
    suggestionsDiv.style.setProperty('background', 'white', 'important');

    // Apply dark mode
    if (isDarkMode) {
      suggestionsDiv.style.setProperty('background-color', '#1e1e1e', 'important');
      suggestionsDiv.style.setProperty('border-color', '#555', 'important');
      suggestionsDiv.style.setProperty('color', '#ffffff', 'important');
    }

    // Add suggestions
    suggestions.forEach(suggestion => {
      const suggestionItem = document.createElement('div');
      suggestionItem.textContent = suggestion;
      suggestionItem.style.setProperty('padding', '4px 8px', 'important');
      suggestionItem.style.setProperty('cursor', 'pointer', 'important');
      suggestionItem.style.setProperty('border-bottom', '1px solid #eee', 'important');

      // Apply dark mode to items
      if (isDarkMode) {
        suggestionItem.style.setProperty('border-bottom-color', '#333', 'important');
      }

      eventManager.addListener(suggestionItem, 'mouseenter', () => {
        const bgColor = isDarkMode ? '#333' : '#f0f0f0';
        suggestionItem.style.setProperty('background-color', bgColor, 'important');
      });

      eventManager.addListener(suggestionItem, 'mouseleave', () => {
        suggestionItem.style.setProperty('background-color', 'transparent', 'important');
      });

      eventManager.addListener(suggestionItem, 'click', () => {
        searchInput.value = suggestion;
        searchInput.focus();
        hideSuggestions(resultDiv);
        // Trigger search directly without dispatching input event to avoid showing suggestions again
        performSearch(suggestion, group, resultDiv, boxId);
      });

      suggestionsDiv.appendChild(suggestionItem);
    });

    // Find the search container and append suggestions
    const searchContainer = searchInput.parentElement;
    searchContainer.style.setProperty('position', 'relative', 'important');
    searchContainer.appendChild(suggestionsDiv);
  });
}

// Hide suggestions dropdown
function hideSuggestions(resultDiv) {
  const suggestionsDiv = resultDiv.querySelector('.search-suggestions');
  if (suggestionsDiv) {
    suggestionsDiv.remove();
  }
}

// Perform search with the given query
function performSearch(query, group, resultDiv, boxId) {
  if (!query) return;

  // Get content div
  const contentDiv = resultDiv.querySelector('.popupResultContent') ||
                     resultDiv.querySelector('.inlineResultContent') ||
                     resultDiv.querySelector('.bottomResultContent');
  if (!contentDiv) return;

  // Show spinner
  contentDiv.innerHTML = '';
  const spinner = createSpinner(`Searching ${group.name}...`);
  contentDiv.appendChild(spinner);

  // Perform lookup
  lookupWord(query, group, { boxId, displayMethod: group.displayMethod || 'popup' });
}

// Create spinner element for loading states
function createSpinner(groupName = 'Loading...') {
  const spinnerContainer = document.createElement('div');
  spinnerContainer.style.setProperty('display', 'flex', 'important');
  spinnerContainer.style.setProperty('align-items', 'center', 'important');
  spinnerContainer.style.setProperty('justify-content', 'center', 'important');
  spinnerContainer.style.setProperty('min-height', '50px', 'important');

  const spinner = document.createElement('div');
  spinner.style.setProperty('border', '4px solid #f3f3f3', 'important');
  spinner.style.setProperty('border-top', '4px solid #3498db', 'important');
  spinner.style.setProperty('border-radius', '50%', 'important');
  spinner.style.setProperty('width', '20px', 'important');
  spinner.style.setProperty('height', '20px', 'important');
  spinner.style.setProperty('animation', 'spin 2s linear infinite', 'important');

  const text = document.createElement('span');
  text.textContent = groupName;
  text.style.setProperty('margin-left', '10px', 'important');

  const style = document.createElement('style');
  style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';

  spinnerContainer.appendChild(spinner);
  spinnerContainer.appendChild(text);
  spinnerContainer.appendChild(style);

  return spinnerContainer;
}

// Touch gesture handling for swipe detection
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let isTrackingSwipe = false;

// Add touch event listeners to paragraphs for swipe gestures using EventManager
function addSwipeListeners() {
  // Use event delegation for better performance and centralized management
  eventManager.addDelegatedListener('touchstart', 'p, div', handleTouchStart, { passive: false });
  eventManager.addDelegatedListener('touchend', 'p, div', handleTouchEnd, { passive: false });
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

  // Create a selection on the element for proper popup positioning
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);

  // Create a temporary selection object for the paragraph
  const paragraphText = element.textContent.trim();
  const tempSelection = {
    selectedText: paragraphText,
    wholeWord: paragraphText,
    wholeParagraph: paragraphText
  };

  // Show result window immediately with spinner
  const locationInfo = showResult(null, selectedGroup);

  // Choose text based on group's textSelectionMethod (default to wholeParagraph for swipe)
  const textSelectionMethod = selectedGroup.textSelectionMethod || 'wholeParagraph';
  const word = tempSelection[textSelectionMethod] || tempSelection.selectedText || '';

  console.log(`Swipe query text: ${word}`);
  lookupWord(word, selectedGroup, locationInfo);
}

// Helper function to determine if element should be excluded from gesture detection
function shouldExcludeFromGestures(element) {
  // Exclude interactive form elements
  if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(element.tagName)) {
    return true;
  }

  // Exclude elements with interactive roles
  if (element.getAttribute('role') === 'button' ||
      element.getAttribute('role') === 'link' ||
      element.getAttribute('role') === 'menuitem') {
    return true;
  }

  // Exclude extension UI elements
  if (element.classList.contains('lookup-icon') ||
      element.closest('.lookup-icon')) {
    return true;
  }

  // Exclude popup headers and controls
  if (element.closest('.popupResultHeader, .inlineResultHeader, .bottomResultHeader')) {
    return true;
  }

  // Exclude close buttons
  if (element.classList.contains('close-button') ||
      element.closest('.close-button')) {
    return true;
  }

  // Allow text content within popups (for single-click on results)
  const isInPopup = element.closest('[data-box-id]');
  if (isInPopup) {
    // Allow clicks on text content within popup results, but not on controls
    return false;
  }

  return false;
}

// User selection guard to prevent race conditions
let isUserSelecting = false;

// Mouse gesture handling for single and triple click detection
let clickBuffer = []; // Store recent clicks for sequence detection
const TRIPLE_CLICK_WINDOW = 200; // 200ms window for triple-click detection

// Add click listeners with user selection guard and immediate detection
function addClickListeners() {
  // User selection guard - disable gestures during manual selection
  eventManager.addListener(document, 'mousedown', (event) => {
    // Check if this is a manual selection start
    const target = event.target;
    if (!shouldExcludeFromGestures(target)) {
      isUserSelecting = true;
      // Re-enable after 1 second
      setTimeout(() => {
        isUserSelecting = false;
      }, 1000);
    }
  });

  eventManager.addListener(document, 'selectionchange', () => {
    // If user has an active selection, guard against gestures
    if (window.getSelection().toString().trim()) {
      isUserSelecting = true;
      setTimeout(() => {
        isUserSelecting = false;
      }, 1000);
    }
  });

  // Immediate click detection using mousedown/mouseup
  eventManager.addDelegatedListener('mousedown', 'p, div', handleMouseDown, {
    filter: 'ignoreProgrammaticSelections'
  });

  eventManager.addDelegatedListener('mouseup', 'p, div', handleMouseUp, {
    filter: 'ignoreProgrammaticSelections'
  });
}

function handleMouseDown(event) {
  if (isUserSelecting) return; // Guard against manual selection

  const targetElement = event.target.closest('p, div');
  if (!targetElement || !targetElement.textContent.trim()) return;

  // Check if element should be excluded from gestures
  if (shouldExcludeFromGestures(event.target)) {
    return;
  }

  const now = Date.now();

  // Clean old clicks from buffer (older than triple-click window)
  clickBuffer = clickBuffer.filter(click => now - click.time < TRIPLE_CLICK_WINDOW);

  // Add this click to buffer
  clickBuffer.push({
    time: now,
    target: targetElement,
    event: event
  });

  console.log(`Mouse down detected, click buffer size: ${clickBuffer.length}`);
}

function handleMouseUp(event) {
  if (isUserSelecting) return; // Guard against manual selection

  // Skip gesture if user has an active selection (they were manually selecting text)
  if (window.getSelection().toString().trim()) {
    console.log('Skipping gesture - user has active selection');
    return;
  }

  // Check if element should be excluded from gestures
  if (shouldExcludeFromGestures(event.target)) {
    return;
  }

  const now = Date.now();
  const targetElement = event.target.closest('p, div');
  if (!targetElement) return;

  // Find recent clicks on the same element within the triple-click window
  const recentClicks = clickBuffer.filter(click =>
    now - click.time < TRIPLE_CLICK_WINDOW &&
    click.target === targetElement
  );

  console.log(`Mouse up detected, recent clicks: ${recentClicks.length}`);

  // Handle based on click count
  if (recentClicks.length === 3 && tripleClickGroupId) {
    // Triple click detected
    event.preventDefault();
    event.stopPropagation();
    console.log('Triple click detected');
    executeTripleClickQuery(targetElement);
    clickBuffer = []; // Clear buffer after triple click

  } else if (recentClicks.length === 1 && singleClickGroupId) {
    // Single click detected (after a short delay to allow for double/triple)
    setTimeout(() => {
      // Re-check if we still have exactly 1 click (no additional clicks occurred)
      const finalClicks = clickBuffer.filter(click =>
        Date.now() - click.time < TRIPLE_CLICK_WINDOW &&
        click.target === targetElement
      );

      if (finalClicks.length === 1) {
        console.log('Single click confirmed, executing query');
        executeSingleClickQuery(targetElement, event);
        clickBuffer = clickBuffer.filter(click => click.target !== targetElement); // Clean up
      }
    }, 250); // Short delay to detect if more clicks are coming
  }
}

function executeSingleClickQuery(element, clickEvent) {
  console.log(`Executing single click action: ${singleClickGroupId}`);

  if (singleClickGroupId === 'icons') {
    // Show lookup icons for the paragraph
    const paragraphText = element.textContent.trim();
    if (paragraphText) {
      // Create a temporary selection for the paragraph
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);

      // Update global currentSelection for consistency
      currentSelection = {
        selectedText: paragraphText,
        wholeWord: paragraphText,
        wholeParagraph: paragraphText
      };

      // Show lookup icons
      showLookupIcons(selection);
    }
  } else if (singleClickGroupId === 'selectWord') {
    // Only select word and show icons, no auto search
    let clickedWord = '';

    if (clickEvent) {
      // Get the text node and position from click coordinates
      let textNode = null;
      let clickOffset = 0;

      try {
        // Try caretRangeFromPoint first (WebKit/Safari)
        if (document.caretRangeFromPoint) {
          const range = document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);
          if (range) {
            textNode = range.startContainer;
            clickOffset = range.startOffset;
          }
        }
        // Fallback to caretPositionFromPoint (Firefox/Chrome)
        else if (document.caretPositionFromPoint) {
          const caretPosition = document.caretPositionFromPoint(clickEvent.clientX, clickEvent.clientY);
          if (caretPosition) {
            textNode = caretPosition.offsetNode;
            clickOffset = caretPosition.offset;
          }
        }
      } catch (error) {
        console.error('Error getting caret position:', error);
      }

      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const textContent = textNode.textContent;

        // Use Intl.Segmenter to segment the text
        try {
          const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
          const segments = segmenter.segment(textContent);

          // Find the segment that contains the click position
          for (const segment of segments) {
            if (segment.index <= clickOffset && clickOffset < segment.index + segment.segment.length) {
              clickedWord = segment.segment.trim();
              break;
            }
          }
        } catch (error) {
          console.error('Intl.Segmenter error:', error);
          // Fallback: use the whole paragraph
          clickedWord = element.textContent.trim();
        }
      }
    }

    // If we couldn't detect a word, use the whole paragraph
    if (!clickedWord) {
      clickedWord = element.textContent.trim();
    }

    // Create a selection for the detected word
    if (clickedWord) {
      try {
        // Try to create a selection for the clicked word
        if (document.caretRangeFromPoint) {
          const range = document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);
          if (range) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            // Set selection state to USER_INITIATED to prevent clearing
            eventManager.setSelectionState(SELECTION_STATES.USER_INITIATED);
          }
        } else if (document.caretPositionFromPoint) {
          const caretPosition = document.caretPositionFromPoint(clickEvent.clientX, clickEvent.clientY);
          if (caretPosition && caretPosition.offsetNode.nodeType === Node.TEXT_NODE) {
            const range = document.createRange();
            range.setStart(caretPosition.offsetNode, caretPosition.offset);
            range.setEnd(caretPosition.offsetNode, caretPosition.offset);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            // Set selection state to USER_INITIATED to prevent clearing
            eventManager.setSelectionState(SELECTION_STATES.USER_INITIATED);
          }
        }
      } catch (error) {
        console.error('Error creating selection for word:', error);
      }
    }

    // Update global currentSelection for consistency
    currentSelection = {
      selectedText: clickedWord,
      wholeWord: clickedWord,
      wholeParagraph: element.textContent.trim()
    };

    console.log(`Selected word: ${clickedWord}`);
    // Show lookup icons (but don't perform any automatic lookup)
    showLookupIcons(window.getSelection());
  } else {
    // Execute specific query group
    const selectedGroup = queryGroups.find(group => group.id === singleClickGroupId);
    if (!selectedGroup || !selectedGroup.enabled) return;

    console.log(`Executing single click query for group: ${selectedGroup.name}`);

    // For single click, we need to detect which word was clicked
    // Use the same logic as the word segmentation POC
    let clickedWord = '';

    if (clickEvent) {
      // Get the text node and position from click coordinates
      let textNode = null;
      let clickOffset = 0;

      try {
        // Try caretRangeFromPoint first (WebKit/Safari)
        if (document.caretRangeFromPoint) {
          const range = document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);
          if (range) {
            textNode = range.startContainer;
            clickOffset = range.startOffset;
          }
        }
        // Fallback to caretPositionFromPoint (Firefox/Chrome)
        else if (document.caretPositionFromPoint) {
          const caretPosition = document.caretPositionFromPoint(clickEvent.clientX, clickEvent.clientY);
          if (caretPosition) {
            textNode = caretPosition.offsetNode;
            clickOffset = caretPosition.offset;
          }
        }
      } catch (error) {
        console.error('Error getting caret position:', error);
      }

      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const textContent = textNode.textContent;

        // Use Intl.Segmenter to segment the text
        try {
          const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
          const segments = segmenter.segment(textContent);

          // Find the segment that contains the click position
          for (const segment of segments) {
            if (segment.index <= clickOffset && clickOffset < segment.index + segment.segment.length) {
              clickedWord = segment.segment.trim();
              break;
            }
          }
        } catch (error) {
          console.error('Intl.Segmenter error:', error);
          // Fallback: use the whole paragraph
          clickedWord = element.textContent.trim();
        }
      }
    }

    // If we couldn't detect a word, use the whole paragraph
    if (!clickedWord) {
      clickedWord = element.textContent.trim();
    }

    // Create a temporary selection object
    const tempSelection = {
      selectedText: clickedWord,
      wholeWord: clickedWord,
      wholeParagraph: element.textContent.trim()
    };

    // Update global currentSelection so it can be used consistently
    currentSelection = tempSelection;

    // Choose text based on group's textSelectionMethod (same logic as handleIconClick)
    const textSelectionMethod = selectedGroup.textSelectionMethod || 'selectedText';
    console.log(`Using text selection method: ${textSelectionMethod}`);
    console.log(currentSelection);
    const word = currentSelection[textSelectionMethod] || currentSelection.selectedText || '';
    console.log(`Single click query text: ${word}`);

    // Create a selection for the detected word to ensure proper popup positioning
    if (clickedWord && clickEvent) {
      try {
        // Try to create a selection for the clicked word
        if (document.caretRangeFromPoint) {
          const range = document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);
          if (range) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } else if (document.caretPositionFromPoint) {
          const caretPosition = document.caretPositionFromPoint(clickEvent.clientX, clickEvent.clientY);
          if (caretPosition && caretPosition.offsetNode.nodeType === Node.TEXT_NODE) {
            const range = document.createRange();
            range.setStart(caretPosition.offsetNode, caretPosition.offset);
            range.setEnd(caretPosition.offsetNode, caretPosition.offset);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      } catch (error) {
        console.error('Error creating selection for popup positioning:', error);
      }
    }

    // Show result window immediately with spinner, passing the selected word for search field
    const locationInfo = showResult(null, selectedGroup, null, word);

    lookupWord(word, selectedGroup, locationInfo);
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

  // Show result window immediately with spinner
  const locationInfo = showResult(null, selectedGroup);

  // Always use whole paragraph for triple click (as requested)
  const word = tempSelection.wholeParagraph || tempSelection.selectedText || '';

  console.log(`Triple click query text: ${word}`);
  lookupWord(word, selectedGroup, locationInfo);
}

// Add click listener for word segmentation POC using EventManager
function addWordSegmentationListener() {
    // only listen if not deactivated in the settings
  if (singleClickGroupId === '') return;
  eventManager.addListener(document, 'click', handleWordSegmentationClick, { capture: true });
}

function handleWordSegmentationClick(event) {


  // Skip if user has an active selection (they were manually selecting text)
  if (window.getSelection().toString().trim()) {
    console.log('Skipping word segmentation - user has active selection');
    return;
  }

  // Only process clicks on text content, not on interactive elements
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' ||
      event.target.tagName === 'BUTTON' || event.target.tagName === 'A' ||
      event.target.closest('button, a, input, textarea, select')) {
    return;
  }

  // Get the text node and position from click coordinates
  let textNode = null;
  let clickOffset = 0;

  try {
    // Try caretRangeFromPoint first (WebKit/Safari)
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range) {
        textNode = range.startContainer;
        clickOffset = range.startOffset;
      }
    }
    // Fallback to caretPositionFromPoint (Firefox/Chrome)
    else if (document.caretPositionFromPoint) {
      const caretPosition = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (caretPosition) {
        textNode = caretPosition.offsetNode;
        clickOffset = caretPosition.offset;
      }
    }
  } catch (error) {
    console.error('Error getting caret position:', error);
    return;
  }

  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

  const textContent = textNode.textContent;

  // Use Intl.Segmenter to segment the text
  try {
    const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
    const segments = segmenter.segment(textContent);

    // Find the segment that contains the click position
    let wordStart = -1;
    let wordEnd = -1;
    let clickedWord = '';

    for (const segment of segments) {
      if (segment.index <= clickOffset && clickOffset < segment.index + segment.segment.length) {
        clickedWord = segment.segment;
        wordStart = segment.index;
        wordEnd = segment.index + segment.segment.length;
        break;
      }
    }

    if (wordStart >= 0 && wordEnd >= 0) {
      // Create a range that selects the detected word
      const range = document.createRange();
      range.setStart(textNode, wordStart);
      range.setEnd(textNode, wordEnd);

      // Clear any existing selection and set the new one
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      console.log('Selected word (Intl.Segmenter):', clickedWord);
      console.log('Word boundaries:', wordStart, 'to', wordEnd);
    }

    if (singleClickGroupId !== 'selectWord') {
      console.log('--------direct lookup:', singleClickGroupId);

      // Find the selected query group
      const selectedGroup = queryGroups.find(group => group.id === singleClickGroupId);
      if (!selectedGroup || !selectedGroup.enabled) return;

      console.log(`Executing direct lookup for group: ${selectedGroup.name}`);

      // Create a temporary selection object for the clicked word
      const tempSelection = {
        selectedText: clickedWord,
        wholeWord: clickedWord,
        wholeParagraph: textContent
      };

      // Update global currentSelection for consistency
      currentSelection = tempSelection;

      // Choose text based on group's textSelectionMethod
      const textSelectionMethod = selectedGroup.textSelectionMethod || 'selectedText';
      const word = currentSelection[textSelectionMethod] || currentSelection.selectedText || '';

      console.log(`Direct lookup query text: ${word}`);

      // Show result window immediately with spinner, passing the selected word for search field
      const locationInfo = showResult(null, selectedGroup, null, word);

      lookupWord(word, selectedGroup, locationInfo);
    }

  } catch (error) {
    console.error('Intl.Segmenter error:', error);
  }
}

// Initialize listeners when DOM is ready
function initializeListeners() {
  addSwipeListeners();
  addClickListeners();
  addWordSegmentationListener();

  // Re-add listeners when content changes (for dynamic content)
  if (document.body) {
    const observer = new MutationObserver(() => {
      setTimeout(() => {
        addSwipeListeners();
        addClickListeners();
        addWordSegmentationListener();
      }, 100); // Small delay to avoid excessive updates
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

if (document.readyState === 'loading') {
  eventManager.addListener(document, 'DOMContentLoaded', initializeListeners);
} else {
  initializeListeners();
}

// Hide result divs when clicking elsewhere using EventManager
eventManager.addListener(document, 'click', (e) => {
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
