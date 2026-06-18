/**
 * Editor constants — node glossary, void-node set, and icon SVG strings.
 */

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

export const ICON_ADD    = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z"></path></svg>';
export const ICON_REMOVE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59 7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12l-4.88 4.88a.996.996 0 1 0 1.41 1.41L12 13.41l4.88 4.88a.996.996 0 1 0 1.41-1.41L13.41 12l4.88-4.88a.996.996 0 0 0-.01-1.41z"></path></svg>';
export const ICON_OPEN	 = '<svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 496 440.9"><path d="M471.4,51.6H118.6C114.2,19,84.2-3.9,51.6.5,22,4.5,0,29.8,0,59.6v321.7c0,32.9,26.7,59.5,59.6,59.6h411.8c13.6,0,24.5-11,24.6-24.6V76.2c0-13.6-11-24.6-24.6-24.6h0ZM16,59.6c-.7-24.1,18.2-44.2,42.3-44.9,24.1-.7,44.2,18.2,44.9,42.3,0,.9,0,1.8,0,2.6v281.3c-22.2-24.1-59.7-25.6-83.8-3.4-1.2,1.1-2.3,2.2-3.4,3.4V59.6ZM480,416.3c0,4.7-3.8,8.6-8.6,8.6H59.6c-24.1,0-43.6-19.5-43.6-43.6,0-24.1,19.5-43.6,43.6-43.6,24.1,0,43.6,19.5,43.6,43.6s0,0,0,0c0,4.4,3.6,8,8,8s8-3.6,8-8V67.6h352.3c4.7,0,8.5,3.9,8.5,8.6v340.2Z"/></svg>';
