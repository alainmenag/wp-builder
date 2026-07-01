<?php
if ( ! defined( 'ABSPATH' ) ) {
exit;
}

/**
 * Trait WP_Builder_Editor
 *
 * Handles routing and entry points for the builder editor.
 * Requests for action=builder are redirected to the frontend preview URL,
 * where the front-end quick-editor (frontend-editor.js) is loaded for
 * logged-in users with edit capabilities.
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

$view = isset( $_GET['view'] ) ? sanitize_key( wp_unslash( $_GET['view'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

if ( 'json' === $view ) {
status_header( 200 );
nocache_headers();
header( 'Content-Type: application/json; charset=' . get_option( 'blog_charset' ) );
// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
echo wp_json_encode( $this->get_layout( $post_id ), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
exit;
}

wp_safe_redirect( $this->get_preview_url( $post_id ) );
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

/**
 * Add type="module" to the wp-builder-frontend-editor script tag so the
 * browser treats assets/js/frontend-editor.js as a native ES module.
 *
 * @param string $tag    The full <script> tag HTML.
 * @param string $handle The registered script handle.
 * @return string
 */
public function add_module_type_to_script_tag( string $tag, string $handle ): string {
if ( 'wp-builder-frontend-editor' !== $handle ) {
return $tag;
}
// Strip any legacy type="text/javascript" attribute WordPress may add.
$tag = str_replace( " type='text/javascript'", '', $tag );
$tag = str_replace( ' type="text/javascript"', '', $tag );
// Inject type="module" immediately after the opening <script token.
return str_replace( '<script ', '<script type="module" ', $tag );
}
}
