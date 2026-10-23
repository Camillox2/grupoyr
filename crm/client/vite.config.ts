import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "vendor-react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: "vendor-socket", test: /node_modules[\\/](socket\.io-client|engine\.io-client|socket\.io-parser|engine\.io-parser|@socket\.io)[\\/]/, priority: 20 },
            { name: "vendor-charts", test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|es-toolkit|decimal\.js-light|@reduxjs|redux|immer|reselect|react-redux|react-is|use-sync-external-store|eventemitter3|tiny-invariant)[\\/]/, priority: 10 },
            { name: "vendor-motion", test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/, priority: 10 },
            { name: "vendor-dnd", test: /node_modules[\\/](@hello-pangea|@dnd-kit|redux|react-redux|css-box-model|raf-schd)[\\/]/, priority: 5 },
            { name: "vendor-confetti", test: /node_modules[\\/]canvas-confetti[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
})
