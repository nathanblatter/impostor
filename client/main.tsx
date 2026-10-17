import React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App.js";
import Login from "./components/Login.js";
import "./base.css";

createRoot(document.getElementById("root")!).render(window.location.pathname === "/login" ? <Login /> : <App />);
