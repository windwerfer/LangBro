// Content script for WordClick Dictionary v2 - RxJS Implementation
// Handles text selection and displays multiple lookup icons for query groups

import { fromEvent, merge, combineLatest, Observable } from 'rxjs';
import { map, filter, debounceTime, throttleTime, switchMap, takeUntil, bufferTime, pairwise } from 'rxjs/operators';

console.log('RxJS Content script loaded successfully v01');

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

// Log selection events
selection$.subscribe(({ selectedText }) => {
  console.log('RxJS: Selection event detected:', selectedText);
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
  console.log('RxJS: Swipe gesture detected:', direction);
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
const clickSequence$ = mouseDown$.pipe(
  bufferTime(200), // 200ms window for click sequences
  filter(clicks => clicks.length > 0),
  map(clicks => ({
    count: clicks.length,
    target: clicks[0].target,
    time: clicks[0].time
  }))
);

// Log click sequences
clickSequence$.subscribe(({ count, target }) => {
  console.log('RxJS: Click sequence detected:', count, 'clicks on', target.tagName);
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

// Log icon clicks
iconClick$.subscribe(({ icon }) => {
  console.log('RxJS: Icon clicked:', icon.dataset.groupId);
});

// Document click stream for hiding results
const documentClick$ = fromEvent(document, 'click').pipe(
  filter(event => !event.target.closest('.lookup-icon') &&
                  !event.target.closest('[data-box-id]'))
);

// Log document clicks (for hiding results)
documentClick$.subscribe(() => {
  console.log('RxJS: Document clicked (potential hide results)');
});

// Chrome runtime message stream
// Note: chrome.runtime.onMessage is not directly observable, so we'll create a wrapper
const runtimeMessage$ = new Observable(subscriber => {
  const listener = (message, sender, sendResponse) => {
    subscriber.next({ message, sender, sendResponse });
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
});

// Log runtime messages
runtimeMessage$.subscribe(({ message }) => {
  console.log('RxJS: Runtime message received:', message.action);
});

// Storage change stream
const storageChange$ = new Observable(subscriber => {
  const listener = (changes, area) => {
    subscriber.next({ changes, area });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
});

// Log storage changes
storageChange$.subscribe(({ changes, area }) => {
  console.log('RxJS: Storage changed in area:', area, Object.keys(changes));
});

// DOM ready stream
const domReady$ = fromEvent(document, 'DOMContentLoaded').pipe(
  map(() => ({ ready: true }))
);

// Log DOM ready
domReady$.subscribe(() => {
  console.log('RxJS: DOM content loaded');
});

// Initialize all streams when DOM is ready
domReady$.subscribe(() => {
  console.log('RxJS: All event streams initialized and active');
});

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
