// Content script for WordClick Dictionary v2 - RxJS Implementation
// Handles text selection and displays multiple lookup icons for query groups

import { fromEvent, merge, combineLatest, Observable } from 'rxjs';
import { map, filter, debounceTime, throttleTime, switchMap, takeUntil, bufferTime, pairwise } from 'rxjs/operators';
import { settings } from './settings-store.js';

console.log('RxJS Content script loaded successfully v03');

// Selection Event Stream
// Merges selectionchange and keyup events, filters for valid text selections
const selection$ = merge(
  fromEvent(document, 'selectionchange'),
  fromEvent(document, 'keyup')
).pipe(
  map(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    return { selection, selectedText };
  }),
  filter(({ selectedText }) => selectedText.length > 0),
  debounceTime(100)
);

// Log text selection events
selection$.subscribe(({ selectedText }) => {
  console.log('RxJS: User selected text:', selectedText);
});

// Touch Gesture Streams
// Touch start stream
const touchStart$ = fromEvent(document, 'touchstart', { passive: false }).pipe(
  filter(event => event.touches.length === 1),
  map(event => {
    const touch = event.touches[0];
    return {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      target: event.target
    };
  })
);

// Touch end stream
const touchEnd$ = fromEvent(document, 'touchend', { passive: false }).pipe(
  filter(event => event.changedTouches.length === 1),
  map(event => {
    const touch = event.changedTouches[0];
    return {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      target: event.target
    };
  })
);

// Swipe gesture stream - combines touch start/end to detect swipes
const swipe$ = touchStart$.pipe(
  switchMap(start => touchEnd$.pipe(
    takeUntil(fromEvent(document, 'touchcancel')),
    map(end => ({
      start,
      end,
      deltaX: end.x - start.x,
      deltaY: end.y - start.y,
      deltaTime: end.time - start.time
    })),
    filter(({ deltaX, deltaY, deltaTime }) =>
      deltaTime < 500 && // Max 500ms for swipe
      Math.abs(deltaX) > 50 && // Min 50px horizontal movement
      Math.abs(deltaY) < 50 // Max 50px vertical movement
    ),
    map(({ deltaX }) => deltaX > 0 ? 'right' : 'left')
  ))
);

// Log swipe gestures
swipe$.subscribe(direction => {
  console.log('RxJS: User swiped', direction);
});

// Mouse Gesture Streams
// Mouse down stream for gesture detection
const mouseDown$ = fromEvent(document, 'mousedown').pipe(
  filter(event => !['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'].includes(event.target.tagName)),
  map(event => ({
    x: event.clientX,
    y: event.clientY,
    time: Date.now(),
    target: event.target
  }))
);

// Mouse up stream for gesture detection
const mouseUp$ = fromEvent(document, 'mouseup').pipe(
  filter(event => !['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'].includes(event.target.tagName)),
  map(event => ({
    x: event.clientX,
    y: event.clientY,
    time: Date.now(),
    target: event.target
  }))
);

// Click sequence detection for single/triple clicks
// Use reactive settings to determine buffer time
const clickSequence$ = settings.select('tripleClickGroupId').pipe(
  switchMap(tripleClickGroupId => {
    const tripleClickEnabled = tripleClickGroupId && tripleClickGroupId !== '';
    const clickBufferTime = tripleClickEnabled ? 1000 : 500;
    console.log('RxJS: Click buffer time set to', clickBufferTime, 'ms (triple click enabled:', tripleClickEnabled, ')');

    return mouseDown$.pipe(
      bufferTime(clickBufferTime),
      filter(clicks => clicks.length > 0),
      map(clicks => ({
        count: clicks.length,
        target: clicks[0].target,
        time: clicks[0].time
      }))
    );
  })
);

// Log click sequences
clickSequence$.subscribe(({ count, target }) => {
  const clickType = count === 1 ? 'single' : count === 2 ? 'double' : count === 3 ? 'triple' : `${count}`;
  console.log('RxJS: User clicked on text:', clickType, 'click');
});

// Icon click stream (delegated to document for dynamic icons)
const iconClick$ = fromEvent(document, 'click').pipe(
  filter(event => event.target.classList.contains('lookup-icon') ||
                  event.target.closest('.lookup-icon')),
  map(event => ({
    icon: event.target.classList.contains('lookup-icon') ? event.target : event.target.closest('.lookup-icon'),
    originalEvent: event
  }))
);

// Document click stream for hiding results
const documentClick$ = fromEvent(document, 'click').pipe(
  filter(event => !event.target.closest('.lookup-icon') &&
                  !event.target.closest('[data-box-id]'))
);

// Chrome runtime message stream
// Note: chrome.runtime.onMessage is not directly observable, so we'll create a wrapper
const runtimeMessage$ = new Observable(subscriber => {
  const listener = (message, sender, sendResponse) => {
    subscriber.next({ message, sender, sendResponse });
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
});

// Storage change stream
const storageChange$ = new Observable(subscriber => {
  const listener = (changes, area) => {
    subscriber.next({ changes, area });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
});

// DOM ready stream
const domReady$ = fromEvent(document, 'DOMContentLoaded').pipe(
  map(() => ({ ready: true }))
);

// Export streams for later use (when adding functionality)
export {
  selection$,
  swipe$,
  clickSequence$,
  iconClick$,
  documentClick$,
  runtimeMessage$,
  storageChange$,
  domReady$
};
