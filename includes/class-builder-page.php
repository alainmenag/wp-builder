<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Builder_Page
 *
 * Handles the full-screen builder editor: routing, asset enqueueing,
 * and rendering the HTML document + shell.
 */
trait WP_Builder_Builder_Page {

	public function maybe_render_builder_request(): void {
		if ( ! $this->is_builder_request() ) {
			return;
		}

		$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$post    = $post_id ? get_post( $post_id ) : null;

		if ( ! $post || ! $this->is_supported_post_type( $post->post_type ) ) {
			wp_die( esc_html__( 'This post type is not supported by Builder.', 'wp-builder' ) );
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			wp_die( esc_html__( 'You do not have permission to edit this content.', 'wp-builder' ) );
		}

		$view = isset( $_GET['view'] ) ? sanitize_key( wp_unslash( $_GET['view'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		if ( 'json' === $view ) {
			status_header( 200 );
			nocache_headers();
			header( 'Content-Type: application/json; charset=' . get_option( 'blog_charset' ) );
			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			echo wp_json_encode( $this->get_layout( $post_id ), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
			exit;
		}

		$this->enqueue_builder_assets( $post_id );

		status_header( 200 );
		nocache_headers();
		$this->render_builder_document( $post );
		exit;
	}

	public function render_builder_page(): void {
		$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( $post_id ) {
			wp_safe_redirect( $this->get_builder_url( $post_id ) );
			exit;
		}

		wp_die( esc_html__( 'No post selected for Builder.', 'wp-builder' ) );
	}

	private function enqueue_builder_assets( int $post_id ): void {
		$asset_url   = WP_BUILDER_URL . 'assets/';
		$post        = get_post( $post_id );
		$is_template = $post && self::TEMPLATE_CPT === $post->post_type;
		$post_status = $post ? $post->post_status : 'draft';
		$preview_url = $is_template ? get_preview_post_link( $post_id ) : get_permalink( $post_id );

		// Load WordPress's bundled CodeMirror for the CSS editor (available since WP 4.9).
		wp_enqueue_style( 'code-editor' );
		wp_enqueue_script( 'code-editor' );

		wp_enqueue_style(
			'wp-builder-admin',
			$asset_url . 'admin.css',
			array( 'code-editor' ),
			self::VERSION
		);

		wp_enqueue_script(
			'wp-builder-admin',
			$asset_url . 'admin.js',
			array( 'code-editor' ),
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
				'pageTemplate'  => $is_template ? 'wp-builder-canvas' : ( get_post_meta( $post_id, '_wp_page_template', true ) ?: 'wp-builder-canvas' ),
				'pageTemplates' => $is_template ? array() : $this->get_available_page_templates( $post_id ),
				'i18n'       => array(
					'addContainer'   => __( 'Container', 'wp-builder' ),
					'canvas'         => __( 'Canvas', 'wp-builder' ),
					'delete'         => __( 'Delete', 'wp-builder' ),
					'emptyCanvas'    => __( 'Empty canvas', 'wp-builder' ),
					'emptyContainer' => __( 'Empty container', 'wp-builder' ),
					'root'           => __( 'Root', 'wp-builder' ),
					'renameTitle'    => __( 'Post title', 'wp-builder' ),
					'saved'          => __( 'Saved', 'wp-builder' ),
					'saving'         => __( 'Saving...', 'wp-builder' ),
					'selected'       => __( 'Selected', 'wp-builder' ),
					'unsaved'        => __( 'Unsaved changes', 'wp-builder' ),
				),
			)
		);
	}

	private function render_builder_document( WP_Post $post ): void {
		$title = sprintf(
			/* translators: %s: post title. */
			__( 'Builder: %s', 'wp-builder' ),
			get_the_title( $post )
		);
		// Prevent wp_head() from emitting a duplicate <title> tag.
		remove_action( 'wp_head', '_wp_render_title_tag', 1 );
		?>
		<!doctype html>
		<html <?php language_attributes(); ?>>
		<head>
			<meta charset="<?php bloginfo( 'charset' ); ?>">
			<meta name="viewport" content="width=device-width, initial-scale=1">
			<title><?php echo esc_html( $title ); ?></title>
			<?php wp_head(); ?>
		</head>
		<body class="wp-builder-body">
			<?php wp_body_open(); ?>
			<?php $this->render_builder_shell( $post ); ?>
			<?php wp_footer(); ?>
		</body>
		</html>
		<?php
	}

	private function render_builder_shell( WP_Post $post ): void {
		$post_id           = $post->ID;
		$is_template       = self::TEMPLATE_CPT === $post->post_type;
		$is_published      = 'publish' === $post->post_status;
		$preview_url       = $is_template ? get_preview_post_link( $post_id ) : get_permalink( $post_id );
		$shortcode         = '[wp_builder_content id=\'' . absint( $post_id ) . '\']';
		$page_templates    = $is_template ? array() : $this->get_available_page_templates( $post_id );
		$current_template  = $is_template ? 'wp-builder-canvas' : ( get_post_meta( $post_id, '_wp_page_template', true ) ?: 'wp-builder-canvas' );
		?>
		<div class="wp-builder-shell" id="wp-builder-app">

			<div class="wp-builder-workspace">

				<main class="wp-builder-canvas-panel" aria-label="<?php esc_attr_e( 'Builder canvas', 'wp-builder' ); ?>">
					<div id="wp-builder-canvas" class="wp-builder-canvas"></div>
				</main>

				<aside class="wp-builder-panel wp-builder-left-panel" aria-label="<?php esc_attr_e( 'Builder panels', 'wp-builder' ); ?>">

					<div>
						<button type="button" id="wp-builder-title" class="wp-builder-title-button" aria-label="<?php esc_attr_e( 'Edit post title', 'wp-builder' ); ?>"><?php echo esc_html( get_the_title( $post_id ) ); ?></button>
					</div>

					<div class="wp-builder-template-actions">
						<a id="wp-builder-view-link" class="wp-builder-button wp-builder-button-secondary" href="<?php echo esc_url( $preview_url ); ?>" target="_blank" rel="noreferrer">
							<?php esc_html_e( 'View', 'wp-builder' ); ?>
						</a>
						<a class="wp-builder-button wp-builder-button-secondary" href="<?php echo esc_url( add_query_arg( 'view', 'json', $this->get_builder_url( $post_id ) ) ); ?>" target="_blank" rel="noreferrer">
							<?php esc_html_e( 'Export', 'wp-builder' ); ?>
						</a>
						<button class="wp-builder-button wp-builder-button-primary" type="button" id="wp-builder-save">
							<span id="wp-builder-save-status" role="status" aria-live="polite"></span>
							<span><?php esc_html_e( 'Save', 'wp-builder' ); ?></span>
						</button>
					</div>

					<!-- Tab bar -->
					<div class="wp-builder-tabs" role="tablist">
						<button type="button" class="wp-builder-tab-btn is-active" role="tab" aria-selected="true" aria-controls="wp-builder-tab-page" id="wp-builder-tab-btn-page">
							<?php esc_html_e( 'Main', 'wp-builder' ); ?>
						</button>
						<button type="button" class="wp-builder-tab-btn" role="tab" aria-selected="false" aria-controls="wp-builder-tab-element" id="wp-builder-tab-btn-element">
							<?php esc_html_e( 'Element', 'wp-builder' ); ?>
						</button>
					</div>

					<!-- Tab panel: Page -->
					<div class="wp-builder-tab-panel" id="wp-builder-tab-page" role="tabpanel" aria-labelledby="wp-builder-tab-btn-page">

						<!-- Accordion: Settings (open by default) -->
						<div class="wp-builder-accordion is-open" id="wp-builder-accordion-settings">
							<button type="button" class="wp-builder-accordion-header" aria-expanded="true" aria-controls="wp-builder-accordion-settings-body">
								<span><?php esc_html_e( 'Settings', 'wp-builder' ); ?></span>
								<span class="wp-builder-accordion-chevron" aria-hidden="true"></span>
							</button>
							<div class="wp-builder-accordion-body" id="wp-builder-accordion-settings-body" role="region">
								<div class="wp-builder-accordion-body-inner">
									<div class="wp-builder-field-group">
										<label class="wp-builder-inspector-label" for="wp-builder-post-status"><?php esc_html_e( 'Status', 'wp-builder' ); ?></label>
										<select id="wp-builder-post-status" class="wp-builder-select">
											<option value="publish"><?php esc_html_e( 'Published', 'wp-builder' ); ?></option>
											<option value="draft"><?php esc_html_e( 'Draft', 'wp-builder' ); ?></option>
											<option value="pending"><?php esc_html_e( 'Pending Review', 'wp-builder' ); ?></option>
											<option value="private"><?php esc_html_e( 'Private', 'wp-builder' ); ?></option>
										</select>
									</div>
									<?php if ( $is_template ) : ?>
									<div class="wp-builder-field-group">
										<label class="wp-builder-inspector-label" for="wp-builder-page-template"><?php esc_html_e( 'Template', 'wp-builder' ); ?></label>
										<select id="wp-builder-page-template" class="wp-builder-select" disabled>
											<option value="wp-builder-canvas" selected><?php esc_html_e( 'Builder Canvas', 'wp-builder' ); ?></option>
										</select>
									</div>
									<?php elseif ( ! empty( $page_templates ) ) : ?>
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
							</div>
						</div>

						<!-- Accordion: Shortcode -->
						<div class="wp-builder-accordion" id="wp-builder-accordion-shortcode">
							<button type="button" class="wp-builder-accordion-header" aria-expanded="false" aria-controls="wp-builder-accordion-shortcode-body">
								<span><?php esc_html_e( 'Shortcode', 'wp-builder' ); ?></span>
								<span class="wp-builder-accordion-chevron" aria-hidden="true"></span>
							</button>
							<div class="wp-builder-accordion-body" id="wp-builder-accordion-shortcode-body" role="region">
								<div class="wp-builder-accordion-body-inner">
									<div id="wp-builder-shortcode-panel" class="wp-builder-field-group">
										<label class="wp-builder-inspector-label"><?php esc_html_e( 'Shortcode', 'wp-builder' ); ?></label>
										<pre class="wp-builder-shortcode-pre"><?php echo esc_html( $shortcode ); ?></pre>
									</div>
								</div>
							</div>
						</div>

					</div>

					<!-- Tab panel: Element -->
					<div class="wp-builder-tab-panel" id="wp-builder-tab-element" role="tabpanel" aria-labelledby="wp-builder-tab-btn-element" hidden>

						<!-- Accordion: Identity (open by default) -->
						<div class="wp-builder-accordion is-open" id="wp-builder-accordion-identity">
							<button type="button" class="wp-builder-accordion-header" aria-expanded="true" aria-controls="wp-builder-accordion-identity-body">
								<span><?php esc_html_e( 'Identity', 'wp-builder' ); ?></span>
								<span class="wp-builder-accordion-chevron" aria-hidden="true"></span>
							</button>
							<div class="wp-builder-accordion-body" id="wp-builder-accordion-identity-body" role="region">
								<div class="wp-builder-accordion-body-inner">
									<div class="wp-builder-inspector-selection">
										<span class="wp-builder-inspector-label"><?php esc_html_e( 'Selected', 'wp-builder' ); ?></span>
										<strong id="wp-builder-selection-name"><?php esc_html_e( 'Root', 'wp-builder' ); ?></strong>
									</div>
									<div id="wp-builder-inspector-node" class="wp-builder-field-group" hidden>
										<label class="wp-builder-inspector-label" for="wp-builder-node"><?php esc_html_e( 'Node', 'wp-builder' ); ?></label>
										<select id="wp-builder-node" class="wp-builder-select">
											<option value="div">div</option>
											<option value="section">section</option>
											<option value="article">article</option>
											<option value="main">main</option>
											<option value="aside">aside</option>
											<option value="header">header</option>
											<option value="footer">footer</option>
											<option value="nav">nav</option>
											<option value="p">p</option>
											<option value="span">span</option>
											<option value="h1">h1</option>
											<option value="h2">h2</option>
											<option value="h3">h3</option>
											<option value="h4">h4</option>
											<option value="h5">h5</option>
											<option value="h6">h6</option>
											<option value="a">a</option>
											<option value="button">button</option>
											<option value="figure">figure</option>
											<option value="figcaption">figcaption</option>
											<option value="img">img</option>
											<option value="input">input</option>
											<option value="label">label</option>
											<option value="audio">audio</option>
											<option value="video">video</option>
											<option value="source">source</option>
											<option value="iframe">iframe</option>
										</select>
									</div>
								</div>
							</div>
						</div>

						<!-- Accordion: Content -->
						<div class="wp-builder-accordion" id="wp-builder-accordion-content">
							<button type="button" class="wp-builder-accordion-header" aria-expanded="false" aria-controls="wp-builder-accordion-content-body">
								<span><?php esc_html_e( 'Content', 'wp-builder' ); ?></span>
								<span class="wp-builder-accordion-chevron" aria-hidden="true"></span>
							</button>
							<div class="wp-builder-accordion-body" id="wp-builder-accordion-content-body" role="region">
								<div class="wp-builder-accordion-body-inner">
									<div id="wp-builder-inspector-editor" class="wp-builder-inspector-editor" hidden>
										<label class="wp-builder-inspector-label" for="wp-builder-html-content">
											<?php esc_html_e( 'Content', 'wp-builder' ); ?>
										</label>
										<textarea id="wp-builder-html-content" class="wp-builder-html-editor" rows="12" spellcheck="false" placeholder="<?php esc_attr_e( 'Enter your here…', 'wp-builder' ); ?>"></textarea>
									</div>
									<div id="wp-builder-inspector-node-attrs" class="wp-builder-inspector-body-list" hidden></div>
								</div>
							</div>
						</div>

						<!-- Accordion: Layout -->
						<div class="wp-builder-accordion" id="wp-builder-accordion-layout">
							<button type="button" class="wp-builder-accordion-header" aria-expanded="false" aria-controls="wp-builder-accordion-layout-body">
								<span><?php esc_html_e( 'Layout', 'wp-builder' ); ?></span>
								<span class="wp-builder-accordion-chevron" aria-hidden="true"></span>
							</button>
							<div class="wp-builder-accordion-body" id="wp-builder-accordion-layout-body" role="region">
								<div class="wp-builder-accordion-body-inner">
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
								</div>
							</div>
						</div>

						<!-- Accordion: Style -->
						<div class="wp-builder-accordion" id="wp-builder-accordion-style">
							<button type="button" class="wp-builder-accordion-header" aria-expanded="false" aria-controls="wp-builder-accordion-style-body">
								<span><?php esc_html_e( 'Style', 'wp-builder' ); ?></span>
								<span class="wp-builder-accordion-chevron" aria-hidden="true"></span>
							</button>
							<div class="wp-builder-accordion-body" id="wp-builder-accordion-style-body" role="region">
								<div class="wp-builder-accordion-body-inner">
									<div class="wp-builder-field-group">
										<p class="wp-builder-inspector-label"><?php esc_html_e( 'Custom CSS', 'wp-builder' ); ?></p>
										<p class="wp-builder-inspector-hint"><?php esc_html_e( 'Use', 'wp-builder' ); ?> <code>self</code> <?php esc_html_e( 'to target this element.', 'wp-builder' ); ?></p>
										<textarea id="wp-builder-custom-css" class="wp-builder-html-editor" rows="8" spellcheck="false" placeholder="self {&#10;  background-color: red;&#10;}"></textarea>
									</div>
								</div>
							</div>
						</div>

					</div>

				</aside>

			</div>
		</div>
		<?php
	}
}
