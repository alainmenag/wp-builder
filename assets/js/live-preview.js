/**
 * Live DOM preview — unsaved-changes tracking and real-time DOM mutation
 * so panel edits appear immediately without a round-trip to the server.
 *
 * Import graph: state, dom-helpers, constants ← live-preview
 */

import { state } from './state.js';
import { renderNodeAttrs } from './dom-helpers.js';
import { VOID_NODES } from './constants.js';

// ---------------------------------------------------------------------------
// Unsaved-changes tracking
// ---------------------------------------------------------------------------

export function markDirty() {
	if ( state.hasUnsavedChanges ) { return; }
	state.hasUnsavedChanges = true;
	if ( state.saveBtn ) { state.saveBtn.classList.add( 'has-unsaved-changes' ); }
	if ( state.saveLbl ) { state.saveLbl.textContent = state.text.unsaved || 'Unsaved'; }
}

export function markClean() {
	state.hasUnsavedChanges = false;
	if ( state.saveBtn ) { state.saveBtn.classList.remove( 'has-unsaved-changes' ); }
	if ( state.saveLbl ) { state.saveLbl.textContent = state.text.save || 'Save'; }
}

// ---------------------------------------------------------------------------
// Live DOM element lookup
// ---------------------------------------------------------------------------

/**
 * Return the live DOM element currently open in the panel, or null when the
 * element cannot be found (e.g. structure mode is active).
 *
 * When a live-preview ID change has already updated the element's
 * data-wp-builder-id attribute to a new value, the original state.elementId
 * no longer matches. In that case we fall back to the current value of the ID
 * input so subsequent applyLivePreview() calls still find the element.
 *
 * @returns {HTMLElement|null}
 */
export function findLiveDomElement() {
	if ( ! state.elementId || ! state.liveRoot || state.isStructureMode ) { return null; }
	if ( state.liveRoot.getAttribute( 'data-wp-builder-id' ) === state.elementId ) {
		return state.liveRoot;
	}
	const found = state.liveRoot.querySelector( '[data-wp-builder-id="' + state.elementId + '"]' );
	if ( found ) { return found; }

	// Fall back: the live-preview may have already updated data-wp-builder-id
	// to the pending new ID typed by the user.
	const pendingId = state.idDisplayCtrl ? state.idDisplayCtrl.value : '';
	if ( pendingId && pendingId !== state.elementId ) {
		if ( state.liveRoot.getAttribute( 'data-wp-builder-id' ) === pendingId ) {
			return state.liveRoot;
		}
		return state.liveRoot.querySelector( '[data-wp-builder-id="' + pendingId + '"]' );
	}
	return null;
}

// ---------------------------------------------------------------------------
// Live preview application
// ---------------------------------------------------------------------------

/**
 * Apply the current panel field values directly to the live DOM element so
 * changes appear in real time before the user saves.
 *
 * In structure mode there is no live DOM element to mutate, so only the
 * panel header chips, the content-section visibility, and the Attributes
 * accordion are updated — and the matching node row in the structure tree
 * has its own chips kept in sync.
 */
