<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Ajax_Frontend
 *
 * Provides two AJAX endpoints used by the front-end element quick-editor:
 *   - wp_builder_get_element  — fetch a single element's data by ID.
 *   - wp_builder_save_element — update a single element and re-render the layout.
 */
trait WP_Builder_Ajax_Frontend {

	// -------------------------------------------------------------------------
	// AJAX: get element
	// -------------------------------------------------------------------------

	public function ajax_get_element(): void {
		check_ajax_referer( self::FRONTEND_GET_NONCE_ACTION, 'nonce' );

		$post_id    = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
		$element_id = isset( $_POST['element_id'] ) ? sanitize_key( wp_unslash( $_POST['element_id'] ) ) : '';

		if ( ! $post_id || ! $element_id ) {
			wp_send_json_error( array( 'message' => __( 'Invalid request.', 'wp-builder' ) ), 400 );
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			wp_send_json_error( array( 'message' => __( 'You do not have permission to edit this post.', 'wp-builder' ) ), 403 );
		}

		$layout  = $this->get_layout( $post_id );
		$element = $this->find_layout_element( $layout['children'], $element_id );

		if ( null === $element ) {
			wp_send_json_error( array( 'message' => __( 'Element not found.', 'wp-builder' ) ), 404 );
		}

		wp_send_json_success( array(
			'element'       => $element,
			'post_title'    => get_the_title( $post_id ),
			'post_status'   => get_post_status( $post_id ),
			'page_template' => $this->get_frontend_page_template( $post_id ),
		) );
	}

	// -------------------------------------------------------------------------
	// AJAX: save element
	// -------------------------------------------------------------------------

	public function ajax_save_element(): void {
		check_ajax_referer( self::FRONTEND_SAVE_NONCE_ACTION, 'nonce' );

		$post_id    = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
		$element_id = isset( $_POST['element_id'] ) ? sanitize_key( wp_unslash( $_POST['element_id'] ) ) : '';

		if ( ! $post_id || ! $element_id ) {
			wp_send_json_error( array( 'message' => __( 'Invalid request.', 'wp-builder' ) ), 400 );
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			wp_send_json_error( array( 'message' => __( 'You do not have permission to edit this post.', 'wp-builder' ) ), 403 );
		}

		$layout  = $this->get_layout( $post_id );
		$element = $this->find_layout_element( $layout['children'], $element_id );

		if ( null === $element ) {
			wp_send_json_error( array( 'message' => __( 'Element not found.', 'wp-builder' ) ), 404 );
		}

		// Resolve the new element ID — use the submitted value if valid, else keep the original.
		$new_element_id = isset( $_POST['new_element_id'] ) ? sanitize_key( wp_unslash( $_POST['new_element_id'] ) ) : '';
		if ( '' === $new_element_id ) {
			$new_element_id = $element_id;
		}
		// Reject if the requested ID is already used by a different element.
		if ( $new_element_id !== $element_id ) {
			$collision = $this->find_layout_element( $layout['children'], $new_element_id );
			if ( null !== $collision ) {
				wp_send_json_error( array( 'message' => __( 'An element with that ID already exists.', 'wp-builder' ) ), 409 );
			}
		}

		// Decode JSON-encoded props / attrs sent as serialized strings.
		$raw_props = array();
		if ( isset( $_POST['props'] ) ) {
			$decoded   = json_decode( wp_unslash( (string) $_POST['props'] ), true );
			$raw_props = is_array( $decoded ) ? $decoded : array();
		}

		$raw_attrs = array();
		if ( isset( $_POST['attrs'] ) ) {
			$decoded   = json_decode( wp_unslash( (string) $_POST['attrs'] ), true );
			$raw_attrs = is_array( $decoded ) ? $decoded : array();
		}

		$updated = array(
			'id'       => $new_element_id,
			'node'     => isset( $_POST['node'] ) ? sanitize_key( wp_unslash( $_POST['node'] ) ) : $element['node'],
			'props'    => $raw_props,
			'style'    => isset( $_POST['style'] ) ? wp_unslash( (string) $_POST['style'] ) : '',
			'content'  => isset( $_POST['content'] ) ? wp_unslash( (string) $_POST['content'] ) : '',
			'attrs'    => $raw_attrs,
			// Preserve the existing children — the quick-editor only edits element properties.
			'children' => isset( $element['children'] ) ? $element['children'] : array(),
		);

		$sanitized    = $this->sanitize_element( $updated );
		$new_children = $this->replace_layout_element( $layout['children'], $element_id, $sanitized );

		$layout['children'] = $new_children;
		// wp_slash() is required because update_post_meta calls wp_unslash() internally.
		update_post_meta( $post_id, self::META_KEY, wp_slash( wp_json_encode( $layout ) ) );

		// Update post status if supplied and allowed.
		$allowed_statuses = array( 'publish', 'draft', 'pending', 'private' );
		$new_status       = isset( $_POST['post_status'] ) ? sanitize_key( wp_unslash( $_POST['post_status'] ) ) : '';
		$post             = get_post( $post_id );

		if ( $new_status && in_array( $new_status, $allowed_statuses, true ) && $post && $new_status !== $post->post_status ) {
			$can_change = true;
			if ( in_array( $new_status, array( 'publish', 'private' ), true ) ) {
				$can_change = current_user_can( 'publish_post', $post_id );
			}
			if ( $can_change ) {
				wp_update_post( array( 'ID' => $post_id, 'post_status' => $new_status ) );
				$post = get_post( $post_id );
			}
		}

		// Update post title if supplied.
		$new_title = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';
		if ( $new_title !== '' ) {
			wp_update_post( array( 'ID' => $post_id, 'post_title' => $new_title ) );
			$post = get_post( $post_id );
		}

		// Update page template if supplied (not applicable to snippet CPT).
		$post_for_type = get_post( $post_id );
		$is_cpt        = $post_for_type && self::TEMPLATE_CPT === $post_for_type->post_type;
		if ( ! $is_cpt && isset( $_POST['page_template'] ) ) {
			$page_template_value = sanitize_text_field( wp_unslash( $_POST['page_template'] ) );
			update_post_meta( $post_id, '_wp_page_template', $page_template_value );
		}

		// Re-render the full layout root with the post ID so the DOM swap
		// preserves the data-wp-builder-post-id attribute and any nested styles.
		$post_obj  = $post instanceof WP_Post ? $post : get_post( $post_id );
		$css_class = ( $post_obj && self::TEMPLATE_CPT === $post_obj->post_type )
			? 'wp-builder-layout wp-builder-layout--snippet'
			: 'wp-builder-layout';
		$html      = $this->render_element( $new_children[0], $css_class, $post_id );

		wp_send_json_success(
			array(
				'element'       => $sanitized,
				'html'          => $html,
				'post_title'    => get_the_title( $post_id ),
				'post_status'   => $post_obj ? $post_obj->post_status : '',
				'page_template' => $this->get_frontend_page_template( $post_id ),
			)
		);
	}

