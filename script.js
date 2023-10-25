

/// <reference types="better-typescript" />
/// <reference types="@webgpu/types" />

const canvas = document.querySelector("canvas");

const pixelRatio = window.devicePixelRatio;

canvas.width = canvas.clientWidth * pixelRatio;
canvas.height = canvas.clientHeight * pixelRatio;

const offscreenCanvas = canvas.transferControlToOffscreen();

const worker = new Worker(import.meta.resolve("./worker.js"), { type: "module" });

worker.postMessage({ type: "initialize", canvas: offscreenCanvas }, { transfer: [offscreenCanvas] });

window.addEventListener("keydown", (event) => {
	worker.postMessage({ type: "keydown", key: event.key });
});
window.addEventListener("keyup", (event) => {
	worker.postMessage({ type: "keyup", key: event.key });
});


window.addEventListener("resize", () => {
	worker.postMessage({
		type: "resize",
		width: canvas.clientWidth * pixelRatio,
		height: canvas.clientHeight * pixelRatio,
	});
});


export { };
