<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait WP_Builder_Layout
 *
 * Handles all layout data: loading, sanitising, rendering, and counting elements.
 */
trait WP_Builder_Layout {

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
			'node'     => 'div',
			'content'  => '',
			'elements' => array(),
		);
	}

	private function sanitize_layout( array $layout ): array {
		$elements = isset( $layout['elements'] ) && is_array( $layout['elements'] ) ? $layout['elements'] : array();
		$node     = isset( $layout['node'] ) ? $this->sanitize_node_tag( (string) $layout['node'] ) : 'div';
		$content  = isset( $layout['content'] ) ? wp_kses_post( (string) $layout['content'] ) : '';

		return array(
			'version'  => 1,
			'node'     => $node,
			'content'  => $content,
			'elements' => $this->sanitize_elements( $elements ),
		);
	}

	private function sanitize_node_tag( string $tag ): string {
		$allowed = array( 'div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button', 'figure', 'figcaption', 'img', 'input', 'label', 'audio', 'video', 'source', 'iframe' );
		return in_array( $tag, $allowed, true ) ? $tag : 'div';
	}

	private function get_node_glossary(): array {
		return array(
			'img'    => array(
				array( 'name' => 'src',    'type' => 'url' ),
				array( 'name' => 'alt',    'type' => 'text' ),
				array( 'name' => 'width',  'type' => 'number' ),
				array( 'name' => 'height', 'type' => 'number' ),
			),
			'a'      => array(
				array( 'name' => 'href',   'type' => 'url' ),
				array( 'name' => 'target', 'type' => 'text' ),
				array( 'name' => 'rel',    'type' => 'text' ),
			),
			'input'  => array(
				array( 'name' => 'type',        'type' => 'text' ),
				array( 'name' => 'name',        'type' => 'text' ),
				array( 'name' => 'placeholder', 'type' => 'text' ),
			),
			'button' => array(
				array( 'name' => 'type', 'type' => 'text' ),
			),
			'video'  => array(
				array( 'name' => 'src',      'type' => 'url' ),
				array( 'name' => 'width',    'type' => 'number' ),
				array( 'name' => 'height',   'type' => 'number' ),
				array( 'name' => 'controls', 'type' => 'text' ),
				array( 'name' => 'autoplay', 'type' => 'text' ),
			),
			'audio'  => array(
				array( 'name' => 'src',      'type' => 'url' ),
				array( 'name' => 'controls', 'type' => 'text' ),
			),
			'iframe' => array(
				array( 'name' => 'src',    'type' => 'url' ),
				array( 'name' => 'width',  'type' => 'number' ),
				array( 'name' => 'height', 'type' => 'number' ),
				array( 'name' => 'title',  'type' => 'text' ),
			),
			'source' => array(
				array( 'name' => 'src',  'type' => 'url' ),
				array( 'name' => 'type', 'type' => 'text' ),
			),
		);
	}

	private function sanitize_node_attrs( string $node, array $raw ): array {
		$glossary    = $this->get_node_glossary();
		$descriptors = isset( $glossary[ $node ] ) ? $glossary[ $node ] : array();
		$clean       = array();

		foreach ( $descriptors as $desc ) {
			$name  = $desc['name'];
			$type  = $desc['type'];
			$value = isset( $raw[ $name ] ) ? (string) $raw[ $name ] : '';

			if ( '' === $value ) {
				continue;
			}

			if ( 'url' === $type ) {
				$value = esc_url_raw( $value );
			} elseif ( 'number' === $type ) {
				$value = (string) absint( $value );
			} else {
				$value = sanitize_text_field( $value );
			}

			if ( '' !== $value ) {
				$clean[ $name ] = $value;
			}
		}

		return $clean;
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
				$content    = isset( $element['content'] ) ? wp_kses_post( (string) $element['content'] ) : '';
				$node       = isset( $element['node'] ) ? $this->sanitize_node_tag( (string) $element['node'] ) : 'div';
				$raw_attrs  = isset( $element['attrs'] ) && is_array( $element['attrs'] ) ? $element['attrs'] : array();
				$clean[]    = array(
					'id'        => $id ? $id : wp_unique_id( 'container-' ),
					'type'      => 'container',
					'node'      => $node,
					'props'     => $this->sanitize_container_props( $props ),
					'customCss' => $this->sanitize_custom_css( $custom_css ),
					'content'   => $content,
					'attrs'     => $this->sanitize_node_attrs( $node, $raw_attrs ),
					'children'  => $this->sanitize_elements( $children ),
				);
			} elseif ( 'html' === $element['type'] ) {
				// Migrate legacy html elements to containers.
				$content = isset( $element['content'] ) ? wp_kses_post( (string) $element['content'] ) : '';
				$clean[] = array(
					'id'        => $id ? $id : wp_unique_id( 'container-' ),
					'type'      => 'container',
					'node'      => 'div',
					'props'     => $this->sanitize_container_props( array() ),
					'customCss' => '',
					'content'   => $content,
					'children'  => array(),
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
				$content    = isset( $element['content'] ) ? $element['content'] : '';
				$tag        = isset( $element['node'] ) ? $this->sanitize_node_tag( (string) $element['node'] ) : 'div';
				$node_attrs = isset( $element['attrs'] ) && is_array( $element['attrs'] ) ? $element['attrs'] : array();
				$is_void    = in_array( $tag, array( 'img', 'input', 'source', 'br', 'hr' ), true );

				$inline_style = $this->build_container_inline_style( $props );
				$style_attr   = $inline_style ? ' style="' . esc_attr( $inline_style ) . '"' : '';

				$extra_attrs = '';
				foreach ( $node_attrs as $attr_name => $attr_value ) {
					$attr_name = sanitize_key( $attr_name );
					if ( $attr_name && '' !== $attr_value ) {
						$extra_attrs .= ' ' . esc_attr( $attr_name ) . '="' . esc_attr( $attr_value ) . '"';
					}
				}

				$css_block = '';
				if ( $custom_css !== '' && $id ) {
					$selector   = '.wp-builder-container[data-wp-builder-id="' . esc_attr( $id ) . '"]';
					$scoped_css = preg_replace( '/\bself\b/', $selector, $custom_css );
					$css_block  = '<style>' . $scoped_css . '</style>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- CSS sanitized by sanitize_custom_css(); no WP escape function exists for raw CSS.
				}

				if ( $is_void ) {
					$output .= $css_block . sprintf(
						'<%1$s class="wp-builder-container" data-wp-builder-id="%2$s"%3$s%4$s />',
						$tag,
						esc_attr( $id ),
						$style_attr,
						$extra_attrs
					);
				} else {
					$output .= $css_block . sprintf( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $content pre-sanitized via wp_kses_post in sanitize_elements().
						'<%1$s class="wp-builder-container" data-wp-builder-id="%2$s"%3$s%4$s>%5$s%6$s</%1$s>',
						$tag,
						esc_attr( $id ),
						$style_attr,
						$extra_attrs,
						$content,
						$this->render_elements( $children )
					);
				}
			} elseif ( 'html' === $element['type'] ) {
				// Render legacy html elements as containers.
				$content = isset( $element['content'] ) ? $element['content'] : '';
				$output .= sprintf( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $content pre-sanitized via wp_kses_post in sanitize_elements().
					'<div class="wp-builder-container" data-wp-builder-id="%1$s">%2$s</div>',
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
}
