// Content script for langbro Dictionary v2 - RxJS Implementation
// Handles text selection and displays multiple lookup icons for query groups

import { fromEvent, merge, combineLatest, Observable, timer } from 'rxjs';
import { map, filter, debounceTime, throttleTime, switchMap, takeUntil, bufferTime, pairwise, take } from 'rxjs/operators';
import { settings } from './settings-store.js';
import DOMPurify from 'dompurify';


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
// Merges selectionchange, keyup, and mousedown events to track all selection changes
const selection$ = merge(
  fromEvent(document, 'selectionchange'),
  // fromEvent(document, 'keyup'),
  // fromEvent(document, 'mousedown')  // For faster response to selection changes
).pipe(
  filter(() => settings.current.extensionEnabled ),  // Only emit when extension is enabled
  map(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    return { selection, selectedText };
  }),
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
  filter(() => settings.current.extensionEnabled),  // Only emit when extension is enabled
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
    map(({ deltaX, start }) => ({ direction: deltaX > 0 ? 'right' : 'left', x: start.x, y: start.y }))
  ))
);

// Log swipe gestures
swipe$.subscribe(direction => {
  console.log('RxJS: User swiped', direction);
});

// Update favorites stars when favorites data changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.favoritesData) {
    // Update all existing star buttons
    const starButtons = document.querySelectorAll('.langbro-favorites-star');
    starButtons.forEach(button => {
      // Find the result div this star belongs to
      const resultDiv = button.closest('.langbro-result');
      if (resultDiv) {
        // Trigger update for this star
        const updateEvent = new CustomEvent('updateFavoritesStar');
        button.dispatchEvent(updateEvent);
      }
    });
  }
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



// Single-click word marking stream when singleClickGroupId is set (use mouseup to avoid browser clearing selection)
const singleClickWordMarking$ = combineLatest([
  settings.select('singleClickGroupId'),
  mouseUp$.pipe(
    filter(event => !settings.current.currentSelection?.selectedText || event.target.closest('[data-box-id]')), // Only when no text is selected, or when clicking inside result windows
    filter(event => !event.target.closest('.did-you-mean-word, .suggestion-item, .langbro-lookup-icon, .langbro-result-header, .langbro-favorites-dropdown, .langbro-history-back-btn, .langbro-history-forward-btn')) // Exclude only interactive extension elements
  )
]).pipe(
  filter(([singleClickGroupId, clickEvent]) => singleClickGroupId && singleClickGroupId !== '' && settings.current.extensionEnabled),
  map(([singleClickGroupId, clickEvent]) => ({
    groupId: singleClickGroupId,
    x: clickEvent.x,
    y: clickEvent.y,
    target: clickEvent.target
  }))
);

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
  iconClick$,
  documentClick$,
  runtimeMessage$,
  storageChange$,
  domReady$
};

// ===== STANDALONE SIMPLE DICT INITIALIZATION =====

// Check if this is the simple-dict page
if (document.querySelector('#resultDiv')) {
  initializeSimpleDict();
}

async function initializeSimpleDict() {
  const resultDiv = document.getElementById('resultDiv');
  const searchInput = resultDiv.querySelector('.langbro-search-input');
  const headerDiv = resultDiv.querySelector('.langbro-result-header');

  // Load settings
  let selectedGroup = null;
  try {
    const result = await chrome.storage.local.get(['simpleDictGroup', 'queryGroups', 'darkMode']);
    const groupId = result.simpleDictGroup;
    if (groupId && result.queryGroups) {
      selectedGroup = result.queryGroups.find(g => g.id === groupId);
    }
    // Apply dark mode
    if (result.darkMode) {
      resultDiv.classList.add('langbro-dark');
      document.body.classList.add('langbro-dark');
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }

  if (!selectedGroup) {
    resultDiv.querySelector('.langbro-result-content').textContent =
      'No dictionary group selected for Simple Dict. Please select one in settings.';
    searchInput.disabled = true;
    return;
  }

  // Set data attributes
  resultDiv.dataset.groupId = selectedGroup.id;
  resultDiv.dataset.boxId = 'simple-dict';
  resultDiv.dataset.historyIndex = '-1';
  resultDiv.dataset.historyLength = '0';

  // Add to result divs array so it's found by createResultDiv
  settings.current.resultDivs.push(resultDiv);



  // Add header controls
  const historyButtons = createHistoryButtons(resultDiv, selectedGroup, 'simple-dict');
  const starBtn = createFavoritesStar(resultDiv, selectedGroup, 'simple-dict');

  // Insert at the beginning of header
  headerDiv.insertBefore(historyButtons.backBtn, headerDiv.firstChild);
  headerDiv.insertBefore(historyButtons.forwardBtn, historyButtons.backBtn.nextSibling);
  headerDiv.insertBefore(starBtn, historyButtons.forwardBtn.nextSibling);

  // Load initial history
  loadHistoryForGroup(resultDiv, selectedGroup.id);

  // Set up search input
  const searchContainer = resultDiv.querySelector('.langbro-search-container');

  if (selectedGroup.showSearchField === 'onPressingEnter') {
    // Add search button
    const searchButton = document.createElement('button');
    searchButton.className = 'langbro-search-button';
    searchButton.textContent = '🔍';
    searchButton.onclick = () => {
      const query = searchInput.value.trim();
      if (query) {
        performSearch(query, selectedGroup, resultDiv, 'simple-dict');
      }
    };
    searchContainer.appendChild(searchButton);
  } else if (selectedGroup.showSearchField === 'liveResults') {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const query = searchInput.value.trim();
      if (query.length === 0) {
        resultDiv.querySelector('.langbro-result-content').textContent =
          'Enter a word to search.';
      } else if (query.length > 2) {
        searchTimeout = setTimeout(() => performSearch(query, selectedGroup, resultDiv, 'simple-dict'), 300);
      }
    });
  }

  // Always handle Enter key
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = searchInput.value.trim();
      if (query) {
        performSearch(query, selectedGroup, resultDiv, 'simple-dict');
      }
    }
  });

  // Set up suggestions if enabled
  const boxId = 'simple-dict';
  // For simple-dict, always set padding to position search box 220px down
  resultDiv.style.paddingTop = '220px';
  if (selectedGroup.queryType === 'offline' && selectedGroup.displaySuggestions !== 0) {
    addSuggestionsHandlers(searchInput, resultDiv, selectedGroup, boxId);
  }



   // Focus search input
   searchInput.focus();

   // Connect document click stream to hide result windows
   const documentClickSub = fromEvent(document, 'click').pipe(
     filter(event => !event.target.closest('.lookup-icon') && !event.target.closest('[data-box-id]'))
   ).subscribe(() => {
     // Hide popup result divs if clicked outside and hideOnClickOutside is enabled
     settings.current.resultDivs.forEach(div => {
       if (div && div.dataset.hideOnClickOutside === 'true') {
         div.style.display = 'none';
       }
     });
   });
 }

 
 // ===== UTILITY FUNCTIONS =====

// Create group label with icon and name
function createGroupLabel(group) {
  if (group.icon && group.icon.endsWith('.png')) {
    const iconHtml = `<img src="${chrome.runtime.getURL(group.icon)}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;" alt="${group.icon}">`;
    return settings.current.hideGroupNames ? iconHtml : `${iconHtml}${group.name}`;
  } else {
    return settings.current.hideGroupNames ? group.icon : `${group.icon} ${group.name}`;
  }
}

// Find the closest text-containing element by traversing up the DOM tree
function findClosestTextElement(element) {
  const acceptableTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'ARTICLE']; //, 'SECTION', 'LI', 'TD', 'TH', 'SPAN'];

  let closestElement = element;
  while (closestElement && closestElement !== document.body) {
    if (acceptableTags.includes(closestElement.tagName)) {
      return closestElement;
    }
    closestElement = closestElement.parentElement;
  }

  return null; // No suitable element found
}

// Update the current selection in settings store
function updateCurrentSelection(selection, selectedText) {
  // Extract selection details and target element
  const range = selection.getRangeAt(0);
  let targetElement = range.commonAncestorContainer;

  // If it's a text node, get the parent element
  if (targetElement.nodeType === Node.TEXT_NODE) {
    targetElement = targetElement.parentElement;
  }

  // Find the closest text-containing element
  const closestElement = findClosestTextElement(targetElement);

  // Calculate context immediately for selected text
  let context = '';
  if (selectedText && selectedText.trim()) {
    context = calculateContext(range, selectedText);
  }

  // Extract nextChars from the end of current element (same as wholeParagraph), max 15 chars
  let nextChars = '';
  if (selectedText && selectedText.trim() && closestElement) {
    const paragraphText = getWholeParagraph(selection);
    const selectedIndex = paragraphText.indexOf(selectedText);
    if (selectedIndex !== -1) {
      const startPos = selectedIndex + selectedText.length;
      nextChars = paragraphText.substring(startPos, startPos + 15);
    }
  }

  settings.update({
    currentSelection: {
      selectedText: selectedText,
      wholeWord: getWholeWord(selection),
      wholeParagraph: getWholeParagraph(selection),
      nextChars: nextChars,
      targetElement: closestElement,
      context: context,
      range: {
        startContainer: range.startContainer,
        startOffset: range.startOffset,
        endContainer: range.endContainer,
        endOffset: range.endOffset
      }
    }
  });
}

// ===== DISPLAY FUNCTIONALITY =====

// Global state - now accessed via reactive settings store from './settings-store.js'
// Use settings.current to read values, settings.update() to write, settings.select() for observables

// Calculate popup dimensions based on group settings
function getPopupDimensions(group) {
  const popupSettings = group.popupSettings || { width: '40%', height: '30%' };

  let width = popupSettings.width;
  let height = popupSettings.height;

  // Convert percentage to pixels if needed
  if (typeof width === 'string' && width.endsWith('%')) {
    const percent = parseFloat(width) / 100;
    width = Math.round(window.innerWidth * percent);
  } else if (typeof width === 'string' && width.endsWith('px')) {
    width = parseInt(width);
  } else if (typeof width === 'number') {
    // Already a number
  } else {
    // Default fallback
    width = Math.round(window.innerWidth * 0.4);
  }

  if (typeof height === 'string' && height.endsWith('%')) {
    const percent = parseFloat(height) / 100;
    height = Math.round(window.innerHeight * percent);
  } else if (typeof height === 'string' && height.endsWith('px')) {
    height = parseInt(height);
  } else if (typeof height === 'number') {
    // Already a number
  } else {
    // Default fallback
    height = Math.round(window.innerHeight * 0.3);
  }

  return { width, height };
}

