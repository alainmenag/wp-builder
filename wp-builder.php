<?php
/**
 * Plugin Name: WP Builder
 * Description: A basic Elementor-style builder with infinitely nestable container elements for posts and pages.
 * Version: 0.1.0
 * Author: WP Builder
 * Text Domain: wp-builder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class WP_Builder {
	private const VERSION           = '0.1.0';
	private const META_KEY          = '_wp_builder_layout';
	private const MENU_SLUG         = 'wp-builder';
	private const ACTION            = 'builder';
	private const NONCE_ACTION      = 'wp_builder_save_layout';
	private const TITLE_NONCE_ACTION = 'wp_builder_update_title';
	private const TEMPLATE_CPT           = 'wp_builder_template';
	private const REWRITE_VERSION        = '2';
	private const REWRITE_VERSION_OPTION = 'wp_builder_rewrite_version';

	public function __construct() {
		add_action( 'init', array( $this, 'register_meta' ) );
		add_action( 'init', array( $this, 'register_template_post_type' ) );
		add_action( 'init', array( $this, 'register_shortcodes' ) );
		add_action( 'init', array( $this, 'maybe_flush_rewrite_rules' ), 20 );
		add_action( 'add_meta_boxes', array( $this, 'add_builder_meta_box' ) );
		add_action( 'admin_menu', array( $this, 'register_builder_page' ) );
		add_action( 'admin_menu', array( $this, 'register_template_menu' ) );
		add_action( 'load-post-new.php', array( $this, 'maybe_redirect_new_template' ) );
		add_action( 'load-post.php', array( $this, 'maybe_redirect_template_edit' ) );
		add_action( 'load-post.php', array( $this, 'maybe_render_builder_request' ) );
		add_action( 'wp_ajax_wp_builder_save_layout', array( $this, 'ajax_save_layout' ) );
		add_action( 'wp_ajax_wp_builder_update_title', array( $this, 'ajax_update_title' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_assets' ) );
		add_action( 'admin_bar_menu', array( $this, 'add_admin_bar_link' ), 80 );
		add_filter( 'post_row_actions', array( $this, 'add_row_action' ), 10, 2 );
		add_filter( 'page_row_actions', array( $this, 'add_row_action' ), 10, 2 );
		add_filter( self::TEMPLATE_CPT . '_row_actions', array( $this, 'add_row_action' ), 10, 2 );
		add_filter( 'the_content', array( $this, 'render_builder_content' ), 20 );
		add_filter( 'theme_page_templates', array( $this, 'register_page_templates' ), 10, 4 );
		add_filter( 'theme_post_templates', array( $this, 'register_page_templates' ), 10, 4 );
		add_filter( 'template_include', array( $this, 'maybe_use_builder_template' ) );
	}

	public function register_shortcodes(): void {
		add_shortcode( 'wp_builder_template', array( $this, 'render_template_shortcode' ) );
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

		wp_enqueue_style(
			'wp-builder-frontend',
			plugin_dir_url( __FILE__ ) . 'assets/frontend.css',
			array(),
			self::VERSION
		);

		$layout = $this->get_layout( $post_id );
		return '<div class="wp-builder-page wp-builder-template">' . $this->render_elements( $layout['elements'] ) . '</div>';
	}

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

	public function register_template_menu(): void {
		add_menu_page(
			__( 'WP Builder', 'wp-builder' ),
			__( 'WP Builder', 'wp-builder' ),
			'edit_posts',
			'wp-builder-templates',
			'__return_null',
			'dashicons-layout',
			59
		);

		add_submenu_page(
			'wp-builder-templates',
			__( 'Builder Templates', 'wp-builder' ),
			__( 'Templates', 'wp-builder' ),
			'edit_posts',
			'edit.php?post_type=' . self::TEMPLATE_CPT
		);

		add_submenu_page(
			'wp-builder-templates',
			__( 'Add New Template', 'wp-builder' ),
			__( 'Add New', 'wp-builder' ),
			'edit_posts',
			'post-new.php?post_type=' . self::TEMPLATE_CPT
		);

		// Remove the auto-generated duplicate top-level submenu entry.
		remove_submenu_page( 'wp-builder-templates', 'wp-builder-templates' );
	}

	public function maybe_redirect_new_template(): void {
		$post_type = isset( $_GET['post_type'] ) ? sanitize_key( wp_unslash( $_GET['post_type'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		if ( self::TEMPLATE_CPT !== $post_type ) {
			return;
		}

		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_die( esc_html__( 'You do not have permission to create templates.', 'wp-builder' ) );
		}

		$post_id = wp_insert_post(
			array(
				'post_type'   => self::TEMPLATE_CPT,
				'post_title'  => __( 'New Template', 'wp-builder' ),
				'post_status' => 'draft',
			)
		);

		if ( is_wp_error( $post_id ) || ! $post_id ) {
			wp_die( esc_html__( 'Could not create template.', 'wp-builder' ) );
		}

		wp_safe_redirect( $this->get_builder_url( $post_id ) );
		exit;
	}

	public function maybe_redirect_template_edit(): void {
		if ( $this->is_builder_request() ) {
			return;
		}

		$action  = isset( $_GET['action'] ) ? sanitize_key( wp_unslash( $_GET['action'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		if ( 'edit' !== $action || ! $post_id ) {
			return;
		}

		$post = get_post( $post_id );
		if ( ! $post || self::TEMPLATE_CPT !== $post->post_type ) {
			return;
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		wp_safe_redirect( $this->get_builder_url( $post_id ) );
		exit;
	}

	public function add_builder_meta_box(): void {
		foreach ( $this->supported_post_types() as $post_type ) {
			if ( self::TEMPLATE_CPT === $post_type ) {
				continue;
			}

			add_meta_box(
				'wp-builder-launcher',
				__( 'WP Builder', 'wp-builder' ),
				array( $this, 'render_builder_meta_box' ),
				$post_type,
				'side',
				'high'
			);
		}
	}

	public function render_builder_meta_box( WP_Post $post ): void {
		if ( ! current_user_can( 'edit_post', $post->ID ) ) {
			return;
		}

		$layout = $this->get_layout( $post->ID );
		$count  = $this->count_elements( $layout['elements'] );

		printf(
			'<p><a class="button button-primary button-large" href="%1$s">%2$s</a></p>',
			esc_url( $this->get_builder_url( $post->ID ) ),
			esc_html__( 'Edit with WP Builder', 'wp-builder' )
		);

		printf(
			'<p class="description">%s</p>',
			esc_html(
				sprintf(
					/* translators: %d: number of builder elements. */
					_n( '%d builder element saved.', '%d builder elements saved.', $count, 'wp-builder' ),
					$count
				)
			)
		);
	}

	public function register_builder_page(): void {
		add_submenu_page(
			null,
			__( 'WP Builder', 'wp-builder' ),
			__( 'WP Builder', 'wp-builder' ),
			'read',
			self::MENU_SLUG,
			array( $this, 'render_builder_page' )
		);
	}

	public function add_row_action( array $actions, WP_Post $post ): array {
		if ( ! $this->is_supported_post_type( $post->post_type ) || ! current_user_can( 'edit_post', $post->ID ) ) {
			return $actions;
		}

		$actions['wp_builder'] = sprintf(
			'<a href="%1$s">%2$s</a>',
			esc_url( $this->get_builder_url( $post->ID ) ),
			esc_html__( 'Edit with WP Builder', 'wp-builder' )
		);

		return $actions;
	}

	public function add_admin_bar_link( WP_Admin_Bar $admin_bar ): void {
		if ( is_admin() || ! is_singular( $this->supported_post_types() ) ) {
			return;
		}

		$post_id = get_queried_object_id();
		if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		$admin_bar->add_node(
			array(
				'id'    => 'wp-builder',
				'title' => __( 'Edit with WP Builder', 'wp-builder' ),
				'href'  => $this->get_builder_url( $post_id ),
			)
		);
	}

	public function maybe_render_builder_request(): void {
		if ( ! $this->is_builder_request() ) {
			return;
		}

		$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$post    = $post_id ? get_post( $post_id ) : null;

		if ( ! $post || ! $this->is_supported_post_type( $post->post_type ) ) {
			wp_die( esc_html__( 'This post type is not supported by WP Builder.', 'wp-builder' ) );
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			wp_die( esc_html__( 'You do not have permission to edit this content.', 'wp-builder' ) );
		}

		$this->enqueue_builder_assets( $post_id );

		status_header( 200 );
		nocache_headers();
		$this->render_builder_document( $post );
		exit;
	}

	private function enqueue_builder_assets( int $post_id ): void {
		$asset_url   = plugin_dir_url( __FILE__ ) . 'assets/';
		$post        = get_post( $post_id );
		$is_template = $post && self::TEMPLATE_CPT === $post->post_type;
		$post_status = $post ? $post->post_status : 'draft';
		$preview_url = $is_template ? get_preview_post_link( $post_id ) : get_permalink( $post_id );

		wp_enqueue_style(
			'wp-builder-admin',
			$asset_url . 'admin.css',
			array(),
			self::VERSION
		);

		wp_enqueue_script(
			'wp-builder-admin',
			$asset_url . 'admin.js',
			array(),
			self::VERSION,
			true
		);

		wp_localize_script(
			'wp-builder-admin',
			'wpBuilder',
			array(
				'ajaxUrl'    => admin_url( 'admin-ajax.php' ),
				'nonce'      => wp_create_nonce( self::NONCE_ACTION ),
				'titleNonce' => wp_create_nonce( self::TITLE_NONCE_ACTION ),
				'postId'     => $post_id,
				'postTitle'  => get_the_title( $post_id ),
				'isTemplate' => $is_template,
				'postStatus' => $post_status,
				'layout'     => $this->get_layout( $post_id ),
				'editUrl'    => get_edit_post_link( $post_id, '' ),
				'previewUrl' => $preview_url,
				'pageTemplate'  => $is_template ? 'default' : ( get_post_meta( $post_id, '_wp_page_template', true ) ?: 'default' ),
				'pageTemplates' => $is_template ? array() : $this->get_available_page_templates( $post_id ),
				'i18n'       => array(
					'addContainer'   => __( 'Container', 'wp-builder' ),
					'addHtml'        => __( 'HTML', 'wp-builder' ),
					'canvas'         => __( 'Canvas', 'wp-builder' ),
					'delete'         => __( 'Delete', 'wp-builder' ),
					'emptyCanvas'    => __( 'Empty canvas', 'wp-builder' ),
					'emptyContainer' => __( 'Empty container', 'wp-builder' ),
					'emptyHtml'      => __( 'Empty HTML element', 'wp-builder' ),
					'root'           => __( 'Root', 'wp-builder' ),
					'saved'          => __( 'Saved', 'wp-builder' ),
					'saving'         => __( 'Saving...', 'wp-builder' ),
					'selected'       => __( 'Selected', 'wp-builder' ),
					'unsaved'        => __( 'Unsaved changes', 'wp-builder' ),
				),
			)
		);
	}

	public function render_builder_page(): void {
		$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( $post_id ) {
			wp_safe_redirect( $this->get_builder_url( $post_id ) );
			exit;
		}

		wp_die( esc_html__( 'No post selected for WP Builder.', 'wp-builder' ) );
	}

	private function render_builder_document( WP_Post $post ): void {
		$title = sprintf(
			/* translators: %s: post title. */
			__( 'WP Builder: %s', 'wp-builder' ),
			get_the_title( $post )
		);
		?>
		<!doctype html>
		<html <?php language_attributes(); ?>>
		<head>
			<meta charset="<?php bloginfo( 'charset' ); ?>">
			<meta name="viewport" content="width=device-width, initial-scale=1">
			<title><?php echo esc_html( $title ); ?></title>
			<?php wp_print_styles( array( 'wp-builder-admin' ) ); ?>
		</head>
		<body class="wp-builder-body">
			<?php $this->render_builder_shell( $post ); ?>
			<?php wp_print_scripts( array( 'wp-builder-admin' ) ); ?>
		</body>
		</html>
		<?php
	}

	private function render_builder_shell( WP_Post $post ): void {
		$post_id           = $post->ID;
		$is_template       = self::TEMPLATE_CPT === $post->post_type;
		$is_published      = 'publish' === $post->post_status;
		$back_url          = $is_template
			? admin_url( 'edit.php?post_type=' . self::TEMPLATE_CPT )
			: get_edit_post_link( $post_id, '' );
		$preview_url       = $is_template ? get_preview_post_link( $post_id ) : get_permalink( $post_id );
		$shortcode         = '[wp_builder_template id=\'' . absint( $post_id ) . '\']';
		$page_templates    = $is_template ? array() : $this->get_available_page_templates( $post_id );
		$current_template  = $is_template ? 'default' : ( get_post_meta( $post_id, '_wp_page_template', true ) ?: 'default' );
		?>
		<div class="wp-builder-shell" id="wp-builder-app">
			<header class="wp-builder-header">
				<div class="wp-builder-title">
					<span class="wp-builder-kicker"><?php esc_html_e( 'WP Builder', 'wp-builder' ); ?></span>
					<input type="text" id="wp-builder-title" class="wp-builder-title-input" value="<?php echo esc_attr( get_the_title( $post_id ) ); ?>" aria-label="<?php esc_attr_e( 'Post title', 'wp-builder' ); ?>">
				</div>
				<div class="wp-builder-actions">
					<a class="wp-builder-button wp-builder-button-secondary" href="<?php echo esc_url( $back_url ); ?>">
						<?php echo $is_template ? esc_html__( 'Back to Templates', 'wp-builder' ) : esc_html__( 'Back to Admin', 'wp-builder' ); ?>
					</a>
					<a id="wp-builder-view-link" class="wp-builder-button wp-builder-button-secondary" href="<?php echo esc_url( $preview_url ); ?>" target="_blank" rel="noreferrer">
						<?php esc_html_e( 'View', 'wp-builder' ); ?>
					</a>
					<button class="wp-builder-button wp-builder-button-primary" type="button" id="wp-builder-save">
						<?php esc_html_e( 'Save', 'wp-builder' ); ?>
					</button>
				</div>
			</header>

			<div class="wp-builder-workspace">
				<aside class="wp-builder-panel wp-builder-element-panel" aria-label="<?php esc_attr_e( 'Elements', 'wp-builder' ); ?>">
					<h2><?php esc_html_e( 'Elements', 'wp-builder' ); ?></h2>
					<button class="wp-builder-element-button" type="button" data-wp-builder-add="container">
						<span class="wp-builder-element-icon" aria-hidden="true"></span>
						<span><?php esc_html_e( 'Container', 'wp-builder' ); ?></span>
					</button>
					<button class="wp-builder-element-button" type="button" data-wp-builder-add="html">
						<span class="wp-builder-element-icon wp-builder-element-icon-html" aria-hidden="true"></span>
						<span><?php esc_html_e( 'HTML', 'wp-builder' ); ?></span>
					</button>
				</aside>

				<main class="wp-builder-canvas-panel" aria-label="<?php esc_attr_e( 'Builder canvas', 'wp-builder' ); ?>">
					<div class="wp-builder-canvas-toolbar">
						<span id="wp-builder-save-status" role="status" aria-live="polite"></span>
					</div>
					<div id="wp-builder-canvas" class="wp-builder-canvas"></div>
				</main>

				<aside class="wp-builder-panel wp-builder-inspector-panel" aria-label="<?php esc_attr_e( 'Inspector', 'wp-builder' ); ?>">
					<h2><?php esc_html_e( 'Inspector', 'wp-builder' ); ?></h2>
					<div class="wp-builder-inspector-selection">
						<span class="wp-builder-inspector-label"><?php esc_html_e( 'Selected', 'wp-builder' ); ?></span>
						<strong id="wp-builder-selection-name"><?php esc_html_e( 'Root', 'wp-builder' ); ?></strong>
					</div>
					<div class="wp-builder-inspector-actions">
						<button class="wp-builder-button wp-builder-button-danger" type="button" id="wp-builder-delete-selected">
							<?php esc_html_e( 'Delete', 'wp-builder' ); ?>
						</button>
					</div>
					<?php if ( $is_template ) : ?>
					<div id="wp-builder-shortcode-panel" hidden>
						<hr class="wp-builder-inspector-divider">
						<p class="wp-builder-inspector-section-title"><?php esc_html_e( 'Shortcode', 'wp-builder' ); ?></p>
						<p class="wp-builder-inspector-hint"><?php esc_html_e( 'Embed this template anywhere with this shortcode.', 'wp-builder' ); ?></p>
						<input type="text" class="wp-builder-input" readonly value="<?php echo esc_attr( $shortcode ); ?>">
					</div>
					<?php endif; ?>
					<div id="wp-builder-inspector-root" hidden>
					<hr class="wp-builder-inspector-divider">
					<p class="wp-builder-inspector-section-title"><?php esc_html_e( 'Post Status', 'wp-builder' ); ?></p>
					<div class="wp-builder-field-group">
						<label class="wp-builder-inspector-label" for="wp-builder-post-status"><?php esc_html_e( 'Status', 'wp-builder' ); ?></label>
						<select id="wp-builder-post-status" class="wp-builder-select">
							<option value="publish"><?php esc_html_e( 'Published', 'wp-builder' ); ?></option>
							<option value="draft"><?php esc_html_e( 'Draft', 'wp-builder' ); ?></option>
							<option value="pending"><?php esc_html_e( 'Pending Review', 'wp-builder' ); ?></option>
							<option value="private"><?php esc_html_e( 'Private', 'wp-builder' ); ?></option>
						</select>
					</div>
					<?php if ( ! $is_template && ! empty( $page_templates ) ) : ?>
					<div class="wp-builder-field-group">
						<label class="wp-builder-inspector-label" for="wp-builder-page-template"><?php esc_html_e( 'Template', 'wp-builder' ); ?></label>
						<select id="wp-builder-page-template" class="wp-builder-select">
							<?php foreach ( $page_templates as $slug => $name ) : ?>
							<option value="<?php echo esc_attr( $slug ); ?>"<?php selected( $current_template, $slug ); ?>><?php echo esc_html( $name ); ?></option>
							<?php endforeach; ?>
						</select>
					</div>
					<?php endif; ?>
				</div>
				<div id="wp-builder-inspector-editor" class="wp-builder-inspector-editor" hidden>
						<label class="wp-builder-inspector-label" for="wp-builder-html-content">
							<?php esc_html_e( 'Content', 'wp-builder' ); ?>
						</label>
						<textarea id="wp-builder-html-content" class="wp-builder-html-editor" rows="12" spellcheck="false" placeholder="<?php esc_attr_e( 'Enter your here…', 'wp-builder' ); ?>"></textarea>
					</div>
					<div id="wp-builder-inspector-container" class="wp-builder-inspector-container-editor" hidden>
						<hr class="wp-builder-inspector-divider">
						<p class="wp-builder-inspector-section-title"><?php esc_html_e( 'Layout', 'wp-builder' ); ?></p>
						<div class="wp-builder-field-group">
							<label class="wp-builder-inspector-label" for="wp-builder-flex-direction"><?php esc_html_e( 'Direction', 'wp-builder' ); ?></label>
							<select id="wp-builder-flex-direction" class="wp-builder-select">
								<option value=""><?php esc_html_e( '— None —', 'wp-builder' ); ?></option>
								<option value="row"><?php esc_html_e( 'Row', 'wp-builder' ); ?></option>
								<option value="column"><?php esc_html_e( 'Column', 'wp-builder' ); ?></option>
							</select>
						</div>
						<div class="wp-builder-field-group">
							<label class="wp-builder-inspector-label" for="wp-builder-flex-grow"><?php esc_html_e( 'Flex Grow', 'wp-builder' ); ?></label>
							<input type="number" id="wp-builder-flex-grow" class="wp-builder-input" min="0" step="1" placeholder="0">
						</div>
						<div class="wp-builder-field-group">
							<label class="wp-builder-inspector-label" for="wp-builder-gap"><?php esc_html_e( 'Gap', 'wp-builder' ); ?></label>
							<input type="text" id="wp-builder-gap" class="wp-builder-input" placeholder="<?php esc_attr_e( 'e.g. 16px', 'wp-builder' ); ?>">
						</div>
						<hr class="wp-builder-inspector-divider">
						<p class="wp-builder-inspector-section-title"><?php esc_html_e( 'Custom CSS', 'wp-builder' ); ?></p>
						<p class="wp-builder-inspector-hint"><?php esc_html_e( 'Use', 'wp-builder' ); ?> <code>self</code> <?php esc_html_e( 'to target this element.', 'wp-builder' ); ?></p>
						<textarea id="wp-builder-custom-css" class="wp-builder-html-editor" rows="8" spellcheck="false" placeholder="self {&#10;  background-color: red;&#10;}"></textarea>
					</div>
				</aside>
			</div>
		</div>
		<?php
	}

	public function ajax_update_title(): void {
		check_ajax_referer( self::TITLE_NONCE_ACTION, 'nonce' );

		$post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
		$post    = $post_id ? get_post( $post_id ) : null;

		if ( ! $post || ! $this->is_supported_post_type( $post->post_type ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Unsupported post type.', 'wp-builder' ) ),
				400
			);
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			wp_send_json_error(
				array( 'message' => __( 'You do not have permission to edit this post.', 'wp-builder' ) ),
				403
			);
		}

		$title = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';

		wp_update_post(
			array(
				'ID'         => $post_id,
				'post_title' => $title,
			)
		);

		$is_template = self::TEMPLATE_CPT === $post->post_type;
		$preview_url = $is_template ? get_preview_post_link( $post_id ) : get_permalink( $post_id );

		wp_send_json_success(
			array(
				'title'      => get_the_title( $post_id ),
				'docTitle'   => sprintf(
					/* translators: %s: post title. */
					__( 'WP Builder: %s', 'wp-builder' ),
					get_the_title( $post_id )
				),
				'previewUrl' => $preview_url,
			)
		);
	}

	public function ajax_save_layout(): void {
		check_ajax_referer( self::NONCE_ACTION, 'nonce' );

		$post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
		$post    = $post_id ? get_post( $post_id ) : null;

		if ( ! $post || ! $this->is_supported_post_type( $post->post_type ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Unsupported post type.', 'wp-builder' ) ),
				400
			);
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			wp_send_json_error(
				array( 'message' => __( 'You do not have permission to save this layout.', 'wp-builder' ) ),
				403
			);
		}

		$layout_json = isset( $_POST['layout'] ) ? wp_unslash( $_POST['layout'] ) : '';
		$decoded     = json_decode( $layout_json, true );

		if ( ! is_array( $decoded ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Invalid layout data.', 'wp-builder' ) ),
				400
			);
		}

		$layout = $this->sanitize_layout( $decoded );
		update_post_meta( $post_id, self::META_KEY, wp_json_encode( $layout ) );

		$allowed_statuses = array( 'publish', 'draft', 'pending', 'private' );
		$new_status       = isset( $_POST['post_status'] ) ? sanitize_key( wp_unslash( $_POST['post_status'] ) ) : '';

		if ( $new_status && in_array( $new_status, $allowed_statuses, true ) && $new_status !== $post->post_status ) {
			$can_change = true;
			if ( in_array( $new_status, array( 'publish', 'private' ), true ) ) {
				$can_change = current_user_can( 'publish_post', $post_id );
			}
			if ( $can_change ) {
				wp_update_post(
					array(
						'ID'          => $post_id,
						'post_status' => $new_status,
					)
				);
				$post = get_post( $post_id );
			}
		}

		// Deferred title update — applied when the user clicks Save.
		$new_title = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';
		if ( $new_title !== '' ) {
			wp_update_post( array( 'ID' => $post_id, 'post_title' => $new_title ) );
			$post = get_post( $post_id );
		}

		// Page template update (not applicable to builder templates themselves).
		$is_template = $post && self::TEMPLATE_CPT === $post->post_type;
		if ( ! $is_template && isset( $_POST['page_template'] ) ) {
			$page_template_value = sanitize_text_field( wp_unslash( $_POST['page_template'] ) );
			update_post_meta( $post_id, '_wp_page_template', $page_template_value );
		}

		$preview_url = $is_template ? get_preview_post_link( $post_id ) : get_permalink( $post_id );

		wp_send_json_success(
			array(
				'layout'       => $layout,
				'postStatus'   => $post ? $post->post_status : 'draft',
				'postTitle'    => get_the_title( $post_id ),
				'docTitle'     => sprintf(
					/* translators: %s: post title. */
					__( 'WP Builder: %s', 'wp-builder' ),
					get_the_title( $post_id )
				),
				'previewUrl'   => $preview_url,
				'pageTemplate' => get_post_meta( $post_id, '_wp_page_template', true ) ?: 'default',
				'message'      => __( 'Layout saved.', 'wp-builder' ),
			)
		);
	}

	public function enqueue_frontend_assets(): void {
		if ( is_admin() || ! is_singular( $this->supported_post_types() ) ) {
			return;
		}

		$post_id = get_queried_object_id();
		if ( ! $post_id || ! $this->has_builder_layout( $post_id ) ) {
			return;
		}

		wp_enqueue_style(
			'wp-builder-frontend',
			plugin_dir_url( __FILE__ ) . 'assets/frontend.css',
			array(),
			self::VERSION
		);
	}

	public function render_builder_content( string $content ): string {
		if ( is_admin() || ! is_singular( $this->supported_post_types() ) || ! in_the_loop() || ! is_main_query() ) {
			return $content;
		}

		$post_id = get_the_ID();
		if ( ! $post_id || ! $this->has_builder_layout( $post_id ) ) {
			return $content;
		}

		$layout = $this->get_layout( $post_id );
		return '<div class="wp-builder-page">' . $this->render_elements( $layout['elements'] ) . '</div>';
	}

	private function is_builder_request(): bool {
		$action = isset( $_GET['action'] ) ? sanitize_key( wp_unslash( $_GET['action'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		return is_admin()
			&& self::ACTION === $action;
	}

	private function get_builder_url( int $post_id ): string {
		return add_query_arg(
			array(
				'post' => $post_id,
				'action' => self::ACTION,
			),
			admin_url( 'post.php' )
		);
	}

	private function supported_post_types(): array {
		return array( 'post', 'page', self::TEMPLATE_CPT );
	}

	private function is_supported_post_type( string $post_type ): bool {
		return in_array( $post_type, $this->supported_post_types(), true );
	}

	private function get_layout( int $post_id ): array {
		$raw = get_post_meta( $post_id, self::META_KEY, true );
		if ( ! $raw ) {
			return $this->empty_layout();
		}

		$decoded = json_decode( $raw, true );
		if ( ! is_array( $decoded ) ) {
			return $this->empty_layout();
		}

		return $this->sanitize_layout( $decoded );
	}

	private function has_builder_layout( int $post_id ): bool {
		$layout = $this->get_layout( $post_id );
		return ! empty( $layout['elements'] );
	}

	private function empty_layout(): array {
		return array(
			'version'  => 1,
			'elements' => array(),
		);
	}

	private function sanitize_layout( array $layout ): array {
		$elements = isset( $layout['elements'] ) && is_array( $layout['elements'] ) ? $layout['elements'] : array();

		return array(
			'version'  => 1,
			'elements' => $this->sanitize_elements( $elements ),
		);
	}

	private function sanitize_elements( array $elements ): array {
		$clean = array();

		foreach ( $elements as $element ) {
			if ( ! is_array( $element ) || ! isset( $element['type'] ) ) {
				continue;
			}

			$id = isset( $element['id'] ) ? sanitize_key( (string) $element['id'] ) : '';

			if ( 'container' === $element['type'] ) {
				$children   = isset( $element['children'] ) && is_array( $element['children'] ) ? $element['children'] : array();
				$props      = isset( $element['props'] ) && is_array( $element['props'] ) ? $element['props'] : array();
				$custom_css = isset( $element['customCss'] ) ? (string) $element['customCss'] : '';
				$clean[]    = array(
					'id'        => $id ? $id : wp_unique_id( 'container-' ),
					'type'      => 'container',
					'props'     => $this->sanitize_container_props( $props ),
					'customCss' => $this->sanitize_custom_css( $custom_css ),
					'children'  => $this->sanitize_elements( $children ),
				);
			} elseif ( 'html' === $element['type'] ) {
				$content = isset( $element['content'] ) ? wp_kses_post( (string) $element['content'] ) : '';
				$clean[] = array(
					'id'      => $id ? $id : wp_unique_id( 'html-' ),
					'type'    => 'html',
					'content' => $content,
				);
			}
		}

		return $clean;
	}

	private function render_elements( array $elements ): string {
		$output = '';

		foreach ( $elements as $element ) {
			if ( ! is_array( $element ) || ! isset( $element['type'] ) ) {
				continue;
			}

			$id = isset( $element['id'] ) ? sanitize_key( (string) $element['id'] ) : '';

			if ( 'container' === $element['type'] ) {
				$children   = isset( $element['children'] ) && is_array( $element['children'] ) ? $element['children'] : array();
				$props      = isset( $element['props'] ) && is_array( $element['props'] ) ? $element['props'] : array();
				$custom_css = isset( $element['customCss'] ) ? (string) $element['customCss'] : '';

				$inline_style = $this->build_container_inline_style( $props );
				$style_attr   = $inline_style ? ' style="' . esc_attr( $inline_style ) . '"' : '';

				$css_block = '';
				if ( $custom_css !== '' && $id ) {
					$selector   = '.wp-builder-container[data-wp-builder-id="' . esc_attr( $id ) . '"]';
					$scoped_css = preg_replace( '/\bself\b/', $selector, $custom_css );
					$css_block  = '<style>' . $scoped_css . '</style>';
				}

				$output .= $css_block . sprintf(
					'<div class="wp-builder-container" data-wp-builder-id="%1$s"%2$s>%3$s</div>',
					esc_attr( $id ),
					$style_attr,
					$this->render_elements( $children )
				);
			} elseif ( 'html' === $element['type'] ) {
				$content = isset( $element['content'] ) ? $element['content'] : '';
				$output .= sprintf(
					'<div class="wp-builder-html" data-wp-builder-id="%1$s">%2$s</div>',
					esc_attr( $id ),
					$content
				);
			}
		}

		return $output;
	}

	private function sanitize_container_props( array $props ): array {
		$allowed_directions = array( '', 'row', 'column' );

		$flex_direction = isset( $props['flexDirection'] ) ? (string) $props['flexDirection'] : '';
		$flex_grow      = isset( $props['flexGrow'] ) ? (string) $props['flexGrow'] : '';
		$gap            = isset( $props['gap'] ) ? trim( (string) $props['gap'] ) : '';

		return array(
			'flexDirection' => in_array( $flex_direction, $allowed_directions, true ) ? $flex_direction : '',
			'flexGrow'      => ( $flex_grow === '' || is_numeric( $flex_grow ) ) ? $flex_grow : '',
			'gap'           => preg_match( '/^[\d\s.%a-z]+$/i', $gap ) ? $gap : '',
		);
	}

	private function sanitize_custom_css( string $css ): string {
		// Prevent breaking out of the <style> tag.
		$css = preg_replace( '/<\/style\s*>/i', '', $css );
		return wp_strip_all_tags( $css );
	}

	private function build_container_inline_style( array $props ): string {
		$styles = array();

		$flex_direction = isset( $props['flexDirection'] ) ? (string) $props['flexDirection'] : '';
		$flex_grow      = isset( $props['flexGrow'] ) ? (string) $props['flexGrow'] : '';
		$gap            = isset( $props['gap'] ) ? (string) $props['gap'] : '';

		if ( in_array( $flex_direction, array( 'row', 'column' ), true ) ) {
			$styles[] = 'display:flex';
			$styles[] = 'flex-direction:' . $flex_direction;
		}

		if ( $flex_grow !== '' && is_numeric( $flex_grow ) ) {
			$styles[] = 'flex-grow:' . (float) $flex_grow;
		}

		if ( $gap !== '' ) {
			$styles[] = 'gap:' . $gap;
		}

		return implode( ';', $styles );
	}

	private function count_elements( array $elements ): int {
		$count = 0;

		foreach ( $elements as $element ) {
			if ( ! is_array( $element ) || ! isset( $element['type'] ) ) {
				continue;
			}

			if ( 'container' === $element['type'] || 'html' === $element['type'] ) {
				++$count;
			}

			$children = isset( $element['children'] ) && is_array( $element['children'] ) ? $element['children'] : array();
			$count   += $this->count_elements( $children );
		}

		return $count;
	}

	public function register_page_templates( array $templates, $theme, $post, string $post_type ): array {
		$templates['wp-builder-canvas'] = __( 'WP Builder Canvas', 'wp-builder' );
		return $templates;
	}

	public function maybe_use_builder_template( string $template ): string {
		if ( is_singular() ) {
			$post_id       = get_queried_object_id();
			$page_template = get_post_meta( $post_id, '_wp_page_template', true );
			if ( 'wp-builder-canvas' === $page_template ) {
				$canvas = plugin_dir_path( __FILE__ ) . 'templates/wp-builder-canvas.php';
				if ( file_exists( $canvas ) ) {
					return $canvas;
				}
			}
		}
		return $template;
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

new WP_Builder();

register_activation_hook( __FILE__, function() { flush_rewrite_rules( false ); } );
register_deactivation_hook( __FILE__, function() { flush_rewrite_rules( false ); } );
