---
id: G-01
title: Analytic primitives
group: Geometry
about: Sphere, box, cylinder, disk, rect and plane are intersected exactly; capsule, torus, rounded box, cone and prism are distance fields.
tries: Which of these are SDFs? Check the Shader view|Line them up by size
docs: renderer, gpu
---
# Analytic primitives

**Back row — closed forms.** Rays meet spheres, boxes, cylinders, disks, rects and planes by solving a quadratic or a slab test: exact, one step.

**Front row — distance fields.** Capsules, tori, rounded boxes, cones and prisms are signed distance functions, found by **sphere tracing**: step along the ray by the distance to the surface until it is below a tolerance. Their normals are the field's gradient.

Both kinds share one BVH and one material system, and both run on either backend.
