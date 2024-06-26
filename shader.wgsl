
alias Color = vec3<f32>;

const PI = radians(180);
const TAU = radians(360);

alias ObjectType = u32;
const e_CAMERA: ObjectType = 0;
const e_SPHERE: ObjectType = 1;

struct GlobalState {
	camera_position: vec3<f32>,
	camera_rotation: vec2<f32>,
	canvas_dimensions: vec2<f32>,
	light_theme: u32,
	fov_scale: f32,
	max_bounces: u32,
	antialiasing_samples: u32,
}

struct VertexOutput {
	@builtin(position) position: vec4<f32>,
	@location(0) fragment_position: vec2<f32>,
}

struct Ray {
	origin: vec3<f32>,
	dir: vec3<f32>,
}

struct ObjectInfo {
	object_type: ObjectType,
	index: u32,
}

struct RayInfo {
	ray: Ray,
	source_object: ObjectInfo,
}

struct Sphere {
	position: vec3<f32>,
	radius: f32,
	color: vec3<f32>,
}

struct HitInfo {
	distance: f32,
	position: vec3<f32>,
	normal_vector: vec3<f32>,
	did_hit: bool,
	color: vec3<f32>,
}

const BINDING_GLOBAL_STATE: u32 = 0;
const BINDING_SPHERES: u32 = 1;
const BINDING_PHOTO_SPHERE: u32 = 2;

@group(0) @binding(BINDING_GLOBAL_STATE) var<uniform> global_state: GlobalState;
@group(0) @binding(BINDING_SPHERES) var<storage> spheres: array<Sphere>;

@group(0) @binding(BINDING_PHOTO_SPHERE) var photo_sphere: texture_2d<f32>;

const white = Color(1.0, 1.0, 1.0);
const black = Color(0.0, 0.0, 0.0);
const floor_height: f32 = 0.0;
const sky_color = Color(0.4, 0.6, 1.0);

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
	let position2d: vec2<f32> = (array<vec2<f32>, 4>(
		vec2<f32>(1.0, -1.0),
		vec2<f32>(1.0, 1.0),
		vec2<f32>(-1.0, -1.0),
		vec2<f32>(-1.0, 1.0),
	))[vertex_index];
	var output = VertexOutput(
		vec4<f32>(position2d, 0.0, 1.0),
		position2d,
	);
	return output;
}

fn get_camera_ray_direction(rotation: vec2<f32>, pixel_position: vec2<f32>) -> vec3<f32> {
	let sin_rot_azimuth: f32 = sin(rotation.x);
	let cos_rot_azimuth: f32 = cos(rotation.x);
	let sin_rot_elevation: f32 = sin(rotation.y);
	let cos_rot_elevation: f32 = cos(rotation.y);

	let main_camera_vector: vec3<f32> = vec3<f32>(
		cos_rot_azimuth * cos_rot_elevation,
		sin_rot_azimuth * cos_rot_elevation,
		sin_rot_elevation,
	);

	let horizontal_vector_component: vec3<f32> = vec3<f32>(
		sin_rot_azimuth,
		-cos_rot_azimuth,
		0.0,
	) * pixel_position.x * global_state.fov_scale * (global_state.canvas_dimensions.x / global_state.canvas_dimensions.y);

	let vertical_vector_component: vec3<f32> = vec3<f32>(
		-cos_rot_azimuth * sin_rot_elevation,
		-sin_rot_azimuth * sin_rot_elevation,
		cos_rot_elevation,
	) * pixel_position.y * global_state.fov_scale;

	return normalize(main_camera_vector + horizontal_vector_component + vertical_vector_component);
}

fn ray_hits_sphere(ray: Ray, sphere: Sphere) -> HitInfo {
	let relative_ray_origin = ray.origin - sphere.position;
	let a: f32 = dot(ray.dir, ray.dir);
	let b: f32 = 2 * dot(relative_ray_origin, ray.dir);
	let c: f32 = dot(relative_ray_origin, relative_ray_origin) - sphere.radius * sphere.radius;
	let discriminant: f32 = b * b - 4 * a * c;

	if discriminant >= 0 {
		let distance: f32 = (-b - sqrt(discriminant)) / (2 * a);
		if distance >= 0 {
			let intersection_point: vec3<f32> = ray.origin + distance * ray.dir;
			let normal_vector: vec3<f32> = normalize(intersection_point - sphere.position);
			return HitInfo(distance, intersection_point, normal_vector, true, sphere.color);
		}
	}
	{
		var hit_info = HitInfo();
		hit_info.did_hit = false;
		return hit_info;
	}
}

