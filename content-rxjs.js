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
// Merges selectionchange, keyup, and mousedown events to track all selection changes
const selection$ = merge(
  fromEvent(document, 'selectionchange'),
  fromEvent(document, 'keyup'),
  fromEvent(document, 'mousedown')  // For faster response to selection changes
).pipe(
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
// Use reactive settings to determine buffer time and handle single-click word marking
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
        time: clicks[0].time,
        x: clicks[0].x,
        y: clicks[0].y
      }))
    );
  })
);

// Log click sequences
clickSequence$.subscribe(({ count, target }) => {
  const clickType = count === 1 ? 'single' : count === 2 ? 'double' : count === 3 ? 'triple' : `${count}`;
  console.log('RxJS: User clicked on text:', clickType, 'click');
});

// Single-click word marking stream when singleClickGroupId is set (use mouseup to avoid browser clearing selection)
const singleClickWordMarking$ = combineLatest([
  settings.select('singleClickGroupId'),
  mouseUp$.pipe(
    filter(event => !settings.current.currentSelection?.selectedText) // Only when no text is selected
  )
]).pipe(
  filter(([singleClickGroupId, clickEvent]) => singleClickGroupId && singleClickGroupId !== ''),
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
        // Use persistent selection if available, otherwise current selection
        let selection = window.getSelection();
        if (!selection.rangeCount > 0 && savedRange) {
          // Temporarily restore the selection for positioning
          selection.removeAllRanges();
          selection.addRange(savedRange);
        }

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

// Add suggestions event handlers to a search input
function addSuggestionsHandlers(searchInput, resultDiv, group, boxId) {
  let suggestionsTimeout;
  let blurTimeout;

  searchInput.addEventListener('input', () => {
    clearTimeout(suggestionsTimeout);
    const query = searchInput.value.trim();

    if (query.length > 0) {
      suggestionsTimeout = setTimeout(async () => {
        try {
          // console.log('CONTENT: Requesting suggestions for word:', query, 'dictionaries:', group.settings?.selectedDictionaries);
          const response = await chrome.runtime.sendMessage({
            action: 'getSuggestions',
            word: query,
            maxResults: group.displaySuggestions || 20,
            selectedDictionaries: group.settings?.selectedDictionaries || []
          });
          // console.log('CONTENT: Received suggestions response:', response);

          if (response.suggestions && response.suggestions.length > 0) {
            // console.log('CONTENT: Showing suggestions:', response.suggestions);
            showSuggestions(response.suggestions, searchInput, resultDiv, group, boxId);
          } else {
            // console.log('CONTENT: No suggestions to show, hiding dropdown');
            hideSuggestions(resultDiv);
          }
        } catch (error) {
          console.error('CONTENT: Error getting suggestions:', error);
          hideSuggestions(resultDiv);
        }
      }, 300); // 0.3 second delay for suggestions
    } else {
      // console.log('CONTENT: Query is empty, hiding suggestions');
      hideSuggestions(resultDiv);
    }
  });

  // Show suggestions when input gains focus or is clicked (if it has content)
  const showSuggestionsIfContent = async () => {
    clearTimeout(blurTimeout); // Cancel any pending blur timeout
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
    }
  };

  searchInput.addEventListener('focus', showSuggestionsIfContent);
  searchInput.addEventListener('click', showSuggestionsIfContent);

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
    searchButton.innerHTML = '🔍';

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
      performSearch(suggestion, group, resultDiv, boxId);
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
  // First check if result div exists in tracking array
  let inlineDiv = settings.current.inlineDivs.find(div => div.dataset.boxId == boxId);

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

    // Create header div for close button and search field
    const headerDiv = document.createElement('div');
    headerDiv.className = 'langbro-result-header';

    // Create content div for scrollable content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'langbro-result-content';

    // Add close button to header
    const closeBtn = createCloseButton(inlineDiv);
    headerDiv.appendChild(closeBtn);

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
  window.skipIconDisplay = true;
  // Clear the flag after the selection event has been processed
  setTimeout(() => delete window.skipIconDisplay, 200);

  // Get the word under the cursor
  const word = getWordUnderCursor(x, y);
  if (!word) {
    console.log('RxJS: No word found under cursor');
    return;
  }

  console.log(`RxJS: Found word under cursor: "${word}"`);

  // Select the word visually in the document
  selectWordUnderCursor(x, y, word);

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
  // console.log('RxJS: Setting up event listeners');

  // Connect selection stream to show lookup icons
  selection$.subscribe(({ selection, selectedText }) => {
    console.log('RxJS: selection stream fired - selectedText:', selectedText, 'skipIconDisplay:', window.skipIconDisplay);
    if (selectedText && !window.skipIconDisplay) {
      // Extract selection details and target element
      const range = selection.getRangeAt(0);
      let targetElement = range.commonAncestorContainer;

      // If it's a text node, get the parent element
      if (targetElement.nodeType === Node.TEXT_NODE) {
        targetElement = targetElement.parentElement;
      }

      // Find the closest text-containing element
      let closestElement = targetElement;
      while (closestElement && closestElement !== document.body) {
        const acceptableTags = ['P', 'DIV', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'ARTICLE', 'SECTION'];
        if (acceptableTags.includes(closestElement.tagName)) {
          break;
        }
        closestElement = closestElement.parentElement;
      }

    // Calculate context immediately for selected text
    let context = '';
    if (selectedText && selectedText.trim()) {
      context = calculateContext(range, selectedText);
    }

    settings.update({
      currentSelection: {
        selectedText: selectedText,
        wholeWord: getWholeWord(selection),
        wholeParagraph: getWholeParagraph(selection),
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
      showLookupIcons(selection);
    } else if (!selectedText && !window.skipIconDisplay) {
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

  // Connect single-click word marking stream
  singleClickWordMarking$.subscribe(({ groupId, x, y, target }) => {
    let group = settings.current.queryGroups.find(g => g.id === groupId);
    if (!group && groupId === 'selectWord') {
      // Special case: create a placeholder group for selectWord functionality
      group = { id: 'selectWord', name: 'Select Word', icon: '🎯' };
    }
    if (group) {  // handles singleClickGroupId: "valid_groupId" or "selectWord"
      handleSingleClickWordMarking(x, y, group);
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


// ===== INITIALIZATION =====

// Initialize extension - settings store loads automatically
async function init() {
  // console.log('----------init-----------');
  setupEventListeners();
  setupDarkModeListener();
  console.log('RxJS Content script initialization complete');
}

// Start initialization
init();
