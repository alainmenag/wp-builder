# wp-builder

A very basic WordPress page-builder plugin inspired by Elementor.

## Features

- Builder Pages custom post type (`Builder Pages`)
- Visual section builder (styled div sections)
- Basic elements:
  - Text
  - Headings
  - Images
  - Videos (embed URL)
- Simple style controls (colors, spacing, alignment, font size, border radius)
- Responsive frontend rendering

## Install

1. Copy this repository into your WordPress `wp-content/plugins/wp-builder` directory.
2. Activate **WP Builder** in the WordPress admin.
3. Go to **Builder Pages** and create a new page.
4. Build your layout in the **Builder Canvas** metabox.
5. Publish and use the shortcode shown in the editor:
   - `[wp_builder id="123"]`

## Notes

This is intentionally minimal and focused on very basic modern page building blocks.
