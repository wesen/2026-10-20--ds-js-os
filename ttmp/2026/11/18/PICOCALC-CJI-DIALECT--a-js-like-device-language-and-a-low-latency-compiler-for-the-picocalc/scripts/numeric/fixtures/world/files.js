// Drive listing and scrolling against a deterministic filesystem and free size.
hw.fs = (claim) => {
  if (claim !== 'fs:/') throw new Error('unexpected claim');
  return {
    info: () => ({ free: 1572864 }),
    list: (path) => {
      const root /*: Any[] */ = [
        { dir: false, name: 'z.txt', size: 1536, more: false },
        { dir: true, name: 'notes', size: 0, more: false },
        { dir: false, name: 'a.txt', size: 5, more: false },
      ];
      const folder /*: Any[] */ = [{ dir: false, name: 'todo.txt', size: 7, more: false }];
      return path === '' ? root : folder;
    },
  };
};
$start();
console.log('order', $S.items.map((e) => e.name).join(','), $S.sel, fiSize($S.free));
$key('pgdn');
console.log('last', $S.items[$S.sel].name, fiSize($S.items[$S.sel].size));
$key('pgup');
$key('enter');
console.log('folder', $S.path, $S.items[$S.sel].name);
$key('backspace');
console.log('back', $S.path === '', $S.items[$S.sel].name);
