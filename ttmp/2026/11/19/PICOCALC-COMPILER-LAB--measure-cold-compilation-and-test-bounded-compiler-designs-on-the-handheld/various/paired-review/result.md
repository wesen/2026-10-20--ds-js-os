# Can a researcher predict what two compiler changes will do together?

Opus High and Sol High received the same unchanged first-boot evidence from a completed PicoCalc experiment. Neither saw the combined configuration on either boot. The supervisor knew the published study. This was a retrospective forecast masked from the two respondents. The protocol, estimates and grading program were committed before scoring.

## The numerical result

Six forecasts cover the change in cold compiler time and peak compiler heap for three applications. The table gives mean absolute errors in percentage points. A prediction of a 2% time saving when the actual saving is 3.5% has an error of 1.5 percentage points. Each app and metric has equal weight.

| Respondent or rule | Time | Heap | Overall | Directions correct |
| --- | ---: | ---: | ---: | ---: |
| Opus 5.5 High | 1.31 | 0.69 | 1.00 | 6/6 |
| GPT‑6.2 Sol High | 1.36 | 0.89 | 1.13 | 6/6 |
| Add the two isolated changes | 1.39 | 0.96 | 1.17 | 6/6 |
| Predict zero change | 2.08 | 2.91 | 2.49 | 0/6 |

For the largest application, Editor, the compiler's peak heap changed by −0.20%. Sol predicted −1.74% and Opus predicted −0.90%. The arithmetic rule predicted −1.96%. For Agenda the change was +3.19%, which Sol predicted closely at +3.20%. Both overestimated Agenda's compile-time saving by more than 1.8 percentage points. An exact arithmetic expectation for the joint result cannot be obtained from the supplied marginal medians.

## What each researcher contributed

Opus translated word counts into a falsifiable allocation observation. At 1,024 words per chunk, Editor needs 22 chunks before fusion and 21 after fusion. Files still needs one and Agenda still needs four. The arithmetic shows how many payload bytes can change in this representation. Peak heap depends on what else is live when those chunks exist. Opus also hypothesized about fixed implementation overhead. The given data do not identify that cost. A peak after emission can still include objects allocated during emission.

Sol proposed identifying each live allocation by allocation site and measuring the interaction within each compiler phase. This would separate output-buffer savings from extra live data originating before emission. An allocation trace should include objects carried across phase boundaries. Sol's point estimate for Editor was farther away from the board while its proposed measurement made fewer causal assumptions.

One board experiment, one interaction, one answer per model, and six correlated outcomes support a narrow numerical verdict. The improvement of either model over a simple additive baseline was small. For future design reviews, independent written predictions and a separate discussion of disconfirming evidence are worth preserving.

[Shared question](question.txt) · [Scoring protocol](protocol.md) · [Sol response](sol.json) · [Opus response](opus.json) · [Exact scores](scores.json)
