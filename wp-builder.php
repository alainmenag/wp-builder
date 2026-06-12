<?php
/**
 * Plugin Name: WP Builder
 * Description: A very basic visual page builder with sections and simple elements.
 * Version: 0.1.0
 * Author: Alain Menag
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Text Domain: wp-builder
 */

if ( ! defined( 'ABSPATH' ) ) {
exit;
}

final class WP_Builder_Plugin {
const META_KEY = '_wp_builder_layout';

public function __construct() {
add_action( 'init', array( $this, 'register_post_type' ) );
add_action( 'add_meta_boxes', array( $this, 'register_meta_box' ) );
add_action( 'save_post_wpb_layout', array( $this, 'save_layout' ) );
add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );
add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_assets' ) );
add_shortcode( 'wp_builder', array( $this, 'render_shortcode' ) );
}

public function register_post_type() {
register_post_type(
'wpb_layout',
array(
'labels' => array(
'name'          => __( 'Builder Pages', 'wp-builder' ),
'singular_name' => __( 'Builder Page', 'wp-builder' ),
'add_new_item'  => __( 'Add New Builder Page', 'wp-builder' ),
),
'public'       => true,
'show_in_rest' => true,
'has_archive'  => true,
'supports'     => array( 'title' ),
'menu_icon'    => 'dashicons-layout',
)
);
}

public function register_meta_box() {
add_meta_box(
'wp-builder-editor',
__( 'Builder Canvas', 'wp-builder' ),
array( $this, 'render_meta_box' ),
'wpb_layout',
'normal',
'high'
);
}

public function render_meta_box( $post ) {
$layout = get_post_meta( $post->ID, self::META_KEY, true );
if ( ! is_string( $layout ) ) {
$layout = '[]';
}

wp_nonce_field( 'wp_builder_layout_save', 'wp_builder_layout_nonce' );
echo '<div id="wp-builder-app" class="wp-builder-admin-app"></div>';
echo '<textarea id="wp-builder-layout" name="wp_builder_layout" class="wp-builder-hidden">' . esc_textarea( $layout ) . '</textarea>';
echo '<p>' . esc_html__( 'Use shortcode', 'wp-builder' ) . ': <code>[wp_builder id="' . absint( $post->ID ) . '"]</code></p>';
}

public function save_layout( $post_id ) {
if ( ! isset( $_POST['wp_builder_layout_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wp_builder_layout_nonce'] ) ), 'wp_builder_layout_save' ) ) {
return;
}

if ( ! current_user_can( 'edit_post', $post_id ) ) {
return;
}

if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
return;
}

$raw_layout = isset( $_POST['wp_builder_layout'] ) ? wp_unslash( $_POST['wp_builder_layout'] ) : '[]';
$layout     = json_decode( $raw_layout, true );
if ( ! is_array( $layout ) ) {
$layout = array();
}

$sanitized = $this->sanitize_layout( $layout );
update_post_meta( $post_id, self::META_KEY, wp_json_encode( $sanitized ) );
}

public function enqueue_admin_assets( $hook ) {
$screen = get_current_screen();
if ( ! $screen || 'wpb_layout' !== $screen->post_type ) {
return;
}

wp_enqueue_style( 'wp-builder-admin', plugin_dir_url( __FILE__ ) . 'assets/admin.css', array(), '0.1.0' );
wp_enqueue_script( 'wp-builder-admin', plugin_dir_url( __FILE__ ) . 'assets/admin.js', array(), '0.1.0', true );
}

public function enqueue_frontend_assets() {
wp_enqueue_style( 'wp-builder-frontend', plugin_dir_url( __FILE__ ) . 'assets/frontend.css', array(), '0.1.0' );
}

