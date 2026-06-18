<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Ajax
 *
 * Handles AJAX endpoints: saving the layout and updating the post title.
 */
trait WP_Builder_Ajax {

	/**
	 * Resolve and validate the post from the current AJAX request.
	 *
	 * Reads `$_POST['post_id']`, verifies the post exists, belongs to a
	 * supported post type, and that the current user can edit it.
	 * Terminates with a JSON error response if any check fails.
	 *
	 * @param string $permission_error Error message used for the 403 response.
	 * @return WP_Post The resolved, editable post.
	 */
	private function resolve_ajax_post( string $permission_error ): WP_Post {
		$post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- nonce verified by caller before resolve_ajax_post() is called.
		$post    = $post_id ? get_post( $post_id ) : null;

		if ( ! $post || ! $this->is_supported_post_type( $post->post_type ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Unsupported post type.', 'wp-builder' ) ),
				400
			);
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			wp_send_json_error(
				array( 'message' => $permission_error ),
				403
			);
		}

		return $post;
	}

	public function ajax_update_title(): void {
		check_ajax_referer( self::TITLE_NONCE_ACTION, 'nonce' );

		$post    = $this->resolve_ajax_post( __( 'You do not have permission to edit this post.', 'wp-builder' ) );
		$post_id = $post->ID;

		$title = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';

		wp_update_post(
			array(
				'ID'         => $post_id,
				'post_title' => $title,
			)
		);

		wp_send_json_success(
			array(
				'title'      => get_the_title( $post_id ),
				'docTitle'   => $this->get_builder_doc_title( $post_id ),
				'previewUrl' => $this->get_preview_url( $post_id ),
			)
		);
	}

	public function ajax_save_layout(): void {
		check_ajax_referer( self::NONCE_ACTION, 'nonce' );

		$post    = $this->resolve_ajax_post( __( 'You do not have permission to save this layout.', 'wp-builder' ) );
		$post_id = $post->ID;

		// WordPress always runs wp_magic_quotes() which addslashes() every $_POST value.
		// Unslash first so that JSON escape sequences (e.g. \n for newlines) survive json_decode intact.
		$layout_raw = isset( $_POST['layout'] ) ? wp_unslash( (string) $_POST['layout'] ) : '';
		$decoded    = json_decode( $layout_raw, true );

		if ( ! is_array( $decoded ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Invalid layout data.', 'wp-builder' ) ),
				400
			);
		}

		$layout = $this->sanitize_layout( $decoded );
		// wp_slash() is required because update_post_meta calls wp_unslash() internally before storing.
		// Without it, JSON escape sequences like \n (backslash + n) lose their backslash and become just "n".
		update_post_meta( $post_id, self::META_KEY, wp_slash( wp_json_encode( $layout ) ) );

		$allowed_statuses = array( 'publish', 'draft', 'pending', 'private' );
		$new_status       = isset( $_POST['post_status'] ) ? sanitize_key( wp_unslash( $_POST['post_status'] ) ) : '';

		if ( $new_status && in_array( $new_status, $allowed_statuses, true ) && $new_status !== $post->post_status ) {
			$can_change = true;
			if ( in_array( $new_status, array( 'publish', 'private' ), true ) ) {
				$can_change = current_user_can( 'publish_post', $post_id );
			}
			if ( $can_change ) {
				wp_update_post(
					array(
						'ID'          => $post_id,
						'post_status' => $new_status,
					)
				);
				$post = get_post( $post_id );
			}
		}

		// Deferred title update — applied when the user clicks Save.
		$new_title = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';
		if ( $new_title !== '' ) {
			wp_update_post( array( 'ID' => $post_id, 'post_title' => $new_title ) );
			$post = get_post( $post_id );
		}

		// Page template update (not applicable to builder templates themselves).
		$is_template = $post && self::TEMPLATE_CPT === $post->post_type;
		if ( ! $is_template && isset( $_POST['page_template'] ) ) {
			$page_template_value = sanitize_text_field( wp_unslash( $_POST['page_template'] ) );
			update_post_meta( $post_id, '_wp_page_template', $page_template_value );
		}

		wp_send_json_success(
			array(
				'layout'          => $layout,
				'postStatus'      => $post ? $post->post_status : 'draft',
				'postTitle'       => get_the_title( $post_id ),
				'docTitle'        => $this->get_builder_doc_title( $post_id ),
				'previewUrl'      => $this->get_preview_url( $post_id ),
				'pageTemplate'    => $is_template ? 'wp-builder-canvas' : ( get_post_meta( $post_id, '_wp_page_template', true ) ?: 'wp-builder-canvas' ),
				'renderedContent' => $this->render_element( $this->get_layout_root_element( $post_id ), 'wp-builder-layout', $post_id ),
				'message'         => __( 'Layout saved.', 'wp-builder' ),
			)
		);
	}
}
