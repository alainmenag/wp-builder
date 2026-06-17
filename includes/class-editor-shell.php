<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Editor_Shell
 *
 * Renders the full-screen editor HTML document, app shell, tab panels,
 * accordions, and individual field groups.
 */
trait WP_Builder_Editor_Shell {

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
}
