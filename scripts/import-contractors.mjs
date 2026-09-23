import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Run from any directory: node scripts/import-contractors.mjs
// The CSV is the original HackAlem dataset; the two JSON files are generated.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const minDate = '2026-09-23';
const maxDate = '2026-12-31';
const expectedRows = 66;
const expectedSynthetic = 13;
const columns = [
  'id', 'anon_name', 'categories', 'city', 'city_imputed', 'synthetic',
  'price_from_kzt', 'price_imputed', 'event_formats', 'languages',
  'max_hours', 'busy_dates', 'description',
];

// RFC 4180 fields: quoted commas/newlines, escaped double quotes, CRLF/LF,
// UTF-8 BOM, and a final record with or without a newline are supported.
function parseCsv(source) {
  const text = source.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let state = 'plain';
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (state === 'quoted') {
      if (character === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          state = 'closed';
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === ',') {
      row.push(field);
      field = '';
      state = 'plain';
    } else if (character === '\r' || character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      state = 'plain';
      if (character === '\r' && text[i + 1] === '\n') i += 1;
    } else if (character === '"' && state === 'plain' && field === '') {
      state = 'quoted';
    } else {
      if (state === 'closed' || character === '"') {
        throw new Error(`Invalid CSV quoting near character ${i + 1}`);
      }
      field += character;
    }
  }
  if (state === 'quoted') throw new Error('Unclosed CSV quoted field');
  if (row.length || field !== '' || state === 'closed') rows.push([...row, field]);
  return rows;
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function parseBoolean(value, label) {
  requireValue(value === 'True' || value === 'False', `${label}: expected True/False`);
  return value === 'True';
}

function parseNumber(value, label) {
  requireValue(/^\d+(?:\.\d+)?$/.test(value), `${label}: expected a non-negative number`);
  const number = Number(value);
  requireValue(Number.isFinite(number), `${label}: number is not finite`);
  return number;
}

function parseList(value, label, allowEmpty = false) {
  if (value === '' && allowEmpty) return [];
  const items = value.split('|');
  requireValue(items.every((item) => item.trim() !== ''), `${label}: empty list item`);
  requireValue(new Set(items).size === items.length, `${label}: duplicate list item`);
  return items;
}

const source = await readFile(resolve(projectRoot, 'data/hackathon-contractors.csv'), 'utf8');
const [header, ...rows] = parseCsv(source);
requireValue(JSON.stringify(header) === JSON.stringify(columns), 'Unexpected CSV columns');
requireValue(rows.length === expectedRows, `Expected ${expectedRows} contractors, got ${rows.length}`);
const ids = new Set();

const contractors = rows.map((values, index) => {
  const context = `CSV record ${index + 2}`;
  requireValue(values.length === columns.length, `${context}: wrong number of columns`);
  const row = Object.fromEntries(columns.map((column, i) => [column, values[i]]));
  requireValue(/^HK-\d{5}$/.test(row.id), `${context}: invalid id`);
  requireValue(!ids.has(row.id), `${context}: duplicate id ${row.id}`);
  ids.add(row.id);
  for (const column of ['anon_name', 'city', 'description']) {
    requireValue(row[column].trim() !== '', `${row.id}: missing ${column}`);
  }
  const busyDates = parseList(row.busy_dates, `${row.id}.busy_dates`, true);
  for (const date of busyDates) {
    const milliseconds = Date.parse(`${date}T00:00:00Z`);
    requireValue(
      /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(milliseconds)
      && new Date(milliseconds).toISOString().slice(0, 10) === date,
      `${row.id}: invalid busy date ${date}`,
    );
    requireValue(date >= minDate && date <= maxDate, `${row.id}: busy date outside dataset period`);
  }
  const maxHours = row.max_hours === '' ? null : parseNumber(row.max_hours, `${row.id}.max_hours`);
  requireValue(maxHours === null || maxHours > 0, `${row.id}: max_hours must be positive or empty`);
  return {
    id: row.id,
    anon_name: row.anon_name,
    categories: parseList(row.categories, `${row.id}.categories`),
    city: row.city,
    city_imputed: parseBoolean(row.city_imputed, `${row.id}.city_imputed`),
    synthetic: parseBoolean(row.synthetic, `${row.id}.synthetic`),
    price_from_kzt: parseNumber(row.price_from_kzt, `${row.id}.price_from_kzt`),
    price_imputed: parseBoolean(row.price_imputed, `${row.id}.price_imputed`),
    event_formats: parseList(row.event_formats, `${row.id}.event_formats`),
    languages: parseList(row.languages, `${row.id}.languages`),
    max_hours: maxHours,
    busy_dates: busyDates,
    description: row.description,
  };
});

const syntheticCount = contractors.filter((contractor) => contractor.synthetic).length;
requireValue(syntheticCount === expectedSynthetic, `Expected ${expectedSynthetic} synthetic profiles`);
const unique = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'ru'));
const options = {
  cities: unique(contractors.map((contractor) => contractor.city)),
  categories: unique(contractors.flatMap((contractor) => contractor.categories)),
  formats: unique(contractors.flatMap((contractor) => contractor.event_formats)),
  languages: unique(contractors.flatMap((contractor) => contractor.languages)),
  minDate,
  maxDate,
  total: contractors.length,
  syntheticCount,
};

await mkdir(resolve(projectRoot, 'src/data'), { recursive: true });
await writeFile(resolve(projectRoot, 'data/contractors.json'), `${JSON.stringify(contractors, null, 2)}\n`);
await writeFile(resolve(projectRoot, 'src/data/catalog-options.json'), `${JSON.stringify(options, null, 2)}\n`);
console.log(`Imported ${contractors.length} contractors (${syntheticCount} synthetic), ${options.categories.length} categories, ${options.cities.length} cities.`);
