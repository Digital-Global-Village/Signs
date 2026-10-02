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
      checked: false, style: {}, handlers: {},
      classList: { add() {}, remove() {} },
      addEventListener(name, handler) { this.handlers[name] = handler; },
      setAttribute() {}, hasPointerCapture: () => false,
      setPointerCapture() {}, releasePointerCapture() {},
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 50, height: 50 }),
      getContext: () => ({ clearRect() {}, putImageData() {} }),
    });
    return elements.get(selector);
  };
  class ImageData {
    constructor(width, height) {
      this.width = width; this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  }
  const context = vm.createContext({ document: { querySelector: get, querySelectorAll: () => [], addEventListener() {} },
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

  // A manual selection inside an existing crop must map back to original pixels.
  vm.runInContext('cropRect = { x: 20, y: 20, width: 70, height: 70 };', context);
  get('#manualCropButton').handlers.click();
  vm.runInContext('draftCrop = { x: 10, y: 10, width: 40, height: 40 };', context);
  get('#applyCropButton').handlers.click();
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(cropRect)', context)),
    { x: 30, y: 30, width: 40, height: 40 });
  assert.equal(get('#previewCanvas').width, 40);
  get('#manualCropButton').handlers.click();
  get('#cancelCropButton').handlers.click();
  assert.equal(vm.runInContext('cropRect.width', context), 40);
  assert.equal(get('#downloadButton').disabled, false);

  // Auto crop searches only the selected region, and may expand after cleanup changes.
  vm.runInContext('originalImageData.data.set([0,0,0,255], 0); autoCrop();', context);
  assert.equal(vm.runInContext('cropRect.x', context), 34);
  vm.runInContext('originalImageData.data.set([0,0,0,255], (32*100+32)*4); renderSignature();', context);
  assert.equal(vm.runInContext('cropRect.x', context), 30);
  get('#restoreCropButton').handlers.click();
  assert.equal(vm.runInContext('cropRect', context), null);
  assert.equal(get('#threshold').value, '78');
  assert.equal(get('#previewCanvas').width, 100);
  get('#manualCropButton').handlers.click();
  const canvas = get('#previewCanvas');
  canvas.handlers.pointerdown({ clientX: 20, clientY: 30, isPrimary: true,
    button: 0, pointerId: 1, preventDefault() {} });
  canvas.handlers.pointerup({ clientX: 40, clientY: 50, pointerId: 1 });
  get('#applyCropButton').handlers.click();
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(cropRect)', context)),
    { x: 20, y: 20, width: 40, height: 40 });
  const reverse = vm.runInContext('selectionRect({x:90,y:80}, {x:10,y:20}, 100, 100)', context);
  assert.deepEqual(JSON.parse(JSON.stringify(reverse)), { x: 10, y: 20, width: 80, height: 60 });
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
      keys: async () => ['signature-cleaner-v0', 'signature-cleaner-v1.0.1', 'other-app'],
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
