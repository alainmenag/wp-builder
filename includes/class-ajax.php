<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Ajax
 *
 * Provides two AJAX endpoints used by the front-end element quick-editor:
 *   - wp_builder_get_element  — fetch a single element's data by ID.
 *   - wp_builder_save_element — update a single element and re-render the layout.
 */
trait WP_Builder_Ajax {

	// -------------------------------------------------------------------------
	// AJAX: get element
	// -------------------------------------------------------------------------

	public function ajax_get_element(): void {
		check_ajax_referer( self::GET_NONCE_ACTION, 'nonce' );

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
			'layout'        => $layout,
			'post_title'    => get_the_title( $post_id ),
			'post_status'   => get_post_status( $post_id ),
			'page_template' => $this->get_page_template( $post_id ),
			'fields'        => $this->get_panel_schema( $post_id ),
		) );
	}

	// -------------------------------------------------------------------------
	// AJAX: save element
	// -------------------------------------------------------------------------

	public function ajax_save_element(): void {
		check_ajax_referer( self::SAVE_NONCE_ACTION, 'nonce' );

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
				'layout'        => $layout,
				'html'          => $html,
				'post_title'    => get_the_title( $post_id ),
				'post_status'   => $post_obj ? $post_obj->post_status : '',
				'page_template' => $this->get_page_template( $post_id ),
			)
		);
	}

	// -------------------------------------------------------------------------
	// Schema
	// -------------------------------------------------------------------------

	/**
	 * Build the tab/accordion/field schema for the front-end quick-editor panel.
	 *
	 * The shape mirrors get_panel_schema() in class-editor-schema.php so the
	 * JavaScript can use a single schema-driven renderer for both surfaces.
	 *
	 * Each tab entry:   key, label, accordions[].
	 * Each accordion:   slug, label, open, fields[].
	 * Each field:       type, id, label, and type-specific keys
	 *                   (options, placeholder, attrs, hint).
	 *
	 * Field IDs use the wpbe- prefix to match the references in
	 * editor.js (e.g. wpbe-node, wpbe-post-title).
	 *
	 * @param int $post_id Post being edited.
	 * @return array
	 */
	private function get_panel_schema( int $post_id ): array {
		$ctx              = $this->get_post_context( $post_id );
		$is_template      = $ctx['is_template'];
		$page_templates   = $ctx['page_templates'];
		$current_template = $ctx['current_template'];
		$shortcode        = '[wp_builder id=\'' . absint( $post_id ) . '\']';
		$export_url       = add_query_arg( 'view', 'json', $this->get_builder_url( $post_id ) );

		// Settings accordion fields.
		$settings_fields = array(
			array(
				'type'  => 'text',
				'id'    => 'wpbe-post-title',
				'label' => __( 'Post Title', 'wp-builder' ),
			),
			array(
				'type'    => 'select',
				'id'      => 'wpbe-post-status',
				'label'   => __( 'Post Status', 'wp-builder' ),
				'options' => array(
					array( 'value' => 'publish', 'label' => __( 'Published',      'wp-builder' ) ),
					array( 'value' => 'draft',   'label' => __( 'Draft',          'wp-builder' ) ),
					array( 'value' => 'pending', 'label' => __( 'Pending Review', 'wp-builder' ) ),
					array( 'value' => 'private', 'label' => __( 'Private',        'wp-builder' ) ),
				),
			),
		);

		if ( $is_template ) {
			$settings_fields[] = array(
				'type'    => 'select',
				'id'      => 'wpbe-page-template',
				'label'   => __( 'Page Layout', 'wp-builder' ),
				'attrs'   => array( 'disabled' => true ),
				'options' => array(
					array( 'value' => 'wp-builder-canvas', 'label' => __( 'Canvas Layout', 'wp-builder' ), 'selected' => true ),
				),
			);
		} elseif ( ! empty( $page_templates ) ) {
			$tmpl_options = array();
			foreach ( $page_templates as $tmpl_slug => $tmpl_name ) {
				$tmpl_options[] = array(
					'value'    => $tmpl_slug,
					'label'    => $tmpl_name,
					'selected' => $current_template === $tmpl_slug,
				);
			}
			$settings_fields[] = array(
				'type'    => 'select',
				'id'      => 'wpbe-page-template',
				'label'   => __( 'Page Layout', 'wp-builder' ),
				'options' => $tmpl_options,
			);
		}

		// Node tag options (same set as the full editor and constants.js).
		$node_tags    = array(
			'div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav',
			'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button',
			'figure', 'figcaption', 'img', 'input', 'label', 'audio', 'video', 'source', 'iframe',
		);
		$node_options = array_map(
			static function ( $tag ) { return array( 'value' => $tag, 'label' => $tag ); },
			$node_tags
		);

		return array(
			array(
				'key'        => 'main',
				'label'      => __( 'Main', 'wp-builder' ),
				'accordions' => array(
					array(
						'slug'   => 'settings',
						'label'  => __( 'Settings', 'wp-builder' ),
						'open'   => true,
						'fields' => $settings_fields,
					),
					array(
						'slug'   => 'shortcode',
						'label'  => __( 'Shortcode', 'wp-builder' ),
						'open'   => false,
						'fields' => array(
							array(
								'type'    => 'pre',
								'label'   => __( 'Shortcode', 'wp-builder' ),
								'content' => $shortcode,
							),
						),
					),
					array(
						'slug'   => 'data',
						'label'  => __( 'Data', 'wp-builder' ),
						'open'   => false,
						'fields' => array(
							array(
								'type'  => 'link',
								'label' => __( 'Export', 'wp-builder' ),
								'href'  => $export_url,
								'attrs' => array( 'target' => '_blank', 'rel' => 'noreferrer', 'style' => 'width: 100%;' ),
							),
						),
					),
				),
			),
			array(
				'key'        => 'element',
				'label'      => __( 'Element', 'wp-builder' ),
				'accordions' => array(
					array(
						'slug'   => 'identity',
						'label'  => __( 'Identity', 'wp-builder' ),
						'open'   => false,
						'fields' => array(
							array(
								'type'    => 'select',
								'id'      => 'wpbe-node',
								'label'   => __( 'Node', 'wp-builder' ),
								'options' => $node_options,
							),
							array(
								'type'        => 'text',
								'id'          => 'wpbe-node-id',
								'label'       => __( 'Element ID', 'wp-builder' ),
								'placeholder' => __( 'e.g. my-element', 'wp-builder' ),
							),
						),
					),
					array(
						'slug'   => 'content',
						'label'  => __( 'Content', 'wp-builder' ),
						'open'   => true,
						'fields' => array(
							array(
								'type'  => 'textarea',
								'id'    => 'wpbe-html-content',
								'label' => __( 'HTML Content', 'wp-builder' ),
								'attrs' => array( 'rows' => '8' ),
							),
						),
					),
					array(
						'slug'   => 'layout',
						'label'  => __( 'Layout', 'wp-builder' ),
						'open'   => false,
						'fields' => array(
							array(
								'type'    => 'select',
								'id'      => 'wpbe-flex-direction',
								'label'   => __( 'Flex Direction', 'wp-builder' ),
								'options' => array(
									array( 'value' => '',       'label' => __( '— None —', 'wp-builder' ) ),
									array( 'value' => 'row',    'label' => __( 'Row',      'wp-builder' ) ),
									array( 'value' => 'column', 'label' => __( 'Column',   'wp-builder' ) ),
								),
							),
							array(
								'type'        => 'number',
								'id'          => 'wpbe-flex-grow',
								'label'       => __( 'Flex Grow', 'wp-builder' ),
								'placeholder' => '0',
								'attrs'       => array( 'min' => '0', 'step' => '1' ),
							),
							array(
								'type'        => 'text',
								'id'          => 'wpbe-gap',
								'label'       => __( 'Gap', 'wp-builder' ),
								'placeholder' => __( 'e.g. 16px', 'wp-builder' ),
							),
						),
					),
					array(
						'slug'   => 'style',
						'label'  => __( 'Style', 'wp-builder' ),
						'open'   => false,
						'fields' => array(
							array(
								'type'  => 'textarea',
								'id'    => 'wpbe-custom-style',
								'label' => __( 'Custom CSS', 'wp-builder' ),
								'hint'  => sprintf(
									/* translators: %1$s: opening code tag, %2$s: closing code tag */
									__( 'Use %1$sself%2$s to target this element.', 'wp-builder' ),
									'<code>',
									'</code>'
								),
								'attrs' => array(
									'rows'        => '6',
									'placeholder' => "self {\n  background-color: red;\n}",
								),
							),
						),
					),
					array(
						'slug'   => 'attrs',
						'label'  => __( 'Attributes', 'wp-builder' ),
						'open'   => false,
						'fields' => array(),
					),
				),
			),
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
	private function get_page_template( int $post_id ): string {
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

	/**
	 * Recursively remove an element by ID from the children array.
	 * Elements that do not match are kept; their own children are also processed.
	 *
	 * @param array  $elements Source children array.
	 * @param string $id       Element ID to remove.
	 * @return array
	 */
	private function remove_layout_element( array $elements, string $id ): array {
		$result = array();
		foreach ( $elements as $element ) {
			if ( ! is_array( $element ) || ! isset( $element['id'] ) ) {
				$result[] = $element;
				continue;
			}
			if ( $element['id'] === $id ) {
				// Drop this element (do not append to $result).
				continue;
			}
			if ( ! empty( $element['children'] ) ) {
				$element['children'] = $this->remove_layout_element( $element['children'], $id );
			}
			$result[] = $element;
		}
		return $result;
	}

	// -------------------------------------------------------------------------
	// AJAX: get layout (structure-view)
	// -------------------------------------------------------------------------

	public function ajax_get_layout(): void {
		check_ajax_referer( self::GET_LAYOUT_NONCE_ACTION, 'nonce' );

		$post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;

		if ( ! $post_id ) {
			wp_send_json_error( array( 'message' => __( 'Invalid request.', 'wp-builder' ) ), 400 );
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			wp_send_json_error( array( 'message' => __( 'You do not have permission to edit this post.', 'wp-builder' ) ), 403 );
		}

		$layout = $this->get_layout( $post_id );
		wp_send_json_success( array( 'layout' => $layout ) );
	}

	// -------------------------------------------------------------------------
	// AJAX: add element (structure-view)
	// -------------------------------------------------------------------------

	public function ajax_add_element(): void {
		check_ajax_referer( self::ADD_NONCE_ACTION, 'nonce' );

		$post_id   = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
		$parent_id = isset( $_POST['parent_id'] ) ? sanitize_key( wp_unslash( $_POST['parent_id'] ) ) : '';

		if ( ! $post_id || ! $parent_id ) {
			wp_send_json_error( array( 'message' => __( 'Invalid request.', 'wp-builder' ) ), 400 );
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			wp_send_json_error( array( 'message' => __( 'You do not have permission to edit this post.', 'wp-builder' ) ), 403 );
		}

		$layout = $this->get_layout( $post_id );
		$parent = $this->find_layout_element( $layout['children'], $parent_id );

		if ( null === $parent ) {
			wp_send_json_error( array( 'message' => __( 'Parent element not found.', 'wp-builder' ) ), 404 );
		}

		$new_element = array(
			'id'       => $this->generate_element_id(),
			'node'     => 'div',
			'props'    => array( 'flexDirection' => '', 'flexGrow' => '', 'gap' => '' ),
			'style'    => '',
			'content'  => '',
			'attrs'    => array(),
			'children' => array(),
		);

		$new_element_id = $new_element['id'];

		// Append the new element to the parent's children.
		$parent['children'][] = $new_element;
		$new_children         = $this->replace_layout_element( $layout['children'], $parent_id, $parent );

		$layout['children'] = $new_children;
		update_post_meta( $post_id, self::META_KEY, wp_slash( wp_json_encode( $layout ) ) );

		// Re-render the full layout root.
		$post_obj  = get_post( $post_id );
		$css_class = ( $post_obj && self::TEMPLATE_CPT === $post_obj->post_type )
			? 'wp-builder-layout wp-builder-layout--snippet'
			: 'wp-builder-layout';
		$html = $this->render_element( $new_children[0], $css_class, $post_id );

		wp_send_json_success(
			array(
				'html'           => $html,
				'new_element_id' => $new_element_id,
				'layout'         => $layout,
			)
		);
	}

	// -------------------------------------------------------------------------
	// AJAX: delete element (structure-view)
	// -------------------------------------------------------------------------

	public function ajax_delete_element(): void {
		check_ajax_referer( self::DELETE_NONCE_ACTION, 'nonce' );

		$post_id    = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
		$element_id = isset( $_POST['element_id'] ) ? sanitize_key( wp_unslash( $_POST['element_id'] ) ) : '';

		if ( ! $post_id || ! $element_id ) {
			wp_send_json_error( array( 'message' => __( 'Invalid request.', 'wp-builder' ) ), 400 );
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			wp_send_json_error( array( 'message' => __( 'You do not have permission to edit this post.', 'wp-builder' ) ), 403 );
		}

		$layout = $this->get_layout( $post_id );

		// Guard: refuse deletion of the root element.
		if ( isset( $layout['children'][0]['id'] ) && $layout['children'][0]['id'] === $element_id ) {
			wp_send_json_error( array( 'message' => __( 'The root element cannot be deleted.', 'wp-builder' ) ), 400 );
		}

		$element = $this->find_layout_element( $layout['children'], $element_id );
		if ( null === $element ) {
			wp_send_json_error( array( 'message' => __( 'Element not found.', 'wp-builder' ) ), 404 );
		}

		$new_children       = $this->remove_layout_element( $layout['children'], $element_id );
		$layout['children'] = $new_children;
		update_post_meta( $post_id, self::META_KEY, wp_slash( wp_json_encode( $layout ) ) );

		// Re-render the full layout root.
		$post_obj  = get_post( $post_id );
		$css_class = ( $post_obj && self::TEMPLATE_CPT === $post_obj->post_type )
			? 'wp-builder-layout wp-builder-layout--snippet'
			: 'wp-builder-layout';
		$html = $this->render_element( $new_children[0], $css_class, $post_id );

		wp_send_json_success(
			array(
				'html'   => $html,
				'layout' => $layout,
			)
		);
	}
}
