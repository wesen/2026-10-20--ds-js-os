import { scene, shape, material, light, camera, fx, param, params, units as u } from 'candela';

const P = params({ gloss: param.float(0.3).range(0, 1) });

// fx.pattern(p => (p.P.y > 0 ? 1 : 0));                         // E202
// fx.pattern(p => p.uv.x * 10);                                 // E201
// material.pbr().roughness(P.gloss * 2);                        // E203
// shape.heightfield(p => p.wo.y);                               // E207
// material.pbr().baseColor(fx.host(p => [Math.random(), 0, 0])); // E710

const jitter = scene.group(g => { for (let i = 0; i < 5; i++) g.add(shape.sphere(0.15).at((i - 2) * 0.4, 0.15 + Math.random() * 0.3, 0).material(material.pbr().baseColor('#2e6fa8').roughness(P.gloss))); });   // W501

export default scene().params(P)
  .add(jitter)
  .add(shape.plane(30).material(material.pbr().baseColor(0.45)))
  .light(light.daylight())
  .camera(camera.thinLens().at(0, 1, 3).lookAt(0, 0.3, 0).focal(u.mm(40)));