// Adjust popup height to fit available vertical space
function adjustPopupHeightForAvailableSpace(resultDiv, rect, popupHeight, selectionCenterY, screenCenterY) {
  const currentHeight = popupHeight;
  let adjustedHeight = currentHeight;

  // Calculate available vertical space
  if (selectionCenterY > screenCenterY) {
    // Selection is in lower half - positioning above
    const spaceAbove = rect.top + window.scrollY;
    if (currentHeight > spaceAbove - 10) { // 10px margin
      adjustedHeight = Math.max(spaceAbove - 10, 150); // Minimum 150px height
    }
  } else {
    // Selection is in upper half - positioning below
    const spaceBelow = (window.innerHeight + window.scrollY) - (rect.bottom + window.scrollY);
    if (currentHeight > spaceBelow - 10) { // 10px margin
      adjustedHeight = Math.max(spaceBelow - 10, 150); // Minimum 150px height
    }
  }

  // Apply adjusted height if different from original
  if (adjustedHeight !== currentHeight) {
    resultDiv.style.height = adjustedHeight + 'px';
    console.log(`CONTENT: Adjusted popup height from ${currentHeight}px to ${adjustedHeight}px to fit available space`);
  }

  return adjustedHeight;
}

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
        // Use stored selection range from settings for positioning
        const storedSelection = settings.current.currentSelection;
        if (storedSelection && storedSelection.range) {
          // Create a temporary range from stored range data
          try {
            const range = document.createRange();
            range.setStart(storedSelection.range.startContainer, storedSelection.range.startOffset);
            range.setEnd(storedSelection.range.endContainer, storedSelection.range.endOffset);

            const rect = range.getBoundingClientRect();

            // Get popup dimensions based on group settings
            const popupDimensions = getPopupDimensions(group);
            let popupWidth = popupDimensions.width;
            let popupHeight = popupDimensions.height;

            // On mobile (≤600px), CSS overrides width to 90vw, so use that for positioning calculations
            const isMobile = window.innerWidth <= 600;
            if (isMobile) {
              popupWidth = Math.round(window.innerWidth * 0.9); // 90vw = 90% of viewport width
            }

            // Check if selection is in lower half of screen - if so, position above
            const selectionCenterY = rect.top + (rect.height / 2);
            const screenCenterY = window.innerHeight / 2;

            let documentTop;
            if (selectionCenterY > screenCenterY) {
              // Selection is in lower half - position above
              documentTop = rect.top + window.scrollY - popupHeight - 5;
            } else {
              // Selection is in upper half - position below
              documentTop = rect.bottom + window.scrollY + 5;
            }

            // Adjust popup height to fit available space if needed
            popupHeight = adjustPopupHeightForAvailableSpace(resultDiv, rect, popupHeight, selectionCenterY, screenCenterY);

            // Calculate document left position
            let documentLeft = rect.left + window.scrollX;

            // Adjust horizontal position if it would go off screen
            if (documentLeft + popupWidth > window.innerWidth + window.scrollX) {
              documentLeft = window.innerWidth + window.scrollX - popupWidth - 5;
            }

            // Final check: if positioned popup would still go off screen, adjust
            if (documentTop + popupHeight > window.innerHeight + window.scrollY) {
              documentTop = window.innerHeight + window.scrollY - popupHeight - 5;
            } else if (documentTop < window.scrollY) {
              documentTop = window.scrollY + 5;
            }

            // Store document coordinates for scroll repositioning
            resultDiv.dataset.documentLeft = documentLeft;
            resultDiv.dataset.documentTop = documentTop;

            // Convert to viewport coordinates for fixed positioning
            const viewportLeft = documentLeft - window.scrollX;
            const viewportTop = documentTop - window.scrollY;

            resultDiv.style.left = viewportLeft + 'px';
            resultDiv.style.top = viewportTop + 'px';
          } catch (error) {
            console.error('Error positioning popup with stored range:', error);
            // Fallback to center of screen
            resultDiv.style.left = '50%';
            resultDiv.style.top = '50%';
            resultDiv.style.transform = 'translate(-50%, -50%)';
          }
        } else {
          // Fallback: center on screen if no stored selection
          resultDiv.style.left = '50%';
          resultDiv.style.top = '50%';
          resultDiv.style.transform = 'translate(-50%, -50%)';
        }
      };
      break;
    case 'inline':
      divsArray = settings.current.inlineDivs;
      classPrefix = 'inline';
      // Positioning handled in showInlineResult for inline elements
      positionCallback = null;
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
    resultDiv.dataset.initialWord = initialWord;
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

    // Add header controls (history buttons and favorites star)
    addHeaderControls(headerDiv, resultDiv, group, boxId);

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

// Add header controls (history buttons and favorites star) to header div
function addHeaderControls(headerDiv, resultDiv, group, boxId) {
  // Add history navigation buttons to header
  const historyButtons = createHistoryButtons(resultDiv, group, boxId);
  headerDiv.appendChild(historyButtons.backBtn);
  headerDiv.appendChild(historyButtons.forwardBtn);

  // Add favorites star button to header
  const starBtn = createFavoritesStar(resultDiv, group, boxId);
  headerDiv.appendChild(starBtn);
}

// Create favorites star button for result div
function createFavoritesStar(resultDiv, group, boxId) {
  const starBtn = document.createElement('button');
  starBtn.textContent = '☆'; // Empty star by default
  starBtn.className = 'langbro-favorites-star';
  starBtn.title = 'Add to favorites';

  let longPressDetected = false;
  const LONG_PRESS_DURATION = 500;
  const MOVE_THRESHOLD_PX = 10;

  // Get current lookup data from the result div
  const getCurrentLookupData = () => {
    const contentDiv = resultDiv.querySelector('.langbro-result-content');
    let data = contentDiv ? contentDiv.innerHTML : '';

    // Try to determine the type and extract data
    let type = 'unknown';
    let name = '';

    // Check if this is from a lookup by examining the group
    if (group.queryType === 'offline') {
      type = 'offline';
      // For offline, the name is the searched word
      const searchInput = resultDiv.querySelector('.langbro-search-input');
      name = searchInput ? searchInput.value.trim() : '';
      if (!name) {
        // Try to get from initial word or current selection
        name = settings.current.selectedWord || '';
      }
    } else if (group.queryType === 'ai') {
      type = 'ai';
      // For AI, the name is the query/prompt
      const searchInput = resultDiv.querySelector('.langbro-search-input');
      name = searchInput ? searchInput.value.trim() : '';
    } else if (group.queryType === 'web' || group.queryType === 'google_translate') {
      type = 'web';
      // For web, the name is the query
      const searchInput = resultDiv.querySelector('.langbro-search-input');
      name = searchInput ? searchInput.value.trim() : '';
    }

    // Fallback: if name is still empty, use the initial word stored in dataset
    if (!name) {
      name = resultDiv.dataset.initialWord || '';
    }

    return { type, name, data };
  };

  // Update star appearance based on favorites status
  const updateStarAppearance = async () => {
    try {
      const lookupData = getCurrentLookupData();
      if (!lookupData || !lookupData.name) return;

      // Get last used list for display and checking
      const lastUsedResponse = await chrome.runtime.sendMessage({ action: 'getLastUsedList' });
      const lastUsedList = lastUsedResponse.success ? lastUsedResponse.list : null;

      // Check if this item is already in the ACTIVE (last used) favorites list
      const favoritesResponse = await chrome.runtime.sendMessage({ action: 'getFavoritesData' });
      if (!favoritesResponse.success) return;

      const activeList = favoritesResponse.data.lists.find(list => list.id === (lastUsedList ? lastUsedList.id : null));
      const isFavorited = activeList && activeList.items.some(item =>
        item.name === lookupData.name && item.type === lookupData.type
      );

      starBtn.textContent = isFavorited ? '★' : '☆';
      starBtn.classList.toggle('favorited', isFavorited);

      // Show list abbreviation on the left side of the star
      const listAbbrev = lastUsedList ? lastUsedList.name.substring(0, 3).toLowerCase() : 'fav';
      starBtn.title = isFavorited ? `Remove from favorites (${listAbbrev})` : `Add to favorites (${listAbbrev})`;

      // Add list abbreviation as text before the star
      starBtn.textContent = `${listAbbrev} ${isFavorited ? '★' : '☆'}`;
    } catch (error) {
      console.error('Error updating star appearance:', error);
    }
  };

  // Click handler - toggle favorites in active list
  starBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    if (longPressDetected) {
      longPressDetected = false;
      return; // Skip toggling when long press was detected
    }

    try {
      const lookupData = getCurrentLookupData();
      if (!lookupData || !lookupData.name) {
        console.warn('No lookup data available for favorites');
        return;
      }

      // Get active (last used) list
      const lastUsedResponse = await chrome.runtime.sendMessage({ action: 'getLastUsedList' });
      if (!lastUsedResponse.success) {
        console.error('Failed to get last used list');
        return;
      }

      const activeListId = lastUsedResponse.list.id;

      // Check if this item is already in the ACTIVE favorites list
      const favoritesResponse = await chrome.runtime.sendMessage({ action: 'getFavoritesData' });
      if (!favoritesResponse.success) return;

      const activeList = favoritesResponse.data.lists.find(list => list.id === activeListId);
      const existingItem = activeList ? activeList.items.find(item =>
        item.name === lookupData.name && item.type === lookupData.type
      ) : null;

      if (existingItem) {
        // Remove from active list
        const removeResponse = await chrome.runtime.sendMessage({
          action: 'removeFromFavorites',
          listId: activeListId,
          itemId: existingItem.id
        });

        if (removeResponse.success) {
          updateStarAppearance(); // Update appearance after removing
          console.log('Removed from favorites:', lookupData.name);
        } else {
          console.error('Failed to remove from favorites:', removeResponse.error);
        }
      } else {
        // Add to active list
        const addResponse = await chrome.runtime.sendMessage({
          action: 'addToFavorites',
          listId: activeListId,
          item: lookupData
        });

        if (addResponse.success) {
          updateStarAppearance(); // Update appearance after adding
          console.log('Added to favorites:', lookupData.name);
        } else {
          console.error('Failed to add to favorites:', addResponse.error);
        }
      }
    } catch (error) {
      console.error('Error toggling favorites:', error);
    }
  });

  const pointerDown$ = fromEvent(starBtn, 'pointerdown').pipe(
    filter(event => !(event.pointerType === 'mouse' && event.button !== 0))
  );
  const pointerMove$ = fromEvent(starBtn, 'pointermove');
  const pointerUp$ = fromEvent(starBtn, 'pointerup');
  const pointerCancel$ = fromEvent(starBtn, 'pointercancel');
  const pointerLeave$ = fromEvent(starBtn, 'pointerleave');
  const pointerEnd$ = merge(pointerUp$, pointerCancel$, pointerLeave$);

  const longPress$ = pointerDown$.pipe(
    map(downEvent => {
      longPressDetected = false;
      return downEvent;
    }),
    switchMap(downEvent => {
      const startX = downEvent.clientX;
      const startY = downEvent.clientY;

      const movementExceeded$ = pointerMove$.pipe(
        filter(moveEvent =>
          Math.abs(moveEvent.clientX - startX) > MOVE_THRESHOLD_PX ||
          Math.abs(moveEvent.clientY - startY) > MOVE_THRESHOLD_PX
        ),
        take(1),
        takeUntil(pointerEnd$)
      );

      return timer(LONG_PRESS_DURATION).pipe(
        takeUntil(merge(pointerEnd$, movementExceeded$)),
        map(() => downEvent)
      );
    })
  );

  longPress$.subscribe(() => {
    longPressDetected = true;
    showFavoritesListDropdown(starBtn, resultDiv, group, boxId, getCurrentLookupData);
  });

  // Initialize appearance
  updateStarAppearance();

  // Listen for favorites data changes to update appearance
  starBtn.addEventListener('updateFavoritesStar', () => {
    updateStarAppearance();
  });

  return starBtn;
}

