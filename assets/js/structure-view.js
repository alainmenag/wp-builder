/**
 * Structure-view mode — renders the layout node tree over the live page DOM.
 *
 * Also owns addChildElement() and deleteLayoutElement() because those AJAX
 * operations are invoked exclusively from within the structure tree.
 *
 * Import graph: state, constants ← structure-view
 *
 * Cross-module calls are made via state callbacks (cb_*) set by editor.js
 * at boot time to avoid circular imports.
 */

import { state } from './state.js';
import { VOID_NODES, ICON_ADD, ICON_REMOVE } from './constants.js';
import { el } from './dom-helpers.js';

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

/**
 * Toggle between rendered mode and structure (node-tree) mode.
 */
export function toggleStructureMode() {
	if ( state.isStructureMode ) {
		exitStructureMode();
	} else {
		enterStructureMode();
	}
}

// ---------------------------------------------------------------------------
// Enter / exit
// ---------------------------------------------------------------------------

/**
 * Enter structure mode: render the node tree over the live liveRoot element.
 * Uses the layout cached from the last wp_builder_get_element response.
 * Falls back to fetching the element (which also returns the layout) when the
 * cache is empty.
 */
export function enterStructureMode() {
	if ( ! state.liveRoot || ! state.postId ) { return; }

	// Capture the preceding sibling <style> element (the root element's custom
	// CSS block emitted by the PHP renderer). Include it in the snapshot so
	// exitStructureMode() can restore the full rendered state in one step, then
	// disable it so element styles are not applied while the structure tree is
	// displayed.
	const prevEl          = state.liveRoot.previousElementSibling;
	state.suppressedStyleEl = ( prevEl && prevEl.tagName === 'STYLE' ) ? prevEl : null;
	const stylePrefix       = state.suppressedStyleEl ? state.suppressedStyleEl.outerHTML : '';
	state.savedRenderedOuterHtml = stylePrefix + state.liveRoot.outerHTML;
	if ( state.suppressedStyleEl ) { state.suppressedStyleEl.disabled = true; }

	// If the root element uses a browser-special tag (e.g. <script>, <style>),
	// browsers treat its children as raw text rather than rendered DOM nodes.
	// Swap it for a plain <div> so the structure tree renders correctly.
	// exitStructureMode() restores the original element from the snapshot.
	if ( state.liveRoot.tagName !== 'DIV' ) {
		const div = document.createElement( 'div' );
		Array.from( state.liveRoot.attributes ).forEach( ( attr ) => {
			div.setAttribute( attr.name, attr.value );
		} );
		state.liveRoot.parentNode.replaceChild( div, state.liveRoot );
		state.liveRoot = div;
	}

	// Activate structure mode and update the toggle button immediately.
	state.isStructureMode = true;
	if ( state.structureToggleBtn ) {
		state.structureToggleBtn.classList.add( 'is-active' );
		state.structureToggleBtn.setAttribute( 'aria-label', state.text.renderedView || 'Rendered View' );
		state.structureToggleBtn.setAttribute( 'title',      state.text.renderedView || 'Rendered View' );
	}

	if ( state.cachedLayout ) {
		renderStructureTree( state.cachedLayout, state.liveRoot );
	} else if ( state.elementId ) {
		// No cached layout yet — fetch the element; the response includes the
		// layout and fetchElement will call renderStructureTree because
		// state.isStructureMode is now true.
		if ( state.cb_fetchElement ) { state.cb_fetchElement( state.postId, state.elementId ); }
	}
}

/**
 * Exit structure mode: restore the saved rendered HTML.
 */
export function exitStructureMode() {
	if ( ! state.liveRoot || ! state.savedRenderedOuterHtml ) { return; }

	const tpl = document.createElement( 'template' );
	tpl.innerHTML = state.savedRenderedOuterHtml.trim();

	// Remove the disabled sibling <style> before inserting the snapshot.
	// The snapshot already carries the correct <style> block (captured on enter
	// and kept in sync by save/add/delete handlers), so no duplicate is created.
	if ( state.suppressedStyleEl ) {
		state.suppressedStyleEl.remove();
		state.suppressedStyleEl = null;
	}

	state.liveRoot.parentNode.insertBefore( tpl.content, state.liveRoot );
	state.liveRoot.remove();

	const newRoot = document.querySelector( '[data-wp-builder-post-id="' + state.postId + '"]' );
	if ( newRoot ) { state.liveRoot = newRoot; }

	state.isStructureMode = false;
	if ( state.structureToggleBtn ) {
		state.structureToggleBtn.classList.remove( 'is-active' );
		state.structureToggleBtn.setAttribute( 'aria-label', state.text.structureView || 'Structure View' );
		state.structureToggleBtn.setAttribute( 'title',      state.text.structureView || 'Structure View' );
	}
}

