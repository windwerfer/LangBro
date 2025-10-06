// Popup script for langbro Dictionary
document.addEventListener('DOMContentLoaded', () => {
  const favoritesBtn = document.getElementById('favoritesBtn');
  const optionsBtn = document.getElementById('optionsBtn');
  const statusDiv = document.getElementById('status');
  const extensionToggle = document.getElementById('extensionToggle');

  favoritesBtn.addEventListener('click', () => {
    // Open favorites page in new tab
    chrome.tabs.create({ url: chrome.runtime.getURL('favorites.html') });
  });

  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Load extension enabled state
  loadExtensionEnabledState();

  // Handle extension toggle
  extensionToggle.addEventListener('change', async () => {
    const enabled = extensionToggle.checked;
    console.log('Extension toggle changed:', enabled);

    // Save to storage
    await chrome.storage.local.set({ extensionEnabled: enabled });

    // Update status message
    updateStatusForEnabledState(enabled);

    // Notify content scripts of the change
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'extensionEnabledChanged', enabled });
    });
  });

  // Show current dictionary status
  checkStatus();
});

function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = type;
}

// Load extension enabled state from storage
async function loadExtensionEnabledState() {
  try {
    const result = await chrome.storage.local.get(['extensionEnabled']);
    const enabled = result.extensionEnabled !== undefined ? result.extensionEnabled : true;
    const extensionToggle = document.getElementById('extensionToggle');
    extensionToggle.checked = enabled;
    updateStatusForEnabledState(enabled);
  } catch (error) {
    console.error('Error loading extension enabled state:', error);
  }
}

// Update status message based on extension enabled state
function updateStatusForEnabledState(enabled) {
  const statusDiv = document.getElementById('status');
  if (!enabled) {
    statusDiv.textContent = 'Extension is disabled';
    statusDiv.className = 'info';
  } else {
    // Re-check dictionary status when enabled
    checkStatus();
  }
}

// Get current dictionary status
function checkStatus() {
  chrome.runtime.sendMessage({ action: 'isLoaded' }, (response) => {
    if (chrome.runtime.lastError) {
      showStatus('Extension not responding. Please refresh the page.', 'error');
      return;
    }
    if (response && response.isLoaded) {
      showStatus(`Dictionary loaded (${response.wordCount} words)`, 'success');
    } else {
      showStatus('No dictionary loaded. Click settings to add one.', 'error');
    }
  });
}
