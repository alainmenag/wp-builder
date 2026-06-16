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
	var canvas = document.getElementById('wp-builder-canvas');
	var saveButton = document.getElementById('wp-builder-save');
	var shortcodePanel = document.getElementById('wp-builder-shortcode-panel');
	var addNestedButton = document.getElementById('wp-builder-add-nested');
	var selectionName = document.getElementById('wp-builder-selection-name');
	var saveStatus = document.getElementById('wp-builder-save-status');
	var addButtons = document.querySelectorAll('[data-wp-builder-add]');
	var htmlTextarea = document.getElementById('wp-builder-html-content');
	var inspectorEditor = document.getElementById('wp-builder-inspector-editor');
	var flexDirectionSelect = document.getElementById('wp-builder-flex-direction');
	var flexGrowInput = document.getElementById('wp-builder-flex-grow');
	var gapInput = document.getElementById('wp-builder-gap');
	var customStyleTextarea = document.getElementById('wp-builder-custom-css');
	var cssEditor = null; // CodeMirror instance, set up below if wp.codeEditor is available.
	var cssEditorSuppressChange = false; // True while setValue is being called programmatically.
	var nodeSelect = document.getElementById('wp-builder-node');
	var nodeSelectGroup = document.getElementById('wp-builder-inspector-node');
	var idInput = document.getElementById('wp-builder-node-id');
	var idInputGroup = document.getElementById('wp-builder-inspector-id');
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

		// children[0] is the root element.
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

			// Migrate legacy html elements.
			if (element.type === 'html') {
				clean.push({
					id: element.id || createId(),
					node: 'div',
					props: { flexDirection: '', flexGrow: '', gap: '' },
					style: '',
					content: typeof element.content === 'string' ? element.content : '',
					attrs: {},
					children: []
				});
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
		var element, root;
		if (!id) {
			root = state.layout.children[0] || {};
			return (root.node || 'div').toUpperCase() + ' \u00b7 ' + (root.id || '');
		}
		element = findElement(state.layout.children[0].children || [], id);
		return element ? (element.node || 'div').toUpperCase() + ' \u00b7 ' + id : id;
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
			state.layout.children[0].children = state.layout.children[0].children || [];
			state.layout.children[0].children.push(element);
			return true;
		}
		parent = findElement(state.layout.children[0].children || [], parentId);
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
		state.selectedId = id || null;
		render();
		focusElementIdentity();
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
		if (deleteElement(state.layout.children[0].children || [], state.selectedId)) {
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
		canvas.innerHTML = '';
		var root = renderNode(state.layout.children[0], 0, true);
		canvas.appendChild(root);
		cleanupAllContainerStyles();
		syncAllContainerStyles(state.layout.children[0].children || []);
		updateContainerStyle(state.layout.children[0].id, state.layout.children[0].style || '');
	}

	function renderElement(element, depth) {
		return renderNode(element, depth, false);
	}

	function renderNode(element, depth, isRoot) {
		var node = document.createElement(isRoot ? 'div' : 'section');
		var bar = document.createElement('div');
		var title = document.createElement('button');
		var addButton = document.createElement('button');
		var body = document.createElement('div');
		var children = element.children || [];
		var isVoid = !isRoot && VOID_NODES[element.node];

		if (isRoot) {
			node.className = 'wp-builder-canvas-root' + (!state.selectedId ? ' is-selected' : '');
			node.tabIndex = 0;
			node.setAttribute('role', 'button');
			node.setAttribute('aria-label', text.canvas || 'Canvas');
		} else {
			node.className = 'wp-builder-node wp-builder-node-container' + (state.selectedId === element.id ? ' is-selected' : '');
			node.style.setProperty('--wp-builder-depth', depth);
		}
		node.dataset.wpBuilderId = element.id;

		bar.className = 'wp-builder-node-bar';

		title.type = 'button';
		title.className = 'wp-builder-node-title';
		title.textContent = (element.node || 'div').toUpperCase() + ' \u00b7 ' + element.id;
		title.addEventListener('click', function (event) {
			event.stopPropagation();
			selectElement(isRoot ? null : element.id);
		});

		addButton.type = 'button';
		addButton.className = 'wp-builder-node-action';
		addButton.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z"></path></svg>';
		addButton.setAttribute('aria-label', text.addContainer || 'Add container');
		addButton.addEventListener('click', function (event) {
			event.stopPropagation();
			state.selectedId = isRoot ? null : element.id;
			addContainerToSelection();
		});

		bar.appendChild(title);

		if (!isRoot) {
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

		body.className = isRoot ? 'wp-builder-canvas-root-body' : 'wp-builder-node-body';
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
				body.appendChild(renderEmpty(isRoot ? (text.emptyCanvas || 'Empty canvas') : (text.emptyContainer || 'Empty container')));
			} else {
				children.forEach(function (child) {
					body.appendChild(renderElement(child, isRoot ? 0 : depth + 1));
				});
			}
		}

		if (!isVoid) {
			bar.appendChild(addButton);
		}
		if (!isRoot) {
			bar.appendChild(removeButton);
		}
		node.appendChild(bar);
		node.appendChild(body);

		node.addEventListener('click', function (event) {
			if (isRoot) {
				if (event.target === node || event.target === body) {
					selectElement(null);
				}
			} else {
				event.stopPropagation();
				selectElement(element.id);
			}
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
		var root = state.layout.children[0] || {};
		var selected = state.selectedId ? findElement(root.children || [], state.selectedId) : null;
		var isContainer = !!(selected && selected.node);
		var isRoot = !state.selectedId;
		var showCommon = isRoot || isContainer;
		var isVoid = isContainer && VOID_NODES[selected.node];

		if (selectionName) {
			selectionName.textContent = getElementName(state.selectedId);
		}

		if (addNestedButton) {
			addNestedButton.hidden = !isContainer || isVoid;
		}

		if (nodeSelectGroup) {
			nodeSelectGroup.hidden = !showCommon;
		}

		if (idInputGroup) {
			idInputGroup.hidden = !showCommon;
		}

		if (idInput) {
			idInput.value = isContainer ? (selected.id || '') : (isRoot ? (root.id || '') : '');
		}

		if (nodeSelect) {
			if (isContainer) {
				nodeSelect.value = selected.node || 'div';
			} else if (isRoot) {
				nodeSelect.value = root.node || 'div';
			}
		}

		if (inspectorEditor) {
			inspectorEditor.hidden = !showCommon || isVoid;
		}

		if (showCommon && !isVoid && htmlTextarea) {
			htmlTextarea.value = isContainer ? (selected.content || '') : (root.content || '');
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
			if (customStyleTextarea) {
				var cssVal = selected.style || '';
				customStyleTextarea.value = cssVal;
				if (cssEditor) {
					cssEditorSuppressChange = true;
					cssEditor.codemirror.setValue(cssVal);
					cssEditorSuppressChange = false;
				}
			}
			renderNodeAttrsPanel(selected);
		} else if (isRoot) {
			var rootProps = root.props || {};
			if (flexDirectionSelect) { flexDirectionSelect.value = rootProps.flexDirection || ''; }
			if (flexGrowInput) { flexGrowInput.value = rootProps.flexGrow || ''; }
			if (gapInput) { gapInput.value = rootProps.gap || ''; }
			if (customStyleTextarea) {
				var rootCssVal = root.style || '';
				customStyleTextarea.value = rootCssVal;
				if (cssEditor) {
					cssEditorSuppressChange = true;
					cssEditor.codemirror.setValue(rootCssVal);
					cssEditorSuppressChange = false;
				}
			}
			renderNodeAttrsPanel({ node: root.node, attrs: root.attrs || {} });
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
		if (!state.selectedId) {
			state.layout.children[0].props = state.layout.children[0].props || {};
			state.layout.children[0].props[prop] = value;
			markDirty();
			var rootNode = canvas.querySelector('.wp-builder-canvas-root');
			if (rootNode) {
				var rootBody = rootNode.querySelector('.wp-builder-canvas-root-body');
				if (rootBody) { applyContainerFlexStyles(state.layout.children[0].props, rootNode, rootBody); }
			}
			return;
		}
		var element = findElement(state.layout.children[0].children || [], state.selectedId);
		if (!element) { return; }
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
		if (!state.selectedId) {
			state.layout.children[0].style = css;
			markDirty();
			updateContainerStyle(state.layout.children[0].id, css);
			return;
		}
		var element = findElement(state.layout.children[0].children || [], state.selectedId);
		if (!element) { return; }
		element.style = css;
		markDirty();
		updateContainerStyle(state.selectedId, css);
	}

	function updateSelectedNodeAttr(name, value) {
		if (!state.selectedId) {
			state.layout.children[0].attrs = state.layout.children[0].attrs || {};
			state.layout.children[0].attrs[name] = value;
			markDirty();
			return;
		}
		var element = findElement(state.layout.children[0].children || [], state.selectedId);
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

		if (state.selectedId) {
			var element = findElement(state.layout.children[0].children || [], state.selectedId);
			if (!element) { return; }
			if (element.id === sanitized) {
				if (idInput) { idInput.value = sanitized; }
				return;
			}
			element.id = sanitized;
			state.selectedId = sanitized;
		} else {
			if (state.layout.children[0].id === sanitized) {
				if (idInput) { idInput.value = sanitized; }
				return;
			}
			state.layout.children[0].id = sanitized;
		}

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

	function updateRootHtmlPreview(content) {
		var rootEl = canvas.querySelector('.wp-builder-canvas-root');
		if (!rootEl) { return; }
		var body = rootEl.querySelector('.wp-builder-canvas-root-body');
		if (!body) { return; }
		var preview = null;
		for (var i = 0; i < body.children.length; i++) {
			if (body.children[i].classList.contains('wp-builder-node-html-preview')) {
				preview = body.children[i];
				break;
			}
		}
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
			if (!state.layout.children[0].children.length && !body.querySelector('.wp-builder-empty-state')) {
				body.appendChild(renderEmpty(text.emptyCanvas || 'Empty canvas'));
			}
		}
	}

	// Content editor
	if (htmlTextarea) {
		htmlTextarea.addEventListener('input', function () {
			if (state.selectedId) {
				var element = findElement(state.layout.children[0].children || [], state.selectedId);
				if (element && element.node) {
					element.content = htmlTextarea.value;
					markDirty();
					updateHtmlPreview(state.selectedId, htmlTextarea.value);
				}
			} else {
				state.layout.children[0].content = htmlTextarea.value;
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

	if (customStyleTextarea) {
		if (window.wp && window.wp.codeEditor) {
			cssEditor = window.wp.codeEditor.initialize(customStyleTextarea, {
				codemirror: {
					mode: 'css',
					autoCloseBrackets: true,
					matchBrackets: true
				}
			});
			cssEditor.codemirror.on('change', function (cm) {
				if (cssEditorSuppressChange) { return; }
				updateSelectedContainerCss(cm.getValue());
			});
		} else {
			customStyleTextarea.addEventListener('input', function () {
				updateSelectedContainerCss(customStyleTextarea.value);
			});
		}
	}

	if (nodeSelect) {
		nodeSelect.addEventListener('change', function () {
			if (state.selectedId) {
				var element = findElement(state.layout.children[0].children || [], state.selectedId);
				if (element && element.node) {
					element.node = nodeSelect.value;
					element.attrs = normalizeNodeAttrs(nodeSelect.value, element.attrs);
					markDirty();
					render();
				}
			} else {
				state.layout.children[0].node = nodeSelect.value;
				state.layout.children[0].attrs = normalizeNodeAttrs(nodeSelect.value, state.layout.children[0].attrs);
				markDirty();
				renderCanvas();
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
				if (cssEditor && accordion.id === 'wp-builder-accordion-style') {
					cssEditor.codemirror.refresh();
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

	render();
	focusElementIdentity();
}());
