// dictionary-importer.js - Resumable dictionary import queue coordinator
// Manages the import_queue in IndexedDB and sequential job processing

class DictionaryImporter {
  constructor(options) {
    this.getStructuredDB = options.getStructuredDB;
    this.showStatus = options.showStatus;
    this.loadCurrentDict = options.loadCurrentDict;
    this.isProcessing = false;
  }

  init() {
    const importBtn = document.getElementById('importDictionaryBtn');
    if (importBtn) {
      importBtn.addEventListener('click', () => this.handleUnifiedImport());
    }

    // Add a listener for the resume button if it exists
    document.addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('resume-import-btn')) {
        const jobId = e.target.dataset.jobId;
        this.resumeJob(jobId);
      }
      if (e.target && e.target.classList.contains('abort-import-btn')) {
        const jobId = e.target.dataset.jobId;
        this.abortJob(jobId);
      }
    });

    // Check for pending jobs on startup
    this.checkAndDisplayQueue();
  }

  /**
   * Main entry point for file selection and enqueuing
   */
  async handleUnifiedImport() {
    if (this.isProcessing) {
      this.showStatus('An import is already in progress. Please wait.', 'warning');
      return;
    }

    const fileInput = document.getElementById('dictionaryZipInput');
    const files = Array.from(fileInput.files);
    if (files.length === 0) {
      this.showStatus('Please select one or more ZIP files.', 'error');
      return;
    }

    const skipExisting = document.getElementById('skipExistingCheckbox')?.checked;
    const db = await this.getStructuredDB();
    
    this.showStatus(`Preparing ${files.length} file(s) for import...`, 'info');

    for (const file of files) {
      try {
        // 1. Smart Fingerprint
        const hash = await ImportUtils.generateSmartHash(file);
        
        // 2. Check Duplicate Registry
        const existing = await db.checkImportHash(hash);
        if (existing) {
          if (skipExisting) {
            this.showStatus(`Skipping ${file.name} - already imported.`, 'info');
            continue;
          } else {
            const confirmImport = confirm(`Dictionary "${file.name}" was already imported as "${existing.title}". Re-import?`);
            if (!confirmImport) continue;
          }
        }

        // 3. Check Disk Space
        const space = await ImportUtils.checkDiskSpace(file.size);
        if (space && space.isLow) {
          const proceed = confirm(`Low disk space detected (${Math.round(space.available / (1024*1024))}MB available). Import anyway?`);
          if (!proceed) continue;
        }

        // 4. Load ZIP just enough to detect format and name
        const zip = await JSZip.loadAsync(file);
        const format = ImportUtils.detectFormat(zip);
        
        let title = file.name;
        if (format === 'stardict') {
          const ifoEntry = Object.keys(zip.files).find(f => f.endsWith('.ifo'));
          title = ifoEntry.replace('.ifo', '').split('/').pop();
        } else if (format === 'yomitan') {
          const indexFile = zip.file('index.json');
          if (indexFile) {
            const index = JSON.parse(await indexFile.async('string'));
            title = index.title;
          }
        }

        // 5. Add to DB Queue (File Blob included!)
        const job = {
          id: hash,
          fileBlob: file,
          filename: file.name,
          title: title,
          format: format,
          status: 'pending',
          addedDate: Date.now()
        };
        
        await db.addToImportQueue(job);
        this.showStatus(`Queued: ${file.name}`, 'info');

      } catch (error) {
        console.error(`Error enqueuing ${file.name}:`, error);
        this.showStatus(`Failed to queue ${file.name}: ${error.message}`, 'error');
      }
    }

    fileInput.value = ''; // Reset input
    this.checkAndDisplayQueue();
    this.processQueue();
  }

  /**
   * Main processing loop
   */
  async processQueue() {
    if (this.isProcessing) {
      console.log('Importer: Queue processing already active, skipping.');
      return;
    }
    
    this.isProcessing = true;
    console.log('Importer: Starting queue processing...');

    try {
      const db = await this.getStructuredDB();
      const queue = await db.getImportQueue();
      
      const pendingJobs = queue.filter(j => j.status === 'pending' || j.status === 'importing');
      console.log(`Importer: Found ${pendingJobs.length} pending jobs.`);
      
      if (pendingJobs.length === 0) {
        console.log('Importer: No more pending jobs.');
        this.isProcessing = false;
        return;
      }

      // Process only one job (the first pending one)
      const job = pendingJobs[0];
      console.log('Importer: Running job:', job.id, job.title);
      await this.runJob(job);
      
      // Recursively continue until empty
      console.log('Importer: Job finished, checking for next job...');
      this.isProcessing = false;
      this.processQueue();
      
    } catch (error) {
      console.error('Importer: Queue processing error:', error);
      this.isProcessing = false;
    }
  }

  /**
   * Run a single import job
   */
  async runJob(job) {
    const db = await this.getStructuredDB();
    
    try {
      this.showStatus(`Starting import: ${job.title}`, 'info');
      console.log(`Importer: Marking job ${job.id} as importing...`);
      await db.updateImportJob(job.id, { status: 'importing' });
      this.checkAndDisplayQueue();

      // Load ZIP from the Blob stored in IndexedDB
      console.log(`Importer: Loading ZIP for ${job.title} (${job.fileBlob.size} bytes)...`);
      const zip = await JSZip.loadAsync(job.fileBlob);
      console.log('Importer: ZIP loaded successfully');
      
      if (job.format === 'stardict') {
        console.log('Importer: Starting StarDict importer...');
        const importer = new StarDictImporter({
          showStatus: (msg, type) => {
            this.showStatus(`[${job.title}] ${msg}`, type);
            if (msg.includes('%')) {
               const p = parseInt(msg.match(/(\d+)%/)[1]);
               this.updateJobProgressInUI(job.id, p);
            }
          },
          getDB: this.getStructuredDB
        });
        
        // Pass job details for resuming
        await importer.importFromZip(zip, job);
        
      } else if (job.format === 'yomitan') {
        console.log('Importer: Starting Yomitan importer...');
        const importer = new YomitanDictionaryImporter();
        // ... (rest of yomitan logic remains same)
        importer.setStatusCallback((msg) => this.showStatus(`[${job.title}] ${msg}`, 'info'));
        importer.setProgressCallback((progress) => {
          const p = Math.round((progress.index / progress.count) * 100);
          this.showStatus(`[${job.title}] Importing... ${progress.type || ''} ${p}%`, 'info');
          this.updateJobProgressInUI(job.id, p);
          
          // Optionally update the job record in DB every 1000 entries
          if (progress.index % 1000 === 0) {
            db.updateImportJob(job.id, { 
              processedEntries: progress.index, 
              totalEntries: progress.count 
            });
          }
        });
        
        await importer.importDictionary(db, job.fileBlob, { job });
      }

      // Finalize job
      console.log(`Importer: Finalizing job ${job.id}...`);
      await db.registerImport(job.id, job.title);
      await db.deleteImportJob(job.id);
      this.showStatus(`Successfully imported: ${job.title}`, 'success');
      console.log(`Importer: Job ${job.id} finalized.`);
      this.loadCurrentDict();
      
    } catch (error) {
      console.error(`Importer: Import job ${job.id} failed:`, error);
      await db.updateImportJob(job.id, { status: 'interrupted', lastError: error.message });
      this.showStatus(`Job failed: ${job.title}. ${error.message}`, 'error');
    } finally {
      this.checkAndDisplayQueue();
    }
  }

  /**
   * Manual resume triggered by user
   */
  async resumeJob(jobId) {
    if (this.isProcessing) return;
    const db = await this.getStructuredDB();
    const queue = await db.getImportQueue();
    const job = queue.find(j => j.id === jobId);
    if (job) {
      this.runJob(job);
    }
  }

  /**
   * Manual abort triggered by user
   */
  async abortJob(jobId) {
    const db = await this.getStructuredDB();
    const queue = await db.getImportQueue();
    const job = queue.find(j => j.id === jobId);
    
    if (job) {
      if (confirm(`Abort import for "${job.title}"? This will delete all terms already imported for this dictionary.`)) {
        this.showStatus(`Aborting ${job.title}...`, 'info');
        await db.deleteDictionary(job.title);
        await db.deleteImportJob(jobId);
        this.checkAndDisplayQueue();
        this.showStatus(`Aborted and cleaned up: ${job.title}`, 'info');
      }
    }
  }

  /**
   * UI Updates - Rebuilds the queue display
   */
  async checkAndDisplayQueue() {
    const db = await this.getStructuredDB();
    const queue = await db.getImportQueue();
    const container = document.getElementById('importQueueContainer');
    
    if (!container) return;

    if (queue.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = '<h4>Active & Queued Imports</h4>';
    
    queue.sort((a, b) => b.addedDate - a.addedDate).forEach(job => {
      const progress = job.totalEntries ? Math.round((job.processedEntries / job.totalEntries) * 100) : 0;
      const statusClass = job.status === 'interrupted' ? 'error-status' : (job.status === 'importing' ? 'active-status' : '');
      
      const jobEl = document.createElement('div');
      jobEl.className = `import-job-card ${statusClass}`;
      
      // Use structured approach to avoid XSS for title/filename
      const infoEl = document.createElement('div');
      infoEl.className = 'job-info';
      infoEl.innerHTML = `<strong></strong> (<span class="filename"></span>) - <span class="status"></span>`;
      infoEl.querySelector('strong').textContent = job.title;
      infoEl.querySelector('.filename').textContent = job.filename;
      infoEl.querySelector('.status').textContent = job.status;
      
      const progressContainer = document.createElement('div');
      progressContainer.className = 'progress-container';
      const progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      progressBar.id = `pb-${job.id}`;
      progressBar.style.width = `${progress}%`;
      progressContainer.appendChild(progressBar);
      
      const actionsEl = document.createElement('div');
      actionsEl.className = 'job-actions';
      if (job.status === 'interrupted') {
        const resumeBtn = document.createElement('button');
        resumeBtn.className = 'resume-import-btn';
        resumeBtn.dataset.jobId = job.id;
        resumeBtn.textContent = 'Continue';
        actionsEl.appendChild(resumeBtn);
      }
      const abortBtn = document.createElement('button');
      abortBtn.className = 'abort-import-btn';
      abortBtn.dataset.jobId = job.id;
      abortBtn.textContent = 'Discard';
      actionsEl.appendChild(abortBtn);
      
      jobEl.appendChild(infoEl);
      jobEl.appendChild(progressContainer);
      jobEl.appendChild(actionsEl);
      
      container.appendChild(jobEl);
    });
  }

  updateJobProgressInUI(jobId, progress) {
    const pb = document.getElementById(`pb-${jobId}`);
    if (pb) {
      pb.style.width = `${progress}%`;
    }
  }
}

// Export
window.DictionaryImporter = DictionaryImporter;
