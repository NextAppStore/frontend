import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src/**/*.{test,spec}.ts',
        'src/main.ts',
        'src/**/*.d.ts',
      ],
      // Untergrenzen, damit die Abdeckung nicht still erodiert. Die Werte
      // liegen bewusst knapp unter dem Ist-Stand — sie sind eine Sperre
      // gegen Rückschritt, kein Ziel. Wer aufräumt, zieht sie mit hoch.
      //
      // ``functions`` ist die ehrlichste Kennzahl: ``statements``/``lines``
      // sind durch Template-Markup und die reinen Datenobjekte in
      // ``src/i18n/locales`` aufgebläht.
      thresholds: {
        lines: 60,
        statements: 60,
        branches: 55,
        functions: 30,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
