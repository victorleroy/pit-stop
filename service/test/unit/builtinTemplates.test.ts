import {BUILTIN_TEMPLATES, DEFAULT_TEMPLATE_ID} from '~/Template/builtinTemplates';

/** Templates spec R26: the catalogue obeys the rules a team template is validated against. */
describe('built-in templates', () => {
  it('holds the thirteen classics, Pit Stop and Blank included', () => {
    const ids = BUILTIN_TEMPLATES.map(({id}) => id);

    expect(ids).toHaveLength(13);
    expect(ids).toEqual(expect.arrayContaining(['builtin:pit-stop', 'builtin:blank']));
    expect(ids).toContain(DEFAULT_TEMPLATE_ID);
  });

  it('gives every template a unique builtin: id', () => {
    const ids = BUILTIN_TEMPLATES.map(({id}) => id);

    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^builtin:[a-z0-9-]+$/));
  });

  it('keeps names within 60 characters and descriptions within 200', () => {
    for (const {description, name} of BUILTIN_TEMPLATES) {
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(60);
      expect(description.length).toBeLessThanOrEqual(200);
    }
  });

  it('keeps between 0 and 8 columns, with short unique titles and prompts', () => {
    for (const {columns} of BUILTIN_TEMPLATES) {
      expect(columns.length).toBeLessThanOrEqual(8);

      const keys = columns.map(({title}) => title.trim().toLowerCase());

      expect(new Set(keys).size).toBe(keys.length);

      for (const {prompt, title} of columns) {
        expect(title.length).toBeGreaterThan(0);
        expect(title.length).toBeLessThanOrEqual(40);
        expect(prompt.length).toBeLessThanOrEqual(140);
      }
    }
  });

  it('leaves Blank without any column', () => {
    expect(BUILTIN_TEMPLATES.find(({id}) => id === 'builtin:blank')?.columns).toEqual([]);
  });
});