fn photo_sphere_pixel_from_direction(texture: texture_2d<f32>, direction: vec3<f32>) -> Color {
	// https://en.wikipedia.org/wiki/UV_mapping#Finding_UV_on_a_sphere
	let coordinates: vec2<f32> = vec2<f32>(
		0.5 + (atan2(direction.x, direction.y) / TAU),
		0.5 + (asin(direction.z) / PI),
	);
	return textureLoad(texture, vec2<u32>(coordinates * vec2<f32>(textureDimensions(texture, 0))), 0).rgb;
}

fn trace_ray(ray: Ray) -> Color {
	var current_ray_info = RayInfo(ray, ObjectInfo(e_CAMERA, 0));
	var color = Color(1.0, 1.0, 1.0);
	for (var bounce_iteration: u32 = 0; bounce_iteration < global_state.max_bounces; bounce_iteration++) {
		let current_ray = current_ray_info.ray;
		var closest_hit = HitInfo();
		closest_hit.did_hit = false;

		var object_info: ObjectInfo;
		var current_color: vec3<f32>;

		for (var i: u32 = 0; i < arrayLength(&spheres); i++) {
			if current_ray_info.source_object.object_type == e_SPHERE && current_ray_info.source_object.index == i { continue; }
			let sphere = spheres[i];
			let hit_info = ray_hits_sphere(current_ray, sphere);
			if hit_info.did_hit && (!closest_hit.did_hit || hit_info.distance < closest_hit.distance) {
				closest_hit = hit_info;
				object_info = ObjectInfo(e_SPHERE, i);
				current_color = sphere.color;
			}
		}

		if (closest_hit.did_hit) {
			let specular_ray: Ray = Ray(closest_hit.position, reflect(current_ray.dir, closest_hit.normal_vector));
			current_ray_info = RayInfo(specular_ray, object_info);
			color *= current_color;
		} else {
			let floorDistance: f32 = (floor_height - current_ray.origin.z) / current_ray.dir.z;
			let photo_sphere_pixel = photo_sphere_pixel_from_direction(photo_sphere, current_ray.dir);
			if (floorDistance > 0) {
				let intersection_point: vec3<f32> = current_ray.origin + floorDistance * current_ray.dir;
				if bool((i32(floor(intersection_point.x)) + i32(floor(intersection_point.y))) % 2) {
					var factor: f32 = exp2(-distance(intersection_point.xy, global_state.camera_position.xy) / 50.0);
					return color * mix(photo_sphere_pixel, white, factor);
				}
			}

			return color * photo_sphere_pixel;
		}
	}
	return color * sky_color;
}


@fragment
fn fragment_main(@location(0) fragment_position: vec2<f32>, @builtin(sample_index) sample_index: u32) -> @location(0) vec4<f32> {
	let antialiasing_samples: u32 = global_state.antialiasing_samples;
	var summed_color = Color(0.0, 0.0, 0.0);

	for (var antialiasing_row: u32 = 0; antialiasing_row < antialiasing_samples; antialiasing_row++) {
		for (var antialiasing_column: u32 = 0; antialiasing_column < antialiasing_samples; antialiasing_column++) {
			let antialiasing_offset = vec2<f32>(
				f32(antialiasing_column) / f32(antialiasing_samples) / (global_state.canvas_dimensions.x / 2.0),
				f32(antialiasing_row) / f32(antialiasing_samples) / (global_state.canvas_dimensions.y / 2.0),
			);
			let ray = Ray(
				global_state.camera_position,
				get_camera_ray_direction(global_state.camera_rotation, fragment_position + antialiasing_offset),
			);

			let color = trace_ray(ray);
			summed_color += color;
		}
	}

	return vec4<f32>(summed_color / f32(antialiasing_samples * antialiasing_samples), 1.0);
}

