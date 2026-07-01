<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Admin
 *
 * Handles WordPress admin UI: menus, meta boxes, row actions, admin bar nodes,
 * and redirects to the builder editor.
 */
trait WP_Builder_Admin {

	public function register_template_menu(): void {
		add_menu_page(
			__( 'Builder', 'wp-builder' ),
			__( 'Builder', 'wp-builder' ),
			'edit_posts',
			'wp-builder-snippets',
			'__return_null',
			'dashicons-layout',
			59
		);

		add_submenu_page(
			'wp-builder-snippets',
			__( 'Builder Snippets', 'wp-builder' ),
			__( 'Snippets', 'wp-builder' ),
			'edit_posts',
			'edit.php?post_type=' . self::TEMPLATE_CPT
		);

		add_submenu_page(
			'wp-builder-snippets',
			__( 'Add New Snippet', 'wp-builder' ),
			__( 'Add New', 'wp-builder' ),
			'edit_posts',
			'post-new.php?post_type=' . self::TEMPLATE_CPT
		);

		// Remove the auto-generated duplicate top-level submenu entry.
		remove_submenu_page( 'wp-builder-snippets', 'wp-builder-snippets' );
	}

	public function maybe_redirect_new_template(): void {
		$post_type = isset( $_GET['post_type'] ) ? sanitize_key( wp_unslash( $_GET['post_type'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		if ( self::TEMPLATE_CPT !== $post_type ) {
			return;
		}

		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_die( esc_html__( 'You do not have permission to create snippets.', 'wp-builder' ) );
		}

		$post_id = wp_insert_post(
			array(
				'post_type'   => self::TEMPLATE_CPT,
				'post_title'  => __( 'New Snippet', 'wp-builder' ),
				'post_status' => 'draft',
			)
		);

		if ( is_wp_error( $post_id ) || ! $post_id ) {
			wp_die( esc_html__( 'Could not create snippet.', 'wp-builder' ) );
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

	public function register_builder_page(): void {
		add_submenu_page(
			null,
			__( 'Builder', 'wp-builder' ),
			__( 'Builder', 'wp-builder' ),
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
			esc_html__( 'Builder', 'wp-builder' )
		);

		return $actions;
	}

	public function add_admin_bar_nodes( WP_Admin_Bar $admin_bar ): void {
		if ( ! current_user_can( 'edit_posts' ) ) {
			return;
		}

		// Parent "Builder" dropdown — links to the templates list.
		$admin_bar->add_node(
			array(
				'id'    => 'wp-builder',
				'title' => __( 'Builder', 'wp-builder' ),
				'href'  => admin_url( 'edit.php?post_type=' . self::TEMPLATE_CPT ),
			)
		);

		// "Edit" child — shown when viewing a page or post on the frontend.
		if ( ! is_admin() && is_singular( array( 'post', 'page' ) ) ) {
			$post_id = get_queried_object_id();
			if ( $post_id && current_user_can( 'edit_post', $post_id ) ) {
				$admin_bar->add_node(
					array(
						'id'     => 'wp-builder-edit',
						'parent' => 'wp-builder',
						'title'  => __( 'Edit', 'wp-builder' ),
						'href'   => $this->get_builder_url( $post_id ),
					)
				);
			}
		}

		// List templates as children.
		$template_ids = get_posts(
			array(
				'post_type'      => self::TEMPLATE_CPT,
				'post_status'    => array( 'publish', 'draft' ),
				'posts_per_page' => 20,
				'orderby'        => 'title',
				'order'          => 'ASC',
				'fields'         => 'ids',
			)
		);

		foreach ( $template_ids as $template_id ) {
			if ( ! current_user_can( 'edit_post', $template_id ) ) {
				continue;
			}
			$admin_bar->add_node(
				array(
					'id'     => 'wp-builder-snippet-' . $template_id,
					'parent' => 'wp-builder',
					'title'  => get_the_title( $template_id ),
					'href'   => $this->get_builder_url( $template_id ),
				)
			);
		}
	}
}
