# Elltwo

Check out the live demo at: [dohan.io](http://dohan.io/)

Elltwo is a web-enabled, cell-based document composition tool. It's geared towards people who, like myself, start developing ideas as snippets of text interspersed with equations. Could very well be useful to others though. The math rendering is taken care of by the wonderful KaTeX library. Notable features include:

- Line-by-line (a la vim) Markdown editing
- Automatic equation, [sub]section, and footnote numbering
- Equation referencing and footnotes with popup previews
- Export to Markdown (ish), LaTeX, PDF, and HTML

![Elltwo demo](demo.gif)

(And yes, the integral is in fact wrong 🙂)

# Installing

After cloning the repository locally, you can run it right away.

# Running

From the main directory:

```
python3 editor.py --port=8500 --path=testing
```

Then navigate to:

```
http://localhost:8500/
```

You can set `path` and `port` to wherever you want to store your files. Personally, I have them in a Dropbox folder for safety and portability.
