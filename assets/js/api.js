/**
 * API — AJAX save-layout request and post-save state reconciliation.
 */

import { state, updateStatus, updateStatusBadge } from './state.js';
import { normalizeLayout, findElement } from './layout.js';

// ---------------------------------------------------------------------------
// Module-level references set by initApi().
// ---------------------------------------------------------------------------

let _saveButton       = null;
let _postStatusSelect = null;
let _titleInput       = null;
let _pageTemplateSelect = null;
let _postTitleInput   = null;
let _viewLink         = null;
let _config           = {};
let _text             = {};
let _onRender         = null;

/**
 * @param {Object} opts
 * @param {Element}  opts.saveButton          Save button element.
 * @param {Element}  opts.postStatusSelect    Post-status select element.
 * @param {Element}  opts.titleInput          Title button / display element.
 * @param {Element}  opts.pageTemplateSelect  Page-template select element.
 * @param {Element}  opts.postTitleInput      Post-title text input element.
 * @param {Element}  opts.viewLink            "View" link element.
 * @param {Object}   opts.config              window.wpBuilder config object (mutable reference).
 * @param {Object}   opts.text                i18n strings object.
 * @param {Function} opts.onRender            Callback to trigger a full re-render after save.
 */
export function initApi( { saveButton, postStatusSelect, titleInput, pageTemplateSelect, postTitleInput, viewLink, config, text, onRender } ) {
	_saveButton        = saveButton;
	_postStatusSelect  = postStatusSelect;
	_titleInput        = titleInput;
	_pageTemplateSelect = pageTemplateSelect;
	_postTitleInput    = postTitleInput;
	_viewLink          = viewLink;
	_config            = config || {};
	_text              = text   || {};
	_onRender          = onRender || null;
}

// ---------------------------------------------------------------------------
// Save layout
// ---------------------------------------------------------------------------

export function saveLayout() {
	if ( state.saving ) { return; }

	state.saving          = true;
	_saveButton.disabled  = true;
	updateStatus( _text.saving || 'Saving...' );

	const form = new window.FormData();
	form.append( 'action',  'wp_builder_save_layout' );
	form.append( 'nonce',   _config.nonce   || '' );
	form.append( 'post_id', _config.postId  || '' );
	form.append( 'layout',  JSON.stringify( state.layout ) );
	if ( _postStatusSelect ) {
		form.append( 'post_status', _postStatusSelect.value );
	}
	if ( _titleInput ) {
		form.append( 'title', _titleInput.textContent.trim() || _config.postTitle || '' );
	}
	if ( _pageTemplateSelect ) {
		form.append( 'page_template', state.pageTemplate || 'default' );
	}

	window.fetch( _config.ajaxUrl, {
		method:      'POST',
		credentials: 'same-origin',
		body:        form
	} )
		.then( ( response ) => response.json() )
		.then( ( payload ) => {
			if ( ! payload || ! payload.success ) {
				throw new Error(
					payload && payload.data && payload.data.message
						? payload.data.message
						: 'Save failed'
				);
			}

			state.layout = normalizeLayout( payload.data.layout );
			if ( ! findElement( state.layout.children, state.selectedId ) ) {
				state.selectedId = state.layout.children[ 0 ].id;
			}
			state.dirty = false;

			if ( payload.data.postStatus ) {
				_config.postStatus = payload.data.postStatus;
				if ( _postStatusSelect ) { _postStatusSelect.value = _config.postStatus; }
				updateStatusBadge( _config.postStatus );
			}
			if ( payload.data.postTitle ) {
				_config.postTitle = payload.data.postTitle;
				if ( _titleInput )     { _titleInput.textContent = payload.data.postTitle; }
				if ( _postTitleInput ) { _postTitleInput.value   = payload.data.postTitle; }
			}
			if ( payload.data.docTitle ) {
				document.title = payload.data.docTitle;
			}
			if ( payload.data.previewUrl && _viewLink ) {
				_viewLink.href = payload.data.previewUrl;
			}
			if ( payload.data.pageTemplate !== undefined && _pageTemplateSelect ) {
				state.pageTemplate          = payload.data.pageTemplate;
				_pageTemplateSelect.value   = payload.data.pageTemplate;
			}

			if ( _onRender ) { _onRender(); }

			state.dirty = false;
			if ( _saveButton ) { _saveButton.classList.remove( 'is-dirty' ); }
			updateStatus( _text.saved || 'Saved' );
		} )
		.catch( ( error ) => {
			updateStatus( error.message || 'Save failed' );
		} )
		.finally( () => {
			state.saving         = false;
			_saveButton.disabled = false;
		} );
}
