import { scene, shape, material, light, camera, engine as E, integrator, fx, param, units as u } from 'candela';

const toon = integrator.define('toon', {
  params: { bands: param.float(3).range(2, 6) },
  kernel: ({ ray, scene }, P) => {
    const hit = scene.intersect(ray);
    const ndl = hit.N.dot(scene.sunDir).max(0);
    const band = ndl.mul(P.bands).floor().div(P.bands);
    const lit = fx.select(scene.occluded(hit.P.add(hit.Ng.mul(0.002)), scene.sunDir, 1000), 0.35, 1.0);
    const rim = hit.N.dot(ray.d.neg()).smoothstep(0.12, 0.3);                 // ink at grazing angles
    const col = hit.albedo.mul(band.mul(lit).mul(0.85).add(0.2)).mul(rim);
    return fx.select(hit.missed, fx.color('#dfe8f0'), col);
  },
});

export default scene()
  .add(shape.sphere(0.45).at(-0.6, 0.45, 0).material(material.pbr().baseColor('#e05a3c')))
  .add(shape.torus(0.32, 0.12).at(0.55, 0.4, 0.1).rotateX(u.deg(60)).material(material.pbr().baseColor('#3c8ae0')))
  .add(shape.cone(0.3, 0.7).at(0.1, 0.35, -0.8).material(material.pbr().baseColor('#f0c040')))
  .add(shape.plane(30).material(material.pbr().baseColor('#c8d8a0')))
  .light(light.sun().elevation(u.deg(45)).azimuth(u.deg(60)))
  .camera(camera.thinLens().at(0, 1.3, 3.2).lookAt(0, 0.35, 0).focal(u.mm(40)));

export const engine = E.realtime().integrator(toon()).denoise(false);
