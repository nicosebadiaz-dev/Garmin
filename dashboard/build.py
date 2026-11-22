"""Arma index.html (la página del panel) a partir de sus partes."""
import json, pathlib

here = pathlib.Path(__file__).parent
SCRIPTS = ["s_data.js", "s_ui.js", "s_draw.js", "s_sesion.js", "s_more.js", "s_prep.js"]

css = (here / "base.css").read_text() + (here / "extra.css").read_text()
html = '<meta name="dash-one-writer">\n<style>\n' + css + "</style>\n\n" + (here / "body.html").read_text()
for name in SCRIPTS:
    html += "\n<script>\n" + (here / name).read_text() + "</script>\n"

(here / "index.html").write_text(html)
(here / "index.json").write_text(json.dumps({"text": html}))
print(f"index.html: {len(html):,} caracteres")
