import { render } from "solid-js/web";
import App from "./App";
import "./index.css"; // you said your file is index.css

render(() => <App />, document.getElementById("root") as HTMLElement);