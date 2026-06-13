<?php
/**
 * Template Name: WP Builder Full Width
 *
 * Builder content rendered inside the theme's header and footer — no sidebar.
 * Content is rendered directly by the WP Builder plugin.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<div class="wp-builder-full-width-template">
	<?php
	while ( have_posts() ) :
		the_post();
		the_content();
	endwhile;
	?>
</div>
<?php
get_footer();
