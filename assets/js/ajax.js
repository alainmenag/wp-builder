/**
 * AJAX communication layer — fetch element, save element, reset builder.
 *
 * Import graph: state, live-preview, structure-view, panel-dom, code-editors, prefs, dock ← ajax
 *
 * Calls to editor.js functions (setStatus, populatePanel) are made via
 * state callbacks (cb_*) populated at boot time to avoid circular imports.
 */

import { state } from './state.js';
import { markClean, initChangeListeners } from './live-preview.js';
import { renderStructureTree } from './structure-view.js';
import { createPanel } from './panel-dom.js';
import { initStyleEditor, initHooksEditor } from './code-editors.js';
import { positionAndShowPanel } from './dock.js';

// ---------------------------------------------------------------------------
// Fetch element
// ---------------------------------------------------------------------------

/**
 * Fetch a single element and its panel schema from the server.
 * On the very first call the panel doesn't exist yet — it is built from the
 * schema returned by the server, then positioned and shown.
 *
 * @param {string} postId    WordPress post ID.
 * @param {string} elementId Builder element ID.
 */
export function fetchElement( postId, elementId ) {
	const form = new window.FormData();
	form.append( 'action',     'wp_builder_get_element' );
	form.append( 'nonce',      state.config.getNonce );
	form.append( 'post_id',    postId );
	form.append( 'element_id', elementId );

	window.fetch( state.config.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: form } )
		.then( ( r ) => r.json() )
		.then( ( payload ) => {
			if ( ! payload || ! payload.success ) {
				throw new Error( payload && payload.data && payload.data.message
					? payload.data.message : ( state.text.error || 'Error' ) );
			}
			const data = payload.data;
			// On the very first open the panel doesn't exist yet — build it
			// from the schema returned by the server, then position and show it.
			if ( ! state.panel ) {
				createPanel( data.fields || [] );
				initStyleEditor();
				initHooksEditor();
				initChangeListeners();
				positionAndShowPanel();
			}
			state.saveBtn.disabled = false;
			if ( state.cb_setStatus ) { state.cb_setStatus( '', false ); }
			if ( data.layout ) { state.cachedLayout = data.layout; }
			if ( state.cb_populatePanel ) {
				state.cb_populatePanel(
					data.element,
					data.post_title   || '',
					data.post_status  || '',
					data.page_template || '',
					data.hooks !== undefined ? data.hooks : ''
				);
			}
			// If in structure mode, keep the tree in sync with the fetched layout.
			if ( state.isStructureMode && data.layout ) {
				renderStructureTree( data.layout, state.liveRoot );
			}
		} )
		.catch( ( err ) => {
			if ( state.cb_setStatus ) { state.cb_setStatus( err.message || ( state.text.error || 'Error' ), true ); }
		} );
}

// ---------------------------------------------------------------------------
// Save element
// ---------------------------------------------------------------------------

/**
 * Collect all panel field values and POST them to wp_builder_save_element.
 * Updates the live DOM and panel state on success.
 */
