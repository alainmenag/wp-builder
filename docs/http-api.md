# WP Builder — HTTP API Reference

WP Builder exposes five authenticated WordPress AJAX endpoints and one read-only JSON export URL. All endpoints require the user to be logged in.

---

## Table of contents

- [JSON export (read-only)](#json-export-read-only)
- [AJAX: get element](#ajax-get-element)
- [AJAX: save element](#ajax-save-element)
- [AJAX: get layout](#ajax-get-layout)
- [AJAX: add element](#ajax-add-element)
- [AJAX: delete element](#ajax-delete-element)
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

## AJAX: get element

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
    "layout": { "version": 2, "createdAt": 1718000000, "updatedAt": 1718000000, "children": [ /* … */ ] },
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
| `layout`        | object | The full layout object for the post (same shape as the stored meta). |
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

## AJAX: save element

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

---

## AJAX: get layout

Returns the full layout object for a post. Used by the structure-view panel to display the element tree.

**URL**

```
POST wp-admin/admin-ajax.php
```

**Authentication:** WordPress session cookie + nonce.

**Request body** (`application/x-www-form-urlencoded`)

| Field     | Type    | Required | Description |
|-----------|---------|----------|-------------|
| `action`  | string  | Yes      | Must be `wp_builder_get_layout`. |
| `nonce`   | string  | Yes      | WordPress nonce created with `wp_create_nonce('wp_builder_get_layout')`. Injected as `window.wpBuilderFrontendEditor.layoutNonce`. |
| `post_id` | integer | Yes      | ID of the post. |

**Success response** — `200 OK`

```json
{
  "success": true,
  "data": {
    "layout": { "version": 2, "createdAt": 1718000000, "updatedAt": 1718001234, "children": [ /* … */ ] }
  }
}
```

**Error responses** — see [Error responses](#error-responses).

---

## AJAX: add element

Appends a new default child element to an existing parent element and returns the re-rendered HTML.

**URL**

```
POST wp-admin/admin-ajax.php
```

**Authentication:** WordPress session cookie + nonce.

**Request body** (`application/x-www-form-urlencoded`)

| Field       | Type    | Required | Description |
|-------------|---------|----------|-------------|
| `action`    | string  | Yes      | Must be `wp_builder_add_element`. |
| `nonce`     | string  | Yes      | WordPress nonce created with `wp_create_nonce('wp_builder_add_element')`. Injected as `window.wpBuilderFrontendEditor.addNonce`. |
| `post_id`   | integer | Yes      | ID of the post. |
| `parent_id` | string  | Yes      | Element ID of the parent to append the new child to. |

**Success response** — `200 OK`

```json
{
  "success": true,
  "data": {
    "html":           "<div data-wp-builder-post-id=\"42\">…</div>",
    "new_element_id": "wpb-lxyz13-abc789",
    "layout":         { /* updated layout object */ }
  }
}
```

| Field            | Type   | Description |
|------------------|--------|-------------|
| `html`           | string | Re-rendered full layout HTML for the DOM swap on the front end. |
| `new_element_id` | string | The generated ID of the newly created element. |
| `layout`         | object | The updated layout object after the add. |

**Error responses** — see [Error responses](#error-responses).

---

## AJAX: delete element

Removes an element (and all its descendants) from the layout and returns the re-rendered HTML. The root element cannot be deleted.

**URL**

```
POST wp-admin/admin-ajax.php
```

**Authentication:** WordPress session cookie + nonce.

**Request body** (`application/x-www-form-urlencoded`)

| Field        | Type    | Required | Description |
|--------------|---------|----------|-------------|
| `action`     | string  | Yes      | Must be `wp_builder_delete_element`. |
| `nonce`      | string  | Yes      | WordPress nonce created with `wp_create_nonce('wp_builder_delete_element')`. Injected as `window.wpBuilderFrontendEditor.deleteNonce`. |
| `post_id`    | integer | Yes      | ID of the post. |
| `element_id` | string  | Yes      | ID of the element to delete. |

**Success response** — `200 OK`

```json
{
  "success": true,
  "data": {
    "html":   "<div data-wp-builder-post-id=\"42\">…</div>",
    "layout": { /* updated layout object */ }
  }
}
```

| Field    | Type   | Description |
|----------|--------|-------------|
| `html`   | string | Re-rendered full layout HTML for the DOM swap on the front end. |
| `layout` | object | The updated layout object after the delete. |

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
