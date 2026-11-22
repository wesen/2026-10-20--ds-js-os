import { scene, shape, material, light, camera, units as u } from 'candela';

const patches = [
  '#735244', '#c29682', '#627a9d', '#576c43', '#8580b1', '#67bdaa',
  '#d67e2c', '#505ba6', '#c15a63', '#5e3c6c', '#9dbc40', '#e0a32e',
  '#383d96', '#469449', '#af363c', '#e7c71f', '#bb5695', '#0885a1',
  '#f3f3f2', '#c8c8c8', '#a0a0a0', '#7a7a79', '#555555', '#343434',
];
const S = 0.1, G = 0.012;
const chart = scene.group(patches.map((c, i) => shape.box(S, S, 0.004).at((i % 6 - 2.5) * (S + G), (1.5 - Math.floor(i / 6)) * (S + G), 0.003)
  .material(material.pbr().baseColor(c).roughness(0.85).unchecked('W330'))));

export default scene()
  .add(scene.group([shape.box(6 * (S + G) + G, 4 * (S + G) + G, 0.004).material(material.pbr().baseColor(0.035).roughness(0.9)), chart]).at(0, 0.5, 0).rotateX(u.deg(-12)))
  .add(shape.plane().material(material.pbr().baseColor('#6a6a5a').roughness(0.9)))
  .light(light.sun().elevation(u.deg(50)).azimuth(u.deg(160)))
  .light(light.sky.physical({ turbidity: 2.5 }).fromSun())
  .camera(camera.thinLens().at(0, 0.62, 1.3).lookAt(0, 0.5, 0).focal(u.mm(60)).fstop(8).shutter(1 / 250).iso(100));
