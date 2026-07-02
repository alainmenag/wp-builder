/**
 * DOM helpers — shared utilities for building attribute controls and rendering
 * node-attribute panels. Used by both the admin inspector and the front-end
 * quick-editor so neither duplicates the logic.
 *
 * Import graph: constants ← dom-helpers  (leaf module, no other local imports)
 */

import { NODE_GLOSSARY } from './constants.js';

// ---------------------------------------------------------------------------
// el() — declarative element factory
// ---------------------------------------------------------------------------

/**
 * Create and configure a DOM element from a plain descriptor object.
 *
 * @param {string} tag          HTML tag name.
 * @param {Object} [descriptor] Optional configuration:
 *   - cls      {string}   className
 *   - id       {string}   id attribute / property
 *   - type     {string}   type property (for button, input, etc.)
 *   - html     {string}   innerHTML (use for trusted / icon content only)
 *   - text     {string}   textContent
 *   - href     {string}   href property
 *   - target   {string}   target property
 *   - rel      {string}   rel property
 *   - hidden   {boolean}  hidden property
 *   - disabled {boolean}  disabled property
 *   - style    {Object}   key/value pairs merged via Object.assign( el.style, … )
 *                         Note: CSS custom properties must be set via
 *                         el.style.setProperty() after creation.
 *   - data     {Object}   key/value pairs written to el.dataset
 *   - attrs    {Object}   setAttribute calls; boolean values assigned as DOM properties
 *   - on       {Object}   addEventListener calls keyed by event name
 *   - children {Array}    child nodes appended via el.append(…)
 * @returns {HTMLElement}
 */
export function el( tag, descriptor ) {
	const element = document.createElement( tag );
	if ( ! descriptor ) { return element; }

	const { cls, id, type, html, text, href, target, rel, hidden, disabled, style, data, attrs, on, children } = descriptor;

	if ( cls      !== undefined ) { element.className = cls; }
	if ( id       !== undefined ) { element.id        = id; }
	if ( type     !== undefined ) { element.type      = type; }
	if ( href     !== undefined ) { element.href      = href; }
	if ( target   !== undefined ) { element.target    = target; }
	if ( rel      !== undefined ) { element.rel       = rel; }
	if ( hidden   !== undefined ) { element.hidden    = hidden; }
	if ( disabled !== undefined ) { element.disabled  = disabled; }

	if ( style ) { Object.assign( element.style, style ); }

	if ( data ) {
		for ( const [ k, v ] of Object.entries( data ) ) {
			element.dataset[ k ] = v;
		}
	}

	if ( attrs ) {
		for ( const [ k, v ] of Object.entries( attrs ) ) {
			if ( typeof v === 'boolean' ) {
				element[ k ] = v;
			} else {
				element.setAttribute( k, v );
			}
		}
	}

	if ( html !== undefined ) { element.innerHTML   = html; }
	if ( text !== undefined ) { element.textContent = text; }

	if ( children ) { element.append( ...children ); }

	return element;
}

// ---------------------------------------------------------------------------
// createAttrControl / renderNodeAttrs
// ---------------------------------------------------------------------------

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
		control = el( 'select', {
			cls: cls.select,
			id:  inputId,
			on:  { change: () => { onChange( control.value ); } },
		} );
		for ( const opt of ( desc.options || [] ) ) {
			const option = el( 'option', { text: opt || '\u2014 None \u2014' } );
			option.value = opt;
			control.appendChild( option );
		}
	} else {
		control = el( 'input', {
			cls:  cls.input,
			id:   inputId,
			type: desc.type === 'number' ? 'number' : ( desc.type === 'url' ? 'url' : 'text' ),
			on:   { input: () => { onChange( control.value ); } },
		} );
		if ( desc.placeholder ) { control.placeholder = desc.placeholder; }
	}
	control.value = value;
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
		const inputId = 'wp-builder-node-attr-' + desc.name;
		const control = createAttrControl( desc, ( attrs && attrs[ desc.name ] ) || '', inputId, ( value ) => {
			onAttrChange( desc.name, value );
		}, cls );
		container.appendChild( el( 'div', {
			cls:      cls.fieldGroup,
			children: [
				el( 'label', { cls: cls.label, attrs: { for: inputId }, text: desc.label + ( desc.required ? ' *' : '' ) } ),
				control,
			],
		} ) );
	}
}
