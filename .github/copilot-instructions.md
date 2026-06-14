# GitHub Copilot instructions for WP Builder

This file gives GitHub Copilot context about the project so suggestions stay consistent with its conventions.

---

## Project overview

WP Builder is a lightweight WordPress page-builder plugin. It lets users build infinitely nestable container layouts on posts, pages, and reusable templates through a full-screen admin editor. It has **no external PHP dependencies** and **no JavaScript build step**.

- **Plugin entry point:** `wp-builder.php` — a slim bootstrap that defines two constants and glob-loads every `includes/class-*.php` file, then instantiates `WP_Builder`.
- **Main class:** `includes/class-wp-builder.php` — a `final class WP_Builder` that composes all functionality via PHP traits and registers every WordPress hook in its constructor.
- **All business logic** lives in trait files under `includes/`. Each file declares exactly one trait.
- **Assets:** plain CSS and ES5 vanilla JavaScript in `assets/`. No bundler, no transpiler, no TypeScript.
- **Plugin version:** `0.1.0` (defined as `private const VERSION` in `class-wp-builder.php`).

---

## Repository layout

```
wp-builder/
├── wp-builder.php                  # Bootstrap
├── includes/
│   ├── class-wp-builder.php        # Main class + hook registration
│   ├── class-admin.php             # Trait: menus, meta boxes, row actions, admin bar
│   ├── class-ajax.php              # Trait: AJAX save layout + update title
│   ├── class-builder-page.php      # Trait: full-screen editor routing, assets, HTML shell
│   ├── class-elementor.php         # Trait: Elementor widget + editor styles
│   ├── class-frontend.php          # Trait: shortcodes, front-end assets, content filter
│   ├── class-layout.php            # Trait: load/save/sanitise/render layout data
│   ├── class-page-templates.php    # Trait: custom page templates + routing
│   └── class-post-types.php        # Trait: post meta, template CPT, rewrite rules
├── assets/
│   ├── admin.css                   # Builder editor CSS (dark theme, CSS custom properties)
│   ├── admin.js                    # Builder editor JS (ES5, IIFE, no framework)
│   ├── elementor-editor.css        # Elementor panel overrides
│   └── frontend.css                # Front-end container layout styles
├── templates/
│   ├── wp-builder-canvas.php       # Blank canvas page template (no theme chrome)
│   └── wp-builder-full-width.php   # Full-width page template (theme header/footer)
└── widgets/
    └── widget-builder-template.php # Elementor Builder Template widget
```

---

## PHP conventions

- **WordPress PHP Coding Standards** — follow them strictly.
- **Indentation:** tabs (not spaces).
- **Escaping:** every value sent to the browser must be escaped (`esc_html`, `esc_attr`, `esc_url`, `wp_kses_post`, etc.).
- **Sanitisation:** all `$_GET`, `$_POST`, and `$_REQUEST` values must be sanitised before use. Use `sanitize_key`, `sanitize_text_field`, `absint`, `wp_unslash`, etc.
- **Nonce verification:** every AJAX handler calls `check_ajax_referer()` before touching any data.
- **No direct database queries** — use the WordPress meta API (`get_post_meta`, `update_post_meta`), `WP_Query`, `wp_insert_post`, `wp_update_post`, etc.
- **No new PHP dependencies** — do not suggest Composer packages.
- **Traits only** — new logic belongs in a trait in `includes/class-*.php`. Register its hooks in `WP_Builder::__construct()`. Never put logic directly in the bootstrap.
- **Constants** (`VERSION`, `META_KEY`, `MENU_SLUG`, `ACTION`, `NONCE_ACTION`, `TITLE_NONCE_ACTION`, `TEMPLATE_CPT`, `REWRITE_VERSION`, `REWRITE_VERSION_OPTION`) are declared `private const` in `class-wp-builder.php` and accessed as `self::CONSTANT_NAME` within the class/traits.
- **Helper methods** shared across traits (`is_builder_request`, `get_builder_url`, `supported_post_types`, `is_supported_post_type`) live in `class-wp-builder.php`.
- **Internationalisation:** wrap every user-facing string in `__()`, `_e()`, `esc_html__()`, `esc_html_e()`, etc. Use the text domain `wp-builder`.

---

## JavaScript conventions

