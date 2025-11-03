// Simple Dictionary page script
document.addEventListener('DOMContentLoaded', async () => {
  const resultDiv = document.getElementById('resultDiv');
  const searchInput = document.querySelector('.langbro-search-input');
  const contentDiv = document.querySelector('.langbro-result-content');
  const closeBtn = document.querySelector('.langbro-close-btn');

  // Close button closes the tab
  closeBtn.addEventListener('click', () => {
    window.close();
  });

  // Load settings
  let settings = {};
  let selectedGroup = null;

  try {
    const result = await chrome.storage.local.get(['simpleDictGroup', 'isDarkMode', 'queryGroups']);
    settings.isDarkMode = result.isDarkMode || false;
    const groupId = result.simpleDictGroup;
    if (groupId && result.queryGroups) {
      selectedGroup = result.queryGroups.find(g => g.id === groupId);
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }

  // Apply dark mode
  if (settings.isDarkMode) {
    resultDiv.classList.add('langbro-dark');
  }

  // Check if group is selected and has search field
  if (!selectedGroup || !selectedGroup.showSearchField || selectedGroup.showSearchField === 'none') {
    contentDiv.textContent = 'No dictionary group selected for Simple Dict. Please select one in settings that has a search field enabled.';
    searchInput.disabled = true;
    return;
  }

  // Set up search input
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();

    if (query.length === 0) {
      contentDiv.textContent = 'Enter a word to search.';
      return;
    }

    if (selectedGroup.showSearchField === 'liveResults') {
      if (query.length > 2) {
        searchTimeout = setTimeout(() => performSearch(query), 300);
      }
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      const query = searchInput.value.trim();
      if (query) {
        performSearch(query);
      }
    }
  });

  // Perform search
  async function performSearch(word) {
    // Show spinner
    contentDiv.innerHTML = '';
    const spinner = document.createElement('div');
    spinner.className = 'langbro-spinner-container';
    spinner.innerHTML = '<div class="langbro-spinner"></div><span class="langbro-spinner-text">Searching...</span>';
    contentDiv.appendChild(spinner);

    try {
      // Send lookup message
      const message = {
        action: 'lookup',
        word: word,
        groupId: selectedGroup.id,
        queryType: selectedGroup.queryType,
        settings: selectedGroup.settings,
        context: ''
      };

      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          contentDiv.textContent = `Extension error: ${chrome.runtime.lastError.message}`;
          return;
        }

        if (response && response.error) {
          contentDiv.textContent = `Lookup error: ${response.error}`;
        } else if (response && response.definition) {
          // Create group label
          const groupLabel = selectedGroup.icon && selectedGroup.icon.endsWith('.png')
            ? `<img src="${chrome.runtime.getURL(selectedGroup.icon)}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;" alt="${selectedGroup.icon}">`
            : `${selectedGroup.icon} ${selectedGroup.name}`;

          // Sanitize and display result
          const sanitizedHTML = sanitizeDictHTML(`${groupLabel}\n\n${response.definition}`);
          contentDiv.innerHTML = sanitizedHTML;
        } else {
          contentDiv.textContent = `No definition found for "${word}".`;
        }
      });
    } catch (error) {
      console.error('Error performing search:', error);
      contentDiv.textContent = `Unable to search. Please refresh the page.`;
    }
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

  // Focus search input
  searchInput.focus();
});