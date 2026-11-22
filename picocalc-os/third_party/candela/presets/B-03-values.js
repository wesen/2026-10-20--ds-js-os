import { scene, shape, material, light, camera, units as u } from 'candela';

const plastic = material.pbr().roughness(0.28);
const red  = plastic.baseColor('#b3261e');
const blue = plastic.baseColor('#1e4bb3');     // plastic is unchanged

const ball = shape.sphere(0.3);                 // one geometry node, many instances

const grid = scene.group(g => {
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++)
      g.add(ball.at((i - 2) * 0.75, 0.3, (j - 2) * 0.75).material((i + j) % 2 ? red : blue));
});

export default scene()
  .add(grid)
  .add(shape.plane(40).material(material.pbr().baseColor(0.5).roughness(0.7)))
  .light(light.daylight({ elevation: u.deg(55), azimuth: u.deg(40) }))
  .camera(camera.thinLens().at(0, 3.2, 4.6).lookAt(0, 0.2, 0).focal(u.mm(40)));