// Create history navigation buttons for result div
function createHistoryButtons(resultDiv, group, boxId) {
  // Back button
  const backBtn = document.createElement('button');
  backBtn.textContent = '◀';
  backBtn.className = 'langbro-history-back-btn';
  backBtn.title = 'Go back in history (older lookup)';
  backBtn.disabled = true; // Initially disabled

  // Forward button
  const forwardBtn = document.createElement('button');
  forwardBtn.textContent = '▶';
  forwardBtn.className = 'langbro-history-forward-btn';
  forwardBtn.title = 'Go forward in history (newer lookup)';
  forwardBtn.disabled = true; // Initially disabled

  // Initialize history state
  resultDiv.dataset.historyIndex = '-1'; // -1 means current lookup, not in history
  resultDiv.dataset.historyLength = '0';

  // Load history and update button states
  loadHistoryForGroup(resultDiv, group.id);

  // Back button click handler
  backBtn.onclick = async (e) => {
    e.stopPropagation();
    await navigateHistory(resultDiv, group.id, 'back');
  };

  // Forward button click handler
  forwardBtn.onclick = async (e) => {
    e.stopPropagation();
    await navigateHistory(resultDiv, group.id, 'forward');
  };

  return { backBtn, forwardBtn };
}

// Load history for a group and update button states
async function loadHistoryForGroup(resultDiv, groupId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getHistory',
      groupId: groupId
    });

    if (response.success && response.history) {
      resultDiv.dataset.historyLength = response.history.length.toString();

      // Update button states
      updateHistoryButtons(resultDiv);
    }
  } catch (error) {
    console.error('Error loading history:', error);
  }
}

// Navigate through history
async function navigateHistory(resultDiv, groupId, direction) {
  const currentIndex = parseInt(resultDiv.dataset.historyIndex);
  const historyLength = parseInt(resultDiv.dataset.historyLength);

  let newIndex;
  if (direction === 'back') {
    // Go to older history (higher index), skip index 0 when coming from current
    newIndex = currentIndex === -1 ? 1 : currentIndex + 1;
  } else if (direction === 'forward') {
    // Go to newer history or current (lower index), skip index 0
    newIndex = currentIndex - 1;
    if (newIndex === 0) newIndex = -1;
  } else {
    return; // Invalid direction
  }

  // Validate index bounds (allow -1 for current)
  if ((newIndex < 0 && newIndex !== -1) || newIndex >= historyLength) {
    return; // Out of bounds
  }

  // Update history index
  resultDiv.dataset.historyIndex = newIndex.toString();

  const contentDiv = resultDiv.querySelector('.langbro-result-content');
  if (contentDiv) {
      if (newIndex === -1) {
        // Restore current content
        contentDiv.innerHTML = sanitizeDictHTML(resultDiv.dataset.currentContent || '');
      } else {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'getHistoryEntry',
          groupId: groupId,
          index: newIndex
        });

        if (response.success && response.entry) {
          // Save current content if this is first navigation away from current
          if (currentIndex === -1 && !resultDiv.dataset.currentContent) {
            resultDiv.dataset.currentContent = contentDiv.innerHTML;
          }

          // Create group label for the history entry
          const group = settings.current.queryGroups.find(g => g.id === groupId);
          const groupLabel = group ? createGroupLabel(group) : '';

          // Update content with history entry
          contentDiv.innerHTML = sanitizeDictHTML(`${groupLabel}\n\n${response.entry.definition}`);
        }
      } catch (error) {
        console.error('Error navigating history:', error);
      }
    }

    // Update star appearance
    const star = resultDiv.querySelector('.langbro-favorites-star');
    if (star) {
      const updateEvent = new CustomEvent('updateFavoritesStar');
      star.dispatchEvent(updateEvent);
    }
  }

  // Update button states
  updateHistoryButtons(resultDiv);
}

// Update history button states based on current index
function updateHistoryButtons(resultDiv) {
  const currentIndex = parseInt(resultDiv.dataset.historyIndex);
  const historyLength = parseInt(resultDiv.dataset.historyLength);

  const backBtn = resultDiv.querySelector('.langbro-history-back-btn');
  const forwardBtn = resultDiv.querySelector('.langbro-history-forward-btn');

  if (backBtn) {
    // Back enabled if there are older history entries to go to
    backBtn.disabled = currentIndex >= historyLength - 1;
  }

  if (forwardBtn) {
    // Forward enabled unless at current (-1)
    forwardBtn.disabled = currentIndex === -1;
  }
}

// Show dropdown for selecting favorites list
async function showFavoritesListDropdown(starBtn, resultDiv, group, boxId, getCurrentLookupData) {
  // Remove existing dropdown
  const existingDropdown = document.querySelector('.langbro-favorites-dropdown');
  if (existingDropdown) {
    existingDropdown.remove();
  }

  try {
    // Get favorites data
    const response = await chrome.runtime.sendMessage({ action: 'getFavoritesData' });
    if (!response.success) return;

    const favoritesData = response.data;
    const lists = favoritesData.lists;

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'langbro-favorites-dropdown';

    // Add list options
    lists.forEach(list => {
      const listItem = document.createElement('div');
      listItem.className = 'favorites-dropdown-item';
      listItem.textContent = list.name;
       listItem.onclick = async (e) => {
         e.stopPropagation();
         try {
           const lookupData = getCurrentLookupData();
           if (!lookupData || !lookupData.name) return;

           const addResponse = await chrome.runtime.sendMessage({
             action: 'addToFavorites',
             listId: list.id,
             item: lookupData
           });

            if (addResponse.success) {
              console.log(`Added to favorites list "${list.name}":`, lookupData.name);
              dropdown.remove();
              // Update star appearance immediately
              const star = resultDiv.querySelector('.langbro-favorites-star');
              if (star) {
                const updateEvent = new CustomEvent('updateFavoritesStar');
                star.dispatchEvent(updateEvent);
              }
            }
         } catch (error) {
           console.error('Error adding to list:', error);
         }
       };
      dropdown.appendChild(listItem);
    });

    // Add "New List" option
    const newListItem = document.createElement('div');
    newListItem.className = 'favorites-dropdown-item new-list-item';
    newListItem.textContent = '+ New List';
    newListItem.onclick = (e) => {
      e.stopPropagation();
      // Use setTimeout to prevent immediate popup closure
      setTimeout(() => {
        const listName = prompt('Enter name for new favorites list:');
        if (listName && listName.trim()) {
          createNewFavoritesList(listName.trim(), dropdown, starBtn, resultDiv, group, boxId, getCurrentLookupData);
        }
      }, 10);
    };
    dropdown.appendChild(newListItem);

    // Position dropdown below the star
    const rect = starBtn.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.top = (rect.bottom + 5) + 'px';
    // dropdown.style.zIndex = '10000';

    document.body.appendChild(dropdown);

    // Close dropdown when clicking outside
    const closeDropdown = (e) => {
      if (!dropdown.contains(e.target) && e.target !== starBtn) {
        dropdown.remove();
        document.removeEventListener('click', closeDropdown);
      }
    };
    setTimeout(() => document.addEventListener('click', closeDropdown), 10);

  } catch (error) {
    console.error('Error showing favorites dropdown:', error);
  }
}

// Create new favorites list
async function createNewFavoritesList(listName, dropdown, starBtn, resultDiv, group, boxId, getCurrentLookupData) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'createFavoritesList',
      name: listName
    });

    if (response.success) {
      console.log('Created new favorites list:', listName);
      dropdown.remove();

      // Add the current item to the new list
      const lookupData = getCurrentLookupData();
      if (lookupData && lookupData.name) {
        const addResponse = await chrome.runtime.sendMessage({
          action: 'addToFavorites',
          listId: response.list.id,
          item: lookupData
        });

        if (addResponse.success) {
          console.log(`Added to new list "${listName}":`, lookupData.name);
          // Update star appearance
          const star = resultDiv.querySelector('.langbro-favorites-star');
          if (star) {
            const updateEvent = new CustomEvent('updateFavoritesStar');
            star.dispatchEvent(updateEvent);
          }
        }
      }
    } else {
      alert('Error creating list: ' + response.error);
    }
  } catch (error) {
    console.error('Error creating new list:', error);
    alert('Error creating list: ' + error.message);
  }
}

