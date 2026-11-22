import { scene, shape, material, light, camera, medium, phase, fx, units as u } from 'candela';

const vol = (x, g) => medium.heterogeneous({
  density: fx.field(p => 6), bounds: shape.box(0.8, 1.2, 0.8).at(x, 0.65, 0), albedo: 0.95, phase: phase.hg(g),
});

export default scene()
  .medium(vol(-1.1, -0.6), vol(0, 0), vol(1.1, 0.8))
  .add(shape.rect(3, 0.8).at(0, 1.4, -1.8).facing(0, 0.65, 0).emit(light.area().power(u.lm(20000)).temperature(u.K(5500))))
  .add(shape.plane(30).material(material.pbr().baseColor(0.15).roughness(0.9)))
  .light(light.env.uniform(u.nit(2)))
  .camera(camera.thinLens().at(0, 1.0, 3.6).lookAt(0, 0.65, 0).focal(u.mm(35)));
