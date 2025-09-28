// Content script for WordClick Dictionary v2 - RxJS Implementation
// Handles text selection and displays multiple lookup icons for query groups

import { fromEvent, merge, combineLatest, Observable } from 'rxjs';
import { map, filter, debounceTime, throttleTime, switchMap, takeUntil, bufferTime, pairwise } from 'rxjs/operators';
import { settings } from './settings-store.js';

// Import CSS styles
import './content-rxjs.css';

console.log('RxJS Content script loaded successfully v03');

// Selection Event Stream
// Merges selectionchange and keyup events, filters for valid text selections
const selection$ = merge(
  fromEvent(document, 'selectionchange'),
  fromEvent(document, 'keyup')
).pipe(
  map(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    return { selection, selectedText };
  }),
  filter(({ selectedText }) => selectedText.length > 0),
  debounceTime(100)
);

// Log text selection events
selection$.subscribe(({ selectedText }) => {
  console.log('RxJS: User selected text:', selectedText);
});

// Touch Gesture Streams
// Touch start stream
const touchStart$ = fromEvent(document, 'touchstart', { passive: false }).pipe(
  filter(event => event.touches.length === 1),
  map(event => {
    const touch = event.touches[0];
    return {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      target: event.target
    };
  })
);

// Touch end stream
const touchEnd$ = fromEvent(document, 'touchend', { passive: false }).pipe(
  filter(event => event.changedTouches.length === 1),
  map(event => {
    const touch = event.changedTouches[0];
    return {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      target: event.target
    };
  })
);

// Swipe gesture stream - combines touch start/end to detect swipes
const swipe$ = touchStart$.pipe(
  switchMap(start => touchEnd$.pipe(
    takeUntil(fromEvent(document, 'touchcancel')),
    map(end => ({
      start,
      end,
      deltaX: end.x - start.x,
      deltaY: end.y - start.y,
      deltaTime: end.time - start.time
    })),
    filter(({ deltaX, deltaY, deltaTime }) =>
      deltaTime < 500 && // Max 500ms for swipe
      Math.abs(deltaX) > 50 && // Min 50px horizontal movement
      Math.abs(deltaY) < 50 // Max 50px vertical movement
    ),
    map(({ deltaX }) => deltaX > 0 ? 'right' : 'left')
  ))
);

// Log swipe gestures
swipe$.subscribe(direction => {
  console.log('RxJS: User swiped', direction);
});

// Mouse Gesture Streams
// Mouse down stream for gesture detection
const mouseDown$ = fromEvent(document, 'mousedown').pipe(
  filter(event => !['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'].includes(event.target.tagName)),
  map(event => ({
    x: event.clientX,
    y: event.clientY,
    time: Date.now(),
    target: event.target
  }))
);

// Mouse up stream for gesture detection
const mouseUp$ = fromEvent(document, 'mouseup').pipe(
  filter(event => !['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'].includes(event.target.tagName)),
  map(event => ({
    x: event.clientX,
    y: event.clientY,
    time: Date.now(),
    target: event.target
  }))
);

// Click sequence detection for single/triple clicks
// Use reactive settings to determine buffer time
const clickSequence$ = settings.select('tripleClickGroupId').pipe(
  switchMap(tripleClickGroupId => {
    const tripleClickEnabled = tripleClickGroupId && tripleClickGroupId !== '';
    const clickBufferTime = tripleClickEnabled ? 1000 : 500;
    console.log('RxJS: Click buffer time set to', clickBufferTime, 'ms (triple click enabled:', tripleClickEnabled, ')');

    return mouseDown$.pipe(
      bufferTime(clickBufferTime),
      filter(clicks => clicks.length > 0),
      map(clicks => ({
        count: clicks.length,
        target: clicks[0].target,
        time: clicks[0].time
      }))
    );
  })
);

// Log click sequences
clickSequence$.subscribe(({ count, target }) => {
  const clickType = count === 1 ? 'single' : count === 2 ? 'double' : count === 3 ? 'triple' : `${count}`;
  console.log('RxJS: User clicked on text:', clickType, 'click');
});

// Icon click stream (delegated to document for dynamic icons)
const iconClick$ = fromEvent(document, 'click').pipe(
  filter(event => event.target.classList.contains('lookup-icon') ||
                  event.target.closest('.lookup-icon')),
  map(event => ({
    icon: event.target.classList.contains('lookup-icon') ? event.target : event.target.closest('.lookup-icon'),
    originalEvent: event
  }))
);

