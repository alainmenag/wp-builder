/**
 * WP Builder — Element Quick-Editor
 *
 * When a logged-in editor clicks any [data-wp-builder-id] element on the
 * front end, a slide-out panel appears with that element's settings
 * (Identity, Content, Layout, Style, Attributes). Changes are saved via
 * AJAX without opening the full Builder editor.
 *
 * Loaded as a native ES module so it shares NODE_GLOSSARY, VOID_NODES, and
 * ALLOWED_NODES from constants.js and the attr-rendering helpers from
 * dom-helpers.js rather than duplicating them.
 */

import { VOID_NODES, ALLOWED_NODES, EDITOR_CPT } from './constants.js';
import { normalizeNodeTag, findElement } from './layout.js';
import { renderNodeAttrs } from './dom-helpers.js';
import { ICON_FIT, ICON_ELEMENT, ICON_POST, ICON_ISOLATE, ICON_ADD, ICON_REMOVE, ICON_STRUCTURE } from './constants.js';

( () => {
	'use strict';

	const config = window.wpBuilderEditor;
	if ( ! config ) { return; }

	// Fallback: treat as builder mode if the URL has action=builder and post=,
	// in case PHP did not set isBuilderMode (e.g. another enqueue overrode it).
	if ( ! config.isBuilderMode ) {
		const _p = new URLSearchParams( window.location.search );
		if ( 'builder' === _p.get( 'action' ) && _p.get( 'post' ) ) {
			config.isBuilderMode = true;
		}
	}

	const text = config.i18n || {};

	// -----------------------------------------------------------------------
	// State
	// -----------------------------------------------------------------------

	/** @type {HTMLElement|null} */
	let _panel     = null;
	/** @type {string|null} */
	let _postId    = null;
	/** @type {string|null} */
	let _elementId = null;
	/** @type {HTMLElement|null} The live [data-wp-builder-post-id] root element. */
	let _liveRoot  = null;
	/** @type {number|null} Persisted panel left position (px). */
	let _panelLeft  = null;
	/** @type {number|null} Persisted panel top position (px). */
	let _panelTop   = null;
	/** @type {number} Last known pointer X position (clientX), updated on every mousemove. */
	let _pointerX   = 0;
	/** @type {boolean} Whether the panel is docked (snapped full-height to an edge). */
	let _isDocked   = false;
	/** @type {'left'|'right'} Which edge the panel is docked to. */
	let _dockedSide = 'right';
	/** @type {number|null} Persisted docked panel width (px). */
	let _panelWidth = null;

	/** Pixels the pointer must be from a viewport edge (while the panel is already flush) to trigger a snap. */
	const POINTER_SNAP_THRESHOLD  = 50;
	/** Pixels dragged away from a docked edge before the panel undocks. */
	const UNDOCK_THRESHOLD        = 25;
	/** @type {boolean} Whether the fit-page zoom is currently active. */
	let _isPageZoomed = false;
	/** @type {number} The scale factor applied by the last applyPageZoom() call. */
	let _pageZoomScale = 1;
	/** @type {HTMLElement|null} Reference to the Fit Page footer button. */
	let _fitBtn = null;

	// ── Structure-view state ──────────────────────────────────────────────────

	/** @type {boolean} Whether structure mode is currently active. */
	let _isStructureMode = false;
	/**
	 * @type {string|null} Snapshot of the rendered HTML captured when entering structure mode.
	 * Includes the preceding sibling <style> block (if any) so that exitStructureMode() can
	 * restore the full rendered state — including the root element's custom CSS — in one step.
	 */
	let _savedRenderedOuterHtml = null;
	/** @type {HTMLStyleElement|null} The sibling <style> element for the root element's custom CSS, disabled while structure mode is active. */
	let _suppressedStyleEl = null;
	/** @type {HTMLButtonElement|null} The structure-view toggle button in the panel header. */
	let _structureToggleBtn = null;
	/** @type {Object|null} The last layout object received from a wp_builder_get_element response. */
	let _cachedLayout = null;

	// -----------------------------------------------------------------------
	// localStorage persistence
	// -----------------------------------------------------------------------

	const STORAGE_KEY = 'wpbfe_panel_prefs';

	function loadPrefs() {
		try {
			const raw = localStorage.getItem( STORAGE_KEY );
			if ( ! raw ) { return; }
			const prefs = JSON.parse( raw );
			if ( typeof prefs.isDocked  === 'boolean' ) { _isDocked    = prefs.isDocked; }
			if ( prefs.dockedSide === 'left' || prefs.dockedSide === 'right' ) { _dockedSide = prefs.dockedSide; }
			if ( typeof prefs.left      === 'number'  ) { _panelLeft   = prefs.left; }
			if ( typeof prefs.top       === 'number'  ) { _panelTop    = prefs.top; }
			if ( typeof prefs.width     === 'number'  ) { _panelWidth  = prefs.width; }
			if ( typeof prefs.isPageZoomed === 'boolean' ) { _isPageZoomed = prefs.isPageZoomed; }
		} catch ( e ) { /* silently ignore corrupt data */ }
	}

	function savePrefs() {
		try {
			localStorage.setItem( STORAGE_KEY, JSON.stringify( {
				isDocked:     _isDocked,
				dockedSide:   _dockedSide,
				left:         _panelLeft,
				top:          _panelTop,
				width:        _panelWidth,
				isPageZoomed: _isPageZoomed,
			} ) );
		} catch ( e ) { /* silently ignore quota / private-mode errors */ }
	}

	loadPrefs();

	// Panel field references (populated once by createPanel).
	let _nodeChip          = null;
	let _idChip            = null;
	let _editLink          = null;
	let _statusMsg         = null;
	let _saveBtn           = null;
	let _nodeSelectCtrl    = null;
	let _idDisplayCtrl     = null;
	let _htmlTextareaCtrl  = null;
	let _contentSection    = null;
	let _flexDirCtrl       = null;
	let _flexGrowCtrl      = null;
	let _gapCtrl           = null;
	let _styleTextareaCtrl = null;
	let _attrsSection      = null;
	/** @type {HTMLElement|null} The Main tab panel container. */
	let _mainTabPanel      = null;
	/** @type {HTMLElement|null} The Element tab panel container. */
	let _elementTabPanel   = null;
	/** @type {HTMLInputElement|null} Post title input in Main tab. */
	let _mainTitleDisplay  = null;
	/** @type {HTMLSelectElement|null} Post-status select in Main tab. */
	let _mainStatusDisplay = null;
	/** @type {HTMLSelectElement|null} Page layout select in Main tab. */
	let _mainPageTemplateDisplay = null;
	/** @type {HTMLTextAreaElement|null} Hooks textarea in Main tab (snippet only). */
	let _hooksTextareaCtrl       = null;
	/** @type {Object|null} CodeMirror wrapper for the hooks textarea. */
	let _hooksEditor             = null;
	/** @type {HTMLButtonElement[]} The two tab toggle buttons. */
	let _tabBtns           = [];

	// CodeMirror wrapper instance (null when wp.codeEditor is unavailable).
	let _styleEditor              = null;
	// True while setValue() is being called programmatically to suppress onChange.
	let _styleEditorSuppressChange = false;
	/** @type {boolean} Whether the panel has unsaved changes pending. */
	let _hasUnsavedChanges = false;
	/** @type {HTMLElement|null} The label <span> inside _saveBtn (shows "Save" / "Unsave"). */
	let _saveLbl = null;

	// CSS class names used by this panel (wpbe- prefix to avoid conflicts
	// with the admin editor stylesheet loaded inside the builder iframe).
	const CSS = {
		select:     'wpbe-select',
		input:      'wpbe-input',
		fieldGroup: 'wpbe-field-group',
		label:      'wpbe-label',
	};

	// -----------------------------------------------------------------------
	// Accordion / field-group helpers (private — panel DOM only)
	// -----------------------------------------------------------------------

	function createAccordion( labelText, startOpen ) {
		const section = document.createElement( 'div' );
		section.className = 'wpbe-accordion' + ( startOpen ? ' is-open' : '' );

		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'wpbe-accordion-header';
		btn.setAttribute( 'aria-expanded', startOpen ? 'true' : 'false' );
		btn.addEventListener( 'click', () => {
			const isOpen = section.classList.contains( 'is-open' );
			// Collapse all other open accordions in the panel (one-at-a-time).
			if ( _panel && ! isOpen ) {
				_panel.querySelectorAll( '.wpbe-accordion.is-open' ).forEach( ( other ) => {
					if ( other === section ) { return; }
					other.classList.remove( 'is-open' );
					const otherBtn = other.querySelector( '.wpbe-accordion-header' );
					if ( otherBtn ) { otherBtn.setAttribute( 'aria-expanded', 'false' ); }
				} );
			}
			section.classList.toggle( 'is-open', ! isOpen );
			btn.setAttribute( 'aria-expanded', ( ! isOpen ).toString() );
		} );

		const labelSpan = document.createElement( 'span' );
		labelSpan.textContent = labelText;

		const chevron = document.createElement( 'span' );
		chevron.className = 'wpbe-accordion-chevron';
		chevron.setAttribute( 'aria-hidden', 'true' );

		btn.appendChild( labelSpan );
		btn.appendChild( chevron );
		section.appendChild( btn );

		const body = document.createElement( 'div' );
		body.className = 'wpbe-accordion-body';
		const inner = document.createElement( 'div' );
		inner.className = 'wpbe-accordion-body-inner';
		body.appendChild( inner );
		section.appendChild( body );

		return section;
	}

	function createFieldGroup( labelText, controlFactory, fieldId ) {
		const group   = document.createElement( 'div' );
		group.className = 'wpbe-field-group';
		const control = controlFactory();
		if ( fieldId ) { control.id = fieldId; }
		const lbl     = document.createElement( 'label' );
		lbl.className   = 'wpbe-label';
		lbl.textContent = labelText;
		if ( control.id ) { lbl.htmlFor = control.id; }
		group.appendChild( lbl );
		group.appendChild( control );
		return { group, control };
	}

	/**
	 * Navigate to a specific tab, accordion section, and optional form field
	 * within the front-end editor panel. Mirrors navigate() in navigation.js
	 * for the full backend editor.
	 *
	 * @param {'main'|'element'} tab     Tab key to activate.
	 * @param {string|null}      section Accordion ID suffix (e.g. 'identity') or null.
	 * @param {string}           [field] Element ID to focus after opening.
	 */
	function navigateEditor( tab, section, field ) {
		switchTab( tab );

		if ( section ) {
			const accordion = document.getElementById( 'wpbe-accordion-' + section );
			if ( accordion && ! accordion.classList.contains( 'is-open' ) ) {
				const accHeader = accordion.querySelector( '.wpbe-accordion-header' );
				if ( accHeader ) { accHeader.click(); }
			}
		}

		if ( field ) {
			const fieldEl = document.getElementById( field );
			if ( fieldEl ) {
				// Use requestAnimationFrame to ensure the accordion is fully
				// visible before attempting to focus and select the field.
				requestAnimationFrame( () => {
					fieldEl.focus();
					if ( fieldEl.select ) { fieldEl.select(); }
				} );
			}
		}
	}

	// -----------------------------------------------------------------------
	// Panel construction (runs once on first open)
	// -----------------------------------------------------------------------

	/**
	 * Initialise CodeMirror on the style textarea if wp.codeEditor is available.
	 * Falls back to a plain input listener so the textarea value stays in sync.
	 * Must be called after _styleTextareaCtrl has been set.
	 */
	function initStyleEditor() {
		if ( ! _styleTextareaCtrl ) { return; }

		if ( window.wp && window.wp.codeEditor ) {
			_styleEditor = window.wp.codeEditor.initialize( _styleTextareaCtrl, {
				codemirror: {
					mode:              'css',
					autoCloseBrackets: true,
					matchBrackets:     true,
					placeholder:       _styleTextareaCtrl.placeholder || '',
				},
			} );
		}
		// When CodeMirror is absent the textarea value is read directly, so no
		// additional listener is needed.
	}

	/**
	 * Initialise CodeMirror on the hooks textarea with autocompletion for
	 * predefined hook locations (from config.hookLocations) and priority values.
	 * Falls back to a plain textarea when wp.codeEditor is unavailable.
	 */
	function initHooksEditor() {
		if ( ! _hooksTextareaCtrl ) { return; }
		if ( ! window.wp || ! window.wp.codeEditor ) { return; }

		const hookSlugs        = ( config.hookLocations || [] ).filter( Boolean );
		const prioritySlugs    = [ '1', '5', '10', '20', '50', '100' ];
		const CM               = window.wp.CodeMirror;

		function hooksHint( cm ) {
			const cursor  = cm.getCursor();
			const line    = cm.getLine( cursor.line );
			const before  = line.slice( 0, cursor.ch );
			const pipePos = before.indexOf( '|' );

			if ( pipePos === -1 ) {
				// Suggest hook names.
				const token = before.trim();
				const list  = hookSlugs.filter( ( s ) => s.startsWith( token ) );
				return {
					list,
					from: CM.Pos( cursor.line, cursor.ch - token.length ),
					to:   cursor,
				};
			}

			// Suggest priorities.
			const token = before.slice( pipePos + 1 );
			const list  = prioritySlugs.filter( ( s ) => s.startsWith( token ) );
			return {
				list,
				from: CM.Pos( cursor.line, pipePos + 1 ),
				to:   cursor,
			};
		}

		_hooksEditor = window.wp.codeEditor.initialize( _hooksTextareaCtrl, {
			codemirror: {
				mode:       'text/plain',
				lineWrapping: false,
				extraKeys:  { 'Ctrl-Space': function( cm ) { cm.showHint( { hint: hooksHint, completeSingle: false } ); } },
				placeholder: _hooksTextareaCtrl.placeholder || '',
			},
		} );

		_hooksEditor.codemirror.on( 'inputRead', function( cm ) {
			if ( cm.state.completionActive ) { return; }
			cm.showHint( { hint: hooksHint, completeSingle: false } );
		} );
	}

	function scrollBuilderElementIntoView( id ) {
		if ( ! id ) { return; }
		const target = document.querySelector( '[data-wp-builder-id="' + id + '"]' );
		if ( target ) { target.scrollIntoView( { behavior: 'instant', block: 'center' } ); }
	}

	/**
	 * Switch the active tab panel in the front-end editor widget.
	 *
	 * @param {'main'|'element'} key Tab key to activate.
	 */
	function switchTab( key ) {
		_tabBtns.forEach( ( btn ) => {
			btn.classList.toggle( 'is-active', btn.dataset.tab === key );
		} );
		if ( _mainTabPanel )    { _mainTabPanel.hidden    = key !== 'main'; }
		if ( _elementTabPanel ) { _elementTabPanel.hidden = key !== 'element'; }
	}

	// -----------------------------------------------------------------------
	// Schema-driven field renderers
	// -----------------------------------------------------------------------

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
	 * Maps each schema field id to a function that assigns the rendered control
	 * element to the appropriate module-level variable and wires any special
	 * behaviour (e.g. the id-field sanitise-on-blur listener).
	 */
	const FIELD_REFS = {
		'wpbe-node':           ( ctrl ) => { _nodeSelectCtrl           = ctrl; },
		'wpbe-node-id':        ( ctrl ) => {
			_idDisplayCtrl = ctrl;
			ctrl.addEventListener( 'blur', () => {
				const sanitized = ctrl.value.toLowerCase()
					.replace( /\s+/g, '-' )
					.replace( /[^a-z0-9_-]/g, '' )
					.replace( /-+/g, '-' )
					.replace( /^-+|-+$/g, '' );
				ctrl.value = sanitized || _elementId || '';
			} );
		},
		'wpbe-html-content':   ( ctrl ) => { _htmlTextareaCtrl         = ctrl; },
		'wpbe-flex-direction': ( ctrl ) => { _flexDirCtrl              = ctrl; },
		'wpbe-flex-grow':      ( ctrl ) => { _flexGrowCtrl             = ctrl; },
		'wpbe-gap':            ( ctrl ) => { _gapCtrl                  = ctrl; },
		'wpbe-custom-style':   ( ctrl ) => { _styleTextareaCtrl        = ctrl; },
		'wpbe-post-title':     ( ctrl ) => { _mainTitleDisplay         = ctrl; },
		'wpbe-post-status':    ( ctrl ) => { _mainStatusDisplay        = ctrl; },
		'wpbe-page-template':  ( ctrl ) => { _mainPageTemplateDisplay  = ctrl; },
		'wpbe-hooks':          ( ctrl ) => { _hooksTextareaCtrl        = ctrl; },
		'wpbe-reset-builder':  ( ctrl ) => { ctrl.addEventListener( 'click', resetBuilder ); },
	};

	/**
	 * Build a single field's DOM from a schema field descriptor.
	 * Calls createFieldGroup() and wires the control to its module-level
	 * variable via FIELD_REFS.
	 *
	 * Supported types: text, number, select, textarea, container.
	 *
	 * @param {Object} field Field descriptor from the server schema.
	 * @returns {{group: HTMLElement, control: HTMLElement}|null}
	 */
	function renderFieldFromSchema( field ) {
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
				inp.className   = CSS.input;
				inp.type        = ( 'number' === type ) ? 'number' : 'text';
				if ( field.placeholder ) { inp.placeholder = field.placeholder; }
				applyAttrs( inp, field.attrs );
				controlEl = inp;
				break;
			}
			case 'select': {
				const sel     = document.createElement( 'select' );
				sel.className = CSS.select;
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
				group.className  = CSS.fieldGroup;
				if ( field.id ) { group.id = field.id; }
				if ( field.label ) {
					const lbl        = document.createElement( 'label' );
					lbl.className    = CSS.label;
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
				a.textContent  = field.label || '';
				applyAttrs( a, field.attrs );
				if ( field.id ) { a.id = field.id; }
				const group      = document.createElement( 'div' );
				group.className  = CSS.fieldGroup;
				if ( field.label ) {
					const lbl        = document.createElement( 'label' );
					lbl.className    = CSS.label;
					lbl.textContent  = field.label;
					group.appendChild( lbl );
				}
				group.appendChild( a );
				return { group, control: a };
			}
			case 'button': {
				const btn       = document.createElement( 'button' );
				btn.type        = 'button';
				btn.className   = 'wpbe-button-secondary';
				btn.textContent = field.label || '';
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

		// Wire the control to its module-level variable and any special behaviour.
		if ( field.id && FIELD_REFS[ field.id ] ) {
			FIELD_REFS[ field.id ]( control );
		}

		return { group, control };
	}

	/**
	 * Build a .wpbe-tab-panel div and all its accordion sections from a
	 * schema tab descriptor. Sets the relevant module-level tab-panel and
	 * accordion variables as a side-effect.
	 *
	 * @param {Object} tab Tab descriptor from the server schema.
	 * @returns {HTMLElement}
	 */
	function renderTabPanelFromSchema( tab ) {
		const tabPanel       = document.createElement( 'div' );
		tabPanel.className   = 'wpbe-tab-panel';
		tabPanel.dataset.tab = tab.key;

		// Element tab is the default active view; main tab starts hidden.
		if ( 'main'    === tab.key ) { tabPanel.hidden = true;  _mainTabPanel    = tabPanel; }
		if ( 'element' === tab.key ) {                          _elementTabPanel = tabPanel; }

		for ( const accordion of ( tab.accordions || [] ) ) {
			const accEl = createAccordion( accordion.label, !! accordion.open );
			accEl.id    = 'wpbe-accordion-' + accordion.slug;

			// Store accordion references needed by populatePanel().
			if ( 'content' === accordion.slug ) { _contentSection = accEl; }
			if ( 'attrs'   === accordion.slug ) { _attrsSection   = accEl; }

			// Refresh CodeMirror when the style accordion re-opens.
			if ( 'style' === accordion.slug ) {
				const accBtn = accEl.querySelector( '.wpbe-accordion-header' );
				if ( accBtn ) {
					accBtn.addEventListener( 'click', () => {
						if ( _styleEditor && accEl.classList.contains( 'is-open' ) ) {
							_styleEditor.codemirror.refresh();
						}
					} );
				}
			}

			// Refresh hooks CodeMirror when the hooks accordion re-opens.
			if ( 'hooks' === accordion.slug ) {
				const accBtn = accEl.querySelector( '.wpbe-accordion-header' );
				if ( accBtn ) {
					accBtn.addEventListener( 'click', () => {
						if ( _hooksEditor && accEl.classList.contains( 'is-open' ) ) {
							_hooksEditor.codemirror.refresh();
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

	// -----------------------------------------------------------------------
	// Panel construction (runs once on first open)
	// -----------------------------------------------------------------------

	function createPanel( schema ) {
		// Panel shell
		_panel = document.createElement( 'div' );
		_panel.className = 'wpbe-panel';
		_panel.setAttribute( 'role', 'dialog' );
		_panel.setAttribute( 'aria-label', text.attributes || 'Element settings' );

		// Header
		const header      = document.createElement( 'div' );
		header.className  = 'wpbe-panel-header';
		const headerLeft  = document.createElement( 'div' );
		headerLeft.className = 'wpbe-panel-header-left';

		_nodeChip = document.createElement( 'span' );
		_nodeChip.className = 'wpbe-chip wpbe-chip--node';
		_nodeChip.style.cursor = 'pointer';
		_nodeChip.addEventListener( 'click', () => {
			scrollBuilderElementIntoView( _elementId );
			navigateEditor( 'element', 'identity', 'wpbe-node' );
		} );

		// Structure-view toggle button — placed to the left of the node chip.
		_structureToggleBtn = document.createElement( 'button' );
		_structureToggleBtn.type = 'button';
		_structureToggleBtn.className = 'wpbe-structure-toggle-btn';
		_structureToggleBtn.setAttribute( 'aria-label', text.structureView || 'Structure View' );
		_structureToggleBtn.setAttribute( 'title',      text.structureView || 'Structure View' );
		_structureToggleBtn.innerHTML = ICON_STRUCTURE;
		_structureToggleBtn.addEventListener( 'click', toggleStructureMode );

		headerLeft.appendChild( _structureToggleBtn );
		_idChip = document.createElement( 'span' );
		_idChip.className = 'wpbe-chip wpbe-chip--id';
		_idChip.style.cursor = 'pointer';
		_idChip.addEventListener( 'click', () => {
			navigateEditor( 'element', 'identity', 'wpbe-node-id' );
		} );
		headerLeft.appendChild( _nodeChip );
		headerLeft.appendChild( _idChip );

		header.appendChild( headerLeft );

		if ( ! config.isBuilderMode ) {
			const closeBtn = document.createElement( 'button' );
			closeBtn.className = 'wpbe-close-btn';
			closeBtn.type      = 'button';
			closeBtn.setAttribute( 'aria-label', text.close || 'Close' );
			closeBtn.innerHTML = '&#x2715;';
			closeBtn.addEventListener( 'click', closePanel );
			header.appendChild( closeBtn );
		}
		_panel.appendChild( header );

		// Body — schema-driven tab panels.
		const body = document.createElement( 'div' );
		body.className = 'wpbe-panel-body';
		for ( const tab of ( schema || [] ) ) {
			body.appendChild( renderTabPanelFromSchema( tab ) );
		}
		_panel.appendChild( body );

		// Footer
		const footer = document.createElement( 'div' );
		footer.className = 'wpbe-panel-footer';

		// Tab switcher buttons — built from the schema so the order and keys
		// stay in sync with the server-defined tabs.
		const tabBtnsGroup = document.createElement( 'div' );
		tabBtnsGroup.className = 'wpbe-tab-btns';
		_tabBtns = [];

		const tabIconMap = { 'main': ICON_ELEMENT, 'element': ICON_POST };
		for ( const tab of ( schema || [] ) ) {
			const btn       = document.createElement( 'button' );
			btn.type        = 'button';
			btn.dataset.tab = tab.key;
			btn.className   = 'wpbe-tab-btn wpbe-panel-footer-link' + ( 'element' === tab.key ? ' is-active' : '' );
			btn.innerHTML   = tabIconMap[ tab.key ] || '';
			btn.style.fill  = '#ffffff';
			btn.addEventListener( 'click', ( () => {
				const key = tab.key;
				return () => switchTab( key );
			} )() );
			tabBtnsGroup.appendChild( btn );
			_tabBtns.push( btn );
		}
		footer.appendChild( tabBtnsGroup );

		// Action buttons — right side of footer.
		const footerActions = document.createElement( 'div' );
		footerActions.className = 'wpbe-footer-actions';

		_editLink = document.createElement( 'a' );
		_editLink.className = 'wpbe-edit-link wpbe-panel-footer-link';
		_editLink.target    = '_blank';
		_editLink.rel       = 'noopener noreferrer';
		_editLink.setAttribute( 'aria-label', text.editInBuilder || 'Edit in Builder' );
		_editLink.innerHTML = ICON_ISOLATE;
		_editLink.style.fill = '#ffffff';

		_fitBtn = document.createElement( 'button' );
		_fitBtn.type      = 'button';
		_fitBtn.className = 'wpbe-fit-btn wpbe-panel-footer-link';
		_fitBtn.setAttribute( 'aria-label', text.fitPage || 'Fit Page' );
		_fitBtn.setAttribute( 'title', text.fitPage || 'Fit Page' );
		_fitBtn.disabled  = ! _isDocked;
		_fitBtn.innerHTML = ICON_FIT;
		_fitBtn.addEventListener( 'click', togglePageZoom );

		_saveBtn = document.createElement( 'button' );
		_saveBtn.type      = 'button';
		_saveBtn.className = 'wpbe-save-btn';

		_statusMsg = document.createElement( 'span' );
		_statusMsg.className = 'wpbe-save-status';
		_statusMsg.setAttribute( 'role', 'status' );
		_statusMsg.setAttribute( 'aria-live', 'polite' );

		const saveLbl = document.createElement( 'span' );
		saveLbl.textContent = text.save || 'Save';
		_saveLbl = saveLbl;

		_saveBtn.appendChild( _statusMsg );
		_saveBtn.appendChild( saveLbl );
		_saveBtn.addEventListener( 'click', saveElement );

		if ( ! config.isBuilderMode ) {
			footerActions.appendChild( _editLink );
		}
		footerActions.appendChild( _fitBtn );
		footerActions.appendChild( _saveBtn );
		footer.appendChild( footerActions );

		// Left-edge resize handle (used when docked right).
		const resizeHandle = document.createElement( 'div' );
		resizeHandle.className = 'wpbe-resize-handle-left';

		// Right-edge resize handle (used when docked left).
		const resizeHandleRight = document.createElement( 'div' );
		resizeHandleRight.className = 'wpbe-resize-handle-right';

		_panel.appendChild( footer );
		_panel.appendChild( resizeHandle );
		_panel.appendChild( resizeHandleRight );
		document.body.appendChild( _panel );
		initDrag();
		initResize();
		// initStyleEditor() is called by the caller (fetchElement) after createPanel() returns.
	}

	// -----------------------------------------------------------------------
	// Drag logic + viewport clamping
	// -----------------------------------------------------------------------

	function clampToViewport() {
		if ( _isDocked || ! _panel || ! _panel.classList.contains( 'is-open' ) ) { return; }
		if ( _panelLeft === null ) { return; }
		const maxLeft = window.innerWidth  - _panel.offsetWidth;
		const maxTop  = window.innerHeight - _panel.offsetHeight;
		_panelLeft = Math.max( 0, Math.min( maxLeft, _panelLeft ) );
		_panelTop  = Math.max( 0, Math.min( maxTop,  _panelTop ) );
		_panel.style.left = _panelLeft + 'px';
		_panel.style.top  = _panelTop  + 'px';
	}

	function initDrag() {
		const header = _panel.querySelector( '.wpbe-panel-header' );
		let dragging = false;
		let startX, startY, startLeft, startTop;
		/** clientX recorded at the moment a docked-drag begins. */
		let dockedDragStartX = 0;

		header.addEventListener( 'mousedown', ( e ) => {
			if ( e.target.closest( 'button, a' ) ) { return; }
			dragging = true;
			startX   = e.clientX;
			startY   = e.clientY;
			_panel.classList.add( 'is-dragging' );
			if ( _isDocked ) {
				dockedDragStartX = e.clientX;
			} else {
				const rect = _panel.getBoundingClientRect();
				startLeft  = rect.left;
				startTop   = rect.top;
			}
			e.preventDefault();
		} );

		header.addEventListener( 'dblclick', ( e ) => {
			if ( e.target.closest( 'button, a' ) ) { return; }
			toggleDock();
		} );

		document.addEventListener( 'mousemove', ( e ) => {
			_pointerX = e.clientX;
			if ( ! dragging ) { return; }

			if ( _isDocked ) {
				// Determine how far the cursor has moved away from the docked edge.
				const dx = e.clientX - dockedDragStartX;
				const shouldUndock = _dockedSide === 'right'
					? dx < -UNDOCK_THRESHOLD
					: dx >  UNDOCK_THRESHOLD;

				if ( ! shouldUndock ) { return; }

				// Transition to floating: calculate a sensible initial position.
				const panelWidth  = _panel.offsetWidth;
				const panelHeight = _panel.offsetHeight;
				undockPanel();
				// Place panel so the header is under the cursor.
				_panelLeft = Math.max( 0, Math.min( window.innerWidth  - panelWidth,  e.clientX - panelWidth  / 2 ) );
				_panelTop  = Math.max( 0, Math.min( window.innerHeight - panelHeight, e.clientY - 20 ) );
				startLeft  = _panelLeft;
				startTop   = _panelTop;
				startX     = e.clientX;
				startY     = e.clientY;
				_panel.style.left = _panelLeft + 'px';
				_panel.style.top  = _panelTop  + 'px';
				return;
			}

			// ── Floating drag ──────────────────────────────────────────────
			const dx         = e.clientX - startX;
			const dy         = e.clientY - startY;
			const panelWidth = _panel.offsetWidth;
			const maxLeft    = window.innerWidth  - panelWidth;
			const maxTop     = window.innerHeight - _panel.offsetHeight;
			_panelLeft = Math.max( 0, Math.min( maxLeft, startLeft + dx ) );
			_panelTop  = Math.max( 0, Math.min( maxTop,  startTop  + dy ) );

			// Snap only when the panel is flush against a viewport edge AND
			// the pointer is still pushing toward that side (within POINTER_SNAP_THRESHOLD).
			if ( _panelLeft === 0 && _pointerX < POINTER_SNAP_THRESHOLD ) {
				dragging = false;
				_panel.classList.remove( 'is-dragging' );
				dockTo( 'left' );
				savePrefs();
				return;
			}
			if ( _panelLeft + panelWidth >= window.innerWidth && _pointerX > window.innerWidth - POINTER_SNAP_THRESHOLD ) {
				dragging = false;
				_panel.classList.remove( 'is-dragging' );
				dockTo( 'right' );
				savePrefs();
				return;
			}

			_panel.style.left = _panelLeft + 'px';
			_panel.style.top  = _panelTop  + 'px';
		} );

		document.addEventListener( 'mouseup', () => {
			if ( ! dragging ) { return; }
			dragging = false;
			_panel.classList.remove( 'is-dragging' );
			savePrefs();
		} );

		window.addEventListener( 'resize', () => {
			clampToViewport();
			if ( _isPageZoomed && _isDocked ) { applyPageZoom(); }
		} );
	}

	// -----------------------------------------------------------------------
	// Edge resize handles (docked mode only)
	// -----------------------------------------------------------------------

	function initResize() {
		const handleLeft  = _panel.querySelector( '.wpbe-resize-handle-left' );
		const handleRight = _panel.querySelector( '.wpbe-resize-handle-right' );

		let resizing     = false;
		let resizingSide = null; // 'left' | 'right'
		let startX, startWidth;

		function startResize( e, side ) {
			if ( ! _isDocked ) { return; }
			resizing     = true;
			resizingSide = side;
			startX       = e.clientX;
			startWidth   = _panel.offsetWidth;
			_panel.classList.add( 'is-resizing' );
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
			_panel.style.width = newWidth + 'px';
			if ( _isPageZoomed ) { applyPageZoom(); }
		} );

		document.addEventListener( 'mouseup', () => {
			if ( ! resizing ) { return; }
			resizing = false;
			_panel.classList.remove( 'is-resizing' );
			_panelWidth = _panel.offsetWidth;
			savePrefs();
			scrollBuilderElementIntoView( _elementId );
		} );
	}

	// -----------------------------------------------------------------------
	// Fit-Page zoom
	// -----------------------------------------------------------------------

	/**
	 * Scale #page so it fits entirely within the space to the left of the
	 * docked panel. Uses CSS transform: scale() with transform-origin top left.
	 */
	/**
	 * @param {boolean} [compensateScroll=false] When true, re-centres the
	 *   viewport so the same page content stays in view after the scale is
	 *   applied.  Pass true only when the user explicitly toggles fit on;
	 *   leave false for re-applications triggered by panel-open / resize.
	 */
	function applyPageZoom( compensateScroll ) {
		const pageEl = document.getElementById( 'page' );
		if ( ! pageEl || ! _panel ) { return; }
		const panelWidth     = _panel.offsetWidth;
		const availableWidth = window.innerWidth - panelWidth;
		if ( availableWidth <= 0 ) { return; }
		const scale = availableWidth / window.innerWidth;
		// Capture the page-coordinate of the current viewport centre *before*
		// the transform is applied so we can re-centre when the user toggled fit.
		const viewportCenterPx = window.scrollY + window.innerHeight / 2;
		_pageZoomScale               = scale;
		pageEl.style.transform       = 'scale(' + scale + ')';
		pageEl.style.transformOrigin = _dockedSide === 'left' ? 'top right' : 'top left';
		document.body.classList.add( 'wpbe-page-zoomed' );
		// Only re-scroll on explicit user toggle; skip on panel-open / resize
		// re-applications so we don't jump the page away from the clicked element.
		if ( compensateScroll ) {
			// Re-centre: logical centre C maps to C*scale after transform-origin:top-left.
			window.scrollTo( { top: Math.max( 0, viewportCenterPx * scale - window.innerHeight / 2 ), behavior: 'instant' } );
		}
		if ( _fitBtn ) {
			_fitBtn.classList.add( 'is-active' );
			_fitBtn.setAttribute( 'aria-label', text.resetFit || 'Reset Fit' );
			_fitBtn.setAttribute( 'title',      text.resetFit || 'Reset Fit' );
		}
	}

	function removePageZoom() {
		const pageEl = document.getElementById( 'page' );
		// Capture the scaled viewport centre before clearing the transform so we
		// can map it back to page coordinates and restore the scroll position.
		const viewportCenterPx = window.scrollY + window.innerHeight / 2;
		const newScrollTop     = viewportCenterPx / _pageZoomScale - window.innerHeight / 2;
		if ( pageEl ) {
			pageEl.style.transform       = '';
			pageEl.style.transformOrigin = '';
		}
		_pageZoomScale = 1;
		document.body.classList.remove( 'wpbe-page-zoomed' );
		window.scrollTo( { top: Math.max( 0, newScrollTop ), behavior: 'instant' } );
		if ( _fitBtn ) {
			_fitBtn.classList.remove( 'is-active' );
			_fitBtn.setAttribute( 'aria-label', text.fitPage || 'Fit Page' );
			_fitBtn.setAttribute( 'title',      text.fitPage || 'Fit Page' );
		}
	}

	function togglePageZoom() {
		if ( ! _isDocked ) { return; }
		_isPageZoomed = ! _isPageZoomed;
		if ( _isPageZoomed ) {
			applyPageZoom( true );
		} else {
			removePageZoom();
		}
		savePrefs();
	}

	// -----------------------------------------------------------------------
	// Structure-view
	// -----------------------------------------------------------------------

	/**
	 * Toggle between rendered mode and structure (node-tree) mode.
	 */
	function toggleStructureMode() {
		if ( _isStructureMode ) {
			exitStructureMode();
		} else {
			enterStructureMode();
		}
	}

	/**
	 * Enter structure mode: render the node tree over the live _liveRoot element.
	 * Uses the layout already cached from the last wp_builder_get_element response.
	 * Falls back to fetching the element (which also returns the layout) if the
	 * cache is empty.
	 */
	function enterStructureMode() {
		if ( ! _liveRoot || ! _postId ) { return; }

		// Capture the preceding sibling <style> element (the root element's custom CSS block
		// emitted by the PHP renderer). Include it in the snapshot so exitStructureMode()
		// can restore the full rendered state in one step, then disable it so element styles
		// are not applied while the structure tree is displayed.
		const prevEl = _liveRoot.previousElementSibling;
		_suppressedStyleEl = ( prevEl && prevEl.tagName === 'STYLE' ) ? prevEl : null;
		const stylePrefix = _suppressedStyleEl ? _suppressedStyleEl.outerHTML : '';
		_savedRenderedOuterHtml = stylePrefix + _liveRoot.outerHTML;
		if ( _suppressedStyleEl ) { _suppressedStyleEl.disabled = true; }

		// If the root element uses a browser-special tag (e.g. <script>, <style>),
		// browsers treat its children as raw text rather than rendered DOM nodes.
		// Swap it for a plain <div> so the structure tree renders correctly.
		// exitStructureMode() restores the original element from _savedRenderedOuterHtml.
		if ( _liveRoot.tagName !== 'DIV' ) {
			const div = document.createElement( 'div' );
			Array.from( _liveRoot.attributes ).forEach( ( attr ) => {
				div.setAttribute( attr.name, attr.value );
			} );
			_liveRoot.parentNode.replaceChild( div, _liveRoot );
			_liveRoot = div;
		}

		// Activate structure mode and update the toggle button immediately.
		_isStructureMode = true;
		if ( _structureToggleBtn ) {
			_structureToggleBtn.classList.add( 'is-active' );
			_structureToggleBtn.setAttribute( 'aria-label', text.renderedView || 'Rendered View' );
			_structureToggleBtn.setAttribute( 'title',      text.renderedView || 'Rendered View' );
		}

		if ( _cachedLayout ) {
			renderStructureTree( _cachedLayout, _liveRoot );
		} else if ( _elementId ) {
			// No cached layout yet — fetch the element; the response includes the
			// layout and fetchElement will call renderStructureTree because
			// _isStructureMode is now true.
			fetchElement( _postId, _elementId );
		}
	}

	/**
	 * Exit structure mode: restore the saved rendered HTML.
	 */
	function exitStructureMode() {
		if ( ! _liveRoot || ! _savedRenderedOuterHtml ) { return; }

		const tpl = document.createElement( 'template' );
		tpl.innerHTML = _savedRenderedOuterHtml.trim();

		// Remove the disabled sibling <style> before inserting the snapshot.
		// The snapshot already carries the correct <style> block (captured on enter
		// and kept in sync by save/add/delete handlers), so no duplicate is created.
		if ( _suppressedStyleEl ) {
			_suppressedStyleEl.remove();
			_suppressedStyleEl = null;
		}

		_liveRoot.parentNode.insertBefore( tpl.content, _liveRoot );
		_liveRoot.remove();

		const newRoot = document.querySelector( '[data-wp-builder-post-id="' + _postId + '"]' );
		if ( newRoot ) { _liveRoot = newRoot; }

		_isStructureMode = false;
		if ( _structureToggleBtn ) {
			_structureToggleBtn.classList.remove( 'is-active' );
			_structureToggleBtn.setAttribute( 'aria-label', text.structureView || 'Structure View' );
			_structureToggleBtn.setAttribute( 'title',      text.structureView || 'Structure View' );
		}
	}

	/**
	 * Render the layout node tree inside rootEl, replacing its inner content.
	 *
	 * @param {Object}      layout The layout object ({version, children}).
	 * @param {HTMLElement} rootEl The [data-wp-builder-post-id] root element.
	 */
	function renderStructureTree( layout, rootEl ) {
		rootEl.classList.add( 'wpbe-structure-view' );
		// Strip the element's inline layout style — it belongs on the node-body of the
		// rendered tree, not on _liveRoot. exitStructureMode() restores the full snapshot.
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
	function renderStructureNode( element, depth, isRoot ) {
		const node   = ( element.node || 'div' ).toLowerCase();
		const isVoid = !! VOID_NODES[ node ];

		const wrapper = document.createElement( 'div' );
		wrapper.className = 'wpbe-sv-node' + ( element.id === _elementId ? ' is-selected' : '' );
		wrapper.dataset.wpBuilderId = element.id;
		wrapper.style.setProperty( '--wpbe-sv-depth', depth );

		// ── Bar ──────────────────────────────────────────────────────────────
		const bar = document.createElement( 'div' );
		bar.className = 'wpbe-sv-node-bar';

		const titleBtn = document.createElement( 'button' );
		titleBtn.type = 'button';
		titleBtn.className = 'wpbe-sv-node-title';

		const svNodeChip = document.createElement( 'span' );
		svNodeChip.className = 'wpbe-chip wpbe-chip--node';
		svNodeChip.textContent = node.toUpperCase();

		const svIdChip = document.createElement( 'span' );
		svIdChip.className = 'wpbe-chip wpbe-chip--id';
		svIdChip.textContent = element.id || '';

		titleBtn.appendChild( svNodeChip );
		titleBtn.appendChild( svIdChip );

		titleBtn.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			openPanel( _postId, element.id, _liveRoot );
		} );
		bar.appendChild( titleBtn );

		if ( ! isVoid ) {
			const addBtn = document.createElement( 'button' );
			addBtn.type = 'button';
			addBtn.className = 'wpbe-sv-node-action';
			addBtn.setAttribute( 'aria-label', text.addChild || 'Add child element' );
			addBtn.setAttribute( 'title',      text.addChild || 'Add child element' );
			addBtn.innerHTML = ICON_ADD;
			addBtn.addEventListener( 'click', ( e ) => {
				e.stopPropagation();
				addChildElement( element.id );
			} );
			bar.appendChild( addBtn );
		}

		if ( ! isRoot ) {
			const delBtn = document.createElement( 'button' );
			delBtn.type = 'button';
			delBtn.className = 'wpbe-sv-node-action wpbe-sv-node-action--danger';
			delBtn.setAttribute( 'aria-label', text.deleteElement || 'Delete element' );
			delBtn.setAttribute( 'title',      text.deleteElement || 'Delete element' );
			delBtn.innerHTML = ICON_REMOVE;
			delBtn.addEventListener( 'click', ( e ) => {
				e.stopPropagation();
				deleteLayoutElement( element.id );
			} );
			bar.appendChild( delBtn );
		}

		wrapper.appendChild( bar );

		// ── Children ─────────────────────────────────────────────────────────
		const children = element.children || [];
		if ( children.length ) {
			const body = document.createElement( 'div' );
			body.className = 'wpbe-sv-node-body';

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
	function syncStructureSelection( id ) {
		if ( ! _liveRoot ) { return; }
		_liveRoot.querySelectorAll( '.wpbe-sv-node' ).forEach( ( node ) => {
			node.classList.toggle( 'is-selected', node.dataset.wpBuilderId === id );
		} );
	}

	/**
	 * POST wp_builder_add_element, then re-render structure tree.
	 *
	 * @param {string} parentId ID of the parent element to append to.
	 */
	function addChildElement( parentId ) {
		const form = new window.FormData();
		form.append( 'action',    'wp_builder_add_element' );
		form.append( 'nonce',     config.addNonce );
		form.append( 'post_id',   _postId );
		form.append( 'parent_id', parentId );

		window.fetch( config.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: form } )
			.then( ( r ) => r.json() )
			.then( ( payload ) => {
				if ( ! payload || ! payload.success ) {
					throw new Error( payload && payload.data && payload.data.message
						? payload.data.message : ( text.error || 'Error' ) );
				}
				// Update the snapshot so exitStructureMode() restores the current DOM.
				if ( payload.data.html ) { _savedRenderedOuterHtml = payload.data.html; }
				if ( payload.data.layout ) {
					_cachedLayout = payload.data.layout;
					renderStructureTree( payload.data.layout, _liveRoot );
				}
				// Open the newly-created element in the panel.
				if ( payload.data.new_element_id ) {
					openPanel( _postId, payload.data.new_element_id, _liveRoot );
				}
			} )
			.catch( ( err ) => {
				setStatus( err.message || ( text.error || 'Error' ), true );
			} );
	}

	/**
	 * POST wp_builder_delete_element, then re-render structure tree.
	 *
	 * @param {string} elementId ID of the element to delete.
	 */
	function deleteLayoutElement( elementId ) {
		const form = new window.FormData();
		form.append( 'action',     'wp_builder_delete_element' );
		form.append( 'nonce',      config.deleteNonce );
		form.append( 'post_id',    _postId );
		form.append( 'element_id', elementId );

		window.fetch( config.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: form } )
			.then( ( r ) => r.json() )
			.then( ( payload ) => {
				if ( ! payload || ! payload.success ) {
					throw new Error( payload && payload.data && payload.data.message
						? payload.data.message : ( text.error || 'Error' ) );
				}
				if ( payload.data.html ) { _savedRenderedOuterHtml = payload.data.html; }
				if ( payload.data.layout ) {
					_cachedLayout = payload.data.layout;
					renderStructureTree( payload.data.layout, _liveRoot );
				}
				// Clear panel selection if the deleted element was open.
				if ( elementId === _elementId ) {
					_elementId = null;
					if ( _nodeChip ) { _nodeChip.textContent = ''; }
					if ( _idChip   ) { _idChip.textContent   = ''; }
				}
			} )
			.catch( ( err ) => {
				setStatus( err.message || ( text.error || 'Error' ), true );
			} );
	}

	// -----------------------------------------------------------------------
	// Dock / undock toggle
	// -----------------------------------------------------------------------

	/**
	 * Dock the panel to the given edge ('left' or 'right'), updating all
	 * related state, CSS classes, and button states.
	 *
	 * @param {'left'|'right'} side
	 */
	function dockTo( side ) {
		_isDocked   = true;
		_dockedSide = side;
		_panel.classList.add( 'is-docked' );
		_panel.classList.toggle( 'is-docked-right', side === 'right' );
		_panel.classList.toggle( 'is-docked-left',  side === 'left' );
		_panel.style.left   = '';
		_panel.style.top    = '';
		_panel.style.width  = '';
		_panel.style.height = '';
		if ( _fitBtn ) { _fitBtn.disabled = false; }
		// Only apply zoom if the panel is already open and has a real rendered width.
		// When called from openPanel() the panel is still display:none at this point;
		// openPanel() handles zoom after adding the is-open class.
		if ( _isPageZoomed && _panel.classList.contains( 'is-open' ) ) {
			const zoomAlreadyApplied = document.body.classList.contains( 'wpbe-page-zoomed' );
			applyPageZoom( ! zoomAlreadyApplied );
		}
	}

	/**
	 * Undock the panel (remove all docked classes / state) without positioning it.
	 * Callers are responsible for setting `_panel.style.left/top` afterwards.
	 */
	function undockPanel() {
		if ( _isPageZoomed ) { removePageZoom(); }
		_isDocked = false;
		_panel.classList.remove( 'is-docked', 'is-docked-left', 'is-docked-right' );
		if ( _fitBtn ) { _fitBtn.disabled = true; }
	}

	function toggleDock() {
		if ( _isDocked ) {
			undockPanel();
			// Restore last floating position, or default to near the previously-docked edge.
			if ( _panelLeft === null ) {
				const adminBarOffset = document.body.classList.contains( 'admin-bar' )
					? ( window.innerWidth <= 782 ? 46 : 32 )
					: 0;
				_panelLeft = _dockedSide === 'left'
					? 20
					: Math.max( 0, window.innerWidth - 340 );
				_panelTop  = adminBarOffset;
			}
			_panel.style.left = _panelLeft + 'px';
			_panel.style.top  = _panelTop  + 'px';
		} else {
			// Snap to whichever edge the panel is currently nearest.
			const rect      = _panel.getBoundingClientRect();
			const distLeft  = rect.left;
			const distRight = window.innerWidth - rect.right;
			dockTo( distLeft <= distRight ? 'left' : 'right' );
		}
		savePrefs();
	}

	// -----------------------------------------------------------------------
	// Panel open / close
	// -----------------------------------------------------------------------

	/**
	 * Position the panel according to persisted dock/float state and mark it
	 * as open. Called both when re-opening an already-built panel and when
	 * showing it for the first time after schema-driven creation.
	 */
	function positionAndShowPanel() {
		if ( _isDocked ) {
			// Apply docked state (CSS handles position; restore any saved width).
			dockTo( _dockedSide );
			if ( _panelWidth !== null ) {
				_panel.style.width = _panelWidth + 'px';
			}
		} else {
			// Position the panel: use persisted position or default to top-right corner.
			_panel.classList.remove( 'is-docked', 'is-docked-left', 'is-docked-right' );
			if ( _panelLeft === null ) {
				const adminBarOffset = document.body.classList.contains( 'admin-bar' )
					? ( window.innerWidth <= 782 ? 46 : 32 )
					: 0;
				_panelLeft = Math.max( 0, window.innerWidth - 340 );
				_panelTop  = adminBarOffset;
			}
			_panel.style.left  = _panelLeft + 'px';
			_panel.style.top   = _panelTop  + 'px';
			_panel.style.width = '';
			if ( _fitBtn ) { _fitBtn.disabled = true; }
		}

		_editLink.href = `/wp-admin/post.php?post=${encodeURIComponent( _postId )}&action=${EDITOR_CPT}`;
		_panel.classList.add( 'is-open' );

		// Restore persisted zoom (only valid when docked).
		if ( _isDocked && _isPageZoomed ) {
			// Compensate scroll only when zoom is transitioning OFF→ON.
			// If zoom is already visually applied (e.g. switching between elements
			// while the panel stays open), the scroll position is already correct.
			const zoomAlreadyApplied = document.body.classList.contains( 'wpbe-page-zoomed' );
			applyPageZoom( ! zoomAlreadyApplied );
		}
	}

	function openPanel( postId, elementId, liveRoot ) {
		_postId    = postId;
		_elementId = elementId;
		_liveRoot  = liveRoot;

		// If we already have the panel and a cached layout, find the element
		// directly in the cache — no AJAX request needed.
		if ( _panel && _cachedLayout ) {
			const element = findElement( _cachedLayout.children || [], elementId );
			if ( element ) {
				positionAndShowPanel();
				populatePanel( element );
				return;
			}
		}

		// If the panel already exists, show it with a loading state immediately.
		// On first open the panel is built from the schema returned by fetchElement()
		// and shown once the AJAX request completes.
		if ( _panel ) {
			positionAndShowPanel();
			_saveBtn.disabled = true;
			setStatus( text.loading || 'Loading\u2026', false );
		}

		fetchElement( postId, elementId );
	}

	function closePanel() {
		if ( ! _panel ) { return; }
		_panel.classList.remove( 'is-open' );
		if ( _isPageZoomed ) {
			removePageZoom();
		}
		if ( _isStructureMode ) {
			exitStructureMode();
		}
		_postId        = null;
		_elementId     = null;
		_liveRoot      = null;
		_cachedLayout  = null;
	}

	function setStatus( msg, isError ) {
		if ( ! _statusMsg ) { return; }
		_statusMsg.textContent = msg;
		if ( _saveBtn ) {
			_saveBtn.classList.toggle( 'is-error', !! isError );
		}
	}

	// -----------------------------------------------------------------------
	// Unsaved-changes tracking + live preview
	// -----------------------------------------------------------------------

	function markDirty() {
		if ( _hasUnsavedChanges ) { return; }
		_hasUnsavedChanges = true;
		if ( _saveBtn ) { _saveBtn.classList.add( 'has-unsaved-changes' ); }
		if ( _saveLbl ) { _saveLbl.textContent = text.unsaved || 'Unsaved'; }
	}

	function markClean() {
		_hasUnsavedChanges = false;
		if ( _saveBtn ) { _saveBtn.classList.remove( 'has-unsaved-changes' ); }
		if ( _saveLbl ) { _saveLbl.textContent = text.save || 'Save'; }
	}

	/**
	 * Return the live DOM element currently open in the panel, or null when the
	 * element cannot be found (e.g. structure mode is active).
	 *
	 * When a live-preview ID change has already updated the element's
	 * data-wp-builder-id attribute to a new value, the original _elementId no
	 * longer matches. In that case we fall back to the current value of the ID
	 * input so subsequent applyLivePreview() calls still find the element.
	 *
	 * @returns {HTMLElement|null}
	 */
	function findLiveDomElement() {
		if ( ! _elementId || ! _liveRoot || _isStructureMode ) { return null; }
		if ( _liveRoot.getAttribute( 'data-wp-builder-id' ) === _elementId ) {
			return _liveRoot;
		}
		const found = _liveRoot.querySelector( '[data-wp-builder-id="' + _elementId + '"]' );
		if ( found ) { return found; }

		// Fall back: the live-preview may have already updated data-wp-builder-id
		// to the pending new ID typed by the user.
		const pendingId = _idDisplayCtrl ? _idDisplayCtrl.value : '';
		if ( pendingId && pendingId !== _elementId ) {
			if ( _liveRoot.getAttribute( 'data-wp-builder-id' ) === pendingId ) {
				return _liveRoot;
			}
			return _liveRoot.querySelector( '[data-wp-builder-id="' + pendingId + '"]' );
		}
		return null;
	}

	/**
	 * Apply the current panel field values directly to the live DOM element so
	 * changes appear in real time before the user saves.
	 *
	 * In structure mode there is no live DOM element to mutate, so only the
	 * panel header chips, the content-section visibility, and the Attributes
	 * accordion are updated — and the matching node row in the structure tree
	 * has its own chips kept in sync.
	 */
	function applyLivePreview() {
		const newTag = _nodeSelectCtrl ? _nodeSelectCtrl.value : '';
		const newId  = _idDisplayCtrl  ? _idDisplayCtrl.value  : '';

		// ── Panel header chips + content-section visibility (both modes) ──────
		if ( newTag ) {
			if ( _nodeChip ) { _nodeChip.textContent = newTag.toUpperCase(); }
			// Show or hide the content accordion for void nodes (e.g. img, input).
			if ( _contentSection ) {
				_contentSection.hidden = !! VOID_NODES[ newTag ];
			}
		}

		// ── Structure mode ────────────────────────────────────────────────────
		if ( _isStructureMode ) {
			if ( _liveRoot && _elementId ) {
				const svNode = _liveRoot.querySelector( '.wpbe-sv-node[data-wp-builder-id="' + _elementId + '"]' );
				if ( svNode ) {
					// Sync the node-type chip and re-render the Attributes accordion
					// if the node type has changed.
					if ( newTag ) {
						const tagChip = svNode.querySelector( '.wpbe-sv-node-bar .wpbe-chip--node' );
						const prevTag = tagChip ? tagChip.textContent.toLowerCase() : '';
						if ( newTag !== prevTag ) {
							if ( _attrsSection ) {
								renderNodeAttrs(
									_attrsSection.querySelector( '.wpbe-accordion-body-inner' ),
									newTag,
									{},
									() => {},
									CSS
								);
								_attrsSection.querySelectorAll( '[id^="wp-builder-node-attr-"]' ).forEach( ( ctrl ) => {
									ctrl.dataset.attrName = ctrl.id.replace( 'wp-builder-node-attr-', '' );
									ctrl.addEventListener( 'input',  markDirty );
									ctrl.addEventListener( 'change', markDirty );
								} );
								const hasAttrs = !! _attrsSection.querySelector( '.wpbe-accordion-body-inner' ).childElementCount;
								_attrsSection.hidden = ! hasAttrs;
								if ( hasAttrs && ! _attrsSection.classList.contains( 'is-open' ) ) {
									const accBtn = _attrsSection.querySelector( '.wpbe-accordion-header' );
									if ( accBtn ) { accBtn.click(); }
								}
							}
							if ( tagChip ) { tagChip.textContent = newTag.toUpperCase(); }
						}
					}

					// Sync the element-ID chip in the structure tree.
					if ( newId ) {
						const idChip = svNode.querySelector( '.wpbe-sv-node-bar .wpbe-chip--id' );
						if ( idChip ) { idChip.textContent = newId; }
					}
				}
			}
			if ( newId && _idChip ) { _idChip.textContent = newId; }
			return;
		}

		// ── Rendered mode: live DOM updates ───────────────────────────────────
		let el = findLiveDomElement();
		if ( ! el ) { return; }

		// ── Node type ─────────────────────────────────────────────────────────
		if ( newTag ) {
			const currentTag = el.tagName.toLowerCase();
			if ( newTag !== currentTag ) {
				// Replace the element in the DOM with a new element of the
				// correct tag, preserving all attributes and children.
				const newEl = document.createElement( newTag );
				Array.from( el.attributes ).forEach( ( attr ) => {
					newEl.setAttribute( attr.name, attr.value );
				} );
				while ( el.firstChild ) { newEl.appendChild( el.firstChild ); }
				el.parentNode.replaceChild( newEl, el );
				if ( _liveRoot === el ) { _liveRoot = newEl; }
				el = newEl;

				// Re-render the Attributes accordion for the new node type so the
				// correct attribute fields appear immediately without requiring a save.
				if ( _attrsSection ) {
					renderNodeAttrs(
						_attrsSection.querySelector( '.wpbe-accordion-body-inner' ),
						newTag,
						{},
						() => {},
						CSS
					);
					// Wire data-attr-name and markDirty on the freshly rendered controls.
					_attrsSection.querySelectorAll( '[id^="wp-builder-node-attr-"]' ).forEach( ( ctrl ) => {
						ctrl.dataset.attrName = ctrl.id.replace( 'wp-builder-node-attr-', '' );
						ctrl.addEventListener( 'input',  markDirty );
						ctrl.addEventListener( 'change', markDirty );
					} );
					const hasAttrs = !! _attrsSection.querySelector( '.wpbe-accordion-body-inner' ).childElementCount;
					_attrsSection.hidden = ! hasAttrs;
					// Auto-open the attrs accordion when the new node has attributes.
					if ( hasAttrs && ! _attrsSection.classList.contains( 'is-open' ) ) {
						const accBtn = _attrsSection.querySelector( '.wpbe-accordion-header' );
						if ( accBtn ) { accBtn.click(); }
					}
				}
			}
			// _nodeChip and _contentSection already updated above.
		}

		// ── Element ID ────────────────────────────────────────────────────────
		if ( newId && newId !== el.getAttribute( 'data-wp-builder-id' ) ) {
			el.setAttribute( 'data-wp-builder-id', newId );
			if ( _idChip ) { _idChip.textContent = newId; }
		}

		// ── Layout props ──────────────────────────────────────────────────────
		const flexDir  = _flexDirCtrl  ? _flexDirCtrl.value  : '';
		const flexGrow = _flexGrowCtrl ? _flexGrowCtrl.value : '';
		const gap      = _gapCtrl      ? _gapCtrl.value      : '';

		if ( flexDir === 'row' || flexDir === 'column' ) {
			el.style.display       = 'flex';
			el.style.flexDirection = flexDir;
		} else {
			el.style.display       = '';
			el.style.flexDirection = '';
		}

		if ( flexGrow !== '' && ! isNaN( parseFloat( flexGrow ) ) ) {
			el.style.flexGrow = flexGrow;
		} else {
			el.style.flexGrow = '';
		}

		el.style.gap = gap || '';

		// ── HTML content ──────────────────────────────────────────────────────
		if ( _htmlTextareaCtrl && ! _contentSection.hidden ) {
			// Preserve nested builder child elements — they follow the content
			// HTML in the DOM (PHP renders content first, then children).
			// Also preserve each child's preceding <style> sibling, because
			// PHP emits a <style> block immediately before any element that has
			// custom CSS, and that block lives inside the parent container.
			const builderChildren = Array.from(
				el.querySelectorAll( ':scope > [data-wp-builder-id]' )
			).map( ( child ) => {
				const prev    = child.previousElementSibling;
				const childStyleEl = ( prev && prev.tagName === 'STYLE' ) ? prev : null;
				return { child, childStyleEl };
			} );
			el.innerHTML = _htmlTextareaCtrl.value;
			builderChildren.forEach( ( { child, childStyleEl } ) => {
				if ( childStyleEl ) { el.appendChild( childStyleEl ); }
				el.appendChild( child );
			} );
		}

		// ── Custom style ──────────────────────────────────────────────────────
		const styleValue = _styleEditor
			? _styleEditor.codemirror.getValue()
			: ( _styleTextareaCtrl ? _styleTextareaCtrl.value : '' );
		// Use the element's current data-wp-builder-id (may have been updated
		// by the element-ID live preview above) as the CSS selector scope.
		const selector = '[data-wp-builder-id="' + ( el.getAttribute( 'data-wp-builder-id' ) || _elementId ) + '"]';

		// The PHP renderer emits a <style> block immediately before the element.
		let styleEl = el.previousElementSibling;
		if ( ! styleEl || styleEl.tagName !== 'STYLE' ) {
			styleEl = null;
		}
		if ( styleValue ) {
			if ( ! styleEl ) {
				styleEl = document.createElement( 'style' );
				el.parentNode.insertBefore( styleEl, el );
			}
			styleEl.textContent = styleValue.replace( /\bself\b/g, selector );
		} else if ( styleEl ) {
			styleEl.remove();
		}
	}

	/**
	 * Attach input/change listeners to all panel controls so that any user edit
	 * triggers markDirty() and applyLivePreview(). Called once after createPanel().
	 */
	function initChangeListeners() {
		const onFieldChange = () => {
			markDirty();
			applyLivePreview();
		};

		const fieldControls = [
			_nodeSelectCtrl, _idDisplayCtrl, _htmlTextareaCtrl,
			_flexDirCtrl, _flexGrowCtrl, _gapCtrl, _styleTextareaCtrl,
			_mainTitleDisplay, _mainStatusDisplay, _mainPageTemplateDisplay,
			_hooksTextareaCtrl,
		];
		fieldControls.forEach( ( ctrl ) => {
			if ( ! ctrl ) { return; }
			ctrl.addEventListener( 'input',  onFieldChange );
			ctrl.addEventListener( 'change', onFieldChange );
		} );

		// CodeMirror fires its own change event (not a DOM input event).
		if ( _styleEditor ) {
			_styleEditor.codemirror.on( 'change', () => {
				if ( _styleEditorSuppressChange ) { return; }
				markDirty();
				applyLivePreview();
			} );
		}
		if ( _hooksEditor ) {
			_hooksEditor.codemirror.on( 'change', () => {
				markDirty();
			} );
		}
	}

	// -----------------------------------------------------------------------
	// Fetch element
	// -----------------------------------------------------------------------

	function fetchElement( postId, elementId ) {
		const form = new window.FormData();
		form.append( 'action',     'wp_builder_get_element' );
		form.append( 'nonce',      config.getNonce );
		form.append( 'post_id',    postId );
		form.append( 'element_id', elementId );

		window.fetch( config.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: form } )
			.then( ( r ) => r.json() )
			.then( ( payload ) => {
				if ( ! payload || ! payload.success ) {
					throw new Error( payload && payload.data && payload.data.message
						? payload.data.message : ( text.error || 'Error' ) );
				}
				const data = payload.data;
				// On the very first open the panel doesn't exist yet — build it
				// from the schema returned by the server, then position and show it.
				if ( ! _panel ) {
					createPanel( data.fields || [] );
					initStyleEditor();
					initHooksEditor();
					initChangeListeners();
					positionAndShowPanel();
				}
				_saveBtn.disabled = false;
				setStatus( '', false );
				if ( data.layout ) { _cachedLayout = data.layout; }
				populatePanel( data.element, data.post_title || '', data.post_status || '', data.page_template || '', data.hooks !== undefined ? data.hooks : '' );
				// If in structure mode, keep the tree in sync with the fetched layout.
				if ( _isStructureMode && data.layout ) {
					renderStructureTree( data.layout, _liveRoot );
				}
			} )
			.catch( ( err ) => {
				setStatus( err.message || ( text.error || 'Error' ), true );
			} );
	}

	// -----------------------------------------------------------------------
	// Populate panel fields from element data
	// -----------------------------------------------------------------------

	function populatePanel( element, postTitle, postStatus, pageTemplate, hooksValue ) {
		const node   = normalizeNodeTag( element.node );
		const isVoid = !! VOID_NODES[ node ];
		const props  = element.props || {};

		_nodeChip.textContent = node.toUpperCase();
		_idChip.textContent   = element.id || '';

		_nodeSelectCtrl.value = node;
		_idDisplayCtrl.value  = element.id || '';

		_contentSection.hidden  = isVoid;
		_htmlTextareaCtrl.value = isVoid ? '' : ( element.content || '' );

		_flexDirCtrl.value  = props.flexDirection || '';
		_flexGrowCtrl.value = props.flexGrow || '';
		_gapCtrl.value      = props.gap || '';

		_styleTextareaCtrl.value = element.style || '';
		if ( _styleEditor ) {
			_styleEditorSuppressChange = true;
			_styleEditor.codemirror.setValue( element.style || '' );
			_styleEditorSuppressChange = false;
		}

		// Render node-specific attribute fields via the shared helper.
		renderNodeAttrs(
			_attrsSection.querySelector( '.wpbe-accordion-body-inner' ),
			node,
			element.attrs || {},
			( name, value ) => {
				const ctrl = _attrsSection.querySelector( '[data-attr-name="' + name + '"]' );
				if ( ctrl ) { ctrl.value = value; }
			},
			CSS
		);
		// Add data-attr-name to each rendered control for collection on save.
		_attrsSection.querySelectorAll( '[id^="wp-builder-node-attr-"]' ).forEach( ( ctrl ) => {
			const attrName = ctrl.id.replace( 'wp-builder-node-attr-', '' );
			ctrl.dataset.attrName = attrName;
		} );
		_attrsSection.hidden = ! _attrsSection.querySelector( '.wpbe-accordion-body-inner' ).childElementCount;

		// Populate the Main tab's post-level fields when values are provided.
		if ( postTitle !== undefined && _mainTitleDisplay )  { _mainTitleDisplay.value  = postTitle; }
		if ( postStatus !== undefined && _mainStatusDisplay ) { _mainStatusDisplay.value = postStatus; }
		if ( pageTemplate !== undefined && _mainPageTemplateDisplay ) { _mainPageTemplateDisplay.value = pageTemplate; }
		if ( hooksValue !== undefined && _hooksTextareaCtrl ) {
			if ( _hooksEditor ) {
				_hooksEditor.codemirror.setValue( hooksValue );
			} else {
				_hooksTextareaCtrl.value = hooksValue;
			}
		}

		// Keep structure-tree selection highlight in sync.
		if ( _isStructureMode ) {
			syncStructureSelection( element.id || '' );
		}

		// Loading fresh data from the server — no pending unsaved changes.
		markClean();
	}

	// -----------------------------------------------------------------------
	// Save element
	// -----------------------------------------------------------------------

	function saveElement() {
		if ( ! _postId || ! _elementId ) { return; }

		_saveBtn.disabled = true;
		setStatus( text.saving || 'Saving\u2026', false );

		const attrsObj = {};
		_attrsSection.querySelectorAll( '[data-attr-name]' ).forEach( ( ctrl ) => {
			if ( ctrl.dataset.attrName && ctrl.value ) {
				attrsObj[ ctrl.dataset.attrName ] = ctrl.value;
			}
		} );

		const form = new window.FormData();
		form.append( 'action',     'wp_builder_save_element' );
		form.append( 'nonce',      config.saveNonce );
		form.append( 'post_id',    _postId );
		form.append( 'element_id', _elementId );
		form.append( 'new_element_id', _idDisplayCtrl.value );
		form.append( 'title',         _mainTitleDisplay  ? _mainTitleDisplay.value  : '' );
		form.append( 'post_status',   _mainStatusDisplay ? _mainStatusDisplay.value : '' );
		form.append( 'page_template', _mainPageTemplateDisplay ? _mainPageTemplateDisplay.value : '' );
		if ( _hooksTextareaCtrl ) {
			const hooksVal = _hooksEditor ? _hooksEditor.codemirror.getValue() : _hooksTextareaCtrl.value;
			form.append( 'hooks', hooksVal );
		}
		form.append( 'node',       _nodeSelectCtrl.value );
		form.append( 'props',      JSON.stringify( {
			flexDirection: _flexDirCtrl.value,
			flexGrow:      _flexGrowCtrl.value,
			gap:           _gapCtrl.value
		} ) );
		form.append( 'style',   _styleEditor ? _styleEditor.codemirror.getValue() : _styleTextareaCtrl.value );
		form.append( 'content', _htmlTextareaCtrl.value );
		form.append( 'attrs',   JSON.stringify( attrsObj ) );

		window.fetch( config.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: form } )
			.then( ( r ) => r.json() )
			.then( ( payload ) => {
				if ( ! payload || ! payload.success ) {
					throw new Error( payload && payload.data && payload.data.message
						? payload.data.message : ( text.error || 'Save failed' ) );
				}

				if ( payload.data.html && _liveRoot && _liveRoot.parentNode ) {
					if ( _isStructureMode ) {
						// In structure mode do not swap the DOM — just keep the snapshot updated.
						_savedRenderedOuterHtml = payload.data.html;
					} else {
						const tpl = document.createElement( 'template' );
						tpl.innerHTML = payload.data.html.trim();
						const prevEl = _liveRoot.previousElementSibling;
						if ( prevEl && prevEl.tagName === 'STYLE' ) { prevEl.remove(); }
						_liveRoot.parentNode.insertBefore( tpl.content, _liveRoot );
						_liveRoot.remove();
						const newRoot = document.querySelector( '[data-wp-builder-post-id="' + _postId + '"]' );
						if ( newRoot ) { _liveRoot = newRoot; }
					}
				}

				if ( payload.data.element ) { populatePanel( payload.data.element ); }
				if ( payload.data.element && payload.data.element.id ) {
					_elementId = payload.data.element.id;
				}
				if ( payload.data.layout ) { _cachedLayout = payload.data.layout; }
				if ( payload.data.post_title  !== undefined && _mainTitleDisplay )  { _mainTitleDisplay.value  = payload.data.post_title; }
				if ( payload.data.post_status !== undefined && _mainStatusDisplay ) { _mainStatusDisplay.value = payload.data.post_status; }
				if ( payload.data.page_template !== undefined && _mainPageTemplateDisplay ) { _mainPageTemplateDisplay.value = payload.data.page_template; }
				if ( payload.data.hooks !== undefined && _hooksTextareaCtrl ) {
					if ( _hooksEditor ) {
						_hooksEditor.codemirror.setValue( payload.data.hooks );
					} else {
						_hooksTextareaCtrl.value = payload.data.hooks;
					}
				}
				setStatus( text.saved || 'Saved', false );
				markClean();

				// When in structure mode: update the saved snapshot and re-render the tree.
				if ( _isStructureMode && payload.data.html ) {
					_savedRenderedOuterHtml = payload.data.html;
					if ( payload.data.layout ) {
						renderStructureTree( payload.data.layout, _liveRoot );
					}
				}
			} )
			.catch( ( err ) => {
				setStatus( err.message || ( text.error || 'Save failed' ), true );
			} )
			.finally( () => {
				_saveBtn.disabled = false;
			} );
	}

	// -----------------------------------------------------------------------
	// Reset builder (clears layout data and page template, redirects to edit)
	// -----------------------------------------------------------------------

	function resetBuilder() {
		if ( ! _postId ) { return; }
		const confirmMsg = text.resetBuilderConfirm ||
			'This will permanently clear all builder data and reset the page template to default. This action cannot be undone. Continue?';
		if ( ! window.confirm( confirmMsg ) ) { return; }

		setStatus( text.resetting || 'Resetting\u2026', false );

		const form = new window.FormData();
		form.append( 'action',  'wp_builder_reset' );
		form.append( 'nonce',   config.resetNonce );
		form.append( 'post_id', _postId );

		window.fetch( config.ajaxUrl, { method: 'POST', body: form } )
			.then( ( r ) => r.json() )
			.then( ( payload ) => {
				if ( ! payload || ! payload.success ) {
					throw new Error( payload && payload.data && payload.data.message
						? payload.data.message : ( text.error || 'Error' ) );
				}
				window.location.href = payload.data.editUrl;
			} )
			.catch( ( err ) => {
				setStatus( err.message || ( text.error || 'Error' ), true );
			} );
	}

	// -----------------------------------------------------------------------
	// Click delegation — intercept clicks on builder elements
	// -----------------------------------------------------------------------

	function init() {
		document.body.addEventListener( 'click', ( event ) => {
			if ( event.target.closest( 'a[href], button, input, select, textarea' ) ) { return; }
			const target = event.target.closest( '[data-wp-builder-id]' );
			if ( ! target ) { return; }
			const rootEl = target.closest( '[data-wp-builder-post-id]' );
			if ( ! rootEl ) { return; }
			event.preventDefault();
			openPanel(
				rootEl.getAttribute( 'data-wp-builder-post-id' ),
				target.getAttribute( 'data-wp-builder-id' ),
				rootEl
			);
		} );

		if ( config.isBuilderMode ) {
			autoOpenForTemplate();
		}
	}

	function autoOpenForTemplate() {
		const rootEl = document.querySelector( '[data-wp-builder-post-id]' );
		if ( ! rootEl ) { return; }
		// rootEl itself carries data-wp-builder-id (both attributes are emitted on
		// the same DOM node by render_element()). querySelector() does not match
		// the element it is called on, so we check rootEl first, then fall back
		// to the first descendant that has the attribute.
		const firstEl = rootEl.hasAttribute( 'data-wp-builder-id' )
			? rootEl
			: rootEl.querySelector( '[data-wp-builder-id]' );
		if ( ! firstEl ) { return; }
		openPanel(
			rootEl.getAttribute( 'data-wp-builder-post-id' ),
			firstEl.getAttribute( 'data-wp-builder-id' ),
			rootEl
		);
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}

} )();
