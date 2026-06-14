<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Elementor
 *
 * Integrates with Elementor: registers the Builder Template widget
 * and enqueues editor styles.
 */
trait WP_Builder_Elementor {

	public function register_elementor_widget( $widgets_manager ): void {
		if ( ! did_action( 'elementor/loaded' ) ) {
			return;
		}

		require_once WP_BUILDER_DIR . 'widgets/widget-builder-template.php';
		$widgets_manager->register( new \WP_Builder_Template_Widget() );
	}

	public function enqueue_elementor_editor_styles(): void {
		wp_enqueue_style(
			'wp-builder-elementor-editor',
			WP_BUILDER_URL . 'assets/elementor-editor.css',
			array(),
			self::VERSION
		);
	}
}
