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
