/* global wpBuilderEditorVars */
( function ( $ ) {
	'use strict';

	$( window ).on( 'elementor:init', function () {
		elementor.hooks.addAction(
			'panel/open_editor/widget/wp_builder_template',
			function ( panel, model ) {
				function syncEditLink() {
					var templateId  = model.getSetting( 'template_id' );
					var $btn        = panel.$el.find( '.wp-builder-edit-template-btn' );

					if ( templateId ) {
						$btn.attr(
							'href',
							wpBuilderEditorVars.adminUrl + 'post.php?post=' + encodeURIComponent( templateId ) + '&action=builder'
						).show();
					} else {
						$btn.hide();
					}
				}

				model.on( 'change:template_id change:use_custom_id', syncEditLink );
				syncEditLink();
			}
		);
	} );
} )( jQuery );
