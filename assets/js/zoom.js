/**
 * Fit-page zoom — scale #page to fit within the space beside the docked panel.
 *
 * Import graph: state, prefs ← zoom
 */

import { state } from './state.js';
import { savePrefs } from './prefs.js';

/**
 * Scale #page so it fits entirely within the space beside the docked panel.
 * Uses CSS transform: scale() with transform-origin top left.
 *
 * @param {boolean} [compensateScroll=false] When true, re-centres the
 *   viewport so the same page content stays in view after the scale is
 *   applied. Pass true only when the user explicitly toggles fit on;
 *   leave false for re-applications triggered by panel-open / resize.
 */
export function applyPageZoom( compensateScroll ) {
	const pageEl = document.getElementById( 'page' );
	if ( ! pageEl || ! state.panel ) { return; }
	const panelWidth     = state.panel.offsetWidth;
	const availableWidth = window.innerWidth - panelWidth;
	if ( availableWidth <= 0 ) { return; }
	const scale = availableWidth / window.innerWidth;
	// Capture the page-coordinate of the current viewport centre *before* the
	// transform is applied so we can re-centre when the user toggled fit.
	const viewportCenterPx       = window.scrollY + window.innerHeight / 2;
	state.pageZoomScale          = scale;
	pageEl.style.transform       = 'scale(' + scale + ')';
	pageEl.style.transformOrigin = state.dockedSide === 'left' ? 'top right' : 'top left';
	document.body.classList.add( 'wpbe-page-zoomed' );
	// Only re-scroll on explicit user toggle; skip on panel-open / resize
	// re-applications so we don't jump the page away from the clicked element.
	if ( compensateScroll ) {
		// Re-centre: logical centre C maps to C*scale after transform-origin:top-left.
		window.scrollTo( { top: Math.max( 0, viewportCenterPx * scale - window.innerHeight / 2 ), behavior: 'instant' } );
	}
	if ( state.fitBtn ) {
		state.fitBtn.classList.add( 'is-active' );
		state.fitBtn.setAttribute( 'aria-label', state.text.resetFit || 'Reset Fit' );
		state.fitBtn.setAttribute( 'title',      state.text.resetFit || 'Reset Fit' );
	}
}

export function removePageZoom() {
	const pageEl = document.getElementById( 'page' );
	// Capture the scaled viewport centre before clearing the transform so we
	// can map it back to page coordinates and restore the scroll position.
	const viewportCenterPx = window.scrollY + window.innerHeight / 2;
	const newScrollTop     = viewportCenterPx / state.pageZoomScale - window.innerHeight / 2;
	if ( pageEl ) {
		pageEl.style.transform       = '';
		pageEl.style.transformOrigin = '';
	}
	state.pageZoomScale = 1;
	document.body.classList.remove( 'wpbe-page-zoomed' );
	window.scrollTo( { top: Math.max( 0, newScrollTop ), behavior: 'instant' } );
	if ( state.fitBtn ) {
		state.fitBtn.classList.remove( 'is-active' );
		state.fitBtn.setAttribute( 'aria-label', state.text.fitPage || 'Fit Page' );
		state.fitBtn.setAttribute( 'title',      state.text.fitPage || 'Fit Page' );
	}
}

export function togglePageZoom() {
	if ( ! state.isDocked ) { return; }
	state.isPageZoomed = ! state.isPageZoomed;
	if ( state.isPageZoomed ) {
		applyPageZoom( true );
	} else {
		removePageZoom();
	}
	savePrefs();
}
