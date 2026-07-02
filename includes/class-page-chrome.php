<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Page_Chrome
 *
 * Registers custom page layouts and routes template requests to
 * the appropriate plugin template file.
 */
trait WP_Builder_Page_Chrome {

	public function register_page_templates( array $templates, $theme, $post, string $post_type ): array {
		$templates['wp-builder-canvas']     = __( 'Builder Canvas Layout', 'wp-builder' );
		$templates['wp-builder-full-width'] = __( 'Builder Full Width Layout', 'wp-builder' );
		return $templates;
	}

	public function maybe_use_builder_template( string $template ): string {
		if ( is_singular() ) {
			$post_id       = get_queried_object_id();
			$post          = get_post( $post_id );
			$page_template = get_post_meta( $post_id, '_wp_page_template', true );

			$canvas     = WP_BUILDER_DIR . 'templates/wp-builder-canvas.php';
			$full_width = WP_BUILDER_DIR . 'templates/wp-builder-full-width.php';

			// Custom builder templates always use the Builder Canvas template.
			if ( $post && self::TEMPLATE_CPT === $post->post_type ) {
				if ( file_exists( $canvas ) ) {
					return $canvas;
				}
			}

			if ( 'wp-builder-canvas' === $page_template ) {
				if ( file_exists( $canvas ) ) {
					return $canvas;
				}
			}
			if ( 'wp-builder-full-width' === $page_template ) {
				if ( file_exists( $full_width ) ) {
					return $full_width;
				}
			}
		}
		return $template;
	}

	private function is_builder_page_template( int $post_id ): bool {
		$post = get_post( $post_id );
		if ( $post && self::TEMPLATE_CPT === $post->post_type ) {
			return true;
		}
		$template = get_post_meta( $post_id, '_wp_page_template', true );
		return 'wp-builder-canvas' === $template || 'wp-builder-full-width' === $template;
	}

	private function get_available_page_templates( int $post_id ): array {
		$post = get_post( $post_id );
		if ( ! $post || self::TEMPLATE_CPT === $post->post_type ) {
			return array();
		}
		$templates = wp_get_theme()->get_page_templates( $post, $post->post_type );
		return array_merge( array( 'default' => __( 'Default template', 'wp-builder' ) ), $templates );
	}
}