export function saveElement() {
	if ( ! state.postId || ! state.elementId ) { return; }

	state.saveBtn.disabled = true;
	if ( state.cb_setStatus ) { state.cb_setStatus( state.text.saving || 'Saving\u2026', false ); }

	const attrsObj = {};
	state.attrsSection.querySelectorAll( '[data-attr-name]' ).forEach( ( ctrl ) => {
		if ( ctrl.dataset.attrName && ctrl.value ) {
			attrsObj[ ctrl.dataset.attrName ] = ctrl.value;
		}
	} );

	const form = new window.FormData();
	form.append( 'action',     'wp_builder_save_element' );
	form.append( 'nonce',      state.config.saveNonce );
	form.append( 'post_id',    state.postId );
	form.append( 'element_id', state.elementId );
	form.append( 'new_element_id', state.idDisplayCtrl.value );
	form.append( 'element_title',  state.elementTitleCtrl ? state.elementTitleCtrl.value : '' );
	form.append( 'title',         state.mainTitleDisplay  ? state.mainTitleDisplay.value  : '' );
	form.append( 'post_status',   state.mainStatusDisplay ? state.mainStatusDisplay.value : '' );
	form.append( 'page_template', state.mainPageTemplateDisplay ? state.mainPageTemplateDisplay.value : '' );
	if ( state.hooksTextareaCtrl ) {
		const hooksVal = state.hooksEditor ? state.hooksEditor.codemirror.getValue() : state.hooksTextareaCtrl.value;
		form.append( 'hooks', hooksVal );
	}
	form.append( 'node',    state.nodeSelectCtrl.value );
	form.append( 'props',   JSON.stringify( {
		flexDirection: state.flexDirCtrl.value,
		flexGrow:      state.flexGrowCtrl.value,
		gap:           state.gapCtrl.value,
	} ) );
	form.append( 'style',   state.styleEditor ? state.styleEditor.codemirror.getValue() : state.styleTextareaCtrl.value );
	form.append( 'content', state.htmlTextareaCtrl.value );
	form.append( 'attrs',   JSON.stringify( attrsObj ) );

	window.fetch( state.config.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: form } )
		.then( ( r ) => r.json() )
		.then( ( payload ) => {
			if ( ! payload || ! payload.success ) {
				throw new Error( payload && payload.data && payload.data.message
					? payload.data.message : ( state.text.error || 'Save failed' ) );
			}

			if ( payload.data.html && state.liveRoot && state.liveRoot.parentNode ) {
				if ( state.isStructureMode ) {
					// In structure mode do not swap the DOM — just keep the snapshot updated.
					state.savedRenderedOuterHtml = payload.data.html;
				} else {
					const tpl    = document.createElement( 'template' );
					tpl.innerHTML = payload.data.html.trim();
					const prevEl  = state.liveRoot.previousElementSibling;
					if ( prevEl && prevEl.tagName === 'STYLE' ) { prevEl.remove(); }
					state.liveRoot.parentNode.insertBefore( tpl.content, state.liveRoot );
					state.liveRoot.remove();
					const newRoot = document.querySelector( '[data-wp-builder-post-id="' + state.postId + '"]' );
					if ( newRoot ) { state.liveRoot = newRoot; }
				}
			}

			if ( payload.data.element && state.cb_populatePanel ) {
				state.cb_populatePanel( payload.data.element );
			}
			if ( payload.data.element && payload.data.element.id ) {
				state.elementId = payload.data.element.id;
			}
			if ( payload.data.layout ) { state.cachedLayout = payload.data.layout; }
			if ( payload.data.post_title   !== undefined && state.mainTitleDisplay  ) { state.mainTitleDisplay.value  = payload.data.post_title; }
			if ( payload.data.post_status  !== undefined && state.mainStatusDisplay ) { state.mainStatusDisplay.value = payload.data.post_status; }
			if ( payload.data.page_template !== undefined && state.mainPageTemplateDisplay ) { state.mainPageTemplateDisplay.value = payload.data.page_template; }
			if ( payload.data.hooks !== undefined && state.hooksTextareaCtrl ) {
				if ( state.hooksEditor ) {
					state.hooksEditor.codemirror.setValue( payload.data.hooks );
				} else {
					state.hooksTextareaCtrl.value = payload.data.hooks;
				}
			}
			if ( state.cb_setStatus ) { state.cb_setStatus( state.text.saved || 'Saved', false ); }
			markClean();

			// When in structure mode: update the saved snapshot and re-render the tree.
			if ( state.isStructureMode && payload.data.html ) {
				state.savedRenderedOuterHtml = payload.data.html;
				if ( payload.data.layout ) {
					renderStructureTree( payload.data.layout, state.liveRoot );
				}
			}
		} )
		.catch( ( err ) => {
			if ( state.cb_setStatus ) { state.cb_setStatus( err.message || ( state.text.error || 'Save failed' ), true ); }
		} )
		.finally( () => {
			state.saveBtn.disabled = false;
		} );
}

// ---------------------------------------------------------------------------
// Reset builder
// ---------------------------------------------------------------------------

/**
 * Clear all builder layout data and page template meta for the current post,
 * then redirect to the standard WordPress edit URL.
 */
export function resetBuilder() {
	if ( ! state.postId ) { return; }
	const confirmMsg = state.text.resetBuilderConfirm ||
		'This will permanently clear all builder data and reset the page template to default. This action cannot be undone. Continue?';
	if ( ! window.confirm( confirmMsg ) ) { return; }

	if ( state.cb_setStatus ) { state.cb_setStatus( state.text.resetting || 'Resetting\u2026', false ); }

	const form = new window.FormData();
	form.append( 'action',  'wp_builder_reset' );
	form.append( 'nonce',   state.config.resetNonce );
	form.append( 'post_id', state.postId );

	window.fetch( state.config.ajaxUrl, { method: 'POST', body: form } )
		.then( ( r ) => r.json() )
		.then( ( payload ) => {
			if ( ! payload || ! payload.success ) {
				throw new Error( payload && payload.data && payload.data.message
					? payload.data.message : ( state.text.error || 'Error' ) );
			}
			window.location.href = payload.data.editUrl;
		} )
		.catch( ( err ) => {
			if ( state.cb_setStatus ) { state.cb_setStatus( err.message || ( state.text.error || 'Error' ), true ); }
		} );
}
