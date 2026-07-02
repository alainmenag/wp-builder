/**
 * localStorage persistence for panel position / dock preferences.
 *
 * Import graph: state ← prefs
 */

import { state } from './state.js';

export function loadPrefs() {
	try {
		const raw = localStorage.getItem( state.STORAGE_KEY );
		if ( ! raw ) { return; }
		const prefs = JSON.parse( raw );
		if ( typeof prefs.isDocked    === 'boolean' ) { state.isDocked    = prefs.isDocked; }
		if ( prefs.dockedSide === 'left' || prefs.dockedSide === 'right' ) { state.dockedSide = prefs.dockedSide; }
		if ( typeof prefs.left        === 'number'  ) { state.panelLeft   = prefs.left; }
		if ( typeof prefs.top         === 'number'  ) { state.panelTop    = prefs.top; }
		if ( typeof prefs.width       === 'number'  ) { state.panelWidth  = prefs.width; }
		if ( typeof prefs.isPageZoomed === 'boolean' ) { state.isPageZoomed = prefs.isPageZoomed; }
	} catch ( e ) { /* silently ignore corrupt data */ }
}

export function savePrefs() {
	try {
		localStorage.setItem( state.STORAGE_KEY, JSON.stringify( {
			isDocked:     state.isDocked,
			dockedSide:   state.dockedSide,
			left:         state.panelLeft,
			top:          state.panelTop,
			width:        state.panelWidth,
			isPageZoomed: state.isPageZoomed,
		} ) );
	} catch ( e ) { /* silently ignore quota / private-mode errors */ }
}
