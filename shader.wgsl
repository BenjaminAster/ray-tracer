
struct Uniforms {
	camera_position: vec3<f32>,
	camera_rotation: vec2<f32>,
	aspect_ratio: f32,
}

struct VertexOutput {
	@builtin(position) position: vec4<f32>,
	@location(0) fragment_position: vec2<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const fov_scale: f32 = 0.5;
const sphere_position: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
	var output: VertexOutput;
	var positions: array<vec2<f32>, 4> = array<vec2<f32>, 4>(
		vec2<f32>(1.0, -1.0),
		vec2<f32>(1.0, 1.0),
		vec2<f32>(-1.0, -1.0),
		vec2<f32>(-1.0, 1.0),
	);
	let position2d: vec2<f32> = positions[vertex_index];
	output.position = vec4<f32>(position2d, 0.0, 1.0);
	output.fragment_position = position2d;
	return output;
}

@fragment
fn fragment_main(@location(0) fragment_position: vec2<f32>) -> @location(0) vec4<f32> {
	let sin_rot_azimuth: f32 = sin(uniforms.camera_rotation.x);
	let cos_rot_azimuth: f32 = cos(uniforms.camera_rotation.x);
	let sin_rot_elevation: f32 = sin(uniforms.camera_rotation.y);
	let cos_rot_elevation: f32 = cos(uniforms.camera_rotation.y);

	let main_camera_vector: vec3<f32> = vec3<f32>(
		cos_rot_azimuth * cos_rot_elevation,
		sin_rot_azimuth * cos_rot_elevation,
		sin_rot_elevation,
	);

	let horizontal_vector_component: vec3<f32> = vec3<f32>(
		sin_rot_azimuth,
		-cos_rot_azimuth,
		0.0,
	) * fragment_position.x * uniforms.aspect_ratio * fov_scale;

	let vertical_vector_component: vec3<f32> = vec3<f32>(
		-cos_rot_azimuth * sin_rot_elevation,
		-sin_rot_azimuth * sin_rot_elevation,
		cos_rot_elevation,
	) * fragment_position.y * fov_scale;

	let ray: vec3<f32> = main_camera_vector + horizontal_vector_component + vertical_vector_component;
	let cam: vec3<f32> = uniforms.camera_position;

	let a: f32 = ray.x * ray.x + ray.y * ray.y + ray.z * ray.z;
	let b: f32 = 2 * cam.x * ray.x + 2 * cam.y * ray.y + 2 * cam.z * ray.z;
	let c: f32 = cam.x * cam.x + cam.y * cam.y + cam.z * cam.z - 1;
	let discriminant: f32 = b * b - 4 * a * c;

	if (discriminant > 0) {
		return vec4<f32>(1.0, 1.0, 1.0, 1.0);
	} else {
		return vec4<f32>(0.0, 0.0, 0.0, 1.0);
	}
}

