// Content script for langbro Dictionary v2 - RxJS Implementation
// Handles text selection and displays multiple lookup icons for query groups

import { fromEvent, merge, combineLatest, Observable } from 'rxjs';
import { map, filter, debounceTime, throttleTime, switchMap, takeUntil, bufferTime, pairwise } from 'rxjs/operators';
import { settings } from './settings-store.js';

console.log('RxJS Content script loaded successfully v05');

// Inject CSS styles programmatically (more reliable for Firefox extensions)
function injectStyles() {
  if (document.getElementById('langbro-content-styles')) {
    return; // Already injected
  }

  const linkElement = document.createElement('link');
  linkElement.id = 'langbro-content-styles';
  linkElement.rel = 'stylesheet';
  linkElement.href = chrome.runtime.getURL('content-rxjs.css');
  document.head.appendChild(linkElement);
}

// Inject styles immediately
injectStyles();

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
                  event.target.closest('.lookup-icon') ||
                  event.target.classList.contains('langbro-lookup-icon') ||
                  event.target.closest('.langbro-lookup-icon')),
  map(event => ({
    icon: event.target.classList.contains('lookup-icon') ? event.target :
          event.target.closest('.lookup-icon') ? event.target.closest('.lookup-icon') :
          event.target.classList.contains('langbro-lookup-icon') ? event.target :
          event.target.closest('.langbro-lookup-icon'),
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

// Global state - now accessed via reactive settings store from './settings-store.js'
// Use settings.current to read values, settings.update() to write, settings.select() for observables

// ===== RESULT WINDOW CREATION =====

// Create a shared result div for all display types
function createResultDiv(type, group, boxId, initialWord = '') {
  let resultDiv;
  let divsArray;
  let classPrefix;
  let positionCallback;

  switch (type) {
    case 'popup':
      divsArray = settings.current.resultDivs;
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
      divsArray = settings.current.inlineDivs;
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
      divsArray = settings.current.bottomDivs;
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
    resultDiv.className = `langbro-result langbro-${type}`;

    // Apply dark mode class if needed
    if (settings.current.isDarkMode) {
      resultDiv.classList.add('langbro-dark');
    }

    // Type-specific base styles
    if (type === 'popup') {
      resultDiv.classList.add('langbro-popup');
    } else if (type === 'inline') {
      resultDiv.classList.add('langbro-inline');
    } else if (type === 'bottom') {
      resultDiv.classList.add('langbro-bottom');
      // Apply bottom settings height if available
      if (group.bottomSettings?.height) {
        resultDiv.style.height = group.bottomSettings.height;
      }
    }

    // Create header div for close button and search field
    const headerDiv = document.createElement('div');
    headerDiv.className = 'langbro-result-header';

    // Create content div for scrollable content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'langbro-result-content';

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
  closeBtn.className = 'langbro-close-btn';
  closeBtn.onclick = (e) => {
    e.stopPropagation(); // Prevent event bubbling
    targetDiv.style.display = 'none';
  };
  return closeBtn;
}

// Create search field container for result windows
function createSearchField(group, resultDiv, boxId, initialWord = '') {
  const searchContainer = document.createElement('div');
  searchContainer.className = 'langbro-search-container';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'langbro-search-input';
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
    if (settings.current.isDarkMode) {
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
  const contentDiv = resultDiv.querySelector('.langbro-result-content');
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
  const contentDiv = inlineDiv.querySelector('.langbro-result-content');
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
  const contentDiv = bottomDiv.querySelector('.langbro-result-content');
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
  const boxId = locationInfo ? locationInfo.boxId : settings.incrementBoxId();

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
  spinnerContainer.className = 'langbro-spinner-container';

  const spinner = document.createElement('div');
  spinner.className = 'langbro-spinner';

  const text = document.createElement('span');
  text.className = 'langbro-spinner-text';
  text.textContent = groupName;

  spinnerContainer.appendChild(spinner);
  spinnerContainer.appendChild(text);

  return spinnerContainer;
}

// Perform search with the given query
function performSearch(query, group, resultDiv, boxId) {
  if (!query) return;

  // Get content div
  const contentDiv = resultDiv.querySelector('.langbro-result-content');
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
  const enabledGroups = settings.current.queryGroups.filter(group => group.enabled);
  console.log('Enabled query groups:', enabledGroups.length);
  if (enabledGroups.length === 0) return;

  // Position calculation
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const baseTop = rect.top + window.scrollY - 5;

  enabledGroups.forEach((group, index) => {
    // Create icon element
    const icon = document.createElement('div');
    icon.className = 'langbro-lookup-icon';

    // Apply dark mode styling
    if (settings.current.isDarkMode) {
      icon.classList.add('langbro-dark');
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
    let left, top = baseTop + settings.current.iconOffset;

if (settings.current.iconPlacement === 'right') {
  // Position on right side of screen, from right to left
  left = window.innerWidth + window.scrollX - 30 - 5 - (index * settings.current.iconSpacing);
  top = baseTop + settings.current.iconOffset;
} else if (settings.current.iconPlacement === 'left') {
  // Position on left side of screen, from left to right
  left = window.scrollX + 5 + (index * settings.current.iconSpacing);
  top = baseTop + settings.current.iconOffset;
} else  { // == (settings.current.iconPlacement === 'underneath')
  // Position underneath the selected word
  const wordCenter = rect.left + (rect.width / 2);
  left = wordCenter + window.scrollX - (index * settings.current.iconSpacing);
  top = rect.bottom + window.scrollY + 5;

} 

// Ensure icons stay within viewport bounds (but respect placement setting)
const iconWidth = 20;
const viewportLeft = window.scrollX;
const viewportRight = window.scrollX + window.innerWidth;

if (left < viewportLeft + 5) {
  left = viewportLeft + 5;
}
// Only push icons left if they would go off-screen to the right, and only for non-right placements
else if (settings.current.iconPlacement !== 'right' && left + iconWidth > viewportRight - 5) {
  left = viewportRight - iconWidth - 5;
}

icon.style.left = left + 'px';
icon.style.top = top + 'px';
    icon.style.display = 'block';

    document.body.appendChild(icon);
    settings.update({ lookupIcons: [...settings.current.lookupIcons, icon] });
  });
}

// Hide all lookup icons
function hideLookupIcons() {
  settings.current.lookupIcons.forEach(icon => {
    if (icon.parentNode) {
      icon.parentNode.removeChild(icon);
    }
  });
  settings.update({ lookupIcons: [] });
}

// Handle icon click for specific group
function handleIconClick(event, group) {
  console.log(`Icon clicked for group: ${group.name} (${group.icon})`);
  event.preventDefault();
  event.stopPropagation();
  // console.log(currentSelection);console.log('xxx');
  if (settings.current.currentSelection) {
    hideLookupIcons(); // Hide icons after click
    // Choose text based on group's textSelectionMethod
    const textSelectionMethod = group.textSelectionMethod || 'selectedText';
    console.log(`Using text selection method: ${textSelectionMethod}`);
    console.log(settings.current.currentSelection);
    const word = settings.current.currentSelection[textSelectionMethod] || settings.current.currentSelection.selectedText || '';
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
          return settings.current.hideGroupNames ? iconHtml : `${iconHtml}${group.name}`;
        } else {
          return settings.current.hideGroupNames ? group.icon : `${group.icon} ${group.name}`;
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

// Settings are now managed by the reactive settings store from './settings-store.js'
// No manual loading/listening needed - the store handles everything automatically

// ===== EVENT LISTENER CONNECTIONS =====

// Connect RxJS streams to display functions
function setupEventListeners() {
  console.log('RxJS: Setting up event listeners');

  // Connect selection stream to show lookup icons
  selection$.subscribe(({ selection, selectedText }) => {
    if (selectedText) {
      // Extract selection details
      settings.update({
        currentSelection: {
          selectedText: selectedText,
          wholeWord: getWholeWord(selection),
          wholeParagraph: getWholeParagraph(selection)
        }
      });
      showLookupIcons(selection);
    } else {
      settings.update({ currentSelection: null });
      hideLookupIcons();
    }
  });

  // Connect icon click stream to handle icon clicks
  iconClick$.subscribe(({ icon, originalEvent }) => {
    const groupId = icon.dataset.groupId;
    const group = settings.current.queryGroups.find(g => g.id === groupId);
    if (group && settings.current.currentSelection) {
      handleIconClick(originalEvent, group);
    }
  });

  // Connect document click stream to hide result windows
  documentClick$.subscribe(() => {
    // Hide popup result divs if clicked outside and hideOnClickOutside is enabled
    settings.current.resultDivs.forEach(div => {
      if (div && div.dataset.hideOnClickOutside === 'true') {
        div.style.display = 'none';
      }
    });
    // Note: Inline and bottom panel result divs do not auto-hide on click outside
  });

  // Connect runtime message stream to handle background script messages
  runtimeMessage$.subscribe(({ message, sender, sendResponse }) => {
    if (message.action === 'updateQueryGroups') {
      settings.update({ queryGroups: message.groups || [] });
      // Update icons if word is currently selected
      if (settings.current.currentSelection && settings.current.currentSelection.selectedText) {
        const selection = window.getSelection();
        if (selection.toString().trim()) {
          showLookupIcons(selection);
        }
      }
    }
  });

  // Connect storage change stream to update settings dynamically
  // Note: Settings store automatically handles reactive updates from storage
  // No manual listener needed - the settings store subscribes to chrome.storage.onChanged

  console.log('RxJS: Event listeners setup complete');
}

// ===== TEXT SELECTION UTILITIES =====

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

// ===== INITIALIZATION =====

// Initialize extension - settings store loads automatically
async function init() {
  setupEventListeners();
  console.log('RxJS Content script initialization complete');
}

// Start initialization
init();
