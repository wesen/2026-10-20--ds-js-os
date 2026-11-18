export function* agendaLines() {
    for (const prefix of ['- ', '- [ ] ', '  - [X] ', '\u00a0- [x] ', '- [?] ', '-\t', '# ', '']) {
        for (const first of ['x', 'dentist 🦷', '', '\t', 'before\nafter']) {
            for (const date of ['', '@2026-11-03', '@2026-11-03 14:30', '@2026-11-03\u200014:30',
                '@2026-11-03 24:00', '@2026-02-30', '@2026-11-03 12:30x', '@2000-02-29 @2026-11-03',
                '@2026-11-03,', '@0096-02-29']) {
                for (const lead of ['', '!15m', '!2h', '!0d', '!0001m', '!15m !30m', '!10000m', '!9h,']) {
                    yield ([prefix + first, date, lead].join(' ').trimEnd());
                    yield (prefix + lead + ' ' + date + ' ' + first);
                }
            }
        }
    }
    for (const line of ['- ', '- [x] ', '- [ ]\n', '- a\n', '- a\r', '- a\u2028', '- a\u2029', '- x!15m', '- x@2026-11-03', '- !1h\t@2026-11-03', '- @2026-11-03\u00a0!1h']) yield (line);
}