// Add suggestions event handlers to a search input
function addSuggestionsHandlers(searchInput, resultDiv, group, boxId) {
  let blurTimeout;
  let suggestionTimeout;

  // Show suggestions when input gains focus or is clicked (if it has content)
  const showSuggestionsIfContent = async () => {
    clearTimeout(blurTimeout); // Cancel any pending blur timeout
    clearTimeout(suggestionTimeout); // Cancel any pending suggestion update
    const query = searchInput.value.trim();
    if (query.length > 0) {
      try {
        // console.log('CONTENT: Requesting suggestions on focus/click for word:', query, 'dictionaries:', group.settings?.selectedDictionaries);
        const response = await chrome.runtime.sendMessage({
          action: 'getSuggestions',
          word: query,
          maxResults: group.displaySuggestions || 20,
          selectedDictionaries: group.settings?.selectedDictionaries || []
        });
        console.log('CONTENT: Received suggestions response on focus/click:', response);

        if (response.suggestions && response.suggestions.length > 0) {
          // console.log('CONTENT: Showing suggestions on focus/click:', response.suggestions);
          showSuggestions(response.suggestions, searchInput, resultDiv, group, boxId);
        } else {
          // console.log('CONTENT: No suggestions to show on focus/click, hiding dropdown');
          hideSuggestions(resultDiv);
        }
      } catch (error) {
        console.error('CONTENT: Error getting suggestions on focus/click:', error);
        hideSuggestions(resultDiv);
      }
    } else {
      // Hide suggestions when input is empty
      hideSuggestions(resultDiv);
    }
  };

  searchInput.addEventListener('focus', showSuggestionsIfContent);
  searchInput.addEventListener('click', showSuggestionsIfContent);

  // Update suggestions when user types or pastes (debounced)
  searchInput.addEventListener('input', () => {
    clearTimeout(suggestionTimeout);
    clearTimeout(blurTimeout); // Cancel any pending blur timeout

    const query = searchInput.value.trim();

    if (query.length === 0) {
      // Hide suggestions immediately when input is cleared
      hideSuggestions(resultDiv);
    } else {
      // Debounce suggestion updates to avoid excessive API calls
      suggestionTimeout = setTimeout(() => {
        showSuggestionsIfContent();
      }, 200); // 200ms debounce (shorter than live results since suggestions are lighter)
    }
  });

  // Hide suggestions when input loses focus
  searchInput.addEventListener('blur', () => {
    // Delay hiding to allow clicking on suggestions
    blurTimeout = setTimeout(() => hideSuggestions(resultDiv), 150);
  });
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

  // Check if suggestions should be enabled (only for offline groups with displaySuggestions > 0)
  const suggestionsEnabled = group.queryType === 'offline' && group.displaySuggestions !== 0;
  console.log(`CONTENT: Suggestions enabled for group ${group.name}: ${suggestionsEnabled} (displaySuggestions: ${group.displaySuggestions})`);

  // Handle different search modes
  if (group.showSearchField === 'onPressingEnter') {
    // Add search button
    const searchButton = document.createElement('button');
    searchButton.className = 'langbro-search-button';
    searchButton.textContent = '🔍';

    searchButton.onclick = () => performSearch(searchInput.value.trim(), group, resultDiv, boxId);
    searchContainer.appendChild(searchButton);

    // Handle Enter key
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        performSearch(searchInput.value.trim(), group, resultDiv, boxId);
      }
    });

    // If suggestions are enabled, add input handler for suggestions
    if (suggestionsEnabled) {
      addSuggestionsHandlers(searchInput, resultDiv, group, boxId);
    }
  } else if (group.showSearchField === 'liveResults') {
    // Live results mode - add debounced input handler
    const performLiveSearch = (query) => {
      if (query.length > 2) {
        // Perform live search for queries longer than 2 characters
        performSearch(query, group, resultDiv, boxId);
      } else if (query.length === 0) {
        // Clear results when field is empty
        const contentDiv = resultDiv.querySelector('.langbro-result-content');
        if (contentDiv) {
          contentDiv.innerHTML = '';
          const placeholder = document.createElement('div');
          placeholder.textContent = 'Start typing to search...';
          placeholder.style.color = '#666';
          placeholder.style.fontStyle = 'italic';
          contentDiv.appendChild(placeholder);
        }
      }
    };

    // Debounced input handler for live results
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = searchInput.value.trim();

      if (query.length === 0) {
        performLiveSearch(query);
      } else {
        searchTimeout = setTimeout(() => {
          performLiveSearch(query);
        }, 300); // 300ms debounce
      }
    });

    // Handle Enter key for live results too (immediate search)
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        performSearch(searchInput.value.trim(), group, resultDiv, boxId);
      }
    });

    // If suggestions are enabled, add input handler for suggestions (only suggestions, no search)
    if (suggestionsEnabled) {
      addSuggestionsHandlers(searchInput, resultDiv, group, boxId);
    }

    // Initialize with placeholder if empty
    if (!initialWord) {
      setTimeout(() => {
        const contentDiv = resultDiv.querySelector('.langbro-result-content');
        if (contentDiv && !contentDiv.hasChildNodes()) {
          contentDiv.innerHTML = '';
          const placeholder = document.createElement('div');
          placeholder.textContent = 'Start typing to search...';
          placeholder.style.color = '#666';
          placeholder.style.fontStyle = 'italic';
          contentDiv.appendChild(placeholder);
        }
      }, 50);
    }
  }

  return searchContainer;
}

// Show suggestions dropdown below search input
function showSuggestions(suggestions, searchInput, resultDiv, group, boxId) {
  // Remove existing suggestions
  hideSuggestions(resultDiv);

  // Skip sliding for simple-dict as it's fullscreen and already padded
  if (resultDiv.dataset.boxId === 'simple-dict') {
    // Proceed without sliding
  } else {
    // Check if popup is too close to top and needs to slide down
    const popupRect = resultDiv.getBoundingClientRect();
    const suggestionsHeight = 200; // Max height of suggestions dropdown
    const margin = 10; // Minimum margin from viewport top

    if (popupRect.top - suggestionsHeight < margin) {
      // Store original position if not already stored
      if (!resultDiv.dataset.originalDocumentTop) {
        resultDiv.dataset.originalDocumentTop = resultDiv.dataset.documentTop;
        resultDiv.dataset.originalViewportTop = resultDiv.style.top;
      }

      // Calculate how much to slide down
      const neededSpace = suggestionsHeight + margin;
      const currentTop = popupRect.top;
      const newTop = Math.max(neededSpace, margin + 50); // Minimum 50px from top
      const slideDown = newTop - currentTop;

      if (slideDown > 0) {
        // Slide popup down
        const currentViewportTop = parseFloat(resultDiv.style.top) || 0;
        resultDiv.style.top = (currentViewportTop + slideDown) + 'px';

        // Update stored document coordinates for scroll repositioning
        const currentDocTop = parseFloat(resultDiv.dataset.documentTop) || 0;
        resultDiv.dataset.documentTop = (currentDocTop + slideDown) + '';

        console.log(`CONTENT: Slid popup down by ${slideDown}px to make room for suggestions`);
      }
    }
  }

  // Create suggestions container
  const suggestionsDiv = document.createElement('div');
  suggestionsDiv.className = 'search-suggestions';

  // Dark mode class for styling
  if (settings.current.isDarkMode) {
    suggestionsDiv.classList.add('langbro-dark');
  }

  // Add suggestions
  suggestions.forEach(suggestion => {
    const suggestionItem = document.createElement('div');
    suggestionItem.className = 'suggestion-item';
    suggestionItem.textContent = suggestion;

    suggestionItem.addEventListener('mouseenter', () => {
      suggestionItem.classList.add('suggestion-item-hover');
    });

    suggestionItem.addEventListener('mouseleave', () => {
      suggestionItem.classList.remove('suggestion-item-hover');
    });

    suggestionItem.addEventListener('click', () => {
      searchInput.value = suggestion;
      hideSuggestions(resultDiv);
      // Trigger search directly without dispatching input event to avoid showing suggestions again
      performSearch(suggestion, group, resultDiv, resultDiv.dataset.boxId);
      // Don't focus here to avoid triggering showSuggestionsIfContent
    });

    suggestionsDiv.appendChild(suggestionItem);
  });

  // Find the search container and append suggestions
  const searchContainer = searchInput.parentElement;
  searchContainer.style.setProperty('position', 'relative', 'important');
  searchContainer.appendChild(suggestionsDiv);
}

// Hide suggestions dropdown
function hideSuggestions(resultDiv) {
  const suggestionsDiv = resultDiv.querySelector('.search-suggestions');
  if (suggestionsDiv) {
    suggestionsDiv.remove();
  }
}

