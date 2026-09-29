import type { RequestHandler } from "express";

const webOrigin = process.env.WEB_ORIGIN ?? `http://localhost:${process.env.APP_PORT ?? 30000}`;
const lightLogo = new URL("/brand/parcelis-lettermark-light.svg", webOrigin).toString();
const darkLogo = new URL("/brand/parcelis-lettermark-dark.svg", webOrigin).toString();
export const jobDashboardFavIcon = {
  default: new URL("/brand/favicon.svg", webOrigin).toString(),
  alternative: new URL("/brand/favicon-96x96.png", webOrigin).toString(),
};
const logoScript = `<script>(()=>{const sources=${JSON.stringify({ light: lightLogo, dark: darkLogo }).replace(/</g, "\\u003c")};const update=()=>{const logo=document.querySelector('img[alt="Parcelis Jobs"]');if(!logo)return;const source=document.body.classList.contains("dark-mode")?sources.dark:sources.light;if(logo.getAttribute("src")!==source)logo.setAttribute("src",source)};new MutationObserver(update).observe(document.body,{attributes:true,attributeFilter:["class"],childList:true,subtree:true});update()})();</script>`;

export const jobDashboardLogoMiddleware: RequestHandler = (_request, response, next) => {
  const send = response.send.bind(response);

  response.send = ((body?: string | Buffer) => {
    if (typeof body === "string" && body.includes('id="__UI_CONFIG__"')) {
      body = body.replace("</body>", `${logoScript}</body>`);
    }

    return send(body);
  }) as typeof response.send;

  next();
};

export const jobDashboardLightLogoUrl = lightLogo;