- **ES5 only** — no arrow functions, `const`/`let`, template literals, destructuring, or any ES6+ syntax.
- **Single IIFE** wrapping the entire file — `(function () { 'use strict'; ... })();`
- **No framework, no build step** — plain DOM APIs (`document.getElementById`, `addEventListener`, `classList`, etc.).
- **Global config** is injected by `wp_localize_script` as `window.wpBuilder` (see `class-builder-page.php` → `enqueue_builder_assets`). Access it as `var config = window.wpBuilder || {};`.
- **AJAX calls** must send `action`, `nonce`, `post_id`, and the relevant payload to `config.ajaxUrl` using `XMLHttpRequest` or `fetch`.
- **No new external libraries.**

---

## CSS conventions

- All class names are prefixed with `wp-builder-` (e.g. `.wp-builder-container`, `.wp-builder-panel`).
- The editor stylesheet uses CSS custom properties declared on `:root` (see `assets/admin.css`). Reuse existing tokens (`--wpb-bg-*`, `--wpb-text-*`, `--wpb-accent`, etc.) rather than hard-coding colour values.
- The frontend stylesheet (`assets/frontend.css`) is minimal — only layout rules for `.wp-builder-page` and `.wp-builder-container`.

---

## Layout data model

The layout is stored as JSON in post meta under the key `_wp_builder_layout`. The top-level shape is:

```json
{
  "version": 1,
  "node": "div",
  "content": "",
  "elements": [ /* array of container elements */ ]
}
```

Each **container element**:

```json
{
  "id": "container-1",
  "type": "container",
  "node": "div",
  "props": {
    "flexDirection": "row",
    "flexGrow": "1",
    "gap": "16px"
  },
  "customCss": "self { background: red; }",
  "content": "<p>Hello</p>",
  "attrs": { "src": "https://…" },
  "children": [ /* nested container elements */ ]
}
```

- `node` must be one of the allowed tags defined in `sanitize_node_tag()` (see `class-layout.php`).
- `props` supports `flexDirection` (`"row"` | `"column"` | `""`), `flexGrow` (numeric string or `""`), and `gap` (CSS value string).
- `customCss` is scoped: `self` is replaced with `[data-wp-builder-id="<id>"]` at render time.
- `content` is stored and rendered as raw HTML (sanitised through `wp_kses_post`).
- `attrs` is a flat object of node-specific HTML attributes (see `get_node_glossary()` in `class-layout.php` for the allowed set per tag).

---

## Key WordPress hooks

| Hook | Handler | File |
|------|---------|------|
| `init` | `register_meta`, `register_template_post_type`, `register_shortcodes`, `maybe_flush_rewrite_rules` | post-types, frontend |
| `add_meta_boxes` | `add_builder_meta_box` | admin |
| `admin_menu` | `register_builder_page`, `register_template_menu` | admin |
| `load-post.php` | `maybe_redirect_template_edit`, `maybe_render_builder_request` | admin, builder-page |
| `load-post-new.php` | `maybe_redirect_new_template` | admin |
| `wp_ajax_wp_builder_save_layout` | `ajax_save_layout` | ajax |
| `wp_ajax_wp_builder_update_title` | `ajax_update_title` | ajax |
| `wp_enqueue_scripts` | `enqueue_frontend_assets` | frontend |
| `admin_bar_menu` | `add_admin_bar_nodes` | admin |
| `the_content` | `render_builder_content` | frontend |
| `template_include` | `maybe_use_builder_template` | page-templates |
| `elementor/widgets/register` | `register_elementor_widget` | elementor |

---

## Shortcodes

| Shortcode | Attribute | Description |
|-----------|-----------|-------------|
| `[wp_builder_template id="N"]` | `id` (post ID) | Renders a published `wp_builder_template` post. |
| `[wp_builder_content id="N"]`  | `id` (post ID) | Renders the builder layout of any published post/page. |

---

## Supported post types

`post`, `page`, and the custom post type `wp_builder_template` (slug `wp_builder_template`). The helper `supported_post_types()` returns all three; `is_supported_post_type()` checks membership.

---

## Testing / validation

There is no automated test suite. Validate syntax before committing:

```bash
php -l wp-builder.php
node --check assets/admin.js
```

---

## What to avoid

- Do **not** add `composer.json`, `package.json`, or any build tooling.
- Do **not** introduce ES6+ syntax in `assets/admin.js`.
- Do **not** use direct `$wpdb` queries — use the WordPress API instead.
- Do **not** output unescaped values in PHP templates.
- Do **not** add logic to `wp-builder.php` beyond loading files and instantiating `WP_Builder`.
- Do **not** register new hooks outside `WP_Builder::__construct()`.
- Do **not** create new top-level PHP files — all new PHP code goes in a trait under `includes/`.