	// -------------------------------------------------------------------------
	// Helpers — recursive element search / replace
	// -------------------------------------------------------------------------

	/**
	 * Return the active page template slug for a post, or an empty string for
	 * snippet CPTs (which always use the canvas template).
	 *
	 * @param int $post_id Post ID.
	 * @return string Page template slug or empty string.
	 */
	private function get_frontend_page_template( int $post_id ): string {
		$post = get_post( $post_id );
		if ( $post && self::TEMPLATE_CPT === $post->post_type ) {
			return 'wp-builder-canvas';
		}
		return get_post_meta( $post_id, '_wp_page_template', true ) ?: '';
	}

	private function find_layout_element( array $elements, string $id ): ?array {
		foreach ( $elements as $element ) {
			if ( ! is_array( $element ) || ! isset( $element['id'] ) ) {
				continue;
			}
			if ( $element['id'] === $id ) {
				return $element;
			}
			if ( ! empty( $element['children'] ) ) {
				$found = $this->find_layout_element( $element['children'], $id );
				if ( null !== $found ) {
					return $found;
				}
			}
		}
		return null;
	}

	private function replace_layout_element( array $elements, string $id, array $replacement ): array {
		$result = array();
		foreach ( $elements as $element ) {
			if ( ! is_array( $element ) || ! isset( $element['id'] ) ) {
				$result[] = $element;
				continue;
			}
			if ( $element['id'] === $id ) {
				$result[] = $replacement;
			} else {
				if ( ! empty( $element['children'] ) ) {
					$element['children'] = $this->replace_layout_element( $element['children'], $id, $replacement );
				}
				$result[] = $element;
			}
		}
		return $result;
	}
}
