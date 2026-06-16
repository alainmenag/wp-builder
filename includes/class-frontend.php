<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Frontend
 *
 * Handles public-facing output: shortcodes, frontend asset enqueueing,
 * and filtering post content to render builder layouts.
 */
trait WP_Builder_Frontend {

	public function register_shortcodes(): void {
		add_shortcode( 'wp_builder_template', array( $this, 'render_template_shortcode' ) );
		add_shortcode( 'wp_builder_content', array( $this, 'render_content_shortcode' ) );
	}

	public function render_template_shortcode( array $atts ): string {
		$atts    = shortcode_atts( array( 'id' => 0 ), $atts, 'wp_builder_template' );
		$post_id = absint( $atts['id'] );

		if ( ! $post_id ) {
			return '';
		}

		$post = get_post( $post_id );
		if ( ! $post || self::TEMPLATE_CPT !== $post->post_type || 'publish' !== $post->post_status ) {
			return '';
		}

		if ( ! $this->has_builder_layout( $post_id ) ) {
			return '';
		}

		$this->enqueue_frontend_style();

		return $this->render_element( $this->get_layout_root_element( $post_id ), 'wp-builder-page wp-builder-template' );
	}

	public function render_content_shortcode( array $atts ): string {
		$atts    = shortcode_atts( array( 'id' => 0 ), $atts, 'wp_builder_content' );
		$post_id = absint( $atts['id'] );

		if ( ! $post_id ) {
			return '';
		}

		$post = get_post( $post_id );
		if ( ! $post || ! $this->is_supported_post_type( $post->post_type ) || 'publish' !== $post->post_status ) {
			return '';
		}

		if ( ! $this->has_builder_layout( $post_id ) ) {
			return '';
		}

		$this->enqueue_frontend_style();

		return $this->render_element( $this->get_layout_root_element( $post_id ), 'wp-builder-page wp-builder-shortcode' );
	}

	public function enqueue_frontend_assets(): void {
		if ( is_admin() || ! is_singular( $this->supported_post_types() ) ) {
			return;
		}

		$post_id = get_queried_object_id();
		if ( ! $post_id || ! $this->has_builder_layout( $post_id ) ) {
			return;
		}

		if ( ! $this->is_builder_page_template( $post_id ) ) {
			return;
		}

		$this->enqueue_frontend_style();
	}

	public function render_builder_content( string $content ): string {
		if ( is_admin() || ! is_singular( $this->supported_post_types() ) || ! in_the_loop() || ! is_main_query() ) {
			return $content;
		}

		$post_id = get_the_ID();
		if ( ! $post_id || ! $this->has_builder_layout( $post_id ) ) {
			return $content;
		}

		if ( ! $this->is_builder_page_template( $post_id ) ) {
			return $content;
		}

		return $this->render_element( $this->get_layout_root_element( $post_id ), 'wp-builder-page' );
	}

	private function enqueue_frontend_style(): void {
		wp_enqueue_style(
			'wp-builder-frontend',
			WP_BUILDER_URL . 'assets/frontend.css',
			array(),
			self::VERSION
		);
	}

	private function get_layout_root_element( int $post_id ): array {
		$layout = $this->get_layout( $post_id );
		return isset( $layout['children'][0] ) && is_array( $layout['children'][0] ) ? $layout['children'][0] : array();
	}
}
