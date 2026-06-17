/**
 * Navigation — tab switching, accordion open/close, and the navigate()
 * utility that other modules call to reveal a specific panel and field.
 *
 * No imports from other custom modules; all logic is pure DOM manipulation.
 */

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

/**
 * Wire click handlers on every .wp-builder-tab-btn element so that clicking
 * a button activates its associated tab panel.
 */
export function initTabs() {
	const tabBtns = document.querySelectorAll( '.wp-builder-tab-btn' );
	tabBtns.forEach( ( btn ) => {
		btn.addEventListener( 'click', () => {
			const targetId = btn.getAttribute( 'aria-controls' );
			tabBtns.forEach( ( b ) => {
				b.classList.remove( 'is-active' );
				b.setAttribute( 'aria-selected', 'false' );
			} );
			btn.classList.add( 'is-active' );
			btn.setAttribute( 'aria-selected', 'true' );
			document.querySelectorAll( '.wp-builder-tab-panel' ).forEach( ( p ) => {
				p.hidden = p.id !== targetId;
			} );
		} );
	} );
}

// ---------------------------------------------------------------------------
// Accordions
// ---------------------------------------------------------------------------

/**
 * Wire click handlers on every .wp-builder-accordion element so that only
 * one accordion within a tab panel is open at a time.
 *
 * @param {Function} getStyleEditor  Returns the active CodeMirror wrapper
 *                                   instance (or null) so the style editor
 *                                   can be refreshed when its accordion opens.
 */
export function initAccordions( getStyleEditor ) {
	const accordions = document.querySelectorAll( '.wp-builder-accordion' );
	accordions.forEach( ( accordion ) => {
		const header = accordion.querySelector( '.wp-builder-accordion-header' );
		if ( ! header ) { return; }
		header.addEventListener( 'click', () => {
			const isOpen = accordion.classList.contains( 'is-open' );

			// Scope to the nearest tab-panel ancestor so panels are independent.
			let panel = accordion.parentNode;
			while ( panel && ! panel.classList.contains( 'wp-builder-tab-panel' ) ) {
				panel = panel.parentNode;
			}
			const scope = panel
				? panel.querySelectorAll( '.wp-builder-accordion' )
				: accordions;

			scope.forEach( ( a ) => {
				a.classList.remove( 'is-open' );
				const h = a.querySelector( '.wp-builder-accordion-header' );
				if ( h ) { h.setAttribute( 'aria-expanded', 'false' ); }
			} );

			if ( ! isOpen ) {
				accordion.classList.add( 'is-open' );
				header.setAttribute( 'aria-expanded', 'true' );
				// Refresh the CodeMirror instance when its accordion is opened
				// so it renders correctly after being hidden.
				const styleEditor = getStyleEditor();
				if ( styleEditor && accordion.id === 'wp-builder-accordion-style' ) {
					styleEditor.codemirror.refresh();
				}
			}
		} );
	} );
}

// ---------------------------------------------------------------------------
// Panel navigation
// ---------------------------------------------------------------------------

/**
 * Navigate to a specific tab, accordion section, and optional form field.
 *
 * tab:     'main'     | 'element'
 * section: 'settings' | 'shortcode' | 'data'                           (main tab)
 *          'identity' | 'content'   | 'layout' | 'style' | 'attrs'    (element tab)
 * field:   id of a form element inside the accordion to focus (optional)
 *
 * @param {string}      tab      Tab key.
 * @param {string|null} section  Accordion section key (or null to skip).
 * @param {string}      [field]  Element ID to focus after opening.
 */
export function navigate( tab, section, field ) {
	const tabMap = { main: 'wp-builder-tab-page', element: 'wp-builder-tab-element' };
	const tabId  = tabMap[ tab ];
	if ( ! tabId ) { return; }

	// Activate the tab if it is not already active.
	const tabBtn = document.querySelector( '[aria-controls="' + tabId + '"]' );
	if ( tabBtn && ! tabBtn.classList.contains( 'is-active' ) ) {
		tabBtn.click();
	}

	// Open the requested accordion if it is not already open.
	if ( section ) {
		const accordion = document.getElementById( 'wp-builder-accordion-' + section );
		if ( accordion && ! accordion.classList.contains( 'is-open' ) ) {
			const accHeader = accordion.querySelector( '.wp-builder-accordion-header' );
			if ( accHeader ) { accHeader.click(); }
		}
	}

	// Focus the requested field, if provided.
	if ( field ) {
		const fieldEl = document.getElementById( field );
		if ( fieldEl ) { fieldEl.focus(); }
	}
}
