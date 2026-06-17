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
	private const NONCE_ACTION           = 'wp_builder_save_layout';
	private const TITLE_NONCE_ACTION     = 'wp_builder_update_title';
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
		add_action( 'admin_bar_menu', array( $this, 'add_admin_bar_nodes' ), 80 );
		add_filter( 'post_row_actions', array( $this, 'add_row_action' ), 10, 2 );
		add_filter( 'page_row_actions', array( $this, 'add_row_action' ), 10, 2 );
		add_filter( self::TEMPLATE_CPT . '_row_actions', array( $this, 'add_row_action' ), 10, 2 );
		add_filter( 'post_type_link', array( $this, 'template_post_type_link' ), 10, 2 );
		add_filter( 'the_content', array( $this, 'render_builder_content' ), 20 );
		add_filter( 'theme_page_templates', array( $this, 'register_page_templates' ), 10, 4 );
		add_filter( 'theme_post_templates', array( $this, 'register_page_templates' ), 10, 4 );
		add_filter( 'template_include', array( $this, 'maybe_use_builder_template' ) );
		add_action( 'elementor/widgets/register', array( $this, 'register_elementor_widget' ) );
		add_action( 'elementor/editor/after_enqueue_styles', array( $this, 'enqueue_elementor_editor_styles' ) );
	}

	// -------------------------------------------------------------------------
	// Shared helpers — used by multiple traits.
	// -------------------------------------------------------------------------

	private function is_builder_request(): bool {
		$action = isset( $_GET['action'] ) ? sanitize_key( wp_unslash( $_GET['action'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		return is_admin()
			&& self::ACTION === $action;
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
}
