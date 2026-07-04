import * as THREE from "three";

// ----------------------
// Core state
// ----------------------

let camera, scene, renderer;
let controller;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;

let points = [];   // all placed points (THREE.Vector3)
let markers = [];  // sphere meshes for each point
let lines = [];    // line meshes connecting consecutive points

const distanceEl = document.getElementById("distance");
const startButton = document.getElementById("startAR");
const resetButton = document.getElementById("resetBtn");
const instructionsEl = document.getElementById("instructions");

init();

function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        20
    );

    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0); // transparent so camera feed shows through in AR
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Reticle: a ring that snaps to detected surfaces, showing where a tap will place a point
    const ringGeometry = new THREE.RingGeometry(0.03, 0.04, 32).rotateX(-Math.PI / 2);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    reticle = new THREE.Mesh(ringGeometry, ringMaterial);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Controller fires a "select" event on screen tap / trigger press
    controller = renderer.xr.getController(0);
    controller.addEventListener("select", onSelect);
    scene.add(controller);

    window.addEventListener("resize", onWindowResize);

    startButton.addEventListener("click", startAR);
    resetButton.addEventListener("click", resetMeasurement);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ----------------------
// Starting the AR session
// ----------------------

async function startAR() {
    if (!navigator.xr) {
        alert("WebXR isn't available. Use Chrome on an ARCore-capable Android device, served over HTTPS.");
        return;
    }

    const supported = await navigator.xr.isSessionSupported("immersive-ar");
    if (!supported) {
        alert("Immersive AR isn't supported on this device/browser.");
        return;
    }

    const overlay = document.getElementById("overlay");

    let session;
    try {
        session = await navigator.xr.requestSession("immersive-ar", {
            requiredFeatures: ["hit-test"],
            optionalFeatures: ["dom-overlay"],
            domOverlay: { root: overlay }
        });
    } catch (err) {
        alert("Could not start AR session: " + err.message);
        return;
    }

    session.addEventListener("end", onSessionEnd);

    renderer.xr.setReferenceSpaceType("local");
    await renderer.xr.setSession(session);

    startButton.style.display = "none";
    resetButton.style.display = "inline-block";
    instructionsEl.style.display = "block";

    renderer.setAnimationLoop(render);
}

function onSessionEnd() {
    hitTestSourceRequested = false;
    hitTestSource = null;
    startButton.style.display = "inline-block";
    resetButton.style.display = "none";
    instructionsEl.style.display = "none";
    reticle.visible = false;
    renderer.setAnimationLoop(null);
    resetMeasurement();
}

// ----------------------
// Placing points + measuring
// ----------------------

function onSelect() {
    if (!reticle.visible) return;

    const position = new THREE.Vector3();
    position.setFromMatrixPosition(reticle.matrix);

    // Marker sphere at the tapped point
    const markerGeometry = new THREE.SphereGeometry(0.015, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff3355 });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(position);
    scene.add(marker);
    markers.push(marker);

    points.push(position);

    if (points.length >= 2) {
        const p1 = points[points.length - 2];
        const p2 = points[points.length - 1];

        // Line connecting the two most recent points
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(line);
        lines.push(line);

        const distance = p1.distanceTo(p2);
        distanceEl.textContent = `Distance: ${distance.toFixed(2)} m`;
    }
}

function resetMeasurement() {
    points = [];
    markers.forEach((m) => scene.remove(m));
    lines.forEach((l) => scene.remove(l));
    markers = [];
    lines = [];
    distanceEl.textContent = "Distance: 0.00 m";
}

// ----------------------
// Render loop with hit-testing
// ----------------------

function render(timestamp, frame) {
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (!hitTestSourceRequested) {
            session.requestReferenceSpace("viewer").then((viewerSpace) => {
                session.requestHitTestSource({ space: viewerSpace }).then((source) => {
                    hitTestSource = source;
                });
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const pose = hit.getPose(referenceSpace);

                reticle.visible = true;
                reticle.matrix.fromArray(pose.transform.matrix);
            } else {
                reticle.visible = false;
            }
        }
    }

    renderer.render(scene, camera);
}
