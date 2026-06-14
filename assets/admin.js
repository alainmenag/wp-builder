(function () {
	'use strict';

	var config = window.wpBuilder || {};
	var text = config.i18n || {};
	var canvas = document.getElementById('wp-builder-canvas');
	var saveButton = document.getElementById('wp-builder-save');
	var shortcodePanel = document.getElementById('wp-builder-shortcode-panel');
	var addNestedButton = document.getElementById('wp-builder-add-nested');
	var selectionName = document.getElementById('wp-builder-selection-name');
	var saveStatus = document.getElementById('wp-builder-save-status');
	var addButtons = document.querySelectorAll('[data-wp-builder-add]');
	var htmlTextarea = document.getElementById('wp-builder-html-content');
	var inspectorEditor = document.getElementById('wp-builder-inspector-editor');
	var containerInspector = document.getElementById('wp-builder-inspector-container');
	var flexDirectionSelect = document.getElementById('wp-builder-flex-direction');
	var flexGrowInput = document.getElementById('wp-builder-flex-grow');
	var gapInput = document.getElementById('wp-builder-gap');
	var customCssTextarea = document.getElementById('wp-builder-custom-css');
	var nodeSelect = document.getElementById('wp-builder-node');
	var nodeSelectGroup = document.getElementById('wp-builder-inspector-node');
	var postStatusSelect = document.getElementById('wp-builder-post-status');
	var titleInput = document.getElementById('wp-builder-title');
	var viewLink = document.getElementById('wp-builder-view-link');
	var pageTemplateSelect = document.getElementById('wp-builder-page-template');

	if (!canvas || !saveButton) {
		return;
	}

	var state = {
		layout: normalizeLayout(config.layout),
		selectedId: null,
		dirty: false,
		saving: false,
		pageTemplate: config.pageTemplate || 'default'
	};

	function normalizeNodeTag(tag) {
		var allowed = { div: true, section: true, article: true, main: true, aside: true, header: true, footer: true, nav: true, p: true, span: true, h1: true, h2: true, h3: true, h4: true, h5: true, h6: true };
		return (typeof tag === 'string' && allowed[tag]) ? tag : 'div';
	}

	function normalizeLayout(layout) {
		if (!layout || !Array.isArray(layout.elements)) {
			return { version: 1, node: 'div', content: '', elements: [] };
		}
		return {
			version: 1,
			node: normalizeNodeTag(layout.node),
			content: typeof layout.content === 'string' ? layout.content : '',
			elements: normalizeElements(layout.elements)
		};
	}

	function normalizeContainerProps(props) {
		var allowed = { '': true, 'row': true, 'column': true };
		var p = (props && typeof props === 'object') ? props : {};
		return {
			flexDirection: (typeof p.flexDirection === 'string' && allowed[p.flexDirection]) ? p.flexDirection : '',
			flexGrow: (typeof p.flexGrow === 'string') ? p.flexGrow : '',
			gap: (typeof p.gap === 'string') ? p.gap : ''
		};
	}

	function normalizeElements(elements) {
		return elements.reduce(function (clean, element) {
			if (!element || typeof element.type !== 'string') {
				return clean;
			}

			if (element.type === 'container') {
				clean.push({
					id: element.id || createId('container-'),
					type: 'container',
					node: normalizeNodeTag(element.node),
					props: normalizeContainerProps(element.props),
					customCss: typeof element.customCss === 'string' ? element.customCss : '',
					content: typeof element.content === 'string' ? element.content : '',
					children: Array.isArray(element.children) ? normalizeElements(element.children) : []
				});
			} else if (element.type === 'html') {
				// Migrate legacy html elements to containers.
				clean.push({
					id: element.id || createId('container-'),
					type: 'container',
					node: 'div',
					props: { flexDirection: '', flexGrow: '', gap: '' },
					customCss: '',
					content: typeof element.content === 'string' ? element.content : '',
					children: []
				});
			}

			return clean;
		}, []);
	}

	function createId(prefix) {
		prefix = prefix || 'container-';
		return prefix + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
	}

	function createContainer() {
		return { id: createId('container-'), type: 'container', node: 'div', props: { flexDirection: '', flexGrow: '', gap: '' }, customCss: '', content: '', children: [] };
	}

	function getElementName(id) {
		if (!id) {
			return text.root || 'Root';
		}
		return text.addContainer || 'Container';
	}

	function findElement(elements, id) {
		var index, found;
		for (index = 0; index < elements.length; index += 1) {
			if (elements[index].id === id) {
				return elements[index];
			}
			found = findElement(elements[index].children || [], id);
			if (found) {
				return found;
			}
		}
		return null;
	}

	function addElement(parentId, element) {
		var parent;
		if (!parentId) {
			state.layout.elements.push(element);
			return true;
		}
		parent = findElement(state.layout.elements, parentId);
		if (!parent || parent.type !== 'container') {
			return false;
		}
		parent.children = parent.children || [];
		parent.children.push(element);
		return true;
	}

	function deleteElement(elements, id) {
		var index;
		for (index = 0; index < elements.length; index += 1) {
			if (elements[index].id === id) {
				elements.splice(index, 1);
				return true;
			}
			if (deleteElement(elements[index].children || [], id)) {
				return true;
			}
		}
		return false;
	}

	function markDirty() {
		state.dirty = true;
		updateStatus(text.unsaved || 'Unsaved changes');
	}

	function updateStatus(message) {
		if (saveStatus) {
			saveStatus.textContent = message || '';
		}
	}

	function selectElement(id) {
		state.selectedId = id || null;
		render();
	}

	function addElementToSelection(type) {
		var element = createContainer();
		if (!addElement(state.selectedId, element)) {
			state.selectedId = null;
			addElement(null, element);
		}
		state.selectedId = element.id;
		markDirty();
		render();
	}

	function addContainerToSelection() {
		addElementToSelection('container');
	}

	function deleteSelection() {
		if (!state.selectedId) {
			return;
		}
		if (deleteElement(state.layout.elements, state.selectedId)) {
			state.selectedId = null;
			markDirty();
			render();
		}
	}

	function render() {
		renderCanvas();
		renderInspector();
	}

	function renderCanvas() {
		var root = document.createElement('div');
		var bar = document.createElement('div');
		var title = document.createElement('button');
		var addButton = document.createElement('button');
		var body = document.createElement('div');
		canvas.innerHTML = '';
		root.className = 'wp-builder-canvas-root' + (!state.selectedId ? ' is-selected' : '');
		root.tabIndex = 0;
		root.setAttribute('role', 'button');
		root.setAttribute('aria-label', text.canvas || 'Canvas');

		bar.className = 'wp-builder-node-bar';

		title.type = 'button';
		title.className = 'wp-builder-node-title';
		title.textContent = (text.root || 'Root') + ' \u00b7 ' + (state.layout.node || 'div');
		title.addEventListener('click', function (event) {
			event.stopPropagation();
			selectElement(null);
		});

		addButton.type = 'button';
		addButton.className = 'wp-builder-node-action';
		addButton.textContent = '+';
		addButton.setAttribute('aria-label', text.addContainer || 'Add container');
		addButton.addEventListener('click', function (event) {
			event.stopPropagation();
			state.selectedId = null;
			addContainerToSelection();
		});

		bar.appendChild(title);
		bar.appendChild(addButton);

		body.className = 'wp-builder-canvas-root-body';

		root.addEventListener('click', function (event) {
			if (event.target === root || event.target === body) {
				selectElement(null);
			}
		});

		if (state.layout.content) {
			var rootPreview = document.createElement('div');
			rootPreview.className = 'wp-builder-node-html-preview';
			rootPreview.innerHTML = state.layout.content;
			body.appendChild(rootPreview);
		}

		if (!state.layout.elements.length && !state.layout.content) {
			body.appendChild(renderEmpty(text.emptyCanvas || 'Empty canvas'));
		} else {
			state.layout.elements.forEach(function (element) {
				body.appendChild(renderElement(element, 0));
			});
		}

		root.appendChild(bar);
		root.appendChild(body);

		canvas.appendChild(root);
		cleanupAllContainerStyles();
		syncAllContainerStyles(state.layout.elements);
	}

	function renderElement(element, depth) {
		return renderContainerNode(element, depth);
	}

	function renderContainerNode(element, depth) {
		var node = document.createElement('section');
		var bar = document.createElement('div');
		var title = document.createElement('button');
		var addButton = document.createElement('button');
		var removeButton = document.createElement('button');
		var body = document.createElement('div');

		node.className = 'wp-builder-node wp-builder-node-container' + (state.selectedId === element.id ? ' is-selected' : '');
		node.dataset.wpBuilderId = element.id;
		node.style.setProperty('--wp-builder-depth', depth);

		bar.className = 'wp-builder-node-bar';

		title.type = 'button';
		title.className = 'wp-builder-node-title';
		title.textContent = (text.addContainer || 'Container') + ' \u00b7 ' + (element.node || 'div');
		title.addEventListener('click', function (event) {
			event.stopPropagation();
			selectElement(element.id);
		});

		addButton.type = 'button';
		addButton.className = 'wp-builder-node-action';
		addButton.textContent = '+';
		addButton.setAttribute('aria-label', 'Add container');
		addButton.addEventListener('click', function (event) {
			event.stopPropagation();
			state.selectedId = element.id;
			addContainerToSelection();
		});

		removeButton.type = 'button';
		removeButton.className = 'wp-builder-node-action wp-builder-node-action-danger';
		removeButton.textContent = 'x';
		removeButton.setAttribute('aria-label', text.delete || 'Delete');
		removeButton.addEventListener('click', function (event) {
			event.stopPropagation();
			state.selectedId = element.id;
			deleteSelection();
		});

		body.className = 'wp-builder-node-body';
		applyContainerFlexStyles(element.props || {}, node, body);

		var preview = document.createElement('div');
		preview.className = 'wp-builder-node-html-preview';
		if (element.content) {
			preview.innerHTML = element.content;
		}
		body.appendChild(preview);

		if (element.children && element.children.length) {
			element.children.forEach(function (child) {
				body.appendChild(renderElement(child, depth + 1));
			});
		} else if (!element.content) {
			body.appendChild(renderEmpty(text.emptyContainer || 'Empty container'));
		}

		bar.appendChild(title);
		bar.appendChild(addButton);
		bar.appendChild(removeButton);
		node.appendChild(bar);
		node.appendChild(body);

		node.addEventListener('click', function (event) {
			event.stopPropagation();
			selectElement(element.id);
		});

		return node;
	}

	function renderEmpty(label) {
		var empty = document.createElement('div');
		empty.className = 'wp-builder-empty-state';
		empty.textContent = label;
		return empty;
	}

	function renderInspector() {
		var selected = state.selectedId ? findElement(state.layout.elements, state.selectedId) : null;
		var isContainer = !!(selected && selected.type === 'container');
		var isRoot = !state.selectedId;
		var showCommon = isRoot || isContainer;

		if (selectionName) {
			selectionName.textContent = getElementName(state.selectedId);
		}

		if (addNestedButton) {
			addNestedButton.hidden = !isContainer;
		}

		if (nodeSelectGroup) {
			nodeSelectGroup.hidden = !showCommon;
		}

		if (nodeSelect) {
			if (isContainer) {
				nodeSelect.value = selected.node || 'div';
			} else if (isRoot) {
				nodeSelect.value = state.layout.node || 'div';
			}
		}

		if (inspectorEditor) {
			inspectorEditor.hidden = !showCommon;
		}

		if (showCommon && htmlTextarea) {
			htmlTextarea.value = isContainer ? (selected.content || '') : (state.layout.content || '');
		}

		if (containerInspector) {
			containerInspector.hidden = !isContainer;
		}

		if (shortcodePanel) {
			shortcodePanel.hidden = false;
		}

		if (postStatusSelect) {
			postStatusSelect.value = config.postStatus || 'draft';
		}

		if (pageTemplateSelect) {
			pageTemplateSelect.value = state.pageTemplate || 'default';
		}

		if (isContainer && selected) {
			var props = selected.props || {};
			if (flexDirectionSelect) { flexDirectionSelect.value = props.flexDirection || ''; }
			if (flexGrowInput) { flexGrowInput.value = props.flexGrow || ''; }
			if (gapInput) { gapInput.value = props.gap || ''; }
			if (customCssTextarea) { customCssTextarea.value = selected.customCss || ''; }
		}
	}

	function applyContainerFlexStyles(props, node, body) {
		body.style.display = '';
		body.style.flexDirection = '';
		body.style.gap = '';
		node.style.flexGrow = '';

		if (props.flexDirection) {
			body.style.display = 'flex';
			body.style.flexDirection = props.flexDirection;
		}
		if (props.flexGrow !== undefined && props.flexGrow !== '') {
			node.style.flexGrow = props.flexGrow;
		}
		if (props.gap) {
			body.style.gap = props.gap;
		}
	}

	function updateContainerStyle(id, customCss) {
		var styleId = 'wpb-style-' + id;
		var styleEl = document.getElementById(styleId);
		var selector = '[data-wp-builder-id="' + id + '"]';
		var scoped = customCss ? customCss.replace(/\bself\b/g, selector) : '';

		if (!scoped) {
			if (styleEl) { styleEl.parentNode.removeChild(styleEl); }
			return;
		}
		if (!styleEl) {
			styleEl = document.createElement('style');
			styleEl.id = styleId;
			document.head.appendChild(styleEl);
		}
		styleEl.textContent = scoped;
	}

	function cleanupAllContainerStyles() {
		var styles = document.head.querySelectorAll('style[id^="wpb-style-"]');
		var i;
		for (i = 0; i < styles.length; i += 1) {
			document.head.removeChild(styles[i]);
		}
	}

	function syncAllContainerStyles(elements) {
		elements.forEach(function (element) {
			if (element.type === 'container') {
				updateContainerStyle(element.id, element.customCss || '');
				syncAllContainerStyles(element.children || []);
			}
		});
	}

	function updateSelectedContainerProp(prop, value) {
		if (!state.selectedId) { return; }
		var element = findElement(state.layout.elements, state.selectedId);
		if (!element || element.type !== 'container') { return; }
		element.props = element.props || {};
		element.props[prop] = value;
		markDirty();
		var node = canvas.querySelector('[data-wp-builder-id="' + state.selectedId + '"]');
		if (node) {
			var body = node.querySelector('.wp-builder-node-body');
			if (body) { applyContainerFlexStyles(element.props, node, body); }
		}
	}

	function updateSelectedContainerCss(css) {
		if (!state.selectedId) { return; }
		var element = findElement(state.layout.elements, state.selectedId);
		if (!element || element.type !== 'container') { return; }
		element.customCss = css;
		markDirty();
		updateContainerStyle(state.selectedId, css);
	}

	function updateHtmlPreview(id, content) {
		var node = canvas.querySelector('[data-wp-builder-id="' + id + '"]');
		if (!node) {
			return;
		}
		var preview = node.querySelector('.wp-builder-node-html-preview');
		if (!preview) {
			return;
		}
		if (content) {
			preview.innerHTML = content;
		} else {
			preview.innerHTML = '';
			preview.appendChild(renderEmpty(text.emptyHtml || 'Empty HTML element'));
		}
	}

	function saveLayout() {
		var form;
		if (state.saving) {
			return;
		}

		state.saving = true;
		saveButton.disabled = true;
		updateStatus(text.saving || 'Saving...');

		form = new window.FormData();
		form.append('action', 'wp_builder_save_layout');
		form.append('nonce', config.nonce || '');
		form.append('post_id', config.postId || '');
		form.append('layout', JSON.stringify(state.layout));
		if (postStatusSelect) {
			form.append('post_status', postStatusSelect.value);
		}
		if (titleInput) {
			form.append('title', titleInput.textContent.trim() || config.postTitle || '');
		}
		if (pageTemplateSelect) {
			form.append('page_template', state.pageTemplate || 'default');
		}

		window.fetch(config.ajaxUrl, {
			method: 'POST',
			credentials: 'same-origin',
			body: form
		}).then(function (response) {
			return response.json();
		}).then(function (payload) {
			if (!payload || !payload.success) {
				throw new Error(payload && payload.data && payload.data.message ? payload.data.message : 'Save failed');
			}
			state.layout = normalizeLayout(payload.data.layout);
			state.dirty = false;
			if (payload.data.postStatus) {
				config.postStatus = payload.data.postStatus;
				if (postStatusSelect) { postStatusSelect.value = config.postStatus; }
			}
			if (payload.data.postTitle) {
				config.postTitle = payload.data.postTitle;
				if (titleInput) { titleInput.textContent = payload.data.postTitle; }
			}
			if (payload.data.docTitle) {
				document.title = payload.data.docTitle;
			}
			if (payload.data.previewUrl && viewLink) {
				viewLink.href = payload.data.previewUrl;
			}
			if (payload.data.pageTemplate !== undefined && pageTemplateSelect) {
				state.pageTemplate = payload.data.pageTemplate;
				pageTemplateSelect.value = payload.data.pageTemplate;
			}
			updateStatus(text.saved || 'Saved');
			render();
		}).catch(function (error) {
			updateStatus(error.message || 'Save failed');
		}).finally(function () {
			state.saving = false;
			saveButton.disabled = false;
		});
	}

	// Left-panel element buttons
	addButtons.forEach(function (button) {
		button.addEventListener('click', function () {
			addElementToSelection(button.dataset.wpBuilderAdd || 'container');
		});
	});

	// Inspector add buttons
	if (addNestedButton) {
		addNestedButton.addEventListener('click', function () {
			addElementToSelection('container');
		});
	}

	function updateRootHtmlPreview(content) {
		var rootEl = canvas.querySelector('.wp-builder-canvas-root');
		if (!rootEl) { return; }
		var body = rootEl.querySelector('.wp-builder-canvas-root-body');
		if (!body) { return; }
		var preview = body.querySelector('.wp-builder-node-html-preview');
		if (content) {
			if (!preview) {
				preview = document.createElement('div');
				preview.className = 'wp-builder-node-html-preview';
				body.insertBefore(preview, body.firstChild);
			}
			preview.innerHTML = content;
			var empty = body.querySelector('.wp-builder-empty-state');
			if (empty) { body.removeChild(empty); }
		} else {
			if (preview) { body.removeChild(preview); }
			if (!state.layout.elements.length && !body.querySelector('.wp-builder-empty-state')) {
				body.appendChild(renderEmpty(text.emptyCanvas || 'Empty canvas'));
			}
		}
	}

	// Content editor
	if (htmlTextarea) {
		htmlTextarea.addEventListener('input', function () {
			if (state.selectedId) {
				var element = findElement(state.layout.elements, state.selectedId);
				if (element && element.type === 'container') {
					element.content = htmlTextarea.value;
					markDirty();
					updateHtmlPreview(state.selectedId, htmlTextarea.value);
				}
			} else {
				state.layout.content = htmlTextarea.value;
				markDirty();
				updateRootHtmlPreview(htmlTextarea.value);
			}
		});
	}

	// Container inspector inputs
	if (flexDirectionSelect) {
		flexDirectionSelect.addEventListener('change', function () {
			updateSelectedContainerProp('flexDirection', flexDirectionSelect.value);
		});
	}

	if (flexGrowInput) {
		flexGrowInput.addEventListener('input', function () {
			updateSelectedContainerProp('flexGrow', flexGrowInput.value);
		});
	}

	if (gapInput) {
		gapInput.addEventListener('input', function () {
			updateSelectedContainerProp('gap', gapInput.value);
		});
	}

	if (customCssTextarea) {
		customCssTextarea.addEventListener('input', function () {
			updateSelectedContainerCss(customCssTextarea.value);
		});
	}

	if (nodeSelect) {
		nodeSelect.addEventListener('change', function () {
			if (state.selectedId) {
				var element = findElement(state.layout.elements, state.selectedId);
				if (element && element.type === 'container') {
					element.node = nodeSelect.value;
					markDirty();
					render();
				}
			} else {
				state.layout.node = nodeSelect.value;
				markDirty();
				renderCanvas();
			}
		});
	}

	saveButton.addEventListener('click', function () { saveLayout(); });

	if (pageTemplateSelect) {
		pageTemplateSelect.addEventListener('change', function () {
			state.pageTemplate = pageTemplateSelect.value;
			markDirty();
		});
	}

	// Title rename — click to open prompt
	if (titleInput) {
		titleInput.addEventListener('click', function () {
			var current = titleInput.textContent.trim() || config.postTitle || '';
			var newTitle = window.prompt(text.renameTitle || 'Post title', current);
			if (newTitle !== null && newTitle.trim()) {
				titleInput.textContent = newTitle.trim();
				markDirty();
			}
		});
	}

	window.addEventListener('beforeunload', function (event) {
		if (!state.dirty) {
			return;
		}
		event.preventDefault();
		event.returnValue = '';
	});

	// Accordion — toggle open/close; only one open at a time
	var accordions = document.querySelectorAll('.wp-builder-accordion');
	accordions.forEach(function (accordion) {
		var header = accordion.querySelector('.wp-builder-accordion-header');
		if (!header) { return; }
		header.addEventListener('click', function () {
			var isOpen = accordion.classList.contains('is-open');
			accordions.forEach(function (a) {
				a.classList.remove('is-open');
				var h = a.querySelector('.wp-builder-accordion-header');
				if (h) { h.setAttribute('aria-expanded', 'false'); }
			});
			if (!isOpen) {
				accordion.classList.add('is-open');
				header.setAttribute('aria-expanded', 'true');
			}
		});
	});

	render();
}());
