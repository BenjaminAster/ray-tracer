
/// <reference no-default-lib="true" />
/// <reference types="better-typescript/worker" />
/// <reference types="@webgpu/types" />

const _expose = (objects) => {
	for (const [name, value] of Object.entries(objects)) {
		globalThis[name] = value;
	}
}

let /** @type {OffscreenCanvas} */ canvas;
let lightTheme = false;
let fieldOfView = 0;
let maxBounces = 5;
let antialiasingSamplesPerPixel = 2;
let pixelRatio = 1;

let /** @type {Set<string>} */ pressedKeys = new Set();
let /** @type {Set<string>} */ currentMoveDirections = new Set();

let /** @type {Tuple<number, 3>} */ cameraPosition = [-4, 0, 4];
let /** @type {Tuple<number, 2>} */ cameraRotation = [0, 0];

await new Promise((resolve) => self.addEventListener("message", ({ data }) => {
	if (data.type === "initialize") {
		({ canvas, pixelRatio } = data);
		resolve();
	} else if (data.type === "resize") {
		canvas.width = data.width;
		canvas.height = data.height;
		({ pixelRatio } = data);
	} else if (data.type === "keydown") {
		pressedKeys.add(data.key);
	} else if (data.type === "keyup") {
		pressedKeys.delete(data.key);
	} else if (data.type === "start-moving") {
		currentMoveDirections.add(data.direction);
	} else if (data.type === "stop-moving") {
		currentMoveDirections.delete(data.direction);
	} else if (data.type === "pointer-moved") {
		cameraRotation[0] += data.x * pixelRatio * 2 * fieldOfView / canvas.height;
		cameraRotation[1] += data.y * pixelRatio * 2 * fieldOfView / canvas.height;
	} else if (data.type === "set-theme") {
		({ lightTheme } = data);
	} else if (data.type === "set-max-bounces") {
		({ maxBounces } = data);
	} else if (data.type === "set-antialiasing-samples-per-pixel") {
		({ antialiasingSamplesPerPixel } = data);
	} else if (data.type === "set-field-of-view") {
		({ fieldOfView } = data);
	}
}));

const { adapter, device } = await (async () => {
	try {
		const adapter = await navigator.gpu?.requestAdapter();
		const device = await adapter?.requestDevice();
		return { adapter, device };
	} catch { };
})();

if (!device) {
	throw new Error("Your browser does not support WebGPU.");
}

self.postMessage({ type: "ready" });

const context = canvas.getContext("webgpu");
const format = navigator.gpu.getPreferredCanvasFormat();

const roundToNextPowerOfTwo = (/** @type {number} */ number) => (2 ** (Math.ceil(Math.log2(number))));

const structBufferSize = (/** @type {number[]} */ ...sizes) => {
	sizes = sizes.map(size => roundToNextPowerOfTwo(size));
	let size = sizes.reduce((prev, next) => prev + next, 0);
	let maxSize = Math.max(...sizes);
	return Math.ceil(size / maxSize) * maxSize;
};

const mergeTypedArrays = (/** @type {TypedArray[]} */ ...arrays) => {
	const size = structBufferSize(...arrays.map(array => array.byteLength));
	const buffer = new Uint8Array(size);
	let offset = 0;
	for (const array of arrays) {
		buffer.set(new Uint8Array(array.buffer), offset);
		offset += roundToNextPowerOfTwo(array.byteLength);
	}
	return buffer.buffer;
}

const uniformBufferSize = structBufferSize(
	4 * Float32Array.BYTES_PER_ELEMENT, // camera: vec3<f32>
	2 * Float32Array.BYTES_PER_ELEMENT, // rotation: vec2<f32>
	2 * Float32Array.BYTES_PER_ELEMENT, // canvas_dimensions: vec2<f32>
	1 * Uint32Array.BYTES_PER_ELEMENT, // light_theme: u32
	1 * Float32Array.BYTES_PER_ELEMENT, // fov_scale: f32
	1 * Uint32Array.BYTES_PER_ELEMENT, // max_bounces: u32
	1 * Uint32Array.BYTES_PER_ELEMENT, // antialiasing_samples: u32
);

const uniformBuffer = device.createBuffer({
	size: uniformBufferSize,
	usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});

const shaderPath = import.meta.resolve("./shader.wgsl");

