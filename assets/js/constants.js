/**
 * Editor constants — node glossary, void-node set, and icon SVG strings.
 */

export const EDITOR_CPT = 'builder';
export const TEMPLATE_CPT = 'wp_builder_template';

export const NODE_GLOSSARY = {
	img: [
		{ name: 'src',    label: 'Source URL', type: 'url',    required: true },
		{ name: 'alt',    label: 'Alt text',   type: 'text' },
		{ name: 'width',  label: 'Width',      type: 'number' },
		{ name: 'height', label: 'Height',     type: 'number' }
	],
	a: [
		{ name: 'href',   label: 'URL',    type: 'url',    required: true },
		{ name: 'target', label: 'Target', type: 'select', options: [ '', '_blank', '_self' ] },
		{ name: 'rel',    label: 'Rel',    type: 'text' }
	],
	input: [
		{ name: 'type',        label: 'Type',        type: 'select', options: [ 'text', 'email', 'number', 'password', 'checkbox', 'radio' ] },
		{ name: 'name',        label: 'Name',        type: 'text' },
		{ name: 'placeholder', label: 'Placeholder', type: 'text' }
	],
	button: [
		{ name: 'type', label: 'Type', type: 'select', options: [ 'button', 'submit', 'reset' ] }
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

export const VOID_NODES = { img: true, input: true, br: true, hr: true, source: true };

export const ALLOWED_NODES = [
	'div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav',
	'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'a', 'button', 'figure', 'figcaption', 'img', 'input', 'label',
	'audio', 'video', 'source', 'iframe',
	'script', 'style', 'code', 'pre', 'blockquote'
];

const { icons = {} } = window.wpBuilderEditor || {};

export const ICON_ADD       = icons.add       ?? '';
export const ICON_REMOVE    = icons.remove    ?? '';
export const ICON_FIT       = icons.fit       ?? '';
export const ICON_ISOLATE   = icons.isolate   ?? '';
export const ICON_ELEMENT   = icons.element   ?? '';
export const ICON_POST      = icons.post      ?? '';
export const ICON_STRUCTURE = icons.structure ?? '';