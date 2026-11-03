const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const root = `${__dirname}/..`;

// Browser APIs are represented only at the app boundary; handlers and catalog
// run unchanged. Layout and actual fullscreen entry also need browser checks.
function setup({fullscreenEnabled = true} = {}) {
  class Surface {
    constructor() {
      this.listeners = new Map(); this.attributes = new Map();
      this.classes = new Set(); this.properties = new Map();
      this.style = {setProperty:(key,value) => this.properties.set(key,value)};
      this.classList = {
        contains:key => this.classes.has(key),
        add:key => this.classes.add(key), remove:key => this.classes.delete(key),
        toggle:(key,force = !this.classes.has(key)) => {
          if (force) this.classes.add(key); else this.classes.delete(key);
          return force;
        }
      };
      this.clientWidth = 870; this.clientHeight = 640;
      this.naturalWidth = 1200; this.naturalHeight = 800; this.complete = true;
      this.tagName = 'BUTTON'; this.isConnected = true;
    }
    addEventListener(type,handler) {
      if (!this.listeners.has(type)) this.listeners.set(type,[]);
      this.listeners.get(type).push(handler);
    }
    async emit(type,event = {}) {
      for (const handler of this.listeners.get(type) || [])
        await handler({target:this,preventDefault(){},...event});
    }
    setAttribute(key,value) { this.attributes.set(key,value); }
    getAttribute(key) { return this.attributes.get(key); }
    scrollTo() {} scrollIntoView() {}
    querySelector() { return null; } querySelectorAll() { return []; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
  }
  const elements = Object.fromEntries([...readFileSync(`${root}/index.html`,'utf8').matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Surface()]));
  const document = new Surface();
  document.getElementById = id => elements[id];
  document.querySelector = () => new Surface();
  document.documentElement = new Surface();
  document.fullscreenEnabled = fullscreenEnabled;
  document.fullscreenElement = null;
  document.activeElement = new Surface();
  document.documentElement.requestFullscreen = async () => {
    document.fullscreenElement = document.documentElement;
    await document.emit('fullscreenchange');
  };
  // A dialog has this inherited method, but is not an eligible target.
  elements.viewer.requestFullscreen = async () => { throw new TypeError('Dialog cannot enter fullscreen'); };
  document.exitFullscreen = async () => {
    document.fullscreenElement = null; await document.emit('fullscreenchange');
  };
  const window = new Surface(); window.visualViewport = {scale:1};
  const context = vm.createContext({document,window,navigator:{},location:{hash:''},
    history:{state:null,replaceState(){},pushState(){},back(){}},
    matchMedia:()=>({matches:false}),innerWidth:1000,innerHeight:700,
    ResizeObserver:class {observe(){}},setTimeout:()=>0,clearTimeout(){},URL});
  for (const file of ['works.js','details.js','app.js'])
    vm.runInContext(readFileSync(`${root}/${file}`,'utf8'),context,{filename:file});
  vm.runInContext("openWork('IMG_1285',true)",context);
  return {elements,document,window,run:code=>vm.runInContext(code,context)};
}

test('fullscreen enters on the document and closing detail exits it',async()=>{
  const {elements,document} = setup();
  await elements.fullscreen.emit('click');
  assert.equal(document.fullscreenElement,document.documentElement);
  assert.equal(elements.fullscreen.textContent,'화면 복원');
  await elements['close-viewer'].emit('click');
  assert.equal(document.fullscreenElement,null);
});

test('unsupported fullscreen is hidden and pre-existing fullscreen is preserved',async()=>{
  assert.equal(setup({fullscreenEnabled:false}).elements.fullscreen.hidden,true);
  const {elements,document} = setup();
  document.fullscreenElement = document.documentElement;
  await elements['close-viewer'].emit('click');
  assert.equal(document.fullscreenElement,document.documentElement);
});

test('rotation fits both views, survives opening lightbox, and resets on navigation',async()=>{
  const {elements,run} = setup();
  assert.ok(elements.rotate,'rotation control is present');
  await elements.rotate.emit('click');
  const image = elements['viewer-image'];
  assert.equal(image.properties.get('--rotation'),'90deg');
  // A 1200×800 image rotated into an 800×600 box must be 600×400.
  assert.equal(image.properties.get('--image-width'),'600px');
  assert.equal(image.properties.get('--image-height'),'400px');
  await image.emit('click');
  assert.equal(elements.lightbox.open,true);
  assert.equal(elements['lightbox-image'].properties.get('--rotation'),'90deg');
  assert.equal(elements['lightbox-image'].style.width,'700px');
  await elements['lightbox-next'].emit('click');
  assert.equal(elements['lightbox-image'].properties.get('--rotation'),'0deg');
  elements.lightbox.close();
  assert.equal(run("document.activeElement === $('viewer-image')"),true);
});

test('R shortcut and zoom reset rotation without keeping a rotated image',async()=>{
  const {elements,document} = setup();
  await document.emit('keydown',{key:'r'});
  assert.equal(elements['viewer-image'].properties.get('--rotation'),'90deg');
  await elements.zoom.emit('click');
  assert.equal(elements.zoom.getAttribute('aria-pressed'),'true');
  await elements.zoom.emit('click');
  assert.equal(elements['viewer-image'].properties.get('--rotation'),'0deg');
});

test('lightbox swipes navigate, while pinch, zoom and cancelled gestures do not',async()=>{
  const {elements,window} = setup();
  const surface = elements.lightbox;
  const start = [{clientX:200,clientY:50}], end = [{clientX:40,clientY:55}];
  const swipe = async () => {
    await surface.emit('touchstart',{touches:start});
    await surface.emit('touchend',{changedTouches:end});
  };
  await elements['viewer-image'].emit('click');
  await swipe();
  assert.ok(elements['viewer-image'].src.endsWith('IMG_1286.jpg'));
  const before = elements['viewer-image'].src;
  window.visualViewport.scale = 2;
  await swipe();
  assert.equal(elements['viewer-image'].src,before);
  window.visualViewport.scale = 1;
  await surface.emit('touchstart',{touches:start});
  await surface.emit('touchmove',{touches:[...start,...start]});
  await surface.emit('touchend',{changedTouches:end});
  assert.equal(elements['viewer-image'].src,before);
  await surface.emit('touchstart',{touches:start});
  await surface.emit('touchcancel');
  await surface.emit('touchend',{changedTouches:end});
  assert.equal(elements['viewer-image'].src,before);
});

test('lightbox image failures return to the detail image with feedback',async()=>{
  const {elements,document} = setup();
  await elements['viewer-image'].emit('click');
  await elements['lightbox-image'].emit('error');
  assert.equal(elements.lightbox.open,false);
  assert.equal(document.activeElement,elements['viewer-image']);
  assert.equal(elements.toast.classList.contains('visible'),true);
});
