import { createApp } from "vue";

import App from "./App.vue";
import {
  initializeLocale,
  localeCode,
  translate,
  translateFormat,
} from "./i18n/locale";
import "./resume-renderer/style.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/markdown.css";
import "./styles/tracker-board.css";
import "./styles/tracker-cards.css";
import "./styles/tracker-forms.css";
import "./styles/tracker-views.css";
import "./styles/tracker-context.css";
import "./styles/tracker-children.css";
import "./styles/job-repository-layout.css";
import "./styles/job-repository-list.css";
import "./styles/job-repository-detail.css";
import "./styles/delivery-resume-files.css";
import "./styles/job-repository-content.css";
import "./styles/job-repository-responsive.css";
import "./styles/experience-library-layout.css";
import "./styles/experience-library-content.css";
import "./styles/experience-library-detail.css";
import "./styles/experience-library-filter.css";
import "./styles/experience-library-editor.css";
import "./styles/experience-library-maintenance.css";
import "./styles/experience-import.css";
import "./styles/experience-history.css";
import "./styles/experience-library-responsive.css";
import "./styles/profile-dialog.css";

initializeLocale();
const app = createApp(App);
app.config.globalProperties.$t = translate;
app.config.globalProperties.$locale = localeCode;
app.config.globalProperties.$tf = translateFormat;
app.mount("#app");
