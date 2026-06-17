<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Editor_Schema
 *
 * Builds the tab/accordion/field descriptor tree that drives the editor left panel.
 */
trait WP_Builder_Editor_Schema {

	/**
	 * Build the full tab/accordion schema for the editor left panel.
	 *
	 * Each tab entry:
	 *   'key'        string    Logical tab name; emitted as data-tab-key on the button.
	 *   'id'         string    DOM id for the tab panel element.
	 *   'label'      string    Translated display label.
	 *   'accordions' array     Ordered list of accordion definitions.
	 *
	 * Each accordion entry:
	 *   'slug'   string    Appended to 'wp-builder-accordion-' to form the DOM id.
	 *   'label'  string    Translated display label.
	 *   'open'   bool      Whether the accordion starts expanded.
	 *   'fields' array     Ordered list of field descriptors (see render_field_group()).
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

		// Build the Settings accordion fields; Page Layout is conditional.
		$settings_fields = array(
			array(
				'type'  => 'text',
				'id'    => 'wp-builder-post-title',
				'label' => __( 'Title', 'wp-builder' ),
				'value' => get_the_title( $post_id ),
			),
			array(
				'type'    => 'select',
				'id'      => 'wp-builder-post-status',
				'label'   => __( 'Status', 'wp-builder' ),
				'options' => array(
					array( 'value' => 'publish', 'label' => __( 'Published', 'wp-builder' ) ),
					array( 'value' => 'draft',   'label' => __( 'Draft', 'wp-builder' ) ),
					array( 'value' => 'pending', 'label' => __( 'Pending Review', 'wp-builder' ) ),
					array( 'value' => 'private', 'label' => __( 'Private', 'wp-builder' ) ),
				),
			),
		);
		if ( $is_template ) {
			$settings_fields[] = array(
				'type'    => 'select',
				'id'      => 'wp-builder-chrome-template',
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
				'id'      => 'wp-builder-chrome-template',
				'label'   => __( 'Page Layout', 'wp-builder' ),
				'options' => $tmpl_options,
			);
		}

		// Node tag options for the Identity accordion select.
		$node_tags    = array( 'div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav',
			'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button', 'figure', 'figcaption',
			'img', 'input', 'label', 'audio', 'video', 'source', 'iframe' );
		$node_options = array_map(
			static function ( $tag ) { return array( 'value' => $tag, 'label' => $tag ); },
			$node_tags
		);

		return array(
			array(
				'key'   => 'main',
				'id'    => 'wp-builder-tab-page',
				'label' => __( 'Main', 'wp-builder' ),
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
								'type'       => 'pre',
								'wrapper_id' => 'wp-builder-embed-panel',
								'label'      => __( 'Shortcode', 'wp-builder' ),
								'content'    => $shortcode,
							),
						),
					),
					array(
						'slug'   => 'data',
						'label'  => __( 'Data', 'wp-builder' ),
						'open'   => false,
						'fields' => array(
							array(
								'type'       => 'link',
								'wrapper_id' => 'wp-builder-data-panel',
								'label'      => __( 'Export', 'wp-builder' ),
								'href'       => $export_url,
								'attrs'      => array( 'target' => '_blank', 'rel' => 'noreferrer', 'style' => 'width: 100%;' ),
							),
						),
					),
				),
			),
			array(
				'key'   => 'element',
				'id'    => 'wp-builder-tab-element',
				'label' => __( 'Element', 'wp-builder' ),
				'accordions' => array(
					array(
						'slug'   => 'identity',
						'label'  => __( 'Identity', 'wp-builder' ),
						'open'   => true,
						'fields' => array(
							array(
								'type'           => 'select',
								'id'             => 'wp-builder-node',
								'label'          => __( 'Node', 'wp-builder' ),
								'wrapper_id'     => 'wp-builder-inspector-node',
								'wrapper_hidden' => true,
								'options'        => $node_options,
							),
							array(
								'type'           => 'text',
								'id'             => 'wp-builder-node-id',
								'label'          => __( 'ID', 'wp-builder' ),
								'wrapper_id'     => 'wp-builder-inspector-id',
								'wrapper_hidden' => true,
								'placeholder'    => __( 'e.g. my-element', 'wp-builder' ),
							),
						),
					),
					array(
						'slug'   => 'content',
						'label'  => __( 'Content', 'wp-builder' ),
						'open'   => false,
						'fields' => array(
							array(
								'type'           => 'textarea',
								'id'             => 'wp-builder-html-content',
								'label'          => __( 'Content', 'wp-builder' ),
								'wrapper_id'     => 'wp-builder-inspector-editor',
								'wrapper_class'  => 'wp-builder-inspector-editor',
								'wrapper_hidden' => true,
								'attrs'          => array(
									'rows'        => '12',
									'spellcheck'  => 'false',
									'placeholder' => __( 'Enter your here…', 'wp-builder' ),
								),
							),
							array(
								'type'   => 'container',
								'id'     => 'wp-builder-inspector-node-attrs',
								'class'  => 'wp-builder-inspector-body-list',
								'hidden' => true,
								'fields' => array(),
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
								'id'      => 'wp-builder-flex-direction',
								'label'   => __( 'Direction', 'wp-builder' ),
								'options' => array(
									array( 'value' => '',       'label' => __( '— None —', 'wp-builder' ) ),
									array( 'value' => 'row',    'label' => __( 'Row', 'wp-builder' ) ),
									array( 'value' => 'column', 'label' => __( 'Column', 'wp-builder' ) ),
								),
							),
							array(
								'type'        => 'number',
								'id'          => 'wp-builder-flex-grow',
								'label'       => __( 'Flex Grow', 'wp-builder' ),
								'placeholder' => '0',
								'attrs'       => array( 'min' => '0', 'step' => '1' ),
							),
							array(
								'type'        => 'text',
								'id'          => 'wp-builder-gap',
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
								'type'      => 'textarea',
								'id'        => 'wp-builder-custom-style',
								'label'     => __( 'Custom CSS', 'wp-builder' ),
								'label_tag' => 'p',
								'hint'      => sprintf(
									/* translators: %1$s: opening code tag, %2$s: closing code tag */
									__( 'Use %1$sself%2$s to target this element.', 'wp-builder' ),
									'<code>',
									'</code>'
								),
								'attrs'     => array(
									'rows'        => '8',
									'spellcheck'  => 'false',
									'placeholder' => "self {\n  background-color: red;\n}",
								),
							),
						),
					),
				),
			),
		);
	}
}
