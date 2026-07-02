<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Post_Types
 *
 * Registers post meta, the template custom post type, and manages rewrite rules.
 */
trait WP_Builder_Post_Types {

	public function register_meta(): void {
		foreach ( $this->supported_post_types() as $post_type ) {
			register_post_meta(
				$post_type,
				self::META_KEY,
				array(
					'type'              => 'string',
					'single'            => true,
					'show_in_rest'      => false,
					'sanitize_callback' => 'sanitize_textarea_field',
					'auth_callback'     => static function ( $allowed, string $meta_key, int $post_id ): bool {
						return current_user_can( 'edit_post', $post_id );
					},
				)
			);
		}

		// Hook name and priority are only relevant for snippet CPTs.
		$hook_auth = static function ( $allowed, string $meta_key, int $post_id ): bool {
			return current_user_can( 'edit_post', $post_id );
		};

		register_post_meta(
			self::TEMPLATE_CPT,
			self::HOOK_NAME_META_KEY,
			array(
				'type'              => 'string',
				'single'            => true,
				'show_in_rest'      => false,
				'sanitize_callback' => 'sanitize_key',
				'auth_callback'     => $hook_auth,
			)
		);

		register_post_meta(
			self::TEMPLATE_CPT,
			self::HOOK_PRIORITY_META_KEY,
			array(
				'type'              => 'integer',
				'single'            => true,
				'show_in_rest'      => false,
				'sanitize_callback' => 'absint',
				'auth_callback'     => $hook_auth,
			)
		);

		register_post_meta(
			self::TEMPLATE_CPT,
			self::HOOKS_META_KEY,
			array(
				'type'              => 'string',
				'single'            => true,
				'show_in_rest'      => false,
				'sanitize_callback' => 'sanitize_textarea_field',
				'auth_callback'     => $hook_auth,
			)
		);
	}

	public function register_template_post_type(): void {
		register_post_type(
			self::TEMPLATE_CPT,
			array(
				'label'               => __( 'Builder', 'wp-builder' ),
				'labels'              => array(
					'name'               => __( 'List', 'wp-builder' ),
					'singular_name'      => __( 'Item', 'wp-builder' ),
					'add_new'            => __( 'Add New', 'wp-builder' ),
					'add_new_item'       => __( 'Add New Snippet', 'wp-builder' ),
					'edit_item'          => __( 'Edit Snippet', 'wp-builder' ),
					'new_item'           => __( 'New Snippet', 'wp-builder' ),
					'view_item'          => __( 'View', 'wp-builder' ),
					'search_items'       => __( 'Search', 'wp-builder' ),
					'not_found'          => __( 'Nothing found.', 'wp-builder' ),
					'not_found_in_trash' => __( 'Nothing found in Trash.', 'wp-builder' ),
				),
				'public'              => false,
				'publicly_queryable'  => true,
				'show_ui'             => true,
				'show_in_menu'        => false,
				'show_in_rest'        => false,
				'supports'            => array( 'title' ),
				'capability_type'     => 'post',
				'map_meta_cap'        => true,
				'rewrite'             => false,
			)
		);
	}

	public function maybe_flush_rewrite_rules(): void {
		if ( get_option( self::REWRITE_VERSION_OPTION ) !== self::REWRITE_VERSION ) {
			flush_rewrite_rules( false );
			update_option( self::REWRITE_VERSION_OPTION, self::REWRITE_VERSION );
		}
	}

	public function maybe_redirect_template_frontend(): void {
		if ( ! is_singular( self::TEMPLATE_CPT ) ) {
			return;
		}

		$post_id = get_queried_object_id();
		if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		wp_safe_redirect( $this->get_builder_url( $post_id ) );
		exit;
	}

	public function template_post_type_link( string $url, WP_Post $post ): string {
		if ( self::TEMPLATE_CPT !== $post->post_type ) {
			return $url;
		}

		return add_query_arg(
			array(
				'post_type' => self::TEMPLATE_CPT,
				'p'         => $post->ID,
			),
			home_url( '/' )
		);
	}
}
