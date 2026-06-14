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
	var customCssTextarea = document.getElementById('wp-builder-custom-css');
	var cssEditor = null; // CodeMirror instance, set up below if wp.codeEditor is available.
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
		var allowed = { div: true, section: true, article: true, main: true, aside: true, header: true, footer: true, nav: true, p: true, span: true, h1: true, h2: true, h3: true, h4: true, h5: true, h6: true, img: true, a: true, button: true, input: true, label: true, figure: true, figcaption: true, video: true, audio: true, source: true, iframe: true };
		return (typeof tag === 'string' && allowed[tag]) ? tag : 'div';
	}

	function normalizeLayout(layout) {
		if (!layout || !Array.isArray(layout.elements)) {
			return { version: 1, id: createId('root-'), node: 'div', props: normalizeContainerProps({}), customCss: '', content: '', attrs: {}, elements: [] };
		}
		var node = normalizeNodeTag(layout.node);
		return {
			version: 1,
			id: (layout.id && layout.id !== 'wp-builder-root') ? layout.id : createId('root-'),
			node: node,
			props: normalizeContainerProps(layout.props),
			customCss: typeof layout.customCss === 'string' ? layout.customCss : '',
			content: typeof layout.content === 'string' ? layout.content : '',
			attrs: normalizeNodeAttrs(node, layout.attrs),
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
			if (!element || typeof element.type !== 'string') {
				return clean;
			}

			if (element.type === 'container') {
				var node = normalizeNodeTag(element.node);
				clean.push({
					id: element.id || createId('container-'),
					type: 'container',
					node: node,
					props: normalizeContainerProps(element.props),
					customCss: typeof element.customCss === 'string' ? element.customCss : '',
					content: typeof element.content === 'string' ? element.content : '',
					attrs: normalizeNodeAttrs(node, element.attrs),
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
					attrs: {},
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
		return { id: createId('container-'), type: 'container', node: 'div', props: { flexDirection: '', flexGrow: '', gap: '' }, customCss: '', content: '', attrs: {}, children: [] };
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
		root.dataset.wpBuilderId = state.layout.id;

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
		applyContainerFlexStyles(state.layout.props || {}, root, body);

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
		updateContainerStyle(state.layout.id, state.layout.customCss || '');
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

		if (VOID_NODES[element.node]) {
			body.appendChild(renderEmpty((element.node || 'void') + ' \u00b7 ' + (text.voidElement || 'void element')));
		} else {
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

		if (nodeSelect) {
			if (isContainer) {
				nodeSelect.value = selected.node || 'div';
			} else if (isRoot) {
				nodeSelect.value = state.layout.node || 'div';
			}
		}

		if (inspectorEditor) {
			inspectorEditor.hidden = !showCommon || isVoid;
		}

		if (showCommon && !isVoid && htmlTextarea) {
			htmlTextarea.value = isContainer ? (selected.content || '') : (state.layout.content || '');
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
			if (customCssTextarea) {
				var cssVal = selected.customCss || '';
				customCssTextarea.value = cssVal;
				if (cssEditor) { cssEditor.codemirror.setValue(cssVal); }
			}
			renderNodeAttrsPanel(selected);
		} else if (isRoot) {
			var rootProps = state.layout.props || {};
			if (flexDirectionSelect) { flexDirectionSelect.value = rootProps.flexDirection || ''; }
			if (flexGrowInput) { flexGrowInput.value = rootProps.flexGrow || ''; }
			if (gapInput) { gapInput.value = rootProps.gap || ''; }
			if (customCssTextarea) {
				var rootCssVal = state.layout.customCss || '';
				customCssTextarea.value = rootCssVal;
				if (cssEditor) { cssEditor.codemirror.setValue(rootCssVal); }
			}
			renderNodeAttrsPanel({ node: state.layout.node, attrs: state.layout.attrs || {} });
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
		if (!state.selectedId) {
			state.layout.props = state.layout.props || {};
			state.layout.props[prop] = value;
			markDirty();
			var rootNode = canvas.querySelector('.wp-builder-canvas-root');
			if (rootNode) {
				var rootBody = rootNode.querySelector('.wp-builder-canvas-root-body');
				if (rootBody) { applyContainerFlexStyles(state.layout.props, rootNode, rootBody); }
			}
			return;
		}
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
		if (!state.selectedId) {
			state.layout.customCss = css;
			markDirty();
			updateContainerStyle(state.layout.id, css);
			return;
		}
		var element = findElement(state.layout.elements, state.selectedId);
		if (!element || element.type !== 'container') { return; }
		element.customCss = css;
		markDirty();
		updateContainerStyle(state.selectedId, css);
	}

	function updateSelectedNodeAttr(name, value) {
		if (!state.selectedId) {
			state.layout.attrs = state.layout.attrs || {};
			state.layout.attrs[name] = value;
			markDirty();
			return;
		}
		var element = findElement(state.layout.elements, state.selectedId);
		if (!element || element.type !== 'container') { return; }
		element.attrs = element.attrs || {};
		element.attrs[name] = value;
		markDirty();
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
		if (window.wp && window.wp.codeEditor) {
			cssEditor = window.wp.codeEditor.initialize(customCssTextarea, {
				codemirror: {
					mode: 'css',
					autoCloseBrackets: true,
					matchBrackets: true
				}
			});
			cssEditor.codemirror.on('change', function (cm) {
				updateSelectedContainerCss(cm.getValue());
			});
		} else {
			customCssTextarea.addEventListener('input', function () {
				updateSelectedContainerCss(customCssTextarea.value);
			});
		}
	}

	if (nodeSelect) {
		nodeSelect.addEventListener('change', function () {
			if (state.selectedId) {
				var element = findElement(state.layout.elements, state.selectedId);
				if (element && element.type === 'container') {
					element.node = nodeSelect.value;
					element.attrs = normalizeNodeAttrs(nodeSelect.value, element.attrs);
					markDirty();
					render();
				}
			} else {
				state.layout.node = nodeSelect.value;
				state.layout.attrs = normalizeNodeAttrs(nodeSelect.value, state.layout.attrs);
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
