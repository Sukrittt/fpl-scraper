function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function scorePlayer({
  form,
  fixtures,
  minutes,
  value,
  sentiment,
  transcriptCoverage = 0,
}) {
  const weighted =
    (0.35 * form) +
    (0.25 * fixtures) +
    (0.2 * minutes) +
    (0.1 * value) +
    (0.1 * sentiment);

  const score = clamp(weighted + (transcriptCoverage * 1.25));

  const statsAverage = (form + fixtures + minutes + value) / 4;
  const agreement = 1 - Math.abs(statsAverage - sentiment) / 100;
  const confidence = clamp((50 + (agreement * 40) + (transcriptCoverage * 10)));

  return { score, confidence };
}

export function classifyAction({ score, confidence }) {
  if (score >= 70 && confidence >= 60) {
    return 'BUY';
  }

  if (score < 45) {
    return 'SELL';
  }

  return 'HOLD';
}
