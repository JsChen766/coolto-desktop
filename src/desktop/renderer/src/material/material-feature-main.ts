import { createApp } from "vue";

import "../styles/base.css";
import MaterialLibraryView from "./MaterialLibraryView.vue";
const app = createApp(MaterialLibraryView);
app.config.globalProperties.$t = (value: string) => value;
app.mount("#app");
