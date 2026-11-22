# Mi Entrenamiento

Panel personal de entrenamiento alimentado en vivo por Strava. Está publicado en claude.ai:
https://claude.ai/artifact/1CRAdLe4TKLiHhRxvZwV9w

Esta carpeta es la copia de respaldo y el historial del código de la página.

## Pestañas

- **Resumen**: km de 28 días, eficiencia aeróbica, próxima carrera, racha, volumen hacia la carrera, objetivos, semana actual frente a la anterior y días desde la última sesión de cada deporte.
- **Semana y mes**: calendario mensual, km y horas por semana, mapa del año y últimas actividades.
- **Progreso**: eficiencia aeróbica, ritmos de entrenamiento, ritmo de cada carrera, récords por año, salidas largas y potencia en bici.
- **Último entrenamiento**: análisis de una sesión (resumen, lectura automática, curvas de FC y ritmo, vueltas, zonas, mejores esfuerzos) y comparación con otra.
- **Detalle**: carga aguda y crónica, tiempo en zonas por semana y reparto por deporte.

Las zonas de FC se calculan con una FC máxima de 204 lpm (constante `FCMAX` en el cálculo `zonas_fc` de `s_data.js`).

## Archivos

| Archivo | Contenido |
|---|---|
| `body.html` | Estructura de la página (pestañas, tarjetas, tablas) |
| `base.css`, `extra.css` | Estilos |
| `s_data.js` | Cómo se leen las respuestas de Strava y los cálculos principales |
| `s_ui.js` | Pestañas, filtro de deporte, formularios |
| `s_draw.js` | Tarjetas, calendario y gráficos generales |
| `s_sesion.js` | Pestaña «Último entrenamiento» |
| `s_more.js` | Comparación, eficiencia, ritmos, récords por año, potencia, mapa del año |
| `s_prep.js` | Volumen hacia la próxima carrera y tarjetas del Resumen |
| `build.py` | Une todo en `index.html` |
| `index.html` | La página armada, tal como está publicada |
| `store/` | Consultas a Strava (`datasets/`), filtros y ajustes (`dash/`) del panel |

## Cómo actualizar la página

1. Edita las partes y ejecuta `python3 build.py`.
2. Pídele a Claude que publique el nuevo `index.html` en el panel (se guarda en el documento `files/index.html` del panel).

Los objetivos y carreras que anotas en la página se guardan en tu espacio privado del panel, no en este repositorio.
