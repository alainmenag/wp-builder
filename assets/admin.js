(function () {
  /* ---- Utilities ---- */

  function createId(prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2, 10);
  }

  function parseLayout(raw) {
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function buildInput(label, value, onInput, type) {
    type = type || 'text';
    const wrap = document.createElement('label');
    wrap.className = 'wpb-field';
    const span = document.createElement('span');
    span.textContent = label;
    const input = (type === 'textarea')
      ? document.createElement('textarea')
      : document.createElement('input');
    if (type !== 'textarea') {
      input.type = type;
    }
    input.value = value || '';
    input.addEventListener('input', function () { onInput(input.value); });
    wrap.appendChild(span);
    wrap.appendChild(input);
    return wrap;
  }

  function buildSelect(label, options, current, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'wpb-field';
    const span = document.createElement('span');
    span.textContent = label;
    const sel = document.createElement('select');
    options.forEach(function (opt) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === current) {
        o.selected = true;
      }
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { onChange(sel.value); });
    wrap.appendChild(span);
    wrap.appendChild(sel);
    return wrap;
  }

  function buildStylePanel(styles, sync) {
    styles = styles || {};
    const grid = document.createElement('div');
    grid.className = 'wpb-style-grid';
    [
      { label: 'Background', key: 'backgroundColor', type: 'color' },
      { label: 'Text color', key: 'color', type: 'color' },
      { label: 'Padding', key: 'padding', type: 'text' },
      { label: 'Margin', key: 'margin', type: 'text' },
      { label: 'Border radius', key: 'borderRadius', type: 'text' },
      { label: 'Font size', key: 'fontSize', type: 'text' },
      { label: 'Text align', key: 'textAlign', type: 'text' },
      { label: 'Max width', key: 'maxWidth', type: 'text' },
    ].forEach(function (field) {
      grid.appendChild(
        buildInput(field.label, styles[field.key] || '', function (v) {
          styles[field.key] = v;
          sync();
        }, field.type)
      );
    });
    return grid;
  }

  /* ---- Column presets ---- */
  var COLUMN_PRESETS = [
    { label: '1 Column',         value: '100',         widths: ['100'] },
    { label: '2 Columns (50/50)',  value: '50-50',       widths: ['50', '50'] },
    { label: '2 Columns (33/67)',  value: '33-67',       widths: ['33', '67'] },
    { label: '2 Columns (67/33)',  value: '67-33',       widths: ['67', '33'] },
    { label: '3 Columns',         value: '33-33-34',    widths: ['33', '33', '34'] },
    { label: '4 Columns',         value: '25-25-25-25', widths: ['25', '25', '25', '25'] },
  ];

  function defaultSection(preset) {
    preset = preset || COLUMN_PRESETS[1];
    return {
      id: createId('section'),
      styles: { backgroundColor: '#ffffff', padding: '48px 24px' },
      columns: preset.widths.map(function (w) {
        return { id: createId('col'), width: w, styles: {}, elements: [] };
      })
    };
  }

  function defaultElement(type) {
    var el = { id: createId('el'), type: type, styles: {} };
    if (type === 'heading') {
      el.level = 'h2';
      el.content = 'Section Heading';
    } else if (type === 'image') {
      el.src = '';
      el.alt = '';
    } else if (type === 'video') {
      el.src = '';
    } else if (type === 'button') {
      el.content = 'Click me';
      el.href = '#';
    } else if (type === 'spacer') {
      el.styles = { margin: '32px 0' };
    } else {
      el.content = 'Your paragraph text here.';
    }
    return el;
  }

  /* ---- Render element card ---- */
  function renderElement(element, elIndex, colElements, update, sync) {
    var card = document.createElement('div');
    card.className = 'wpb-element-card';

    /* Header */
    var head = document.createElement('div');
    head.className = 'wpb-row-header wpb-element-head';

    var typeLabel = document.createElement('span');
    typeLabel.className = 'wpb-badge wpb-badge--' + (element.type || 'text');
    typeLabel.textContent = (element.type || 'text').toUpperCase();

    var moveUp = document.createElement('button');
    moveUp.type = 'button';
    moveUp.className = 'button wpb-btn-sm';
    moveUp.textContent = '↑';
    moveUp.title = 'Move up';
    moveUp.disabled = (elIndex === 0);
    moveUp.addEventListener('click', function () {
      colElements.splice(elIndex, 1);
      colElements.splice(elIndex - 1, 0, element);
      update();
    });

    var moveDown = document.createElement('button');
    moveDown.type = 'button';
    moveDown.className = 'button wpb-btn-sm';
    moveDown.textContent = '↓';
    moveDown.title = 'Move down';
    moveDown.disabled = (elIndex === colElements.length - 1);
    moveDown.addEventListener('click', function () {
      colElements.splice(elIndex, 1);
      colElements.splice(elIndex + 1, 0, element);
      update();
    });

    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button button-link-delete wpb-btn-sm';
    remove.textContent = 'Remove';
    remove.addEventListener('click', function () {
      colElements.splice(elIndex, 1);
      update();
    });

    head.appendChild(typeLabel);
    head.appendChild(moveUp);
    head.appendChild(moveDown);
    head.appendChild(remove);
    card.appendChild(head);

    /* Collapsible body */
    var body = document.createElement('div');
    body.className = 'wpb-element-body wpb-collapsed';

    head.addEventListener('click', function (e) {
      if (e.target === remove || e.target === moveUp || e.target === moveDown) {
        return;
      }
      body.classList.toggle('wpb-collapsed');
    });

    element.styles = element.styles || {};

    if (element.type === 'heading') {
      body.appendChild(
        buildSelect('Level',
          ['h1','h2','h3','h4','h5','h6'].map(function (v) { return { value: v, label: v.toUpperCase() }; }),
          element.level || 'h2',
          function (v) { element.level = v; sync(); }
        )
      );
      body.appendChild(
        buildInput('Content', element.content || '', function (v) { element.content = v; sync(); }, 'textarea')
      );
    } else if (element.type === 'image') {
      body.appendChild(buildInput('Image URL', element.src || '', function (v) { element.src = v; sync(); }));
      body.appendChild(buildInput('Alt text', element.alt || '', function (v) { element.alt = v; sync(); }));
    } else if (element.type === 'video') {
      body.appendChild(
        buildInput('Embed URL (YouTube/Vimeo embed)', element.src || '', function (v) { element.src = v; sync(); })
      );
    } else if (element.type === 'button') {
      body.appendChild(buildInput('Label', element.content || '', function (v) { element.content = v; sync(); }));
      body.appendChild(buildInput('Link URL', element.href || '#', function (v) { element.href = v; sync(); }));
    } else if (element.type === 'spacer') {
      /* intentionally no content fields */
    } else {
      body.appendChild(
        buildInput('Content', element.content || '', function (v) { element.content = v; sync(); }, 'textarea')
      );
    }

    /* Style sub-panel */
    var styleToggle = document.createElement('button');
    styleToggle.type = 'button';
    styleToggle.className = 'button wpb-style-toggle';
    styleToggle.textContent = '⚙ Styles';

    var stylePanel = document.createElement('div');
    stylePanel.className = 'wpb-style-panel wpb-collapsed';

    styleToggle.addEventListener('click', function () {
      stylePanel.classList.toggle('wpb-collapsed');
    });

    stylePanel.appendChild(buildStylePanel(element.styles, sync));
    body.appendChild(styleToggle);
    body.appendChild(stylePanel);

    card.appendChild(body);
    return card;
  }

  /* ---- Render column ---- */
  function renderColumn(column, colIndex, section, update, sync) {
    column.styles = column.styles || {};
    column.elements = Array.isArray(column.elements) ? column.elements : [];

    var col = document.createElement('div');
    col.className = 'wpb-column-card';
    col.style.flexBasis = (column.width || '50') + '%';

    /* Column header */
    var colHead = document.createElement('div');
    colHead.className = 'wpb-col-head';

    var colLabel = document.createElement('strong');
    colLabel.textContent = 'Column ' + (colIndex + 1);

    var widthWrap = document.createElement('label');
    widthWrap.className = 'wpb-width-wrap';
    var widthSpan = document.createElement('span');
    widthSpan.textContent = 'Width %';
    var widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.min = '10';
    widthInput.max = '100';
    widthInput.value = column.width || '50';
    widthInput.className = 'wpb-width-input';
    widthInput.addEventListener('input', function () {
      column.width = widthInput.value;
      col.style.flexBasis = widthInput.value + '%';
      sync();
    });
    widthWrap.appendChild(widthSpan);
    widthWrap.appendChild(widthInput);

    var removeColBtn = document.createElement('button');
    removeColBtn.type = 'button';
    removeColBtn.className = 'button button-link-delete wpb-btn-sm';
    removeColBtn.textContent = '✕';
    removeColBtn.title = 'Remove column';
    removeColBtn.addEventListener('click', function () {
      section.columns.splice(colIndex, 1);
      update();
    });

    colHead.appendChild(colLabel);
    colHead.appendChild(widthWrap);
    colHead.appendChild(removeColBtn);
    col.appendChild(colHead);

    /* Elements within column */
    var elementsWrap = document.createElement('div');
    elementsWrap.className = 'wpb-elements-wrap';
    column.elements.forEach(function (el, elIndex) {
      elementsWrap.appendChild(renderElement(el, elIndex, column.elements, update, sync));
    });
    col.appendChild(elementsWrap);

    /* Add element row */
    var addRow = document.createElement('div');
    addRow.className = 'wpb-add-el-row';
    var elSelect = document.createElement('select');
    ['text','heading','image','video','button','spacer'].forEach(function (t) {
      var o = document.createElement('option');
      o.value = t;
      o.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      elSelect.appendChild(o);
    });
    var addElBtn = document.createElement('button');
    addElBtn.type = 'button';
    addElBtn.className = 'button';
    addElBtn.textContent = '+ Element';
    addElBtn.addEventListener('click', function () {
      column.elements.push(defaultElement(elSelect.value));
      update();
    });
    addRow.appendChild(elSelect);
    addRow.appendChild(addElBtn);
    col.appendChild(addRow);

    return col;
  }

  /* ---- Render section ---- */
  function renderSection(section, sectionIndex, layout, update, sync) {
    section.styles = section.styles || {};

    /* Migrate old flat-element sections */
    if ((!Array.isArray(section.columns) || section.columns.length === 0) && Array.isArray(section.elements)) {
      section.columns = [{
        id: createId('col'),
        width: '100',
        styles: {},
        elements: section.elements
      }];
      delete section.elements;
    }
    if (!Array.isArray(section.columns)) {
      section.columns = [{ id: createId('col'), width: '100', styles: {}, elements: [] }];
    }

    var card = document.createElement('div');
    card.className = 'wpb-section-card';

    /* Section header */
    var head = document.createElement('div');
    head.className = 'wpb-row-header wpb-section-head';

    var title = document.createElement('strong');
    title.textContent = 'Section ' + (sectionIndex + 1);

    var moveUp = document.createElement('button');
    moveUp.type = 'button';
    moveUp.className = 'button wpb-btn-sm';
    moveUp.textContent = '↑';
    moveUp.disabled = (sectionIndex === 0);
    moveUp.addEventListener('click', function () {
      layout.splice(sectionIndex, 1);
      layout.splice(sectionIndex - 1, 0, section);
      update();
    });

    var moveDown = document.createElement('button');
    moveDown.type = 'button';
    moveDown.className = 'button wpb-btn-sm';
    moveDown.textContent = '↓';
    moveDown.disabled = (sectionIndex === layout.length - 1);
    moveDown.addEventListener('click', function () {
      layout.splice(sectionIndex, 1);
      layout.splice(sectionIndex + 1, 0, section);
      update();
    });

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'button button-link-delete wpb-btn-sm';
    removeBtn.textContent = '✕ Remove section';
    removeBtn.addEventListener('click', function () {
      layout.splice(sectionIndex, 1);
      update();
    });

    head.appendChild(title);
    head.appendChild(moveUp);
    head.appendChild(moveDown);
    head.appendChild(removeBtn);
    card.appendChild(head);

    /* Section styles toggle */
    var secStyleToggle = document.createElement('button');
    secStyleToggle.type = 'button';
    secStyleToggle.className = 'button wpb-style-toggle';
    secStyleToggle.textContent = '⚙ Section styles';

    var secStylePanel = document.createElement('div');
    secStylePanel.className = 'wpb-style-panel wpb-collapsed';
    secStyleToggle.addEventListener('click', function () {
      secStylePanel.classList.toggle('wpb-collapsed');
    });
    secStylePanel.appendChild(buildStylePanel(section.styles, sync));

    card.appendChild(secStyleToggle);
    card.appendChild(secStylePanel);

    /* Columns row */
    var colsRow = document.createElement('div');
    colsRow.className = 'wpb-columns-row';
    section.columns.forEach(function (col, ci) {
      colsRow.appendChild(renderColumn(col, ci, section, update, sync));
    });
    card.appendChild(colsRow);

    /* Add column */
    var addColBtn = document.createElement('button');
    addColBtn.type = 'button';
    addColBtn.className = 'button wpb-add-col-btn';
    addColBtn.textContent = '+ Add column';
    addColBtn.addEventListener('click', function () {
      section.columns.push({ id: createId('col'), width: '50', styles: {}, elements: [] });
      update();
    });
    card.appendChild(addColBtn);

    return card;
  }

  /* ---- Main render ---- */
  function renderBuilder(app, textarea, layout) {
    app.innerHTML = '';

    /* Top bar */
    var topBar = document.createElement('div');
    topBar.className = 'wpb-top-bar';

    var presetLabel = document.createElement('span');
    presetLabel.textContent = 'Column layout:';
    presetLabel.className = 'wpb-top-bar-label';

    var presetSel = document.createElement('select');
    presetSel.className = 'wpb-preset-select';
    COLUMN_PRESETS.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.value;
      o.textContent = p.label;
      presetSel.appendChild(o);
    });
    presetSel.value = '50-50'; /* default preset */

    var addSectionBtn = document.createElement('button');
    addSectionBtn.type = 'button';
    addSectionBtn.className = 'button button-primary';
    addSectionBtn.textContent = '+ Add section';
    addSectionBtn.addEventListener('click', function () {
      var preset = COLUMN_PRESETS.find(function (p) { return p.value === presetSel.value; }) || COLUMN_PRESETS[1];
      layout.push(defaultSection(preset));
      update();
    });

    topBar.appendChild(presetLabel);
    topBar.appendChild(presetSel);
    topBar.appendChild(addSectionBtn);
    app.appendChild(topBar);

    layout.forEach(function (section, si) {
      app.appendChild(renderSection(section, si, layout, update, sync));
    });

    function sync() {
      textarea.value = JSON.stringify(layout);
    }

    function update() {
      sync();
      renderBuilder(app, textarea, layout);
    }

    sync();
  }

  /* ---- Bootstrap ---- */
  document.addEventListener('DOMContentLoaded', function () {
    var app = document.getElementById('wp-builder-app');
    var textarea = document.getElementById('wp-builder-layout');
    if (!app || !textarea) {
      return;
    }

    var layout = parseLayout(textarea.value);

    if (!layout.length) {
      layout = [
        {
          id: createId('section'),
          styles: { backgroundColor: '#f8f8f8', padding: '64px 24px' },
          columns: [
            {
              id: createId('col'),
              width: '55',
              styles: { padding: '0 24px 0 0' },
              elements: [
                { id: createId('el'), type: 'heading', level: 'h1', content: 'Build beautiful pages with WP Builder', styles: {} },
                { id: createId('el'), type: 'text', content: 'Add sections, choose a column layout, then drop in headings, text, images, videos and buttons. Each element is independently styled.', styles: {} },
                { id: createId('el'), type: 'button', content: 'Get started', href: '#', styles: {} }
              ]
            },
            {
              id: createId('col'),
              width: '45',
              styles: {},
              elements: [
                { id: createId('el'), type: 'image', src: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800', alt: 'Web design', styles: { borderRadius: '12px' } }
              ]
            }
          ]
        }
      ];
    }

    renderBuilder(app, textarea, layout);
  });
})();