const shaderModule = device.createShaderModule({
	code: await (await self.fetch(shaderPath)).text(),
});

const pipeline = await device.createRenderPipelineAsync({
	layout: "auto",
	vertex: {
		module: shaderModule,
		entryPoint: "vertex_main",
	},
	fragment: {
		module: shaderModule,
		entryPoint: "fragment_main",
		targets: [{ format }],
	},
	primitive: {
		topology: "triangle-strip",
	},
});

const bindGroup = device.createBindGroup({
	layout: pipeline.getBindGroupLayout(0),
	entries: [
		{
			binding: 0,
			resource: {
				buffer: uniformBuffer,
			},
		},
	],
});

_expose({ device, adapter, format, pipeline, bindGroup, shaderModule, uniformBuffer });

context.configure({
	device,
	format,
});

{
	let previousTimestamp = performance.now();

	const frame = (/** @type {DOMHighResTimeStamp} */ timestamp) => {

		const delta = timestamp - previousTimestamp;

		{
			const anglePerDelta = Math.PI / 180 / 10;
			if (pressedKeys.has("ArrowLeft")) cameraRotation[0] += anglePerDelta * delta;
			else if (pressedKeys.has("ArrowRight")) cameraRotation[0] -= anglePerDelta * delta;

			if (pressedKeys.has("ArrowUp")) cameraRotation[1] += anglePerDelta * delta;
			else if (pressedKeys.has("ArrowDown")) cameraRotation[1] -= anglePerDelta * delta;
		}

		{
			const speedPerDelta = .005;
			if (pressedKeys.has("q") || currentMoveDirections.has("down")) cameraPosition[2] -= speedPerDelta * delta;
			else if (pressedKeys.has("e") || currentMoveDirections.has("up")) cameraPosition[2] += speedPerDelta * delta;

			if (pressedKeys.has("w") || currentMoveDirections.has("forward")) {
				cameraPosition[0] += Math.cos(cameraRotation[0]) * speedPerDelta * delta;
				cameraPosition[1] += Math.sin(cameraRotation[0]) * speedPerDelta * delta;
			} else if (pressedKeys.has("s") || currentMoveDirections.has("backward")) {
				cameraPosition[0] -= Math.cos(cameraRotation[0]) * speedPerDelta * delta;
				cameraPosition[1] -= Math.sin(cameraRotation[0]) * speedPerDelta * delta;
			}

			if (pressedKeys.has("a") || currentMoveDirections.has("left")) {
				cameraPosition[0] -= Math.sin(cameraRotation[0]) * speedPerDelta * delta;
				cameraPosition[1] += Math.cos(cameraRotation[0]) * speedPerDelta * delta;
			} else if (pressedKeys.has("d") || currentMoveDirections.has("right")) {
				cameraPosition[0] += Math.sin(cameraRotation[0]) * speedPerDelta * delta;
				cameraPosition[1] -= Math.cos(cameraRotation[0]) * speedPerDelta * delta;
			}
		}

		{
			const buffer = mergeTypedArrays(
				new Float32Array([...cameraPosition, 0]),
				new Float32Array([...cameraRotation]),
				new Float32Array([canvas.width, canvas.height]),
				new Uint32Array([+lightTheme]),
				new Float32Array([Math.tan(fieldOfView / 2) * 2]),
				new Uint32Array([maxBounces]),
				new Uint32Array([antialiasingSamplesPerPixel]),
			);
			device.queue.writeBuffer(uniformBuffer, 0, buffer);

			const encoder = device.createCommandEncoder();
			const renderPass = encoder.beginRenderPass({
				colorAttachments: [{
					view: context.getCurrentTexture().createView(),
					loadOp: "clear",
					clearValue: [0, 0, 0, 0],
					storeOp: "store",
				}],
			});

			renderPass.setPipeline(pipeline);
			renderPass.setBindGroup(0, bindGroup);
			renderPass.draw(4);
			renderPass.end();

			device.queue.submit([encoder.finish()]);
		}

		previousTimestamp = timestamp;

		self.requestAnimationFrame(frame);
	};

	self.requestAnimationFrame(frame);
}

export { };

import(URL.createObjectURL(new Blob([
	`//# sourceMappingURL=data:application/json,${self.encodeURIComponent(JSON.stringify({
		version: 3, mappings: "", sources: [shaderPath]
	}))}`
], { type: "text/javascript;charset=utf-8" })));

