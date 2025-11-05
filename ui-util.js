// Shared UI utilities
function createSpinner(text = 'Loading...') {
  const spinnerContainer = document.createElement('div');
  spinnerContainer.className = 'langbro-spinner-container';

  const spinner = document.createElement('div');
  spinner.className = 'langbro-spinner';

  const textSpan = document.createElement('span');
  textSpan.className = 'langbro-spinner-text';
  textSpan.textContent = text;

  spinnerContainer.appendChild(spinner);
  spinnerContainer.appendChild(textSpan);

  return spinnerContainer;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export for modules
if (typeof module !== 'undefined') {
  module.exports = { createSpinner, escapeHtml };
} else if (typeof window !== 'undefined') {
  window.createSpinner = createSpinner;
  window.escapeHtml = escapeHtml;
}