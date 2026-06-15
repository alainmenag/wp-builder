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

### Builder editor
- Full-screen drag-free builder accessible from `wp-admin/post.php?post={id}&action=builder`.
- **Container** element — the single, composable building block. Containers nest inside each other without a depth limit.
- Each container exposes:
  - **ID** — editable element identifier; auto-regenerated if left blank.
  - **Node** — choose any semantic HTML tag (`div`, `section`, `article`, `main`, `header`, `footer`, `nav`, `p`, `span`, `h1`–`h6`, `a`, `button`, `figure`, `figcaption`, `img`, `input`, `label`, `audio`, `video`, `source`, `iframe`).
  - **Content** — rich-text inner HTML (filtered through `wp_kses_post`).
  - **Direction** — flexbox row or column layout.
  - **Flex Grow** — numeric `flex-grow` value.
  - **Gap** — CSS gap value (e.g. `16px`, `1rem`).
  - **Custom CSS** — per-element scoped styles; use `self` to target the container.
  - **Node attributes** — tag-specific attributes (`src`, `href`, `alt`, `width`, `height`, etc.) for media and interactive elements.
- **Export** — download the raw layout JSON from the browser.
- **Post status** control (Published, Draft, Pending Review, Private) inside the editor.
- **Page template** selector (when editing posts/pages).
- Admin bar **Builder** menu with quick links to all templates.

### Templates (`wp_builder_template` CPT)
- Create reusable layouts as Builder Templates (custom post type, hidden from the front end by default).
- Templates are always rendered with the **Builder Canvas** page template (blank HTML, no theme chrome).
- Embed templates anywhere via shortcode or the Elementor widget.

### Shortcodes
| Shortcode | Description |
|-----------|-------------|
| `[wp_builder_template id="42"]` | Renders a published Builder Template by its post ID. |
| `[wp_builder_content id="42"]`  | Renders the builder layout saved on any published post or page. |

### Page templates
| Template slug | Description |
|---------------|-------------|
| `wp-builder-canvas` | Blank HTML document — no theme header/footer. |
| `wp-builder-full-width` | Theme header/footer included, no sidebar. |

### Elementor integration *(optional)*
When Elementor is active, a **Builder Template** widget appears in the Elementor panel. Select any published Builder Template from a dropdown (or enter its ID manually) and it will be rendered inline inside the Elementor layout.

---

## Installation

1. Copy the `wp-builder` folder into `wp-content/plugins/`.
2. In **WordPress Admin → Plugins**, activate **Builder**.
3. A **Builder** menu item appears in the admin sidebar.

---

## Usage

### Opening the builder
- From any post/page list: click the **Builder** row action.
- From the classic post editor: click the **Builder** button in the sidebar meta box.
- Direct URL: `wp-admin/post.php?post={id}&action=builder`
- From the admin bar: **Builder → Edit** (when viewing a post on the front end).

### Creating a template
1. Go to **Builder → Add New** in the admin sidebar.
2. The builder opens automatically for the new template.
3. Build your layout, set the title, set the status to **Published**, then **Save**.
4. Copy the shortcode shown in the **Template** panel to embed it elsewhere.

### Embedding a template
**Shortcode:**
```
[wp_builder_template id="42"]
```

**Elementor widget:**
Add the **Builder Template** widget to any Elementor section and select the template from the dropdown.

---

## File structure

```
wp-builder/
├── wp-builder.php                  # Bootstrap: defines constants, loads includes, instantiates WP_Builder
├── includes/
│   ├── class-wp-builder.php        # Main class — uses all traits, registers all hooks
│   ├── class-admin.php             # Admin menus, meta boxes, row actions, admin bar
│   ├── class-ajax.php              # AJAX handlers: save layout, update title
│   ├── class-builder-page.php      # Full-screen builder: routing, asset enqueue, HTML shell
│   ├── class-elementor.php         # Elementor widget registration + editor styles
│   ├── class-frontend.php          # Shortcodes, front-end asset enqueue, content filter
│   ├── class-layout.php            # Layout load/save/sanitise/render helpers
│   ├── class-page-templates.php    # Custom page template registration + routing
│   └── class-post-types.php        # Post meta registration, template CPT, rewrite rules
├── assets/
│   ├── admin.css                   # Builder editor styles
│   ├── admin.js                    # Builder editor JavaScript
│   ├── elementor-editor.css        # Elementor panel styles
│   └── frontend.css                # Front-end layout styles
├── templates/
│   ├── wp-builder-canvas.php       # Blank canvas page template
│   └── wp-builder-full-width.php   # Full-width page template (theme header/footer)
└── widgets/
    └── widget-builder-template.php # Elementor Builder Template widget
```

---

## Validation

No automated test suite is included. Validate PHP and JS syntax with:

```bash
php -l wp-builder.php
node --check assets/admin.js
```

---

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for guidelines on reporting bugs, requesting features, and submitting pull requests.
