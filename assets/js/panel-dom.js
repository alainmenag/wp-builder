/**
 * Panel DOM construction — builds the quick-editor panel from a server schema
 * and wires all static event listeners. Called once on the first element open.
 *
 * Import graph: state, constants, drag, resize, zoom, structure-view ← panel-dom
 *
 * Calls that would create circular imports are made via state callbacks
 * (cb_*) populated by editor.js at startup.
 */

import { state } from './state.js';
import {
	ICON_FIT, ICON_ELEMENT, ICON_POST, ICON_ISOLATE, ICON_STRUCTURE,
} from './constants.js';
import { el } from './dom-helpers.js';
import { initDrag } from './drag.js';
import { initResize } from './resize.js';
import { togglePageZoom } from './zoom.js';
import { toggleStructureMode } from './structure-view.js';

// ---------------------------------------------------------------------------
// Internal accordion / field-group helpers
// ---------------------------------------------------------------------------

function createAccordion( labelText, startOpen ) {
	const section = el( 'div', { cls: 'wpbe-accordion' + ( startOpen ? ' is-open' : '' ) } );

	const btn = el( 'button', {
		type:  'button',
		cls:   'wpbe-accordion-header',
		attrs: { 'aria-expanded': startOpen ? 'true' : 'false' },
		on:    {
			click: () => {
				const isOpen = section.classList.contains( 'is-open' );
				// Collapse all other open accordions in the panel (one-at-a-time).
				if ( state.panel && ! isOpen ) {
					state.panel.querySelectorAll( '.wpbe-accordion.is-open' ).forEach( ( other ) => {
						if ( other === section ) { return; }
						other.classList.remove( 'is-open' );
						const otherBtn = other.querySelector( '.wpbe-accordion-header' );
						if ( otherBtn ) { otherBtn.setAttribute( 'aria-expanded', 'false' ); }
					} );
				}
				section.classList.toggle( 'is-open', ! isOpen );
				btn.setAttribute( 'aria-expanded', ( ! isOpen ).toString() );
			},
		},
		children: [
			el( 'span', { text: labelText } ),
			el( 'span', { cls: 'wpbe-accordion-chevron', attrs: { 'aria-hidden': 'true' } } ),
		],
	} );
	section.appendChild( btn );

	const inner = el( 'div', { cls: 'wpbe-accordion-body-inner' } );
	section.appendChild( el( 'div', { cls: 'wpbe-accordion-body', children: [ inner ] } ) );

	return section;
}

function createFieldGroup( labelText, controlFactory, fieldId ) {
	const control = controlFactory();
	if ( fieldId ) { control.id = fieldId; }
	const lbl = el( 'label', {
		cls:  'wpbe-label',
		text: labelText,
		...(control.id ? { attrs: { for: control.id } } : {}),
	} );
	const group = el( 'div', { cls: 'wpbe-field-group', children: [ lbl, control ] } );
	return { group, control };
}

// ---------------------------------------------------------------------------
// FIELD_REFS — wires rendered controls to their state slots
// ---------------------------------------------------------------------------

/**
 * Maps each schema field id to a function that assigns the rendered control
 * element to the appropriate state slot and wires any special behaviour
 * (e.g. the id-field sanitise-on-blur listener).
 */
const FIELD_REFS = {
	'wpbe-element-title':  ( ctrl ) => { state.elementTitleCtrl            = ctrl; },
	'wpbe-node':           ( ctrl ) => { state.nodeSelectCtrl           = ctrl; },
	'wpbe-node-id':        ( ctrl ) => {
		state.idDisplayCtrl = ctrl;
		ctrl.addEventListener( 'blur', () => {
			const sanitized = ctrl.value.toLowerCase()
				.replace( /\s+/g, '-' )
				.replace( /[^a-z0-9_-]/g, '' )
				.replace( /-+/g, '-' )
				.replace( /^-+|-+$/g, '' );
			ctrl.value = sanitized || state.elementId || '';
		} );
	},
	'wpbe-html-content':   ( ctrl ) => { state.htmlTextareaCtrl         = ctrl; },
	'wpbe-flex-direction': ( ctrl ) => { state.flexDirCtrl              = ctrl; },
	'wpbe-flex-grow':      ( ctrl ) => { state.flexGrowCtrl             = ctrl; },
	'wpbe-gap':            ( ctrl ) => { state.gapCtrl                  = ctrl; },
	'wpbe-custom-style':   ( ctrl ) => { state.styleTextareaCtrl        = ctrl; },
	'wpbe-post-title':     ( ctrl ) => { state.mainTitleDisplay         = ctrl; },
	'wpbe-post-status':    ( ctrl ) => { state.mainStatusDisplay        = ctrl; },
	'wpbe-page-template':  ( ctrl ) => { state.mainPageTemplateDisplay  = ctrl; },
	'wpbe-hooks':          ( ctrl ) => { state.hooksTextareaCtrl        = ctrl; },
	'wpbe-reset-builder':  ( ctrl ) => { ctrl.addEventListener( 'click', () => { if ( state.cb_resetBuilder ) { state.cb_resetBuilder(); } } ); },
};

