(function () {
  const target = document.getElementById("build-info");
  if (!target) return;

  function formatBuildInfo(info) {
    const commit = info.short_commit || (info.commit ? String(info.commit).slice(0, 7) : "");
    const builtAt = info.built_at ? new Date(info.built_at) : null;
    const builtAtText =
      builtAt && !Number.isNaN(builtAt.getTime())
        ? builtAt.toLocaleString()
        : info.built_at || "";
    const ci = info.ci || "local";
    const ref = info.ref || "";

    const parts = ["Build"];
    if (commit) parts.push(commit);
    if (builtAtText) parts.push(builtAtText);
    if (ref) parts.push(ref);
    if (ci) parts.push(ci);
    return parts.join(" | ");
  }

  fetch("./build-info.json", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("Build info unavailable");
      return response.json();
    })
    .then(function (info) {
      target.textContent = formatBuildInfo(info || {});
    })
    .catch(function () {
      target.textContent = "";
    });
})();
