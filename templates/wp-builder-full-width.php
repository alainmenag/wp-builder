<?php
/**
 * Template Name: Builder Full Width
 *
 * Builder content rendered inside the theme's header and footer — no sidebar.
 * Content is rendered directly by the Builder plugin.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<div class="wp-builder-full-width-page">
	<?php
	while ( have_posts() ) :
		the_post();
		the_content();
	endwhile;
	?>
</div>
<?php
get_footer();
