function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function scorePlayer({
  form,
  fixtures,
  minutes,
  value,
  sentiment,
  transcriptCoverage = 0,
  templateAlignment = 50,
  eliteMomentum = 0,
  teamNeedFit = 50,
  volatilityRisk = 0,
}) {
  const weighted =
    (0.35 * toNum(form)) +
    (0.25 * toNum(fixtures)) +
    (0.2 * toNum(minutes)) +
    (0.1 * toNum(value)) +
    (0.1 * toNum(sentiment));

  const templateLift = (toNum(templateAlignment) - 50) * 0.08;
  const momentumLift = clamp(toNum(eliteMomentum), -30, 30) * 0.4;
  const teamFitLift = (toNum(teamNeedFit) - 50) * 0.12;
  const volatilityPenalty = clamp(toNum(volatilityRisk), 0, 100) * 0.06;

  const score = clamp(weighted + (toNum(transcriptCoverage) * 1.25) + templateLift + momentumLift + teamFitLift - volatilityPenalty);

  const statsAverage = (toNum(form) + toNum(fixtures) + toNum(minutes) + toNum(value)) / 4;
  const agreement = 1 - Math.abs(statsAverage - toNum(sentiment)) / 100;
  const strategyAgreement = 1 - Math.abs(toNum(templateAlignment) - toNum(teamNeedFit)) / 100;
  const confidence = clamp(44 + (agreement * 28) + (strategyAgreement * 16) + (toNum(transcriptCoverage) * 10));

  return {
    score,
    confidence,
    components: {
      weighted_base: weighted,
      template_lift: templateLift,
      momentum_lift: momentumLift,
      team_fit_lift: teamFitLift,
      volatility_penalty: volatilityPenalty,
    },
  };
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