// Document click stream for hiding results
const documentClick$ = fromEvent(document, 'click').pipe(
  filter(event => !event.target.closest('.lookup-icon') &&
                  !event.target.closest('[data-box-id]'))
);

// Chrome runtime message stream
// Note: chrome.runtime.onMessage is not directly observable, so we'll create a wrapper
const runtimeMessage$ = new Observable(subscriber => {
  const listener = (message, sender, sendResponse) => {
    subscriber.next({ message, sender, sendResponse });
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
});

// Storage change stream
const storageChange$ = new Observable(subscriber => {
  const listener = (changes, area) => {
    subscriber.next({ changes, area });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
});

// DOM ready stream
const domReady$ = fromEvent(document, 'DOMContentLoaded').pipe(
  map(() => ({ ready: true }))
);

// Export streams for later use (when adding functionality)
export {
  selection$,
  swipe$,
  clickSequence$,
  iconClick$,
  documentClick$,
  runtimeMessage$,
  storageChange$,
  domReady$
};

// ===== DISPLAY FUNCTIONALITY =====

// Global state for result windows and icons
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

// ===== RESULT WINDOW CREATION =====

// Create a shared result div for all display types
function createResultDiv(type, group, boxId, initialWord = '') {
  let resultDiv;
  let divsArray;
  let classPrefix;
  let positionCallback;

  switch (type) {
    case 'popup':
      divsArray = resultDivs;
      classPrefix = 'popup';
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

          resultDiv.style.left = left + 'px';
          resultDiv.style.top = top + 'px';
        }
      };
      break;
    case 'inline':
      divsArray = inlineDivs;
      classPrefix = 'inline';
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
      classPrefix = 'bottom';
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
    resultDiv.className = `wordclick-result wordclick-${type}`;

    // Apply dark mode class if needed
    if (isDarkMode) {
      resultDiv.classList.add('wordclick-dark');
    }

    // Type-specific base styles
    if (type === 'popup') {
      resultDiv.classList.add('wordclick-popup');
    } else if (type === 'inline') {
      resultDiv.classList.add('wordclick-inline');
    } else if (type === 'bottom') {
      resultDiv.classList.add('wordclick-bottom');
      // Apply bottom settings height if available
      if (group.bottomSettings?.height) {
        resultDiv.style.height = group.bottomSettings.height;
      }
    }

    // Create header div for close button and search field
    const headerDiv = document.createElement('div');
    headerDiv.className = 'wordclick-result-header';

    // Create content div for scrollable content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'wordclick-result-content';

    // Add close button to header
    const closeBtn = createCloseButton(resultDiv);
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

    // Position if needed
    if (positionCallback) {
      positionCallback();
    }
  }

  return resultDiv;
}

// Create close button for result div
function createCloseButton(targetDiv) {
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'X';
  closeBtn.className = 'wordclick-close-btn';
  closeBtn.onclick = (e) => {
    e.stopPropagation(); // Prevent event bubbling
    targetDiv.style.display = 'none';
  };
  return closeBtn;
}

// Create search field container for result windows
function createSearchField(group, resultDiv, boxId, initialWord = '') {
  const searchContainer = document.createElement('div');
  searchContainer.className = 'wordclick-search-container';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'wordclick-search-input';
  searchInput.placeholder = 'Search...';
  searchInput.value = initialWord; // Set initial word

  searchContainer.appendChild(searchInput);

  // Add search button if "on pressing enter" mode
  if (group.showSearchField === 'onPressingEnter') {
    const searchButton = document.createElement('button');
    searchButton.innerHTML = '🔍';
    searchButton.style.padding = '2px 6px';
    searchButton.style.border = '1px solid #ccc';
    searchButton.style.borderRadius = '3px';
    searchButton.style.background = 'white';
    searchButton.style.cursor = 'pointer';
    searchButton.style.fontSize = '12px';

    // Apply dark mode to button
    if (isDarkMode) {
      searchButton.style.backgroundColor = '#2d2d2d';
      searchButton.style.color = '#ffffff';
      searchButton.style.borderColor = '#555';
    }

    searchButton.onclick = () => performSearch(searchInput.value.trim(), group, resultDiv, boxId);
    searchContainer.appendChild(searchButton);

    // Handle Enter key
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        performSearch(searchInput.value.trim(), group, resultDiv, boxId);
      }
    });
  }

  return searchContainer;
}