export function applyLivePreview() {
	const newTag = state.nodeSelectCtrl ? state.nodeSelectCtrl.value : '';
	const newId  = state.idDisplayCtrl  ? state.idDisplayCtrl.value  : '';

	// ── Panel header chips + content-section visibility (both modes) ──────────
	if ( newTag ) {
		if ( state.nodeChip ) { state.nodeChip.textContent = newTag.toUpperCase(); }
		// Show or hide the content accordion for void nodes (e.g. img, input).
		if ( state.contentSection ) {
			state.contentSection.hidden = !! VOID_NODES[ newTag ];
		}
	}

	// ── Structure mode ────────────────────────────────────────────────────────
	if ( state.isStructureMode ) {
		if ( state.liveRoot && state.elementId ) {
			const svNode = state.liveRoot.querySelector( '.wpbe-sv-node[data-wp-builder-id="' + state.elementId + '"]' );
			if ( svNode ) {
				// Sync the node-type chip and re-render the Attributes accordion
				// if the node type has changed.
				if ( newTag ) {
					const tagChip = svNode.querySelector( '.wpbe-sv-node-bar .wpbe-chip--node' );
					const prevTag = tagChip ? tagChip.textContent.toLowerCase() : '';
					if ( newTag !== prevTag ) {
						if ( state.attrsSection ) {
							renderNodeAttrs(
								state.attrsSection.querySelector( '.wpbe-accordion-body-inner' ),
								newTag,
								{},
								() => {},
								state.CSS
							);
							state.attrsSection.querySelectorAll( '[id^="wp-builder-node-attr-"]' ).forEach( ( ctrl ) => {
								ctrl.dataset.attrName = ctrl.id.replace( 'wp-builder-node-attr-', '' );
								ctrl.addEventListener( 'input',  markDirty );
								ctrl.addEventListener( 'change', markDirty );
							} );
							const hasAttrs = !! state.attrsSection.querySelector( '.wpbe-accordion-body-inner' ).childElementCount;
							state.attrsSection.hidden = ! hasAttrs;
							if ( hasAttrs && ! state.attrsSection.classList.contains( 'is-open' ) ) {
								const accBtn = state.attrsSection.querySelector( '.wpbe-accordion-header' );
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
		if ( newId && state.idChip ) { state.idChip.textContent = newId; }
		return;
	}

	// ── Rendered mode: live DOM updates ───────────────────────────────────────
	let el = findLiveDomElement();
	if ( ! el ) { return; }

	// ── Node type ─────────────────────────────────────────────────────────────
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
			if ( state.liveRoot === el ) { state.liveRoot = newEl; }
			el = newEl;

			// Re-render the Attributes accordion for the new node type so the
			// correct attribute fields appear immediately without requiring a save.
			if ( state.attrsSection ) {
				renderNodeAttrs(
					state.attrsSection.querySelector( '.wpbe-accordion-body-inner' ),
					newTag,
					{},
					() => {},
					state.CSS
				);
				// Wire data-attr-name and markDirty on the freshly rendered controls.
				state.attrsSection.querySelectorAll( '[id^="wp-builder-node-attr-"]' ).forEach( ( ctrl ) => {
					ctrl.dataset.attrName = ctrl.id.replace( 'wp-builder-node-attr-', '' );
					ctrl.addEventListener( 'input',  markDirty );
					ctrl.addEventListener( 'change', markDirty );
				} );
				const hasAttrs = !! state.attrsSection.querySelector( '.wpbe-accordion-body-inner' ).childElementCount;
				state.attrsSection.hidden = ! hasAttrs;
				// Auto-open the attrs accordion when the new node has attributes.
				if ( hasAttrs && ! state.attrsSection.classList.contains( 'is-open' ) ) {
					const accBtn = state.attrsSection.querySelector( '.wpbe-accordion-header' );
					if ( accBtn ) { accBtn.click(); }
				}
			}
		}
		// state.nodeChip and state.contentSection already updated above.
	}

	// ── Element ID ────────────────────────────────────────────────────────────
	if ( newId && newId !== el.getAttribute( 'data-wp-builder-id' ) ) {
		el.setAttribute( 'data-wp-builder-id', newId );
		if ( state.idChip ) { state.idChip.textContent = newId; }
	}

	// ── Layout props ──────────────────────────────────────────────────────────
	const flexDir  = state.flexDirCtrl  ? state.flexDirCtrl.value  : '';
	const flexGrow = state.flexGrowCtrl ? state.flexGrowCtrl.value : '';
	const gap      = state.gapCtrl      ? state.gapCtrl.value      : '';

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

	// ── HTML content ──────────────────────────────────────────────────────────
	if ( state.htmlTextareaCtrl && ! state.contentSection.hidden ) {
		// Preserve nested builder child elements — they follow the content
		// HTML in the DOM (PHP renders content first, then children).
		// Also preserve each child's preceding <style> sibling, because
		// PHP emits a <style> block immediately before any element that has
		// custom CSS, and that block lives inside the parent container.
		const builderChildren = Array.from(
			el.querySelectorAll( ':scope > [data-wp-builder-id]' )
		).map( ( child ) => {
			const prev         = child.previousElementSibling;
			const childStyleEl = ( prev && prev.tagName === 'STYLE' ) ? prev : null;
			return { child, childStyleEl };
		} );
		el.innerHTML = state.htmlTextareaCtrl.value;
		builderChildren.forEach( ( { child, childStyleEl } ) => {
			if ( childStyleEl ) { el.appendChild( childStyleEl ); }
			el.appendChild( child );
		} );
	}

	// ── Custom style ──────────────────────────────────────────────────────────
	const styleValue = state.styleEditor
		? state.styleEditor.codemirror.getValue()
		: ( state.styleTextareaCtrl ? state.styleTextareaCtrl.value : '' );
	// Use the element's current data-wp-builder-id (may have been updated
	// by the element-ID live preview above) as the CSS selector scope.
	const selector = '[data-wp-builder-id="' + ( el.getAttribute( 'data-wp-builder-id' ) || state.elementId ) + '"]';

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

// ---------------------------------------------------------------------------
// Change listener wiring
// ---------------------------------------------------------------------------

/**
 * Attach input/change listeners to all panel controls so that any user edit
 * triggers markDirty() and applyLivePreview(). Called once after createPanel().
 */
export function initChangeListeners() {
	const onFieldChange = () => {
		markDirty();
		applyLivePreview();
	};

	const fieldControls = [
		state.nodeSelectCtrl, state.idDisplayCtrl, state.htmlTextareaCtrl,
		state.flexDirCtrl, state.flexGrowCtrl, state.gapCtrl, state.styleTextareaCtrl,
		state.mainTitleDisplay, state.mainStatusDisplay, state.mainPageTemplateDisplay,
		state.hooksTextareaCtrl,
	];
	fieldControls.forEach( ( ctrl ) => {
		if ( ! ctrl ) { return; }
		ctrl.addEventListener( 'input',  onFieldChange );
		ctrl.addEventListener( 'change', onFieldChange );
	} );

	// CodeMirror fires its own change event (not a DOM input event).
	if ( state.styleEditor ) {
		state.styleEditor.codemirror.on( 'change', () => {
			if ( state.styleEditorSuppressChange ) { return; }
			markDirty();
			applyLivePreview();
		} );
	}
	if ( state.hooksEditor ) {
		state.hooksEditor.codemirror.on( 'change', () => {
			markDirty();
		} );
	}
}
