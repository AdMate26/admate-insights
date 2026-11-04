import React from "react";
import { createRoot } from "react-dom/client";
import { LandingPage } from "../../src/components/landing/LandingPage";

const element = document.getElementById("root");
if (!element) throw new Error("Preview root is missing.");
const option = window.location.pathname.endsWith("/b") ? "b" : "a";
const website = "https://www.admate.site";
createRoot(element).render(
  <React.StrictMode>
    <LandingPage option={option} loginHref={`${website}/login`} legalBase={website} />
  </React.StrictMode>,
);