// Show the result in a popup div
function showPopupResult(definition, group, boxId, initialWord = '') {
  let resultDiv = createResultDiv('popup', group, boxId, initialWord);

  // Get popup settings
  const popupSettings = group.popupSettings || { width: '40%', height: '30%', hideOnClickOutside: false };

  // Update width and height from popup settings, but don't override if height was already adjusted
  resultDiv.style.width = popupSettings.width;

  // Only set height if it hasn't been adjusted for available space
  const currentHeight = resultDiv.style.height;
  const settingsHeight = popupSettings.height;
  // If height is empty, not set, or matches settings, then apply from settings
  // If height is different from settings, it means it was adjusted for space, so preserve it
  if (!currentHeight || currentHeight === '' || currentHeight === settingsHeight) {
    resultDiv.style.height = settingsHeight;
  }

  // Get content div
  const contentDiv = resultDiv.querySelector('.langbro-result-content');
  if (!contentDiv) return;

  // // If showing a new definition, add current result to history first
  // if (definition && resultDiv.dataset.currentWord) {
  //   addCurrentResultToHistory(resultDiv, group.id);
  // }

  // Clear content and show spinner or result
  contentDiv.innerHTML = '';

   if (!definition) {
     // Show spinner
     const spinner = createSpinner(`Loading ${group.name}...`);
     contentDiv.appendChild(spinner);
   } else {
     // Store current word and definition for history
     resultDiv.dataset.currentWord = initialWord;
     resultDiv.dataset.currentDefinition = definition;

     // Reset history index for new lookups
     resultDiv.dataset.historyIndex = '-1'; // Start at -1, representing current lookup
     updateHistoryButtons(resultDiv);

     // Show result
     const sanitizedHTML = sanitizeDictHTML(definition);
     contentDiv.innerHTML = sanitizedHTML;

     // Update star appearance now that content is loaded
     const star = resultDiv.querySelector('.langbro-favorites-star');
     if (star) {
       const updateEvent = new CustomEvent('updateFavoritesStar');
       star.dispatchEvent(updateEvent);
     }
   }

   // Store hide on click outside setting for later use
   resultDiv.dataset.hideOnClickOutside = popupSettings.hideOnClickOutside;

  resultDiv.style.display = 'flex';
}

// Show the result in fullscreen mode
function showFullscreenResult(definition, group, boxId, initialWord = '') {
  let resultDiv = createResultDiv('popup', group, boxId, initialWord);

  // Get content div
  const contentDiv = resultDiv.querySelector('.langbro-result-content');
  if (!contentDiv) return;

  // // If showing a new definition, add current result to history first
  // if (definition && resultDiv.dataset.currentWord) {
  //   addCurrentResultToHistory(resultDiv, group.id);
  // }

  // Clear content and show spinner or result
  contentDiv.innerHTML = '';

   if (!definition) {
     // Show spinner
     const spinner = createSpinner(`Loading ${group.name}...`);
     contentDiv.appendChild(spinner);
   } else {
     // Store current word and definition for history
     resultDiv.dataset.currentWord = initialWord;
     resultDiv.dataset.currentDefinition = definition;

     // Reset history index for new lookups
     resultDiv.dataset.historyIndex = '-1'; // Start at -1, representing current lookup
     updateHistoryButtons(resultDiv);

     // Show result
     const sanitizedHTML = sanitizeDictHTML(definition);
     contentDiv.innerHTML = sanitizedHTML;

     // Update star appearance now that content is loaded
     const star = resultDiv.querySelector('.langbro-favorites-star');
     if (star) {
       const updateEvent = new CustomEvent('updateFavoritesStar');
       star.dispatchEvent(updateEvent);
     }
   }

  resultDiv.style.display = 'flex';
}

// Show the result inline below the selected text
function showInlineResult(definition, group, boxId, initialWord = '') {
  // First check if result div exists in tracking array
  let inlineDiv = settings.current.inlineDivs.find(div => div.dataset.boxId == boxId);

  // Reset history index for new lookups
  if (definition && inlineDiv) {
    inlineDiv.dataset.historyIndex = '-1';
    updateHistoryButtons(inlineDiv);
  }

  if (!inlineDiv) {
    // Need to create a new inline result element

    // Use the stored targetElement from when the selection was made
    const targetElement = settings.current.currentSelection?.targetElement;

    if (!targetElement || !targetElement.parentNode) {
      // Fallback to popup if no suitable parent found
      showPopupResult(definition, group, boxId, initialWord);
      return;
    }

    // Create a sibling element of the same type as targetElement
    inlineDiv = document.createElement(targetElement.tagName.toLowerCase());

    // Copy inline classes but exclude langbro classes
    const classList = Array.from(targetElement.classList);
    inlineDiv.className = classList.filter(cls => !cls.includes('langbro')).join(' ');

    // Apply our langbro-inline styling
    inlineDiv.classList.add('langbro-result', 'langbro-inline');

  // Set data attributes
  inlineDiv.dataset.boxId = boxId;
  inlineDiv.dataset.groupId = group.id;
  inlineDiv.dataset.initialWord = initialWord;

    // Create header div for close button and search field
    const headerDiv = document.createElement('div');
    headerDiv.className = 'langbro-result-header';

    // Create content div for scrollable content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'langbro-result-content';

    // Add close button to header
    const closeBtn = createCloseButton(inlineDiv);
    headerDiv.appendChild(closeBtn);

    // Add header controls (history buttons and favorites star)
    addHeaderControls(headerDiv, inlineDiv, group, boxId);

    // Add search field if enabled
    if (group.showSearchField && group.showSearchField !== 'none') {
      const searchContainer = createSearchField(group, inlineDiv, boxId, initialWord);
      headerDiv.appendChild(searchContainer);
    }

    // Assemble the structure
    inlineDiv.appendChild(headerDiv);
    inlineDiv.appendChild(contentDiv);

    // Insert as sibling after the target element
    targetElement.parentNode.insertBefore(inlineDiv, targetElement.nextSibling);

    // Add to tracking array
    settings.current.inlineDivs.push(inlineDiv);
  }

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

     // Update star appearance now that content is loaded
     const star = inlineDiv.querySelector('.langbro-favorites-star');
     if (star) {
       const updateEvent = new CustomEvent('updateFavoritesStar');
       star.dispatchEvent(updateEvent);
     }
   }

   inlineDiv.style.display = 'flex';
}

// Show the result in a bottom panel
function showBottomResult(definition, group, boxId, initialWord = '') {
  let bottomDiv = createResultDiv('bottom', group, boxId, initialWord);

  // Reset history index for new lookups
  if (definition) {
    bottomDiv.dataset.historyIndex = '-1';
    updateHistoryButtons(bottomDiv);
  }

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

     // Update star appearance now that content is loaded
     const star = bottomDiv.querySelector('.langbro-favorites-star');
     if (star) {
       const updateEvent = new CustomEvent('updateFavoritesStar');
       star.dispatchEvent(updateEvent);
     }
   }

   bottomDiv.style.display = 'flex';
}

// Show the result based on group's display method
function showResult(definition, group, locationInfo, initialWord = '') {
  const displayMethod = locationInfo ? locationInfo.displayMethod : group.displayMethod || 'popup';
  const boxId = locationInfo ? locationInfo.boxId : settings.incrementBoxId();

  console.log(displayMethod, group);

  // Preserve current selection before creating result windows
  // This prevents result window creation from clearing the document selection
  const currentSelection = window.getSelection();
  let savedRange = null;
  if (currentSelection.rangeCount > 0) {
    savedRange = currentSelection.getRangeAt(0).cloneRange();
  }

   if (displayMethod === 'inline') {
     showInlineResult(definition, group, boxId, initialWord);
   } else if (displayMethod === 'bottom') {
     showBottomResult(definition, group, boxId, initialWord);
   } else if (displayMethod === 'fullscreen') {
     showFullscreenResult(definition, group, boxId, initialWord);
   } else {
     // Default to popup
     showPopupResult(definition, group, boxId, initialWord);
  }

  // Restore the saved selection after result window is created
  if (savedRange) {
    try {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    } catch (error) {
      console.error('Error restoring selection:', error);
    }
  }

  // Return location info for the caller
  return { boxId, displayMethod };
}

// Sanitize HTML to replace inline styles with classes and sanitize
function sanitizeDictHTML(html) {
  // Replace common inline styles with classes and convert custom tags to spans
  let processed = html
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

  // Sanitize with DOMPurify, allowing only safe tags and attributes
  return DOMPurify.sanitize(processed, {
    ALLOWED_TAGS: ['span', 'b', 'i', 'em', 'strong', 'br', 'p', 'div', 'ul', 'li', 'ol'],
    ALLOWED_ATTR: ['class']
  });
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
   lookupWord(query, group, { boxId, displayMethod: boxId === 'simple-dict' ? 'fullscreen' : (group.displayMethod || 'popup') });
}

// Fetch and show did-you-mean suggestions for offline queries
async function fetchAndShowDidYouMeanSuggestions(word, group, locationInfo) {
  // Only check for did-you-mean suggestions for offline queries with nextChars available and setting enabled
  if (group.queryType !== 'offline' || !settings.current.currentSelection?.nextChars || !group.showDidYouMeanSuggestions) {
    return;
  }

  console.log('CONTENT: Checking for did-you-mean suggestions for offline query');
  try {
    const didYouMeanResponse = await chrome.runtime.sendMessage({
      action: 'didYouMean',
      word: word,
      nextChars: settings.current.currentSelection.nextChars,
      maxResults: 5, // Limit to 5 suggestions
      selectedDictionaries: group.settings?.selectedDictionaries || []
    });
    console.log('CONTENT: Received did-you-mean response:', didYouMeanResponse);

    if (didYouMeanResponse && didYouMeanResponse.suggestions && didYouMeanResponse.suggestions.length > 0) {
      console.log('CONTENT: Showing did-you-mean suggestions:', didYouMeanResponse.suggestions);
      showDidYouMeanSuggestions(didYouMeanResponse.suggestions, locationInfo);
    } else {
      console.log('CONTENT: No did-you-mean suggestions to show');
    }
  } catch (error) {
    console.error('CONTENT: Error getting did-you-mean suggestions:', error);
  }
}

