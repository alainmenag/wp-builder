/**
 * Editor state — the single mutable state object and all functions that
 * read or mutate it. Canvas rendering and DOM access are handled in
 * other modules; state.js communicates with them via injected callbacks
 * set through initState(), avoiding circular imports.
 */

import {
	createId,
	createContainer,
	normalizeNodeAttrs,
	findElement,
	addElement,
	deleteElement
} from './layout.js';

// ---------------------------------------------------------------------------
// State object — the single source of truth for the editor session.
// ---------------------------------------------------------------------------

export const state = {
	layout:       null,
	selectedId:   null,
	dirty:        false,
	saving:       false,
	pageTemplate: 'default'
};

// ---------------------------------------------------------------------------
// Module-level references set by initState().
// ---------------------------------------------------------------------------

let _saveButton    = null;
let _saveStatus    = null;
let _postStatusBadge = null;
let _idInput       = null;
let _text          = {};
let _statusLabels  = {};
let _renderFn      = null;
let _focusElementIdentityFn = null;

/**
 * Initialise state module dependencies.
 *
 * @param {Object} opts
 * @param {Element}  opts.saveButton          Save button element.
 * @param {Element}  opts.saveStatus          Save-status text element.
 * @param {Element}  opts.postStatusBadge     Post-status badge element.
 * @param {Element}  opts.idInput             Element-ID input.
 * @param {Object}   opts.text                i18n strings object.
 * @param {Object}   opts.statusLabels        Map of post-status keys to labels.
 * @param {Function} opts.onRender            Callback fired after state changes that require a full re-render.
 * @param {Function} opts.onFocusElementIdentity  Callback fired to focus the identity fields.
 */
export function initState( { saveButton, saveStatus, postStatusBadge, idInput, text, statusLabels, onRender, onFocusElementIdentity } ) {
	_saveButton             = saveButton;
	_saveStatus             = saveStatus;
	_postStatusBadge        = postStatusBadge;
	_idInput                = idInput;
	_text                   = text || {};
	_statusLabels           = statusLabels || {};
	_renderFn               = onRender || null;
	_focusElementIdentityFn = onFocusElementIdentity || null;
}

// ---------------------------------------------------------------------------
// UI feedback helpers
// ---------------------------------------------------------------------------

export function markDirty() {
	state.dirty = true;
	if ( _saveButton ) {
		_saveButton.classList.add( 'is-dirty' );
	}
	updateStatus( _text.unsaved || 'Unsaved changes' );
}

export function updateStatus( message ) {
	if ( _saveStatus ) {
		_saveStatus.textContent = message || '';
	}
}

export function updateStatusBadge( status ) {
	if ( _postStatusBadge ) {
		_postStatusBadge.textContent = ( status && _statusLabels[ status ] )
			? _statusLabels[ status ]
			: ( status || '' );
	}
}

// ---------------------------------------------------------------------------
// Selection management
// ---------------------------------------------------------------------------

export function selectElement( id ) {
	state.selectedId = id || state.layout.children[ 0 ].id;
	if ( _renderFn ) { _renderFn(); }
	if ( _focusElementIdentityFn ) { _focusElementIdentityFn(); }
}

export function addElementToSelection() {
	const element = createContainer();
	if ( ! addElement( state.layout.children, state.selectedId, element ) ) {
		addElement( state.layout.children, state.layout.children[ 0 ].id, element );
	}
	state.selectedId = element.id;
	markDirty();
	if ( _renderFn ) { _renderFn(); }
}

export function deleteSelection() {
	if ( ! state.selectedId || state.selectedId === state.layout.children[ 0 ].id ) {
		return;
	}
	if ( deleteElement( state.layout.children[ 0 ].children || [], state.selectedId ) ) {
		state.selectedId = state.layout.children[ 0 ].id;
		markDirty();
		if ( _renderFn ) { _renderFn(); }
	}
}

// ---------------------------------------------------------------------------
// Element mutation helpers
// ---------------------------------------------------------------------------

/**
 * Find the currently selected element, apply `fn` to it, mark dirty, and
 * return the element (or null if not found).
 *
 * @param {Function} fn  Mutator — receives the element and may modify it in place.
 * @return {Object|null}
 */
export function mutateSelected( fn ) {
	const element = findElement( state.layout.children, state.selectedId );
	if ( ! element ) { return null; }
	fn( element );
	markDirty();
	return element;
}

export function updateSelectedNodeAttr( name, value ) {
	mutateSelected( ( el ) => {
		el.attrs = el.attrs || {};
		el.attrs[ name ] = value;
	} );
}

export function updateSelectedId( rawValue ) {
	let sanitized = rawValue.toLowerCase()
		.replace( /\s+/g, '-' )
		.replace( /[^a-z0-9_-]/g, '' )
		.replace( /-+/g, '-' )
		.replace( /^-+|-+$/g, '' );

	if ( ! sanitized ) {
		sanitized = createId();
	}

	const element = findElement( state.layout.children, state.selectedId );
	if ( ! element ) { return; }

	if ( element.id === sanitized ) {
		// Normalise the display value even though the ID didn't change.
		if ( _idInput ) { _idInput.value = sanitized; }
		return;
	}

	element.id        = sanitized;
	state.selectedId  = sanitized;
	markDirty();
	if ( _renderFn ) { _renderFn(); }
}