// ---------------------------------------------------------------------------
// Schema-driven field renderer
// ---------------------------------------------------------------------------

/**
 * Apply a plain attrs object (from the server schema) to a DOM element.
 * Boolean values are assigned as DOM properties; all other values are set
 * as HTML attributes so they reach both properties and the rendered markup.
 *
 * @param {HTMLElement} el    Target element.
 * @param {Object|null} attrs Key/value map of attributes to apply.
 */
function applyAttrs( el, attrs ) {
	if ( ! attrs ) { return; }
	for ( const [ k, v ] of Object.entries( attrs ) ) {
		if ( typeof v === 'boolean' ) {
			el[ k ] = v;
		} else {
			el.setAttribute( k, v );
		}
	}
}

/**
 * Build a single field's DOM from a schema field descriptor.
 * Calls createFieldGroup() and wires the control to its state slot via FIELD_REFS.
 *
 * Supported types: text, number, select, textarea, container, pre, link, button.
 *
 * @param {Object} field Field descriptor from the server schema.
 * @returns {{group: HTMLElement, control: HTMLElement}|null}
 */
export function renderFieldFromSchema( field ) {
	const type = field.type || '';

	// Container — a plain wrapper div with no field-group chrome.
	if ( 'container' === type ) {
		const div = el( 'div', {
			...(field.id     ? { id: field.id }     : {}),
			...(field.class  ? { cls: field.class } : {}),
			...(field.hidden ? { hidden: true }     : {}),
		} );
		return { group: div, control: div };
	}

	let controlEl = null;
	switch ( type ) {
		case 'text':
		case 'number': {
			const inp = el( 'input', {
				cls:  state.CSS.input,
				type: ( 'number' === type ) ? 'number' : 'text',
			} );
			if ( field.placeholder ) { inp.placeholder = field.placeholder; }
			applyAttrs( inp, field.attrs );
			controlEl = inp;
			break;
		}
		case 'select': {
			const options = ( field.options || [] ).map( ( opt ) => {
				const o = el( 'option', { text: opt.label, attrs: { value: opt.value } } );
				if ( opt.selected ) { o.selected = true; }
				return o;
			} );
			const sel = el( 'select', { cls: state.CSS.select, children: options } );
			applyAttrs( sel, field.attrs );
			controlEl = sel;
			break;
		}
		case 'textarea': {
			const ta = el( 'textarea', { cls: 'wpbe-textarea' } );
			applyAttrs( ta, field.attrs );
			if ( field.value !== undefined ) { ta.value = field.value; }
			controlEl = ta;
			break;
		}
		case 'pre': {
			const pre   = el( 'pre', { cls: 'wpbe-embed-code', text: field.content || '' } );
			const group = el( 'div', { cls: state.CSS.fieldGroup, ...(field.id ? { id: field.id } : {}) } );
			if ( field.label ) {
				group.appendChild( el( 'label', { cls: state.CSS.label, text: field.label } ) );
			}
			group.appendChild( pre );
			return { group, control: pre };
		}
		case 'link': {
			const a = el( 'a', {
				cls:  'wpbe-button-secondary',
				href: field.href || '#',
				text: field.label || ( field.attrs && field.attrs.title ) || '',
				...(field.id ? { id: field.id } : {}),
			} );
			applyAttrs( a, field.attrs );
			const group = el( 'div', { cls: state.CSS.fieldGroup } );
			if ( field.label ) {
				group.appendChild( el( 'label', { cls: state.CSS.label, text: field.label || '' } ) );
			}
			group.appendChild( a );
			return { group, control: a };
		}
		case 'button': {
			const btn = el( 'button', {
				type: 'button',
				cls:  'wpbe-button-secondary',
				text: field.label || ( field.attrs && field.attrs.title ) || '',
			} );
			applyAttrs( btn, field.attrs );
			controlEl = btn;
			break;
		}
		default:
			return null;
	}

	const { group, control } = createFieldGroup(
		field.label || '',
		() => controlEl,
		field.id || null
	);

	// Insert optional hint paragraph between the label and the control.
	if ( field.hint ) {
		const hint     = el( 'p', { cls: 'wpbe-inspector-hint', html: field.hint } );
		group.insertBefore( hint, control );
	}

	// Wire the control to its state slot and any special behaviour.
	if ( field.id && FIELD_REFS[ field.id ] ) {
		FIELD_REFS[ field.id ]( control );
	}

	return { group, control };
}