// Show the result in a popup div
function showPopupResult(definition, group, boxId, initialWord = '') {
  let resultDiv = createResultDiv('popup', group, boxId, initialWord);

  // Get popup settings
  const popupSettings = group.popupSettings || { width: '40%', height: '30%', hideOnClickOutside: false };

  // Update width and height from popup settings
  resultDiv.style.width = popupSettings.width;
  resultDiv.style.height = popupSettings.height;

  // Get content div
  const contentDiv = resultDiv.querySelector('.wordclick-result-content');
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
    contentDiv.innerHTML = sanitizedHTML;
  }

  // Store hide on click outside setting for later use
  resultDiv.dataset.hideOnClickOutside = popupSettings.hideOnClickOutside;

  resultDiv.style.display = 'flex';
}

// Show the result inline below the selected text
function showInlineResult(definition, group, boxId, initialWord = '') {
  let inlineDiv = createResultDiv('inline', group, boxId, initialWord);

  // Check if flexible height is enabled
  const flexibleHeight = group.inlineSettings?.flexibleHeight !== false;

  // Apply flexible height settings
  if (flexibleHeight) {
    // Flexible height: allow content to expand, no max height
    inlineDiv.style.maxHeight = 'none';
    inlineDiv.style.overflowY = 'visible';
  } else {
    // Fixed height: show scrollbars if content is too tall
    inlineDiv.style.maxHeight = '200px';
    inlineDiv.style.overflowY = 'visible'; // Main div doesn't scroll
  }

  // Get content div
  const contentDiv = inlineDiv.querySelector('.wordclick-result-content');
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
      contentDiv.style.maxHeight = 'none';
    } else {
      contentDiv.style.maxHeight = '180px'; // Account for header
    }

    const sanitizedHTML = sanitizeDictHTML(definition);
    contentDiv.innerHTML = sanitizedHTML;
  }

  inlineDiv.style.display = 'flex';
}

// Show the result in a bottom panel
function showBottomResult(definition, group, boxId, initialWord = '') {
  let bottomDiv = createResultDiv('bottom', group, boxId, initialWord);

  // Get content div
  const contentDiv = bottomDiv.querySelector('.wordclick-result-content');
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
    contentDiv.innerHTML = sanitizedHTML;
  }

  bottomDiv.style.display = 'flex';
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

// Create spinner element for loading states
function createSpinner(groupName = 'Loading...') {
  const spinnerContainer = document.createElement('div');
  spinnerContainer.className = 'wordclick-spinner-container';

  const spinner = document.createElement('div');
  spinner.className = 'wordclick-spinner';

  const text = document.createElement('span');
  text.className = 'wordclick-spinner-text';
  text.textContent = groupName;

  spinnerContainer.appendChild(spinner);
  spinnerContainer.appendChild(text);

  return spinnerContainer;
}

// Perform search with the given query
function performSearch(query, group, resultDiv, boxId) {
  if (!query) return;

  // Get content div
  const contentDiv = resultDiv.querySelector('.wordclick-result-content');
  if (!contentDiv) return;

  // Show spinner
  contentDiv.innerHTML = '';
  const spinner = createSpinner(`Searching ${group.name}...`);
  contentDiv.appendChild(spinner);

  // Perform lookup
  lookupWord(query, group, { boxId, displayMethod: group.displayMethod || 'popup' });
}

// ===== LOOKUP ICONS FUNCTIONALITY =====

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
    // Create icon element
    const icon = document.createElement('div');
    icon.className = 'wordclick-lookup-icon';

    // Apply dark mode styling
    if (isDarkMode) {
      icon.classList.add('wordclick-dark');
    }

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
    icon.dataset.groupId = group.id;
    icon.dataset.groupIndex = index;

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

// ===== SETTINGS MANAGEMENT =====

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
    singleClickGroupId = '';
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

// ===== INITIALIZATION =====

// Initialize extension asynchronously to ensure settings are loaded before listeners
async function init() {
  await loadSettings();
  await loadQueryGroups();
  console.log('RxJS Content script initialization complete');
}

// Start initialization
init();