public function render_shortcode( $atts ) {
$atts = shortcode_atts(
array(
'id' => 0,
),
$atts,
'wp_builder'
);

$post_id = absint( $atts['id'] );
if ( ! $post_id ) {
return '';
}

$layout_json = get_post_meta( $post_id, self::META_KEY, true );
if ( ! is_string( $layout_json ) || '' === $layout_json ) {
return '';
}

$layout = json_decode( $layout_json, true );
if ( ! is_array( $layout ) ) {
return '';
}

ob_start();
echo '<div class="wp-builder-layout">';
foreach ( $layout as $section ) {
$section_styles = isset( $section['styles'] ) && is_array( $section['styles'] ) ? $this->build_style_string( $section['styles'] ) : '';
echo '<section class="wp-builder-section"' . ( $section_styles ? ' style="' . esc_attr( $section_styles ) . '"' : '' ) . '>';

$elements = isset( $section['elements'] ) && is_array( $section['elements'] ) ? $section['elements'] : array();
foreach ( $elements as $element ) {
$type    = isset( $element['type'] ) ? $element['type'] : '';
$styles  = isset( $element['styles'] ) && is_array( $element['styles'] ) ? $this->build_style_string( $element['styles'] ) : '';
$attr    = $styles ? ' style="' . esc_attr( $styles ) . '"' : '';

switch ( $type ) {
case 'heading':
$level   = isset( $element['level'] ) ? strtolower( (string) $element['level'] ) : 'h2';
$level   = in_array( $level, array( 'h1', 'h2', 'h3', 'h4', 'h5', 'h6' ), true ) ? $level : 'h2';
$content = isset( $element['content'] ) ? wp_kses_post( $element['content'] ) : '';
echo '<' . esc_html( $level ) . ' class="wp-builder-heading"' . $attr . '>' . $content . '</' . esc_html( $level ) . '>';
break;
case 'image':
$src = isset( $element['src'] ) ? esc_url( $element['src'] ) : '';
$alt = isset( $element['alt'] ) ? sanitize_text_field( $element['alt'] ) : '';
if ( $src ) {
echo '<img class="wp-builder-image" src="' . $src . '" alt="' . esc_attr( $alt ) . '"' . $attr . ' />';
}
break;
case 'video':
$src = isset( $element['src'] ) ? esc_url( $element['src'] ) : '';
if ( $src ) {
echo '<div class="wp-builder-video"' . $attr . '><iframe src="' . $src . '" loading="lazy" allowfullscreen></iframe></div>';
}
break;
case 'text':
default:
$content = isset( $element['content'] ) ? wp_kses_post( $element['content'] ) : '';
echo '<div class="wp-builder-text"' . $attr . '>' . $content . '</div>';
break;
}
}
echo '</section>';
}
echo '</div>';

return (string) ob_get_clean();
}

private function sanitize_layout( $layout ) {
$sanitized = array();

foreach ( $layout as $section ) {
if ( ! is_array( $section ) ) {
continue;
}

$new_section = array(
'styles'   => $this->sanitize_styles( isset( $section['styles'] ) && is_array( $section['styles'] ) ? $section['styles'] : array() ),
'elements' => array(),
);

$elements = isset( $section['elements'] ) && is_array( $section['elements'] ) ? $section['elements'] : array();
foreach ( $elements as $element ) {
if ( ! is_array( $element ) ) {
continue;
}
$type = isset( $element['type'] ) ? sanitize_key( $element['type'] ) : 'text';
if ( ! in_array( $type, array( 'text', 'heading', 'image', 'video' ), true ) ) {
$type = 'text';
}

$new_element = array(
'type'   => $type,
'styles' => $this->sanitize_styles( isset( $element['styles'] ) && is_array( $element['styles'] ) ? $element['styles'] : array() ),
);

if ( isset( $element['content'] ) ) {
$new_element['content'] = wp_kses_post( (string) $element['content'] );
}
if ( isset( $element['src'] ) ) {
$new_element['src'] = esc_url_raw( (string) $element['src'] );
}
if ( isset( $element['alt'] ) ) {
$new_element['alt'] = sanitize_text_field( (string) $element['alt'] );
}
if ( isset( $element['level'] ) ) {
$level = strtolower( sanitize_text_field( (string) $element['level'] ) );
$new_element['level'] = in_array( $level, array( 'h1', 'h2', 'h3', 'h4', 'h5', 'h6' ), true ) ? $level : 'h2';
}

$new_section['elements'][] = $new_element;
}

$sanitized[] = $new_section;
}

return $sanitized;
}

private function sanitize_styles( $styles ) {
$allowed = array(
'backgroundColor',
'color',
'padding',
'margin',
'textAlign',
'fontSize',
'borderRadius',
'maxWidth',
'width',
);

$sanitized = array();
foreach ( $styles as $property => $value ) {
if ( ! in_array( $property, $allowed, true ) ) {
continue;
}

$value = wp_strip_all_tags( (string) $value );
if ( '' === $value || ! preg_match( '/^[#,.()\/%\s\-a-zA-Z0-9]+$/', $value ) ) {
continue;
}

$sanitized[ $property ] = $value;
}

return $sanitized;
}

private function build_style_string( $styles ) {
$styles = $this->sanitize_styles( $styles );
if ( empty( $styles ) ) {
return '';
}

$parts = array();
foreach ( $styles as $key => $value ) {
$css_key = strtolower( preg_replace( '/([a-z])([A-Z])/', '$1-$2', (string) $key ) );
$parts[] = $css_key . ':' . $value;
}

return implode( ';', $parts );
}
}

new WP_Builder_Plugin();