// Show did-you-mean suggestions in the result header
function showDidYouMeanSuggestions(suggestions, locationInfo) {
  if (!suggestions || suggestions.length === 0) return;

  // Find the result div
  const resultDiv = settings.current.resultDivs.find(div => div.dataset.boxId == locationInfo.boxId) ||
                   settings.current.inlineDivs.find(div => div.dataset.boxId == locationInfo.boxId) ||
                   settings.current.bottomDivs.find(div => div.dataset.boxId == locationInfo.boxId);

  if (!resultDiv) {
    console.error('CONTENT: Could not find result div for did-you-mean suggestions');
    return;
  }

  // Get the header div
  const headerDiv = resultDiv.querySelector('.langbro-result-header');
  if (!headerDiv) {
    console.error('CONTENT: Could not find header div for did-you-mean suggestions');
    return;
  }

  // Remove existing did-you-mean container
  const existingContainer = headerDiv.querySelector('.did-you-mean-container');
  if (existingContainer) {
    existingContainer.remove();
  }

  // Create did-you-mean container
  const didYouMeanContainer = document.createElement('div');
  didYouMeanContainer.className = 'did-you-mean-container';

  // Add each suggestion as a clickable span
  suggestions.forEach(suggestion => {
    const suggestionSpan = document.createElement('span');
    suggestionSpan.className = 'did-you-mean-word';
    suggestionSpan.textContent = suggestion;

    // Make it clickable
    suggestionSpan.addEventListener('click', async () => {
      console.log('CONTENT: Did-you-mean word clicked:', suggestion);

      // Update the search field if it exists
      const searchInput = headerDiv.querySelector('.langbro-search-input');
      if (searchInput) {
        searchInput.value = suggestion;
      }

      // Update content directly (preserve did-you-mean container)
      const contentDiv = resultDiv.querySelector('.langbro-result-content');
      if (!contentDiv) return;

      // Get group info
      const groupId = resultDiv.dataset.groupId;
      const group = settings.current.queryGroups.find(g => g.id === groupId);

      // Show spinner in content
      contentDiv.innerHTML = '';
      const spinner = createSpinner(`Loading ${group.name}...`);
      contentDiv.appendChild(spinner);

      if (!group) {
        console.error('CONTENT: Could not find group for did-you-mean click, groupId:', groupId, 'available groups:', settings.current.queryGroups.map(g => g.id));
        // Clear the did-you-mean container since we can't handle clicks
        const existingContainer = headerDiv.querySelector('.did-you-mean-container');
        if (existingContainer) {
          existingContainer.remove();
        }
        return;
      }

      try {
        // Perform lookup
        const message = {
          action: 'lookup',
          word: suggestion,
          groupId: group.id,
          queryType: group.queryType,
          settings: group.settings,
          context: settings.current.currentSelection?.context || ''
        };

        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            if (errorMsg.includes('Extension context invalidated')) {
              contentDiv.textContent = 'Dictionary updated! Please refresh this page to continue using word lookup.';
            } else {
              contentDiv.textContent = `Extension error: ${errorMsg}`;
            }
            return;
          }



          if (response && response.error) {
            const groupLabel = createGroupLabel(group);
            contentDiv.innerHTML = sanitizeDictHTML(`Lookup error (${groupLabel}): ${response.error}`);
          } else if (response && response.definition) {
            const groupLabel = createGroupLabel(group);
            contentDiv.innerHTML = sanitizeDictHTML(`${groupLabel}\n\n${response.definition}`);
          } else {
            const groupLabel = createGroupLabel(group);
            contentDiv.innerHTML = sanitizeDictHTML(`No definition found for "${suggestion}" in ${groupLabel}.`);
          }
        });
      } catch (error) {
        console.error('CONTENT: Error in did-you-mean lookup:', error);
        contentDiv.textContent = `Unable to query ${group.name}. Please refresh the page.`;
      }
    });

    didYouMeanContainer.appendChild(suggestionSpan);
  });

  // Insert after the search container
  const searchContainer = headerDiv.querySelector('.langbro-search-container');
  if (searchContainer) {
    searchContainer.insertAdjacentElement('afterend', didYouMeanContainer);
  } else {
    // Fallback: insert after close button if no search container
    const closeBtn = headerDiv.querySelector('.langbro-close-btn');
    if (closeBtn) {
      closeBtn.insertAdjacentElement('afterend', didYouMeanContainer);
    } else {
      headerDiv.appendChild(didYouMeanContainer);
    }
  }

  console.log('CONTENT: Did-you-mean suggestions displayed:', suggestions.length, 'words');
}

// ===== LOOKUP ICONS FUNCTIONALITY =====

// Show multiple lookup icons near the selection
function showLookupIcons(selection) {
  // Hide existing icons
  hideLookupIcons();

// Check if extension is enabled
if (!settings.current.extensionEnabled) {
  console.log('Extension is disabled, skipping icon display');
  return;
}

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

// Handle single-click word marking for specific group
function handleSingleClickWordMarking(x, y, group) {
  console.log(`Single-click word marking for group: ${group.name} (${group.id}) at (${x}, ${y})`);


 // Special case: if group ID is "selectWord", just select the word and show icons without lookup
  if (group.id === 'selectWord') {
    console.log('RxJS: selectWord mode - selecting word and showing icons only');

    // Get the word under the cursor
    const word = getWordUnderCursor(x, y);
    if (!word) {
      console.log('RxJS: No word found under cursor');
      return;
    }

    console.log(`RxJS: Found word under cursor: "${word}"`);

    // Select the word visually in the document
    selectWordUnderCursor(x, y, word);

    console.log('RxJS: selectWord mode - word selected, lookup icons should now appear');
    return;
  }

  // Normal single-click behavior: prevent lookup icons from appearing during single-click word marking


  // Prevent lookup icons from appearing during single-click word marking
  window.skipIconDisplay = true;
  // Clear the flag after the selection event has been processed, !! min 400ms (to prevent racing condition with lookup icons)
  setTimeout(() => delete window.skipIconDisplay, 500);

  // Get the word under the cursor
  const word = getWordUnderCursor(x, y);
  if (!word) {
    console.log('RxJS: No word found under cursor');
    return;
  }

  console.log(`RxJS: Found word under cursor: "${word}"`);

  // Select the word visually in the document
  selectWordUnderCursor(x, y, word);

  // Update settings store with current selection
  updateCurrentSelection(window.getSelection(), word);

  // Show result window immediately with spinner and the clicked word
  const locationInfo = showResult(null, group, null, word);
  lookupWord(word, group, locationInfo);
  
}

// Select the word under cursor to highlight it visually
function selectWordUnderCursor(x, y, targetWord) {
  try {
    // Get the element at the click position
    const element = document.elementFromPoint(x, y);

    // Find the text node that contains the clicked position
    let textNode = null;
    let clickOffset = 0;

    // Check if the element itself is a text node
    if (element.nodeType === Node.TEXT_NODE) {
      textNode = element;
    } else {
      // Find text nodes within the element
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

      while (walker.nextNode()) {
        const currentNode = walker.currentNode;
        const rect = document.createRange();
        rect.selectNodeContents(currentNode);
        const rectBounds = rect.getBoundingClientRect();
        if (rectBounds.left <= x && rectBounds.right >= x && rectBounds.top <= y && rectBounds.bottom >= y) {
          textNode = currentNode;
          break;
        }
      }
    }

    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      const textContent = textNode.textContent;

      // Calculate the character offset in the text node
      let caretPosition = null;

      if (document.caretRangeFromPoint) {
        // Chrome/Edge/Safari
        const range = document.caretRangeFromPoint(x, y);
        if (range && (range.startContainer === textNode || textNode.contains(range.startContainer))) {
          caretPosition = range.startOffset;
        }
      } else if (document.caretPositionFromPoint) {
        // Firefox
        caretPosition = document.caretPositionFromPoint(x, y);
        if (caretPosition && (caretPosition.offsetNode === textNode || textNode.contains(caretPosition.offsetNode))) {
          caretPosition = caretPosition.offset;
        } else {
          caretPosition = null;
        }
      }

      if (caretPosition !== null) {
        // Count characters to this position
        const tempRange = document.createRange();
        tempRange.setStart(textNode, 0);
        tempRange.setEnd(textNode, caretPosition);
        const charOffset = tempRange.toString().length;

        // Use Intl.Segmenter to find the exact word boundaries
        try {
          const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
          const segments = segmenter.segment(textContent);
          let wordStart = -1;
          let wordEnd = -1;

          // Find the segment that contains the click position
          for (const segment of segments) {
            if (segment.index <= charOffset && charOffset < segment.index + segment.segment.length) {
              wordStart = segment.index;
              wordEnd = segment.index + segment.segment.length;
              break;
            }
          }

          if (wordStart !== -1 && wordEnd !== -1) {
            // Create a range for the word and select it
            const selection = window.getSelection();
            const range = document.createRange();

            // Find the character positions in the text node
            let charsCounted = 0;
            let rangeStartOffset = 0;
            let rangeEndOffset = 0;

            for (let i = 0; i < textNode.length; i++) {
              const charRange = document.createRange();
              charRange.setStart(textNode, i);
              charRange.setEnd(textNode, i + 1);
              const charLength = charRange.toString().length;

              if (charsCounted <= wordStart && wordStart < charsCounted + charLength) {
                rangeStartOffset = i;
              }
              if (charsCounted < wordEnd && wordEnd <= charsCounted + charLength) {
                rangeEndOffset = i + 1;
                break;
              }

              charsCounted += charLength;
            }

            // Set the range for the word
            range.setStart(textNode, rangeStartOffset);
            range.setEnd(textNode, rangeEndOffset);

            // Clear any existing selection and select the word
            selection.removeAllRanges();
            selection.addRange(range);

            console.log(`RxJS: Selected word "${targetWord}" in document`);
          }
        } catch (error) {
          console.error('Intl.Segmenter error during selection:', error);
          // Fallback to basic word selection
          selectWordBasic(textNode, textContent, charOffset, targetWord);
        }
      }
    }
  } catch (error) {
    console.error('Error selecting word under cursor:', error);
  }
}

