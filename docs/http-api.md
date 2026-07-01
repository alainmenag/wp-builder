# WP Builder — HTTP API Reference

WP Builder exposes two authenticated WordPress AJAX endpoints and one read-only JSON export URL. All endpoints require the user to be logged in.

---

## Table of contents

- [JSON export (read-only)](#json-export-read-only)
- [AJAX: save layout](#ajax-save-layout)
- [AJAX: update title](#ajax-update-title)
- [AJAX: get element (front-end editor)](#ajax-get-element-front-end-editor)
- [AJAX: save element (front-end editor)](#ajax-save-element-front-end-editor)
- [Error responses](#error-responses)

---

## JSON export (read-only)

Outputs the sanitised layout JSON for a post directly in the browser. Useful for inspecting or exporting the stored data.

**URL**

```
GET wp-admin/post.php?post={id}&action=builder&view=json
```

**Authentication:** WordPress session cookie (must be logged in and have `edit_post` capability for the post).

**Query parameters**

| Parameter | Type    | Required | Description                |
|-----------|---------|----------|----------------------------|
| `post`    | integer | Yes      | The WordPress post ID.     |
| `action`  | string  | Yes      | Must be `builder`.         |
| `view`    | string  | Yes      | Must be `json`.            |

**Response**

`200 OK` with `Content-Type: application/json`.

The response body is the full layout object, pretty-printed with `JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES`:

```json
{
  "version": 2,
  "createdAt": 1718000000,
  "updatedAt": 1718001234,
  "children": [
    {
      "id": "wpb-lxyz12-abc456",
      "node": "div",
      "props": {
        "flexDirection": "row",
        "flexGrow": "",
        "gap": "16px"
      },
      "style": "",
      "content": "",
      "attrs": {},
      "children": []
    }
  ]
}
```

**Error conditions**

- `wp_die()` with a plain-text error message if the post does not exist, belongs to an unsupported post type, or the current user cannot edit it.

---

## AJAX: save layout

Saves the layout JSON, and optionally updates the post status, post title, and page layout in a single request.

**URL**

```
POST wp-admin/admin-ajax.php
```

**Authentication:** WordPress session cookie + nonce.

**Request body** (`application/x-www-form-urlencoded`)

| Field           | Type    | Required | Description |
|-----------------|---------|----------|-------------|
| `action`        | string  | Yes      | Must be `wp_builder_save_layout`. |
| `nonce`         | string  | Yes      | WordPress nonce created with `wp_create_nonce('wp_builder_save_layout')`. Injected into the page as `window.wpBuilder.nonce`. |
| `post_id`       | integer | Yes      | ID of the post to save. |
| `layout`        | string  | Yes      | JSON-encoded layout object (version 2 schema). |
| `post_status`   | string  | No       | New post status. Accepted values: `publish`, `draft`, `pending`, `private`. Ignored if the user does not have `publish_post` capability when changing to `publish` or `private`. |
| `title`         | string  | No       | New post title. Applied after the layout is saved. |
| `page_template` | string  | No       | Page-layout slug to store in `_wp_page_template` meta. Not applied when saving a `wp_builder_template` CPT. |

**Success response** — `200 OK`

```json
{
  "success": true,
  "data": {
    "layout": { /* sanitised layout object */ },
    "postStatus": "publish",
    "postTitle": "My Page",
    "docTitle": "Builder: My Page",
    "previewUrl": "https://example.com/my-page/",
    "pageTemplate": "wp-builder-canvas",
    "message": "Layout saved."
  }
}
```

| Field          | Type   | Description |
|----------------|--------|-------------|
| `layout`       | object | The sanitised layout that was stored. |
| `postStatus`   | string | The post's status after the save. |
| `postTitle`    | string | The post's title after the save. |
| `docTitle`     | string | Browser `<title>` string — `"Builder: {post title}"`. |
| `previewUrl`   | string | Front-end URL to preview the post. For snippets this is the WordPress preview link; for other post types it is the permalink. |
| `pageTemplate` | string | Active page-layout slug after the save, or `default` if none is set. |
| `message`      | string | Localised confirmation string. |

**Error responses** — see [Error responses](#error-responses).

---

## AJAX: update title

Updates only the post title. Called in real time as the user edits the title field in the builder header.

**URL**

```
POST wp-admin/admin-ajax.php
```

**Authentication:** WordPress session cookie + nonce.

**Request body** (`application/x-www-form-urlencoded`)

| Field     | Type    | Required | Description |
|-----------|---------|----------|-------------|
| `action`  | string  | Yes      | Must be `wp_builder_update_title`. |
| `nonce`   | string  | Yes      | WordPress nonce created with `wp_create_nonce('wp_builder_update_title')`. Injected into the page as `window.wpBuilder.titleNonce`. |
| `post_id` | integer | Yes      | ID of the post to update. |
| `title`   | string  | Yes      | New post title (sanitised with `sanitize_text_field`). |

**Success response** — `200 OK`

```json
{
  "success": true,
  "data": {
    "title": "My Updated Title",
    "docTitle": "Builder: My Updated Title",
    "previewUrl": "https://example.com/my-updated-title/"
  }
}
```

| Field        | Type   | Description |
|--------------|--------|-------------|
| `title`      | string | The saved post title. |
| `docTitle`   | string | Browser `<title>` string — `"Builder: {post title}"`. |
| `previewUrl` | string | Front-end URL to preview the post. |

**Error responses** — see [Error responses](#error-responses).

---

## AJAX: get element (front-end editor)

Fetches a single element's data by ID along with the panel schema needed to build the front-end quick-editor UI dynamically.

**URL**

```
POST wp-admin/admin-ajax.php
```

**Authentication:** WordPress session cookie + nonce.

**Request body** (`application/x-www-form-urlencoded`)

| Field        | Type    | Required | Description |
|--------------|---------|----------|-------------|
| `action`     | string  | Yes      | Must be `wp_builder_get_element`. |
| `nonce`      | string  | Yes      | WordPress nonce created with `wp_create_nonce('wp_builder_get_element')`. Injected as `window.wpBuilderFrontendEditor.getNonce`. |
| `post_id`    | integer | Yes      | ID of the post containing the element. |
| `element_id` | string  | Yes      | The `id` value of the element to fetch. |

**Success response** — `200 OK`

```json
{
  "success": true,
  "data": {
    "element": {
      "id": "wpb-lxyz12-abc456",
      "node": "div",
      "props": { "flexDirection": "row", "flexGrow": "", "gap": "16px" },
      "style": "",
      "content": "",
      "attrs": {},
      "children": []
    },
    "post_title": "My Page",
    "post_status": "publish",
    "page_template": "wp-builder-canvas",
    "fields": [ /* panel schema — see below */ ]
  }
}
```

| Field           | Type   | Description |
|-----------------|--------|-------------|
| `element`       | object | The element data object (layout schema element shape). |
| `post_title`    | string | Current post title. |
| `post_status`   | string | Current post status. |
| `page_template` | string | Active page-layout slug, or empty string for snippet CPTs. |
| `fields`        | array  | Panel schema for dynamic front-end editor construction — see below. |

### `fields` panel schema

`fields` is an array of **tab** descriptors. Each tab contains one or more **accordion** sections, and each accordion contains one or more **field** descriptors. The structure is used by `frontend-editor.js` to build the quick-editor panel DOM dynamically rather than hardcoding it client-side.

```json
[
  {
    "key": "main",
    "label": "Main",
    "accordions": [
      {
        "slug": "settings",
        "label": "Settings",
        "open": true,
        "fields": [
          { "type": "text",   "id": "wpbfe-post-title",  "label": "Post Title" },
          {
            "type": "select", "id": "wpbfe-post-status", "label": "Post Status",
            "options": [
              { "value": "publish", "label": "Published" },
              { "value": "draft",   "label": "Draft" }
            ]
          }
        ]
      }
    ]
  },
  {
    "key": "element",
    "label": "Element",
    "accordions": [
      {
        "slug": "identity",
        "label": "Identity",
        "open": false,
        "fields": [
          { "type": "select", "id": "wpbfe-node",    "label": "Node",       "options": [{ "value": "div", "label": "div" }, "…"] },
          { "type": "text",   "id": "wpbfe-node-id", "label": "Element ID", "placeholder": "e.g. my-element" }
        ]
      },
      {
        "slug": "content",
        "label": "Content",
        "open": true,
        "fields": [
          { "type": "textarea", "id": "wpbfe-html-content", "label": "HTML Content", "attrs": { "rows": "8" } }
        ]
      },
      {
        "slug": "layout",
        "label": "Layout",
        "open": false,
        "fields": [
          { "type": "select", "id": "wpbfe-flex-direction", "label": "Flex Direction", "options": ["…"] },
          { "type": "number", "id": "wpbfe-flex-grow",      "label": "Flex Grow",      "placeholder": "0", "attrs": { "min": "0", "step": "1" } },
          { "type": "text",   "id": "wpbfe-gap",            "label": "Gap",            "placeholder": "e.g. 16px" }
        ]
      },
      {
        "slug": "style",
        "label": "Style",
        "open": false,
        "fields": [
          { "type": "textarea", "id": "wpbfe-custom-style", "label": "Custom CSS", "hint": "Use <code>self</code> to target this element.", "attrs": { "rows": "6", "placeholder": "self {\n  background-color: red;\n}" } }
        ]
      },
      {
        "slug": "attrs",
        "label": "Attributes",
        "open": false,
        "fields": []
      }
    ]
  }
]
```

**Tab descriptors**

| Key          | Type   | Description |
|--------------|--------|-------------|
| `key`        | string | Logical tab name (`main`, `element`). Used as `data-tab` on the switcher button. |
| `label`      | string | Translated display label. |
| `accordions` | array  | Ordered list of accordion descriptors. |

**Accordion descriptors**

| Key      | Type    | Description |
|----------|---------|-------------|
| `slug`   | string  | Appended to `wpbfe-accordion-` to form the accordion's DOM id. |
| `label`  | string  | Translated display label. |
| `open`   | boolean | Whether the accordion starts expanded. |
| `fields` | array   | Ordered list of field descriptors. |

**Field descriptors** (shared keys)

| Key           | Type    | Description |
|---------------|---------|-------------|
| `type`        | string  | Field type: `text`, `number`, `select`, `textarea`, or `container`. |
| `id`          | string  | DOM id of the control. Also used by the JavaScript `FIELD_REFS` map to wire the control to its module-level variable. |
| `label`       | string  | Translated label text. |
| `placeholder` | string  | Input placeholder (text/number fields). |
| `hint`        | string  | HTML hint paragraph rendered below the label (may contain `<code>`). |
| `attrs`       | object  | Extra HTML attributes to apply to the control (e.g. `rows`, `min`, `step`). Boolean values (`true`/`false`) are assigned as DOM properties. |
| `options`     | array   | Select options — `{ value, label, selected? }` — for `select` fields. |

The `attrs` accordion (`slug: "attrs"`) always has an empty `fields` array; its content is populated client-side by `renderNodeAttrs()` after the element data is loaded.

**Error responses** — see [Error responses](#error-responses).

---

## AJAX: save element (front-end editor)

Updates a single element in the layout and returns the re-rendered HTML.

**URL**

```
POST wp-admin/admin-ajax.php
```

**Authentication:** WordPress session cookie + nonce.

**Request body** (`application/x-www-form-urlencoded`)

| Field            | Type    | Required | Description |
|------------------|---------|----------|-------------|
| `action`         | string  | Yes      | Must be `wp_builder_save_element`. |
| `nonce`          | string  | Yes      | WordPress nonce created with `wp_create_nonce('wp_builder_save_element')`. Injected as `window.wpBuilderFrontendEditor.saveNonce`. |
| `post_id`        | integer | Yes      | ID of the post. |
| `element_id`     | string  | Yes      | Current element ID. |
| `new_element_id` | string  | No       | New element ID (must be unique if different from `element_id`). |
| `node`           | string  | No       | HTML tag for the element. |
| `props`          | string  | No       | JSON-encoded props object (`flexDirection`, `flexGrow`, `gap`). |
| `style`          | string  | No       | Scoped CSS string using `self` as the element selector. |
| `content`        | string  | No       | Inner HTML content. |
| `attrs`          | string  | No       | JSON-encoded node-specific attributes object. |
| `post_status`    | string  | No       | New post status. Accepted values: `publish`, `draft`, `pending`, `private`. |
| `title`          | string  | No       | New post title. |
| `page_template`  | string  | No       | Page-layout slug. Not applied when saving a `wp_builder_template` CPT. |

**Success response** — `200 OK`

```json
{
  "success": true,
  "data": {
    "element": { /* sanitised element object */ },
    "html": "<div data-wp-builder-post-id=\"42\">…</div>",
    "post_title": "My Page",
    "post_status": "publish",
    "page_template": "wp-builder-canvas"
  }
}
```

| Field           | Type   | Description |
|-----------------|--------|-------------|
| `element`       | object | The sanitised element data after the save. |
| `html`          | string | Re-rendered full layout HTML for the DOM swap on the front end. |
| `post_title`    | string | Post title after the save. |
| `post_status`   | string | Post status after the save. |
| `page_template` | string | Active page-layout slug after the save. |

**Error responses** — see [Error responses](#error-responses).

All AJAX endpoints return standard WordPress JSON error envelopes on failure.

**400 Bad Request** — invalid or missing input:

```json
{
  "success": false,
  "data": { "message": "Invalid layout data." }
}
```

Common 400 messages:

| Message | Cause |
|---------|-------|
| `"Unsupported post type."` | `post_id` refers to a post whose type is not `post`, `page`, or `wp_builder_template`. |
| `"Invalid layout data."` | The `layout` field is not valid JSON or does not decode to an array. |

**403 Forbidden** — the current user lacks the required capability:

```json
{
  "success": false,
  "data": { "message": "You do not have permission to save this layout." }
}
```

**Nonce failure** — WordPress terminates with a `-1` response (HTTP 200 with body `-1`) when `check_ajax_referer()` fails. This typically means the nonce has expired (default lifetime: 12 hours) or is invalid.
