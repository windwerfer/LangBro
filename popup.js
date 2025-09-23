// Popup script for WordClick Dictionary
document.addEventListener('DOMContentLoaded', () => {
  const optionsBtn = document.getElementById('optionsBtn');
  const statusDiv = document.getElementById('status');

  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Show current dictionary status
  showStatus();
});

function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = type;
}

// Get current dictionary status
async function showStatus() {
  try {
    chrome.runtime.sendMessage({ action: 'isLoaded' }, (response) => {
      if (response.isLoaded) {
        showStatus(`Dictionary loaded (${response.wordCount} words)`, 'success');
      } else {
        showStatus('No dictionary loaded. Click settings to add one.', 'error');
      }
    });
  } catch (error) {
    showStatus('Error checking status', 'error');
  }
}
