# WP Builder

A lightweight, Elementor-inspired page builder plugin for WordPress. Build infinitely nestable container layouts on posts, pages, and reusable templates — without a heavy framework.

---

## Requirements

| Requirement | Minimum |
|-------------|---------|
| WordPress   | 5.9     |
| PHP         | 7.4     |
| Elementor   | 3.x *(optional — only needed for the Elementor widget)* |

---

## Features

### Frontend quick-editor
- Inline editor loaded directly on the front end for logged-in users with edit capabilities — no separate admin screen.
- Visit any post/page/snippet on the front end while logged in to activate the editor panel.
- **Container** element — the single, composable building block. Containers nest inside each other without a depth limit.
- Each container exposes:
  - **ID** — editable element identifier; auto-regenerated if left blank.
  - **Node** — choose any HTML tag (`div`, `section`, `article`, `main`, `aside`, `header`, `footer`, `nav`, `p`, `span`, `h1`–`h6`, `a`, `button`, `figure`, `figcaption`, `img`, `input`, `label`, `audio`, `video`, `source`, `iframe`, `script`, `style`, `code`, `pre`, `blockquote`).
  - **Content** — rich-text inner HTML (filtered through `wp_kses_post`).
  - **Direction** — flexbox row or column layout.
  - **Flex Grow** — numeric `flex-grow` value.
  - **Gap** — CSS gap value (e.g. `16px`, `1rem`).
  - **Custom CSS** — per-element scoped styles; use `self` to target the container.
  - **Node attributes** — tag-specific attributes (`src`, `href`, `alt`, `width`, `height`, etc.) for media and interactive elements.
- **Add / delete** child elements directly from the editor panel.
- **Export** — opens `?view=json` in a new tab to download the raw layout JSON.
- **Reset** — clears all builder data and restores the default page template (posts/pages only).
- **Post status** control (Published, Draft, Pending Review, Private) inside the editor panel.
- **Page layout** selector (when editing posts/pages).
- Admin bar **Builder** menu with quick links to snippets (up to 20).

### Snippets (`wp_builder_template` CPT)
- Create reusable layouts as Builder Snippets (custom post type, hidden from the front end by default).
- Snippets are always displayed using the **Canvas Layout** page layout when opened via the builder editor.
- Snippets can be injected automatically into WordPress action hook locations (e.g. `wp_head`, `wp_footer`, nav menu locations, theme-registered hooks, before/after post content) via the **Hooks** panel in the editor.
- Embed snippets anywhere via shortcode or the Elementor widget.

### Shortcodes
| Shortcode | Description |
|-----------|-------------|
| `[wp_builder id="42"]` | Renders the builder layout of any published post, page, or snippet. |

### Page layouts
| Template slug | Description |
|---------------|-------------|
| `wp-builder-canvas` | Blank HTML document — no theme header/footer. |
| `wp-builder-full-width` | Theme header/footer included, no sidebar. |

### Elementor integration *(optional)*
When Elementor is active, a **Builder Snippet** widget appears in the Elementor panel. Select any published Builder Snippet from a dropdown (or enter its ID manually) and it will be rendered inline inside the Elementor layout.

---

## Installation

1. Copy the `wp-builder` folder into `wp-content/plugins/`.
2. In **WordPress Admin → Plugins**, activate **Builder**.
3. A **Builder** menu item appears in the admin sidebar.

---

## Usage

### Opening the editor
- Visit any post/page/snippet on the **front end** while logged in as a user with edit permissions — the quick-editor panel loads automatically.
- From any post/page list: click the **Builder** row action to open the post's front-end URL with the editor panel active.
- From the admin bar: **Builder → Edit** (when viewing a post on the front end).
- Direct URL: `wp-admin/post.php?post={id}&action=builder` — redirects to the post's front-end URL.

### Creating a snippet
1. Go to **Builder → Add New** in the admin sidebar.
2. The snippet's front-end preview opens with the editor panel active.
3. Build your layout, set the title, set the status to **Published**, then **Save**.
4. Copy the shortcode shown in the **Shortcode** panel to embed it elsewhere.

### Embedding a snippet
**Shortcode:**
```
[wp_builder id="42"]
```

**Elementor widget:**
Add the **Builder Snippet** widget to any Elementor section and select the snippet from the dropdown.

---

## File structure

```
wp-builder/
├── wp-builder.php                  # Bootstrap: defines constants, loads includes, instantiates WP_Builder
├── includes/
│   ├── class-wp-builder.php        # Main class — uses all traits, registers all hooks
│   ├── class-admin.php             # Admin menus, row actions, admin bar
│   ├── class-ajax.php     # AJAX handlers: get/save element, get layout, add/delete element, reset builder
│   ├── class-editor.php            # Builder routing: renders builder canvas for action=builder; JSON export
│   ├── class-elementor.php         # Elementor widget registration + editor styles
│   ├── class-frontend.php          # Shortcodes, front-end asset enqueue, content filter
│   ├── class-layout.php            # Layout load/save/sanitise/render helpers
│   ├── class-page-chrome.php       # Page layout registration + routing
│   └── class-post-types.php        # Post meta registration, snippet CPT, rewrite rules
├── assets/
│   ├── shared.css                  # Shared design tokens and reusable UI components
│   ├── editor.css         # Frontend quick-editor panel styles (wpbe- prefix)
│   ├── js/
│   │   ├── editor.js      # Entry point — boots the frontend quick-editor (ES module IIFE)
│   │   ├── constants.js            # Node glossary, void-node set, icon SVG strings
│   │   ├── layout.js               # Layout data helpers (create, find, add, delete elements)
│   │   └── dom-helpers.js          # Shared attribute-control rendering helpers
│   ├── elementor-editor.css        # Elementor panel styles
│   └── frontend.css                # Front-end layout styles
├── templates/
│   ├── wp-builder-canvas.php       # Canvas page layout (blank HTML, no theme chrome)
│   └── wp-builder-full-width.php   # Full-width page layout (theme header/footer)
├── widgets/
│   └── widget-builder-template.php # Elementor Builder Snippet widget
└── docs/
    └── http-api.md                 # HTTP / AJAX API reference
```

---

## Validation

No automated test suite is included. Validate PHP and JS syntax with:

```bash
php -l wp-builder.php
for f in assets/js/*.js; do node --check "$f"; done
```

---

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for guidelines on reporting bugs, requesting features, and submitting pull requests.
