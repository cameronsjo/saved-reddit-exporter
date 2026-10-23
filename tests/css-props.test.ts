/**
 * Guards against camelCase keys in setCssProps().
 *
 * Obsidian's setCssProps passes each key to style.setProperty, which only
 * accepts CSS property names (kebab-case or --custom-property). A camelCase
 * key such as `justifyContent` is silently dropped. Use kebab-case keys, or
 * setCssStyles for camelCase.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../src');

function listTsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** Return the argument text of every `.setCssProps(...)` call (balanced parens). */
function extractSetCssPropsArgs(source: string): string[] {
  const args: string[] = [];
  const needle = '.setCssProps(';
  let from = 0;
  for (;;) {
    const start = source.indexOf(needle, from);
    if (start === -1) return args;
    let depth = 1;
    let i = start + needle.length;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
      i++;
    }
    args.push(source.slice(start + needle.length, i - 1));
    from = i;
  }
}

/** Object-literal keys in the text: `key:` or `'key':` at the start of an entry. */
function findCamelCaseKeys(argText: string): string[] {
  const keys: string[] = [];
  const keyPattern = /(?:^|[{,])\s*['"]?([A-Za-z_-][\w-]*)['"]?\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = keyPattern.exec(argText)) !== null) {
    if (/[a-z][A-Z]/.test(m[1])) keys.push(m[1]);
  }
  return keys;
}

describe('setCssProps keys', () => {
  it('detects camelCase keys (self-check)', () => {
    expect(findCamelCaseKeys("{ display: 'flex', justifyContent: 'flex-end' }")).toEqual([
      'justifyContent',
    ]);
    expect(findCamelCaseKeys("{ 'margin-top': '20px', '--my-var': '1' }")).toEqual([]);
  });

  it('uses no camelCase keys in src', () => {
    const offenders: string[] = [];
    for (const file of listTsFiles(SRC_DIR)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const argText of extractSetCssPropsArgs(source)) {
        for (const key of findCamelCaseKeys(argText)) {
          offenders.push(`${path.relative(SRC_DIR, file)}: ${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
