/**
 * DOM helpers — shared utilities for building attribute controls and rendering
 * node-attribute panels. Used by both the admin inspector and the front-end
 * quick-editor so neither duplicates the logic.
 *
 * Import graph: constants ← dom-helpers  (leaf module, no other local imports)
 */

import { NODE_GLOSSARY } from './constants.js';

/**
 * Create a single attribute control (select or input) for a node descriptor.
 *
 * @param {Object}   desc      Descriptor from NODE_GLOSSARY: { name, label, type, options?, placeholder?, required? }
 * @param {string}   value     Current value to pre-fill.
 * @param {string}   inputId   id attribute for the control.
 * @param {Function} onChange  Callback invoked with the new value on change/input.
 * @param {Object}   [classes] Optional CSS class overrides: { select, input }.
 *                             Defaults to the admin-editor class names.
 * @return {HTMLElement}
 */
export function createAttrControl( desc, value, inputId, onChange, classes ) {
	const cls = Object.assign( { select: 'wp-builder-select', input: 'wp-builder-input' }, classes );
	let control;
	if ( desc.type === 'select' ) {
		control = document.createElement( 'select' );
		control.className = cls.select;
		for ( const opt of ( desc.options || [] ) ) {
			const option = document.createElement( 'option' );
			option.value       = opt;
			option.textContent = opt || '\u2014 None \u2014';
			control.appendChild( option );
		}
		control.addEventListener( 'change', () => { onChange( control.value ); } );
	} else {
		control = document.createElement( 'input' );
		control.className = cls.input;
		control.type = desc.type === 'number' ? 'number' : ( desc.type === 'url' ? 'url' : 'text' );
		if ( desc.placeholder ) { control.placeholder = desc.placeholder; }
		control.addEventListener( 'input', () => { onChange( control.value ); } );
	}
	control.value = value;
	control.id    = inputId;
	return control;
}

/**
 * Render node-attribute fields into a container element.
 *
 * Clears the container, then writes one labelled field per attribute descriptor
 * for the given node tag. Hides the container if the node has no descriptors.
 *
 * @param {HTMLElement} container   The element to render into (set hidden when empty).
 * @param {string}      node        HTML tag name, e.g. 'img' or 'a'.
 * @param {Object}      attrs       Current attribute values keyed by name.
 * @param {Function}    onAttrChange  Called with (name, value) on each change.
 * @param {Object}      [classes]   Optional CSS class overrides forwarded to createAttrControl,
 *                                  plus an optional `fieldGroup` and `label` key.
 */
export function renderNodeAttrs( container, node, attrs, onAttrChange, classes ) {
	container.innerHTML = '';
	const descriptors = NODE_GLOSSARY[ node ] || [];
	if ( ! descriptors.length ) {
		container.hidden = true;
		return;
	}
	container.hidden = false;
	const cls = Object.assign(
		{ select: 'wp-builder-select', input: 'wp-builder-input', fieldGroup: 'wp-builder-field-group', label: 'wp-builder-inspector-label' },
		classes
	);
	for ( const desc of descriptors ) {
		const group   = document.createElement( 'div' );
		group.className = cls.fieldGroup;
		const inputId = 'wp-builder-node-attr-' + desc.name;
		const labelEl = document.createElement( 'label' );
		labelEl.className   = cls.label;
		labelEl.htmlFor     = inputId;
		labelEl.textContent = desc.label + ( desc.required ? ' *' : '' );
		const control = createAttrControl( desc, ( attrs && attrs[ desc.name ] ) || '', inputId, ( value ) => {
			onAttrChange( desc.name, value );
		}, cls );
		group.appendChild( labelEl );
		group.appendChild( control );
		container.appendChild( group );
	}
}
