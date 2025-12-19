# GPT-5-mini Reasoning Effort Comparison

Test of different `reasoning.effort` levels for transcription cleaning.

## Raw Input (same for all tests)
```
"Uh, uh, in the beginning, there was a bunch of monkeys and birds, and they flew around and fought each other, and God created them, and they died."
```
(28 words, 146 chars)

---

## Results by Reasoning Effort

| Effort | Input | Output | Reasoning | Total | Words Removed |
|--------|-------|--------|-----------|-------|---------------|
| **high** | 208 | 549 | 512 | 757 | 2 |
| **medium** | 207 | 420 | 384 | 627 | 2 |
| **low** | 208 | 229 | 192 | 437 | 1 |
| **minimal** | 211 | 36 | 0 | 247 | 4 |

---

## Cleaned Output by Effort

### High (512 reasoning tokens)
```
"In the beginning, there was a bunch of monkeys and birds, and they flew around and fought each other, and God created them, and they died."
```
(26 words, 138 chars)

### Medium (384 reasoning tokens)
```
"In the beginning there was a bunch of monkeys and birds, and they flew around and fought each other, and God created them, and they died."
```
(26 words, 137 chars)

### Low (192 reasoning tokens)
```
"In the beginning, there was a bunch of monkeys and birds, and they flew around and fought each other, and God created them, and they died."
```
(26 words, 138 chars)

### Minimal (0 reasoning tokens)
```
"in the beginning there was a bunch of monkeys and birds, and they flew around and fought each other, and God created them, and they died."
```
(26 words, 137 chars)

---

## Observations

1. **All levels successfully removed "Uh, uh"** - the core cleaning task works at every level
2. **Minimal is 3x cheaper** than high (247 vs 757 tokens) with same quality output
3. **Reasoning tokens scale linearly** with effort level
4. **Minor differences**:
   - Minimal loses capitalization on "In"
   - Some comma placement varies
5. **Recommendation**: Use `minimal` for this cleaning task - it's fast, cheap, and effective

---

## Current Setting
`reasoning: { effort: "minimal" }` in `process-recording/index.ts`
