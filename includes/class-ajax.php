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

	public function ajax_update_title(): void {
		check_ajax_referer( self::TITLE_NONCE_ACTION, 'nonce' );

		$post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
		$post    = $post_id ? get_post( $post_id ) : null;

		if ( ! $post || ! $this->is_supported_post_type( $post->post_type ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Unsupported post type.', 'wp-builder' ) ),
				400
			);
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			wp_send_json_error(
				array( 'message' => __( 'You do not have permission to edit this post.', 'wp-builder' ) ),
				403
			);
		}

		$title = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';

		wp_update_post(
			array(
				'ID'         => $post_id,
				'post_title' => $title,
			)
		);

		$is_template = self::TEMPLATE_CPT === $post->post_type;
		$preview_url = $is_template ? get_preview_post_link( $post_id ) : get_permalink( $post_id );

		wp_send_json_success(
			array(
				'title'      => get_the_title( $post_id ),
				'docTitle'   => sprintf(
					/* translators: %s: post title. */
					__( 'Builder: %s', 'wp-builder' ),
					get_the_title( $post_id )
				),
				'previewUrl' => $preview_url,
			)
		);
	}

	public function ajax_save_layout(): void {
		check_ajax_referer( self::NONCE_ACTION, 'nonce' );

		$post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
		$post    = $post_id ? get_post( $post_id ) : null;

		if ( ! $post || ! $this->is_supported_post_type( $post->post_type ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Unsupported post type.', 'wp-builder' ) ),
				400
			);
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			wp_send_json_error(
				array( 'message' => __( 'You do not have permission to save this layout.', 'wp-builder' ) ),
				403
			);
		}

		$layout_raw = isset( $_POST['layout'] ) ? (string) $_POST['layout'] : '';
		// Try raw first (no magic-quotes): JSON \n stays intact as a real newline.
		// Fall back to wp_unslash() only when magic-quotes are active (json_decode fails on escaped quotes).
		$decoded = json_decode( $layout_raw, true );
		if ( ! is_array( $decoded ) ) {
			$decoded = json_decode( wp_unslash( $layout_raw ), true );
		}

		if ( ! is_array( $decoded ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Invalid layout data.', 'wp-builder' ) ),
				400
			);
		}

		$layout = $this->sanitize_layout( $decoded );
		update_post_meta( $post_id, self::META_KEY, wp_json_encode( $layout ) );

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

		$preview_url = $is_template ? get_preview_post_link( $post_id ) : get_permalink( $post_id );

		wp_send_json_success(
			array(
				'layout'       => $layout,
				'postStatus'   => $post ? $post->post_status : 'draft',
				'postTitle'    => get_the_title( $post_id ),
				'docTitle'     => sprintf(
					/* translators: %s: post title. */
					__( 'Builder: %s', 'wp-builder' ),
					get_the_title( $post_id )
				),
				'previewUrl'   => $preview_url,
				'pageTemplate' => get_post_meta( $post_id, '_wp_page_template', true ) ?: 'default',
				'message'      => __( 'Layout saved.', 'wp-builder' ),
			)
		);
	}
}
