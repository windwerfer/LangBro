// AI Services Management
// Handles AI service CRUD operations, testing, and UI management

(function() {
  // AI services elements
  const addAiServiceBtn = document.getElementById('addAiServiceBtn');
  const aiServicesList = document.getElementById('aiServicesList');
  const aiServiceForm = document.getElementById('aiServiceForm');
  const aiServiceFormTitle = document.getElementById('aiServiceFormTitle');
  const aiServiceNameInput = document.getElementById('aiServiceName');
  const aiServiceProviderSelect = document.getElementById('aiServiceProvider');
  const aiServiceApiKeyInput = document.getElementById('aiServiceApiKey');
  const aiServiceModelSelect = document.getElementById('aiServiceModel');
  const saveAiServiceBtn = document.getElementById('saveAiServiceBtn');
  const testAiServiceBtn = document.getElementById('testAiServiceBtn');
  const cancelAiServiceBtn = document.getElementById('cancelAiServiceBtn');

  let currentEditingAiService = null;

  // Initialize AI services when DOM is loaded
  document.addEventListener('DOMContentLoaded', () => {
    initAiServices();
  });

  function initAiServices() {
    // Load and render AI services
    loadAiServices();

    // Add AI service button
    addAiServiceBtn.addEventListener('click', () => {
      currentEditingAiService = null;
      showAiServiceForm();
    });

    // AI provider change - always set default model
    const aiProviderElement = document.getElementById('aiServiceProvider');
    const aiModelElement = document.getElementById('aiServiceModel');

    if (aiProviderElement && aiModelElement) {
      aiProviderElement.addEventListener('change', () => {
        const provider = aiProviderElement.value;
        if (provider === 'google' && !aiModelElement.value) {
          aiModelElement.value = 'gemini-2.5-flash';
        } else if (provider === 'openrouter' && !aiModelElement.value) {
          aiModelElement.value = 'x-ai/grok-4.1-fast';
        }
      });
    }

    // Save AI service button
    saveAiServiceBtn.addEventListener('click', () => {
      saveAiService();
    });

    // Test AI service button
    testAiServiceBtn.addEventListener('click', () => {
      testAiServiceFromForm();
    });

    // Cancel AI service button
    cancelAiServiceBtn.addEventListener('click', () => {
      hideAiServiceForm();
    });

    // Test modal event listeners
    const closeBtn = document.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', hideTestModal);
    }

    const modal = document.getElementById('testModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          hideTestModal();
        }
      });
    }

    const closeModalBtn = document.getElementById('closeTestModalBtn');
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', hideTestModal);
    }

    const copyBtn = document.getElementById('copyTestResultsBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const status = document.getElementById('testStatusText').textContent;
        const query = document.getElementById('testQueryText').textContent;
        let result = '';

        if (document.getElementById('testResponseSection').style.display !== 'none') {
          result = document.getElementById('testResponseText').textContent;
        } else if (document.getElementById('testErrorSection').style.display !== 'none') {
          result = 'Error: ' + document.getElementById('testErrorText').textContent;
        }

        const fullText = `Status: ${status}\nQuery: ${query}\nResult: ${result}`;
        navigator.clipboard.writeText(fullText).then(() => {
          alert('Results copied to clipboard');
        });
      });
    }
  }

  // Load AI services for selection dropdowns
  async function loadAiServicesForSelection(selectedServiceId = '') {
    try {
      const result = await chrome.storage.local.get(['aiServices']);
      const services = result.aiServices || [];

      // Update any AI service selection dropdowns
      const aiServiceSelects = document.querySelectorAll('select[id*="aiService"]');
      aiServiceSelects.forEach(select => {
        if (select.id !== 'aiServiceProvider') { // Don't modify the provider dropdown
          const currentValue = select.value;
          select.innerHTML = '<option value="">Select AI Service...</option>';

          services.forEach(service => {
            const option = document.createElement('option');
            option.value = service.id;
            option.textContent = service.name;
            if (service.id === selectedServiceId || service.id === currentValue) {
              option.selected = true;
            }
            select.appendChild(option);
          });
        }
      });
    } catch (error) {
      console.error('Error loading AI services for selection:', error);
    }
  }

  // Load and render AI services
  async function loadAiServices() {
    try {
      const result = await chrome.storage.local.get(['aiServices']);
      const services = result.aiServices || [];
      renderAiServices(services);
    } catch (error) {
      console.error('Error loading AI services:', error);
      aiServicesList.innerHTML = '<p style="color: #f00;">Error loading AI services</p>';
    }
  }

  // Render AI services list
  function renderAiServices(services) {
    aiServicesList.innerHTML = '';

    if (services.length === 0) {
      aiServicesList.innerHTML = '<p style="color: #666; font-style: italic;">No AI services configured. Click "Add New AI Service" to create one.</p>';
      return;
    }

    services.forEach((service, index) => {
      const serviceDiv = document.createElement('div');
      serviceDiv.className = 'query-group'; // Reuse the same styling

      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.alignItems = 'center';
      headerDiv.style.justifyContent = 'space-between';

      const infoDiv = document.createElement('div');
      infoDiv.style.display = 'flex';
      infoDiv.style.alignItems = 'center';
      infoDiv.style.gap = '10px';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = service.name;
      nameSpan.style.fontWeight = 'bold';

      const providerSpan = document.createElement('span');
      providerSpan.textContent = service.provider;
      providerSpan.style.fontSize = '12px';
      providerSpan.style.color = '#666';
      providerSpan.style.textTransform = 'capitalize';

      const modelSpan = document.createElement('span');
      modelSpan.textContent = service.model;
      modelSpan.style.fontSize = '11px';
      modelSpan.style.color = '#888';

      infoDiv.appendChild(nameSpan);
      infoDiv.appendChild(providerSpan);
      infoDiv.appendChild(modelSpan);

      const buttonsDiv = document.createElement('div');

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => editAiService(index);

      const duplicateBtn = document.createElement('button');
      duplicateBtn.textContent = 'Duplicate';
      duplicateBtn.style.marginLeft = '5px';
      duplicateBtn.onclick = () => duplicateAiService(index);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.style.marginLeft = '5px';
      deleteBtn.onclick = () => deleteAiService(index);

      const testBtn = document.createElement('button');
      testBtn.textContent = 'Test';
      testBtn.style.marginLeft = '5px';
      testBtn.style.backgroundColor = '#28a745';
      testBtn.style.color = 'white';
      testBtn.style.border = '1px solid #28a745';
      testBtn.onclick = () => testAiService(index);

      buttonsDiv.appendChild(editBtn);
      buttonsDiv.appendChild(duplicateBtn);
      buttonsDiv.appendChild(deleteBtn);
      buttonsDiv.appendChild(testBtn);

      headerDiv.appendChild(infoDiv);
      headerDiv.appendChild(buttonsDiv);

      serviceDiv.appendChild(headerDiv);
      aiServicesList.appendChild(serviceDiv);
    });
  }

  // Show AI service form
  function showAiServiceForm(service = null) {
    if (service) {
      aiServiceFormTitle.textContent = 'Edit AI Service';
      aiServiceNameInput.value = service.name || '';
      aiServiceProviderSelect.value = service.provider || 'google';
      aiServiceModelSelect.value = service.model || '';
      aiServiceApiKeyInput.value = service.apiKey || '';
    } else {
      aiServiceFormTitle.textContent = 'Add AI Service';
      aiServiceNameInput.value = '';
      aiServiceProviderSelect.value = 'google';
      aiServiceModelSelect.value = 'gemini-2.5-flash';
      aiServiceApiKeyInput.value = '';
    }

    aiServiceForm.style.display = 'block';
    aiServiceNameInput.focus();
  }

  // Hide AI service form
  function hideAiServiceForm() {
    aiServiceForm.style.display = 'none';
    currentEditingAiService = null;
  }

  // Save AI service
  async function saveAiService() {
    const name = aiServiceNameInput.value.trim();
    const provider = aiServiceProviderSelect.value;
    const apiKey = aiServiceApiKeyInput.value.trim();
    const model = aiServiceModelSelect.value.trim();

    // Ensure provider is lowercase for consistency
    const normalizedProvider = provider.toLowerCase();

    if (!name) {
      alert('Please enter a service name.');
      return;
    }

    if (!apiKey) {
      alert('Please enter an API key.');
      return;
    }

    if (!model) {
      alert('Please enter a model name.');
      return;
    }

    const service = {
      id: currentEditingAiService !== null ? currentEditingAiService.id : Date.now().toString(),
      name,
      provider: normalizedProvider,
      apiKey,
      model
    };

    try {
      const result = await chrome.storage.local.get(['aiServices']);
      const services = result.aiServices || [];

      if (currentEditingAiService !== null) {
        // Update existing service
        const index = services.findIndex(s => s.id === currentEditingAiService.id);
        if (index !== -1) {
          services[index] = service;
        }
      } else {
        // Add new service
        services.push(service);
      }

      await chrome.storage.local.set({ aiServices: services });
      renderAiServices(services);
      hideAiServiceForm();
    } catch (error) {
      console.error('Error saving AI service:', error);
      alert('Error saving AI service.');
    }
  }

  // Test AI service from form
  async function testAiServiceFromForm() {
    const name = aiServiceNameInput.value.trim();
    const provider = aiServiceProviderSelect.value;
    const apiKey = aiServiceApiKeyInput.value.trim();
    const model = aiServiceModelSelect.value.trim();

    // Ensure provider is lowercase for consistency
    const normalizedProvider = provider.toLowerCase();

    if (!name) {
      alert('Please enter a service name.');
      return;
    }

    if (!apiKey) {
      alert('Please enter an API key.');
      return;
    }

    if (!model) {
      alert('Please enter a model name.');
      return;
    }

    // Create temporary service object
    const tempService = {
      id: 'temp_test_' + Date.now(),
      name,
      provider: normalizedProvider,
      apiKey,
      model
    };

    // Show modal
    showTestModal();

    // Update status to testing
    updateTestStatus('testing', 'Testing AI service...');

    // Test query
    const testQuery = 'What is 2+2? Explain your answer in one sentence.';

    // Send test request to background script
    chrome.runtime.sendMessage({
      action: 'testAiService',
      service: tempService,
      query: testQuery
    }, (response) => {
      if (chrome.runtime.lastError) {
        updateTestStatus('error', 'Failed to communicate with background script');
        showTestError(chrome.runtime.lastError.message);
        return;
      }

      if (response.success) {
        updateTestStatus('success', 'Test completed successfully');
        showTestResponse(response.result);
      } else {
        updateTestStatus('error', 'Test failed');
        showTestError(response.error);
      }
    });
  }

  // Edit AI service
  function editAiService(index) {
    chrome.storage.local.get(['aiServices'], (result) => {
      const services = result.aiServices || [];
      currentEditingAiService = services[index];
      showAiServiceForm(currentEditingAiService);
    });
  }

  // Duplicate AI service
  async function duplicateAiService(index) {
    try {
      const result = await chrome.storage.local.get(['aiServices']);
      const services = result.aiServices || [];
      const originalService = services[index];

      if (!originalService) {
        alert('AI service not found');
        return;
      }

      const duplicatedService = {
        ...originalService,
        id: Date.now().toString(),
        name: originalService.name + ' (Copy)'
      };

      services.push(duplicatedService);
      await chrome.storage.local.set({ aiServices: services });
      renderAiServices(services);
    } catch (error) {
      console.error('Error duplicating AI service:', error);
      alert('Error duplicating AI service');
    }
  }

  // Delete AI service
  async function deleteAiService(index) {
    if (!confirm('Are you sure you want to delete this AI service?')) {
      return;
    }

    try {
      const result = await chrome.storage.local.get(['aiServices']);
      const services = result.aiServices || [];
      services.splice(index, 1);
      await chrome.storage.local.set({ aiServices: services });
      renderAiServices(services);
    } catch (error) {
      console.error('Error deleting AI service:', error);
    }
  }

  // Test AI service
  async function testAiService(index) {
    try {
      const result = await chrome.storage.local.get(['aiServices']);
      const services = result.aiServices || [];
      const service = services[index];

      if (!service) {
        alert('AI service not found');
        return;
      }

      // Show modal
      showTestModal();

      // Update status to testing
      updateTestStatus('testing', 'Testing AI service...');

      // Test query
      const testQuery = 'What is 2+2? Explain your answer in one sentence.';

      // Send test request to background script
      chrome.runtime.sendMessage({
        action: 'testAiService',
        service: service,
        query: testQuery
      }, (response) => {
        if (chrome.runtime.lastError) {
          updateTestStatus('error', 'Failed to communicate with background script');
          showTestError(chrome.runtime.lastError.message);
          return;
        }

        if (response.success) {
          updateTestStatus('success', 'Test completed successfully');
          showTestResponse(response.result);
        } else {
          updateTestStatus('error', 'Test failed');
          showTestError(response.error);
        }
      });

    } catch (error) {
      console.error('Error testing AI service:', error);
      updateTestStatus('error', 'Test failed');
      showTestError(error.message);
    }
  }

  // Test modal functions
  function showTestModal() {
    const modal = document.getElementById('testModal');
    modal.style.display = 'block';
  }

  function hideTestModal() {
    const modal = document.getElementById('testModal');
    modal.style.display = 'none';
  }

  function updateTestStatus(status, message) {
    const statusIcon = document.getElementById('testStatusIcon');
    const statusText = document.getElementById('testStatusText');

    statusIcon.className = '';
    statusText.textContent = message;

    if (status === 'testing') {
      statusIcon.className = 'testing-icon';
      statusText.style.color = '#007bff';
    } else if (status === 'success') {
      statusIcon.className = 'success-icon';
      statusText.style.color = '#28a745';
    } else if (status === 'error') {
      statusIcon.className = 'error-icon';
      statusText.style.color = '#dc3545';
    }
  }

  function showTestResponse(response) {
    document.getElementById('testResponseSection').style.display = 'block';
    document.getElementById('testErrorSection').style.display = 'none';
    document.getElementById('testResponseText').textContent = response;
  }

  function showTestError(error) {
    document.getElementById('testResponseSection').style.display = 'none';
    document.getElementById('testErrorSection').style.display = 'block';
    document.getElementById('testErrorText').textContent = error;
  }

  // Export functions for external use
  window.AiServices = {
    loadAiServicesForSelection,
    loadAiServices,
    renderAiServices
  };

})();