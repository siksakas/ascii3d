// hi! if ur reading this, to use it have a canvas element with id "threeCanvas" and another with id "asciiCanvas" in your html,
// both inside a wrapper with id "stage" (the ascii canvas fills the stage, so size the stage however u like).
// the three.js scene will render to the first, and the ascii art will be drawn in the second on top.
// for the css, add:
//   #stage { position: relative; }
//   #threeCanvas { display: none; }
//   #asciiCanvas { display: block; position: absolute; inset: 0; }
// the settings menu builds itself into an element with id "controls" (and a #reset button) — leave those out if u don't want the menu.
// change DEFAULT_MODEL below to load ur own model, or just drop a .glb onto the page / use the import button in the menu
// you will also need an import map in your html u can copy this
//   <script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.176.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/" } }</script>

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ---------- settings ----------
// everything tweakable lives here. the menu reads/writes this object directly,
// so the render loop just reads S.* every frame and picks up changes for free.
const DEFAULTS = {
    // character ramp from dark to bright — order matters for luminance mapping
    chars: " .,-~:;=!*#$@+#",
    invert: false,
    // pixel size of each ascii cell
    cellW: 6,
    cellH: 10,
    // glyph size as a fraction of cell height (original was cellH - 2 ≈ 0.8)
    fontScale: 0.8,
    font: "Courier New",
    // luminance stuff
    brightness: 1.5,
    threshold: 0.005,
    glow: true,
    glowScale: 1,
    // motion
    spinSpeed: 1,
    spinAmount: 0.25,
    // camera
    fov: 75,
    camHeight: 4,
    camDist: 1,
    targetHeight: 3.4,
    // scene — models get normalised so their biggest dimension = fitSize and they stand on y=0
    modelScale: 1,
    modelX: 0.4,
    fitSize: 4,
    keyLight: 1.2,
    ambient: 0.8,
};
const S = { ...DEFAULTS };

// what shows up in the menu, in order. `kind` picks the input type,
// `apply` is an optional hook for settings that need more than a re-read next frame.
const SCHEMA = [
    {
        title: "characters",
        fields: [
            { key: "chars", label: "ramp (dark → bright)", kind: "text" },
            { key: "invert", label: "invert ramp", kind: "check" },
            { key: "font", label: "font", kind: "select",
              options: ["Courier New", "Menlo", "monospace", "BDO Grotesk", "serif"] },
            { key: "fontScale", label: "glyph size", kind: "range", min: 0.3, max: 2, step: 0.05 },
        ],
    },
    {
        title: "grid",
        fields: [
            { key: "cellW", label: "cell width", kind: "range", min: 2, max: 30, step: 1, unit: "px", apply: resizeScene },
            { key: "cellH", label: "cell height", kind: "range", min: 3, max: 48, step: 1, unit: "px", apply: resizeScene },
        ],
    },
    {
        title: "light & glow",
        fields: [
            { key: "brightness", label: "brightness", kind: "range", min: 0.2, max: 4, step: 0.05 },
            { key: "threshold", label: "black cutoff", kind: "range", min: 0, max: 0.4, step: 0.005 },
            { key: "glow", label: "glow", kind: "check" },
            { key: "glowScale", label: "glow strength", kind: "range", min: 0, max: 3, step: 0.05 },
            { key: "keyLight", label: "key light", kind: "range", min: 0, max: 4, step: 0.05, apply: applyLights },
            { key: "ambient", label: "ambient light", kind: "range", min: 0, max: 3, step: 0.05, apply: applyLights },
        ],
    },
    {
        title: "model",
        fields: [
            { key: "modelFile", label: "file", kind: "file", accept: ".glb,.gltf" },
            { key: "fitSize", label: "fit size", kind: "range", min: 0.5, max: 12, step: 0.1, apply: applyModel },
            { key: "modelScale", label: "model scale", kind: "range", min: 0.1, max: 4, step: 0.05, apply: applyModel },
            { key: "modelX", label: "model x offset", kind: "range", min: -3, max: 3, step: 0.05, apply: applyModel },
        ],
    },
    {
        title: "camera & motion",
        fields: [
            { key: "fov", label: "field of view", kind: "range", min: 20, max: 120, step: 1, unit: "°", apply: applyCamera },
            { key: "camDist", label: "camera distance", kind: "range", min: 0.2, max: 10, step: 0.05, apply: applyCamera },
            { key: "camHeight", label: "camera height", kind: "range", min: -2, max: 10, step: 0.05, apply: applyCamera },
            { key: "targetHeight", label: "look-at height", kind: "range", min: -2, max: 10, step: 0.05 },
            { key: "spinSpeed", label: "sway speed", kind: "range", min: 0, max: 5, step: 0.05 },
            { key: "spinAmount", label: "sway amount", kind: "range", min: 0, max: 3.2, step: 0.05 },
        ],
    },
];

