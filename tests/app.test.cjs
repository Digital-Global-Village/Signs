const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('manifest assets exist with correct PNG dimensions and repository-relative paths', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) {
    const png = fs.readFileSync(path.join(root, icon.src));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});

test('cleanup removes paper, preserves black/blue ink and crops to ink bounds', () => {
  const elements = new Map();
  const get = (selector) => {
    if (!elements.has(selector)) elements.set(selector, {
      value: ({ '#threshold': '78', '#softness': '22', '#darkness': '32' })[selector] || '',
      checked: false, classList: { add() {}, remove() {} }, addEventListener() {},
      getContext: () => ({}),
    });
    return elements.get(selector);
  };
  class ImageData {
    constructor(width, height) {
      this.width = width; this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  }
  const context = vm.createContext({ document: { querySelector: get, querySelectorAll: () => [] },
    navigator: {}, ImageData, Uint8ClampedArray });
  vm.runInContext(read('app.js'), context);
  vm.runInContext(`originalImageData = new ImageData(100, 100);
    for (let i = 0; i < originalImageData.data.length; i += 4) {
      originalImageData.data.set([255,255,255,255], i);
    }
    originalImageData.data.set([0,0,0,255], (50*100+50)*4);
    originalImageData.data.set([20,40,130,255], (50*100+51)*4);`, context);
  const processed = vm.runInContext('getProcessedImageData()', context);
  assert.equal(processed.data[3], 0);
  assert.equal(processed.data[(50 * 100 + 50) * 4 + 3], 255);
  assert.equal(processed.data[(50 * 100 + 51) * 4 + 3], 255);
  const bounds = vm.runInContext('findInkBounds(getProcessedImageData())', context);
  assert.deepEqual(JSON.parse(JSON.stringify(bounds)), { x: 34, y: 34, width: 34, height: 33 });
});

test('worker precaches complete app, serves offline navigation, and preserves unrelated caches', async () => {
  const handlers = {};
  const cached = new Map();
  const deleted = [];
  const scope = 'https://example.com/Signs/';
  const cache = {
    addAll: async (files) => {
      for (const file of files) {
        if (file !== './') assert.ok(fs.existsSync(path.join(root, file)), file);
        cached.set(new URL(file, scope).href, { file });
      }
    },
    match: async (request) => cached.get(typeof request === 'string' ? request : request.url.split('?')[0]),
  };
  let claimed = false;
  const context = vm.createContext({ URL,
    self: { addEventListener: (name, handler) => { handlers[name] = handler; },
      location: { origin: 'https://example.com' }, registration: { scope },
      clients: { claim: async () => { claimed = true; } } },
    caches: { open: async () => cache,
      keys: async () => ['signature-cleaner-v0', 'signature-cleaner-v1.0.0', 'other-app'],
      delete: async (key) => { deleted.push(key); } },
    fetch: async () => { throw new Error('offline'); },
  });
  vm.runInContext(read('sw.js'), context);
  let pending;
  handlers.install({ waitUntil: (task) => { pending = task; } });
  await pending;
  handlers.activate({ waitUntil: (task) => { pending = task; } });
  await pending;
  assert.deepEqual(deleted, ['signature-cleaner-v0']);
  assert.ok(claimed);
  for (const [url, mode] of [['index.html', 'navigate'], ['app.js', 'cors'], ['missing-route', 'navigate']]) {
    handlers.fetch({ request: { url: scope + url, method: 'GET', mode }, respondWith: (task) => { pending = task; } });
    assert.ok(await pending, url);
  }
  let intercepted = false;
  handlers.fetch({ request: { url: 'https://elsewhere.com/photo', method: 'GET' },
    respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});
