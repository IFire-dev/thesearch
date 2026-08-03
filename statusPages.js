// Self-contained HTML pages for the two gates below (maintenance mode
// and the IP allowlist). These are inlined with their own <style>
// rather than linking public/style.css, since that stylesheet is
// itself behind the same gates that serve these pages — linking to it
// would be circular.

function pageShell(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Local Search</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0a0c10;
    color: #e7e9ee;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    padding: 20px;
    text-align: center;
  }
  p {
    max-width: 380px;
    font-size: 15px;
    line-height: 1.6;
    color: #8b93a7;
  }
</style>
</head>
<body>
  <p>${message}</p>
</body>
</html>`;
}

function maintenancePage() {
  return pageShell('Sorry! The Search is being updated. If you have any questions ask the system admin.');
}

function notAllowedPage() {
  return pageShell('You are not allowed on this site yet. Please ask the developer for Access.');
}

module.exports = { maintenancePage, notAllowedPage };
