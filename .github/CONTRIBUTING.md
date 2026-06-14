# Contributing to WP Builder

Thank you for taking the time to contribute! This document covers bug reports, feature requests, and pull requests.

---

## Table of contents

- [Reporting bugs](#reporting-bugs)
- [Requesting features](#requesting-features)
- [Development setup](#development-setup)
- [Code standards](#code-standards)
- [Submitting a pull request](#submitting-a-pull-request)

---

## Reporting bugs

Use the **Bug report** issue template. Before opening a new issue, search existing issues to avoid duplicates.

Include:
- WordPress version, PHP version, and active theme.
- Whether Elementor is active (and its version).
- Exact steps to reproduce the bug.
- What you expected vs. what actually happened.

---

## Requesting features

Use the **Feature request** issue template. Describe the problem your feature solves, not just the implementation.

---

## Development setup

1. Install WordPress locally (e.g. with [Local](https://localwp.com/) or [wp-env](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-env/)).
2. Clone or copy this repository into `wp-content/plugins/wp-builder/`.
3. Activate the **Builder** plugin in WordPress Admin → Plugins.

There are no build steps — the plugin ships plain PHP, CSS, and vanilla JavaScript.

**Syntax validation:**

```bash
# PHP
php -l wp-builder.php

# JavaScript
node --check assets/admin.js
```

---

## Code standards

- **PHP** — follow the [WordPress PHP Coding Standards](https://developer.wordpress.org/coding-standards/wordpress-coding-standards/php/).
  - Tabs for indentation.
  - All output must be escaped (`esc_html`, `esc_attr`, `esc_url`, etc.).
  - All user input must be sanitised and nonces verified before processing.
- **JavaScript** — plain ES5-compatible vanilla JS; no build tool or transpiler is used.
- **CSS** — BEM-style class names prefixed with `wp-builder-`.
- Keep all PHP logic inside the appropriate trait in `includes/class-*.php`.
- Do not introduce new dependencies (Composer packages, npm packages) without prior discussion.

---

## Submitting a pull request

1. Fork the repository and create a feature branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```
2. Make your changes following the code standards above.
3. Validate syntax:
   ```bash
   php -l wp-builder.php
   node --check assets/admin.js
   ```
4. Open a pull request against `main`. Fill in the pull request template completely.
5. Keep the PR focused — one feature or fix per PR makes review easier.

All contributions are reviewed before merging. Maintainers may ask for changes or clarification.
