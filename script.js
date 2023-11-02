

/// <reference types="better-typescript" />
/// <reference types="@webgpu/types" />

const canvas = document.querySelector("canvas");

canvas.width = canvas.clientWidth * window.devicePixelRatio;
canvas.height = canvas.clientHeight * window.devicePixelRatio;

const offscreenCanvas = canvas.transferControlToOffscreen();

const worker = new Worker(import.meta.resolve("./worker.js"), { type: "module" });

worker.addEventListener("message", (event) => {
	if (event.data.type === "webgpu-unsupported") {
		document.querySelector("#webgpu-unsupported").hidden = false;
	}
});

worker.postMessage({ type: "initialize", canvas: offscreenCanvas, pixelRatio: window.devicePixelRatio }, { transfer: [offscreenCanvas] });

{
	{
		const keyToDirectionMapping = {
			q: "down",
			e: "up",
			w: "forward",
			s: "backward",
			a: "left",
			d: "right",
		};
		window.addEventListener("keydown", (event) => {
			const direction = keyToDirectionMapping[event.key];
			if (direction) {
				worker.postMessage({ type: "start-moving", direction });
				const button = document.querySelector(`button#move-${direction}`);
				button.classList.add("active");
			} else {
				worker.postMessage({ type: "keydown", key: event.key });
			}
		});
		window.addEventListener("keyup", (event) => {
			const direction = keyToDirectionMapping[event.key];
			if (direction) {
				worker.postMessage({ type: "stop-moving", direction });
				const button = document.querySelector(`button#move-${direction}`);
				button.classList.remove("active");
			} else {
				worker.postMessage({ type: "keyup", key: event.key });
			}
		});

		for (const direction of Object.values(keyToDirectionMapping)) {
			const button = document.querySelector(`button#move-${direction}`);
			button.addEventListener("pointerdown", () => {
				worker.postMessage({ type: "start-moving", direction });
				button.classList.add("active");
			});
			const onPointerUp = () => {
				worker.postMessage({ type: "stop-moving", direction })
				button.classList.remove("active");
			};
			button.addEventListener("pointerleave", onPointerUp)
			button.addEventListener("pointerup", onPointerUp)
		}
	}

	{
		{
			let mouseDown = false;
			canvas.addEventListener("mousedown", (event) => {
				if (event.buttons & 0b001) {
					document.documentElement.style.setProperty("--cursor", "move");
					mouseDown = true;
				}
			});
			window.addEventListener("mousemove", (event) => {
				if (mouseDown) {
					worker.postMessage({ type: "pointer-moved", x: event.movementX, y: event.movementY });
				}
			});
			window.addEventListener("mouseup", (event) => {
				document.documentElement.style.removeProperty("--cursor");
				mouseDown = false;
			});
		}

		{
			let prevTouchX = 0;
			let prevTouchY = 0;
			window.addEventListener("touchstart", (event) => {
				if (event.touches.length === 1) {
					prevTouchX = event.touches[0].clientX;
					prevTouchY = event.touches[0].clientY;
				}
			});
			canvas.addEventListener("touchmove", (event) => {
				if (event.touches.length === 1) {
					event.preventDefault();
					let x = event.touches[0].clientX;
					let y = event.touches[0].clientY;
					worker.postMessage({ type: "pointer-moved", x: x - prevTouchX, y: y - prevTouchY });
					prevTouchX = event.touches[0].clientX;
					prevTouchY = event.touches[0].clientY;
				}
			}, { passive: false });
		}
	}

}

{
	let lightTheme = false;
	const query = window.matchMedia("(prefers-color-scheme: light)");
	const update = () => {
		lightTheme = query.matches;
		worker.postMessage({
			type: "set-theme",
			lightTheme,
		});
	};
	query.addEventListener("change", update);
	update();
}

{
	let maxBounces = 5;
	const rangeInput = document.querySelector("input[type=range]#max-bounces-slider");
	rangeInput.valueAsNumber = maxBounces;
	const updateMaxBounces = () => {
		document.querySelector("#max-bounces").textContent = (maxBounces = rangeInput.valueAsNumber).toString().padEnd(2);
		worker.postMessage({ type: "set-max-bounces", maxBounces });
	}
	rangeInput.addEventListener("input", updateMaxBounces);
	updateMaxBounces();
}

{
	let antialiasingSamplesPerPixel = 2;
	const rangeInput = document.querySelector("input[type=range]#antialiasing-samples-per-pixel-slider");
	rangeInput.valueAsNumber = antialiasingSamplesPerPixel;
	const updateMaxBounces = () => {
		document.querySelector("#antialiasing-samples-per-pixel").textContent = ((antialiasingSamplesPerPixel = rangeInput.valueAsNumber) ** 2).toString().padEnd(2);
		worker.postMessage({ type: "set-antialiasing-samples-per-pixel", antialiasingSamplesPerPixel });
	}
	rangeInput.addEventListener("input", updateMaxBounces);
	updateMaxBounces();
}

{
	let fieldOfView = 50;
	const rangeInput = document.querySelector("input[type=range]#field-of-view-slider");
	rangeInput.valueAsNumber = fieldOfView;
	const updateMaxBounces = () => {
		document.querySelector("#field-of-view").textContent = ((fieldOfView = rangeInput.valueAsNumber).toString() + "°").padEnd(4);
		worker.postMessage({ type: "set-field-of-view", fieldOfView: fieldOfView * Math.PI / 180 });
	}
	rangeInput.addEventListener("input", updateMaxBounces);
	updateMaxBounces();
}

{
	let blur = 1;

	const resize = () => {
		worker.postMessage({
			type: "resize",
			width: canvas.clientWidth * window.devicePixelRatio / blur,
			height: canvas.clientHeight * window.devicePixelRatio / blur,
			pixelRatio: window.devicePixelRatio / blur
		});
	};
	window.addEventListener("resize", resize);

	const rangeInput = document.querySelector("input[type=range]#resolution-slider");
	rangeInput.valueAsNumber = blur;
	const updateResolution = () => {
		document.querySelector("#resolution").textContent = ((blur = rangeInput.valueAsNumber) ** 2).toString().padEnd(3);
		resize();
	}
	rangeInput.addEventListener("input", updateResolution);
	updateResolution();
}

export { };
