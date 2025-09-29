// Settings store for langbro Dictionary v2
// Reactive state management for extension settings and UI state

import { BehaviorSubject, Observable } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';

// Centralized settings store with reactive state management
export class SettingsStore {
  constructor() {
    // Initialize with default values
    this.settings$ = new BehaviorSubject({
      // Configuration settings
      iconPlacement: 'underneath',
      iconOffset: 50,
      iconSpacing: 40,
      rightSwipeGroupId: '',
      singleClickGroupId: '',
      tripleClickGroupId: '',
      hideGroupNames: false,
      isDarkMode: false,

      // Data arrays
      queryGroups: [],

      // UI state
      lookupIcons: [],
      resultDivs: [],
      inlineDivs: [],
      bottomDivs: [],
      selectedWord: '',
      currentSelection: null,
      resultJustShown: false,
      boxIdCounter: 0
    });

    // Load initial settings and set up reactive updates
    this.loadInitialSettings();
    this.setupReactiveUpdates();
  }

  // Get current settings snapshot
  get current() {
    return this.settings$.value;
  }

  // Update specific settings (partial update)
  update(updates) {
    const current = this.settings$.value;
    const newSettings = { ...current, ...updates };
    this.settings$.next(newSettings);
  }

  // Get observable for specific setting key
  select(key) {
    return this.settings$.pipe(
      map(settings => settings[key]),
      distinctUntilChanged()
    );
  }

  // Load initial settings from chrome storage
  async loadInitialSettings() {
    try {
      // console.log('SettingsStore: Loading initial settings...');

      // Load all settings in parallel
      const [settingsResult, groupsResult] = await Promise.all([
        chrome.storage.local.get([
          'iconPlacement',
          'iconOffset',
          'iconSpacing',
          'rightSwipeGroup',
          'singleClickGroup',
          'tripleClickGroup',
          'hideGroupNames',
          'darkMode'
        ]),
        chrome.storage.local.get(['queryGroups'])
      ]);

      // Update settings with loaded values
      this.update({
        iconPlacement: settingsResult.iconPlacement || 'underneath',
        iconOffset: settingsResult.iconOffset || 50,
        iconSpacing: settingsResult.iconSpacing || 60,
        rightSwipeGroupId: settingsResult.rightSwipeGroup || '',
        singleClickGroupId: settingsResult.singleClickGroup || '',
        tripleClickGroupId: settingsResult.tripleClickGroup || '',
        hideGroupNames: settingsResult.hideGroupNames || false,
        isDarkMode: settingsResult.darkMode || false,
        queryGroups: groupsResult.queryGroups || []
      });

      console.log('SettingsStore: Initial settings loaded successfully');
    } catch (error) {
      console.error('SettingsStore: Failed to load initial settings:', error);
      // Keep default values on error
    }
  }

  // Set up reactive updates from chrome storage and runtime messages
  setupReactiveUpdates() {
    // Chrome storage changes
    const storageChanges$ = new Observable(subscriber => {
      const listener = (changes, area) => {
        subscriber.next({ changes, area });
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    });

    // Chrome runtime messages (for query group updates)
    const runtimeMessages$ = new Observable(subscriber => {
      const listener = (message, sender, sendResponse) => {
        if (message.action === 'updateQueryGroups') {
          subscriber.next(message.groups);
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    });

    // React to storage changes
    storageChanges$.subscribe(({ changes, area }) => {
      if (area === 'local') {
        const updates = {};

        // Map storage keys to settings keys
        if (changes.iconPlacement) updates.iconPlacement = changes.iconPlacement.newValue;
        if (changes.iconOffset) updates.iconOffset = changes.iconOffset.newValue;
        if (changes.iconSpacing) updates.iconSpacing = changes.iconSpacing.newValue;
        if (changes.rightSwipeGroup) updates.rightSwipeGroupId = changes.rightSwipeGroup.newValue || '';
        if (changes.singleClickGroup) updates.singleClickGroupId = changes.singleClickGroup.newValue || '';
        if (changes.tripleClickGroup) updates.tripleClickGroupId = changes.tripleClickGroup.newValue || '';
        if (changes.hideGroupNames) updates.hideGroupNames = changes.hideGroupNames.newValue || false;
        if (changes.darkMode) updates.isDarkMode = changes.darkMode.newValue || false;

        if (Object.keys(updates).length > 0) {
          console.log('SettingsStore: Reactive update from storage:', updates);
          this.update(updates);
        }
      }
    });

    // React to runtime messages
    runtimeMessages$.subscribe(groups => {
      console.log('SettingsStore: Query groups updated via runtime message');
      this.update({ queryGroups: groups });
    });
  }

  // Utility methods for common operations
  getEnabledQueryGroups() {
    return this.current.queryGroups.filter(group => group.enabled);
  }

  incrementBoxId() {
    const newId = this.current.boxIdCounter + 1;
    this.update({ boxIdCounter: newId });
    return newId;
  }

  // Cleanup method
  destroy() {
    // Complete the BehaviorSubject to clean up subscriptions
    this.settings$.complete();
  }
}

// Global settings instance
export const settings = new SettingsStore();
