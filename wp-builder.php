<?php
/**
 * Plugin Name: Builder
 * Description: A basic Elementor-style builder with infinitely nestable container elements for posts and pages.
 * Version: 0.1.0
 * Author: Builder
 * Text Domain: wp-builder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WP_BUILDER_DIR', plugin_dir_path( __FILE__ ) );
define( 'WP_BUILDER_URL', plugin_dir_url( __FILE__ ) );

foreach ( glob( WP_BUILDER_DIR . 'includes/class-*.php' ) as $file ) {
	require_once $file;
}

new WP_Builder();

register_activation_hook( __FILE__, function() { flush_rewrite_rules( false ); } );
register_deactivation_hook( __FILE__, function() { flush_rewrite_rules( false ); } );
