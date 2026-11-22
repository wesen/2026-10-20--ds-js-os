import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

const P = params({ blades: param.int(6).range(0, 12).label('Blades').static(), rot: param.angle(u.deg(0)).range(u.deg(0), u.deg(60)).label('Blade rotation').static() });
const bulbs = scene.group((g, { rng }) => {
  for (let i = 0; i < 40; i++) g.add(shape.sphere(0.04).at((rng() - 0.5) * 3.2, 0.2 + rng() * 1.6, -3 - rng() * 3)
    .material(material.emissive(['#ffd28a', '#ffb060', '#fff0d0'][i % 3], u.nit(4000))));
});

export default scene().params(P)
  .add(bulbs)
  .add(shape.sphere(0.25).at(0, 0.75, 0).material(material.metal('Au', { roughness: 0.15 })).id('ornament'))
  .add(shape.cylinder(0.3, 0.5).at(0, 0.25, 0).material(material.pbr().baseColor(0.12).roughness(0.4)))
  .light(light.env.gradient({ top: '#1a2030', bottom: '#050505', intensity: u.nit(10) }))
  .add(shape.rect(0.5, 0.5).at(0.7, 1.3, 1.0).facing(0, 0.75, 0).emit(light.area().power(u.lm(900)).temperature(u.K(3400))))
  .camera(camera.thinLens().at(0, 0.85, 1.6).lookAt(0, 0.75, 0).focal(u.mm(85)).fstop(1.4).focusOn('#ornament').blades(P.blades.value).bladeRotation(P.rot.value));
