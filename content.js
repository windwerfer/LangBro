// Content script for WordClick Dictionary
// Handles text selection and displays lookup icon and results

console.log('Content script loaded');

let lookupIcon = null;
let resultDiv = null;
let selectedWord = '';
let resultJustShown = false;

// Listen for text selection
document.addEventListener('selectionchange', handleSelectionChange);
// document.addEventListener('mouseup', handleSelectionChange);
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
      showLookupIcon(selection);
    } else {
      hideLookupIcon();
    }
  } else {
    hideLookupIcon();
  }
}

// Show the lookup icon near the selection
function showLookupIcon(selection) {
  if (!lookupIcon) {
    lookupIcon = document.createElement('div');
    lookupIcon.textContent = '#';
    lookupIcon.style.position = 'absolute';
    lookupIcon.style.borderRadius = '3px';
    lookupIcon.style.padding = '2px 4px';
    lookupIcon.style.cursor = 'pointer';
    lookupIcon.style.zIndex = '999999';
    lookupIcon.style.fontSize = '14px';
    lookupIcon.style.fontWeight = 'bold';
    lookupIcon.addEventListener('click', handleIconClick);
    lookupIcon.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleIconClick();
    });
    document.body.appendChild(lookupIcon);
  }

  // Apply dark mode styling if enabled
  chrome.storage.local.get(['darkMode'], (result) => {
    const isDarkMode = result.darkMode || false;
    if (isDarkMode) {
      lookupIcon.style.backgroundColor = 'black';
      lookupIcon.style.color = 'gray';
      lookupIcon.style.border = '1px solid gray';
    } else {
      lookupIcon.style.backgroundColor = 'white';
      lookupIcon.style.color = 'black';
      lookupIcon.style.border = '1px solid #ccc';
    }
  });

  // Position the icon on the right side of the screen, 5px above the selection
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const left = window.innerWidth + window.scrollX - 30 - 5; // Approximate button width 30px + 5px margin
  const top = rect.top + window.scrollY - 5;
  lookupIcon.style.left = left + 'px';
  lookupIcon.style.top = top + 'px';
  lookupIcon.style.display = 'block';
}

// Hide the lookup icon
function hideLookupIcon() {
  if (lookupIcon) {
    lookupIcon.style.display = 'none';
  }
}

// Handle icon click
function handleIconClick() {
  if (selectedWord) {
    hideLookupIcon(); // Hide the icon after click
    lookupWord(selectedWord);
  }
}

// Lookup the word via background script
function lookupWord(word) {
  try {
    chrome.runtime.sendMessage({ action: 'lookup', word: word }, (response) => {
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
        showResult(`Lookup error: ${response.error}`);
      } else if (response && response.definition) {
        showResult(response.definition);
      } else {
        showResult('No definition found for this word.');
      }
    });
  } catch (error) {
    showResult('Unable to connect to dictionary. Please refresh the page.');
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
