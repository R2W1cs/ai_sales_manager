(function () {
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute("data-key");
  if (!key) return;

  var origin = new URL(script.src, window.location.href).origin;
  var root = document.createElement("div");
  root.setAttribute("data-ai-sales-widget", key);
  root.style.cssText = "all: initial; position: fixed; z-index: 2147483000; inset: auto 20px 20px auto;";

  var frame = document.createElement("iframe");
  frame.title = "Chat";
  frame.src = origin + "/embed/widget?key=" + encodeURIComponent(key);
  frame.style.cssText =
    "display: none; width: min(380px, calc(100vw - 32px)); height: min(560px, calc(100vh - 120px)); border: 0; border-radius: 16px; background: #fff; box-shadow: 0 16px 50px rgba(15, 23, 42, 0.22); margin-bottom: 12px;";

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "Open chat");
  button.style.cssText =
    "display: flex; margin-left: auto; width: 56px; height: 56px; border: 0; border-radius: 999px; background: #111827; color: #fff; cursor: pointer; align-items: center; justify-content: center; box-shadow: 0 10px 24px rgba(17, 24, 39, 0.28);";
  button.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

  var open = false;
  button.addEventListener("click", function () {
    open = !open;
    frame.style.display = open ? "block" : "none";
    button.setAttribute("aria-label", open ? "Close chat" : "Open chat");
  });

  root.appendChild(frame);
  root.appendChild(button);
  document.body.appendChild(root);
})();
