// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

(function () {
  const TOM = (window.TOM = window.TOM || {});

  let initialized = false;

  TOM.UI = {
    async initialize() {
      if (initialized) return;
      initialized = true;
      await TOM.Core.bootstrap();
    },
  };
})();
