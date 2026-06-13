# WP Builder

A basic WordPress page builder plugin for posts and pages.

## Current Features

- Adds an "Edit with WP Builder" entry point for posts and pages.
- Provides a full-screen builder at `wp-admin/post.php?post={id}&action=builder`.
- Includes a "Back to Admin" button to return to the WordPress editor.
- Provides a builder screen with an element picker and a canvas.
- Includes one element type: Container.
- Containers can be nested inside other containers without a fixed nesting limit.
- Saves the builder layout as post meta.
- Replaces front-end post/page content with the saved builder layout when containers exist.

## Install

Place the `wp-builder` folder inside `wp-content/plugins/`, then activate "WP Builder" in WordPress.

## Use

Open a post or page and click "Edit with WP Builder", or visit `wp-admin/post.php?post={id}&action=builder` directly. Add containers from the element picker or from a selected container, then save.