// ---------- three.js ----------
const stage = document.getElementById("stage");
const threeCanvas = document.getElementById("threeCanvas");
let W = 0;
let H = 0;

const renderer = new THREE.WebGLRenderer({
    canvas: threeCanvas,
    antialias: true,
});
// keep at 1 so pixel reads stay 1:1 with canvas coords
renderer.setPixelRatio(1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(S.fov, 1, 0.1, 1000);

const dirLight = new THREE.DirectionalLight(0xffffff, S.keyLight);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);
const ambLight = new THREE.AmbientLight(0xffffff, S.ambient);
scene.add(ambLight);

function applyCamera() {
    camera.fov = S.fov;
    camera.position.set(0, S.camHeight, S.camDist);
    camera.updateProjectionMatrix();
}
function applyLights() {
    dirLight.intensity = S.keyLight;
    ambLight.intensity = S.ambient;
}
function applyModel() {
    if (!model) return;
    // model is a wrapper group: the loaded scene sits inside, already centred + scaled to fitSize
    const inner = model.children[0];
    const k = S.fitSize / model.userData.maxDim;
    inner.scale.setScalar(k);
    inner.position.copy(model.userData.baseOffset).multiplyScalar(k);
    model.scale.setScalar(S.modelScale);
    model.position.set(S.modelX, 0, 0.3);
}
applyCamera();

// CHANGE THIS to ur own file (or just import one from the menu)
const DEFAULT_MODEL = "models/lily_flower.glb";

let model = null;
const loader = new GLTFLoader();

// swaps in a freshly loaded gltf scene, throwing away whatever was there before.
// we wrap it in a group and remember its bounds so applyModel can normalise it —
// random glbs come in at any scale, this makes them all land in roughly the same spot.
function setModel(object, name) {
    if (model) {
        scene.remove(model);
        model.traverse((o) => {
            o.geometry?.dispose();
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => m?.dispose());
        });
    }

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    model = new THREE.Group();
    model.userData.maxDim = Math.max(size.x, size.y, size.z) || 1;
    // shift so the model is centred on x/z and its feet are on y=0 (before scaling)
    model.userData.baseOffset = new THREE.Vector3(-center.x, -box.min.y, -center.z);
    model.userData.name = name;
    model.add(object);
    scene.add(model);
    applyModel();

    menu.modelFile?.(name);
    console.log("model loaded:", name);
}

function loadModelFromUrl(url, name = url.split("/").pop()) {
    loader.load(
        url,
        (gltf) => setModel(gltf.scene, name),
        (xhr) => {
            if (xhr.total) console.log(((xhr.loaded / xhr.total) * 100).toFixed(0) + "% loaded");
        },
        (error) => console.error("GLTF load error:", error),
    );
}

// .glb (or a .gltf with everything embedded) picked from disk
function loadModelFromFile(file) {
    if (!file) return;
    file.arrayBuffer().then((buf) => {
        loader.parse(
            buf,
            "",
            (gltf) => setModel(gltf.scene, file.name),
            (error) => {
                console.error("GLTF parse error:", error);
                alert(`couldn't read ${file.name} — make sure it's a .glb (or a .gltf with embedded buffers/textures)`);
            },
        );
    });
}

