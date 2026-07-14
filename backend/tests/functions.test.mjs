import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import test from 'node:test';

const functionsDirectory = new URL('../../netlify/functions/', import.meta.url);

test('todas as Netlify Functions exportam handler e rota única', async () => {
  const files = (await readdir(functionsDirectory))
    .filter(file => file.endsWith('.js'))
    .sort();

  assert.equal(files.length, 8);

  const routes = new Set();
  for (const file of files) {
    const moduleUrl = new URL(file, functionsDirectory);
    const entry = await import(moduleUrl.href);
    assert.equal(typeof entry.default, 'function', `${file} precisa exportar um handler`);
    assert.equal(typeof entry.config?.path, 'string', `${file} precisa declarar config.path`);
    assert.equal(routes.has(entry.config.path), false, `rota duplicada: ${entry.config.path}`);
    routes.add(entry.config.path);
  }
});
