
alias float2 = vec2<f32>;
alias float3 = vec3<f32>;
alias float4 = vec4<f32>;

struct Uniforms {
	camera_position: float3,
	camera_rotation: float2,
	canvas_dimensions: float2,
	light_theme: u32,
	fov_scale: f32,
}

struct VertexOutput {
	@builtin(position) position: float4,
	@location(0) fragment_position: float2,
}

struct Ray {
	origin: float3,
	dir: float3,
}

struct Sphere {
	position: float3,
	radius: f32,
	color: float3,
}

struct HitInfo {
	distance: f32,
	position: float3,
	did_hit: bool,
	color: float3,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const white: float3 = float3(1.0, 1.0, 1.0);
const black: float3 = float3(0.0, 0.0, 0.0);
const spheres = array<Sphere, 6>(
	Sphere(float3(0.0, 0.0, 3.0), 1.0, float3(1.0, 0.0, 0.0)),
	Sphere(float3(2.0, 2.0, 3.0), 0.6, float3(0.0, 1.0, 0.0)),
	Sphere(float3(2.0, -2.0, 4.0), 1.5, float3(0.0, 0.0, 1.0)),
	Sphere(float3(-1.0, 0.0, 5.0), 1.1, float3(1.0, 1.0, 0.0)),
	Sphere(float3(2.0, 1.0, 5.0), 0.8, float3(0.0, 1.0, 1.0)),
	Sphere(float3(2.0, -1.0, 1.0), 0.9, float3(1.0, 0.0, 1.0)),
);
const floor_height = 0.0;
const antialiasing_samples = 2;

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
	let position2d: float2 = (array<float2, 4>(
		float2(1.0, -1.0),
		float2(1.0, 1.0),
		float2(-1.0, -1.0),
		float2(-1.0, 1.0),
	))[vertex_index];
	var output = VertexOutput(
		float4(position2d, 0.0, 1.0),
		position2d,
	);
	return output;
}

fn get_camera_ray_direction(rotation: float2, pixel_position: float2) -> float3 {
	let sin_rot_azimuth: f32 = sin(rotation.x);
	let cos_rot_azimuth: f32 = cos(rotation.x);
	let sin_rot_elevation: f32 = sin(rotation.y);
	let cos_rot_elevation: f32 = cos(rotation.y);

	let main_camera_vector: float3 = float3(
		cos_rot_azimuth * cos_rot_elevation,
		sin_rot_azimuth * cos_rot_elevation,
		sin_rot_elevation,
	);

	let horizontal_vector_component: float3 = float3(
		sin_rot_azimuth,
		-cos_rot_azimuth,
		0.0,
	) * pixel_position.x * uniforms.fov_scale * (uniforms.canvas_dimensions.x / uniforms.canvas_dimensions.y);

	let vertical_vector_component: float3 = float3(
		-cos_rot_azimuth * sin_rot_elevation,
		-sin_rot_azimuth * sin_rot_elevation,
		cos_rot_elevation,
	) * pixel_position.y * uniforms.fov_scale;

	return normalize(main_camera_vector + horizontal_vector_component + vertical_vector_component);
}

fn fade_color(color: float3, distance: f32) -> float3 {
	var factor: f32 = pow(0.9, distance);
	return mix(select(black, white, bool(uniforms.light_theme)), color, factor);
}

@fragment
fn fragment_main(@location(0) fragment_position: float2) -> @location(0) float4 {

	var pixel_colors: array<float3, antialiasing_samples * antialiasing_samples>;

	for (var antialiasing_row = 0; antialiasing_row < antialiasing_samples; antialiasing_row++) {
		for (var antialiasing_column = 0; antialiasing_column < antialiasing_samples; antialiasing_column++) {
			var antialiasing_offset = float2(
				f32(antialiasing_row) / antialiasing_samples / (uniforms.canvas_dimensions.x / 2.0),
				f32(antialiasing_column) / antialiasing_samples / (uniforms.canvas_dimensions.y / 2.0),
			);
			var ray = Ray(
				uniforms.camera_position,
				get_camera_ray_direction(uniforms.camera_rotation, fragment_position + antialiasing_offset),
			);

			var closest_hit: HitInfo;
			closest_hit.did_hit = false;

			for (var i = 0; i < 6; i++) {
				let sphere = spheres[i];
				let relative_ray_origin = ray.origin - sphere.position;
				let a: f32 = dot(ray.dir, ray.dir);
				let b: f32 = 2 * dot(relative_ray_origin, ray.dir);
				let c: f32 = dot(relative_ray_origin, relative_ray_origin) - sphere.radius * sphere.radius;
				let discriminant: f32 = b * b - 4 * a * c;

				if discriminant >= 0 {
					let distance: f32 = (-b - sqrt(discriminant)) / (2 * a);
					if distance >= 0 {
						if !closest_hit.did_hit || bool(distance < closest_hit.distance) {
							let intersection_point: float3 = ray.origin + distance * ray.dir;
							closest_hit = HitInfo(distance, intersection_point, true, sphere.color);
						}
					}
				}
			}

			var antialiasing_color: float3;

			if (closest_hit.did_hit) {
				var color: float3 = fade_color(closest_hit.color, closest_hit.distance);
				antialiasing_color = color;
			} else {
				let floorDistance: f32 = (floor_height - ray.origin.z) / ray.dir.z;
				if (floorDistance > 0) {
					let intersection_point: float3 = ray.origin + floorDistance * ray.dir;
					var color: float3 = fade_color(select(black, white, bool((i32(floor(intersection_point.x)) + i32(floor(intersection_point.y))) % 2)), floorDistance);
					antialiasing_color = color;
				} else {
					antialiasing_color = select(black, white, bool(uniforms.light_theme));
				}
			}
			pixel_colors[antialiasing_row * antialiasing_samples + antialiasing_column] = antialiasing_color;
		}
	}

	{
		var pixel_colors_sum: float3;
		for (var i = 0; i < antialiasing_samples * antialiasing_samples; i++) {
			pixel_colors_sum += pixel_colors[i];
		}
		return float4(pixel_colors_sum / (antialiasing_samples * antialiasing_samples), 1.0);
	}
}

