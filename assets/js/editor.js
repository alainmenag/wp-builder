/**
 * Editor entry point — composes all modules, resolves cross-module
 * callbacks, wires event listeners, and boots the editor.
 *
 * window.wpBuilder is set by wp_localize_script before this module runs.
 */

import { normalizeLayout, normalizeNodeAttrs, findElement } from './layout.js';
import {
	state,
	initState,
	markDirty,
	addElementToSelection,
	updateStatusBadge,
	updateSelectedId
} from './state.js';
import {
	initCanvas,
	renderCanvas,
	updateSelectedContainerProp,
	updateHtmlPreview
} from './canvas.js';
import {
	initInspector,
	initStyleEditor,
	getStyleEditor,
	renderInspector
} from './inspector.js';
import { initApi, saveLayout }         from './api.js';
import { navigate, initTabs, initAccordions } from './navigation.js';

// ---------------------------------------------------------------------------
// Read WordPress-injected config (set by wp_localize_script before this runs).
// ---------------------------------------------------------------------------

const config = window.wpBuilder || {};
const text   = config.i18n || {};

const statusLabels = {
	publish: text.statusPublished || 'Published',
	draft:   text.statusDraft     || 'Draft',
	pending: text.statusPending   || 'Pending Review',
	private: text.statusPrivate   || 'Private'
};

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const stage              = document.getElementById( 'wp-builder-stage' );
const saveButton         = document.getElementById( 'wp-builder-save' );
const embedPanel         = document.getElementById( 'wp-builder-embed-panel' );
const addNestedButton    = document.getElementById( 'wp-builder-add-nested' );
const selectionNodeBtn   = document.getElementById( 'wp-builder-selection-node' );
const selectionIdBtn     = document.getElementById( 'wp-builder-selection-id' );
const saveStatus         = document.getElementById( 'wp-builder-save-status' );
const addButtons         = document.querySelectorAll( '[data-wp-builder-add]' );
const htmlTextarea       = document.getElementById( 'wp-builder-html-content' );
const inspectorEditor    = document.getElementById( 'wp-builder-inspector-editor' );
const flexDirectionSelect = document.getElementById( 'wp-builder-flex-direction' );
const flexGrowInput      = document.getElementById( 'wp-builder-flex-grow' );
const gapInput           = document.getElementById( 'wp-builder-gap' );
const customStyleTextarea = document.getElementById( 'wp-builder-custom-style' );
const nodeSelect         = document.getElementById( 'wp-builder-node' );
const nodeSelectGroup    = document.getElementById( 'wp-builder-inspector-node' );
const idInput            = document.getElementById( 'wp-builder-node-id' );
const idInputGroup       = document.getElementById( 'wp-builder-inspector-id' );
const postStatusSelect   = document.getElementById( 'wp-builder-post-status' );
const postStatusBadge    = document.getElementById( 'wp-builder-post-status-badge' );
const postTitleInput     = document.getElementById( 'wp-builder-post-title' );
const titleInput         = document.getElementById( 'wp-builder-title' );
const viewLink           = document.getElementById( 'wp-builder-view-link' );
const pageTemplateSelect = document.getElementById( 'wp-builder-chrome-template' );

