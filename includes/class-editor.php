<?php
if ( ! defined( 'ABSPATH' ) ) {
exit;
}

/**
 * Trait WP_Builder_Editor
 *
 * Handles routing and entry points for the full-screen builder editor.
 * Asset enqueueing lives in WP_Builder_Editor_Assets, the panel schema in
 * WP_Builder_Editor_Schema, and the HTML shell rendering in WP_Builder_Editor_Shell.
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
 * Add type="module" to wp-builder script tags so the browser treats
 * assets/js/editor.js and assets/js/frontend-editor.js as native ES modules.
 *
 * wp_localize_script emits a separate inline <script> block (no type
 * attribute) that sets the config global before these tags, so the
 * config object is available when each deferred module executes.
 *
 * @param string $tag    The full <script> tag HTML.
 * @param string $handle The registered script handle.
 * @return string
 */
public function add_module_type_to_script_tag( string $tag, string $handle ): string {
if ( 'wp-builder-admin' !== $handle && 'wp-builder-frontend-editor' !== $handle ) {
return $tag;
}
// Strip any legacy type="text/javascript" attribute WordPress may add.
$tag = str_replace( " type='text/javascript'", '', $tag );
$tag = str_replace( ' type="text/javascript"', '', $tag );
// Inject type="module" immediately after the opening <script token.
return str_replace( '<script ', '<script type="module" ', $tag );
}
}
