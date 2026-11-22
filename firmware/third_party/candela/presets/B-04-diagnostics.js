import { scene, shape, material, bsdf, light, camera, fx, units as u } from 'candela';

const tooWhite = material.pbr().baseColor(1.0).roughness(0.5);                  // W330
const halfMetal = material.pbr().baseColor('#c0a060').metallic(0.5);            // W335
const tooBright = material(bsdf.add(bsdf.lambert(0.8),
                                    bsdf.conductor.schlick({ f0: 0.9, roughness: 0.2 })));   // W420

// uncomment one at a time, then Run:
// material.pbr().roughnes(0.4);
// light.point().intensity(u.lm(800));
// camera.thinLens().fstop(0.4);
// fx.pattern(p => Math.sin(p.uv.x * 10));

export default scene()
  .add(shape.sphere(0.5).at(-1.2, 0.5, 0).material(tooWhite))
  .add(shape.sphere(0.5).at(0, 0.5, 0).material(halfMetal))
  .add(shape.sphere(0.5).at(1.2, 0.5, 0).material(tooBright))
  .add(shape.plane(30).material(material.pbr().baseColor(0.3)))
  .light(light.env.studio({ intensity: u.nit(600) }))
  .camera(camera.thinLens().at(0, 1.4, 4.2).lookAt(0, 0.45, 0));