// ---------------------------------------------------------------------------
// Tree rendering
// ---------------------------------------------------------------------------

/**
 * Render the layout node tree inside rootEl, replacing its inner content.
 *
 * @param {Object}      layout The layout object ({version, children}).
 * @param {HTMLElement} rootEl The [data-wp-builder-post-id] root element.
 */
export function renderStructureTree( layout, rootEl ) {
	rootEl.classList.add( 'wpbe-structure-view' );
	// Strip the element's inline layout style — it belongs on the node-body of
	// the rendered tree, not on liveRoot. exitStructureMode() restores the snapshot.
	rootEl.removeAttribute( 'style' );
	// Remove all child nodes.
	while ( rootEl.firstChild ) { rootEl.removeChild( rootEl.firstChild ); }
	if ( layout && layout.children && layout.children[ 0 ] ) {
		rootEl.appendChild( renderStructureNode( layout.children[ 0 ], 0, true ) );
	}
}

/**
 * Build a single structure-view node element.
 *
 * @param {Object}  element Element data object.
 * @param {number}  depth   Nesting depth (0 = root).
 * @param {boolean} isRoot  True for the top-level element (no delete button).
 * @returns {HTMLElement}
 */
export function renderStructureNode( element, depth, isRoot ) {
	const node   = ( element.node || 'div' ).toLowerCase();
	const isVoid = !! VOID_NODES[ node ];

	const wrapper = el( 'div', {
		cls:  'wpbe-sv-node' + ( element.id === state.elementId ? ' is-selected' : '' ),
		data: { wpBuilderId: element.id },
	} );
	// CSS custom property — must use setProperty() as Object.assign(style,…) does not support them.
	wrapper.style.setProperty( '--wpbe-sv-depth', depth );

	// ── Bar ──────────────────────────────────────────────────────────────────
	const svNodeChip = el( 'span', { cls: 'wpbe-chip wpbe-chip--node', text: node.toUpperCase() } );

	const svIdChip = el( 'span', { cls: 'wpbe-chip wpbe-chip--id', text: element.title || element.id || '' } );
	if ( element.title ) { svIdChip.title = element.id || ''; }

	const titleBtn = el( 'button', {
		type:     'button',
		cls:      'wpbe-sv-node-title',
		children: [ svNodeChip, svIdChip ],
		on:       {
			click: ( e ) => {
				e.stopPropagation();
				if ( state.cb_openPanel ) { state.cb_openPanel( state.postId, element.id, state.liveRoot ); }
			},
		},
	} );

	const bar = el( 'div', { cls: 'wpbe-sv-node-bar', children: [ titleBtn ] } );

	if ( ! isVoid ) {
		bar.appendChild( el( 'button', {
			type:  'button',
			cls:   'wpbe-sv-node-action',
			html:  ICON_ADD,
			attrs: { 'aria-label': state.text.addChild || 'Add child element', title: state.text.addChild || 'Add child element' },
			on:    {
				click: ( e ) => {
					e.stopPropagation();
					addChildElement( element.id );
				},
			},
		} ) );
	}

	if ( ! isRoot ) {
		bar.appendChild( el( 'button', {
			type:  'button',
			cls:   'wpbe-sv-node-action wpbe-sv-node-action--danger',
			html:  ICON_REMOVE,
			attrs: { 'aria-label': state.text.deleteElement || 'Delete element', title: state.text.deleteElement || 'Delete element' },
			on:    {
				click: ( e ) => {
					e.stopPropagation();
					deleteLayoutElement( element.id );
				},
			},
		} ) );
	}

	wrapper.appendChild( bar );

	// ── Children ──────────────────────────────────────────────────────────────
	const children = element.children || [];
	if ( children.length ) {
		const body = el( 'div', { cls: 'wpbe-sv-node-body' } );

		// Mirror the element's layout props so children are arranged correctly.
		// The CSS default (flex-direction:column, gap:8px) acts as a fallback.
		const props = element.props || {};
		const dir   = props.flexDirection;
		const gap   = props.gap;
		if ( dir === 'row' || dir === 'column' ) {
			body.style.flexDirection = dir;
		}
		if ( gap ) {
			body.style.gap = gap;
		}

		children.forEach( ( child ) => {
			body.appendChild( renderStructureNode( child, depth + 1, false ) );
		} );
		wrapper.appendChild( body );
	}

	return wrapper;
}

