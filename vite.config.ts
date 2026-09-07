import tailwindcss from "@tailwindcss/vite";
import { createViteConfig } from "@rapidrest/react/vite";

export default createViteConfig({ appDir: ["apps/www", "apps/admin"], plugins: [tailwindcss()] });
