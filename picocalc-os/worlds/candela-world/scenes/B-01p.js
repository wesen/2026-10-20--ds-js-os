// B-01p: Candela's B-01 (hello sphere) with the sphere's roughness as a dynamic parameter. B-01 itself has no
// parameter; this scene measures a slider move on the simplest preset (PICOCALC-CANDELA-WORLD acceptance).
import { scene, shape, material, light, camera, params, param, units as u } from 'candela';

const P = params({ rough: param.float(0.4).range(0.02, 1).label('Roughness') });

export default scene()
  .add(shape.sphere(1).at(0, 1, 0)
    .material(material.pbr().baseColor('#c8553d').roughness(P.rough)))
  .add(shape.plane(30)
    .material(material.pbr().baseColor(0.18)))            // an 18 % grey card
  .light(light.daylight({ elevation: u.deg(40), turbidity: 3 }))
  .camera(camera.thinLens().at(0, 1.6, 6).lookAt(0, 0.9, 0));
