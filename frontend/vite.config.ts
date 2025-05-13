import {defineConfig, loadEnv} from 'vite'
import react from '@vitejs/plugin-react'

export default ({mode}) => {
    const env = loadEnv(mode, process.cwd(), 'SERVER_')
    return defineConfig({
        plugins: [react()],
        server: {
            proxy: {
                "/api": env.SERVER_URL || "http://localhost:3000"
            }
        }
    });
}
