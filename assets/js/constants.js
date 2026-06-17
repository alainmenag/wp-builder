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

export const ICON_ADD    = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z"></path></svg>';
export const ICON_REMOVE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59 7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12l-4.88 4.88a.996.996 0 1 0 1.41 1.41L12 13.41l4.88 4.88a.996.996 0 1 0 1.41-1.41L13.41 12l4.88-4.88a.996.996 0 0 0-.01-1.41z"></path></svg>';
