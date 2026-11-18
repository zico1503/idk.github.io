/* Turn silent game asset/startup failures into a useful message on the page. */
(function () {
  'use strict';
  var reported = false;
  function report(message) {
    if (reported) return;
    var panel = document.querySelector('[data-game-error]');
    if (!panel) return;
    reported = true;
    panel.textContent = message + ' Refresh the page. If the problem remains, upload the complete glm-games folder again.';
    panel.hidden = false;
  }
  window.addEventListener('error', function (event) {
    if (event.target && event.target !== window) {
      report('A game file did not load.');
      return;
    }
    if (event.message) report('The game hit a startup error: ' + event.message);
  }, true);
  window.addEventListener('unhandledrejection', function () {
    report('The game could not finish starting.');
  });
  window.addEventListener('load', function () {
    window.setTimeout(function () {
      if (!window.GK || !window.GK.instances || !window.GK.instances.length) {
        report('The game engine did not start. One or more game files may be missing.');
      }
    }, 800);
  });
})();
