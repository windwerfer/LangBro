// Popup script for WordClick Dictionary
document.addEventListener('DOMContentLoaded', () => {
  const optionsBtn = document.getElementById('optionsBtn');
  const statusDiv = document.getElementById('status');

  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Show current dictionary status
  checkStatus();
});

function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = type;
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
