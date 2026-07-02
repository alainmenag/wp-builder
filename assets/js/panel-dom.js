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
import { initDrag } from './drag.js';
import { initResize } from './resize.js';
import { togglePageZoom } from './zoom.js';
import { toggleStructureMode } from './structure-view.js';

// ---------------------------------------------------------------------------
// Internal accordion / field-group helpers
// ---------------------------------------------------------------------------

function createAccordion( labelText, startOpen ) {
	const section     = document.createElement( 'div' );
	section.className = 'wpbe-accordion' + ( startOpen ? ' is-open' : '' );

	const btn       = document.createElement( 'button' );
	btn.type        = 'button';
	btn.className   = 'wpbe-accordion-header';
	btn.setAttribute( 'aria-expanded', startOpen ? 'true' : 'false' );
	btn.addEventListener( 'click', () => {
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
	} );

	const labelSpan       = document.createElement( 'span' );
	labelSpan.textContent = labelText;

	const chevron         = document.createElement( 'span' );
	chevron.className     = 'wpbe-accordion-chevron';
	chevron.setAttribute( 'aria-hidden', 'true' );

	btn.appendChild( labelSpan );
	btn.appendChild( chevron );
	section.appendChild( btn );

	const body       = document.createElement( 'div' );
	body.className   = 'wpbe-accordion-body';
	const inner      = document.createElement( 'div' );
	inner.className  = 'wpbe-accordion-body-inner';
	body.appendChild( inner );
	section.appendChild( body );

	return section;
}

