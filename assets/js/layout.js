/**
 * Layout utilities — pure functions for creating, normalising, and
 * traversing the v2 layout data model. No DOM access; no side effects.
 */

import { NODE_GLOSSARY } from './constants.js';

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

export function createId() {
	return 'wpb-' + Date.now().toString( 36 ) + '-' + Math.random().toString( 36 ).slice( 2, 8 );
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

export function createContainer() {
	return {
		id:       createId(),
		node:     'div',
		props:    { flexDirection: '', flexGrow: '', gap: '' },
		style:    '',
		content:  '',
		attrs:    {},
		children: []
	};
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

export function normalizeNodeTag( tag ) {
	const allowed = {
		div: true, section: true, article: true, main: true, aside: true,
		header: true, footer: true, nav: true, p: true, span: true,
		h1: true, h2: true, h3: true, h4: true, h5: true, h6: true,
		img: true, a: true, button: true, input: true, label: true,
		figure: true, figcaption: true, video: true, audio: true,
		source: true, iframe: true
	};
	return ( typeof tag === 'string' && allowed[ tag ] ) ? tag : 'div';
}

export function normalizeContainerProps( props ) {
	const allowed = { '': true, row: true, column: true };
	const p = ( props && typeof props === 'object' ) ? props : {};
	return {
		flexDirection: ( typeof p.flexDirection === 'string' && allowed[ p.flexDirection ] ) ? p.flexDirection : '',
		flexGrow:      ( typeof p.flexGrow === 'string' ) ? p.flexGrow : '',
		gap:           ( typeof p.gap === 'string' ) ? p.gap : ''
	};
}

export function normalizeNodeAttrs( node, attrs ) {
	const descriptors = NODE_GLOSSARY[ node ] || [];
	const raw   = ( attrs && typeof attrs === 'object' ) ? attrs : {};
	const clean = {};
	for ( const desc of descriptors ) {
		clean[ desc.name ] = ( typeof raw[ desc.name ] === 'string' ) ? raw[ desc.name ] : '';
	}
	return clean;
}

export function normalizeElement( data ) {
	const node = normalizeNodeTag( data.node );
	return {
		id:       data.id || createId(),
		node,
		props:    normalizeContainerProps( data.props ),
		style:    typeof data.style === 'string' ? data.style : null,
		content:  typeof data.content === 'string' ? data.content : '',
		attrs:    normalizeNodeAttrs( node, data.attrs ),
		children: Array.isArray( data.children ) ? normalizeElements( data.children ) : []
	};
}

export function normalizeElements( elements ) {
	return elements.reduce( ( clean, element ) => {
		if ( ! element || typeof element !== 'object' || typeof element.node !== 'string' ) {
			return clean;
		}
		clean.push( normalizeElement( element ) );
		return clean;
	}, [] );
}

export function normalizeLayout( layout ) {
	const now = Date.now();

	// No layout at all → fresh v2 envelope.
	if ( ! layout || typeof layout !== 'object' ) {
		return { version: 2, createdAt: now, updatedAt: now, children: [ createContainer() ] };
	}

	// children[0] is the single top-level element.
	const rootData = Array.isArray( layout.children ) && layout.children[ 0 ] ? layout.children[ 0 ] : null;
	if ( ! rootData ) {
		return { version: 2, createdAt: layout.createdAt || now, updatedAt: now, children: [ createContainer() ] };
	}
	return { version: 2, createdAt: layout.createdAt || now, updatedAt: now, children: [ normalizeElement( rootData ) ] };
}

// ---------------------------------------------------------------------------
// Tree traversal and mutation
// ---------------------------------------------------------------------------

export function findElement( elements, id ) {
	for ( const element of elements ) {
		if ( element.id === id ) {
			return element;
		}
		const found = findElement( element.children || [], id );
		if ( found ) {
			return found;
		}
	}
	return null;
}

/**
 * Append `element` as a child of the node with `parentId` within `children`.
 *
 * @param {Array}  children  Root children array to search within.
 * @param {string} parentId  ID of the target parent element.
 * @param {Object} element   New element to append.
 * @return {boolean} True on success, false if the parent was not found.
 */
export function addElement( children, parentId, element ) {
	const parent = findElement( children, parentId );
	if ( ! parent ) {
		return false;
	}
	parent.children = parent.children || [];
	parent.children.push( element );
	return true;
}

export function deleteElement( elements, id ) {
	for ( let i = 0; i < elements.length; i++ ) {
		if ( elements[ i ].id === id ) {
			elements.splice( i, 1 );
			return true;
		}
		if ( deleteElement( elements[ i ].children || [], id ) ) {
			return true;
		}
	}
	return false;
}
