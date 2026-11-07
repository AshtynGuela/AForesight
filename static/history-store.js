/* Only downloaded provider history is eligible for the live screens. */
const farmHistory = (() => {
  const key = (f) => `agriforesight-history-v1:${f.latitude}:${f.longitude}`;
  const valid = (c, f) =>
    c &&
    !c.demo &&
    c.kind === "gridded_reference" &&
    Number.isFinite(Date.parse(c.retrieved_at)) &&
    c.latitude === f.latitude &&
    c.longitude === f.longitude &&
    Array.isArray(c.days) &&
    c.days.length &&
    c.days.every(
      (d) =>
        /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
        Number.isFinite(d.rain) &&
        d.rain >= 0 &&
        d.rain <= 3000 &&
        Number.isFinite(d.temp) &&
        d.temp >= -60 &&
        d.temp <= 65,
    );
  function preferCached(farm, server) {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(key(farm)));
    } catch {
      /* No device copy. */
    }
    const chosen =
      valid(server, farm) &&
      (!valid(saved, farm) ||
        Date.parse(server.retrieved_at) >= Date.parse(saved.retrieved_at))
        ? server
        : valid(saved, farm)
          ? saved
          : null;
    if (chosen) {
      try {
        localStorage.setItem(key(farm), JSON.stringify(chosen));
      } catch {
        /* Snapshot/export remain available. */
      }
      return chosen;
    }
    return {
      source: "No sourced history downloaded",
      kind: "unavailable",
      demo: false,
      latitude: farm.latitude,
      longitude: farm.longitude,
      days: [],
      missing_days: 0,
      retrieved_at: null,
    };
  }
  return { preferCached };
})();
