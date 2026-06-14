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
	}

	public function register_template_post_type(): void {
		register_post_type(
			self::TEMPLATE_CPT,
			array(
				'label'               => __( 'Builder Templates', 'wp-builder' ),
				'labels'              => array(
					'name'               => __( 'Builder Templates', 'wp-builder' ),
					'singular_name'      => __( 'Builder Template', 'wp-builder' ),
					'add_new'            => __( 'Add New', 'wp-builder' ),
					'add_new_item'       => __( 'Add New Template', 'wp-builder' ),
					'edit_item'          => __( 'Edit Template', 'wp-builder' ),
					'new_item'           => __( 'New Template', 'wp-builder' ),
					'view_item'          => __( 'View Template', 'wp-builder' ),
					'search_items'       => __( 'Search Templates', 'wp-builder' ),
					'not_found'          => __( 'No templates found.', 'wp-builder' ),
					'not_found_in_trash' => __( 'No templates found in Trash.', 'wp-builder' ),
				),
				'public'              => false,
				'publicly_queryable'  => true,
				'show_ui'             => true,
				'show_in_menu'        => false,
				'show_in_rest'        => false,
				'supports'            => array( 'title' ),
				'capability_type'     => 'post',
				'map_meta_cap'        => true,
				'rewrite'             => array( 'slug' => 'wp_builder_template', 'with_front' => false ),
			)
		);
	}

	public function maybe_flush_rewrite_rules(): void {
		if ( get_option( self::REWRITE_VERSION_OPTION ) !== self::REWRITE_VERSION ) {
			flush_rewrite_rules( false );
			update_option( self::REWRITE_VERSION_OPTION, self::REWRITE_VERSION );
		}
	}
}
