# WP Builder — HTTP API Reference

WP Builder exposes two authenticated WordPress AJAX endpoints and one read-only JSON export URL. All endpoints require the user to be logged in.

---

## Table of contents

- [JSON export (read-only)](#json-export-read-only)
- [AJAX: save layout](#ajax-save-layout)
- [AJAX: update title](#ajax-update-title)
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

Saves the layout JSON, and optionally updates the post status, post title, and page template in a single request.

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
| `page_template` | string  | No       | Page-template slug to store in `_wp_page_template` meta. Not applied when saving a `wp_builder_template` CPT. |

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
| `previewUrl`   | string | Front-end URL to preview the post. For templates this is the WordPress preview link; for other post types it is the permalink. |
| `pageTemplate` | string | Active page-template slug after the save, or `default` if none is set. |
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

## Error responses

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
