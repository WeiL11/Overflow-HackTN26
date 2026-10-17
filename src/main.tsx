import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, BRAND_COLOR } from "./config/brand";
import "@radix-ui/themes/styles.css";
import "./index.css";

const appTitle = `${APP_NAME} — ${APP_TAGLINE}`;

document.documentElement.style.setProperty("--brand-color", BRAND_COLOR);
document.title = appTitle;

const updateMetadata = (selector: string, content: string) => {
  document.querySelectorAll<HTMLMetaElement>(selector).forEach((meta) => meta.setAttribute("content", content));
};

updateMetadata('[data-app-meta="description"]', APP_DESCRIPTION);
updateMetadata('[data-app-meta="author"]', APP_NAME);
updateMetadata('[data-app-meta="title"]', appTitle);

createRoot(document.getElementById("root")!).render(<App />);
