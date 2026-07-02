/**
 * WP Builder — Element Quick-Editor entry point (orchestrator).
 *
 * Imports all feature modules, wires cross-module callbacks onto the shared
 * state object to avoid circular imports, then initialises click delegation
 * and boots the editor when the DOM is ready.
 *
 * Loaded as a native ES module (type="module") — the browser resolves all
 * relative imports automatically; no bundler or build step is required.
 */

import { state } from './state.js';
import { loadPrefs } from './prefs.js';
import { VOID_NODES } from './constants.js';
import { normalizeNodeTag, findElement } from './layout.js';
import { renderNodeAttrs } from './dom-helpers.js';
import { markClean } from './live-preview.js';
import { exitStructureMode } from './structure-view.js';
import { removePageZoom } from './zoom.js';
import { positionAndShowPanel } from './dock.js';
import { fetchElement, saveElement, resetBuilder } from './ajax.js';

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

	// Populate shared config / i18n in state before any other module runs.
	state.config = config;
	state.text   = config.i18n || {};

	// Load persisted panel position / dock preferences.
	loadPrefs();

	// ── Wire cross-module callbacks onto state ────────────────────────────────
	// These slots break the circular-import chains between:
	//   panel-dom, structure-view, ajax  →  editor.js-owned functions
	state.cb_openPanel      = openPanel;
	state.cb_setStatus      = setStatus;
	state.cb_populatePanel  = populatePanel;
	state.cb_closePanel     = closePanel;
	state.cb_scrollIntoView = scrollBuilderElementIntoView;
	state.cb_navigateEditor = navigateEditor;
	state.cb_saveElement    = saveElement;
	state.cb_resetBuilder   = resetBuilder;
	state.cb_fetchElement   = fetchElement;

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	function scrollBuilderElementIntoView( id ) {
		if ( ! id ) { return; }
		const target = document.querySelector( '[data-wp-builder-id="' + id + '"]' );
		if ( target ) { target.scrollIntoView( { behavior: 'instant', block: 'center' } ); }
	}

	/**
	 * Switch the active tab panel in the quick-editor widget.
	 *
	 * @param {'main'|'element'} key Tab key to activate.
	 */
	function switchTab( key ) {
		state.tabBtns.forEach( ( btn ) => {
			btn.classList.toggle( 'is-active', btn.dataset.tab === key );
		} );
		if ( state.mainTabPanel )    { state.mainTabPanel.hidden    = key !== 'main'; }
		if ( state.elementTabPanel ) { state.elementTabPanel.hidden = key !== 'element'; }
	}

	/**
	 * Navigate to a specific tab, accordion section, and optional form field
	 * within the quick-editor panel.
	 *
	 * @param {'main'|'element'} tab     Tab key to activate.
	 * @param {string|null}      [section] Accordion ID suffix (e.g. 'identity') or omitted.
	 * @param {string}           [field]   Element ID to focus after opening.
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
	// Status message
	// -----------------------------------------------------------------------

	function setStatus( msg, isError ) {
		if ( ! state.statusMsg ) { return; }
		state.statusMsg.textContent = msg;
		if ( state.saveBtn ) {
			state.saveBtn.classList.toggle( 'is-error', !! isError );
		}
	}

	// -----------------------------------------------------------------------
	// Populate panel fields from element data
	// -----------------------------------------------------------------------

	function populatePanel( element, postTitle, postStatus, pageTemplate, hooksValue ) {
		const node   = normalizeNodeTag( element.node );
		const isVoid = !! VOID_NODES[ node ];
		const props  = element.props || {};

		state.nodeChip.textContent = node.toUpperCase();
		state.idChip.textContent   = element.id || '';

		state.nodeSelectCtrl.value = node;
		state.idDisplayCtrl.value  = element.id || '';

		state.contentSection.hidden  = isVoid;
		state.htmlTextareaCtrl.value = isVoid ? '' : ( element.content || '' );

		state.flexDirCtrl.value  = props.flexDirection || '';
		state.flexGrowCtrl.value = props.flexGrow || '';
		state.gapCtrl.value      = props.gap || '';

		state.styleTextareaCtrl.value = element.style || '';
		if ( state.styleEditor ) {
			state.styleEditorSuppressChange = true;
			state.styleEditor.codemirror.setValue( element.style || '' );
			state.styleEditorSuppressChange = false;
		}

		// Render node-specific attribute fields via the shared helper.
		renderNodeAttrs(
			state.attrsSection.querySelector( '.wpbe-accordion-body-inner' ),
			node,
			element.attrs || {},
			( name, value ) => {
				const ctrl = state.attrsSection.querySelector( '[data-attr-name="' + name + '"]' );
				if ( ctrl ) { ctrl.value = value; }
			},
			state.CSS
		);
		// Add data-attr-name to each rendered control for collection on save.
		state.attrsSection.querySelectorAll( '[id^="wp-builder-node-attr-"]' ).forEach( ( ctrl ) => {
			ctrl.dataset.attrName = ctrl.id.replace( 'wp-builder-node-attr-', '' );
		} );
		state.attrsSection.hidden = ! state.attrsSection.querySelector( '.wpbe-accordion-body-inner' ).childElementCount;

		// Populate the Main tab's post-level fields when values are provided.
		if ( postTitle     !== undefined && state.mainTitleDisplay  ) { state.mainTitleDisplay.value  = postTitle; }
		if ( postStatus    !== undefined && state.mainStatusDisplay ) { state.mainStatusDisplay.value = postStatus; }
		if ( pageTemplate  !== undefined && state.mainPageTemplateDisplay ) { state.mainPageTemplateDisplay.value = pageTemplate; }
		if ( hooksValue !== undefined && state.hooksTextareaCtrl ) {
			if ( state.hooksEditor ) {
				state.hooksEditor.codemirror.setValue( hooksValue );
			} else {
				state.hooksTextareaCtrl.value = hooksValue;
			}
		}

		// Keep structure-tree selection highlight in sync.
		if ( state.isStructureMode && state.liveRoot ) {
			state.liveRoot.querySelectorAll( '.wpbe-sv-node' ).forEach( ( svNode ) => {
				svNode.classList.toggle( 'is-selected', svNode.dataset.wpBuilderId === ( element.id || '' ) );
			} );
		}

		// Loading fresh data from the server — no pending unsaved changes.
		markClean();
	}

	// -----------------------------------------------------------------------
	// Panel open / close
	// -----------------------------------------------------------------------

	function openPanel( postId, elementId, liveRoot ) {
		state.postId    = postId;
		state.elementId = elementId;
		state.liveRoot  = liveRoot;

		// If we already have the panel and a cached layout, find the element
		// directly in the cache — no AJAX request needed.
		if ( state.panel && state.cachedLayout ) {
			const element = findElement( state.cachedLayout.children || [], elementId );
			if ( element ) {
				positionAndShowPanel();
				populatePanel( element );
				return;
			}
		}

		// If the panel already exists, show it with a loading state immediately.
		// On first open the panel is built from the schema returned by fetchElement()
		// and shown once the AJAX request completes.
		if ( state.panel ) {
			positionAndShowPanel();
			state.saveBtn.disabled = true;
			setStatus( state.text.loading || 'Loading\u2026', false );
		}

		fetchElement( postId, elementId );
	}

	function closePanel() {
		if ( ! state.panel ) { return; }
		state.panel.classList.remove( 'is-open' );
		if ( state.isPageZoomed ) {
			removePageZoom();
		}
		if ( state.isStructureMode ) {
			exitStructureMode();
		}
		state.postId       = null;
		state.elementId    = null;
		state.liveRoot     = null;
		state.cachedLayout = null;
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
