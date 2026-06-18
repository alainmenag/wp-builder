/**
 * WP Builder — Front-end Element Quick-Editor
 *
 * When a logged-in editor clicks any [data-wp-builder-id] element on the
 * front end, a slide-out panel appears on the right with that element's
 * settings (Identity, Content, Layout, Style, Attributes). Changes are
 * saved directly via AJAX without opening the full Builder editor.
 *
 * Loaded as a native ES module so it can share NODE_GLOSSARY, VOID_NODES,
 * and ALLOWED_NODES from constants.js rather than duplicating them.
 */

import { NODE_GLOSSARY, VOID_NODES, ALLOWED_NODES } from './constants.js';

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
	let _nodeChip        = null;
	let _idChip          = null;
	let _editLink        = null;
	let _statusMsg       = null;
	let _saveBtn         = null;
	let _nodeSelectCtrl  = null;
	let _idDisplayCtrl   = null;
	let _htmlTextareaCtrl = null;
	let _contentSection  = null;
	let _flexDirCtrl     = null;
	let _flexGrowCtrl    = null;
	let _gapCtrl         = null;
	let _styleTextareaCtrl = null;
	let _attrsSection    = null;

	// -----------------------------------------------------------------------
	// Panel construction
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
		_panel.setAttribute( 'aria-label', 'Element settings' );

		// ---- Header --------------------------------------------------------
		const header = document.createElement( 'div' );
		header.className = 'wpbfe-panel-header';

		const headerLeft = document.createElement( 'div' );
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

		// ---- Body (accordion sections) -------------------------------------
		const body = document.createElement( 'div' );
		body.className = 'wpbfe-panel-body';

		// Identity
		const identityAccordion = createAccordion( text.identity || 'Identity', false );
		const identityInner     = identityAccordion.querySelector( '.wpbfe-accordion-body-inner' );

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

		body.appendChild( identityAccordion );

		// Content
		_contentSection          = createAccordion( text.content || 'Content', true );
		const contentInner       = _contentSection.querySelector( '.wpbfe-accordion-body-inner' );

		const htmlField = createFieldGroup( text.htmlContent || 'HTML Content', () => {
			const ta = document.createElement( 'textarea' );
			ta.className = 'wpbfe-textarea';
			ta.rows      = 8;
			return ta;
		} );
		_htmlTextareaCtrl = htmlField.control;
		contentInner.appendChild( htmlField.group );

		body.appendChild( _contentSection );

		// Layout
		const layoutAccordion = createAccordion( text.layout || 'Layout', false );
		const layoutInner     = layoutAccordion.querySelector( '.wpbfe-accordion-body-inner' );

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
			inp.className = 'wpbfe-input';
			inp.type      = 'number';
			inp.min       = '0';
			inp.step      = '1';
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

		body.appendChild( layoutAccordion );

		// Style
		const styleAccordion = createAccordion( text.style || 'Style', false );
		const styleInner     = styleAccordion.querySelector( '.wpbfe-accordion-body-inner' );

		const styleField = createFieldGroup( text.customStyle || 'Custom CSS', () => {
			const ta = document.createElement( 'textarea' );
			ta.className   = 'wpbfe-textarea wpbfe-textarea--code';
			ta.rows        = 6;
			ta.placeholder = 'self { color: red; }';
			return ta;
		} );
		_styleTextareaCtrl = styleField.control;
		styleInner.appendChild( styleField.group );

		body.appendChild( styleAccordion );

		// Attributes (populated dynamically per node type)
		_attrsSection = createAccordion( text.attributes || 'Attributes', false );
		_attrsSection.hidden = true;
		body.appendChild( _attrsSection );

		_panel.appendChild( body );

		// ---- Footer --------------------------------------------------------
		const footer = document.createElement( 'div' );
		footer.className = 'wpbfe-panel-footer';

		_saveBtn = document.createElement( 'button' );
		_saveBtn.type      = 'button';
		_saveBtn.className = 'wpbfe-save-btn';
		_saveBtn.textContent = text.save || 'Save';
		_saveBtn.addEventListener( 'click', saveElement );

		_statusMsg = document.createElement( 'span' );
		_statusMsg.className = 'wpbfe-status';

		footer.appendChild( _saveBtn );
		footer.appendChild( _statusMsg );
		_panel.appendChild( footer );

		document.body.appendChild( _panel );

		// Wire accordion toggle buttons
		_panel.querySelectorAll( '.wpbfe-accordion-header' ).forEach( ( btn ) => {
			btn.addEventListener( 'click', () => {
				btn.closest( '.wpbfe-accordion' ).classList.toggle( 'is-open' );
			} );
		} );
	}

	/**
	 * Create an accordion section with a header button and a body div.
	 *
	 * @param {string}  label  Section title.
	 * @param {boolean} isOpen Whether to start open.
	 * @return {HTMLElement}
	 */
	function createAccordion( label, isOpen ) {
		const section = document.createElement( 'div' );
		section.className = 'wpbfe-accordion' + ( isOpen ? ' is-open' : '' );

		const btn = document.createElement( 'button' );
		btn.type      = 'button';
		btn.className = 'wpbfe-accordion-header';

		const labelSpan = document.createElement( 'span' );
		labelSpan.textContent = label.toUpperCase();

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

	/**
	 * Create a labelled field group.
	 *
	 * @param {string}   labelText      Field label.
	 * @param {Function} controlFactory Returns the control element.
	 * @return {{ group: HTMLElement, control: HTMLElement }}
	 */
	function createFieldGroup( labelText, controlFactory ) {
		const group   = document.createElement( 'div' );
		group.className = 'wpbfe-field-group';

		const control = controlFactory();

		const lbl = document.createElement( 'label' );
		lbl.className   = 'wpbfe-label';
		lbl.textContent = labelText;
		if ( control.id ) { lbl.htmlFor = control.id; }

		group.appendChild( lbl );
		group.appendChild( control );

		return { group, control };
	}

	// -----------------------------------------------------------------------
	// Panel open / close
	// -----------------------------------------------------------------------

	/**
	 * @param {string}      postId    WordPress post ID (string from data attribute).
	 * @param {string}      elementId Builder element ID.
	 * @param {HTMLElement} liveRoot  The live DOM element carrying data-wp-builder-post-id.
	 */
	function openPanel( postId, elementId, liveRoot ) {
		_postId    = postId;
		_elementId = elementId;
		_liveRoot  = liveRoot;

		if ( ! _panel ) { createPanel(); }

		_editLink.href = config.builderBaseUrl + '?post=' + encodeURIComponent( postId ) + '&action=builder';

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
		const node   = element.node || 'div';
		const isVoid = !! VOID_NODES[ node ];
		const props  = element.props || {};
		const attrs  = element.attrs || {};

		// Header chips
		_nodeChip.textContent = node.toUpperCase();
		_idChip.textContent   = element.id || '';

		// Identity section
		_nodeSelectCtrl.value = node;
		_idDisplayCtrl.value  = element.id || '';

		// Content section — hidden for void (self-closing) nodes
		_contentSection.hidden = isVoid;
		_htmlTextareaCtrl.value = isVoid ? '' : ( element.content || '' );

		// Layout section
		_flexDirCtrl.value  = props.flexDirection || '';
		_flexGrowCtrl.value = props.flexGrow || '';
		_gapCtrl.value      = props.gap || '';

		// Style section
		_styleTextareaCtrl.value = element.style || '';

		// Attributes section (node-specific)
		renderAttrsSection( node, attrs );
	}

	// -----------------------------------------------------------------------
	// Attributes section
	// -----------------------------------------------------------------------

	function renderAttrsSection( node, attrs ) {
		const descriptors = NODE_GLOSSARY[ node ] || [];
		const inner = _attrsSection.querySelector( '.wpbfe-accordion-body-inner' );
		inner.innerHTML = '';

		if ( ! descriptors.length ) {
			_attrsSection.hidden = true;
			return;
		}

		_attrsSection.hidden = false;

		for ( const desc of descriptors ) {
			const fg = createFieldGroup( desc.label + ( desc.required ? ' *' : '' ), () => {
				let ctrl;
				if ( desc.type === 'select' ) {
					ctrl = document.createElement( 'select' );
					ctrl.className = 'wpbfe-select';
					for ( const opt of ( desc.options || [] ) ) {
						const o = document.createElement( 'option' );
						o.value = opt;
						o.textContent = opt || '\u2014 None \u2014';
						ctrl.appendChild( o );
					}
				} else {
					ctrl = document.createElement( 'input' );
					ctrl.className = 'wpbfe-input';
					ctrl.type = desc.type === 'number' ? 'number' : ( desc.type === 'url' ? 'url' : 'text' );
					if ( desc.placeholder ) { ctrl.placeholder = desc.placeholder; }
				}
				ctrl.dataset.attrName = desc.name;
				ctrl.value = attrs[ desc.name ] || '';
				return ctrl;
			} );
			inner.appendChild( fg.group );
		}
	}

	// -----------------------------------------------------------------------
	// Save element
	// -----------------------------------------------------------------------

	function saveElement() {
		if ( ! _postId || ! _elementId ) { return; }

		_saveBtn.disabled = true;
		setStatus( text.saving || 'Saving\u2026', false );

		// Collect dynamic attribute values
		const attrsObj = {};
		if ( _attrsSection && ! _attrsSection.hidden ) {
			_attrsSection.querySelectorAll( '[data-attr-name]' ).forEach( ( ctrl ) => {
				const name = ctrl.dataset.attrName;
				if ( name && ctrl.value ) { attrsObj[ name ] = ctrl.value; }
			} );
		}

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

				// Swap the live root element with the fresh server-rendered HTML.
				// The response HTML is the entire re-rendered layout root (including
				// any preceding <style> block for the root element's own style).
				if ( payload.data.html && _liveRoot && _liveRoot.parentNode ) {
					const tpl = document.createElement( 'template' );
					tpl.innerHTML = payload.data.html.trim();

					// Remove the old preceding style tag for the root element, if present.
					const prevEl = _liveRoot.previousElementSibling;
					if ( prevEl && prevEl.tagName === 'STYLE' ) {
						prevEl.remove();
					}

					// Insert all nodes from the fragment before _liveRoot, then remove it.
					const frag = tpl.content;
					_liveRoot.parentNode.insertBefore( frag, _liveRoot );
					_liveRoot.remove();

					// Re-anchor _liveRoot to the new element so subsequent saves work.
					const newRoot = document.querySelector( '[data-wp-builder-post-id="' + _postId + '"]' );
					if ( newRoot ) { _liveRoot = newRoot; }
				}

				// Refresh the panel fields with the sanitized element data.
				if ( payload.data.element ) {
					populatePanel( payload.data.element );
				}

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
			// Let natural browser behaviour handle interactive elements.
			if ( event.target.closest( 'a[href], button, input, select, textarea' ) ) { return; }

			const target = event.target.closest( '[data-wp-builder-id]' );
			if ( ! target ) { return; }

			// Walk up to find the root element that carries data-wp-builder-post-id.
			const rootEl = target.closest( '[data-wp-builder-post-id]' );
			if ( ! rootEl ) { return; }

			const postId    = rootEl.getAttribute( 'data-wp-builder-post-id' );
			const elementId = target.getAttribute( 'data-wp-builder-id' );

			event.preventDefault();

			openPanel( postId, elementId, rootEl );
		} );
	}

	// Run after DOM is available (module scripts are deferred, but guard anyway).
	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}

} )();
