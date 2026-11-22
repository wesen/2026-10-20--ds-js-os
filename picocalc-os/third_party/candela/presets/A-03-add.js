import { scene, shape, material, bsdf, light, camera, units as u } from 'candela';

const diffuse = bsdf.lambert(0.7);

export default scene()
  .add(shape.sphere(0.45).at(-1.05, 0.45, 0).material(material(bsdf.add(diffuse.scale(0.5), bsdf.conductor.schlick({ f0: 0.5, roughness: 0.2 }).scale(0.5)))))
  .add(shape.sphere(0.45).at(0, 0.45, 0).material(material(bsdf.add(diffuse, bsdf.conductor.schlick({ f0: 0.7, roughness: 0.2 })))))   // W420
  .add(shape.sphere(0.45).at(1.05, 0.45, 0).material(material(bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: 0.2 }), diffuse))))
  .add(shape.plane(30).material(material.pbr().baseColor(0.5)))
  .light(light.env.uniform(u.nit(100)))
  .camera(camera.thinLens().at(0, 0.9, 3.6).lookAt(0, 0.45, 0).focal(u.mm(45)));
