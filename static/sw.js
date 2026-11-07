const CACHE = "agriforesight-shell-v39-farm-condition-check";
const FILES = [
  "/static/farm-assessment.js",
  "/static/conditions.js",
  "/static/myfarm-assets/farm-mark.png",
  "/static/vendor/leaflet/images/layers.png",
  "/static/vendor/leaflet/images/layers-2x.png",
  "/static/sidebar.css",
  "/static/myfarm.css",
  "/static/myfarm.js",
  "/static/vendor/leaflet/leaflet.css",
  "/static/vendor/leaflet/leaflet.js",
  "/static/myfarm-assets/farm-logo.png",
  "/static/myfarm-assets/gps.svg",
  "/static/myfarm-assets/input.svg",
  "/static/myfarm-assets/locate.svg",
  "/static/myfarm-assets/support.svg",
  "/static/overview-assets/JetBrainsMono-Regular.woff2",
  "/static/overview-assets/JetBrainsMono-Bold.woff2",
  "/static/overview.css",
  "/static/overview.js",
  "/static/overview-assets/imgCarrotPeruvianCuisineRootVegetablesFruitVegetableCarrot9Ecc4C1D616Ca9D78D9A3A4Aaf6F87551.png",
  "/static/overview-assets/imgCloudSunny.svg",
  "/static/overview-assets/imgCornOnTheCobCandyCornWaxyCornVegetableSweetCornCornD44A0F87083399Fbd391129Aac3812Ff1.png",
  "/static/overview-assets/imgDroplet.svg",
  "/static/overview-assets/imgEdit.svg",
  "/static/overview-assets/imgFarmerimg.svg",
  "/static/overview-assets/imgGroup.svg",
  "/static/overview-assets/imgGroup1.svg",
  "/static/overview-assets/imgGroup2.svg",
  "/static/overview-assets/imgGroup3.svg",
  "/static/overview-assets/imgGroup4.svg",
  "/static/overview-assets/imgGroup5.svg",
  "/static/overview-assets/imgGroup6.svg",
  "/static/overview-assets/imgImage1.png",
  "/static/overview-assets/imgLines.svg",
  "/static/overview-assets/imgMaximize.svg",
  "/static/overview-assets/imgMinus.svg",
  "/static/overview-assets/imgOl341U1Ht27Ph8Cntfnthquq0L1.png",
  "/static/overview-assets/imgPlus.svg",
  "/static/overview-assets/imgRectangle.svg",
  "/static/overview-assets/imgVector1.svg",
  "/static/overview-assets/imgWheatStrawCerealWheatPng3Fa65A6925Da6197682E7D4Acf6De1Ba1.png",
  "/static/overview-assets/imgWind.svg",
  "/",
  "/static/style.css",
  "/static/app.js",
  "/static/chat.js",
  "/static/assistant-mark.svg",
  "/static/manifest.json",
  "/static/icon.svg",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("agriforesight-shell-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin ||
    new URL(event.request.url).pathname.startsWith("/api/")
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then(
            (cached) =>
              cached ||
              new Response("Offline resource unavailable", { status: 503 }),
          ),
      ),
  );
});