// ---------------------------------------------------------------------------
// Schema-driven tab panel renderer
// ---------------------------------------------------------------------------

/**
 * Build a .wpbe-tab-panel div and all its accordion sections from a
 * schema tab descriptor. Sets the relevant state tab-panel and accordion
 * slots as a side-effect.
 *
 * @param {Object} tab Tab descriptor from the server schema.
 * @returns {HTMLElement}
 */
function renderTabPanelFromSchema( tab ) {
	const tabPanel = el( 'div', { cls: 'wpbe-tab-panel', data: { tab: tab.key } } );

	// Element tab is the default active view; main tab starts hidden.
	if ( 'main'    === tab.key ) { tabPanel.hidden = true;  state.mainTabPanel    = tabPanel; }
	if ( 'element' === tab.key ) {                          state.elementTabPanel = tabPanel; }

	for ( const accordion of ( tab.accordions || [] ) ) {
		const accEl = createAccordion( accordion.label, !! accordion.open );
		accEl.id    = 'wpbe-accordion-' + accordion.slug;

		// Store accordion references needed by populatePanel().
		if ( 'content' === accordion.slug ) { state.contentSection = accEl; }
		if ( 'attrs'   === accordion.slug ) { state.attrsSection   = accEl; }

		// Refresh CodeMirror when the style accordion re-opens.
		if ( 'style' === accordion.slug ) {
			const accBtn = accEl.querySelector( '.wpbe-accordion-header' );
			if ( accBtn ) {
				accBtn.addEventListener( 'click', () => {
					if ( state.styleEditor && accEl.classList.contains( 'is-open' ) ) {
						state.styleEditor.codemirror.refresh();
					}
				} );
			}
		}

		// Refresh hooks CodeMirror when the hooks accordion re-opens.
		if ( 'hooks' === accordion.slug ) {
			const accBtn = accEl.querySelector( '.wpbe-accordion-header' );
			if ( accBtn ) {
				accBtn.addEventListener( 'click', () => {
					if ( state.hooksEditor && accEl.classList.contains( 'is-open' ) ) {
						state.hooksEditor.codemirror.refresh();
					}
				} );
			}
		}

		const inner = accEl.querySelector( '.wpbe-accordion-body-inner' );
		for ( const field of ( accordion.fields || [] ) ) {
			const rendered = renderFieldFromSchema( field );
			if ( rendered ) { inner.appendChild( rendered.group ); }
		}

		tabPanel.appendChild( accEl );
	}

	return tabPanel;
}

// ---------------------------------------------------------------------------
// Panel construction
// ---------------------------------------------------------------------------

/**
 * Create the quick-editor panel DOM from a server-provided schema, append it
 * to document.body, and wire all static event listeners.
 * Must be called only once (on the first element open).
 *
 * @param {Array} schema Array of tab descriptor objects from the server.
 */
