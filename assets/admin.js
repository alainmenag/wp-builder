(function () {
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

  function buildInput(label, value, onInput, type = 'text') {
    const wrap = document.createElement('label');
    wrap.className = 'wp-builder-field';
    const span = document.createElement('span');
    span.textContent = label;
    const input = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    if (type !== 'textarea') {
      input.type = type;
    }
    input.value = value || '';
    input.addEventListener('input', function () {
      onInput(input.value);
    });
    wrap.appendChild(span);
    wrap.appendChild(input);
    return wrap;
  }

  function renderBuilder(app, textarea, layout) {
    app.innerHTML = '';

    const controls = document.createElement('div');
    controls.className = 'wp-builder-controls';
    const addSection = document.createElement('button');
    addSection.type = 'button';
    addSection.className = 'button button-primary';
    addSection.textContent = 'Add section';
    addSection.addEventListener('click', function () {
      layout.push({
        id: createId('section'),
        styles: { backgroundColor: '#ffffff', padding: '48px 24px', borderRadius: '12px' },
        elements: [
          { type: 'heading', level: 'h2', content: 'Your section heading', styles: { textAlign: 'center' } },
          { type: 'text', content: 'Add a paragraph to describe this section.', styles: {} }
        ]
      });
      update();
    });
    controls.appendChild(addSection);
    app.appendChild(controls);

    layout.forEach(function (section, sectionIndex) {
      const sectionCard = document.createElement('div');
      sectionCard.className = 'wp-builder-section-card';

      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'wp-builder-section-header';
      const title = document.createElement('strong');
      title.textContent = 'Section ' + (sectionIndex + 1);
      const removeSection = document.createElement('button');
      removeSection.type = 'button';
      removeSection.className = 'button button-link-delete';
      removeSection.textContent = 'Remove';
      removeSection.addEventListener('click', function () {
        layout.splice(sectionIndex, 1);
        update();
      });
      sectionHeader.appendChild(title);
      sectionHeader.appendChild(removeSection);
      sectionCard.appendChild(sectionHeader);

      section.styles = section.styles || {};
      section.elements = Array.isArray(section.elements) ? section.elements : [];

      const sectionStyles = document.createElement('div');
      sectionStyles.className = 'wp-builder-style-grid';
      sectionStyles.appendChild(buildInput('Background', section.styles.backgroundColor || '', function (value) {
        section.styles.backgroundColor = value;
        sync();
      }, 'color'));
      sectionStyles.appendChild(buildInput('Padding', section.styles.padding || '', function (value) {
        section.styles.padding = value;
        sync();
      }));
      sectionStyles.appendChild(buildInput('Border radius', section.styles.borderRadius || '', function (value) {
        section.styles.borderRadius = value;
        sync();
      }));
      sectionCard.appendChild(sectionStyles);

      const addElementWrap = document.createElement('div');
      addElementWrap.className = 'wp-builder-element-actions';
      const elementType = document.createElement('select');
      ['text', 'heading', 'image', 'video'].forEach(function (type) {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        elementType.appendChild(option);
      });
      const addElement = document.createElement('button');
      addElement.type = 'button';
      addElement.className = 'button';
      addElement.textContent = 'Add element';
      addElement.addEventListener('click', function () {
        const type = elementType.value;
        const element = { type: type, styles: {} };
        if (type === 'heading') {
          element.level = 'h2';
          element.content = 'Heading text';
        } else if (type === 'image') {
          element.src = 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200';
          element.alt = 'Image description';
        } else if (type === 'video') {
          element.src = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
        } else {
          element.content = 'Paragraph text';
        }
        section.elements.push(element);
        update();
      });
      addElementWrap.appendChild(elementType);
      addElementWrap.appendChild(addElement);
      sectionCard.appendChild(addElementWrap);

      section.elements.forEach(function (element, elementIndex) {
        const card = document.createElement('div');
        card.className = 'wp-builder-element-card';
        const head = document.createElement('div');
        head.className = 'wp-builder-section-header';
        const type = document.createElement('span');
        type.textContent = (element.type || 'text').toUpperCase();
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'button button-link-delete';
        remove.textContent = 'Remove';
        remove.addEventListener('click', function () {
          section.elements.splice(elementIndex, 1);
          update();
        });
        head.appendChild(type);
        head.appendChild(remove);
        card.appendChild(head);

        if (element.type === 'heading') {
          const levelField = document.createElement('label');
          levelField.className = 'wp-builder-field';
          const levelLabel = document.createElement('span');
          levelLabel.textContent = 'Heading level';
          const levelSelect = document.createElement('select');
          ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(function (value) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value.toUpperCase();
            if ((element.level || 'h2') === value) option.selected = true;
            levelSelect.appendChild(option);
          });
          levelSelect.addEventListener('change', function () {
            element.level = levelSelect.value;
            sync();
          });
          levelField.appendChild(levelLabel);
          levelField.appendChild(levelSelect);
          card.appendChild(levelField);
        }

        if (element.type === 'image') {
          card.appendChild(buildInput('Image URL', element.src || '', function (value) {
            element.src = value;
            sync();
          }));
          card.appendChild(buildInput('Alt text', element.alt || '', function (value) {
            element.alt = value;
            sync();
          }));
        } else if (element.type === 'video') {
          card.appendChild(buildInput('Embed URL', element.src || '', function (value) {
            element.src = value;
            sync();
          }));
        } else {
          card.appendChild(buildInput('Content', element.content || '', function (value) {
            element.content = value;
            sync();
          }, 'textarea'));
        }

        const styleGrid = document.createElement('div');
        styleGrid.className = 'wp-builder-style-grid';
        element.styles = element.styles || {};
        styleGrid.appendChild(buildInput('Text color', element.styles.color || '', function (value) {
          element.styles.color = value;
          sync();
        }, 'color'));
        styleGrid.appendChild(buildInput('Text align', element.styles.textAlign || '', function (value) {
          element.styles.textAlign = value;
          sync();
        }));
        styleGrid.appendChild(buildInput('Font size', element.styles.fontSize || '', function (value) {
          element.styles.fontSize = value;
          sync();
        }));
        styleGrid.appendChild(buildInput('Margin', element.styles.margin || '', function (value) {
          element.styles.margin = value;
          sync();
        }));
        styleGrid.appendChild(buildInput('Max width', element.styles.maxWidth || '', function (value) {
          element.styles.maxWidth = value;
          sync();
        }));
        card.appendChild(styleGrid);

        sectionCard.appendChild(card);
      });

      app.appendChild(sectionCard);
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

  document.addEventListener('DOMContentLoaded', function () {
    const app = document.getElementById('wp-builder-app');
    const textarea = document.getElementById('wp-builder-layout');
    if (!app || !textarea) {
      return;
    }

    const layout = parseLayout(textarea.value);
    if (!layout.length) {
      layout.push({
        id: createId('section'),
        styles: { backgroundColor: '#ffffff', padding: '48px 24px', borderRadius: '12px' },
        elements: [
          { type: 'heading', level: 'h2', content: 'Build modern pages with WP Builder', styles: { textAlign: 'center' } },
          { type: 'text', content: 'Add sections, images and videos with responsive styling.', styles: { textAlign: 'center' } }
        ]
      });
    }

    renderBuilder(app, textarea, layout);
  });
})();
