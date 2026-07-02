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

export const ICON_DEFAULT   = icons.default   ?? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M0 0h24v24H0z" fill="none"/></svg>';

export const ICON_ADD       = icons.add       ?? ICON_DEFAULT;
export const ICON_REMOVE    = icons.remove    ?? ICON_DEFAULT;
export const ICON_FIT       = icons.fit       ?? ICON_DEFAULT;
export const ICON_ISOLATE   = icons.isolate   ?? ICON_DEFAULT;
export const ICON_ELEMENT   = icons.element   ?? ICON_DEFAULT;
export const ICON_POST      = icons.post      ?? ICON_DEFAULT;
export const ICON_STRUCTURE = icons.structure ?? ICON_DEFAULT;