function createFieldGroup( labelText, controlFactory, fieldId ) {
	const group     = document.createElement( 'div' );
	group.className = 'wpbe-field-group';
	const control   = controlFactory();
	if ( fieldId ) { control.id = fieldId; }
	const lbl           = document.createElement( 'label' );
	lbl.className       = 'wpbe-label';
	lbl.textContent     = labelText;
	if ( control.id ) { lbl.htmlFor = control.id; }
	group.appendChild( lbl );
	group.appendChild( control );
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
		const div = document.createElement( 'div' );
		if ( field.id    ) { div.id        = field.id; }
		if ( field.class ) { div.className = field.class; }
		if ( field.hidden ) { div.hidden   = true; }
		return { group: div, control: div };
	}

	let controlEl = null;
	switch ( type ) {
		case 'text':
		case 'number': {
			const inp       = document.createElement( 'input' );
			inp.className   = state.CSS.input;
			inp.type        = ( 'number' === type ) ? 'number' : 'text';
			if ( field.placeholder ) { inp.placeholder = field.placeholder; }
			applyAttrs( inp, field.attrs );
			controlEl = inp;
			break;
		}
		case 'select': {
			const sel     = document.createElement( 'select' );
			sel.className = state.CSS.select;
			for ( const opt of ( field.options || [] ) ) {
				const o       = document.createElement( 'option' );
				o.value       = opt.value;
				o.textContent = opt.label;
				if ( opt.selected ) { o.selected = true; }
				sel.appendChild( o );
			}
			applyAttrs( sel, field.attrs );
			controlEl = sel;
			break;
		}
		case 'textarea': {
			const ta     = document.createElement( 'textarea' );
			ta.className = 'wpbe-textarea';
			applyAttrs( ta, field.attrs );
			if ( field.value !== undefined ) { ta.value = field.value; }
			controlEl = ta;
			break;
		}
		case 'pre': {
			const pre        = document.createElement( 'pre' );
			pre.className    = 'wpbe-embed-code';
			pre.textContent  = field.content || '';
			const group      = document.createElement( 'div' );
			group.className  = state.CSS.fieldGroup;
			if ( field.id ) { group.id = field.id; }
			if ( field.label ) {
				const lbl        = document.createElement( 'label' );
				lbl.className    = state.CSS.label;
				lbl.textContent  = field.label;
				group.appendChild( lbl );
			}
			group.appendChild( pre );
			return { group, control: pre };
		}
		case 'link': {
			const a        = document.createElement( 'a' );
			a.className    = 'wpbe-button-secondary';
			a.href         = field.href || '#';
			a.textContent  = field.label || ( field.attrs && field.attrs.title ) || '';
			applyAttrs( a, field.attrs );
			if ( field.id ) { a.id = field.id; }
			const group      = document.createElement( 'div' );
			group.className  = state.CSS.fieldGroup;
			if ( field.label ) {
				const lbl        = document.createElement( 'label' );
				lbl.className    = state.CSS.label;
				lbl.textContent  = field.label || '';
				group.appendChild( lbl );
			}
			group.appendChild( a );
			return { group, control: a };
		}
		case 'button': {
			const btn       = document.createElement( 'button' );
			btn.type        = 'button';
			btn.className   = 'wpbe-button-secondary';
			btn.textContent = field.label || ( field.attrs && field.attrs.title ) || '';
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
		const hint     = document.createElement( 'p' );
		hint.className = 'wpbe-inspector-hint';
		hint.innerHTML = field.hint;
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
	const tabPanel       = document.createElement( 'div' );
	tabPanel.className   = 'wpbe-tab-panel';
	tabPanel.dataset.tab = tab.key;

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
	state.panel = document.createElement( 'div' );
	state.panel.className = 'wpbe-panel';
	state.panel.setAttribute( 'role', 'dialog' );
	state.panel.setAttribute( 'aria-label', state.text.attributes || 'Element settings' );

	// ── Header ────────────────────────────────────────────────────────────────
	const header         = document.createElement( 'div' );
	header.className     = 'wpbe-panel-header';
	const headerInside     = document.createElement( 'div' );
	headerInside.className = 'wpbe-panel-header-inside';

	state.nodeChip           = document.createElement( 'span' );
	state.nodeChip.className = 'wpbe-chip wpbe-chip--node';
	state.nodeChip.style.cursor = 'pointer';
	state.nodeChip.addEventListener( 'click', () => {
		if ( state.cb_scrollIntoView ) { state.cb_scrollIntoView( state.elementId ); }
		if ( state.cb_navigateEditor ) { state.cb_navigateEditor( 'element', 'identity', 'wpbe-node' ); }
	} );

	// Structure-view toggle button — placed to the left of the node chip.
	state.structureToggleBtn           = document.createElement( 'button' );
	state.structureToggleBtn.type      = 'button';
	state.structureToggleBtn.className = 'wpbe-structure-toggle-btn';
	state.structureToggleBtn.setAttribute( 'aria-label', state.text.structureView || 'Structure View' );
	state.structureToggleBtn.setAttribute( 'title',      state.text.structureView || 'Structure View' );
	state.structureToggleBtn.innerHTML = ICON_STRUCTURE;
	state.structureToggleBtn.addEventListener( 'click', toggleStructureMode );

	const headerLeftMain = document.createElement( 'div' );
	headerLeftMain.className = 'wpbe-panel-header-left-side';
	headerLeftMain.appendChild( state.structureToggleBtn );
	headerLeftMain.appendChild( state.nodeChip );
	headerInside.appendChild( headerLeftMain );

	state.idChip           = document.createElement( 'span' );
	state.idChip.className = 'wpbe-chip wpbe-chip--id';
	state.idChip.style.cursor = 'pointer';
	state.idChip.addEventListener( 'click', () => {
		if ( state.cb_navigateEditor ) { state.cb_navigateEditor( 'element', 'identity', 'wpbe-node-id' ); }
	} );

	const headerRightSide = document.createElement( 'div' );
	headerRightSide.className = 'wpbe-panel-header-right-side';
	headerRightSide.appendChild( state.idChip );
	headerInside.appendChild( headerRightSide );

	header.appendChild( headerInside );

	if ( ! ( state.config && state.config.isBuilderMode ) ) {
		const closeBtn       = document.createElement( 'button' );
		closeBtn.className   = 'wpbe-close-btn';
		closeBtn.type        = 'button';
		closeBtn.setAttribute( 'aria-label', state.text.close || 'Close' );
		closeBtn.innerHTML   = '&#x2715;';
		closeBtn.addEventListener( 'click', () => { if ( state.cb_closePanel ) { state.cb_closePanel(); } } );
		header.appendChild( closeBtn );
	}
	state.panel.appendChild( header );

	// ── Body — schema-driven tab panels ───────────────────────────────────────
	const body       = document.createElement( 'div' );
	body.className   = 'wpbe-panel-body';
	for ( const tab of ( schema || [] ) ) {
		body.appendChild( renderTabPanelFromSchema( tab ) );
	}
	state.panel.appendChild( body );

	// ── Footer ────────────────────────────────────────────────────────────────
	const footer       = document.createElement( 'div' );
	footer.className   = 'wpbe-panel-footer';

	// Tab switcher buttons — built from the schema so the order and keys
	// stay in sync with the server-defined tabs.
	const tabBtnsGroup       = document.createElement( 'div' );
	tabBtnsGroup.className   = 'wpbe-tab-btns';
	state.tabBtns            = [];

	const tabIconMap = { main: ICON_POST, element: ICON_ELEMENT };
	for ( const tab of ( schema || [] ) ) {
		const btn       = document.createElement( 'button' );
		btn.type        = 'button';
		btn.dataset.tab = tab.key;
		btn.className   = 'wpbe-tab-btn wpbe-panel-footer-link' + ( 'element' === tab.key ? ' is-active' : '' );
		btn.innerHTML   = tabIconMap[ tab.key ] || '';
		btn.style.fill  = '#ffffff';
		btn.addEventListener( 'click', ( () => {
			const key = tab.key;
			return () => { if ( state.cb_navigateEditor ) { state.cb_navigateEditor( key ); } };
		} )() );
		tabBtnsGroup.appendChild( btn );
		state.tabBtns.push( btn );
	}
	footer.appendChild( tabBtnsGroup );

	// Action buttons — right side of footer.
	const footerActions       = document.createElement( 'div' );
	footerActions.className   = 'wpbe-footer-actions';

	state.editLink           = document.createElement( 'a' );
	state.editLink.className = 'wpbe-edit-link wpbe-panel-footer-link';
	state.editLink.target    = '_blank';
	state.editLink.rel       = 'noopener noreferrer';
	state.editLink.setAttribute( 'aria-label', state.text.editInBuilder || 'Edit in Builder' );
	state.editLink.innerHTML = ICON_ISOLATE;
	state.editLink.style.fill = '#ffffff';

	state.fitBtn           = document.createElement( 'button' );
	state.fitBtn.type      = 'button';
	state.fitBtn.className = 'wpbe-fit-btn wpbe-panel-footer-link';
	state.fitBtn.setAttribute( 'aria-label', state.text.fitPage || 'Fit Page' );
	state.fitBtn.setAttribute( 'title',      state.text.fitPage || 'Fit Page' );
	state.fitBtn.disabled  = ! state.isDocked;
	state.fitBtn.innerHTML = ICON_FIT;
	state.fitBtn.addEventListener( 'click', togglePageZoom );

	state.saveBtn           = document.createElement( 'button' );
	state.saveBtn.type      = 'button';
	state.saveBtn.className = 'wpbe-save-btn';

	state.statusMsg = document.createElement( 'span' );
	state.statusMsg.className = 'wpbe-save-status';
	state.statusMsg.setAttribute( 'role',     'status' );
	state.statusMsg.setAttribute( 'aria-live', 'polite' );

	const saveLbl       = document.createElement( 'span' );
	saveLbl.textContent = state.text.save || 'Save';
	state.saveLbl       = saveLbl;

	state.saveBtn.appendChild( state.statusMsg );
	state.saveBtn.appendChild( saveLbl );
	state.saveBtn.addEventListener( 'click', () => { if ( state.cb_saveElement ) { state.cb_saveElement(); } } );

	if ( ! ( state.config && state.config.isBuilderMode ) ) {
		footerActions.appendChild( state.editLink );
	}
	footerActions.appendChild( state.fitBtn );
	footerActions.appendChild( state.saveBtn );
	footer.appendChild( footerActions );

	// Left-edge resize handle (used when docked right).
	const resizeHandle       = document.createElement( 'div' );
	resizeHandle.className   = 'wpbe-resize-handle-left';

	// Right-edge resize handle (used when docked left).
	const resizeHandleRight       = document.createElement( 'div' );
	resizeHandleRight.className   = 'wpbe-resize-handle-right';

	state.panel.appendChild( footer );
	state.panel.appendChild( resizeHandle );
	state.panel.appendChild( resizeHandleRight );
	document.body.appendChild( state.panel );
	initDrag();
	initResize();
	// initStyleEditor() and initHooksEditor() are called by the caller
	// (fetchElement in ajax.js) after createPanel() returns.
}
