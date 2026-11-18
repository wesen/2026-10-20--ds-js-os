const rows = [
  { name: "z.txt", dir: false, size: 723 },
  { name: "b", dir: true, size: 0 },
  { name: "a", dir: true, size: 0 },
  { more: true }
];
const root = {
  list: (path) => Promise.resolve(rows),
  info: () => Promise.resolve({ free: 42 })
};
const state = { root, path: "", sel: 0, note: "", items: [], more: false, free: -1 };
async function checkFiles() {
  await fiLoad(state, "z.txt");
  const sizes = [fiSize(723), fiSize(1024), fiSize(1536), fiSize(1073741824)];
  console.log(JSON.stringify({ sizes, selected: state.items[state.sel].name,
    first: state.items[0].name, more: state.more, free: state.free }));
}
checkFiles();