// Fallback function to select word using basic text boundaries
function selectWordBasic(textNode, textContent, charOffset, targetWord) {
  try {
    // Find word boundaries around the offset
    let wordStart = charOffset;
    let wordEnd = charOffset;

    // Expand left until space or punctuation
    while (wordStart > 0 && !/\s|[.,!?;:]/.test(textContent[wordStart - 1])) {
      wordStart--;
    }

    // Expand right until space or punctuation
    while (wordEnd < textContent.length && !/\s|[.,!?;:]/.test(textContent[wordEnd])) {
      wordEnd++;
    }

    // Create ranges to find character positions
    const fullRange = document.createRange();
    fullRange.selectNodeContents(textNode);
    const fullText = fullRange.toString();

    let startOffset = 0;
    let endOffset = 0;
    let charsProcessed = 0;

    for (let i = 0; i < textNode.length; i++) {
      const charRange = document.createRange();
      charRange.setStart(textNode, i);
      charRange.setEnd(textNode, i + 1);
      const charLength = charRange.toString().length;

      if (charsProcessed <= wordStart && wordStart < charsProcessed + charLength) {
        startOffset = i;
      }
      if (charsProcessed < wordEnd && wordEnd <= charsProcessed + charLength) {
        endOffset = i + 1;
        break;
      }

      charsProcessed += charLength;
    }

    // Select the word
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode, startOffset);
    range.setEnd(textNode, endOffset);
    selection.removeAllRanges();
    selection.addRange(range);

    console.log(`RxJS: Selected word "${targetWord}" in document (basic method)`);
  } catch (error) {
    console.error('Error in basic word selection:', error);
  }
}

// Select the paragraph under cursor to highlight it visually
function selectParagraphUnderCursor(x, y) {
  try {
    // Get the element at the click position
    const element = document.elementFromPoint(x, y);

    if (!element) {
      console.log('RxJS: No element found under cursor for paragraph selection');
      return false;
    }

    // Find the closest P or DIV element (paragraph container)
    let paragraphElement = element;
    while (paragraphElement && paragraphElement !== document.body) {
      if (paragraphElement.tagName === 'P' || paragraphElement.tagName === 'DIV') {
        break;
      }
      paragraphElement = paragraphElement.parentElement;
    }

    if (!paragraphElement || paragraphElement === document.body) {
      console.log('RxJS: No suitable paragraph element found under cursor');
      return false;
    }

    // Select all text content of the paragraph element
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(paragraphElement);

    // Clear any existing selection and select the paragraph
    selection.removeAllRanges();
    selection.addRange(range);

    console.log(`RxJS: Selected paragraph in document: "${paragraphElement.textContent.trim().substring(0, 50)}..."`);
    return true;
  } catch (error) {
    console.error('Error selecting paragraph under cursor:', error);
    return false;
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
      settings: group.settings,
      context: settings.current.currentSelection?.context || ''
    };

    chrome.runtime.sendMessage(message, async (response) => {
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

        // For offline queries, also check for did-you-mean suggestions
        await fetchAndShowDidYouMeanSuggestions(word, group, locationInfo);
      } else {
        const groupLabel = createGroupLabel(group);
        showResult(`No definition found for "${word}" in ${groupLabel}.`, group, locationInfo);

        // For offline queries with no definition found, still check for did-you-mean suggestions
        await fetchAndShowDidYouMeanSuggestions(word, group, locationInfo);
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

// Global array to store active subscriptions for cleanup
let activeSubscriptions = [];

// Function to teardown all event listeners
function teardownEventListeners() {
  console.log('RxJS: Tearing down event listeners');
  activeSubscriptions.forEach(sub => sub.unsubscribe());
  activeSubscriptions = [];
  // Clean up UI
  hideLookupIcons();
}

// Connect RxJS streams to display functions
function setupEventListeners() {
  // console.log('RxJS: Setting up event listeners');

  // Connect selection stream to show lookup icons
  const selectionSub = selection$.subscribe(({ selection, selectedText }) => {
    console.log('RxJS: selection stream fired - selectedText:', selectedText, 'skipIconDisplay:', window.skipIconDisplay);
    if (selectedText && !window.skipIconDisplay) {
      updateCurrentSelection(selection, selectedText);
      showLookupIcons(selection);
    } else if (!selectedText && !window.skipIconDisplay) {
      settings.update({ currentSelection: null });
      hideLookupIcons();
    }
  });
  activeSubscriptions.push(selectionSub);

  // Connect icon click stream to handle icon clicks
  const iconClickSub = iconClick$.subscribe(({ icon, originalEvent }) => {
    const groupId = icon.dataset.groupId;
    const group = settings.current.queryGroups.find(g => g.id === groupId);
    if (group && settings.current.currentSelection) {
      handleIconClick(originalEvent, group);
    }
  });
  activeSubscriptions.push(iconClickSub);

  // Connect document click stream to hide result windows
  const documentClickSub = documentClick$.subscribe(() => {
    // Hide popup result divs if clicked outside and hideOnClickOutside is enabled
    settings.current.resultDivs.forEach(div => {
      if (div && div.dataset.hideOnClickOutside === 'true') {
        div.style.display = 'none';
      }
    });
    // Note: Inline and bottom panel result divs do not auto-hide on click outside
  });
  activeSubscriptions.push(documentClickSub);

  // Connect runtime message stream to handle background script messages
  const runtimeMessageSub = runtimeMessage$.subscribe(({ message, sender, sendResponse }) => {
    if (message.action === 'updateQueryGroups') {
      settings.update({ queryGroups: message.groups || [] });
      // Update icons if word is currently selected
      if (settings.current.currentSelection && settings.current.currentSelection.selectedText) {
        const selection = window.getSelection();
        if (selection.toString().trim()) {
          showLookupIcons(selection);
        }
      }
    } else if (message.action === 'extensionEnabledChanged') {
      settings.update({ extensionEnabled: message.enabled });
      console.log('Extension enabled state changed:', message.enabled);

      if (message.enabled) {
        // Re-enable all event listeners
        setupEventListeners();
      } else {
        // Disable all event listeners
        teardownEventListeners();
        // Clean up UI
        hideLookupIcons();
      }
    }
  });
  activeSubscriptions.push(runtimeMessageSub);

  // Connect single-click word marking stream
  const singleClickSub = singleClickWordMarking$.subscribe(({ groupId, x, y, target }) => {
    let group = settings.current.queryGroups.find(g => g.id === groupId);
    if (!group && groupId === 'selectWord') {
      // Special case: create a placeholder group for selectWord functionality
      group = { id: 'selectWord', name: 'Select Word', icon: '🎯' };
    }
    if (group) {  // handles singleClickGroupId: "valid_groupId" or "selectWord"
      handleSingleClickWordMarking(x, y, group);
    }
  });
  activeSubscriptions.push(singleClickSub);

  // Connect swipe gesture stream
  settings.select('rightSwipeGroupId').subscribe(rightSwipeGroupId => {
    if (rightSwipeGroupId && rightSwipeGroupId !== '') {
      const swipeSubscription = swipe$.subscribe(({ direction, x, y }) => {
        if (direction === 'right') {
          console.log('RxJS: Right swipe detected, executing group:', rightSwipeGroupId);
          const group = settings.current.queryGroups.find(g => g.id === rightSwipeGroupId);
          if (group) {
            // Check if text is already selected
            const currentSelection = window.getSelection();
            const hasSelectedText = currentSelection && currentSelection.toString().trim();

            let selectedText = '';
            let selectionSuccess = false;
            let range = null;

            if (hasSelectedText) {
              // Use existing selection
              selectedText = currentSelection.toString().trim();
              range = currentSelection.getRangeAt(0).cloneRange();
              console.log(`RxJS: Using existing selection for right swipe: "${selectedText}"`);
              selectionSuccess = true;
            } else {
              // Select text based on group's textSelectionMethod
              const textSelectionMethod = group.textSelectionMethod || 'selectedText';
              console.log(`RxJS: Right swipe - selecting text using method: ${textSelectionMethod}`);
              if (selectParagraphUnderCursor(x, y)) {
                // Capture the range and text before clearing selection
                const selection = window.getSelection();
                range = selection.getRangeAt(0).cloneRange();
                selectedText = selection.toString().trim();

                // Clear the visual selection immediately
                selection.removeAllRanges();
              }
              // selectedText = selectTextUnderCursor(x, y, textSelectionMethod);
              selectionSuccess = selectedText !== null;
            }

            if (selectionSuccess && selectedText) {
              console.log(`RxJS: Right swipe lookup with text: "${selectedText.substring(0, 50)}..."`);

              // Update currentSelection with targetElement for inline display support
              // Use the captured range since we cleared the visual selection
              let targetElement = range.commonAncestorContainer;

              // If it's a text node, get the parent element
              if (targetElement.nodeType === Node.TEXT_NODE) {
                targetElement = targetElement.parentElement;
              }

              // Find the closest text-containing element
              const closestElement = findClosestTextElement(targetElement);

              // Calculate context for selected text
              let context = '';
              if (selectedText && selectedText.trim()) {
                context = calculateContext(range, selectedText);
              }

              settings.update({
                currentSelection: {
                  selectedText: selectedText,
                  wholeWord: getWholeWord({ getRangeAt: () => range, rangeCount: 1 }),
                  wholeParagraph: getWholeParagraph({ getRangeAt: () => range, rangeCount: 1 }),
                  targetElement: closestElement,
                  context: context,
                  range: {
                    startContainer: range.startContainer,
                    startOffset: range.startOffset,
                    endContainer: range.endContainer,
                    endOffset: range.endOffset
                  }
                }
              });

              // Show result window
              const locationInfo = showResult(null, group, null, selectedText);
              lookupWord(selectedText, group, locationInfo);
            } else {
              console.log('RxJS: No text found/selected for right swipe');
            }
          }
        }
      });
      // Store the subscription so it can be cleaned up if settings change
      window.currentSwipeSubscription = swipeSubscription;
    } else {
      // Unsubscribe if rightSwipeGroupId is cleared
      if (window.currentSwipeSubscription) {
        window.currentSwipeSubscription.unsubscribe();
        window.currentSwipeSubscription = null;
      }
    }
  });

  // Connect storage change stream to update settings dynamically
  // Note: Settings store automatically handles reactive updates from storage
  // No manual listener needed - the settings store subscribes to chrome.storage.onChanged

  console.log('RxJS: Event listeners setup complete');
}

// ===== TEXT SELECTION UTILITIES =====

// Function to extract word under cursor using Intl.Segmenter for Thai language support
function getWordUnderCursor(x, y) {
  // Get the element at the click position
  const element = document.elementFromPoint(x, y);

  // Find the text node that contains the clicked position
  let textNode = null;
  let clickOffset = 0;

  // Check if the element itself is a text node
  if (element.nodeType === Node.TEXT_NODE) {
    textNode = element;
  } else {
    // Find text nodes within the element
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const currentNode = walker.currentNode;
      const rect = document.createRange();
      rect.selectNodeContents(currentNode);
      const rectBounds = rect.getBoundingClientRect();
      if (rectBounds.left <= x && rectBounds.right >= x && rectBounds.top <= y && rectBounds.bottom >= y) {
        textNode = currentNode;
        break;
      }
    }
  }

  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    const textContent = textNode.textContent;

    // Calculate the character offset in the text node
    // Handle different browser APIs for getting caret position
    let caretPosition = null;

    if (document.caretRangeFromPoint) {
      // Chrome/Edge/Safari
      const range = document.caretRangeFromPoint(x, y);
      if (range && (range.startContainer === textNode || textNode.contains(range.startContainer))) {
        caretPosition = range.startOffset;
      }
    } else if (document.caretPositionFromPoint) {
      // Firefox
      caretPosition = document.caretPositionFromPoint(x, y);
      if (caretPosition && (caretPosition.offsetNode === textNode || textNode.contains(caretPosition.offsetNode))) {
        caretPosition = caretPosition.offset;
      } else {
        caretPosition = null;
      }
    }

    if (caretPosition !== null) {
      // Count characters to this position
      const tempRange = document.createRange();
      tempRange.setStart(textNode, 0);
      tempRange.setEnd(textNode, caretPosition);
      clickOffset = tempRange.toString().length;
    }

    // Use Intl.Segmenter to segment the text into words
    try {
      const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
      const segments = segmenter.segment(textContent);

      // Find the segment that contains the click position
      for (const segment of segments) {
        if (segment.index <= clickOffset && clickOffset < segment.index + segment.segment.length) {
          return segment.segment.trim();
        }
      }
    } catch (error) {
      console.error('Intl.Segmenter error:', error);
      // Fallback to basic word extraction
      return getWordAtOffset(textContent, clickOffset);
    }
  }

  return '';
}

// Fallback function to extract word at character offset without Intl.Segmenter
function getWordAtOffset(text, offset) {
  // Find word boundaries around the offset
  let wordStart = offset;
  let wordEnd = offset;

  // Expand left until space or punctuation
  while (wordStart > 0 && !/\s|[.,!?;:]/.test(text[wordStart - 1])) {
    wordStart--;
  }

  // Expand right until space or punctuation
  while (wordEnd < text.length && !/\s|[.,!?;:]/.test(text[wordEnd])) {
    wordEnd++;
  }

  const word = text.substring(wordStart, wordEnd).trim();
  return word;
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

// Function to calculate context around selected text
// This calculates words before and after the selection based on AI group settings
function calculateContext(range, selectedText) {
  if (!range || !selectedText || !selectedText.trim()) return '';

  try {
    // Get AI groups to determine maximum context needed and if complete context is requested
    const aiGroups = settings.current.queryGroups.filter(group =>
      group.queryType === 'ai' &&
      group.enabled &&
      group.settings?.sendContext
    );

    if (aiGroups.length === 0) return selectedText; // No AI groups need context

    // Check if any enabled AI group needs complete context
    const usesCompleteContext = aiGroups.some(group => group.settings?.completeContext);

    if (usesCompleteContext) {
      return calculateCompleteContext(range, selectedText, aiGroups);
    } else {
      return calculateLimitedContext(range, selectedText, aiGroups);
    }
  } catch (error) {
    console.error('Error calculating context:', error);
    return selectedText; // Fallback to selected text
  }
}

// Calculate context from surrounding elements (complete context mode)
function calculateCompleteContext(range, selectedText, aiGroups) {
  // Get maximum words needed
  const maxWordsBefore = Math.max(...aiGroups.map(g => g.settings.wordsBefore || 40));
  const maxWordsAfter = Math.max(...aiGroups.map(g => g.settings.wordsAfter || 40));

  // Get all text from surrounding elements
  const collectTextAroundSelection = (range) => {
    let currentElement = range.startContainer;
    if (currentElement.nodeType === Node.TEXT_NODE) {
      currentElement = currentElement.parentNode;
    }

    // Start with current element and traverse up and sideways
    const elements = [];
    const maxDepth = 3; // Limit traversal depth

    // Add current element
    elements.push(currentElement);

    // Add sibling elements before and after
    let sibling = currentElement.previousElementSibling;
    let countBefore = 0;
    while (sibling && countBefore < 5) { // Limit siblings
      elements.unshift(sibling);
      sibling = sibling.previousElementSibling;
      countBefore++;
    }

    sibling = currentElement.nextElementSibling;
    let countAfter = 0;
    while (sibling && countAfter < 5) { // Limit siblings
      elements.push(sibling);
      sibling = sibling.nextElementSibling;
      countAfter++;
    }

    // Add parent elements (limited depth)
    for (let parent = currentElement.parentElement, depth = 0;
         parent && parent !== document.body && depth < maxDepth;
         parent = parent.parentElement, depth++) {
      // Add parent before current element content
      const parentIndex = elements.indexOf(elements.find(el => el === currentElement || el.contains(currentElement)));
      if (parentIndex !== -1) {
        elements.splice(parentIndex, 0, parent);
      } else {
        elements.unshift(parent);
      }
    }

    // Collect all text content from these elements
    return elements
      .filter(el => el && el.textContent)
      .map(el => el.textContent.trim())
      .filter(text => text.length > 0)
      .join(' ');
  };

  const fullContextText = collectTextAroundSelection(range);

  // Now extract words around the selected text within this context
  const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
  const segments = Array.from(segmenter.segment(fullContextText));
  const words = segments.map(s => s.segment).filter(word => word.trim().length > 0);

  // Find the selection in the context text (approximate)
  const selectedIndex = fullContextText.indexOf(selectedText);
  if (selectedIndex === -1) return selectedText;

  // Count words to the selection point
  let wordCount = 0;
  let selectionStartWord = -1;
  let charOffset = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const wordStart = charOffset;
    const wordEnd = wordStart + segment.segment.length;

    if (wordStart <= selectedIndex && selectedIndex < wordEnd) {
      selectionStartWord = i;
      break;
    }

    if (segment.segment.trim()) {
      wordCount++;
    }
    charOffset += segment.segment.length;
  }

  if (selectionStartWord === -1) return selectedText;

  // Extract context words
  const startIndex = Math.max(0, selectionStartWord - maxWordsBefore);
  const endIndex = Math.min(words.length - 1, selectionStartWord + selectedText.split(/\s+/).length + maxWordsAfter);

  const contextWords = words.slice(startIndex, endIndex + 1);
  return contextWords.join(' ').trim();
}

// Calculate context from limited text node (standard mode)
function calculateLimitedContext(range, selectedText, aiGroups) {
  let node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) {
    // If not a text node, find the first text node descendant
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    node = walker.nextNode();
    if (!node) return selectedText;
  }

  const fullText = node.textContent;
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;

  // Use the maximum context settings from enabled AI groups
  const maxWordsBefore = Math.max(...aiGroups.map(g => g.settings.wordsBefore || 40));
  const maxWordsAfter = Math.max(...aiGroups.map(g => g.settings.wordsAfter || 40));

  // Split text into words using Intl.Segmenter for Thai language support
  const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
  const segments = Array.from(segmenter.segment(fullText));
  const words = segments.map(s => s.segment).filter(word => word.trim().length > 0);

  // Find which words are included in the selection
  let selectedWords = [];
  let wordStartIndex = -1;
  let wordEndIndex = -1;

  let charCount = 0;
  for (let i = 0; i < words.length; i++) {
    const wordStart = charCount;
    const wordLength = words[i].length;
    const wordEnd = wordStart + wordLength;

    if (wordStart < endOffset && startOffset < wordEnd) {
      if (wordStartIndex === -1) wordStartIndex = i;
      selectedWords.push(words[i]);
      wordEndIndex = i;
    }

    charCount += wordLength;
  }

  if (selectedWords.length === 0) return selectedText;

  // Calculate context indices
  const startIndex = Math.max(0, wordStartIndex - maxWordsBefore);
  const endIndex = Math.min(words.length - 1, wordEndIndex + maxWordsAfter);

  // Extract context words
  const contextWords = words.slice(startIndex, endIndex + 1);

  return contextWords.join('');
}

