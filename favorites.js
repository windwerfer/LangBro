// Favorites page script for langbro Dictionary

let currentFavoritesData = null;
let currentListId = null;

document.addEventListener('DOMContentLoaded', () => {
  initializePage();
});

async function initializePage() {
  try {
    // Load favorites data
    await loadFavoritesData();

    // Setup event listeners
    setupEventListeners();

    // Check for dark mode
    checkDarkMode();

  } catch (error) {
    console.error('Error initializing favorites page:', error);
    showError('Failed to load favorites data');
  }
}

async function loadFavoritesData() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getFavoritesData' });
    if (!response.success) {
      throw new Error(response.error || 'Failed to load favorites data');
    }

    currentFavoritesData = response.data;

    // Determine current list (last used or first available)
    if (currentFavoritesData.lastUsedListId) {
      currentListId = currentFavoritesData.lastUsedListId;
    } else if (currentFavoritesData.lists.length > 0) {
      currentListId = currentFavoritesData.lists[0].id;
    }

    updateListSelector();
    displayFavorites();

  } catch (error) {
    console.error('Error loading favorites data:', error);
    throw error;
  }
}

function updateListSelector() {
  const listSelect = document.getElementById('listSelect');
  listSelect.innerHTML = '';

  currentFavoritesData.lists.forEach(list => {
    const option = document.createElement('option');
    option.value = list.id;
    option.textContent = list.name;
    if (list.id === currentListId) {
      option.selected = true;
    }
    listSelect.appendChild(option);
  });
}

function displayFavorites() {
  const favoritesList = document.getElementById('favoritesList');
  const currentList = currentFavoritesData.lists.find(list => list.id === currentListId);

  if (!currentList || currentList.items.length === 0) {
    favoritesList.innerHTML = `
      <div class="empty-state">
        <h3>No favorites in this list</h3>
        <p>Click the star icon on dictionary results to add favorites to this list.</p>
      </div>
    `;
    return;
  }

  // Sort items by timestamp (newest first)
  const sortedItems = [...currentList.items].sort((a, b) => b.timestamp - a.timestamp);

  const html = sortedItems.map(item => `
    <div class="favorite-item" data-id="${item.id}">
      <div class="favorite-header">
        <div>
          <span class="favorite-name">${escapeHtml(item.name)}</span>
          <span class="favorite-type">${item.type}</span>
        </div>
        <button class="remove-btn" data-id="${item.id}" title="Remove from favorites">×</button>
      </div>
      <div class="favorite-content">${item.data}</div>
      <div class="favorite-timestamp">${formatTimestamp(item.timestamp)}</div>
    </div>
  `).join('');

  favoritesList.innerHTML = '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  while (doc.body.firstChild) {
    favoritesList.appendChild(doc.body.firstChild);
  }

  // Add event listeners for items
  document.querySelectorAll('.favorite-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('remove-btn')) {
        const itemId = item.dataset.id;
        const favoriteItem = sortedItems.find(i => i.id === itemId);
        if (favoriteItem) {
          showFavoriteDetails(favoriteItem);
        }
      }
    });
  });

  // Add event listeners for remove buttons
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const itemId = btn.dataset.id;
      await removeFavorite(itemId);
    });
  });
}

function showFavoriteDetails(item) {
  // Create modal for full content
  const modal = document.createElement('div');
  modal.className = 'modal';

  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';

  const h3 = document.createElement('h3');
  h3.textContent = item.name; // Already escaped? escapeHtml was for name, but here it's item.name

  const contentDiv = document.createElement('div');
  contentDiv.style.maxHeight = '400px';
  contentDiv.style.overflowY = 'auto';
  contentDiv.style.margin = '15px 0';
  // For item.data, if it's HTML, need to insert safely
  const parser = new DOMParser();
  const doc = parser.parseFromString(item.data, 'text/html');
  while (doc.body.firstChild) {
    contentDiv.appendChild(doc.body.firstChild);
  }

  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'modal-buttons';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-btn';
  closeBtn.textContent = 'Close';

  buttonsDiv.appendChild(closeBtn);
  modalContent.appendChild(h3);
  modalContent.appendChild(contentDiv);
  modalContent.appendChild(buttonsDiv);
  modal.appendChild(modalContent);

  document.body.appendChild(modal);

  // Add close button event listener
  const closeBtn = modal.querySelector('.modal-btn');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    modal.remove();
  });

  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

