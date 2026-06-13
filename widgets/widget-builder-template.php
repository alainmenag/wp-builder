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

		$admin_url = admin_url();
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

		// Toggle sits below the SELECT / TEXT input in natural DOM order.
		$this->add_control(
			'use_custom_id',
			array(
				'label'       => '',
				'type'        => \Elementor\Controls_Manager::SWITCHER,
				'label_on'    => __( '', 'wp-builder' ),
				'label_off'   => __( 'ID', 'wp-builder' ),
				'label_block' => false,
				'separator'   => 'none',
				'default'     => '',
			)
		);

		// SELECT and TEXT use label_block: false so label + input share one row.
		$this->add_control(
			'template_id',
			array(
				'label'       => __( 'Template', 'wp-builder' ),
				'type'        => \Elementor\Controls_Manager::SELECT,
				'options'     => $templates,
				'default'     => '',
				'label_block' => false,
				'condition'   => array( 'use_custom_id' => '' ),
			)
		);

		$this->add_control(
			'custom_id',
			array(
				'label'       => __( 'Template ID', 'wp-builder' ),
				'type'        => \Elementor\Controls_Manager::TEXT,
				'placeholder' => __( 'e.g. 42', 'wp-builder' ),
				'label_block' => false,
				'separator'   => 'none',
				'condition'   => array( 'use_custom_id' => 'yes' ),
			)
		);

		$this->add_control(
			'edit_template_link',
			array(
				'type'      => \Elementor\Controls_Manager::RAW_HTML,
				/* translators: link to open the selected template in the builder */
				'raw'       => '<a href="#" style="font-size:11px" onclick="var s=document.querySelector(\'#elementor-panel select[data-setting=template_id]\');if(s&&s.value)window.open(\'' . esc_js( $admin_url ) . 'post.php?post=\'+s.value+\'&action=builder\');return false;">✎ ' . esc_html__( 'Edit Template', 'wp-builder' ) . '</a>',
				// 'condition' => array( 'use_custom_id' => '' ),
				// 'condition' => array( 'use_custom_id' => '' ),
				'separator' => 'none',
			)
		);

		$this->end_controls_section();
	}

	protected function render(): void {
		$settings      = $this->get_settings_for_display();
		$use_custom_id = ! empty( $settings['use_custom_id'] ) && 'yes' === $settings['use_custom_id'];

		if ( $use_custom_id ) {
			$template_id = absint( isset( $settings['custom_id'] ) ? $settings['custom_id'] : 0 );
		} else {
			$template_id = absint( isset( $settings['template_id'] ) ? $settings['template_id'] : 0 );
		}

		if ( ! $template_id ) {
			return;
		}

		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo do_shortcode( '[wp_builder_template id="' . $template_id . '"]' );
	}
}
