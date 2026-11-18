// Drive the unmodified world through CJI's test prelude with a notes handle.
let contents = '# Tasks\n- [ ] Book dentist @2026-11-03 14:30 !15m\n- [ ] Charge PicoCalc\n';
clock.set = () => true;
clock.zone = () => 'UTC';
clock.wall = () => Date.UTC(2026, 10, 3, 14, 0);
hw.fs = (claim) => {
  if (claim !== 'fs:/notes') throw new Error('unexpected claim');
  return {
    read: (name) => {
      if (name !== 'todo.txt') throw new Error('unexpected read');
      return contents;
    },
    write: (name, data) => {
      if (name !== 'todo.txt') throw new Error('unexpected write');
      contents = data;
      return { bytes: data.length };
    },
  };
};
$start();
console.log('loaded', $S.tasks.length, $S.rows.length, $S.sel);
console.log('reminder', $S.rows[$S.sel].task.title, $S.rows[$S.sel].task.lead);
$key('enter');
console.log(contents);
$key('down');
console.log('next', $S.rows[$S.sel].task.title);
$key('f4');
console.log('done', $S.showDone, $S.rows.length);
