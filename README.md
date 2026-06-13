# wp-builder

A basic Elementor-style WordPress page-builder plugin built around **nestable components**.

## Architecture

Layouts follow a 3-level nesting model, just like Elementor:

```
Page
└── Section  (full-width container, custom background / padding)
    └── Column  (side-by-side columns, configurable widths)
        └── Element  (text, heading, image, video, button, spacer)
```

## Features

- **Sections** — full-width rows with background, padding, and border-radius controls  
- **Columns** — flexible column grids inside each section (choose from 1, 2, 3, or 4 column presets, or add columns manually with a custom width %)  
- **Elements** per column:
  - Text
  - Heading (H1–H6)
  - Image
  - Video (embed URL — YouTube / Vimeo)
  - Button (label + URL)
  - Spacer
- Per-element and per-section **style controls** (color, padding, margin, font size, text align, border radius, max width)
- Move sections and elements up/down
- Responsive frontend (columns stack on mobile ≤ 768 px)
- Shortcode output via `[wp_builder id="..."]`

## Install

1. Copy this repository into `wp-content/plugins/wp-builder/`.
2. Activate **WP Builder** in the WordPress admin.
3. Go to **Builder Pages** → **Add New**.
4. Build your layout in the **Builder Canvas** meta-box.
5. Publish, then embed the layout in any post/page with:
   ```
   [wp_builder id="123"]
   ```

## How it works

- Layouts are stored as JSON in post meta (`_wp_builder_layout`).
- The admin builder renders the JSON tree into a visual editor entirely in plain JavaScript (no framework dependencies).
- The shortcode reads the JSON and renders semantic HTML with inline styles.
