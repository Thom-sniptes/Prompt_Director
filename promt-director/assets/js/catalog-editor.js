/*
 * PromtDirector model catalog editor – WordPress admin UI.
 * Values in the model catalog are configuration data, never executable code.
 * The editor has no network calls, no persistent client storage, and does not
 * interpolate imported values into HTML. WordPress validates the saved JSON.
 */
(() => {
  'use strict';

  const CATALOG_FIELDS = Object.freeze({
    capabilities: 'Fähigkeiten',
    ui_schema: 'Einstellungsfelder',
    workflows: 'Workflows',
    option_rules: 'Abhängigkeiten',
    reference_support: 'Referenzhinweise'
  });

  const DISPLAY_NAMES = Object.freeze({
    min_images: 'Mindestens native Bilder',
    max_images: 'Höchstens native Bilder',
    min_videos: 'Mindestens Videos',
    requires_first_last: 'Start- und Endframe erforderlich',
    native_image_kinds: 'Native Referenztypen',
    forced_options: 'Erzwungene Optionen',
    prompt_rules: 'Prompt-Regeln',
    max_reference_images: 'Maximale native Bildreferenzen',
    max_reference_guidance: 'Maximale beschriebene Referenzen',
    default: 'Standardwert',
    options: 'Auswahlmöglichkeiten',
    show_for_modes: 'Nur in diesen Workflows',
    advanced: 'Erweitert',
    help: 'Hilfetext',
    key: 'ID',
    label: 'Anzeigename',
    type: 'Feldtyp',
    min: 'Minimum',
    max: 'Maximum',
    note: 'Hinweis'
  });

  // Settings are JSON-only. Exclude reserved object keys in editable data.
  const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const FIELD_TYPES = ['select', 'number', 'text', 'checkbox'];
  const MAX_DEPTH = 24;

  function element(tag, text, cssClass) {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = String(text);
    if (cssClass) result.className = cssClass;
    return result;
  }

  function button(label, callback) {
    const result = element('button', label);
    result.type = 'button';
    result.addEventListener('click', callback);
    return result;
  }

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function displayLabel(key) {
    return DISPLAY_NAMES[key] || key;
  }

  function defaultEntry(section, entries) {
    if (section === 'ui_schema') {
      return { key: 'new_field', label: 'Neues Feld', type: 'text', default: '' };
    }
    if (section === 'option_rules') return { when: {}, set: {} };
    if (entries.length && isRecord(entries[0])) {
      return JSON.parse(JSON.stringify(entries[0]));
    }
    return '';
  }

  function defaultProperty(key) {
    if (key === 'workflows') {
      return {
        label: '', prompt_rules: '', min_images: 0, max_images: 0,
        min_videos: 0, requires_first_last: false,
        native_image_kinds: ['image'], forced_options: {}
      };
    }
    return '';
  }

  function createEditorNode(value, key, onChange, depth = 0, removable = false) {
    const wrapper = element('fieldset');
    wrapper.style.border = '1px solid #ccd0d4';
    wrapper.style.padding = '10px';
    wrapper.style.margin = '8px 0';
    wrapper.append(element('legend', displayLabel(key)));

    if (removable) {
      wrapper.append(button('Entfernen', () => {
        wrapper.remove();
        onChange();
      }));
    }

    if (depth > MAX_DEPTH) {
      wrapper.append(element('p', 'Maximale Verschachtelung erreicht. Experten-JSON verwenden.'));
      return { wrapper, read: () => value };
    }

    if (Array.isArray(value) || isRecord(value)) {
      const isArray = Array.isArray(value);
      const children = element('div');
      wrapper.append(children);

      function addChild(childKey, childValue) {
        const entry = createEditorNode(childValue, childKey, onChange, depth + 1, true);
        entry.wrapper.dataset.catalogKey = childKey;
        entry.wrapper.__catalogRead = entry.read;
        children.append(entry.wrapper);
      }

      if (isArray) {
        value.forEach((item, i) => addChild(String(i), item));
      } else {
        Object.entries(value).forEach(([childKey, childValue]) => {
          if (!RESERVED_KEYS.has(childKey)) addChild(childKey, childValue);
        });
      }

      wrapper.append(button(isArray ? 'Eintrag hinzufügen' : 'Eigenschaft hinzufügen', async () => {
        if (isArray) {
          addChild(String(children.children.length), defaultEntry(key, value));
          onChange();
          return;
        }
        const ask = window.PDIRDialog && window.PDIRDialog.prompt;
        if (typeof ask !== 'function') return;
        const proposed = await ask('ID der Eigenschaft (z. B. i2v, native_audio oder mode)');
        if (typeof proposed !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(proposed)) return;
        if (RESERVED_KEYS.has(proposed)) return;
        if (Array.from(children.children).some(child => child.dataset.catalogKey === proposed)) return;
        let nextValue = defaultProperty(key);
        if (key === 'workflows') nextValue.label = proposed;
        else {
          const type = await ask('Datentyp: text, number, boolean, object, array', 'text');
          const initial = { text: '', number: 0, boolean: false, object: {}, array: [] };
          if (!Object.hasOwn(initial, type)) return;
          nextValue = initial[type];
        }
        addChild(proposed, nextValue);
        onChange();
      }));

      return {
        wrapper,
        read() {
          const items = Array.from(children.children);
          if (isArray) return items.map(child => child.__catalogRead());
          const result = Object.create(null);
          for (const child of items) {
            const childKey = child.dataset.catalogKey;
            if (childKey && !RESERVED_KEYS.has(childKey)) {
              result[childKey] = child.__catalogRead();
            }
          }
          return result;
        }
      };
    }

    let control;
    let read;
    if (typeof value === 'boolean') {
      control = document.createElement('input');
      control.type = 'checkbox';
      control.checked = value;
      read = () => control.checked;
    } else if (typeof value === 'number') {
      control = document.createElement('input');
      control.type = 'number';
      control.value = String(value);
      read = () => Number.isFinite(control.valueAsNumber) ? control.valueAsNumber : 0;
    } else if (key === 'type') {
      control = document.createElement('select');
      for (const type of FIELD_TYPES) {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        control.append(option);
      }
      control.value = String(value ?? '');
      read = () => control.value;
    } else {
      control = document.createElement('textarea');
      control.rows = key === 'prompt_rules' ? 4 : 2;
      control.style.width = '100%';
      control.value = String(value ?? '');
      read = () => control.value;
    }
    control.addEventListener('input', onChange);
    control.addEventListener('change', onChange);
    wrapper.append(control);
    return { wrapper, read };
  }

  function init() {
    const sections = new Map();
    for (const [key, title] of Object.entries(CATALOG_FIELDS)) {
      const raw = document.getElementById('catalog_' + key);
      if (!raw) continue;
      let parsed;
      try {
        parsed = JSON.parse(raw.value);
      } catch (_error) {
        continue; // Keep invalid expert JSON available for manual correction.
      }

      const details = element('details');
      details.append(element('summary', 'Experten-JSON bearbeiten'));
      const host = element('div');
      raw.parentNode.insertBefore(host, raw);
      raw.parentNode.insertBefore(details, raw);
      details.append(raw);
      let editor;
      let mode = 'visual';

      function syncToRaw() {
        if (mode !== 'visual' || !editor) return;
        raw.value = JSON.stringify(editor.read(), null, 2);
      }

      function rebuildFromRaw() {
        let updated;
        try {
          updated = JSON.parse(raw.value);
        } catch (_error) {
          // Do not overwrite invalid manual JSON; WordPress validation reports it.
          return;
        }
        editor = createEditorNode(updated, key, syncToRaw);
        host.replaceChildren(editor.wrapper);
      }

      editor = createEditorNode(parsed, key, syncToRaw);
      host.append(editor.wrapper);

      // Edits in expert JSON are the source of truth until the editor is closed.
      details.addEventListener('toggle', () => {
        if (details.open) {
          syncToRaw();
          mode = 'raw';
        } else {
          rebuildFromRaw();
          mode = 'visual';
        }
      });

      const tableRow = raw.closest('tr');
      const tableLabel = tableRow && tableRow.querySelector('th');
      if (tableLabel) tableLabel.textContent = title;
      sections.set(key, { raw, syncToRaw, currentMode: () => mode });
    }

    const form = document.getElementById('catalog_capabilities')?.closest('form');
    if (!form) return;
    form.addEventListener('submit', () => {
      for (const section of sections.values()) section.syncToRaw();
      const workflows = sections.get('workflows');
      const schema = sections.get('ui_schema');
      if (!workflows || !schema) return;
      try {
        const workflowData = JSON.parse(workflows.raw.value);
        const fields = JSON.parse(schema.raw.value);
        if (!isRecord(workflowData) || !Array.isArray(fields)) return;
        const modeField = fields.find(field => isRecord(field) && field.key === 'mode');
        if (!modeField) return;
        const options = Object.create(null);
        for (const [id, settings] of Object.entries(workflowData)) {
          if (!RESERVED_KEYS.has(id) && isRecord(settings)) {
            options[id] = String(settings.label || id);
          }
        }
        modeField.options = options;
        if (!Object.hasOwn(options, String(modeField.default))) {
          modeField.default = Object.keys(options)[0] || '';
        }
        schema.raw.value = JSON.stringify(fields, null, 2);
      } catch (_error) {
        // Invalid expert JSON is left untouched for server-side validation.
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
