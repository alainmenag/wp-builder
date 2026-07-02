<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class WP_Builder
 *
 * Main plugin class. Defines all constants, registers all WordPress hooks via
 * the constructor, and provides shared helpers used across traits.
 *
 * Functionality is split into focused traits loaded from the includes directory.
 */
final class WP_Builder {
	use WP_Builder_Layout;
	use WP_Builder_Post_Types;
	use WP_Builder_Admin;
	use WP_Builder_Editor;
	use WP_Builder_Ajax;
	use WP_Builder_Frontend;
	use WP_Builder_Page_Chrome;
	use WP_Builder_Elementor;

	private const VERSION                = '0.1.0';
	private const META_KEY               = '_wp_builder_layout';
	private const MENU_SLUG              = 'wp-builder';
	private const ACTION                 = 'builder';
	private const GET_NONCE_ACTION      = 'wp_builder_get_element';
	private const SAVE_NONCE_ACTION     = 'wp_builder_save_element';
	private const GET_LAYOUT_NONCE_ACTION = 'wp_builder_get_layout';
	private const ADD_NONCE_ACTION      = 'wp_builder_add_element';
	private const DELETE_NONCE_ACTION   = 'wp_builder_delete_element';
	private const RESET_NONCE_ACTION    = 'wp_builder_reset';
	private const HOOK_NAME_META_KEY    = '_wp_builder_hook_name';
	private const HOOK_PRIORITY_META_KEY = '_wp_builder_hook_priority';
	private const HOOKS_META_KEY        = '_wp_builder_hooks';
	private const TEMPLATE_CPT           = 'wp_builder_template';
	private const REWRITE_VERSION        = '2';
	private const REWRITE_VERSION_OPTION = 'wp_builder_rewrite_version';

	public function __construct() {
		add_action( 'init', array( $this, 'register_meta' ) );
		add_action( 'init', array( $this, 'register_template_post_type' ) );
		add_action( 'init', array( $this, 'register_shortcodes' ) );
		add_action( 'init', array( $this, 'maybe_flush_rewrite_rules' ), 20 );
		add_action( 'admin_menu', array( $this, 'register_builder_page' ) );
		add_action( 'admin_menu', array( $this, 'register_template_menu' ) );
		add_action( 'load-edit.php', array( $this, 'setup_builder_list_hooks' ) );
		add_action( 'load-post-new.php', array( $this, 'maybe_redirect_new_template' ) );
		add_action( 'load-post.php', array( $this, 'maybe_redirect_template_edit' ) );
		add_action( 'load-post.php', array( $this, 'maybe_render_builder_request' ) );
		add_action( 'wp_ajax_wp_builder_get_element', array( $this, 'ajax_get_element' ) );
		add_action( 'wp_ajax_wp_builder_save_element', array( $this, 'ajax_save_element' ) );
		add_action( 'wp_ajax_wp_builder_get_layout', array( $this, 'ajax_get_layout' ) );
		add_action( 'wp_ajax_wp_builder_add_element', array( $this, 'ajax_add_element' ) );
		add_action( 'wp_ajax_wp_builder_delete_element', array( $this, 'ajax_delete_element' ) );
		add_action( 'wp_ajax_wp_builder_reset', array( $this, 'ajax_reset_builder' ) );
		add_action( 'wp', array( $this, 'inject_snippet_hooks' ), 1 );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_assets' ) );
		add_action( 'admin_bar_menu', array( $this, 'add_admin_bar_nodes' ), 80 );
		add_filter( 'post_row_actions', array( $this, 'add_row_action' ), 10, 2 );
		add_filter( 'page_row_actions', array( $this, 'add_row_action' ), 10, 2 );
		add_filter( self::TEMPLATE_CPT . '_row_actions', array( $this, 'add_row_action' ), 10, 2 );
		add_filter( 'post_type_link', array( $this, 'template_post_type_link' ), 10, 2 );
		add_action( 'template_redirect', array( $this, 'maybe_redirect_template_frontend' ) );
		add_filter( 'the_content', array( $this, 'render_builder_content' ), 20 );
		add_filter( 'theme_page_templates', array( $this, 'register_page_templates' ), 10, 4 );
		add_filter( 'theme_post_templates', array( $this, 'register_page_templates' ), 10, 4 );
		add_filter( 'template_include', array( $this, 'maybe_use_builder_template' ) );
		add_action( 'elementor/widgets/register', array( $this, 'register_elementor_widget' ) );
		add_action( 'elementor/editor/after_enqueue_styles', array( $this, 'enqueue_elementor_editor_styles' ) );
		add_filter( 'script_loader_tag', array( $this, 'add_module_type_to_script_tag' ), 10, 2 );
	}

