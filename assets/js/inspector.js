/**
 * Inspector — renders the left-panel inspector and manages the CodeMirror
 * CSS style editor. Reads from shared state; writes through state helpers.
 *
 * Import graph: constants, layout, state, canvas ← inspector  (no cycles)
 */

import { VOID_NODES } from './constants.js';
import { state, updateStatusBadge, updateSelectedNodeAttr } from './state.js';
import { findElement } from './layout.js';
import { renderEmpty, updateSelectedContainerStyle } from './canvas.js';
import { createAttrControl, renderNodeAttrs } from './dom-helpers.js';

// ---------------------------------------------------------------------------
// Module-level DOM references set by initInspector().
// ---------------------------------------------------------------------------

let _config                = {};
let _text                  = {};
let _selectionNodeBtn      = null;
let _selectionIdBtn        = null;
let _addNestedButton       = null;
let _nodeSelect            = null;
let _nodeSelectGroup       = null;
let _idInput               = null;
let _idInputGroup          = null;
let _inspectorEditor       = null;
let _htmlTextarea          = null;
let _embedPanel            = null;
let _postStatusSelect      = null;
let _pageTemplateSelect    = null;
let _flexDirectionSelect   = null;
let _flexGrowInput         = null;
let _gapInput              = null;
let _customStyleTextarea   = null;

// CodeMirror wrapper instance (null when wp.codeEditor is unavailable).
let _styleEditor              = null;
// True while setValue() is being called programmatically to suppress the onChange callback.
let _styleEditorSuppressChange = false;

/**
 * Initialise inspector DOM references and optional CodeMirror.
 *
 * @param {Object} opts
 * @param {Object}  opts.config                window.wpBuilder config object.
 * @param {Object}  opts.text                  i18n strings object.
 * @param {Element} opts.selectionNodeBtn
 * @param {Element} opts.selectionIdBtn
 * @param {Element} opts.addNestedButton
 * @param {Element} opts.nodeSelect
 * @param {Element} opts.nodeSelectGroup
 * @param {Element} opts.idInput
 * @param {Element} opts.idInputGroup
 * @param {Element} opts.inspectorEditor
 * @param {Element} opts.htmlTextarea
 * @param {Element} opts.embedPanel
 * @param {Element} opts.postStatusSelect
 * @param {Element} opts.pageTemplateSelect
 * @param {Element} opts.flexDirectionSelect
 * @param {Element} opts.flexGrowInput
 * @param {Element} opts.gapInput
 * @param {Element} opts.customStyleTextarea
 */
export function initInspector( opts ) {
	_config              = opts.config              || {};
	_text                = opts.text                || {};
	_selectionNodeBtn    = opts.selectionNodeBtn    || null;
	_selectionIdBtn      = opts.selectionIdBtn      || null;
	_addNestedButton     = opts.addNestedButton     || null;
	_nodeSelect          = opts.nodeSelect          || null;
	_nodeSelectGroup     = opts.nodeSelectGroup     || null;
	_idInput             = opts.idInput             || null;
	_idInputGroup        = opts.idInputGroup        || null;
	_inspectorEditor     = opts.inspectorEditor     || null;
	_htmlTextarea        = opts.htmlTextarea        || null;
	_embedPanel          = opts.embedPanel          || null;
	_postStatusSelect    = opts.postStatusSelect    || null;
	_pageTemplateSelect  = opts.pageTemplateSelect  || null;
	_flexDirectionSelect = opts.flexDirectionSelect || null;
	_flexGrowInput       = opts.flexGrowInput       || null;
	_gapInput            = opts.gapInput            || null;
	_customStyleTextarea = opts.customStyleTextarea || null;
}

/**
 * Initialise the CodeMirror CSS editor on the custom-style textarea, if
 * wp.codeEditor is available. Must be called after initInspector().
 */
export function initStyleEditor() {
	if ( ! _customStyleTextarea ) { return; }

	if ( window.wp && window.wp.codeEditor ) {
		_styleEditor = window.wp.codeEditor.initialize( _customStyleTextarea, {
			codemirror: {
				mode:              'css',
				autoCloseBrackets: true,
				matchBrackets:     true
			}
		} );
		_styleEditor.codemirror.on( 'change', ( cm ) => {
			if ( _styleEditorSuppressChange ) { return; }
			updateSelectedContainerStyle( cm.getValue() );
		} );
	} else {
		_customStyleTextarea.addEventListener( 'input', () => {
			updateSelectedContainerStyle( _customStyleTextarea.value );
		} );
	}
}

/** Return the active CodeMirror wrapper instance (may be null). */
export function getStyleEditor() {
	return _styleEditor;
}

// ---------------------------------------------------------------------------
// Inspector rendering
// ---------------------------------------------------------------------------

export function renderInspector() {
	const selected    = findElement( state.layout.children, state.selectedId ) || {};
	const isContainer = !! ( selected && selected.node !== undefined );
	const isVoid      = isContainer && VOID_NODES[ selected.node ];

	if ( _selectionNodeBtn ) {
		_selectionNodeBtn.textContent = ( selected.node || 'div' ).toUpperCase();
	}
	if ( _selectionIdBtn ) {
		_selectionIdBtn.textContent = selected.id || state.selectedId || '';
	}

	if ( _addNestedButton ) {
		_addNestedButton.hidden = ! isContainer || isVoid;
	}
	if ( _nodeSelectGroup ) {
		_nodeSelectGroup.hidden = ! isContainer;
	}
	if ( _idInputGroup ) {
		_idInputGroup.hidden = ! isContainer;
	}
	if ( _idInput ) {
		_idInput.value = selected.id || '';
	}
	if ( _nodeSelect && isContainer ) {
		_nodeSelect.value = selected.node || 'div';
	}
	if ( _inspectorEditor ) {
		_inspectorEditor.hidden = ! isContainer || isVoid;
	}
	if ( isContainer && ! isVoid && _htmlTextarea ) {
		_htmlTextarea.value = selected.content || '';
	}
	if ( _embedPanel ) {
		_embedPanel.hidden = false;
	}
	if ( _postStatusSelect ) {
		_postStatusSelect.value = _config.postStatus || 'draft';
		updateStatusBadge( _postStatusSelect.value );
	}
	if ( _pageTemplateSelect ) {
		_pageTemplateSelect.value = state.pageTemplate || 'default';
	}

	if ( isContainer ) {
		const props = selected.props || {};
		if ( _flexDirectionSelect ) { _flexDirectionSelect.value = props.flexDirection || ''; }
		if ( _flexGrowInput )       { _flexGrowInput.value       = props.flexGrow || ''; }
		if ( _gapInput )            { _gapInput.value            = props.gap || ''; }
		if ( _customStyleTextarea ) {
			const styleVal = selected.style || '';
			_customStyleTextarea.value = styleVal;
			if ( _styleEditor ) {
				_styleEditorSuppressChange = true;
				_styleEditor.codemirror.setValue( styleVal );
				_styleEditorSuppressChange = false;
			}
		}
		renderNodeAttrsPanel( selected );
	} else {
		renderNodeAttrsPanel( null );
	}
}

// ---------------------------------------------------------------------------
// Node-attributes panel
// ---------------------------------------------------------------------------

export function renderNodeAttrsPanel( selected ) {
	const panel = document.getElementById( 'wp-builder-inspector-node-attrs' );
	if ( ! panel ) { return; }
	renderNodeAttrs(
		panel,
		selected ? selected.node : '',
		selected ? ( selected.attrs || {} ) : {},
		( name, value ) => { updateSelectedNodeAttr( name, value ); }
	);
}
