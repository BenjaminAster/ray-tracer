
/// <reference no-default-lib="true" />
/// <reference types="better-typescript/worker" />
/// <reference types="@webgpu/types" />

const _expose = (objects) => {
	for (const [name, value] of Object.entries(objects)) {
		globalThis[name] = value;
	}
}

let /** @type {OffscreenCanvas} */ canvas;
let /** @type {Set<string>} */ pressedKeys = new Set();
let lightTheme = false;

await new Promise((resolve) => self.addEventListener("message", ({ data }) => {
	$switch: switch (data.type) {
		case ("initialize"): {
			canvas = data.canvas;
			resolve();
			break $switch;
		}
		case ("resize"): {
			canvas.width = data.width;
			canvas.height = data.height;
			break $switch;
		}
		case ("keydown"): {
			pressedKeys.add(data.key);
			break $switch;
		}
		case ("keyup"): {
			pressedKeys.delete(data.key);
			break $switch;
		}
		case ("set-theme"): {
			lightTheme = data.lightTheme;
			break $switch;
		}
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

const structBufferSize = (/** @type {number[]} */ ...sizes) => {
	sizes = sizes.map(size => 2 ** (Math.ceil(Math.log2(size))));
	let size = sizes.reduce((prev, next) => prev + next, 0);
	let maxSize = Math.max(...sizes);
	return Math.ceil(size / maxSize) * maxSize;
}

const uniformBufferSize = structBufferSize(
	4 * Float32Array.BYTES_PER_ELEMENT, // camera: vec3<f32>
	2 * Float32Array.BYTES_PER_ELEMENT, // rotation: vec2<f32>
	2 * Float32Array.BYTES_PER_ELEMENT, // canvas_dimensions: vec2<f32>
	1 * Uint32Array.BYTES_PER_ELEMENT, // light_theme: u32
	1 * Float32Array.BYTES_PER_ELEMENT, // fov_scale: f32
);

const uniformBuffer = device.createBuffer({
	size: uniformBufferSize,
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
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

_expose({ device, adapter, format, pipeline, bindGroup, shaderModule });

context.configure({
	device,
	format,
});

let /** @type {Tuple<number, 3>} */ cameraPosition = [-4, 0, 4];
let /** @type {Tuple<number, 2>} */ cameraRotation = [0, 0];
let fov_scale = 0.5;

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
			if (pressedKeys.has("q")) cameraPosition[2] += speedPerDelta * delta;
			else if (pressedKeys.has("e")) cameraPosition[2] -= speedPerDelta * delta;

			if (pressedKeys.has("w")) {
				cameraPosition[0] += Math.cos(cameraRotation[0]) * speedPerDelta * delta;
				cameraPosition[1] += Math.sin(cameraRotation[0]) * speedPerDelta * delta;
			} else if (pressedKeys.has("s")) {
				cameraPosition[0] -= Math.cos(cameraRotation[0]) * speedPerDelta * delta;
				cameraPosition[1] -= Math.sin(cameraRotation[0]) * speedPerDelta * delta;
			}

			if (pressedKeys.has("a")) {
				cameraPosition[0] -= Math.sin(cameraRotation[0]) * speedPerDelta * delta;
				cameraPosition[1] += Math.cos(cameraRotation[0]) * speedPerDelta * delta;
			} else if (pressedKeys.has("d")) {
				cameraPosition[0] += Math.sin(cameraRotation[0]) * speedPerDelta * delta;
				cameraPosition[1] -= Math.cos(cameraRotation[0]) * speedPerDelta * delta;
			}
		}

		{
			const arrayBuffer = new ArrayBuffer(uniformBufferSize);
			new Float32Array(arrayBuffer, 0).set([
				...[...cameraPosition, 0],
				...cameraRotation,
				...[canvas.width, canvas.height],
				+lightTheme,
				fov_scale,
			]);
			device.queue.writeBuffer(uniformBuffer, 0, arrayBuffer);

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

