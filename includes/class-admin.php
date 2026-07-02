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

		// For snippets, "Edit" already opens the builder — no need for a duplicate link.
		if ( self::TEMPLATE_CPT === $post->post_type ) {
			return $actions;
		}

		$actions['wp_builder'] = sprintf(
			'<a href="%1$s">%2$s</a>',
			esc_url( $this->get_builder_url( $post->ID ) ),
			esc_html__( 'Builder', 'wp-builder' )
		);

		return $actions;
	}

	// -------------------------------------------------------------------------
	// Builder list: mixed snippet / page / post view.
	// -------------------------------------------------------------------------

	/**
	 * Register list-specific hooks only when we are on the Builder Snippets
	 * screen (edit.php?post_type=wp_builder_template).
	 */
	public function setup_builder_list_hooks(): void {
		$post_type = isset( $_GET['post_type'] ) ? sanitize_key( wp_unslash( $_GET['post_type'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		if ( self::TEMPLATE_CPT !== $post_type ) {
			return;
		}

		add_action( 'pre_get_posts', array( $this, 'filter_builder_list_query' ) );
		add_filter( 'views_edit-' . self::TEMPLATE_CPT, array( $this, 'get_builder_list_views' ) );
		add_filter( 'manage_' . self::TEMPLATE_CPT . '_posts_columns', array( $this, 'add_builder_list_type_column' ) );
		add_action( 'manage_' . self::TEMPLATE_CPT . '_posts_custom_column', array( $this, 'render_builder_list_type_column' ), 10, 2 );
	}

	/**
	 * Expand the main WP_Query on the Builder Snippets list to include pages
	 * and posts that have builder layout data.
	 *
	 * Respects an optional `wpb_type` GET parameter for type-based filtering:
	 *   - snippet : only wp_builder_template entries
	 *   - page    : only pages with builder layout meta
	 *   - post    : only posts with builder layout meta
	 *   - (none)  : all three combined
	 */
	public function filter_builder_list_query( WP_Query $query ): void {
		if ( ! $query->is_main_query() ) {
			return;
		}

		$wpb_type = isset( $_GET['wpb_type'] ) ? sanitize_key( wp_unslash( $_GET['wpb_type'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		if ( 'snippet' === $wpb_type ) {
			// Default post_type is already wp_builder_template — nothing to change.
			return;
		}

		if ( 'page' === $wpb_type || 'post' === $wpb_type ) {
			$query->set( 'post_type', $wpb_type );
			$query->set( 'meta_key', self::META_KEY );
			return;
		}

		// Default: show all builder content across all three post types.
		// Pre-fetch snippet IDs (all, regardless of meta) and page/post IDs
		// that carry builder layout data, then scope the main query to that set.
		$fetch_args = array(
			'fields'                 => 'ids',
			'posts_per_page'         => -1,
			'post_status'            => array( 'publish', 'draft', 'pending', 'private', 'future' ),
			'no_found_rows'          => true,
			'update_post_meta_cache' => false,
			'update_post_term_cache' => false,
		);

		$snippet_ids = get_posts( array_merge( $fetch_args, array( 'post_type' => self::TEMPLATE_CPT ) ) );
		$builder_ids = get_posts( array_merge(
			$fetch_args,
			array(
				'post_type' => array( 'page', 'post' ),
				'meta_key'  => self::META_KEY,
			)
		) );

		$all_ids = array_merge( $snippet_ids, $builder_ids );

		$query->set( 'post_type', array( self::TEMPLATE_CPT, 'page', 'post' ) );
		$query->set( 'post__in', $all_ids ?: array( 0 ) );
	}

	/**
	 * Replace the default WP list-table views with:
	 * All | Published | Snippets | Pages | Posts
	 *
	 * @param array $views Existing view links.
	 * @return array Replacement view links.
	 */
	public function get_builder_list_views( array $views ): array {
		$wpb_type       = isset( $_GET['wpb_type'] ) ? sanitize_key( wp_unslash( $_GET['wpb_type'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$current_status = isset( $_GET['post_status'] ) ? sanitize_key( wp_unslash( $_GET['post_status'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$base_url       = admin_url( 'edit.php?post_type=' . self::TEMPLATE_CPT );

		$snippet_all = $this->count_builder_list_posts( self::TEMPLATE_CPT );
		$snippet_pub = $this->count_builder_list_posts( self::TEMPLATE_CPT, 'publish' );
		$page_all    = $this->count_builder_list_posts( 'page' );
		$page_pub    = $this->count_builder_list_posts( 'page', 'publish' );
		$post_all    = $this->count_builder_list_posts( 'post' );
		$post_pub    = $this->count_builder_list_posts( 'post', 'publish' );

		$all_total = $snippet_all + $page_all + $post_all;
		$pub_total = $snippet_pub + $page_pub + $post_pub;

		return array(
			'all'     => $this->builder_view_link(
				$base_url,
				__( 'All', 'wp-builder' ),
				$all_total,
				'' === $wpb_type && '' === $current_status
			),
			'publish' => $this->builder_view_link(
				add_query_arg( 'post_status', 'publish', $base_url ),
				__( 'Published', 'wp-builder' ),
				$pub_total,
				'' === $wpb_type && 'publish' === $current_status
			),
			'snippet' => $this->builder_view_link(
				add_query_arg( 'wpb_type', 'snippet', $base_url ),
				__( 'Snippets', 'wp-builder' ),
				$snippet_all,
				'snippet' === $wpb_type
			),
			'page'    => $this->builder_view_link(
				add_query_arg( 'wpb_type', 'page', $base_url ),
				__( 'Pages', 'wp-builder' ),
				$page_all,
				'page' === $wpb_type
			),
			'post'    => $this->builder_view_link(
				add_query_arg( 'wpb_type', 'post', $base_url ),
				__( 'Posts', 'wp-builder' ),
				$post_all,
				'post' === $wpb_type
			),
		);
	}

	/**
	 * Add a "Type" column to the Builder Snippets list table.
	 *
	 * @param array $columns Existing column definitions.
	 * @return array Modified columns.
	 */
	public function add_builder_list_type_column( array $columns ): array {
		$new_columns = array();
		foreach ( $columns as $key => $label ) {
			$new_columns[ $key ] = $label;
			if ( 'title' === $key ) {
				$new_columns['wpb_type'] = __( 'Type', 'wp-builder' );
			}
		}
		return $new_columns;
	}

	/**
	 * Render the "Type" column value for each row.
	 *
	 * @param string $column  Column name.
	 * @param int    $post_id Post ID.
	 */
	public function render_builder_list_type_column( string $column, int $post_id ): void {
		if ( 'wpb_type' !== $column ) {
			return;
		}
		$post = get_post( $post_id );
		if ( ! $post ) {
			return;
		}
		switch ( $post->post_type ) {
			case self::TEMPLATE_CPT:
				esc_html_e( 'Snippet', 'wp-builder' );
				break;
			case 'page':
				esc_html_e( 'Page', 'wp-builder' );
				break;
			case 'post':
				esc_html_e( 'Post', 'wp-builder' );
				break;
		}
	}

	/**
	 * Count builder-managed posts of a given post type.
	 *
	 * For pages and posts, only those carrying the builder layout meta are counted.
	 * Snippets (wp_builder_template) are always counted in full.
	 *
	 * @param string $post_type Post type slug.
	 * @param string $status    Optional post status. Omit for all non-trash statuses.
	 * @return int
	 */
	private function count_builder_list_posts( string $post_type, string $status = '' ): int {
		$args = array(
			'post_type'              => $post_type,
			'post_status'            => $status ? array( $status ) : array( 'publish', 'draft', 'pending', 'private', 'future' ),
			'posts_per_page'         => 1,
			'no_found_rows'          => false,
			'update_post_meta_cache' => false,
			'update_post_term_cache' => false,
			'fields'                 => 'ids',
		);

		if ( self::TEMPLATE_CPT !== $post_type ) {
			$args['meta_key'] = self::META_KEY;
		}

		$q = new WP_Query( $args );
		return $q->found_posts;
	}

	/**
	 * Build a single view link HTML string.
	 *
	 * @param string $url     Destination URL.
	 * @param string $label   Human-readable label.
	 * @param int    $count   Item count to display.
	 * @param bool   $current Whether this is the currently active view.
	 * @return string
	 */
	private function builder_view_link( string $url, string $label, int $count, bool $current ): string {
		return sprintf(
			'<a href="%1$s"%2$s>%3$s <span class="count">(%4$d)</span></a>',
			esc_url( $url ),
			$current ? ' class="current" aria-current="page"' : '',
			esc_html( $label ),
			$count
		);
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
