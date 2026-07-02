/**
 * Panel width resize — edge drag handles for docked panel width adjustment.
 *
 * Import graph: state, prefs, zoom ← resize
 */

import { state } from './state.js';
import { savePrefs } from './prefs.js';
import { applyPageZoom } from './zoom.js';

/**
 * Wire the left-edge and right-edge resize handles on the panel.
 * Must be called after the panel element has been appended to the DOM.
 */
export function initResize() {
	const handleLeft  = state.panel.querySelector( '.wpbe-resize-handle-left' );
	const handleRight = state.panel.querySelector( '.wpbe-resize-handle-right' );

	let resizing     = false;
	let resizingSide = null; // 'left' | 'right'
	let startX, startWidth;

	function startResize( e, side ) {
		if ( ! state.isDocked ) { return; }
		resizing     = true;
		resizingSide = side;
		startX       = e.clientX;
		startWidth   = state.panel.offsetWidth;
		state.panel.classList.add( 'is-resizing' );
		e.preventDefault();
		e.stopPropagation();
	}

	handleLeft.addEventListener(  'mousedown', ( e ) => startResize( e, 'left' ) );
	handleRight.addEventListener( 'mousedown', ( e ) => startResize( e, 'right' ) );

	document.addEventListener( 'mousemove', ( e ) => {
		if ( ! resizing ) { return; }
		const minWidth = 280;
		const maxWidth = Math.floor( window.innerWidth * 0.9 );
		// Left handle grows the panel leftward; right handle rightward.
		const dx       = resizingSide === 'left'
			? startX - e.clientX
			: e.clientX - startX;
		const newWidth = Math.max( minWidth, Math.min( maxWidth, startWidth + dx ) );
		state.panel.style.width = newWidth + 'px';
		if ( state.isPageZoomed ) { applyPageZoom(); }
	} );

	document.addEventListener( 'mouseup', () => {
		if ( ! resizing ) { return; }
		resizing = false;
		state.panel.classList.remove( 'is-resizing' );
		state.panelWidth = state.panel.offsetWidth;
		savePrefs();
		if ( state.elementId ) {
			const target = document.querySelector( '[data-wp-builder-id="' + state.elementId + '"]' );
			if ( target ) { target.scrollIntoView( { behavior: 'instant', block: 'center' } ); }
		}
	} );
}
