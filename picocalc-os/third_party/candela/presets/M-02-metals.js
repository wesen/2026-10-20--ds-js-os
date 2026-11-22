import { scene, shape, material, light, camera, units as u } from 'candela';

const metals = ['Au', 'Ag', 'Cu', 'Al', 'Fe', 'Cr', 'Ti', 'Ni', 'Pt', 'brass'];
const roughness = 0.12;

export default scene()
  .add(metals.map((m, i) => shape.sphere(0.3).id('m-' + m).at((i % 5 - 2) * 0.78, 0.3, Math.floor(i / 5) * -0.9).material(material.metal(m, { roughness }))))
  .add(shape.plane(40).material(material.pbr().baseColor(0.12).roughness(0.5)))
  .light(light.env.studio({ intensity: u.nit(1000), rotate: u.deg(-15) }))
  .camera(camera.thinLens().at(0, 1.6, 4.2).lookAt(0, 0.25, -0.45).focal(u.mm(45)));
