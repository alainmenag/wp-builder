/**
 * Floating drag interaction — header drag, snap-to-edge docking, and
 * viewport clamping for the quick-editor panel.
 *
 * Import graph: state, prefs, dock, zoom ← drag
 */

import { state } from './state.js';
import { savePrefs } from './prefs.js';
import { dockTo, undockPanel, toggleDock } from './dock.js';
import { applyPageZoom } from './zoom.js';

/**
 * Clamp the floating panel to fit within the current viewport.
 * No-op when the panel is docked or not open.
 */
export function clampToViewport() {
	if ( state.isDocked || ! state.panel || ! state.panel.classList.contains( 'is-open' ) ) { return; }
	if ( state.panelLeft === null ) { return; }
	const maxLeft      = window.innerWidth  - state.panel.offsetWidth;
	const maxTop       = window.innerHeight - state.panel.offsetHeight;
	state.panelLeft    = Math.max( 0, Math.min( maxLeft, state.panelLeft ) );
	state.panelTop     = Math.max( 0, Math.min( maxTop,  state.panelTop ) );
	state.panel.style.left = state.panelLeft + 'px';
	state.panel.style.top  = state.panelTop  + 'px';
}

/**
 * Wire mouse-based drag on the panel header.
 * Must be called after the panel element has been appended to the DOM.
 */
export function initDrag() {
	const header = state.panel.querySelector( '.wpbe-panel-header' );
	let dragging = false;
	let startX, startY, startLeft, startTop;
	/** clientX recorded at the moment a docked-drag begins. */
	let dockedDragStartX = 0;

	header.addEventListener( 'mousedown', ( e ) => {
		if ( e.target.closest( 'button, a' ) ) { return; }
		dragging = true;
		startX   = e.clientX;
		startY   = e.clientY;
		state.panel.classList.add( 'is-dragging' );
		if ( state.isDocked ) {
			dockedDragStartX = e.clientX;
		} else {
			const rect = state.panel.getBoundingClientRect();
			startLeft  = rect.left;
			startTop   = rect.top;
		}
		e.preventDefault();
	} );

	header.addEventListener( 'dblclick', ( e ) => {
		if ( e.target.closest( 'button, a' ) ) { return; }
		toggleDock();
	} );

	document.addEventListener( 'mousemove', ( e ) => {
		state.pointerX = e.clientX;
		if ( ! dragging ) { return; }

		if ( state.isDocked ) {
			// Determine how far the cursor has moved away from the docked edge.
			const dx         = e.clientX - dockedDragStartX;
			const shouldUndock = state.dockedSide === 'right'
				? dx < -state.UNDOCK_THRESHOLD
				: dx >  state.UNDOCK_THRESHOLD;

			if ( ! shouldUndock ) { return; }

			// Transition to floating: calculate a sensible initial position.
			const panelWidth  = state.panel.offsetWidth;
			const panelHeight = state.panel.offsetHeight;
			undockPanel();
			// Place panel so the header is under the cursor.
			state.panelLeft = Math.max( 0, Math.min( window.innerWidth  - panelWidth,  e.clientX - panelWidth  / 2 ) );
			state.panelTop  = Math.max( 0, Math.min( window.innerHeight - panelHeight, e.clientY - 20 ) );
			startLeft  = state.panelLeft;
			startTop   = state.panelTop;
			startX     = e.clientX;
			startY     = e.clientY;
			state.panel.style.left = state.panelLeft + 'px';
			state.panel.style.top  = state.panelTop  + 'px';
			return;
		}

		// ── Floating drag ──────────────────────────────────────────────────────
		const dx         = e.clientX - startX;
		const dy         = e.clientY - startY;
		const panelWidth = state.panel.offsetWidth;
		const maxLeft    = window.innerWidth  - panelWidth;
		const maxTop     = window.innerHeight - state.panel.offsetHeight;
		state.panelLeft  = Math.max( 0, Math.min( maxLeft, startLeft + dx ) );
		state.panelTop   = Math.max( 0, Math.min( maxTop,  startTop  + dy ) );

		// Snap only when the panel is flush against a viewport edge AND
		// the pointer is still pushing toward that side (within POINTER_SNAP_THRESHOLD).
		if ( state.panelLeft === 0 && state.pointerX < state.POINTER_SNAP_THRESHOLD ) {
			dragging = false;
			state.panel.classList.remove( 'is-dragging' );
			dockTo( 'left' );
			savePrefs();
			return;
		}
		if ( state.panelLeft + panelWidth >= window.innerWidth && state.pointerX > window.innerWidth - state.POINTER_SNAP_THRESHOLD ) {
			dragging = false;
			state.panel.classList.remove( 'is-dragging' );
			dockTo( 'right' );
			savePrefs();
			return;
		}

		state.panel.style.left = state.panelLeft + 'px';
		state.panel.style.top  = state.panelTop  + 'px';
	} );

	document.addEventListener( 'mouseup', () => {
		if ( ! dragging ) { return; }
		dragging = false;
		state.panel.classList.remove( 'is-dragging' );
		savePrefs();
	} );

	window.addEventListener( 'resize', () => {
		clampToViewport();
		if ( state.isPageZoomed && state.isDocked ) { applyPageZoom(); }
	} );
}
