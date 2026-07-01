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
	'audio', 'video', 'source', 'iframe'
];

export const ICON_ADD     = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z"></path></svg>';
export const ICON_REMOVE  = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59 7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12l-4.88 4.88a.996.996 0 1 0 1.41 1.41L12 13.41l4.88 4.88a.996.996 0 1 0 1.41-1.41L13.41 12l4.88-4.88a.996.996 0 0 0-.01-1.41z"></path></svg>';
export const ICON_FIT     = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 5h18v2H3V5zm0 12h18v2H3v-2zM2 12l3-3v2h4v2H5v2l-3-3zm20 0-3 3v-2h-4v-2h4V9l3 3zM11 10h2v4h-2v-4z"></path></svg>';
export const ICON_ISOLATE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4zM9 9h6v6H9V9z"></path></svg>';
export const ICON_ELEMENT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 3h18v2H3V3zm0 16h18v2H3v-2zm0-8h18v2H3v-2z"></path></svg>';
export const ICON_POST    = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"></path></svg>';
// Layers / hierarchy icon used for the structure-view toggle button.
export const ICON_STRUCTURE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 6h18v2H3V6zm3 5h12v2H6v-2zm3 5h6v2H9v-2z"></path></svg>';