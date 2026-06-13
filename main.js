// hi! if ur reading this, to use it have a canvas element with id "threeCanvas" and another with id "asciiCanvas" in your html.
// the three.js scene will render to the first, and the ascii art will be drawn in the second on top.
// for the css, add:
//   #threeCanvas { display: none; }
//   #asciiCanvas { display: block; position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 0; }
// change line 47 to load ur own model
// you will also need an import map in your html u can copy this
//   <script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.176.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/" } }</script>

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// character ramp from dark to bright — order matters for luminance mapping
const CHARS = " .,-~:;=!*#$@+#";
// pixel size of each ascii cell
const CELL_W = 6;
const CELL_H = 10;

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

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

camera.position.set(0, 4, 1);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.8));

let model = null;
const loader = new GLTFLoader();

loader.load(
    // CHANGE THIS 
    "models/lily_flower.glb",
    // ^^^^^^^^^^^
    // make sure u hv correct filepath and ur glb or other model
    (gltf) => {
        model = gltf.scene;
        model.scale.set(1, 1, 1);
        model.position.set(0.4, 0, 0.3);
        scene.add(model);
        console.log("flower loaded");
    },
    (xhr) => {
        console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
    },
    (error) => {
        console.error("GLTF load error:", error);
    },
);

const asciiCanvas = document.getElementById("asciiCanvas");
const ctx = asciiCanvas.getContext("2d");

// offscreen canvas used to read pixel data from the three.js render
const readCtx = document.createElement("canvas").getContext("2d");
let COLS = 0;
let ROWS = 0;

// snap dimensions to the grid so no partial cells bleed at the edges
function resizeScene() {
    W = Math.floor(window.innerWidth / CELL_W) * CELL_W;
    H = Math.floor(window.innerHeight / CELL_H) * CELL_H;

    threeCanvas.width = W;
    threeCanvas.height = H;
    asciiCanvas.width = W;
    asciiCanvas.height = H;

    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();

    readCtx.canvas.width = W;
    readCtx.canvas.height = H;
    COLS = Math.floor(W / CELL_W);
    ROWS = Math.floor(H / CELL_H);
}

resizeScene();

const BRIGHTNESS = 1.5;
// pushes luminance above 1.0 intentionally to get a blown-out glow look
function glowColor(b) {
    const v = Math.round(b * 255 * BRIGHTNESS);
    return `rgb(${v}, ${v}, ${v})`;
}

let t = 0;

function animate() {
    requestAnimationFrame(animate);
    t += 0.008;

    if (model) {
        model.rotation.y = Math.sin(t * 0.4) * 0.25;
    }

    camera.lookAt(0, 3.4, 0);

    renderer.render(scene, camera);
    
    // blit three.js frame into offscreen canvas so we can read pixels
    readCtx.drawImage(threeCanvas, 0, 0, W, H);
    const imgData = readCtx.getImageData(0, 0, W, H);
    const pixels = imgData.data;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, asciiCanvas.width, asciiCanvas.height);

    ctx.textBaseline = "top";
    ctx.font = `${CELL_H - 2}px "Courier New"`;

    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const px = col * CELL_W + (CELL_W >> 1);
            const py = row * CELL_H + (CELL_H >> 1);
            const idx = (py * W + px) * 4;

            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];

            // standard luma weights (rec. 601) give perceptual brightness
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

            // skip near-black pixels so the background stays empty
            if (lum < 0.005) continue;

            const charIdx = Math.floor(lum * (CHARS.length - 1));
            const ch = CHARS[charIdx];

            const drawX = col * CELL_W;
            const drawY = row * CELL_H;

            // bright pixels get shadow glow; hottest ones get a second warm pass on top
            if (lum > 0.25) {
                ctx.save();
                ctx.shadowColor = glowColor(lum);
                ctx.shadowBlur = lum > 0.6 ? 14 : 7;
                ctx.fillStyle = glowColor(lum);
                ctx.fillText(ch, drawX, drawY);

                if (lum > 0.55) {
                    ctx.shadowBlur = 3;
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
