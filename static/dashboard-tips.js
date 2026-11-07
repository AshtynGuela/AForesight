/* Pick one daily tip using the same weather checks as Farm Performance. */
function dashboardTips(state, now = Date.now()) {
  const dayMs = 86400000;
  const day = Math.floor((now + 8 * 3600000) / dayMs);
  const tomorrow = new Date((day + 1) * dayMs).toISOString().slice(0, 10);
  const assessment = assessFarm(state, now);
  const source = state.forecast?.source || "Your saved forecast";
  const priority = assessment.forecastEvents
    .filter((event) => event.date <= tomorrow)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ id, date, value }) => {
      const when = new Date(date + "T00:00:00Z").toLocaleDateString("en-PH", {
        timeZone: "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const check = assessment.checks.find((item) => item.id === id);
      const trigger = {
        rain: `${value.toFixed(1)} mm of rain on ${when}`,
        heat: `a high of ${value.toFixed(1)} °C on ${when}`,
        water: `${value} dry days in a row from ${when}`,
      }[id];
      return {
        title: check.title,
        action: check.action,
        when,
        why: `${source} shows ${trigger} for your saved field.`,
        reference: check.sources[0],
        weather: true,
      };
    });
  const routine = state.farm_tips?.length
    ? state.farm_tips
    : [
        {
          title: "Walk a few parts of your field",
          action:
            "Check your plants and write down anything that has changed since your last visit.",
          why: "Comparing notes between visits can help you spot changes in the field.",
          when: "On your next field visit",
        },
        {
          title: "Check moisture near the roots",
          action:
            "Check the soil in a few spots before deciding whether to water.",
          why: "Moisture can vary across the field, even after the same rain or watering.",
          when: "Before watering",
        },
      ];
  const start = day % routine.length;
  return {
    day,
    tips: [...priority, ...routine.slice(start), ...routine.slice(0, start)],
    needsWeather: !assessment.hasNearTermForecast,
  };
}
