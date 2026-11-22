# Instructions for graders (round 2)

You grade quiz answers written by student readers of a teaching article and condense their written feedback. All paths below are under
`/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--a-special-issue-on-compiler-design-for-the-picocalc-analysis-code-generation-isolation-and-types`.

For an article numbered NN (two digits):

- The article as the students read it: `issue-round2/NN-*.md`
- The answer key and scoring rule: `quizzes/answer-key-round2.md` (section "Article N")
- Answers written BEFORE reading (students saw only the questions): `students/round2/aNN-pre/s1/answers.md`, `.../s2/...`, `.../s3/...`
- Answers written AFTER reading: `students/round2/aNN-post/s1/answers.md`, s2, s3
- The glossary the post-reading students were also given: `issue/11-glossary.md`
- Feedback written after reading: `students/round2/aNN-post/s1/feedback.md`, s2, s3

## Output 1: grades

Write `students/round2/grades/aNN.json`: a JSON list with one object per answer (2 conditions x 3 students x 6 questions = 36 objects):

    {"article": "NN", "condition": "pre" or "post", "student": "s1", "question": 1, "score": 0, "note": "why, in at most 20 words"}

Score 0, 1 or 2 exactly as the key's scoring rule says. Grade what is written, in any wording. For a "pre" answer that says it cannot know
and then guesses, grade the guess. Do not reward length. If the key itself is wrong or the question is ambiguous, still grade against the
key and say so in the note and in the synthesis.

## Output 2: synthesis

Write `students/round2/synthesis/aNN.md`, at most 700 words, with these sections. Be concrete: quote the article's words so the editor
can find the place, and say how many of the three students raised each point.

1. **Errors and inconsistencies in the article**: anything a student showed to be wrong, contradictory or arithmetically off. Check each
   yourself against the article before listing it. This section matters most.
2. **Terms to define**: each term flagged as unexplained, with the count of students and the sentence of first use.
3. **Passages to rewrite**: quote, what was unclear, count of students.
4. **Claims without support**: split into (a) claims the article should support or soften, (b) claims that rest on another article of the
   series or on the project's records, where a pointer would suffice.
5. **Section scores**: a table of the three students' scores per numbered section.
6. **Quiz diagnosis**: for each of the six questions, the three post-reading scores and the three pre-reading scores; where a
   post-reading score is below 2, what in the article caused it; flag questions that were answered correctly before reading (they do not
   test the article) and questions that are ambiguous or whose key is doubtful.
7. **Add and cut**: the students' suggestions, merged.

Do not modify any other file. Reply with a five-line summary: mean pre and post score per article out of 12, and the two most important
problems found in each article.

## Round 2 additions

This is the second round. The articles were revised after round 1 and many questions were replaced by questions meant to require the
article. In the synthesis, section 6, say for each question whether it was answerable before reading (pre mean of 1.5 or more). In
section 1, check every reported error against the article yourself and list only those you confirm. Keep sections 2 to 4 to the points
raised by at least two students, plus anything you judge a real defect.
