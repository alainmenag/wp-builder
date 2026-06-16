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
		return ! empty( $layout['children'] );
	}

	private function empty_layout(): array {
		$now = time();
		return array(
			'version'   => 2,
			'createdAt' => $now,
			'updatedAt' => $now,
			'children'  => array(
				array(
					'id'        => $this->generate_element_id(),
					'node'      => 'div',
					'props'     => array( 'flexDirection' => '', 'flexGrow' => '', 'gap' => '' ),
					'style'     => '',
					'content'   => '',
					'attrs'     => array(),
					'children'  => array(),
				),
			),
		);
	}

	private function sanitize_layout( array $layout ): array {
		$now = time();

		// Migrate v1 layouts: root element fields lived at the top level; child elements were in 'elements'.
		if ( ! isset( $layout['version'] ) || (int) $layout['version'] < 2 ) {
			$node       = isset( $layout['node'] ) ? $this->sanitize_node_tag( (string) $layout['node'] ) : 'div';
			$content    = isset( $layout['content'] ) ? wp_kses_post( (string) $layout['content'] ) : '';
			$props      = isset( $layout['props'] ) && is_array( $layout['props'] ) ? $layout['props'] : array();
			$custom_style = isset( $layout['style'] ) ? (string) $layout['style'] : ( isset( $layout['customStyle'] ) ? (string) $layout['customStyle'] : '' );
			$raw_attrs  = isset( $layout['attrs'] ) && is_array( $layout['attrs'] ) ? $layout['attrs'] : array();
			$elements   = isset( $layout['elements'] ) && is_array( $layout['elements'] ) ? $layout['elements'] : array();

			$root = array(
				'id'        => isset( $layout['id'] ) && is_string( $layout['id'] ) && '' !== $layout['id'] ? sanitize_key( $layout['id'] ) : $this->generate_element_id(),
				'node'      => $node,
				'props'     => $this->sanitize_container_props( $props ),
				'customStyle' => $this->sanitize_custom_style( $custom_style ),
				'content'   => $content,
				'attrs'     => $this->sanitize_node_attrs( $node, $raw_attrs ),
				'children'  => $this->sanitize_elements( $elements ),
			);

			return array(
				'version'   => 2,
				'createdAt' => $now,
				'updatedAt' => $now,
				'children'  => array( $root ),
			);
		}

		// v2 layout: the root element is children[0].
		$created_at = isset( $layout['createdAt'] ) ? absint( $layout['createdAt'] ) : $now;
		$raw_children = isset( $layout['children'] ) && is_array( $layout['children'] ) ? $layout['children'] : array();
		$root_data    = ! empty( $raw_children[0] ) && is_array( $raw_children[0] ) ? $raw_children[0] : array();

		$node       = isset( $root_data['node'] ) ? $this->sanitize_node_tag( (string) $root_data['node'] ) : 'div';
		$content    = isset( $root_data['content'] ) ? wp_kses_post( (string) $root_data['content'] ) : '';
		$props      = isset( $root_data['props'] ) && is_array( $root_data['props'] ) ? $root_data['props'] : array();
		$custom_style = isset( $root_data['style'] ) ? (string) $root_data['style'] : '';
		$raw_attrs  = isset( $root_data['attrs'] ) && is_array( $root_data['attrs'] ) ? $root_data['attrs'] : array();
		$children   = isset( $root_data['children'] ) && is_array( $root_data['children'] ) ? $root_data['children'] : array();

		$root = array(
			'id'        => isset( $root_data['id'] ) && is_string( $root_data['id'] ) && '' !== $root_data['id'] ? sanitize_key( $root_data['id'] ) : $this->generate_element_id(),
			'node'      => $node,
			'props'     => $this->sanitize_container_props( $props ),
			'style'     => $this->sanitize_custom_style( $custom_style ),
			'content'   => $content,
			'attrs'     => $this->sanitize_node_attrs( $node, $raw_attrs ),
			'children'  => $this->sanitize_elements( $children ),
		);

		return array(
			'version'   => 2,
			'createdAt' => $created_at,
			'updatedAt' => $now,
			'children'  => array( $root ),
		);
	}

	private function render_element( array $element, string $class = 'wp-builder-container' ): string {
		if ( ! isset( $element['node'] ) ) {
			return '';
		}

		$tag          = $this->sanitize_node_tag( (string) $element['node'] );
		$id           = isset( $element['id'] ) && is_string( $element['id'] ) && '' !== $element['id'] ? sanitize_key( $element['id'] ) : $this->generate_element_id();
		$content      = isset( $element['content'] ) ? $element['content'] : '';
		$props        = isset( $element['props'] ) && is_array( $element['props'] ) ? $element['props'] : array();
		$custom_style = isset( $element['style'] ) ? (string) $element['style'] : '';
		$node_attrs   = isset( $element['attrs'] ) && is_array( $element['attrs'] ) ? $element['attrs'] : array();
		$children     = isset( $element['children'] ) && is_array( $element['children'] ) ? $element['children'] : array();
		$is_void      = in_array( $tag, array( 'img', 'input', 'source', 'br', 'hr' ), true );

		$inline_style = $this->build_container_inline_style( $props );
		$style_attr   = $inline_style ? ' style="' . esc_attr( $inline_style ) . '"' : '';

		$extra_attrs = '';
		foreach ( $node_attrs as $attr_name => $attr_value ) {
			$attr_name = sanitize_key( (string) $attr_name );
			if ( $attr_name && '' !== (string) $attr_value ) {
				$extra_attrs .= ' ' . esc_attr( $attr_name ) . '="' . esc_attr( (string) $attr_value ) . '"';
			}
		}

		$style_block = '';
		if ( $custom_style !== '' && $id ) {
			$selector     = '[data-wp-builder-id="' . esc_attr( $id ) . '"]';
			$scoped_style = preg_replace( '/\bself\b/', $selector, $custom_style );
			$style_block  = '<style>' . $scoped_style . '</style>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- CSS sanitized by sanitize_custom_style(); no WP escape function exists for raw CSS.
		}

		if ( $is_void ) {
			return $style_block . sprintf(
				'<%1$s class="%2$s" data-wp-builder-id="%3$s"%4$s%5$s />',
				$tag,
				esc_attr( $class ),
				esc_attr( $id ),
				$style_attr,
				$extra_attrs
			);
		}

		return $style_block . sprintf( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $content pre-sanitized via wp_kses_post; render_elements() output is pre-escaped.
			'<%1$s class="%2$s" data-wp-builder-id="%3$s"%4$s%5$s>%6$s%7$s</%1$s>',
			$tag,
			esc_attr( $class ),
			esc_attr( $id ),
			$style_attr,
			$extra_attrs,
			$content,
			$this->render_elements( $children )
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

	private function generate_element_id(): string {
		$time = base_convert( (string) intval( microtime( true ) * 1000 ), 10, 36 );
		$rand = substr( base_convert( bin2hex( random_bytes( 4 ) ), 16, 36 ), 0, 6 );
		return 'wpb-' . $time . '-' . $rand;
	}

	private function sanitize_elements( array $elements ): array {
		$clean = array();

		foreach ( $elements as $element ) {
			if ( ! is_array( $element ) ) {
				continue;
			}

			$id = isset( $element['id'] ) ? sanitize_key( (string) $element['id'] ) : '';

			// Migrate legacy html elements.
			if ( isset( $element['type'] ) && 'html' === $element['type'] ) {
				$content = isset( $element['content'] ) ? wp_kses_post( (string) $element['content'] ) : '';
				$clean[] = array(
					'id'        => $id ? $id : $this->generate_element_id(),
					'node'      => 'div',
					'props'     => $this->sanitize_container_props( array() ),
					'style'     => '',
					'content'   => $content,
					'attrs'     => array(),
					'children'  => array(),
				);
				continue;
			}

			if ( ! isset( $element['node'] ) ) {
				continue;
			}

			$children   = isset( $element['children'] ) && is_array( $element['children'] ) ? $element['children'] : array();
			$props      = isset( $element['props'] ) && is_array( $element['props'] ) ? $element['props'] : array();
			$custom_style = isset( $element['style'] ) ? (string) $element['style'] : ( isset( $element['customStyle'] ) ? (string) $element['customStyle'] : '' );
			$content    = isset( $element['content'] ) ? wp_kses_post( (string) $element['content'] ) : '';
			$node       = $this->sanitize_node_tag( (string) $element['node'] );
			$raw_attrs  = isset( $element['attrs'] ) && is_array( $element['attrs'] ) ? $element['attrs'] : array();
			$clean[]    = array(
				'id'        => $id ? $id : $this->generate_element_id(),
				'node'      => $node,
				'props'     => $this->sanitize_container_props( $props ),
					'style'     => $this->sanitize_custom_style( $custom_style ),
				'content'   => $content,
				'attrs'     => $this->sanitize_node_attrs( $node, $raw_attrs ),
				'children'  => $this->sanitize_elements( $children ),
			);
		}

		return $clean;
	}

	private function render_elements( array $elements ): string {
		$output = '';

		foreach ( $elements as $element ) {
			if ( is_array( $element ) ) {
				$output .= $this->render_element( $element );
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

	private function sanitize_custom_style( string $style ): string {
		// Prevent breaking out of the <style> tag.
		$style = preg_replace( '/<\/style\s*>/i', '', $style );
		return wp_strip_all_tags( $style );
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
			if ( ! is_array( $element ) || ! isset( $element['node'] ) ) {
				continue;
			}

			++$count;

			$children = isset( $element['children'] ) && is_array( $element['children'] ) ? $element['children'] : array();
			$count   += $this->count_elements( $children );
		}

		return $count;
	}
}