/**
 * Update the is-selected highlight in the structure tree for the given id.
 *
 * @param {string} id Element ID to mark as selected.
 */
export function syncStructureSelection( id ) {
	if ( ! state.liveRoot ) { return; }
	state.liveRoot.querySelectorAll( '.wpbe-sv-node' ).forEach( ( node ) => {
		node.classList.toggle( 'is-selected', node.dataset.wpBuilderId === id );
	} );
}

// ---------------------------------------------------------------------------
// AJAX: add / delete element (structure-view actions)
// ---------------------------------------------------------------------------

/**
 * POST wp_builder_add_element, then re-render the structure tree.
 *
 * @param {string} parentId ID of the parent element to append to.
 */
export function addChildElement( parentId ) {
	const form = new window.FormData();
	form.append( 'action',    'wp_builder_add_element' );
	form.append( 'nonce',     state.config.addNonce );
	form.append( 'post_id',   state.postId );
	form.append( 'parent_id', parentId );

	window.fetch( state.config.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: form } )
		.then( ( r ) => r.json() )
		.then( ( payload ) => {
			if ( ! payload || ! payload.success ) {
				throw new Error( payload && payload.data && payload.data.message
					? payload.data.message : ( state.text.error || 'Error' ) );
			}
			// Update the snapshot so exitStructureMode() restores the current DOM.
			if ( payload.data.html ) { state.savedRenderedOuterHtml = payload.data.html; }
			if ( payload.data.layout ) {
				state.cachedLayout = payload.data.layout;
				renderStructureTree( payload.data.layout, state.liveRoot );
			}
			// Open the newly-created element in the panel.
			if ( payload.data.new_element_id && state.cb_openPanel ) {
				state.cb_openPanel( state.postId, payload.data.new_element_id, state.liveRoot );
			}
		} )
		.catch( ( err ) => {
			if ( state.cb_setStatus ) { state.cb_setStatus( err.message || ( state.text.error || 'Error' ), true ); }
		} );
}

/**
 * POST wp_builder_delete_element, then re-render the structure tree.
 *
 * @param {string} elementId ID of the element to delete.
 */
export function deleteLayoutElement( elementId ) {
	const form = new window.FormData();
	form.append( 'action',     'wp_builder_delete_element' );
	form.append( 'nonce',      state.config.deleteNonce );
	form.append( 'post_id',    state.postId );
	form.append( 'element_id', elementId );

	window.fetch( state.config.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: form } )
		.then( ( r ) => r.json() )
		.then( ( payload ) => {
			if ( ! payload || ! payload.success ) {
				throw new Error( payload && payload.data && payload.data.message
					? payload.data.message : ( state.text.error || 'Error' ) );
			}
			if ( payload.data.html ) { state.savedRenderedOuterHtml = payload.data.html; }
			if ( payload.data.layout ) {
				state.cachedLayout = payload.data.layout;
				renderStructureTree( payload.data.layout, state.liveRoot );
			}
			// Clear panel selection if the deleted element was open.
			if ( elementId === state.elementId ) {
				state.elementId = null;
				if ( state.nodeChip ) { state.nodeChip.textContent = ''; }
				if ( state.idChip   ) { state.idChip.textContent   = ''; }
			}
		} )
		.catch( ( err ) => {
			if ( state.cb_setStatus ) { state.cb_setStatus( err.message || ( state.text.error || 'Error' ), true ); }
		} );
}