loadModelFromUrl(DEFAULT_MODEL);

// drag a file anywhere onto the page to load it
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
    e.preventDefault();
    loadModelFromFile(e.dataTransfer.files[0]);
});

const asciiCanvas = document.getElementById("asciiCanvas");
const ctx = asciiCanvas.getContext("2d");

// offscreen canvas used to read pixel data from the three.js render
const readCtx = document.createElement("canvas").getContext("2d");
let COLS = 0;
let ROWS = 0;

// snap dimensions to the grid so no partial cells bleed at the edges
function resizeScene() {
    W = Math.floor(stage.clientWidth / S.cellW) * S.cellW;
    H = Math.floor(stage.clientHeight / S.cellH) * S.cellH;

    threeCanvas.width = W;
    threeCanvas.height = H;
    asciiCanvas.width = W;
    asciiCanvas.height = H;

    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();

    readCtx.canvas.width = W;
    readCtx.canvas.height = H;
    COLS = Math.floor(W / S.cellW);
    ROWS = Math.floor(H / S.cellH);
}

resizeScene();

// pushes luminance above 1.0 intentionally to get a blown-out glow look
function glowColor(b) {
    const v = Math.round(b * 255 * S.brightness);
    return `rgb(${v}, ${v}, ${v})`;
}

let t = 0;

function animate() {
    requestAnimationFrame(animate);
    t += 0.008 * S.spinSpeed;

    if (model) {
        model.rotation.y = Math.sin(t * 0.4) * S.spinAmount;
    }

    camera.lookAt(0, S.targetHeight, 0);

    renderer.render(scene, camera);

    // blit three.js frame into offscreen canvas so we can read pixels
    readCtx.drawImage(threeCanvas, 0, 0, W, H);
    const imgData = readCtx.getImageData(0, 0, W, H);
    const pixels = imgData.data;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, asciiCanvas.width, asciiCanvas.height);

    ctx.textBaseline = "top";
    ctx.font = `${Math.max(1, Math.round(S.cellH * S.fontScale))}px "${S.font}"`;

    // pull these out of the loop — the ramp can change at any time from the menu
    const chars = S.invert ? [...S.chars].reverse().join("") : S.chars;
    const last = chars.length - 1;
    if (last < 0) return;
    const { cellW, cellH, threshold, glow, glowScale } = S;

    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const px = col * cellW + (cellW >> 1);
            const py = row * cellH + (cellH >> 1);
            const idx = (py * W + px) * 4;

            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];

            // standard luma weights (rec. 601) give perceptual brightness
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

            // skip near-black pixels so the background stays empty
            if (lum < threshold) continue;

            const ch = chars[Math.floor(lum * last)];

            const drawX = col * cellW;
            const drawY = row * cellH;

            // bright pixels get shadow glow; hottest ones get a second warm pass on top
            if (glow && lum > 0.25) {
                ctx.save();
                ctx.shadowColor = glowColor(lum);
                ctx.shadowBlur = (lum > 0.6 ? 14 : 7) * glowScale;
                ctx.fillStyle = glowColor(lum);
                ctx.fillText(ch, drawX, drawY);

                if (lum > 0.55) {
                    ctx.shadowBlur = 3 * glowScale;
                    ctx.fillStyle = `rgba(255,255,220,${(lum - 0.55) * 2})`;
                    ctx.fillText(ch, drawX, drawY);
                }
                ctx.restore();
            } else {
                ctx.fillStyle = glowColor(lum);
                ctx.fillText(ch, drawX, drawY);
            }
        }
    }
}

animate();

window.addEventListener("resize", resizeScene);

// ---------- menu ----------
// key -> fn that pushes S[key] back into its input (used by reset, and by setModel to show the file name)
const menu = {};