// ===== DARK MODE MANAGEMENT =====

// Apply dark mode to document body based on settings
function setupDarkModeListener() {
  // console.log('RxJS: Setting up dark mode listener');

  // Subscribe to dark mode changes
  settings.select('isDarkMode').subscribe(isDarkMode => {
    // console.log('RxJS: Dark mode updated:', isDarkMode);

    if (isDarkMode) {
      document.body.classList.add('langbro-dark');
    } else {
      document.body.classList.remove('langbro-dark');
    }


  });
}


// ===== SCROLL REPOSITIONING =====

// Flag to track if repositioning is already scheduled
let repositionScheduled = false;

// Function to reposition popup result divs during scrolling with RAF throttling
function repositionPopupsOnScroll() {
  if (!repositionScheduled) {
    repositionScheduled = true;
    requestAnimationFrame(() => {
      settings.current.resultDivs.forEach(resultDiv => {
        if (resultDiv && resultDiv.style.display !== 'none' &&
            resultDiv.dataset.documentLeft && resultDiv.dataset.documentTop) {
          const documentLeft = parseFloat(resultDiv.dataset.documentLeft);
          const documentTop = parseFloat(resultDiv.dataset.documentTop);

          // Convert to viewport coordinates for fixed positioning
          const viewportLeft = documentLeft - window.scrollX;
          const viewportTop = documentTop - window.scrollY;

          resultDiv.style.left = viewportLeft + 'px';
          resultDiv.style.top = viewportTop + 'px';
        }
      });
      repositionScheduled = false;
    });
  }
}

// ===== INITIALIZATION =====

// Initialize extension - settings store loads automatically
async function init() {
  // console.log('----------init-----------');
  setupEventListeners();
  setupDarkModeListener();

  // Add scroll event listener for popup repositioning
  window.addEventListener('scroll', repositionPopupsOnScroll, { passive: true });

  console.log('RxJS Content script initialization complete');
}

// Start initialization
init();
