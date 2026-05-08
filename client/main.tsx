import React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App.js";
import "./base.css";

createRoot(document.getElementById("root")!).render(<App />);