// builds the controls from SCHEMA into #controls. skipped entirely if the element isn't there.
function buildMenu() {
    const root = document.getElementById("controls");
    if (!root) return;
    const syncers = menu;

    for (const group of SCHEMA) {
        const g = document.createElement("div");
        g.className = "group";
        g.innerHTML = `<div class="group-title">${group.title}</div>`;

        for (const f of group.fields) {
            const el = document.createElement("div");
            el.className = `field ${f.kind}`;
            const id = `ctl-${f.key}`;

            // show as many decimals as the step has, so 0.005 doesn't round to 0.01
            const decimals = f.step ? (String(f.step).split(".")[1] ?? "").length : 0;
            const fmt = (v) => (typeof v === "number" ? `${v.toFixed(decimals)}${f.unit ?? ""}` : v);

            const commit = (v) => {
                S[f.key] = v;
                f.apply?.();
            };

            if (f.kind === "range") {
                el.innerHTML = `
                    <div class="row"><label for="${id}">${f.label}</label><span class="value"></span></div>
                    <input type="range" id="${id}" min="${f.min}" max="${f.max}" step="${f.step}">`;
                const input = el.querySelector("input");
                const value = el.querySelector(".value");
                input.addEventListener("input", () => {
                    commit(parseFloat(input.value));
                    value.textContent = fmt(S[f.key]);
                });
                syncers[f.key] = () => {
                    input.value = S[f.key];
                    value.textContent = fmt(S[f.key]);
                };
            } else if (f.kind === "text") {
                el.innerHTML = `
                    <div class="row"><label for="${id}">${f.label}</label><span class="value"></span></div>
                    <input type="text" id="${id}" spellcheck="false" autocomplete="off">`;
                const input = el.querySelector("input");
                const value = el.querySelector(".value");
                input.addEventListener("input", () => {
                    commit(input.value);
                    value.textContent = `${input.value.length} chars`;
                });
                syncers[f.key] = () => {
                    input.value = S[f.key];
                    value.textContent = `${S[f.key].length} chars`;
                };
            } else if (f.kind === "select") {
                el.innerHTML = `
                    <div class="row"><label for="${id}">${f.label}</label></div>
                    <div class="select-wrap"><select id="${id}">
                        ${f.options.map((o) => `<option value="${o}">${o}</option>`).join("")}
                    </select></div>`;
                const input = el.querySelector("select");
                input.addEventListener("change", () => commit(input.value));
                syncers[f.key] = () => { input.value = S[f.key]; };
            } else if (f.kind === "file") {
                el.innerHTML = `
                    <div class="row"><label for="${id}">${f.label}</label><span class="value"></span></div>
                    <div class="file-row">
                        <button type="button" class="link" id="${id}">import .glb</button>
                        <button type="button" class="link" id="${id}-default">default model</button>
                    </div>
                    <input type="file" id="${id}-input" accept="${f.accept}" hidden>`;
                const input = el.querySelector("input");
                const value = el.querySelector(".value");
                el.querySelector(`#${id}`).addEventListener("click", () => input.click());
                el.querySelector(`#${id}-default`).addEventListener("click", () => loadModelFromUrl(DEFAULT_MODEL));
                input.addEventListener("change", () => {
                    loadModelFromFile(input.files[0]);
                    input.value = "";
                });
                // called with a name by setModel; with nothing (reset) it just re-shows the current one
                syncers[f.key] = (name) => {
                    value.textContent = name ?? model?.userData.name ?? "loading…";
                };
            } else if (f.kind === "check") {
                el.innerHTML = `
                    <label class="row" for="${id}"><span>${f.label}</span><input type="checkbox" id="${id}"></label>`;
                const input = el.querySelector("input");
                input.addEventListener("change", () => commit(input.checked));
                syncers[f.key] = () => { input.checked = S[f.key]; };
            }

            syncers[f.key]();
            g.appendChild(el);
        }
        root.appendChild(g);
    }

    document.getElementById("reset")?.addEventListener("click", () => {
        Object.assign(S, DEFAULTS);
        for (const key in syncers) syncers[key]();
        resizeScene();
        applyCamera();
        applyLights();
        applyModel();
    });
}

buildMenu();