// Guard — abort silently if the editor shell was not rendered on this page.
if ( stage && saveButton ) {

	// -----------------------------------------------------------------------
	// Initialise state
	// -----------------------------------------------------------------------

	const initialLayout = normalizeLayout( config.layout );
	state.layout       = initialLayout;
	state.selectedId   = initialLayout.children[ 0 ].id;
	state.dirty        = false;
	state.saving       = false;
	state.pageTemplate = config.pageTemplate || 'default';

	// Composite render callback — called whenever state changes require a
	// full re-render of both the stage and the inspector.
	const render = () => {
		renderCanvas();
		renderInspector();
	};

	// Focus callback — navigates the inspector to the identity fields.
	const focusElementIdentity = () => navigate( 'element', null );

	// -----------------------------------------------------------------------
	// Bootstrap modules
	// -----------------------------------------------------------------------

	initState( {
		saveButton,
		saveStatus,
		postStatusBadge,
		idInput,
		text,
		statusLabels,
		onRender:               render,
		onFocusElementIdentity: focusElementIdentity
	} );

	initCanvas( { stage, text } );

	initInspector( {
		config,
		text,
		selectionNodeBtn,
		selectionIdBtn,
		addNestedButton,
		nodeSelect,
		nodeSelectGroup,
		idInput,
		idInputGroup,
		inspectorEditor,
		htmlTextarea,
		embedPanel,
		postStatusSelect,
		pageTemplateSelect,
		flexDirectionSelect,
		flexGrowInput,
		gapInput,
		customStyleTextarea
	} );

	// Initialise CodeMirror for the CSS style textarea (must follow initInspector).
	initStyleEditor();

	initApi( {
		saveButton,
		postStatusSelect,
		titleInput,
		pageTemplateSelect,
		postTitleInput,
		viewLink,
		config,
		text,
		onRender: render
	} );

	initTabs();
	initAccordions( getStyleEditor );

	// -----------------------------------------------------------------------
	// Event listeners
	// -----------------------------------------------------------------------

	// Left-panel "Add" buttons
	addButtons.forEach( ( button ) => {
		button.addEventListener( 'click', () => { addElementToSelection(); } );
	} );

	// Inspector "Add nested" button
	if ( addNestedButton ) {
		addNestedButton.addEventListener( 'click', () => { addElementToSelection(); } );
	}

	// HTML content textarea
	if ( htmlTextarea ) {
		htmlTextarea.addEventListener( 'input', () => {
			const element = findElement( state.layout.children, state.selectedId );
			if ( element && element.node !== undefined ) {
				element.content = htmlTextarea.value;
				markDirty();
				updateHtmlPreview( state.selectedId, htmlTextarea.value );
			}
		} );
	}

	// Post-title text input — keep in sync with the header title button
	if ( postTitleInput ) {
		postTitleInput.addEventListener( 'input', () => {
			const value = postTitleInput.value.trim();
			if ( titleInput ) { titleInput.textContent = value || config.postTitle || ''; }
			markDirty();
		} );
	}

	// Post-status select — keep the header badge in sync
	if ( postStatusSelect ) {
		postStatusSelect.addEventListener( 'change', () => {
			updateStatusBadge( postStatusSelect.value );
		} );
	}

	// Navigate-on-click bindings — each entry opens a tab, accordion, and focuses a field
	const NAV_BINDINGS = [
		{ el: postStatusBadge,  tab: 'main',    section: 'settings', field: 'wp-builder-post-status' },
		{ el: selectionNodeBtn, tab: 'element', section: 'identity', field: 'wp-builder-node'        },
		{ el: selectionIdBtn,   tab: 'element', section: 'identity', field: 'wp-builder-node-id'     },
		{ el: titleInput,       tab: 'main',    section: 'settings', field: 'wp-builder-post-title'  }
	];
	for ( const binding of NAV_BINDINGS ) {
		if ( ! binding.el ) { continue; }
		binding.el.addEventListener( 'click', () => {
			navigate( binding.tab, binding.section, binding.field );
		} );
	}

	// Container layout-prop bindings — data-driven wiring of inspector inputs
	const PROP_BINDINGS = [
		{ el: flexDirectionSelect, event: 'change', prop: 'flexDirection' },
		{ el: flexGrowInput,       event: 'input',  prop: 'flexGrow'      },
		{ el: gapInput,            event: 'input',  prop: 'gap'           }
	];
	for ( const binding of PROP_BINDINGS ) {
		if ( ! binding.el ) { continue; }
		binding.el.addEventListener( binding.event, () => {
			updateSelectedContainerProp( binding.prop, binding.el.value );
		} );
	}

	// Node-type select — change tag and re-normalise attributes
	if ( nodeSelect ) {
		nodeSelect.addEventListener( 'change', () => {
			const element = findElement( state.layout.children, state.selectedId );
			if ( element && element.node !== undefined ) {
				element.node  = nodeSelect.value;
				element.attrs = normalizeNodeAttrs( nodeSelect.value, element.attrs );
				markDirty();
				render();
			}
		} );
	}

	// Element-ID input
	if ( idInput ) {
		idInput.addEventListener( 'blur', () => { updateSelectedId( idInput.value ); } );
		idInput.addEventListener( 'keydown', ( event ) => {
			if ( event.key === 'Enter' ) {
				event.preventDefault();
				idInput.blur();
			}
		} );
	}

	// Save button
	saveButton.addEventListener( 'click', () => { saveLayout(); } );

	// Page-template select
	if ( pageTemplateSelect ) {
		pageTemplateSelect.addEventListener( 'change', () => {
			state.pageTemplate = pageTemplateSelect.value;
			markDirty();
		} );
	}

	// Warn before leaving with unsaved changes
	window.addEventListener( 'beforeunload', ( event ) => {
		if ( ! state.dirty ) { return; }
		event.preventDefault();
		event.returnValue = '';
	} );

	// -----------------------------------------------------------------------
	// Expose navigate() on window.wpBuilder for external callers.
	// -----------------------------------------------------------------------

	( window.wpBuilder || ( window.wpBuilder = {} ) ).navigate = navigate;

	// -----------------------------------------------------------------------
	// Initial render
	// -----------------------------------------------------------------------

	render();
	focusElementIdentity();
}
