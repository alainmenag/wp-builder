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
	private const VERSION         = '0.1.0';
	private const META_KEY        = '_wp_builder_layout';
	private const MENU_SLUG       = 'wp-builder';
	private const ACTION          = 'builder';
	private const NONCE_ACTION    = 'wp_builder_save_layout';

	public function __construct() {
		add_action( 'init', array( $this, 'register_meta' ) );
		add_action( 'add_meta_boxes', array( $this, 'add_builder_meta_box' ) );
		add_action( 'admin_menu', array( $this, 'register_builder_page' ) );
		add_action( 'load-post.php', array( $this, 'maybe_render_builder_request' ) );
		add_action( 'wp_ajax_wp_builder_save_layout', array( $this, 'ajax_save_layout' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_assets' ) );
		add_action( 'admin_bar_menu', array( $this, 'add_admin_bar_link' ), 80 );
		add_filter( 'post_row_actions', array( $this, 'add_row_action' ), 10, 2 );
		add_filter( 'page_row_actions', array( $this, 'add_row_action' ), 10, 2 );
		add_filter( 'the_content', array( $this, 'render_builder_content' ), 20 );
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

	public function add_builder_meta_box(): void {
		foreach ( $this->supported_post_types() as $post_type ) {
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
		$asset_url = plugin_dir_url( __FILE__ ) . 'assets/';

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
				'postId'     => $post_id,
				'layout'     => $this->get_layout( $post_id ),
				'editUrl'    => get_edit_post_link( $post_id, '' ),
				'previewUrl' => get_permalink( $post_id ),
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
		$post_id     = $post->ID;
		$edit_url    = get_edit_post_link( $post_id, '' );
		$preview_url = get_permalink( $post_id );
		?>
		<div class="wp-builder-shell" id="wp-builder-app">
			<header class="wp-builder-header">
				<div class="wp-builder-title">
					<span class="wp-builder-kicker"><?php esc_html_e( 'WP Builder', 'wp-builder' ); ?></span>
					<h1><?php echo esc_html( get_the_title( $post_id ) ); ?></h1>
				</div>
				<div class="wp-builder-actions">
					<a class="wp-builder-button wp-builder-button-secondary" href="<?php echo esc_url( $edit_url ); ?>">
						<?php esc_html_e( 'Back to Admin', 'wp-builder' ); ?>
					</a>
					<a class="wp-builder-button wp-builder-button-secondary" href="<?php echo esc_url( $preview_url ); ?>" target="_blank" rel="noreferrer">
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
						<button class="wp-builder-button wp-builder-button-secondary" type="button" id="wp-builder-add-nested">
							<?php esc_html_e( 'Add Container', 'wp-builder' ); ?>
						</button>
						<button class="wp-builder-button wp-builder-button-secondary" type="button" id="wp-builder-add-nested-html">
							<?php esc_html_e( 'Add HTML', 'wp-builder' ); ?>
						</button>
						<button class="wp-builder-button wp-builder-button-danger" type="button" id="wp-builder-delete-selected">
							<?php esc_html_e( 'Delete', 'wp-builder' ); ?>
						</button>
					</div>
					<div id="wp-builder-inspector-editor" class="wp-builder-inspector-editor" hidden>
						<label class="wp-builder-inspector-label" for="wp-builder-html-content">
							<?php esc_html_e( 'HTML Content', 'wp-builder' ); ?>
						</label>
						<textarea id="wp-builder-html-content" class="wp-builder-html-editor" rows="12" spellcheck="false" placeholder="<?php esc_attr_e( 'Enter your HTML here…', 'wp-builder' ); ?>"></textarea>
					</div>
				</aside>
			</div>
		</div>
		<?php
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

		wp_send_json_success(
			array(
				'layout'  => $layout,
				'message' => __( 'Layout saved.', 'wp-builder' ),
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
		return array( 'post', 'page' );
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
				$children = isset( $element['children'] ) && is_array( $element['children'] ) ? $element['children'] : array();
				$clean[]  = array(
					'id'       => $id ? $id : wp_unique_id( 'container-' ),
					'type'     => 'container',
					'children' => $this->sanitize_elements( $children ),
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
				$children = isset( $element['children'] ) && is_array( $element['children'] ) ? $element['children'] : array();
				$output  .= sprintf(
					'<div class="wp-builder-container" data-wp-builder-id="%1$s">%2$s</div>',
					esc_attr( $id ),
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
}

new WP_Builder();
