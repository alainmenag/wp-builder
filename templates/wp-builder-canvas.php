<?php
/**
 * Template Name: Builder Canvas
 *
 * A blank canvas page template — no theme header or footer.
 * Content is rendered directly by the Builder plugin.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<?php wp_head(); ?>
</head>
<body <?php body_class( 'wp-builder-canvas-body' ); ?>>
<?php wp_body_open(); ?>
<div class="wp-builder-template wp-builder-template--canvas">
	<?php
	while ( have_posts() ) :
		the_post();
		the_content();
	endwhile;
	?>
</div>
<?php wp_footer(); ?>
</body>
</html>
