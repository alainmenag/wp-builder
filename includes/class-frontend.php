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
		add_shortcode( 'wp_builder', array( $this, 'render_builder_shortcode' ) );
	}

	public function render_builder_shortcode( array $atts ): string {
		$atts    = shortcode_atts( array( 'id' => 0 ), $atts, 'wp_builder' );
		$post_id = absint( $atts['id'] );

		if ( ! $post_id ) {
			return '';
		}

		$post = get_post( $post_id );
		if ( ! $post || 'publish' !== $post->post_status ) {
			return '';
		}

		if ( self::TEMPLATE_CPT === $post->post_type ) {
			$css_classes = 'wp-builder-layout wp-builder-layout--snippet';
		} elseif ( $this->is_supported_post_type( $post->post_type ) ) {
			$css_classes = 'wp-builder-layout wp-builder-layout--embed';
		} else {
			return '';
		}

		if ( ! $this->has_builder_layout( $post_id ) ) {
			return '';
		}

		$this->enqueue_frontend_style();
		$this->enqueue_editor_assets( $post_id );

		return $this->render_element( $this->get_layout_root_element( $post_id ), $css_classes, $post_id );
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
		$this->enqueue_editor_assets( $post_id );
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

		return $this->render_element( $this->get_layout_root_element( $post_id ), 'wp-builder-layout', $post_id );
	}

	private function enqueue_frontend_style(): void {
		wp_enqueue_style(
			'wp-builder-frontend',
			WP_BUILDER_URL . 'assets/frontend.css',
			array(),
			self::VERSION
		);
	}

	private function enqueue_editor_assets( int $post_id = 0 ): void {
		if ( ! is_user_logged_in() || ! current_user_can( 'edit_posts' ) ) {
			return;
		}

		// Guard against duplicate registration on pages with multiple shortcodes.
		if ( wp_script_is( 'wp-builder-editor', 'enqueued' ) ) {
			return;
		}

		// Load WordPress's bundled CodeMirror with all CSS-specific addons (hints,
		// linting, autocomplete) and populate wp.codeEditor.defaultSettings.
		// On the frontend wp_enqueue_code_editor() may not be loaded yet, so
		// require the admin file that defines it.
		if ( ! function_exists( 'wp_enqueue_code_editor' ) ) {
			require_once ABSPATH . 'wp-admin/includes/misc.php';
		}
		wp_enqueue_code_editor( array( 'type' => 'text/css' ) );

		wp_enqueue_style(
			'wp-builder-shared',
			WP_BUILDER_URL . 'assets/shared.css',
			array(),
			self::VERSION
		);

		wp_enqueue_style(
			'wp-builder-editor',
			WP_BUILDER_URL . 'assets/editor.css',
			array( 'code-editor', 'wp-builder-shared' ),
			self::VERSION
		);

		wp_enqueue_script(
			'wp-builder-editor',
			WP_BUILDER_URL . 'assets/js/editor.js',
			array( 'code-editor' ),
			self::VERSION,
			true
		);

		$post_obj    = $post_id ? get_post( $post_id ) : null;
		$is_cpt      = $post_obj && self::TEMPLATE_CPT === $post_obj->post_type;

		wp_localize_script(
			'wp-builder-editor',
			'wpBuilderEditor',
			array(
				'ajaxUrl'        => admin_url( 'admin-ajax.php' ),
				'builderBaseUrl' => admin_url( 'post.php' ),
				'getNonce'       => wp_create_nonce( self::GET_NONCE_ACTION ),
				'saveNonce'      => wp_create_nonce( self::SAVE_NONCE_ACTION ),
				'layoutNonce'    => wp_create_nonce( self::GET_LAYOUT_NONCE_ACTION ),
				'addNonce'       => wp_create_nonce( self::ADD_NONCE_ACTION ),
				'deleteNonce'    => wp_create_nonce( self::DELETE_NONCE_ACTION ),
				'isTemplate'     => is_singular( self::TEMPLATE_CPT ),
				'pageTemplate'   => ( $post_id && ! $is_cpt ) ? ( get_post_meta( $post_id, '_wp_page_template', true ) ?: 'wp-builder-canvas' ) : '',
				'pageTemplates'  => ( $post_id && ! $is_cpt ) ? $this->get_available_page_templates( $post_id ) : array(),
				'i18n'           => array(
					'identity'      => __( 'Identity', 'wp-builder' ),
					'content'       => __( 'Content', 'wp-builder' ),
					'layout'        => __( 'Layout', 'wp-builder' ),
					'style'         => __( 'Style', 'wp-builder' ),
					'attributes'    => __( 'Attributes', 'wp-builder' ),
					'save'          => __( 'Save', 'wp-builder' ),
					'unsave'        => __( 'Unsave', 'wp-builder' ),
					'unsaved'       => __( 'Unsaved', 'wp-builder' ),
					'saving'        => __( 'Saving...', 'wp-builder' ),
					'saved'         => __( 'Saved', 'wp-builder' ),
					'close'         => __( 'Close', 'wp-builder' ),
					'loading'       => __( '...', 'wp-builder' ),
					'editInBuilder' => __( 'Edit in Builder', 'wp-builder' ),
					'node'          => __( 'Node', 'wp-builder' ),
					'elementId'     => __( 'Element ID', 'wp-builder' ),
					'htmlContent'   => __( 'HTML Content', 'wp-builder' ),
					'flexDirection' => __( 'Flex Direction', 'wp-builder' ),
					'flexGrow'      => __( 'Flex Grow', 'wp-builder' ),
					'gap'           => __( 'Gap', 'wp-builder' ),
					'customStyle'    => __( 'Custom CSS', 'wp-builder' ),
					'customStyleHint' => sprintf(
						/* translators: %1$s: opening code tag, %2$s: closing code tag */
						__( 'Use %1$sself%2$s to target this element.', 'wp-builder' ),
						'<code>',
						'</code>'
					),
					'error'          => __( 'Error', 'wp-builder' ),
					'fitPage'        => __( 'Fit Page', 'wp-builder' ),
					'resetFit'       => __( 'Reset Fit', 'wp-builder' ),
					'tabMain'        => __( 'Main', 'wp-builder' ),
					'tabElement'     => __( 'Element', 'wp-builder' ),
					'postTitle'      => __( 'Title', 'wp-builder' ),
					'postStatus'     => __( 'Status', 'wp-builder' ),
					'pageLayout'     => __( 'Template', 'wp-builder' ),
					'canvasLayout'   => __( 'Canvas Layout', 'wp-builder' ),
					'statusPublish'  => __( 'Publish', 'wp-builder' ),
					'statusDraft'    => __( 'Draft', 'wp-builder' ),
					'statusPending'  => __( 'Pending Review', 'wp-builder' ),
					'statusPrivate'  => __( 'Private', 'wp-builder' ),
					'structureView'  => __( 'Structure View', 'wp-builder' ),
					'renderedView'   => __( 'Rendered View', 'wp-builder' ),
					'addChild'       => __( 'Add child element', 'wp-builder' ),
					'deleteElement'  => __( 'Delete element', 'wp-builder' ),
				),
			)
		);
	}

	private function get_layout_root_element( int $post_id ): array {
		$layout = $this->get_layout( $post_id );
		return isset( $layout['children'][0] ) && is_array( $layout['children'][0] ) ? $layout['children'][0] : array();
	}
}
