/**
 * WP Builder — Front-end Element Quick-Editor
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

import { VOID_NODES, ALLOWED_NODES, TEMPLATE_CPT } from './constants.js';
import { normalizeNodeTag } from './layout.js';
import { renderNodeAttrs } from './dom-helpers.js';
import { ICON_FIT, ICON_ELEMENT, ICON_POST, ICON_ISOLATE } from './constants.js';

( () => {
	'use strict';

	const config = window.wpBuilderFrontendEditor;
	if ( ! config ) { return; }

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
	/** @type {HTMLInputElement|null} Readonly post title display in Main tab. */
	let _mainTitleDisplay  = null;
	/** @type {HTMLInputElement|null} Readonly post status display in Main tab. */
	let _mainStatusDisplay = null;
	/** @type {HTMLButtonElement[]} The two tab toggle buttons. */
	let _tabBtns           = [];

	// CodeMirror wrapper instance (null when wp.codeEditor is unavailable).
	let _styleEditor              = null;
	// True while setValue() is being called programmatically to suppress onChange.
	let _styleEditorSuppressChange = false;

	// CSS class names used by this panel (wpbfe- prefix to avoid conflicts
	// with the admin editor stylesheet loaded inside the builder iframe).
	const CSS = {
		select:     'wpbfe-select',
		input:      'wpbfe-input',
		fieldGroup: 'wpbfe-field-group',
		label:      'wpbfe-label',
	};

	// -----------------------------------------------------------------------
	// Accordion / field-group helpers (private — panel DOM only)
	// -----------------------------------------------------------------------

	function createAccordion( labelText, startOpen ) {
		const section = document.createElement( 'div' );
		section.className = 'wpbfe-accordion' + ( startOpen ? ' is-open' : '' );

		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'wpbfe-accordion-header';
		btn.setAttribute( 'aria-expanded', startOpen ? 'true' : 'false' );
		btn.addEventListener( 'click', () => {
			const isOpen = section.classList.contains( 'is-open' );
			// Collapse all other open accordions in the panel (one-at-a-time).
			if ( _panel && ! isOpen ) {
				_panel.querySelectorAll( '.wpbfe-accordion.is-open' ).forEach( ( other ) => {
					if ( other === section ) { return; }
					other.classList.remove( 'is-open' );
					const otherBtn = other.querySelector( '.wpbfe-accordion-header' );
					if ( otherBtn ) { otherBtn.setAttribute( 'aria-expanded', 'false' ); }
				} );
			}
			section.classList.toggle( 'is-open', ! isOpen );
			btn.setAttribute( 'aria-expanded', ( ! isOpen ).toString() );
		} );

		const labelSpan = document.createElement( 'span' );
		labelSpan.textContent = labelText;

		const chevron = document.createElement( 'span' );
		chevron.className = 'wpbfe-accordion-chevron';
		chevron.setAttribute( 'aria-hidden', 'true' );

		btn.appendChild( labelSpan );
		btn.appendChild( chevron );
		section.appendChild( btn );

		const body = document.createElement( 'div' );
		body.className = 'wpbfe-accordion-body';
		const inner = document.createElement( 'div' );
		inner.className = 'wpbfe-accordion-body-inner';
		body.appendChild( inner );
		section.appendChild( body );

		return section;
	}

	function createFieldGroup( labelText, controlFactory ) {
		const group   = document.createElement( 'div' );
		group.className = 'wpbfe-field-group';
		const control = controlFactory();
		const lbl     = document.createElement( 'label' );
		lbl.className   = 'wpbfe-label';
		lbl.textContent = labelText;
		if ( control.id ) { lbl.htmlFor = control.id; }
		group.appendChild( lbl );
		group.appendChild( control );
		return { group, control };
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

	function createPanel() {
		// Panel shell
		_panel = document.createElement( 'div' );
		_panel.className = 'wpbfe-panel';
		_panel.setAttribute( 'role', 'dialog' );
		_panel.setAttribute( 'aria-label', text.attributes || 'Element settings' );

		// Header
		const header      = document.createElement( 'div' );
		header.className  = 'wpbfe-panel-header';
		const headerLeft  = document.createElement( 'div' );
		headerLeft.className = 'wpbfe-panel-header-left';

		_nodeChip = document.createElement( 'span' );
		_nodeChip.className = 'wpbfe-chip wpbfe-chip--node';
		_nodeChip.style.cursor = 'pointer';
		_nodeChip.addEventListener( 'click', () => {
			scrollBuilderElementIntoView( _elementId );
		} );
		_idChip = document.createElement( 'span' );
		_idChip.className = 'wpbfe-chip wpbfe-chip--id';
		headerLeft.appendChild( _nodeChip );
		headerLeft.appendChild( _idChip );

		header.appendChild( headerLeft );

		if ( ! config.isTemplate ) {
			const closeBtn = document.createElement( 'button' );
			closeBtn.className = 'wpbfe-close-btn';
			closeBtn.type      = 'button';
			closeBtn.setAttribute( 'aria-label', text.close || 'Close' );
			closeBtn.innerHTML = '&#x2715;';
			closeBtn.addEventListener( 'click', closePanel );
			header.appendChild( closeBtn );
		}
		_panel.appendChild( header );

		// Body
		const body = document.createElement( 'div' );
		body.className = 'wpbfe-panel-body';

		// ── Main tab panel (post-level info, hidden by default) ────────────
		_mainTabPanel = document.createElement( 'div' );
		_mainTabPanel.className  = 'wpbfe-tab-panel';
		_mainTabPanel.dataset.tab = 'main';
		_mainTabPanel.hidden     = true;

		const mainInner = document.createElement( 'div' );
		mainInner.className = 'wpbfe-accordion-body-inner';

		const titleField = createFieldGroup( text.postTitle || 'Post Title', () => {
			const inp = document.createElement( 'input' );
			inp.className = 'wpbfe-input';
			inp.type      = 'text';
			inp.readOnly  = true;
			return inp;
		} );
		_mainTitleDisplay = titleField.control;
		mainInner.appendChild( titleField.group );

		const statusField = createFieldGroup( text.postStatus || 'Post Status', () => {
			const inp = document.createElement( 'input' );
			inp.className = 'wpbfe-input';
			inp.type      = 'text';
			inp.readOnly  = true;
			return inp;
		} );
		_mainStatusDisplay = statusField.control;
		mainInner.appendChild( statusField.group );

		_mainTabPanel.appendChild( mainInner );
		body.appendChild( _mainTabPanel );

		// ── Element tab panel (all element accordions) ─────────────────────
		_elementTabPanel = document.createElement( 'div' );
		_elementTabPanel.className  = 'wpbfe-tab-panel';
		_elementTabPanel.dataset.tab = 'element';

		// Identity section
		const identityAcc   = createAccordion( text.identity || 'Identity', false );
		const identityInner = identityAcc.querySelector( '.wpbfe-accordion-body-inner' );

		const nodeField = createFieldGroup( text.node || 'Node', () => {
			const sel = document.createElement( 'select' );
			sel.className = 'wpbfe-select';
			for ( const n of ALLOWED_NODES ) {
				const opt = document.createElement( 'option' );
				opt.value = n;
				opt.textContent = n;
				sel.appendChild( opt );
			}
			return sel;
		} );
		_nodeSelectCtrl = nodeField.control;
		identityInner.appendChild( nodeField.group );

		const idField = createFieldGroup( text.elementId || 'Element ID', () => {
			const inp = document.createElement( 'input' );
			inp.className = 'wpbfe-input';
			inp.type      = 'text';
			inp.readOnly  = true;
			return inp;
		} );
		_idDisplayCtrl = idField.control;
		identityInner.appendChild( idField.group );
		_elementTabPanel.appendChild( identityAcc );

		// Content section
		_contentSection        = createAccordion( text.content || 'Content', true );
		const contentInner     = _contentSection.querySelector( '.wpbfe-accordion-body-inner' );
		const htmlField        = createFieldGroup( text.htmlContent || 'HTML Content', () => {
			const ta = document.createElement( 'textarea' );
			ta.className = 'wpbfe-textarea';
			ta.rows      = 8;
			return ta;
		} );
		_htmlTextareaCtrl = htmlField.control;
		contentInner.appendChild( htmlField.group );
		_elementTabPanel.appendChild( _contentSection );

		// Layout section
		const layoutAcc   = createAccordion( text.layout || 'Layout', false );
		const layoutInner = layoutAcc.querySelector( '.wpbfe-accordion-body-inner' );

		const flexDirField = createFieldGroup( text.flexDirection || 'Flex Direction', () => {
			const sel = document.createElement( 'select' );
			sel.className = 'wpbfe-select';
			for ( const [ val, lbl ] of [ [ '', '\u2014 None \u2014' ], [ 'row', 'Row' ], [ 'column', 'Column' ] ] ) {
				const opt = document.createElement( 'option' );
				opt.value = val;
				opt.textContent = lbl;
				sel.appendChild( opt );
			}
			return sel;
		} );
		_flexDirCtrl = flexDirField.control;
		layoutInner.appendChild( flexDirField.group );

		const flexGrowField = createFieldGroup( text.flexGrow || 'Flex Grow', () => {
			const inp = document.createElement( 'input' );
			inp.className   = 'wpbfe-input';
			inp.type        = 'number';
			inp.min         = '0';
			inp.step        = '1';
			inp.placeholder = '0';
			return inp;
		} );
		_flexGrowCtrl = flexGrowField.control;
		layoutInner.appendChild( flexGrowField.group );

		const gapField = createFieldGroup( text.gap || 'Gap', () => {
			const inp = document.createElement( 'input' );
			inp.className   = 'wpbfe-input';
			inp.type        = 'text';
			inp.placeholder = 'e.g. 16px';
			return inp;
		} );
		_gapCtrl = gapField.control;
		layoutInner.appendChild( gapField.group );
		_elementTabPanel.appendChild( layoutAcc );

		// Style section
		const styleAcc   = createAccordion( text.style || 'Style', false );
		const styleInner = styleAcc.querySelector( '.wpbfe-accordion-body-inner' );
		const STYLE_PLACEHOLDER = "self {\n  background-color: red;\n}";
		const styleField = createFieldGroup( text.customStyle || 'Custom CSS', () => {
			const ta = document.createElement( 'textarea' );
			ta.className   = 'wpbfe-textarea';
			ta.rows        = 6;
			ta.placeholder = STYLE_PLACEHOLDER;
			return ta;
		} );
		_styleTextareaCtrl = styleField.control;
		// Insert the hint paragraph between the label and the textarea.
		if ( text.customStyleHint ) {
			const hint = document.createElement( 'p' );
			hint.className = 'wpbfe-inspector-hint';
			hint.innerHTML = text.customStyleHint;
			styleField.group.insertBefore( hint, _styleTextareaCtrl );
		}
		styleInner.appendChild( styleField.group );
		_elementTabPanel.appendChild( styleAcc );

		// Refresh CodeMirror when the style accordion opens so it renders
		// correctly after being initialised inside a hidden container.
		// Mirrors the equivalent fix in navigation.js for the full editor.
		const styleAccBtn = styleAcc.querySelector( '.wpbfe-accordion-header' );
		styleAccBtn.addEventListener( 'click', () => {
			if ( _styleEditor && styleAcc.classList.contains( 'is-open' ) ) {
				_styleEditor.codemirror.refresh();
			}
		} );

		// Attributes section — rendered dynamically in populatePanel
		_attrsSection = createAccordion( text.attributes || 'Attributes', false );
		_elementTabPanel.appendChild( _attrsSection );

		body.appendChild( _elementTabPanel );

		_panel.appendChild( body );

		// Footer
		const footer = document.createElement( 'div' );
		footer.className = 'wpbfe-panel-footer';

		// Tab switcher buttons — left side of footer.
		const tabBtnsGroup = document.createElement( 'div' );
		tabBtnsGroup.className = 'wpbfe-tab-btns';

		const tabMainBtn = document.createElement( 'button' );
		tabMainBtn.type          = 'button';
		tabMainBtn.className     = 'wpbfe-tab-btn wpbfe-panel-footer-link';
		tabMainBtn.dataset.tab   = 'main';
		tabMainBtn.innerHTML = ICON_ELEMENT;
		tabMainBtn.style.fill = '#ffffff';
		tabMainBtn.addEventListener( 'click', () => switchTab( 'main' ) );

		const tabElementBtn = document.createElement( 'button' );
		tabElementBtn.type        = 'button';
		tabElementBtn.className   = 'wpbfe-tab-btn wpbfe-panel-footer-link is-active';
		tabElementBtn.dataset.tab = 'element';
		tabElementBtn.innerHTML = ICON_POST;
		tabElementBtn.style.fill = '#ffffff';
		tabElementBtn.addEventListener( 'click', () => switchTab( 'element' ) );

		tabBtnsGroup.appendChild( tabMainBtn );
		tabBtnsGroup.appendChild( tabElementBtn );
		_tabBtns = [ tabMainBtn, tabElementBtn ];
		footer.appendChild( tabBtnsGroup );

		// Action buttons — right side of footer.
		const footerActions = document.createElement( 'div' );
		footerActions.className = 'wpbfe-footer-actions';

		_editLink = document.createElement( 'a' );
		_editLink.className = 'wpbfe-edit-link wpbfe-panel-footer-link';
		_editLink.target    = '_blank';
		_editLink.rel       = 'noopener noreferrer';
		_editLink.setAttribute( 'aria-label', text.editInBuilder || 'Edit in Builder' );
		_editLink.innerHTML = ICON_ISOLATE;
		_editLink.style.fill = '#ffffff';

		_fitBtn = document.createElement( 'button' );
		_fitBtn.type      = 'button';
		_fitBtn.className = 'wpbfe-fit-btn wpbfe-panel-footer-link';
		_fitBtn.setAttribute( 'aria-label', text.fitPage || 'Fit Page' );
		_fitBtn.setAttribute( 'title', text.fitPage || 'Fit Page' );
		_fitBtn.disabled  = ! _isDocked;
		// Scale / fit icon — two arrows pointing inward horizontally.
		_fitBtn.innerHTML = ICON_FIT;
		_fitBtn.addEventListener( 'click', togglePageZoom );

		_saveBtn = document.createElement( 'button' );
		_saveBtn.type      = 'button';
		_saveBtn.className = 'wpbfe-save-btn';

		_statusMsg = document.createElement( 'span' );
		_statusMsg.className = 'wpbfe-save-status';
		_statusMsg.setAttribute( 'role', 'status' );
		_statusMsg.setAttribute( 'aria-live', 'polite' );

		const saveLbl = document.createElement( 'span' );
		saveLbl.textContent = text.save || 'Save';

		_saveBtn.appendChild( _statusMsg );
		_saveBtn.appendChild( saveLbl );
		_saveBtn.addEventListener( 'click', saveElement );

		footerActions.appendChild( _editLink );
		footerActions.appendChild( _fitBtn );
		footerActions.appendChild( _saveBtn );
		footer.appendChild( footerActions );

		// Left-edge resize handle (used when docked right).
		const resizeHandle = document.createElement( 'div' );
		resizeHandle.className = 'wpbfe-resize-handle-left';

		// Right-edge resize handle (used when docked left).
		const resizeHandleRight = document.createElement( 'div' );
		resizeHandleRight.className = 'wpbfe-resize-handle-right';

		_panel.appendChild( footer );
		_panel.appendChild( resizeHandle );
		_panel.appendChild( resizeHandleRight );
		document.body.appendChild( _panel );
		initDrag();
		initResize();
		initStyleEditor();
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
		const header = _panel.querySelector( '.wpbfe-panel-header' );
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
		const handleLeft  = _panel.querySelector( '.wpbfe-resize-handle-left' );
		const handleRight = _panel.querySelector( '.wpbfe-resize-handle-right' );

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
		document.body.classList.add( 'wpbfe-page-zoomed' );
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
		document.body.classList.remove( 'wpbfe-page-zoomed' );
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
			const zoomAlreadyApplied = document.body.classList.contains( 'wpbfe-page-zoomed' );
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

	function openPanel( postId, elementId, liveRoot ) {
		_postId    = postId;
		_elementId = elementId;
		_liveRoot  = liveRoot;

		if ( ! _panel ) { createPanel(); }

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

		_editLink.href    = `/?post_type=${TEMPLATE_CPT}&p=${encodeURIComponent( postId )}`;
		_saveBtn.disabled = true;
		setStatus( text.loading || 'Loading\u2026', false );

		_panel.classList.add( 'is-open' );

		// Restore persisted zoom (only valid when docked).
		if ( _isDocked && _isPageZoomed ) {
			// Compensate scroll only when zoom is transitioning OFF→ON.
			// If zoom is already visually applied (e.g. switching between elements
			// while the panel stays open), the scroll position is already correct.
			const zoomAlreadyApplied = document.body.classList.contains( 'wpbfe-page-zoomed' );
			applyPageZoom( ! zoomAlreadyApplied );
		}

		fetchElement( postId, elementId );
	}

	function closePanel() {
		if ( ! _panel ) { return; }
		_panel.classList.remove( 'is-open' );
		if ( _isPageZoomed ) {
			removePageZoom();
		}
		_postId    = null;
		_elementId = null;
		_liveRoot  = null;
	}

	function setStatus( msg, isError ) {
		if ( ! _statusMsg ) { return; }
		_statusMsg.textContent = msg;
		if ( _saveBtn ) {
			_saveBtn.classList.toggle( 'is-error', !! isError );
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
				populatePanel( payload.data.element, payload.data.post_title || '', payload.data.post_status || '' );
				_saveBtn.disabled = false;
				setStatus( '', false );
			} )
			.catch( ( err ) => {
				setStatus( err.message || ( text.error || 'Error' ), true );
			} );
	}

	// -----------------------------------------------------------------------
	// Populate panel fields from element data
	// -----------------------------------------------------------------------

	function populatePanel( element, postTitle, postStatus ) {
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
			_attrsSection.querySelector( '.wpbfe-accordion-body-inner' ),
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
		_attrsSection.hidden = ! _attrsSection.querySelector( '.wpbfe-accordion-body-inner' ).childElementCount;

		// Populate the Main tab's post-level fields when values are provided.
		if ( postTitle !== undefined && _mainTitleDisplay )  { _mainTitleDisplay.value  = postTitle; }
		if ( postStatus !== undefined && _mainStatusDisplay ) { _mainStatusDisplay.value = postStatus; }
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
					const tpl = document.createElement( 'template' );
					tpl.innerHTML = payload.data.html.trim();
					const prevEl = _liveRoot.previousElementSibling;
					if ( prevEl && prevEl.tagName === 'STYLE' ) { prevEl.remove(); }
					_liveRoot.parentNode.insertBefore( tpl.content, _liveRoot );
					_liveRoot.remove();
					const newRoot = document.querySelector( '[data-wp-builder-post-id="' + _postId + '"]' );
					if ( newRoot ) { _liveRoot = newRoot; }
				}

				if ( payload.data.element ) { populatePanel( payload.data.element ); }
				setStatus( text.saved || 'Saved', false );
			} )
			.catch( ( err ) => {
				setStatus( err.message || ( text.error || 'Save failed' ), true );
			} )
			.finally( () => {
				_saveBtn.disabled = false;
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

		if ( config.isTemplate ) {
			autoOpenForTemplate();
		}
	}

	function autoOpenForTemplate() {
		const rootEl = document.querySelector( '[data-wp-builder-post-id]' );
		if ( ! rootEl ) { return; }
		const firstEl = rootEl.querySelector( '[data-wp-builder-id]' );
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