async function removeFavorite(itemId) {
  if (!confirm('Remove this favorite?')) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'removeFromFavorites',
      listId: currentListId,
      itemId: itemId
    });

    if (response.success) {
      await loadFavoritesData(); // Reload data
    } else {
      showError('Failed to remove favorite: ' + response.error);
    }
  } catch (error) {
    console.error('Error removing favorite:', error);
    showError('Failed to remove favorite');
  }
}

function setupEventListeners() {
  // List selector change
  document.getElementById('listSelect').addEventListener('change', (e) => {
    currentListId = e.target.value;
    displayFavorites();
  });

  // Rename list button
  document.getElementById('renameBtn').addEventListener('click', () => {
    renameCurrentList();
  });

  // Create list button
  document.getElementById('createBtn').addEventListener('click', () => {
    createNewList();
  });

  // Rename list button
  document.getElementById('renameBtn').addEventListener('click', () => {
    renameCurrentList();
  });

  // Delete list button
  document.getElementById('deleteBtn').addEventListener('click', () => {
    deleteCurrentList();
  });
}

async function renameCurrentList() {
  const currentList = currentFavoritesData.lists.find(list => list.id === currentListId);
  if (!currentList) return;

  const newName = prompt('Enter new name for the list:', currentList.name);
  if (!newName || newName.trim() === currentList.name) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'renameFavoritesList',
      listId: currentListId,
      newName: newName.trim()
    });

    if (response.success) {
      await loadFavoritesData(); // Reload data
    } else {
      showError('Failed to rename list: ' + response.error);
    }
  } catch (error) {
    console.error('Error renaming list:', error);
    showError('Failed to rename list');
  }
}

async function createNewList() {
  const listName = prompt('Enter name for new favorites list:');
  if (!listName || !listName.trim()) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'createFavoritesList',
      name: listName.trim()
    });

    if (response.success) {
      await loadFavoritesData(); // Reload data
    } else {
      showError('Failed to create list: ' + response.error);
    }
  } catch (error) {
    console.error('Error creating list:', error);
    showError('Failed to create list');
  }
}

async function renameCurrentList() {
  const currentList = currentFavoritesData.lists.find(list => list.id === currentListId);
  if (!currentList) return;

  const newName = prompt('Enter new name for the list:', currentList.name);
  if (!newName || newName.trim() === currentList.name) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'renameFavoritesList',
      listId: currentListId,
      newName: newName.trim()
    });

    if (response.success) {
      await loadFavoritesData(); // Reload data
    } else {
      showError('Failed to rename list: ' + response.error);
    }
  } catch (error) {
    console.error('Error renaming list:', error);
    showError('Failed to rename list');
  }
}

async function deleteCurrentList() {
  const currentList = currentFavoritesData.lists.find(list => list.id === currentListId);
  if (!currentList) return;

  if (currentList.id === 'favorites') {
    showError('Cannot delete the default Favorites list');
    return;
  }

  if (!confirm(`Delete the "${currentList.name}" list and all its favorites?`)) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteFavoritesList',
      listId: currentListId
    });

    if (response.success) {
      await loadFavoritesData(); // Reload data
    } else {
      showError('Failed to delete list: ' + response.error);
    }
  } catch (error) {
    console.error('Error deleting list:', error);
    showError('Failed to delete list');
  }
}

function checkDarkMode() {
  // Check if user has dark mode preference
  chrome.storage.local.get(['darkMode'], (result) => {
    if (result.darkMode) {
      document.body.classList.add('dark');
    }
  });
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}



function showError(message) {
  // Simple error display - could be enhanced with a proper notification system
  alert('Error: ' + message);
}