export function createPanel( schema ) {
	// Panel shell
	state.panel = el( 'div', {
		cls:   'wpbe-panel',
		attrs: { role: 'dialog', 'aria-label': state.text.attributes || 'Element settings' },
	} );

	// ── Header ────────────────────────────────────────────────────────────────
	const header       = el( 'div', { cls: 'wpbe-panel-header' } );
	const headerInside = el( 'div', { cls: 'wpbe-panel-header-inside' } );

	state.nodeChip = el( 'span', {
		cls:   'wpbe-chip wpbe-chip--node',
		style: { cursor: 'pointer' },
		on:    {
			click: () => {
				if ( state.cb_scrollIntoView ) { state.cb_scrollIntoView( state.elementId ); }
				if ( state.cb_navigateEditor ) { state.cb_navigateEditor( 'element', 'identity', 'wpbe-node' ); }
			},
		},
	} );

	// Structure-view toggle button — placed to the left of the node chip.
	state.structureToggleBtn = el( 'button', {
		type:  'button',
		cls:   'wpbe-structure-toggle-btn',
		html:  ICON_STRUCTURE,
		attrs: { 'aria-label': state.text.structureView || 'Structure View', title: state.text.structureView || 'Structure View' },
		on:    { click: toggleStructureMode },
	} );

	const headerLeftMain = el( 'div', {
		cls:      'wpbe-panel-header-left-side',
		children: [ state.structureToggleBtn, state.nodeChip ],
	} );
	headerInside.appendChild( headerLeftMain );

	state.idChip = el( 'span', {
		cls:   'wpbe-chip wpbe-chip--id',
		style: { cursor: 'pointer' },
		on:    {
			click: () => {
				if ( state.cb_navigateEditor ) { state.cb_navigateEditor( 'element', 'identity', 'wpbe-element-title' ); }
			},
		},
	} );

	const headerRightSide = el( 'div', {
		cls:      'wpbe-panel-header-right-side',
		children: [ state.idChip ],
	} );
	headerInside.appendChild( headerRightSide );

	header.appendChild( headerInside );

	if ( ! ( state.config && state.config.isBuilderMode ) ) {
		const closeBtn = el( 'button', {
			cls:   'wpbe-close-btn',
			type:  'button',
			html:  '&#x2715;',
			attrs: { 'aria-label': state.text.close || 'Close' },
			on:    { click: () => { if ( state.cb_closePanel ) { state.cb_closePanel(); } } },
		} );
		header.appendChild( closeBtn );
	}
	state.panel.appendChild( header );

	// ── Body — schema-driven tab panels ───────────────────────────────────────
	const body = el( 'div', { cls: 'wpbe-panel-body' } );
	for ( const tab of ( schema || [] ) ) {
		body.appendChild( renderTabPanelFromSchema( tab ) );
	}
	state.panel.appendChild( body );

	// ── Footer ────────────────────────────────────────────────────────────────
	const footer = el( 'div', { cls: 'wpbe-panel-footer' } );

	// Tab switcher buttons — built from the schema so the order and keys
	// stay in sync with the server-defined tabs.
	const tabBtnsGroup = el( 'div', { cls: 'wpbe-tab-btns' } );
	state.tabBtns      = [];

	const tabIconMap = { main: ICON_POST, element: ICON_ELEMENT };
	for ( const tab of ( schema || [] ) ) {
		const btn = el( 'button', {
			type:  'button',
			cls:   'wpbe-tab-btn wpbe-panel-footer-link' + ( 'element' === tab.key ? ' is-active' : '' ),
			html:  tabIconMap[ tab.key ] || '',
			style: { fill: '#ffffff' },
			data:  { tab: tab.key },
			on:    {
				click: ( () => {
					const key = tab.key;
					return () => { if ( state.cb_navigateEditor ) { state.cb_navigateEditor( key ); } };
				} )(),
			},
		} );
		tabBtnsGroup.appendChild( btn );
		state.tabBtns.push( btn );
	}
	footer.appendChild( tabBtnsGroup );

	// Action buttons — right side of footer.
	const footerActions = el( 'div', { cls: 'wpbe-footer-actions' } );

	state.editLink = el( 'a', {
		cls:    'wpbe-edit-link wpbe-panel-footer-link',
		target: '_blank',
		rel:    'noopener noreferrer',
		html:   ICON_ISOLATE,
		style:  { fill: '#ffffff' },
		attrs:  { 'aria-label': state.text.editInBuilder || 'Edit in Builder' },
	} );

	state.fitBtn = el( 'button', {
		type:     'button',
		cls:      'wpbe-fit-btn wpbe-panel-footer-link',
		html:     ICON_FIT,
		disabled: ! state.isDocked,
		attrs:    { 'aria-label': state.text.fitPage || 'Fit Page', title: state.text.fitPage || 'Fit Page' },
		on:       { click: togglePageZoom },
	} );

	state.saveBtn = el( 'button', {
		type: 'button',
		cls:  'wpbe-save-btn',
		on:   { click: () => { if ( state.cb_saveElement ) { state.cb_saveElement(); } } },
	} );

	state.statusMsg = el( 'span', {
		cls:   'wpbe-save-status',
		attrs: { role: 'status', 'aria-live': 'polite' },
	} );

	const saveLbl = el( 'span', { text: state.text.save || 'Save' } );
	state.saveLbl = saveLbl;

	state.saveBtn.appendChild( state.statusMsg );
	state.saveBtn.appendChild( saveLbl );

	if ( ! ( state.config && state.config.isBuilderMode ) ) {
		footerActions.appendChild( state.editLink );
	}
	footerActions.appendChild( state.fitBtn );
	footerActions.appendChild( state.saveBtn );
	footer.appendChild( footerActions );

	// Left-edge resize handle (used when docked right).
	// Right-edge resize handle (used when docked left).
	state.panel.appendChild( footer );
	state.panel.appendChild( el( 'div', { cls: 'wpbe-resize-handle-left' } ) );
	state.panel.appendChild( el( 'div', { cls: 'wpbe-resize-handle-right' } ) );
	document.body.appendChild( state.panel );
	initDrag();
	initResize();
	// initStyleEditor() and initHooksEditor() are called by the caller
	// (fetchElement in ajax.js) after createPanel() returns.
}
