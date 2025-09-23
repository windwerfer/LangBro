// Content script for WordClick Dictionary
// Handles text selection and displays lookup icon and results

let lookupIcon = null;
let resultDiv = null;

// Listen for text selection
document.addEventListener('selectionchange', handleSelectionChange);
document.addEventListener('mouseup', handleSelectionChange);
document.addEventListener('keyup', handleSelectionChange);

// Function to handle selection changes
function handleSelectionChange() {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText) {
    // Check if it's a single word (no spaces)
    if (!selectedText.includes(' ')) {
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
    lookupIcon.style.backgroundColor = 'white';
    lookupIcon.style.border = '1px solid #ccc';
    lookupIcon.style.borderRadius = '3px';
    lookupIcon.style.padding = '2px 4px';
    lookupIcon.style.cursor = 'pointer';
    lookupIcon.style.zIndex = '10000';
    lookupIcon.style.fontSize = '14px';
    lookupIcon.style.fontWeight = 'bold';
    lookupIcon.addEventListener('click', handleIconClick);
    document.body.appendChild(lookupIcon);
  }

  // Position the icon near the selection
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  lookupIcon.style.left = (rect.left + window.scrollX) + 'px';
  lookupIcon.style.top = (rect.bottom + window.scrollY + 5) + 'px';
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
  const selection = window.getSelection();
  const word = selection.toString().trim();

  if (word) {
    lookupWord(word);
  }
}

// Lookup the word via background script
function lookupWord(word) {
  chrome.runtime.sendMessage({ action: 'lookup', word: word }, (response) => {
    if (response.error) {
      showResult(`Error: ${response.error}`);
    } else {
      showResult(response.definition);
    }
  });
}

// Show the result in a div below the text
function showResult(definition) {
  if (!resultDiv) {
    resultDiv = document.createElement('div');
    resultDiv.style.position = 'absolute';
    resultDiv.style.width = '300px';
    resultDiv.style.height = '300px';
    resultDiv.style.backgroundColor = 'white';
    resultDiv.style.border = '1px solid #ccc';
    resultDiv.style.borderRadius = '4px';
    resultDiv.style.padding = '10px';
    resultDiv.style.overflowY = 'auto';
    resultDiv.style.zIndex = '10001';
    resultDiv.style.fontSize = '14px';
    resultDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    document.body.appendChild(resultDiv);
  }

  resultDiv.textContent = definition;

  // Position below the icon
  if (lookupIcon) {
    const iconRect = lookupIcon.getBoundingClientRect();
    resultDiv.style.left = (iconRect.left + window.scrollX) + 'px';
    resultDiv.style.top = (iconRect.bottom + window.scrollY + 5) + 'px';
    resultDiv.style.display = 'block';
  }
}

// Hide result div when clicking elsewhere
document.addEventListener('click', (e) => {
  if (resultDiv && !lookupIcon.contains(e.target) && !resultDiv.contains(e.target)) {
    resultDiv.style.display = 'none';
  }
});
