/**
 * Shared mutable state for the WP Builder frontend quick-editor.
 *
 * All module-level variables and cross-module callbacks live here so that
 * individual modules only need to import this single object rather than
 * threading dozens of parameters through every call.
 *
 * Callback slots (cb_*) are populated by editor.js at startup to avoid
 * circular module imports.
 */

export const state = {

	// ── Panel DOM references ──────────────────────────────────────────────────

	/** @type {HTMLElement|null} */
	panel:           null,
	/** @type {HTMLElement|null} */
	nodeChip:        null,
	/** @type {HTMLElement|null} */
	idChip:          null,
	/** @type {HTMLAnchorElement|null} */
	editLink:        null,
	/** @type {HTMLElement|null} */
	statusMsg:       null,
	/** @type {HTMLButtonElement|null} */
	saveBtn:         null,
	/** @type {HTMLElement|null} The label <span> inside saveBtn. */
	saveLbl:         null,
	/** @type {HTMLSelectElement|null} */
	nodeSelectCtrl:  null,
	/** @type {HTMLInputElement|null} */
	idDisplayCtrl:   null,
	/** @type {HTMLInputElement|null} */
	elementTitleCtrl: null,
	/** @type {HTMLTextAreaElement|null} */
	htmlTextareaCtrl:  null,
	/** @type {HTMLElement|null} Content accordion (hidden for void nodes). */
	contentSection:    null,
	/** @type {HTMLSelectElement|null} */
	flexDirCtrl:     null,
	/** @type {HTMLInputElement|null} */
	flexGrowCtrl:    null,
	/** @type {HTMLInputElement|null} */
	gapCtrl:         null,
	/** @type {HTMLTextAreaElement|null} */
	styleTextareaCtrl:  null,
	/** @type {HTMLElement|null} Attributes accordion. */
	attrsSection:    null,
	/** @type {HTMLElement|null} The Main tab panel container. */
	mainTabPanel:    null,
	/** @type {HTMLElement|null} The Element tab panel container. */
	elementTabPanel: null,
	/** @type {HTMLInputElement|null} Post title input in Main tab. */
	mainTitleDisplay:        null,
	/** @type {HTMLSelectElement|null} Post-status select in Main tab. */
	mainStatusDisplay:       null,
	/** @type {HTMLSelectElement|null} Page layout select in Main tab. */
	mainPageTemplateDisplay: null,
	/** @type {HTMLTextAreaElement|null} Hooks textarea in Main tab (snippet only). */
	hooksTextareaCtrl:  null,
	/** @type {Object|null} CodeMirror wrapper for the hooks textarea. */
	hooksEditor:     null,
	/** @type {HTMLButtonElement[]} The two tab toggle buttons. */
	tabBtns:         [],
	/** @type {HTMLButtonElement|null} The Fit Page footer button. */
	fitBtn:          null,
	/** @type {HTMLButtonElement|null} The structure-view toggle button. */
	structureToggleBtn: null,

	// ── Editor state ──────────────────────────────────────────────────────────

	/** @type {string|null} */
	postId:    null,
	/** @type {string|null} */
	elementId: null,
	/** @type {HTMLElement|null} The live [data-wp-builder-post-id] root element. */
	liveRoot:  null,
	/** @type {Object|null} Last layout object from a wp_builder_get_element response. */
	cachedLayout: null,
	/** @type {boolean} Whether the panel has unsaved changes pending. */
	hasUnsavedChanges: false,

	// ── CodeMirror ────────────────────────────────────────────────────────────

	/** @type {Object|null} CodeMirror wrapper instance for the style textarea. */
	styleEditor: null,
	/** @type {boolean} True while setValue() is called programmatically, to suppress onChange. */
	styleEditorSuppressChange: false,

	// ── Panel position / dock ─────────────────────────────────────────────────

	/** @type {number|null} Persisted panel left position (px). */
	panelLeft:  null,
	/** @type {number|null} Persisted panel top position (px). */
	panelTop:   null,
	/** @type {number|null} Persisted docked panel width (px). */
	panelWidth: null,
	/** @type {boolean} Whether the panel is docked (snapped full-height to an edge). */
	isDocked:   false,
	/** @type {'left'|'right'} Which edge the panel is docked to. */
	dockedSide: 'right',
	/** @type {number} Last known pointer X position (clientX), updated on every mousemove. */
	pointerX:   0,

	// ── Fit-page zoom ─────────────────────────────────────────────────────────

	/** @type {boolean} Whether the fit-page zoom is currently active. */
	isPageZoomed:  false,
	/** @type {number} The scale factor applied by the last applyPageZoom() call. */
	pageZoomScale: 1,

	// ── Structure view ────────────────────────────────────────────────────────

	/** @type {boolean} Whether structure mode is currently active. */
	isStructureMode: false,
	/**
	 * @type {string|null} Snapshot of the rendered HTML captured when entering
	 * structure mode. Includes the preceding <style> sibling (if any) so that
	 * exitStructureMode() can restore the full rendered state in one step.
	 */
	savedRenderedOuterHtml: null,
	/** @type {HTMLStyleElement|null} Sibling <style> element disabled in structure mode. */
	suppressedStyleEl: null,

	// ── Config / i18n ─────────────────────────────────────────────────────────

	/** @type {Object|null} The window.wpBuilderEditor config object. */
	config: null,
	/** @type {Object} Translated strings (config.i18n). */
	text:   {},

	// ── Constants ─────────────────────────────────────────────────────────────

	STORAGE_KEY:            'wpbfe_panel_prefs',
	/** Pixels the pointer must be from a viewport edge to trigger a snap. */
	POINTER_SNAP_THRESHOLD: 50,
	/** Pixels dragged away from a docked edge before the panel undocks. */
	UNDOCK_THRESHOLD:       25,

	/**
	 * CSS class names used by this panel (wpbe- prefix to avoid conflicts
	 * with the admin editor stylesheet loaded inside the builder iframe).
	 */
	CSS: {
		select:     'wpbe-select',
		input:      'wpbe-input',
		fieldGroup: 'wpbe-field-group',
		label:      'wpbe-label',
	},

	// ── Callbacks injected by editor.js (avoid circular imports) ─────────────

	/** @type {Function|null} (postId, elementId, liveRoot) => void */
	cb_openPanel:      null,
	/** @type {Function|null} (msg, isError) => void */
	cb_setStatus:      null,
	/** @type {Function|null} (element, postTitle?, postStatus?, pageTemplate?, hooks?) => void */
	cb_populatePanel:  null,
	/** @type {Function|null} () => void */
	cb_closePanel:     null,
	/** @type {Function|null} (id) => void */
	cb_scrollIntoView: null,
	/** @type {Function|null} (tab, section, field?) => void */
	cb_navigateEditor: null,
	/** @type {Function|null} () => void */
	cb_saveElement:    null,
	/** @type {Function|null} () => void */
	cb_resetBuilder:   null,
	/** @type {Function|null} (postId, elementId) => void */
	cb_fetchElement:   null,
};
