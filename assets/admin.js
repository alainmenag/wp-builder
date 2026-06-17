(function () {
	'use strict';

	var NODE_GLOSSARY = {
		img: [
			{ name: 'src',    label: 'Source URL', type: 'url',    required: true },
			{ name: 'alt',    label: 'Alt text',   type: 'text' },
			{ name: 'width',  label: 'Width',      type: 'number' },
			{ name: 'height', label: 'Height',     type: 'number' }
		],
		a: [
			{ name: 'href',   label: 'URL',    type: 'url',    required: true },
			{ name: 'target', label: 'Target', type: 'select', options: ['', '_blank', '_self'] },
			{ name: 'rel',    label: 'Rel',    type: 'text' }
		],
		input: [
			{ name: 'type',        label: 'Type',        type: 'select', options: ['text', 'email', 'number', 'password', 'checkbox', 'radio'] },
			{ name: 'name',        label: 'Name',        type: 'text' },
			{ name: 'placeholder', label: 'Placeholder', type: 'text' }
		],
		button: [
			{ name: 'type', label: 'Type', type: 'select', options: ['button', 'submit', 'reset'] }
		],
		video: [
			{ name: 'src',      label: 'Source URL', type: 'url' },
			{ name: 'width',    label: 'Width',      type: 'number' },
			{ name: 'height',   label: 'Height',     type: 'number' },
			{ name: 'controls', label: 'Controls',   type: 'text', placeholder: 'controls' },
			{ name: 'autoplay', label: 'Autoplay',   type: 'text', placeholder: 'autoplay' }
		],
		audio: [
			{ name: 'src',      label: 'Source URL', type: 'url' },
			{ name: 'controls', label: 'Controls',   type: 'text', placeholder: 'controls' }
		],
		iframe: [
			{ name: 'src',    label: 'Source URL', type: 'url',    required: true },
			{ name: 'width',  label: 'Width',      type: 'number' },
			{ name: 'height', label: 'Height',     type: 'number' },
			{ name: 'title',  label: 'Title',      type: 'text' }
		],
		source: [
			{ name: 'src',  label: 'Source URL', type: 'url',  required: true },
			{ name: 'type', label: 'MIME type',  type: 'text' }
		]
	};

	var VOID_NODES = { img: true, input: true, br: true, hr: true, source: true };

	var config = window.wpBuilder || {};
	var text = config.i18n || {};
	var stage = document.getElementById('wp-builder-stage');
	var saveButton = document.getElementById('wp-builder-save');
	var embedPanel = document.getElementById('wp-builder-embed-panel');
	var addNestedButton = document.getElementById('wp-builder-add-nested');
	var selectionName = document.getElementById('wp-builder-selection-name');
	var saveStatus = document.getElementById('wp-builder-save-status');
	var addButtons = document.querySelectorAll('[data-wp-builder-add]');
	var htmlTextarea = document.getElementById('wp-builder-html-content');
	var inspectorEditor = document.getElementById('wp-builder-inspector-editor');
	var flexDirectionSelect = document.getElementById('wp-builder-flex-direction');
	var flexGrowInput = document.getElementById('wp-builder-flex-grow');
	var gapInput = document.getElementById('wp-builder-gap');
	var customStyleTextarea = document.getElementById('wp-builder-custom-style');
	var styleEditor = null; // CodeMirror instance, set up below if wp.codeEditor is available.
	var styleEditorSuppressChange = false; // True while setValue is being called programmatically.
	var nodeSelect = document.getElementById('wp-builder-node');
	var nodeSelectGroup = document.getElementById('wp-builder-inspector-node');
	var idInput = document.getElementById('wp-builder-node-id');
	var idInputGroup = document.getElementById('wp-builder-inspector-id');
	var postStatusSelect = document.getElementById('wp-builder-post-status');
	var postStatusBadge = document.getElementById('wp-builder-post-status-badge');
	var postTitleInput = document.getElementById('wp-builder-post-title');
	var titleInput = document.getElementById('wp-builder-title');
	var viewLink = document.getElementById('wp-builder-view-link');
	var pageTemplateSelect = document.getElementById('wp-builder-chrome-template');

	if (!stage || !saveButton) {
		return;
	}

	var initialLayout = normalizeLayout(config.layout);
	var state = {
		layout: initialLayout,
		selectedId: initialLayout.children[0].id,
		dirty: false,
		saving: false,
		pageTemplate: config.pageTemplate || 'default'
	};

	function normalizeNodeTag(tag) {
		var allowed = { div: true, section: true, article: true, main: true, aside: true, header: true, footer: true, nav: true, p: true, span: true, h1: true, h2: true, h3: true, h4: true, h5: true, h6: true, img: true, a: true, button: true, input: true, label: true, figure: true, figcaption: true, video: true, audio: true, source: true, iframe: true };
		return (typeof tag === 'string' && allowed[tag]) ? tag : 'div';
	}

	function normalizeLayout(layout) {
		var now = Date.now();
		var rootData, rootNode, rootEl;

		// No layout at all → fresh v2 envelope.
		if (!layout || typeof layout !== 'object') {
			return { version: 2, createdAt: now, updatedAt: now, children: [createContainer()] };
		}

		// children[0] is the first (top-level) element.
		rootData = Array.isArray(layout.children) && layout.children[0] ? layout.children[0] : null;
		if (!rootData) {
			return { version: 2, createdAt: layout.createdAt || now, updatedAt: now, children: [createContainer()] };
		}
		rootNode = normalizeNodeTag(rootData.node);
		rootEl = {
			id: rootData.id ? rootData.id : createId(),
			node: rootNode,
			props: normalizeContainerProps(rootData.props),
			style: typeof rootData.style === 'string' ? rootData.style : null,
			content: typeof rootData.content === 'string' ? rootData.content : '',
			attrs: normalizeNodeAttrs(rootNode, rootData.attrs),
			children: Array.isArray(rootData.children) ? normalizeElements(rootData.children) : []
		};
		return { version: 2, createdAt: layout.createdAt || now, updatedAt: now, children: [rootEl] };
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

	function normalizeNodeAttrs(node, attrs) {
		var descriptors = NODE_GLOSSARY[node] || [];
		var raw = (attrs && typeof attrs === 'object') ? attrs : {};
		var clean = {};
		descriptors.forEach(function (desc) {
			clean[desc.name] = (typeof raw[desc.name] === 'string') ? raw[desc.name] : '';
		});
		return clean;
	}

	function normalizeElements(elements) {
		return elements.reduce(function (clean, element) {
			if (!element || typeof element !== 'object') {
				return clean;
			}

			if (typeof element.node !== 'string') {
				return clean;
			}

			var node = normalizeNodeTag(element.node);
			clean.push({
				id: element.id || createId(),
				node: node,
				props: normalizeContainerProps(element.props),
				style: typeof element.style === 'string' ? element.style : null,
				content: typeof element.content === 'string' ? element.content : '',
				attrs: normalizeNodeAttrs(node, element.attrs),
				children: Array.isArray(element.children) ? normalizeElements(element.children) : []
			});

			return clean;
		}, []);
	}

	function createId() {
		return 'wpb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
	}

	function createContainer() {
		return { id: createId(), node: 'div', props: { flexDirection: '', flexGrow: '', gap: '' }, style: '', content: '', attrs: {}, children: [] };
	}

	function getElementName(id) {
		var element = findElement(state.layout.children, id);
		return element ? (element.node || 'div').toUpperCase() + ' \u00b7 ' + (element.id || id) : (id || '');
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
		var parent = findElement(state.layout.children, parentId);
		if (!parent) {
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
		if (saveButton) {
			saveButton.classList.add('is-dirty');
		}
		updateStatus(text.unsaved || 'Unsaved changes');
	}

	function updateStatus(message) {
		if (saveStatus) {
			saveStatus.textContent = message || '';
		}
	}

	function updateStatusBadge(status) {
		if (postStatusBadge) {
			var labels = {
				'publish':  (config.i18n && config.i18n.statusPublished)    || 'Published',
				'draft':    (config.i18n && config.i18n.statusDraft)         || 'Draft',
				'pending':  (config.i18n && config.i18n.statusPending)       || 'Pending Review',
				'private':  (config.i18n && config.i18n.statusPrivate)       || 'Private'
			};
			postStatusBadge.textContent = (status && labels[status]) ? labels[status] : (status || '');
		}
	}

	function focusElementIdentity() {
		var elementTabBtn = document.getElementById('wp-builder-tab-btn-element');
		var pageTabBtn = document.getElementById('wp-builder-tab-btn-page');
		var elementTabPanel = document.getElementById('wp-builder-tab-element');
		var pageTabPanel = document.getElementById('wp-builder-tab-page');
		var identityAccordion = document.getElementById('wp-builder-accordion-identity');

		if (pageTabBtn) {
			pageTabBtn.classList.remove('is-active');
			pageTabBtn.setAttribute('aria-selected', 'false');
		}
		if (elementTabBtn) {
			elementTabBtn.classList.add('is-active');
			elementTabBtn.setAttribute('aria-selected', 'true');
		}
		if (pageTabPanel) {
			pageTabPanel.hidden = true;
		}
		if (elementTabPanel) {
			elementTabPanel.hidden = false;
		}
	}

	function selectElement(id) {
		state.selectedId = id || state.layout.children[0].id;
		render();
		focusElementIdentity();
	}

	function addElementToSelection(type) {
		var element = createContainer();
		if (!addElement(state.selectedId, element)) {
			addElement(state.layout.children[0].id, element);
		}
		state.selectedId = element.id;
		markDirty();
		render();
	}

	function addContainerToSelection() {
		addElementToSelection('container');
	}

	function deleteSelection() {
		if (!state.selectedId || state.selectedId === state.layout.children[0].id) {
			return;
		}
		if (deleteElement(state.layout.children[0].children || [], state.selectedId)) {
			state.selectedId = state.layout.children[0].id;
			markDirty();
			render();
		}
	}

	function render() {
		renderCanvas();
		renderInspector();
	}

	function renderCanvas() {
		stage.innerHTML = '';
		var firstChild = renderNode(state.layout.children[0], 0, false);
		stage.appendChild(firstChild);
		cleanupAllContainerStyles();
		syncAllContainerStyles(state.layout.children);
	}

	function renderElement(element, depth) {
		return renderNode(element, depth, true);
	}

	function renderNode(element, depth, isDeletable) {
		var node = document.createElement('section');
		var bar = document.createElement('div');
		var title = document.createElement('button');
		var addButton = document.createElement('button');
		var body = document.createElement('div');
		var children = element.children || [];
		var isVoid = VOID_NODES[element.node];

		node.className = 'wp-builder-node wp-builder-node-container' + (state.selectedId === element.id ? ' is-selected' : '');
		node.style.setProperty('--wp-builder-depth', depth);
		node.dataset.wpBuilderId = element.id;

		bar.className = 'wp-builder-node-bar';

		title.type = 'button';
		title.className = 'wp-builder-node-title';
		title.textContent = (element.node || 'div').toUpperCase() + ' \u00b7 ' + element.id;
		title.addEventListener('click', function (event) {
			event.stopPropagation();
			selectElement(element.id);
		});

		addButton.type = 'button';
		addButton.className = 'wp-builder-node-action';
		addButton.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z"></path></svg>';
		addButton.setAttribute('aria-label', text.addContainer || 'Add container');
		addButton.addEventListener('click', function (event) {
			event.stopPropagation();
			state.selectedId = element.id;
			addContainerToSelection();
		});

		bar.appendChild(title);

		if (isDeletable) {
			var removeButton = document.createElement('button');
			removeButton.type = 'button';
			removeButton.className = 'wp-builder-node-action wp-builder-node-action-danger';
			removeButton.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59 7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12l-4.88 4.88a.996.996 0 1 0 1.41 1.41L12 13.41l4.88 4.88a.996.996 0 1 0 1.41-1.41L13.41 12l4.88-4.88a.996.996 0 0 0-.01-1.41z"></path></svg>';
			removeButton.setAttribute('aria-label', text.delete || 'Delete');
			removeButton.addEventListener('click', function (event) {
				event.stopPropagation();
				state.selectedId = element.id;
				deleteSelection();
			});
		}

		body.className = 'wp-builder-node-body';
		applyContainerFlexStyles(element.props || {}, node, body);

		if (isVoid) {
			body.appendChild(renderEmpty((element.node || 'void') + ' \u00b7 ' + (text.voidElement || 'void element')));
		} else {
			if (element.content) {
				var preview = document.createElement('div');
				preview.className = 'wp-builder-node-html-preview';
				preview.innerHTML = element.content;
				body.appendChild(preview);
			}

			if (!children.length && !element.content) {
				body.appendChild(renderEmpty(text.emptyContainer || 'Empty container'));
			} else {
				children.forEach(function (child) {
					body.appendChild(renderElement(child, depth + 1));
				});
			}
		}

		if (!isVoid) {
			bar.appendChild(addButton);
		}
		if (isDeletable) {
			bar.appendChild(removeButton);
		}
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
		var selected = findElement(state.layout.children, state.selectedId) || {};
		var isContainer = !!(selected && selected.node !== undefined);
		var isVoid = isContainer && VOID_NODES[selected.node];

		if (selectionName) {
			selectionName.textContent = getElementName(state.selectedId);
		}

		if (addNestedButton) {
			addNestedButton.hidden = !isContainer || isVoid;
		}

		if (nodeSelectGroup) {
			nodeSelectGroup.hidden = !isContainer;
		}

		if (idInputGroup) {
			idInputGroup.hidden = !isContainer;
		}

		if (idInput) {
			idInput.value = selected.id || '';
		}

		if (nodeSelect && isContainer) {
			nodeSelect.value = selected.node || 'div';
		}

		if (inspectorEditor) {
			inspectorEditor.hidden = !isContainer || isVoid;
		}

		if (isContainer && !isVoid && htmlTextarea) {
			htmlTextarea.value = selected.content || '';
		}

		if (embedPanel) {
			embedPanel.hidden = false;
		}

		if (postStatusSelect) {
			postStatusSelect.value = config.postStatus || 'draft';
			updateStatusBadge(postStatusSelect.value);
		}

		if (pageTemplateSelect) {
			pageTemplateSelect.value = state.pageTemplate || 'default';
		}

		if (isContainer) {
			var props = selected.props || {};
			if (flexDirectionSelect) { flexDirectionSelect.value = props.flexDirection || ''; }
			if (flexGrowInput) { flexGrowInput.value = props.flexGrow || ''; }
			if (gapInput) { gapInput.value = props.gap || ''; }
			if (customStyleTextarea) {
				var styleVal = selected.style || '';
				customStyleTextarea.value = styleVal;
				if (styleEditor) {
					styleEditorSuppressChange = true;
					styleEditor.codemirror.setValue(styleVal);
					styleEditorSuppressChange = false;
				}
			}
			renderNodeAttrsPanel(selected);
		} else {
			renderNodeAttrsPanel(null);
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

	function updateContainerStyle(id, customStyle) {
		var styleId = 'wpb-style-' + id;
		var styleEl = document.getElementById(styleId);
		var selector = '[data-wp-builder-id="' + id + '"]';
		var scoped = customStyle ? customStyle.replace(/\bself\b/g, selector) : '';

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
			updateContainerStyle(element.id, element.style || '');
			syncAllContainerStyles(element.children || []);
		});
	}

	function updateSelectedContainerProp(prop, value) {
		var element = findElement(state.layout.children, state.selectedId);
		if (!element) { return; }
		element.props = element.props || {};
		element.props[prop] = value;
		markDirty();
		var node = stage.querySelector('[data-wp-builder-id="' + state.selectedId + '"]');
		if (node) {
			var body = node.querySelector('.wp-builder-node-body');
			if (body) { applyContainerFlexStyles(element.props, node, body); }
		}
	}

	function updateSelectedContainerStyle(style) {
		var element = findElement(state.layout.children, state.selectedId);
		if (!element) { return; }
		element.style = style;
		markDirty();
		updateContainerStyle(state.selectedId, style);
	}

	function updateSelectedNodeAttr(name, value) {
		var element = findElement(state.layout.children, state.selectedId);
		if (!element) { return; }
		element.attrs = element.attrs || {};
		element.attrs[name] = value;
		markDirty();
	}

	function updateSelectedId(rawValue) {
		var sanitized = rawValue.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9_-]/g, '')
			.replace(/-+/g, '-')
			.replace(/^-+|-+$/g, '');

		if (!sanitized) {
			sanitized = createId();
		}

		var element = findElement(state.layout.children, state.selectedId);
		if (!element) { return; }
		if (element.id === sanitized) {
			if (idInput) { idInput.value = sanitized; }
			return;
		}
		element.id = sanitized;
		state.selectedId = sanitized;
		markDirty();
		render();
	}

	function renderNodeAttrsPanel(selected) {
		var panel = document.getElementById('wp-builder-inspector-node-attrs');
		if (!panel) { return; }
		panel.innerHTML = '';
		var descriptors = selected ? (NODE_GLOSSARY[selected.node] || []) : [];
		if (!descriptors.length) {
			panel.hidden = true;
			return;
		}
		panel.hidden = false;
		var attrs = selected.attrs || {};
		descriptors.forEach(function (desc) {
			var group = document.createElement('div');
			group.className = 'wp-builder-field-group';
			var labelEl = document.createElement('label');
			labelEl.className = 'wp-builder-inspector-label';
			var inputId = 'wp-builder-node-attr-' + desc.name;
			labelEl.htmlFor = inputId;
			labelEl.textContent = desc.label + (desc.required ? ' *' : '');
			group.appendChild(labelEl);
			var control;
			if (desc.type === 'select') {
				control = document.createElement('select');
				control.className = 'wp-builder-select';
				(desc.options || []).forEach(function (opt) {
					var option = document.createElement('option');
					option.value = opt;
					option.textContent = opt || '\u2014 None \u2014';
					control.appendChild(option);
				});
				control.value = attrs[desc.name] || '';
				control.addEventListener('change', (function (n) {
					return function () { updateSelectedNodeAttr(n, control.value); };
				}(desc.name)));
			} else {
				control = document.createElement('input');
				control.className = 'wp-builder-input';
				control.type = desc.type === 'number' ? 'number' : (desc.type === 'url' ? 'url' : 'text');
				control.value = attrs[desc.name] || '';
				if (desc.placeholder) { control.placeholder = desc.placeholder; }
				control.addEventListener('input', (function (n) {
					return function () { updateSelectedNodeAttr(n, control.value); };
				}(desc.name)));
			}
			control.id = inputId;
			group.appendChild(control);
			panel.appendChild(group);
		});
	}

	function updateHtmlPreview(id, content) {
		var node = stage.querySelector('[data-wp-builder-id="' + id + '"]');
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
			if (!findElement(state.layout.children, state.selectedId)) {
				state.selectedId = state.layout.children[0].id;
			}
			state.dirty = false;
			if (payload.data.postStatus) {
				config.postStatus = payload.data.postStatus;
				if (postStatusSelect) { postStatusSelect.value = config.postStatus; }
				updateStatusBadge(config.postStatus);
			}
			if (payload.data.postTitle) {
				config.postTitle = payload.data.postTitle;
				if (titleInput) { titleInput.textContent = payload.data.postTitle; }
				if (postTitleInput) { postTitleInput.value = payload.data.postTitle; }
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
			render();
			state.dirty = false;
			if (saveButton) {
				saveButton.classList.remove('is-dirty');
			}
			updateStatus(text.saved || 'Saved');
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

	// Content editor
	if (htmlTextarea) {
		htmlTextarea.addEventListener('input', function () {
			var element = findElement(state.layout.children, state.selectedId);
			if (element && element.node !== undefined) {
				element.content = htmlTextarea.value;
				markDirty();
				updateHtmlPreview(state.selectedId, htmlTextarea.value);
			}
		});
	}

	// Settings title input — keep in sync with the header title button
	if (postTitleInput) {
		postTitleInput.addEventListener('input', function () {
			var value = postTitleInput.value.trim();
			if (titleInput) { titleInput.textContent = value || config.postTitle || ''; }
			markDirty();
		});
	}

	// Settings status select — keep the header badge in sync
	if (postStatusSelect) {
		postStatusSelect.addEventListener('change', function () {
			updateStatusBadge(postStatusSelect.value);
		});
	}

	// Status badge — click to navigate to the status dropdown
	if (postStatusBadge) {
		postStatusBadge.addEventListener('click', function () {
			navigate('main', 'settings', 'wp-builder-post-status');
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

	if (customStyleTextarea) {
		if (window.wp && window.wp.codeEditor) {
			styleEditor = window.wp.codeEditor.initialize(customStyleTextarea, {
				codemirror: {
					mode: 'css',
					autoCloseBrackets: true,
					matchBrackets: true
				}
			});
			styleEditor.codemirror.on('change', function (cm) {
				if (styleEditorSuppressChange) { return; }
				updateSelectedContainerStyle(cm.getValue());
			});
		} else {
			customStyleTextarea.addEventListener('input', function () {
				updateSelectedContainerStyle(customStyleTextarea.value);
			});
		}
	}

	if (nodeSelect) {
		nodeSelect.addEventListener('change', function () {
			var element = findElement(state.layout.children, state.selectedId);
			if (element && element.node !== undefined) {
				element.node = nodeSelect.value;
				element.attrs = normalizeNodeAttrs(nodeSelect.value, element.attrs);
				markDirty();
				render();
			}
		});
	}

	if (idInput) {
		idInput.addEventListener('blur', function () {
			updateSelectedId(idInput.value);
		});
		idInput.addEventListener('keydown', function (event) {
			if (event.key === 'Enter') {
				event.preventDefault();
				idInput.blur();
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

	// Title button — click to navigate to the title field in the Settings panel
	if (titleInput) {
		titleInput.addEventListener('click', function () {
			navigate('main', 'settings', 'wp-builder-post-title');
		});
	}

	window.addEventListener('beforeunload', function (event) {
		if (!state.dirty) {
			return;
		}
		event.preventDefault();
		event.returnValue = '';
	});

	// Accordion — toggle open/close; only one open at a time within its tab panel
	var accordions = document.querySelectorAll('.wp-builder-accordion');
	accordions.forEach(function (accordion) {
		var header = accordion.querySelector('.wp-builder-accordion-header');
		if (!header) { return; }
		header.addEventListener('click', function () {
			var isOpen = accordion.classList.contains('is-open');
			// Scope to the nearest tab-panel ancestor so panels are independent
			var panel = accordion.parentNode;
			while (panel && !panel.classList.contains('wp-builder-tab-panel')) {
				panel = panel.parentNode;
			}
			var scope = panel ? panel.querySelectorAll('.wp-builder-accordion') : accordions;
			scope.forEach(function (a) {
				a.classList.remove('is-open');
				var h = a.querySelector('.wp-builder-accordion-header');
				if (h) { h.setAttribute('aria-expanded', 'false'); }
			});
			if (!isOpen) {
				accordion.classList.add('is-open');
				header.setAttribute('aria-expanded', 'true');
				if (styleEditor && accordion.id === 'wp-builder-accordion-style') {
					styleEditor.codemirror.refresh();
				}
			}
		});
	});

	// Tabs — switch between tab panels
	var tabBtns = document.querySelectorAll('.wp-builder-tab-btn');
	tabBtns.forEach(function (btn) {
		btn.addEventListener('click', function () {
			var targetId = btn.getAttribute('aria-controls');
			tabBtns.forEach(function (b) {
				b.classList.remove('is-active');
				b.setAttribute('aria-selected', 'false');
			});
			btn.classList.add('is-active');
			btn.setAttribute('aria-selected', 'true');
			document.querySelectorAll('.wp-builder-tab-panel').forEach(function (p) {
				p.hidden = p.id !== targetId;
			});
		});
	});

	// Panel navigation utility — navigate( tab, section, field )
	// tab:     'main'     | 'element'
	// section: 'settings' | 'shortcode' | 'data'                           (main tab)
	//          'identity' | 'content'   | 'layout' | 'style' | 'attrs'    (element tab)
	// field:   id of a form element inside the accordion to focus (optional)
	function navigate(tab, section, field) {
		var tabMap = { main: 'wp-builder-tab-page', element: 'wp-builder-tab-element' };
		var tabId = tabMap[tab];
		if (!tabId) { return; }

		// Activate the tab if it is not already active.
		var tabBtn = document.querySelector('[aria-controls="' + tabId + '"]');
		if (tabBtn && !tabBtn.classList.contains('is-active')) {
			tabBtn.click();
		}

		// Open the requested accordion if it is not already open.
		if (section) {
			var accordion = document.getElementById('wp-builder-accordion-' + section);
			if (accordion && !accordion.classList.contains('is-open')) {
				var header = accordion.querySelector('.wp-builder-accordion-header');
				if (header) { header.click(); }
			}
		}

		// Focus the requested field, if provided.
		if (field) {
			var fieldEl = document.getElementById(field);
			if (fieldEl) { fieldEl.focus(); }
		}
	}

	(window.wpBuilder || (window.wpBuilder = {})).navigate = navigate;

	render();
	focusElementIdentity();
}());
