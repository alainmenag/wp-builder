<?php
/**
 * Elementor widget: Builder Template
 *
 * Lets Elementor users embed any published Builder template inline.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WP_Builder_Template_Widget extends \Elementor\Widget_Base {

	public function get_name(): string {
		return 'wp_builder_template';
	}

	public function get_title(): string {
		return __( 'Builder Template', 'wp-builder' );
	}

	public function get_icon(): string {
		return 'eicon-layout-settings';
	}

	public function get_categories(): array {
		return array( 'general' );
	}

	protected function register_controls(): void {
		$this->start_controls_section(
			'section_content',
			array(
				'label' => __( 'Content', 'wp-builder' ),
				'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
			)
		);

		$templates = array( '' => __( '— Select a template —', 'wp-builder' ) );

		$query = new WP_Query(
			array(
				'post_type'      => 'wp_builder_template',
				'post_status'    => 'publish',
				'posts_per_page' => -1,
				'orderby'        => 'title',
				'order'          => 'ASC',
				'no_found_rows'  => true,
			)
		);

		foreach ( $query->posts as $post ) {
			$templates[ (string) $post->ID ] = $post->post_title;
		}

		wp_reset_postdata();

		$this->add_control(
			'template_id',
			array(
				'label'   => __( 'Template', 'wp-builder' ),
				'type'    => \Elementor\Controls_Manager::SELECT,
				'options' => $templates,
				'default' => '',
			)
		);

		$this->end_controls_section();
	}

	protected function render(): void {
		$template_id = absint( $this->get_settings_for_display( 'template_id' ) );

		if ( ! $template_id ) {
			return;
		}

		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo do_shortcode( '[wp_builder_template id="' . $template_id . '"]' );
	}
}
