/**
 * Canvas — renders the stage tree and provides direct DOM updates for
 * element properties and styles. Also owns the HTML-preview helper since
 * it operates on stage DOM nodes.
 *
 * Import graph: constants ← layout ← state ← canvas  (no cycles)
 */

import { VOID_NODES, ICON_ADD, ICON_REMOVE } from './constants.js';
import { state, mutateSelected, selectElement, addElementToSelection, deleteSelection } from './state.js';

// ---------------------------------------------------------------------------
// Module-level DOM references set by initCanvas().
// ---------------------------------------------------------------------------

let _stage = null;
let _text  = {};

/**
 * @param {Object} opts
 * @param {Element} opts.stage  The #wp-builder-stage element.
 * @param {Object}  opts.text   i18n strings object.
 */
export function initCanvas( { stage, text } ) {
	_stage = stage;
	_text  = text || {};
}

// ---------------------------------------------------------------------------
// Stage rendering
// ---------------------------------------------------------------------------

export function renderCanvas() {
	_stage.innerHTML = '';
	_stage.appendChild( renderNode( state.layout.children[ 0 ], 0, false ) );
	rebuildContainerStyles( state.layout.children );
}

export function renderNode( element, depth, isDeletable ) {
	const node     = document.createElement( 'section' );
	const bar      = document.createElement( 'div' );
	const body     = document.createElement( 'div' );
	const children = element.children || [];
	const isVoid   = VOID_NODES[ element.node ];

	node.className = 'wp-builder-node wp-builder-node-container' +
		( state.selectedId === element.id ? ' is-selected' : '' );
	node.style.setProperty( '--wp-builder-depth', depth );
	node.dataset.wpBuilderId = element.id;

	bar.className = 'wp-builder-node-bar';

	const title = document.createElement( 'button' );
	title.type      = 'button';
	title.className = 'wp-builder-node-title';
	title.textContent = ( element.node || 'div' ).toUpperCase() + ' \u00b7 ' + element.id;
	title.addEventListener( 'click', ( event ) => {
		event.stopPropagation();
		selectElement( element.id );
	} );
	bar.appendChild( title );

	if ( ! isVoid ) {
		bar.appendChild( makeIconButton(
			'wp-builder-node-action',
			_text.addContainer || 'Add container',
			ICON_ADD,
			( event ) => {
				event.stopPropagation();
				state.selectedId = element.id;
				addElementToSelection();
			}
		) );
	}

	if ( isDeletable ) {
		bar.appendChild( makeIconButton(
			'wp-builder-node-action wp-builder-node-action-danger',
			_text.delete || 'Delete',
			ICON_REMOVE,
			( event ) => {
				event.stopPropagation();
				state.selectedId = element.id;
				deleteSelection();
			}
		) );
	}

	body.className = 'wp-builder-node-body';
	applyContainerFlexStyles( element.props || {}, node, body );

	if ( isVoid ) {
		body.appendChild( renderEmpty(
			( element.node || 'void' ) + ' \u00b7 ' + ( _text.voidElement || 'void element' )
		) );
	} else {
		if ( element.content ) {
			const preview = document.createElement( 'div' );
			preview.className = 'wp-builder-node-html-preview';
			preview.innerHTML = element.content;
			body.appendChild( preview );
		}

		if ( ! children.length && ! element.content ) {
			body.appendChild( renderEmpty( _text.emptyContainer || 'Empty container' ) );
		} else {
			for ( const child of children ) {
				body.appendChild( renderNode( child, depth + 1, true ) );
			}
		}
	}

	node.appendChild( bar );
	node.appendChild( body );

	node.addEventListener( 'click', ( event ) => {
		event.stopPropagation();
		selectElement( element.id );
	} );

	return node;
}

export function renderEmpty( label ) {
	const empty = document.createElement( 'div' );
	empty.className   = 'wp-builder-empty-state';
	empty.textContent = label;
	return empty;
}

export function makeIconButton( className, label, icon, onClick ) {
	const btn = document.createElement( 'button' );
	btn.type      = 'button';
	btn.className = className;
	btn.innerHTML = icon;
	btn.setAttribute( 'aria-label', label );
	btn.addEventListener( 'click', onClick );
	return btn;
}

// ---------------------------------------------------------------------------
// Flex-layout helpers
// ---------------------------------------------------------------------------

export function applyContainerFlexStyles( props, node, body ) {
	body.style.display       = '';
	body.style.flexDirection = '';
	body.style.gap           = '';
	node.style.flexGrow      = '';

	if ( props.flexDirection ) {
		body.style.display       = 'flex';
		body.style.flexDirection = props.flexDirection;
	}
	if ( props.flexGrow !== undefined && props.flexGrow !== '' ) {
		node.style.flexGrow = props.flexGrow;
	}
	if ( props.gap ) {
		body.style.gap = props.gap;
	}
}

// ---------------------------------------------------------------------------
// Scoped custom-style injection
// ---------------------------------------------------------------------------

export function updateContainerStyle( id, customStyle ) {
	const styleId  = 'wpb-style-' + id;
	let   styleEl  = document.getElementById( styleId );
	const selector = '[data-wp-builder-id="' + id + '"]';
	const scoped   = customStyle ? customStyle.replace( /\bself\b/g, selector ) : '';

	if ( ! scoped ) {
		if ( styleEl ) { styleEl.parentNode.removeChild( styleEl ); }
		return;
	}
	if ( ! styleEl ) {
		styleEl    = document.createElement( 'style' );
		styleEl.id = styleId;
		document.head.appendChild( styleEl );
	}
	styleEl.textContent = scoped;
}

export function rebuildContainerStyles( elements ) {
	document.head.querySelectorAll( 'style[id^="wpb-style-"]' ).forEach( ( s ) => {
		document.head.removeChild( s );
	} );
	( function walk( els ) {
		for ( const el of els ) {
			updateContainerStyle( el.id, el.style || '' );
			walk( el.children || [] );
		}
	}( elements ) );
}

// ---------------------------------------------------------------------------
// Direct DOM mutation helpers (avoid full re-render for prop changes)
// ---------------------------------------------------------------------------

export function updateSelectedContainerProp( prop, value ) {
	const element = mutateSelected( ( el ) => {
		el.props = el.props || {};
		el.props[ prop ] = value;
	} );
	if ( ! element ) { return; }
	const node = _stage.querySelector( '[data-wp-builder-id="' + state.selectedId + '"]' );
	if ( node ) {
		const body = node.querySelector( '.wp-builder-node-body' );
		if ( body ) { applyContainerFlexStyles( element.props, node, body ); }
	}
}

export function updateSelectedContainerStyle( style ) {
	mutateSelected( ( el ) => { el.style = style; } );
	updateContainerStyle( state.selectedId, style );
}

// ---------------------------------------------------------------------------
// HTML-preview update (stage-side helper used by the content textarea)
// ---------------------------------------------------------------------------

export function updateHtmlPreview( id, content ) {
	const node = _stage.querySelector( '[data-wp-builder-id="' + id + '"]' );
	if ( ! node ) { return; }
	const preview = node.querySelector( '.wp-builder-node-html-preview' );
	if ( ! preview ) { return; }
	if ( content ) {
		preview.innerHTML = content;
	} else {
		preview.innerHTML = '';
		preview.appendChild( renderEmpty( _text.emptyHtml || 'Empty HTML element' ) );
	}
}
