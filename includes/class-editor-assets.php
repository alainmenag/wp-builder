<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Editor_Assets
 *
 * Handles enqueueing of all assets required by the full-screen builder editor,
 * and localising the wpBuilder JS configuration object.
 */
trait WP_Builder_Editor_Assets {

	private function enqueue_builder_assets( int $post_id ): void {
		$asset_url = WP_BUILDER_URL . 'assets/';
		$ctx       = $this->get_post_context( $post_id );

		// Load WordPress's bundled CodeMirror for the CSS editor (available since WP 4.9).
		wp_enqueue_style( 'code-editor' );
		wp_enqueue_script( 'code-editor' );

		wp_enqueue_style(
			'wp-builder-admin',
			$asset_url . 'admin.css',
			array( 'code-editor' ),
			self::VERSION
		);

		wp_enqueue_script(
			'wp-builder-admin',
			$asset_url . 'js/editor.js',
			array( 'code-editor' ),
			self::VERSION,
			true
		);

		wp_localize_script(
			'wp-builder-admin',
			'wpBuilder',
			array(
				'ajaxUrl'    => admin_url( 'admin-ajax.php' ),
				'nonce'      => wp_create_nonce( self::NONCE_ACTION ),
				'titleNonce' => wp_create_nonce( self::TITLE_NONCE_ACTION ),
				'postId'     => $post_id,
				'postTitle'  => get_the_title( $post_id ),
				'isTemplate' => $ctx['is_template'],
				'postStatus' => $ctx['post_status'],
				'layout'     => $this->get_layout( $post_id ),
				'editUrl'    => get_edit_post_link( $post_id, '' ),
				'previewUrl' => $ctx['preview_url'],
				'pageTemplate'  => $ctx['current_template'],
				'pageTemplates' => $ctx['page_templates'],
				'i18n'       => array(
					'addContainer'    => __( 'Container', 'wp-builder' ),
					'delete'          => __( 'Delete', 'wp-builder' ),
					'emptyContainer'  => __( 'Empty container', 'wp-builder' ),
					'saved'           => __( 'Saved', 'wp-builder' ),
					'saving'          => __( 'Saving...', 'wp-builder' ),
					'selected'        => __( 'Selected', 'wp-builder' ),
					'unsaved'         => __( 'Unsaved changes', 'wp-builder' ),
					'statusPublished' => __( 'Published', 'wp-builder' ),
					'statusDraft'     => __( 'Draft', 'wp-builder' ),
					'statusPending'   => __( 'Pending Review', 'wp-builder' ),
					'statusPrivate'   => __( 'Private', 'wp-builder' ),
				),
			)
		);
	}
}
