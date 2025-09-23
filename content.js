// Content script for WordClick Dictionary
// Handles text selection and displays lookup icon and results

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
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

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
    console.log('# icon');
    lookupIcon = document.createElement('div');
    lookupIcon.textContent = '#';
    lookupIcon.style.position = 'absolute';
    lookupIcon.style.backgroundColor = 'yellow';
    lookupIcon.style.border = '1px solid #ccc';
    lookupIcon.style.borderRadius = '3px';
    lookupIcon.style.padding = '2px 4px';
    lookupIcon.style.cursor = 'pointer';
    lookupIcon.style.zIndex = '999999';
    lookupIcon.style.fontSize = '14px';
    lookupIcon.style.fontWeight = 'bold';
    lookupIcon.addEventListener('click', handleIconClick);
    lookupIcon.addEventListener('mousedown', (e) => {
      console.log('mousedown on icon');
      e.preventDefault();
      e.stopPropagation();
      handleIconClick();
    });
    document.body.appendChild(lookupIcon);
  }

  // Position the icon near the selection
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const left = rect.left + window.scrollX;
  const top = rect.bottom + window.scrollY + 5;
  lookupIcon.style.left = left + 'px';
  lookupIcon.style.top = top + 'px';
  lookupIcon.style.display = 'block';
  console.log('Icon positioned at:', left, top);
}

// Hide the lookup icon
function hideLookupIcon() {
  if (lookupIcon) {
    lookupIcon.style.display = 'none';
  }
}

// Handle icon click
function handleIconClick() {
  console.log('# icon clicked');
  console.log('Selected word:', selectedWord);

  if (selectedWord) {
    hideLookupIcon(); // Hide the icon after click
    // For testing, show lorem ipsum instead of lookup
    showResult("Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.");
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
  console.log('showResult called with:', definition);
  resultJustShown = true;
  if (!resultDiv) {
    resultDiv = document.createElement('div');
    resultDiv.style.setProperty('position', 'absolute', 'important');
    resultDiv.style.setProperty('width', '300px', 'important');
    resultDiv.style.setProperty('height', '300px', 'important');
    resultDiv.style.setProperty('background-color', 'white', 'important');
    resultDiv.style.setProperty('border', '2px solid red', 'important');
    resultDiv.style.setProperty('border-radius', '4px', 'important');
    resultDiv.style.setProperty('padding', '10px', 'important');
    resultDiv.style.setProperty('overflow-y', 'auto', 'important');
    resultDiv.style.setProperty('z-index', '999999', 'important');
    resultDiv.style.setProperty('font-size', '14px', 'important');
    resultDiv.style.setProperty('box-shadow', '0 2px 8px rgba(0,0,0,0.1)', 'important');
    resultDiv.style.setProperty('left', '100px', 'important');
    resultDiv.style.setProperty('top', '100px', 'important');
    resultDiv.style.setProperty('display', 'block', 'important');

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'X';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '5px';
    closeBtn.style.right = '5px';
    closeBtn.style.background = 'red';
    closeBtn.style.color = 'white';
    closeBtn.style.border = 'none';
    closeBtn.style.borderRadius = '3px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => {
      resultDiv.style.display = 'none';
    };
    resultDiv.appendChild(closeBtn);

    document.body.appendChild(resultDiv);
    console.log('resultDiv created and appended');
  }

  resultDiv.textContent = definition;
  // Re-add close button since textContent clears it
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'X';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '5px';
  closeBtn.style.right = '5px';
  closeBtn.style.background = 'red';
  closeBtn.style.color = 'white';
  closeBtn.style.border = 'none';
  closeBtn.style.borderRadius = '3px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.onclick = () => {
    resultDiv.style.display = 'none';
  };
  resultDiv.appendChild(closeBtn);

  resultDiv.style.display = 'block';
  console.log('resultDiv displayed');
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
