
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
	let sin_rot_x: f32 = sin(uniforms.camera_rotation.x);
	let cos_rot_x: f32 = cos(uniforms.camera_rotation.x);
	let sin_rot_y: f32 = sin(uniforms.camera_rotation.y);
	let cos_rot_y: f32 = cos(uniforms.camera_rotation.y);

	let main_camera_vector: vec3<f32> = vec3<f32>(
		sin_rot_x * cos_rot_y,
		cos_rot_x * cos_rot_y,
		sin_rot_y,
	);

	let horizontal_vector_component: vec3<f32> = vec3<f32>(
		cos_rot_x,
		sin_rot_x,
		0.0,
	) * fragment_position.x * uniforms.aspect_ratio * fov_scale;

	let vertical_vector_component: vec3<f32> = vec3<f32>(
		sin_rot_x * sin_rot_y,
		cos_rot_x * sin_rot_y,
		cos_rot_y,
	) * fragment_position.y * fov_scale;

	let ray: vec3<f32> = main_camera_vector + horizontal_vector_component + vertical_vector_component;

	

	// return vec4<f32>((fragment_position.x + 1.0) / 2.0, (fragment_position.y + 1.0) / 2.0, uniforms.aspect_ratio, uniforms.camera_position.y);
	return vec4<f32>((fragment_position.x + 1.0) / 2.0, (fragment_position.y + 1.0) / 2.0, uniforms.camera_position.y, 0.0);
	// return vec4<f32>(0.0, 0.0, uniforms.camera_rotation.y, 1.0);
	// return vec4<f32>(f32(uniforms.canvas_width) / 1000., f32(uniforms.canvas_height) / 1000., 0., 1.);

}

