# GitHub Copilot instructions for WP Builder

This file gives GitHub Copilot context about the project so suggestions stay consistent with its conventions.

---

## Project overview

WP Builder is a lightweight WordPress page-builder plugin. It lets users build infinitely nestable container layouts on posts, pages, and reusable snippets through a **frontend inline editor** loaded for logged-in users directly on the front end. It has **no external PHP dependencies** and **no JavaScript build step**.

- **Plugin entry point:** `wp-builder.php` — a slim bootstrap that defines two constants and glob-loads every `includes/class-*.php` file, then instantiates `WP_Builder`.
- **Main class:** `includes/class-wp-builder.php` — a `final class WP_Builder` that composes all functionality via PHP traits and registers every WordPress hook in its constructor.
- **All business logic** lives in trait files under `includes/`. Each file declares exactly one trait.
- **Assets:** plain CSS in `assets/` and ES6 native-module JavaScript in `assets/js/`. No bundler, no transpiler, no TypeScript.
- **Plugin version:** `0.1.0` (defined as `private const VERSION` in `class-wp-builder.php`).

---

## Repository layout

```
wp-builder/
├── wp-builder.php                  # Bootstrap
├── includes/
│   ├── class-wp-builder.php        # Main class + hook registration
│   ├── class-admin.php             # Trait: admin menus, row actions, admin bar
│   ├── class-ajax.php     # Trait: AJAX get/save element, get layout, add/delete element
│   ├── class-editor.php            # Trait: action=builder redirect to front end; JSON export
│   ├── class-elementor.php         # Trait: Elementor widget + editor styles
│   ├── class-frontend.php          # Trait: shortcodes, front-end assets, content filter
│   ├── class-layout.php            # Trait: load/save/sanitise/render layout data
│   ├── class-page-chrome.php       # Trait: custom page layouts + routing
│   └── class-post-types.php        # Trait: post meta, snippet CPT, rewrite rules
├── assets/
│   ├── shared.css                  # Shared design tokens and reusable UI components (--wpb-*)
│   ├── editor.css         # Frontend quick-editor panel styles (wpbe- prefix)
│   ├── js/
│   │   ├── editor.js      # Entry point — boots the frontend quick-editor (ES module IIFE)
│   │   ├── constants.js            # Node glossary, void-node set, icon SVG strings
│   │   ├── layout.js               # Layout data helpers (create, find, add, delete elements)
│   │   └── dom-helpers.js          # Shared attribute-control rendering helpers
│   ├── elementor-editor.css        # Elementor panel overrides
│   └── frontend.css                # Front-end container layout styles
├── templates/
│   ├── wp-builder-canvas.php       # Canvas page layout (no theme chrome)
│   └── wp-builder-full-width.php   # Full-width page layout (theme header/footer)
├── widgets/
│   └── widget-builder-template.php # Elementor Builder Snippet widget
└── docs/
    └── http-api.md                 # HTTP / AJAX API reference
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
- **Constants** (`VERSION`, `META_KEY`, `MENU_SLUG`, `ACTION`, `GET_NONCE_ACTION`, `SAVE_NONCE_ACTION`, `GET_LAYOUT_NONCE_ACTION`, `ADD_NONCE_ACTION`, `DELETE_NONCE_ACTION`, `TEMPLATE_CPT`, `REWRITE_VERSION`, `REWRITE_VERSION_OPTION`) are declared `private const` in `class-wp-builder.php` and accessed as `self::CONSTANT_NAME` within the class/traits.
- **Helper methods** shared across traits (`is_builder_request`, `get_builder_url`, `get_preview_url`, `get_builder_doc_title`, `supported_post_types`, `is_supported_post_type`) live in `class-wp-builder.php`.
- **Internationalisation:** wrap every user-facing string in `__()`, `_e()`, `esc_html__()`, `esc_html_e()`, etc. Use the text domain `wp-builder`.

---

## JavaScript conventions

- **ES6 native modules** — the editor is split across `assets/js/` as native ES modules. `assets/js/editor.js` is the entry point; PHP loads it with `type="module"` via `add_module_type_to_script_tag()`.
- **No framework, no build step** — plain DOM APIs (`document.getElementById`, `addEventListener`, `classList`, etc.).
- **Module dependencies:** `constants` and `layout` are leaf modules; `dom-helpers` imports from `constants`; `editor.js` imports from `constants`, `layout`, and `dom-helpers`.
- **Global config** is injected by `wp_localize_script` as `window.wpBuilderEditor` (see `class-frontend.php` → `enqueue_frontend_editor_assets`). Because `wp_localize_script` emits a plain `var` declaration (no `type="module"`), `window.wpBuilderEditor` is available globally when the deferred module executes. Access it as `const config = window.wpBuilderEditor || {};`. The object exposes:
  - `ajaxUrl` — WordPress admin-ajax URL.
  - `builderBaseUrl` — `wp-admin/post.php` base URL (used for the JSON export link).
  - `getNonce` — nonce for `wp_builder_get_element`.
  - `saveNonce` — nonce for `wp_builder_save_element`.
  - `layoutNonce` — nonce for `wp_builder_get_layout`.
  - `addNonce` — nonce for `wp_builder_add_element`.
  - `deleteNonce` — nonce for `wp_builder_delete_element`.
  - `isTemplate` — boolean; `true` when viewing a `wp_builder_template` CPT (snippet).
  - `pageTemplate` — active page-layout slug (e.g. `wp-builder-canvas`). Empty string for snippets.
  - `pageTemplates` — object mapping page-layout slugs to display names. Empty for snippets.
- **AJAX calls** must send `action`, `nonce`, `post_id`, and the relevant payload to `config.ajaxUrl` using `fetch`.
- **No new external libraries.**

---

## CSS conventions

- All class names are prefixed with `wp-builder-` (e.g. `.wp-builder-container`, `.wp-builder-panel`).
- Shared design tokens (`--wpb-*`) live in `assets/shared.css`, loaded as a dependency of `editor.css`.
- The frontend editor stylesheet (`assets/editor.css`) uses the `wpbe-` prefix for editor-specific class names.
- The frontend stylesheet (`assets/frontend.css`) is minimal — only layout rules for `.wp-builder-layout` and `.wp-builder-container`.

---

## Layout data model

The layout is stored as JSON in post meta under the key `_wp_builder_layout`. The top-level shape is:

```json
{
  "version": 2,
  "createdAt": 1718000000,
  "updatedAt": 1718000000,
  "children": [ /* exactly one root element */ ]
}
```

- `version` is always `2`.
- `createdAt` / `updatedAt` are Unix timestamps (seconds).
- `children` always contains exactly **one** root element. The sanitiser enforces this — only `children[0]` is kept.

Each **element** (root and nested alike):

```json
{
  "id": "wpb-lxyz12-abc456",
  "node": "div",
  "props": {
    "flexDirection": "row",
    "flexGrow": "1",
    "gap": "16px"
  },
  "style": "self { background: red; }",
  "content": "<p>Hello</p>",
  "attrs": { "src": "https://…" },
  "children": [ /* nested elements — unlimited depth */ ]
}
```

- `node` must be one of the allowed tags defined in `sanitize_node_tag()` (see `class-layout.php`): `div`, `section`, `article`, `main`, `aside`, `header`, `footer`, `nav`, `p`, `span`, `h1`–`h6`, `a`, `button`, `figure`, `figcaption`, `img`, `input`, `label`, `audio`, `video`, `source`, `iframe`. Unrecognised values fall back to `div`.
- `props` supports `flexDirection` (`"row"` | `"column"` | `""`), `flexGrow` (numeric string or `""`), and `gap` (CSS value string).
- `style` is scoped: `self` is replaced with `[data-wp-builder-id="<id>"]` at render time.
- `content` is stored and rendered as raw HTML (sanitised through `wp_kses_post`).
- `attrs` is a flat object of node-specific HTML attributes (see `get_node_glossary()` in `class-layout.php` for the allowed set per tag).
- `id` values are generated as `wpb-<base36-timestamp>-<base36-random>` via `generate_element_id()`.

---

## Key WordPress hooks

| Hook | Handler | File |
|------|---------|------|
| `init` | `register_meta`, `register_template_post_type`, `register_shortcodes`, `maybe_flush_rewrite_rules` | post-types, frontend |
| `admin_menu` | `register_builder_page`, `register_template_menu` | admin |
| `load-post-new.php` | `maybe_redirect_new_template` | admin |
| `load-post.php` | `maybe_redirect_template_edit`, `maybe_render_builder_request` | admin, editor |
| `wp_ajax_wp_builder_get_element` | `ajax_get_element` | ajax-frontend |
| `wp_ajax_wp_builder_save_element` | `ajax_save_element` | ajax-frontend |
| `wp_ajax_wp_builder_get_layout` | `ajax_get_layout` | ajax-frontend |
| `wp_ajax_wp_builder_add_element` | `ajax_add_element` | ajax-frontend |
| `wp_ajax_wp_builder_delete_element` | `ajax_delete_element` | ajax-frontend |
| `wp_enqueue_scripts` | `enqueue_frontend_assets` | frontend |
| `admin_bar_menu` | `add_admin_bar_nodes` | admin |
| `post_row_actions` / `page_row_actions` / `wp_builder_template_row_actions` | `add_row_action` | admin |
| `post_type_link` | `template_post_type_link` | post-types |
| `the_content` | `render_builder_content` | frontend |
| `theme_page_templates` / `theme_post_templates` | `register_page_templates` | page-chrome |
| `template_include` | `maybe_use_builder_template` | page-chrome |
| `elementor/widgets/register` | `register_elementor_widget` | elementor |
| `elementor/editor/after_enqueue_styles` | `enqueue_elementor_editor_styles` | elementor |

---

## HTTP / AJAX API

All AJAX endpoints are registered on the standard WordPress admin-ajax handler (`wp-admin/admin-ajax.php`). They are **authenticated** (logged-in users only, via `wp_ajax_*`). See `docs/http-api.md` for the full reference.

### Read-only JSON export

`GET wp-admin/post.php?post={id}&action=builder&view=json`

Returns the sanitised layout object for the post as pretty-printed JSON. Useful for inspecting or exporting the stored layout.

### AJAX: get element

`POST wp-admin/admin-ajax.php` with `action=wp_builder_get_element`

Fetches a single element by ID along with the panel schema for the frontend quick-editor.

### AJAX: save element

`POST wp-admin/admin-ajax.php` with `action=wp_builder_save_element`

Updates a single element's properties, optionally updates post status/title/page layout, and returns re-rendered HTML.

### AJAX: get layout

`POST wp-admin/admin-ajax.php` with `action=wp_builder_get_layout`

Returns the full layout object for a post.

### AJAX: add element

`POST wp-admin/admin-ajax.php` with `action=wp_builder_add_element`

Appends a new default child element to a parent element and returns re-rendered HTML.

### AJAX: delete element

`POST wp-admin/admin-ajax.php` with `action=wp_builder_delete_element`

Removes an element (and its descendants) from the layout and returns re-rendered HTML.

---



| Shortcode | Attribute | Description |
|-----------|-----------|-------------|
| `[wp_builder id="N"]` | `id` (post ID) | Renders the builder layout of any published post, page, or snippet. |

---

## Supported post types

`post`, `page`, and the custom post type `wp_builder_template` (slug `wp_builder_template`). The helper `supported_post_types()` returns all three; `is_supported_post_type()` checks membership.

---

## Testing / validation

There is no automated test suite. Validate syntax before committing:

```bash
php -l wp-builder.php
for f in assets/js/*.js; do node --check "$f"; done
```

---

## What to avoid

- Do **not** add `composer.json`, `package.json`, or any build tooling.
- Do **not** use direct `$wpdb` queries — use the WordPress API instead.
- Do **not** output unescaped values in PHP templates.
- Do **not** add logic to `wp-builder.php` beyond loading files and instantiating `WP_Builder`.
- Do **not** register new hooks outside `WP_Builder::__construct()`.
- Do **not** create new top-level PHP files — all new PHP code goes in a trait under `includes/`.
- Do **not** add new JavaScript files outside `assets/js/` — new JS modules go there and must be imported by `editor.js`.
