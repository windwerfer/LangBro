// Content script for WordClick Dictionary v2 - RxJS Implementation
// Handles text selection and displays multiple lookup icons for query groups

import { fromEvent, merge, combineLatest } from 'rxjs';
import { map, filter, debounceTime, throttleTime, switchMap, takeUntil } from 'rxjs/operators';

console.log('RxJS Content script loaded successfully');

// Basic RxJS setup - ready for migration from complex listeners
console.log('RxJS operators imported:', { fromEvent, merge, combineLatest, map, filter, debounceTime, throttleTime, switchMap, takeUntil });
