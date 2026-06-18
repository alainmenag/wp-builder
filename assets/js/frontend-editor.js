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

import { VOID_NODES, ALLOWED_NODES } from './constants.js';
import { normalizeNodeTag } from './layout.js';
import { renderNodeAttrs } from './dom-helpers.js';

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
	/** @type {HTMLElement|null} */
	let _backdrop  = null;
	/** @type {string|null} */
	let _postId    = null;
	/** @type {string|null} */
	let _elementId = null;
	/** @type {HTMLElement|null} The live [data-wp-builder-post-id] root element. */
	let _liveRoot  = null;

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

	function createPanel() {
		// Backdrop
		_backdrop = document.createElement( 'div' );
		_backdrop.className = 'wpbfe-backdrop';
		_backdrop.addEventListener( 'click', closePanel );
		document.body.appendChild( _backdrop );

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
		_idChip = document.createElement( 'span' );
		_idChip.className = 'wpbfe-chip wpbfe-chip--id';
		headerLeft.appendChild( _nodeChip );
		headerLeft.appendChild( _idChip );

		_editLink = document.createElement( 'a' );
		_editLink.className = 'wpbfe-edit-link';
		_editLink.target    = '_blank';
		_editLink.rel       = 'noopener noreferrer';
		_editLink.textContent = text.editInBuilder || 'Edit in Builder';

		const closeBtn = document.createElement( 'button' );
		closeBtn.className = 'wpbfe-close-btn';
		closeBtn.type      = 'button';
		closeBtn.setAttribute( 'aria-label', text.close || 'Close' );
		closeBtn.innerHTML = '&#x2715;';
		closeBtn.addEventListener( 'click', closePanel );

		header.appendChild( headerLeft );
		header.appendChild( _editLink );
		header.appendChild( closeBtn );
		_panel.appendChild( header );

		// Body
		const body = document.createElement( 'div' );
		body.className = 'wpbfe-panel-body';

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
		body.appendChild( identityAcc );

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
		body.appendChild( _contentSection );

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
		body.appendChild( layoutAcc );

		// Style section
		const styleAcc   = createAccordion( text.style || 'Style', false );
		const styleInner = styleAcc.querySelector( '.wpbfe-accordion-body-inner' );
		const styleField = createFieldGroup( text.customStyle || 'Custom CSS', () => {
			const ta = document.createElement( 'textarea' );
			ta.className = 'wpbfe-textarea';
			ta.rows      = 6;
			return ta;
		} );
		_styleTextareaCtrl = styleField.control;
		styleInner.appendChild( styleField.group );
		body.appendChild( styleAcc );

		// Attributes section — rendered dynamically in populatePanel
		_attrsSection = createAccordion( text.attributes || 'Attributes', false );
		body.appendChild( _attrsSection );

		// Footer
		const footer = document.createElement( 'div' );
		footer.className = 'wpbfe-panel-footer';

		_statusMsg = document.createElement( 'span' );
		_statusMsg.className = 'wpbfe-status';

		_saveBtn = document.createElement( 'button' );
		_saveBtn.type      = 'button';
		_saveBtn.className = 'wpbfe-save-btn';
		_saveBtn.textContent = text.save || 'Save';
		_saveBtn.addEventListener( 'click', saveElement );

		footer.appendChild( _statusMsg );
		footer.appendChild( _saveBtn );

		_panel.appendChild( body );
		_panel.appendChild( footer );
		document.body.appendChild( _panel );
	}

	// -----------------------------------------------------------------------
	// Panel open / close
	// -----------------------------------------------------------------------

	function openPanel( postId, elementId, liveRoot ) {
		_postId    = postId;
		_elementId = elementId;
		_liveRoot  = liveRoot;

		if ( ! _panel ) { createPanel(); }

		_editLink.href    = config.builderBaseUrl + '?post=' + encodeURIComponent( postId ) + '&action=builder';
		_saveBtn.disabled = true;
		setStatus( text.loading || 'Loading\u2026', false );

		_panel.classList.add( 'is-open' );
		_backdrop.classList.add( 'is-visible' );

		fetchElement( postId, elementId );
	}

	function closePanel() {
		if ( ! _panel ) { return; }
		_panel.classList.remove( 'is-open' );
		_backdrop.classList.remove( 'is-visible' );
		_postId    = null;
		_elementId = null;
		_liveRoot  = null;
	}

	function setStatus( msg, isError ) {
		if ( ! _statusMsg ) { return; }
		_statusMsg.textContent = msg;
		_statusMsg.className   = 'wpbfe-status' + ( isError ? ' wpbfe-status--error' : '' );
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
				populatePanel( payload.data.element );
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

	function populatePanel( element ) {
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
		form.append( 'style',   _styleTextareaCtrl.value );
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
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}

} )();
