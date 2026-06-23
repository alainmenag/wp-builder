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
			'element'     => $element,
			'post_title'  => get_the_title( $post_id ),
			'post_status' => get_post_status( $post_id ),
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
			'id'       => $element_id,
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

		// Re-render the full layout root with the post ID so the DOM swap
		// preserves the data-wp-builder-post-id attribute and any nested styles.
		$post      = get_post( $post_id );
		$css_class = ( $post && self::TEMPLATE_CPT === $post->post_type )
			? 'wp-builder-layout wp-builder-layout--snippet'
			: 'wp-builder-layout';
		$html      = $this->render_element( $new_children[0], $css_class, $post_id );

		wp_send_json_success(
			array(
				'element' => $sanitized,
				'html'    => $html,
			)
		);
	}

	// -------------------------------------------------------------------------
	// Helpers — recursive element search / replace
	// -------------------------------------------------------------------------

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
