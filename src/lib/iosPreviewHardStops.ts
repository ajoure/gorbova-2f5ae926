/**
 * iOS Preview Hard Stops
 * 
 * Utilities for blocking heavy operations (like XLSX) on iOS Safari
 * inside the lovable.dev preview iframe to prevent memory crashes.
 */

export function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iP(hone|ad|od)/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  return isIOS && isSafari;
}

export function isInPreviewContext(): boolean {
  if (typeof window === 'undefined') return false;
  
  let inIframe = false;
  try { 
    inIframe = window.self !== window.top; 
  } catch { 
    inIframe = true; 
  }
  
  const qs = window.location.search || '';
  return inIframe || 
    qs.includes('forceHideBadge') || 
    qs.includes('lovable') || 
    qs.includes('preview');
}

/**
 * Hard stop for XLSX import on iOS Safari in lovable preview.
 * Must be called right before dynamic import('xlsx').
 * Throws an error with user-friendly message if blocked.
 */
export function assertExcelAllowedOrThrow(): void {
  if (typeof window === 'undefined') return;
  
  if (isIOSSafari() && isInPreviewContext()) {
    throw new Error('Excel-импорт недоступен в preview на iOS. Откройте с компьютера.');
  }
}
