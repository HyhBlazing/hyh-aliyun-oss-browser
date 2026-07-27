import { createApp } from "vue";
import ArcoVue from "@arco-design/web-vue";
import ArcoVueIcon from "@arco-design/web-vue/es/icon";
import "@arco-design/web-vue/dist/arco.css";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./styles/theme.css";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(ArcoVue);
app.use(ArcoVueIcon);
app.mount("#app");
