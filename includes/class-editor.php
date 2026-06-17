<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Editor
 *
 * Handles the full-screen builder editor: routing, asset enqueueing,
 * and rendering the HTML document + shell.
 */
trait WP_Builder_Editor {

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

		// Populate the global $post so that admin-bar callbacks such as
		// wp_admin_bar_edit_menu() can call get_post() without returning null.
		$GLOBALS['post'] = $post; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		setup_postdata( $post );

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
		$asset_url = WP_BUILDER_URL . 'assets/';
		$ctx       = $this->get_post_context( $post_id );

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
			$asset_url . 'js/editor.js',
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
				'isTemplate' => $ctx['is_template'],
				'postStatus' => $ctx['post_status'],
				'layout'     => $this->get_layout( $post_id ),
				'editUrl'    => get_edit_post_link( $post_id, '' ),
				'previewUrl' => $ctx['preview_url'],
				'pageTemplate'  => $ctx['current_template'],
				'pageTemplates' => $ctx['page_templates'],
				'i18n'       => array(
					'addContainer'    => __( 'Container', 'wp-builder' ),
					'delete'          => __( 'Delete', 'wp-builder' ),
					'emptyContainer'  => __( 'Empty container', 'wp-builder' ),
					'saved'           => __( 'Saved', 'wp-builder' ),
					'saving'          => __( 'Saving...', 'wp-builder' ),
					'selected'        => __( 'Selected', 'wp-builder' ),
					'unsaved'         => __( 'Unsaved changes', 'wp-builder' ),
					'statusPublished' => __( 'Published', 'wp-builder' ),
					'statusDraft'     => __( 'Draft', 'wp-builder' ),
					'statusPending'   => __( 'Pending Review', 'wp-builder' ),
					'statusPrivate'   => __( 'Private', 'wp-builder' ),
				),
			)
		);
	}

	private function render_builder_document( WP_Post $post ): void {
		$title = $this->get_builder_doc_title( $post->ID );
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
		$post_id          = $post->ID;
		$ctx              = $this->get_post_context( $post_id );
		$preview_url      = $ctx['preview_url'];

		$status_labels = array(
			'publish'  => __( 'Published', 'wp-builder' ),
			'draft'    => __( 'Draft', 'wp-builder' ),
			'pending'  => __( 'Pending Review', 'wp-builder' ),
			'private'  => __( 'Private', 'wp-builder' ),
		);
		$status_label  = isset( $status_labels[ $post->post_status ] ) ? $status_labels[ $post->post_status ] : ucfirst( $post->post_status );

		$schema = $this->get_panel_schema( $post_id );
		?>
		<div class="wp-builder-shell" id="wp-builder-app">

			<div class="wp-builder-workspace">

				<main class="wp-builder-stage-panel" aria-label="<?php esc_attr_e( 'Builder canvas', 'wp-builder' ); ?>">
					<div id="wp-builder-stage" class="wp-builder-stage"></div>
				</main>

				<aside class="wp-builder-panel wp-builder-left-panel" aria-label="<?php esc_attr_e( 'Builder panels', 'wp-builder' ); ?>">

					<div>
						<button type="button" id="wp-builder-title" class="wp-builder-title-button" aria-label="<?php esc_attr_e( 'Edit post title', 'wp-builder' ); ?>"><?php echo esc_html( get_the_title( $post_id ) ); ?></button>
						<button type="button" id="wp-builder-post-status-badge" class="wp-builder-status-badge" aria-label="<?php esc_attr_e( 'Edit post status', 'wp-builder' ); ?>"><?php echo esc_html( $status_label ); ?></button>
						<div class="wp-builder-selection-identity">
							<button type="button" id="wp-builder-selection-node" class="wp-builder-selection-part" aria-label="<?php esc_attr_e( 'Edit node type', 'wp-builder' ); ?>"></button>
							<span class="wp-builder-selection-sep" aria-hidden="true">·</span>
							<button type="button" id="wp-builder-selection-id" class="wp-builder-selection-part" aria-label="<?php esc_attr_e( 'Edit element ID', 'wp-builder' ); ?>"></button>
						</div>
					</div>

					<div class="wp-builder-editor-actions">
						<a id="wp-builder-view-link" class="wp-builder-button wp-builder-button-secondary" href="<?php echo esc_url( $preview_url ); ?>" target="_blank" rel="noreferrer" style="flex: 0;">
							<?php esc_html_e( 'View', 'wp-builder' ); ?>
						</a>
						<button class="wp-builder-button wp-builder-button-primary" type="button" id="wp-builder-save">
							<span id="wp-builder-save-status" role="status" aria-live="polite"></span>
							<span><?php esc_html_e( 'Save', 'wp-builder' ); ?></span>
						</button>
					</div>

					<!-- Tab bar -->
					<div class="wp-builder-tabs" role="tablist">
						<?php foreach ( $schema as $index => $tab ) : ?>
						<button
							type="button"
							class="wp-builder-tab-btn<?php echo 0 === $index ? ' is-active' : ''; ?>"
							role="tab"
							aria-selected="<?php echo 0 === $index ? 'true' : 'false'; ?>"
							aria-controls="<?php echo esc_attr( $tab['id'] ); ?>"
							id="wp-builder-tab-btn-<?php echo esc_attr( $tab['key'] ); ?>"
							data-tab-key="<?php echo esc_attr( $tab['key'] ); ?>"
						>
							<?php echo esc_html( $tab['label'] ); ?>
						</button>
						<?php endforeach; ?>
					</div>

					<!-- Tab panels -->
					<?php foreach ( $schema as $index => $tab ) : ?>
						<?php $this->render_tab_panel( $tab, 0 === $index ); ?>
					<?php endforeach; ?>

				</aside>

			</div>
		</div>
		<?php
	}

	/**
	 * Render a single tab panel and all its accordions.
	 *
	 * @param array $tab    Tab definition from get_panel_schema().
	 * @param bool  $active Whether this is the initially visible tab.
	 */
	private function render_tab_panel( array $tab, bool $active ): void {
		?>
		<div
			class="wp-builder-tab-panel"
			id="<?php echo esc_attr( $tab['id'] ); ?>"
			role="tabpanel"
			aria-labelledby="wp-builder-tab-btn-<?php echo esc_attr( $tab['key'] ); ?>"
			<?php echo $active ? '' : 'hidden'; ?>
		>
			<?php foreach ( $tab['accordions'] as $accordion ) : ?>
				<?php $this->render_accordion( $accordion ); ?>
			<?php endforeach; ?>
		</div>
		<?php
	}

	/**
	 * Render a single accordion section.
	 *
	 * @param array $accordion Accordion definition from get_panel_schema().
	 */
	private function render_accordion( array $accordion ): void {
		$id        = 'wp-builder-accordion-' . $accordion['slug'];
		$body_id   = $id . '-body';
		$is_open   = ! empty( $accordion['open'] );
		?>
		<div class="wp-builder-accordion<?php echo $is_open ? ' is-open' : ''; ?>" id="<?php echo esc_attr( $id ); ?>">
			<button type="button" class="wp-builder-accordion-header" aria-expanded="<?php echo $is_open ? 'true' : 'false'; ?>" aria-controls="<?php echo esc_attr( $body_id ); ?>">
				<span><?php echo esc_html( $accordion['label'] ); ?></span>
				<span class="wp-builder-accordion-chevron" aria-hidden="true"></span>
			</button>
			<div class="wp-builder-accordion-body" id="<?php echo esc_attr( $body_id ); ?>" role="region">
				<div class="wp-builder-accordion-body-inner">
					<?php foreach ( $accordion['fields'] as $field ) : ?>
					<?php $this->render_field_group( $field ); ?>
				<?php endforeach; ?>
				</div>
			</div>
		</div>
		<?php
	}

	/**
	 * Render a single field group within an accordion body.
	 *
	 * Supported types:
	 *   text        id, label, label_tag, value, placeholder, attrs, wrapper_id, wrapper_hidden
	 *   number      id, label, label_tag, value, placeholder, attrs, wrapper_id, wrapper_hidden
	 *   select      id, label, label_tag, options, attrs, wrapper_id, wrapper_hidden
	 *   textarea    id, label, label_tag, hint, attrs, wrapper_id, wrapper_class, wrapper_hidden
	 *   pre         label, content, wrapper_id
	 *   link        label, href, id (on <a>), attrs, wrapper_id
	 *   container   id, class, hidden, fields (nested array; no field-group chrome)
	 *
	 * Shared optional keys (all non-container types):
	 *   wrapper_id     string  id attribute on the field-group wrapper <div>
	 *   wrapper_class  string  class override on the wrapper <div> (default wp-builder-field-group)
	 *   wrapper_hidden bool    add hidden attribute to the wrapper <div>
	 *   hint           string  HTML hint paragraph below the label (<code> tags allowed)
	 *   label_tag      string  'label' (default) or 'p'
	 *
	 * @param array $field Field descriptor.
	 */
	private function render_field_group( array $field ): void {
		$type = $field['type'] ?? '';

		// Container — a wrapper div with optional nested fields, no field-group chrome.
		if ( 'container' === $type ) {
			$cont_id     = ! empty( $field['id'] )    ? ' id="' . esc_attr( $field['id'] ) . '"'       : '';
			$cont_class  = ! empty( $field['class'] ) ? ' class="' . esc_attr( $field['class'] ) . '"' : '';
			$cont_hidden = ! empty( $field['hidden'] ) ? ' hidden' : '';
			echo '<div' . $cont_id . $cont_class . $cont_hidden . '>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			foreach ( ( $field['fields'] ?? array() ) as $nested ) {
				$this->render_field_group( $nested );
			}
			echo '</div>';
			return;
		}

		// Field-group wrapper for all other types.
		$wrapper_class  = ! empty( $field['wrapper_class'] ) ? esc_attr( $field['wrapper_class'] ) : 'wp-builder-field-group';
		$wrapper_id     = ! empty( $field['wrapper_id'] ) ? ' id="' . esc_attr( $field['wrapper_id'] ) . '"' : '';
		$wrapper_hidden = ! empty( $field['wrapper_hidden'] ) ? ' hidden' : '';
		$extra          = $this->build_extra_attrs( $field['attrs'] ?? array() );
		?>
		<div class="<?php echo $wrapper_class; ?>"<?php echo $wrapper_id; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php echo $wrapper_hidden; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
			<?php $this->render_field_label( $field ); ?>
			<?php if ( ! empty( $field['hint'] ) ) : ?>
			<p class="wp-builder-inspector-hint"><?php echo wp_kses( $field['hint'], array( 'code' => array() ) ); ?></p>
			<?php endif; ?>
			<?php
			switch ( $type ) {
				case 'text':
				case 'number':
					printf( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
						'<input type="%s" class="wp-builder-input"%s%s%s%s>',
						esc_attr( 'number' === $type ? 'number' : 'text' ),
						! empty( $field['id'] )          ? ' id="' . esc_attr( $field['id'] ) . '"'                  : '',
						isset( $field['value'] )         ? ' value="' . esc_attr( $field['value'] ) . '"'            : '',
						! empty( $field['placeholder'] ) ? ' placeholder="' . esc_attr( $field['placeholder'] ) . '"' : '',
						$extra
					);
					break;

				case 'select':
					printf( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
						'<select class="wp-builder-select"%s%s>',
						! empty( $field['id'] ) ? ' id="' . esc_attr( $field['id'] ) . '"' : '',
						$extra
					);
					foreach ( ( $field['options'] ?? array() ) as $opt ) {
						printf( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
							'<option value="%s"%s>%s</option>',
							esc_attr( $opt['value'] ),
							! empty( $opt['selected'] ) ? ' selected' : '',
							esc_html( $opt['label'] )
						);
					}
					echo '</select>';
					break;

				case 'textarea':
					printf( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
						'<textarea class="wp-builder-html-editor"%s%s></textarea>',
						! empty( $field['id'] ) ? ' id="' . esc_attr( $field['id'] ) . '"' : '',
						$extra
					);
					break;

				case 'pre':
					echo '<pre class="wp-builder-embed-code">' . esc_html( $field['content'] ?? '' ) . '</pre>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
					break;

				case 'link':
					printf( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
						'<a class="wp-builder-button wp-builder-button-secondary"%s href="%s"%s>%s</a>',
						! empty( $field['id'] ) ? ' id="' . esc_attr( $field['id'] ) . '"' : '',
						! empty( $field['href'] ) ? esc_url( $field['href'] ) : '#',
						$extra,
						esc_html( $field['label'] ?? '' )
					);
					break;
			}
			?>
		</div>
		<?php
	}

	/**
	 * Render a label element for a field descriptor.
	 *
	 * Uses <label for="..."> when a field id is present and label_tag is 'label',
	 * or <p> when label_tag is 'p'. Outputs nothing if label is empty.
	 *
	 * @param array $field Field descriptor.
	 */
	private function render_field_label( array $field ): void {
		if ( empty( $field['label'] ) ) {
			return;
		}
		$use_p = ! empty( $field['label_tag'] ) && 'p' === $field['label_tag'];
		if ( $use_p ) {
			?>
			<p class="wp-builder-inspector-label"><?php echo esc_html( $field['label'] ); ?></p>
			<?php
		} elseif ( ! empty( $field['id'] ) ) {
			?>
			<label class="wp-builder-inspector-label" for="<?php echo esc_attr( $field['id'] ); ?>"><?php echo esc_html( $field['label'] ); ?></label>
			<?php
		} else {
			?>
			<label class="wp-builder-inspector-label"><?php echo esc_html( $field['label'] ); ?></label>
			<?php
		}
	}

	/**
	 * Build a string of extra HTML attributes from a key/value map.
	 *
	 * Boolean true emits a standalone attribute (e.g. disabled).
	 * False or empty string skips the attribute entirely.
	 *
	 * @param array $attrs Key/value pairs.
	 * @return string Space-prefixed attribute string, already escaped, safe to echo.
	 */
	private function build_extra_attrs( array $attrs ): string {
		$str = '';
		foreach ( $attrs as $key => $value ) {
			if ( true === $value ) {
				$str .= ' ' . esc_attr( $key );
			} elseif ( false !== $value && '' !== (string) $value ) {
				$str .= ' ' . esc_attr( $key ) . '="' . esc_attr( (string) $value ) . '"';
			}
		}
		return $str;
	}

	/**
	 * Build the full tab/accordion schema for the editor right panel.
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

	/**
	 * Build a context array for a given post containing the values that both
	 * enqueue_builder_assets() and render_builder_shell() need.
	 *
	 * @param int $post_id Post ID.
	 * @return array {
	 *     @type bool   $is_template      Whether the post is a builder template CPT.
	 *     @type string $post_status      The post's current status.
	 *     @type string $preview_url      Frontend preview URL.
	 *     @type string $current_template Active page-template slug.
	 *     @type array  $page_templates   Available page templates (empty for templates).
	 * }
	 */
	private function get_post_context( int $post_id ): array {
		$post        = get_post( $post_id );
		$is_template = $post && self::TEMPLATE_CPT === $post->post_type;

		return array(
			'is_template'      => $is_template,
			'post_status'      => $post ? $post->post_status : 'draft',
			'preview_url'      => $this->get_preview_url( $post_id ),
			'current_template' => $is_template ? 'wp-builder-canvas' : ( get_post_meta( $post_id, '_wp_page_template', true ) ?: 'wp-builder-canvas' ),
			'page_templates'   => $is_template ? array() : $this->get_available_page_templates( $post_id ),
		);
	}

	/**
	 * Add type="module" to the wp-builder-admin script tag so the browser
	 * treats assets/js/editor.js as a native ES module.
	 *
	 * wp_localize_script emits a separate inline <script> block (no type
	 * attribute) that sets var wpBuilder = {...} before this tag, so
	 * window.wpBuilder is available when the deferred module executes.
	 *
	 * @param string $tag    The full <script> tag HTML.
	 * @param string $handle The registered script handle.
	 * @return string
	 */
	public function add_module_type_to_script_tag( string $tag, string $handle ): string {
		if ( 'wp-builder-admin' !== $handle ) {
			return $tag;
		}
		// Strip any legacy type="text/javascript" attribute WordPress may add.
		$tag = str_replace( " type='text/javascript'", '', $tag );
		$tag = str_replace( ' type="text/javascript"', '', $tag );
		// Inject type="module" immediately after the opening <script token.
		return str_replace( '<script ', '<script type="module" ', $tag );
	}
}
