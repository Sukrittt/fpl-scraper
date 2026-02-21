function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function createTransferPatternAgent() {
  return {
    run({ currentTemplate = [], previousTemplate = [] }) {
      const prev = new Map(previousTemplate.map((row) => [Number(row.player_id), Number(row.template_ownership_pct || 0)]));

      return currentTemplate.map((row) => {
        const previous = prev.get(Number(row.player_id)) || 0;
        const current = Number(row.template_ownership_pct || 0);
        const delta = round(current - previous);

        return {
          ...row,
          buy_momentum: delta > 0 ? delta : 0,
          sell_momentum: delta < 0 ? Math.abs(delta) : 0,
        };
      });
    },
  };
}
