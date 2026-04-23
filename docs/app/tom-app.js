// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

import "./tom-grid-glide.js";
import "./tom-core.js";
import "./tom-ui.js";

const TOM = (window.TOM = window.TOM || {});

async function bootstrap() {
  if (!TOM.Core || typeof TOM.Core.bootstrap !== "function") {
    throw new Error("TOM.Core.bootstrap is not available.");
  }

  if (TOM.UI && typeof TOM.UI.initialize === "function") {
    await TOM.UI.initialize();
    return;
  }

  await TOM.Core.bootstrap();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}

export { bootstrap };
