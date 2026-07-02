/**
 * CodeMirror initialisation — style textarea and hooks textarea editors.
 *
 * Import graph: state ← code-editors
 */

import { state } from './state.js';

/**
 * Initialise CodeMirror on the style textarea if wp.codeEditor is available.
 * Falls back to a plain textarea when the library is absent.
 * Must be called after state.styleTextareaCtrl has been set by createPanel().
 */
export function initStyleEditor() {
	if ( ! state.styleTextareaCtrl ) { return; }

	if ( window.wp && window.wp.codeEditor ) {
		state.styleEditor = window.wp.codeEditor.initialize( state.styleTextareaCtrl, {
			codemirror: {
				mode:              'css',
				autoCloseBrackets: true,
				matchBrackets:     true,
				placeholder:       state.styleTextareaCtrl.placeholder || '',
			},
		} );
	}
	// When CodeMirror is absent the textarea value is read directly, so no
	// additional listener is needed.
}

/**
 * Initialise CodeMirror on the hooks textarea with autocompletion for
 * predefined hook locations (from config.hookLocations) and priority values.
 * Falls back to a plain textarea when wp.codeEditor is unavailable.
 * Must be called after state.hooksTextareaCtrl has been set by createPanel().
 */
export function initHooksEditor() {
	if ( ! state.hooksTextareaCtrl ) { return; }
	if ( ! window.wp || ! window.wp.codeEditor ) { return; }

	const hookSlugs     = ( ( state.config && state.config.hookLocations ) || [] ).filter( Boolean );
	const prioritySlugs = [ '1', '5', '10', '20', '50', '100' ];
	const CM            = window.wp.CodeMirror;

	function hooksHint( cm ) {
		const cursor  = cm.getCursor();
		const line    = cm.getLine( cursor.line );
		const before  = line.slice( 0, cursor.ch );
		const pipePos = before.indexOf( '|' );

		if ( pipePos === -1 ) {
			// Suggest hook names.
			const token = before.trim();
			const list  = hookSlugs.filter( ( s ) => s.startsWith( token ) );
			return {
				list,
				from: CM.Pos( cursor.line, cursor.ch - token.length ),
				to:   cursor,
			};
		}

		// Suggest priorities.
		const token = before.slice( pipePos + 1 );
		const list  = prioritySlugs.filter( ( s ) => s.startsWith( token ) );
		return {
			list,
			from: CM.Pos( cursor.line, pipePos + 1 ),
			to:   cursor,
		};
	}

	state.hooksEditor = window.wp.codeEditor.initialize( state.hooksTextareaCtrl, {
		codemirror: {
			mode:         'text/plain',
			lineWrapping: false,
			extraKeys:    { 'Ctrl-Space': function( cm ) { cm.showHint( { hint: hooksHint, completeSingle: false } ); } },
			placeholder:  state.hooksTextareaCtrl.placeholder || '',
		},
	} );

	state.hooksEditor.codemirror.on( 'inputRead', function( cm ) {
		if ( cm.state.completionActive ) { return; }
		cm.showHint( { hint: hooksHint, completeSingle: false } );
	} );
}