	// -------------------------------------------------------------------------
	// Shared helpers — used by multiple traits.
	// -------------------------------------------------------------------------

	private function is_builder_request(): bool {
		$action  = isset( $_GET['action'] ) ? sanitize_key( wp_unslash( $_GET['action'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		return is_admin()
			&& self::ACTION === $action
			&& $post_id > 0;
	}

	private function get_builder_url( int $post_id ): string {
		return add_query_arg(
			array(
				'post'   => $post_id,
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

	private function get_preview_url( int $post_id ): string {
		$post = get_post( $post_id );
		if ( $post && self::TEMPLATE_CPT === $post->post_type ) {
			return (string) get_preview_post_link( $post_id );
		}
		return (string) get_permalink( $post_id );
	}

	private function get_builder_doc_title( int $post_id ): string {
		return sprintf(
			/* translators: %s: post title. */
			__( 'Builder: %s', 'wp-builder' ),
			get_the_title( $post_id )
		);
	}

	/**
	 * Return an ordered associative array of hook slug => display label for the
	 * hook-location selector. An empty-string key means "no hook assigned".
	 *
	 * Theme and plugin authors can extend the list via the
	 * `wp_builder_hook_locations` filter.
	 *
	 * @return array<string, string>
	 */
	private function get_hook_locations(): array {
		$locations = array(
			''              => __( '— None —', 'wp-builder' ),
			'wp_head'       => __( 'Head (<head>)', 'wp-builder' ),
			'wp_body_open'  => __( 'After <body> Open', 'wp-builder' ),
			'wp_footer'     => __( 'Footer (before </body>)', 'wp-builder' ),
		);

		/**
		 * Filter the list of hook locations available for snippet injection.
		 *
		 * @param array<string, string> $locations Associative array of hook_slug => display_label.
		 */
		return (array) apply_filters( 'wp_builder_hook_locations', $locations );
	}

	/**
	 * Parse the multi-hook textarea value into an array of hooks.
	 *
	 * Expected format — one entry per line:
	 *   hook_name|priority
	 *
	 * Lines with no hook name are silently skipped. Priority defaults to 10.
	 *
	 * @param string $value Raw textarea content.
	 * @return array[] Array of arrays with 'name' (string) and 'priority' (int) keys.
	 */
	private function parse_hooks_textarea( string $value ): array {
		$hooks = array();
		$lines = preg_split( '/[\r\n]+/', $value, -1, PREG_SPLIT_NO_EMPTY );
		foreach ( $lines as $line ) {
			$parts    = explode( '|', trim( $line ), 2 );
			$name     = sanitize_key( $parts[0] );
			$priority = isset( $parts[1] ) ? absint( $parts[1] ) : 10;
			if ( $name ) {
				$hooks[] = array(
					'name'     => $name,
					'priority' => $priority,
				);
			}
		}
		return $hooks;
	}

	/**
	 * Return the hooks textarea value for a snippet post.
	 *
	 * Reads from HOOKS_META_KEY first. If that is empty (pre-migration snippet),
	 * constructs a single-line value from the legacy HOOK_NAME_META_KEY and
	 * HOOK_PRIORITY_META_KEY fields.
	 *
	 * @param int $post_id Snippet post ID.
	 * @return string
	 */
	private function get_snippet_hooks_value( int $post_id ): string {
		$value = (string) get_post_meta( $post_id, self::HOOKS_META_KEY, true );
		if ( '' !== $value ) {
			return $value;
		}

		// Backward compat: migrate from legacy single-hook meta.
		$legacy_name = (string) get_post_meta( $post_id, self::HOOK_NAME_META_KEY, true );
		if ( '' === $legacy_name ) {
			return '';
		}

		$legacy_prio = get_post_meta( $post_id, self::HOOK_PRIORITY_META_KEY, true );
		$legacy_prio = ( '' !== (string) $legacy_prio ) ? (int) $legacy_prio : 10;

		return $legacy_name . '|' . $legacy_prio;
	}
}
