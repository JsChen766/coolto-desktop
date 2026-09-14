import { createApp } from "vue";

import "../styles/base.css";
import "../styles/material-library-layout.css";
import "../styles/material-library-list.css";
import "../styles/material-library-detail.css";
import "../styles/material-library-responsive.css";
import MaterialLibraryView from "./MaterialLibraryView.vue";
const app = createApp(MaterialLibraryView);
app.config.globalProperties.$t = (value: string) => value;
app.mount("#app");
