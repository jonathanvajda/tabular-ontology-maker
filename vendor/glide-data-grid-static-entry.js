import * as React from "react";
import * as ReactDOM from "react-dom/client";
import DataEditor, * as GlideDataGrid from "@glideapps/glide-data-grid";

const api = {
  ...GlideDataGrid,
  DataEditor,
  React,
  ReactDOM,
};

if (typeof window !== "undefined") {
  window.React = React;
  window.ReactDOM = ReactDOM;
  window.GlideDataGrid = api;
}

export default api;
