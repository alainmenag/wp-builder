/**
 * Dock / undock state machine — controls panel docking to viewport edges,
 * and panel positioning when showing.
 *
 * Import graph: state, zoom, prefs, constants ← dock
 */

import { state } from './state.js';
import { applyPageZoom, removePageZoom } from './zoom.js';
import { savePrefs } from './prefs.js';
import { EDITOR_CPT } from './constants.js';

/**
 * Dock the panel to the given edge ('left' or 'right'), updating all
 * related state, CSS classes, and button states.
 *
 * @param {'left'|'right'} side
 */
export function dockTo( side ) {
	state.isDocked   = true;
	state.dockedSide = side;
	state.panel.classList.add( 'is-docked' );
	state.panel.classList.toggle( 'is-docked-right', side === 'right' );
	state.panel.classList.toggle( 'is-docked-left',  side === 'left' );
	state.panel.style.left   = '';
	state.panel.style.top    = '';
	state.panel.style.width  = '';
	state.panel.style.height = '';
	if ( state.fitBtn ) { state.fitBtn.disabled = false; }
	// Only apply zoom if the panel is already open and has a real rendered width.
	// When called from positionAndShowPanel() the panel is still display:none at
	// this point; positionAndShowPanel() handles zoom after adding is-open.
	if ( state.isPageZoomed && state.panel.classList.contains( 'is-open' ) ) {
		const zoomAlreadyApplied = document.body.classList.contains( 'wpbe-page-zoomed' );
		applyPageZoom( ! zoomAlreadyApplied );
	}
}

/**
 * Undock the panel (remove all docked classes / state) without positioning it.
 * Callers are responsible for setting panel.style.left/top afterwards.
 */
export function undockPanel() {
	if ( state.isPageZoomed ) { removePageZoom(); }
	state.isDocked = false;
	state.panel.classList.remove( 'is-docked', 'is-docked-left', 'is-docked-right' );
	if ( state.fitBtn ) { state.fitBtn.disabled = true; }
}

export function toggleDock() {
	if ( state.isDocked ) {
		undockPanel();
		// Restore last floating position, or default to near the previously-docked edge.
		if ( state.panelLeft === null ) {
			const adminBarOffset = document.body.classList.contains( 'admin-bar' )
				? ( window.innerWidth <= 782 ? 46 : 32 )
				: 0;
			state.panelLeft = state.dockedSide === 'left'
				? 20
				: Math.max( 0, window.innerWidth - 340 );
			state.panelTop = adminBarOffset;
		}
		state.panel.style.left = state.panelLeft + 'px';
		state.panel.style.top  = state.panelTop  + 'px';
	} else {
		// Snap to whichever edge the panel is currently nearest.
		const rect      = state.panel.getBoundingClientRect();
		const distLeft  = rect.left;
		const distRight = window.innerWidth - rect.right;
		dockTo( distLeft <= distRight ? 'left' : 'right' );
	}
	savePrefs();
}

/**
 * Position the panel according to persisted dock/float state and mark it
 * as open. Called both when re-opening an already-built panel and when
 * showing it for the first time after schema-driven creation.
 */
export function positionAndShowPanel() {
	if ( state.isDocked ) {
		// Apply docked state (CSS handles position; restore any saved width).
		dockTo( state.dockedSide );
		if ( state.panelWidth !== null ) {
			state.panel.style.width = state.panelWidth + 'px';
		}
	} else {
		// Position the panel: use persisted position or default to top-right corner.
		state.panel.classList.remove( 'is-docked', 'is-docked-left', 'is-docked-right' );
		if ( state.panelLeft === null ) {
			const adminBarOffset = document.body.classList.contains( 'admin-bar' )
				? ( window.innerWidth <= 782 ? 46 : 32 )
				: 0;
			state.panelLeft = Math.max( 0, window.innerWidth - 340 );
			state.panelTop  = adminBarOffset;
		}
		state.panel.style.left  = state.panelLeft + 'px';
		state.panel.style.top   = state.panelTop  + 'px';
		state.panel.style.width = '';
		if ( state.fitBtn ) { state.fitBtn.disabled = true; }
	}

	if ( state.editLink ) {
		state.editLink.href = '/wp-admin/post.php?post=' + encodeURIComponent( state.postId ) + '&action=' + EDITOR_CPT;
	}
	state.panel.classList.add( 'is-open' );

	// Restore persisted zoom (only valid when docked).
	if ( state.isDocked && state.isPageZoomed ) {
		// Compensate scroll only when zoom is transitioning OFF→ON.
		// If zoom is already visually applied (e.g. switching between elements
		// while the panel stays open), the scroll position is already correct.
		const zoomAlreadyApplied = document.body.classList.contains( 'wpbe-page-zoomed' );
		applyPageZoom( ! zoomAlreadyApplied );
	}
}
