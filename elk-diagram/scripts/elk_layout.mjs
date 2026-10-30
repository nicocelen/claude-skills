#!/usr/bin/env node
// elk_layout.mjs — generieke ELK.js-layout: graph.json -> diagram.svg + diagram.layout.json
// Gebruik: node elk_layout.mjs <graph.json> <uitvoermap>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ELK = require('elkjs/lib/elk.bundled.js');

const [, , IN, OUTDIR = '.'] = process.argv;
if (!IN) {
  console.error('Gebruik: node elk_layout.mjs <graph.json> <uitvoermap>');
  process.exit(2);
}
const g = JSON.parse(fs.readFileSync(IN, 'utf8'));
fs.mkdirSync(OUTDIR, { recursive: true });

// ---------- standaardwaarden (overschrijfbaar via graph.json) ----------
const DEFAULT_LAYOUT = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.spacing.nodeNode': '30',
  'elk.layered.spacing.nodeNodeBetweenLayers': '60',
  'elk.spacing.edgeLabel': '4',
  'elk.edgeLabels.placement': 'CENTER',
};
const DEFAULT_STYLE = { fill: '#FFFFFF', stroke: '#555555', strokeWidth: 2, dash: null, textColor: '#1a1a1a', fontSize: 13, bold: false };
const FONT = { charW: 0.58, lineH: 1.35 }; // breedte per teken en regelhoogte, als factor van fontSize

// ---------- controles ----------
const errors = [];
const nodes = g.nodes || [];
const groups = g.groups || [];
const edges = g.edges || [];
const ids = new Set();
for (const x of [...nodes, ...groups]) {
  if (!x.id) errors.push('knoop of groep zonder id');
  else if (ids.has(x.id)) errors.push(`dubbele id: ${x.id}`);
  ids.add(x.id);
}
const groupIds = new Set(groups.map((x) => x.id));
for (const x of [...nodes, ...groups]) {
  if (x.group && !groupIds.has(x.group)) errors.push(`${x.id}: onbekende groep ${x.group}`);
}
edges.forEach((e, i) => {
  if (!e.id) e.id = `e${i}`;
  if (!ids.has(e.source)) errors.push(`verbinding ${e.id}: onbekende bron ${e.source}`);
  if (!ids.has(e.target)) errors.push(`verbinding ${e.id}: onbekend doel ${e.target}`);
});
if (errors.length) {
  console.error('FOUT in graph.json:\n- ' + errors.join('\n- '));
  process.exit(1);
}

// ---------- hulpfuncties ----------
const styles = g.styles || {};
const st = (name) => ({ ...DEFAULT_STYLE, ...(styles.default || {}), ...(name ? styles[name] || {} : {}) });
const lines = (label, fallback) => String(label ?? fallback).split('\n');
const textSize = (label, fs) => {
  const ls = lines(label, '');
  return {
    w: Math.ceil(Math.max(...ls.map((l) => l.length)) * fs * FONT.charW),
    h: Math.ceil(ls.length * fs * FONT.lineH),
  };
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- ELK-graaf opbouwen ----------
const elkNode = {};
const mkNode = (n) => {
  const s = st(n.style);
  const t = textSize(n.label ?? n.id, s.fontSize);
  return {
    id: n.id,
    width: n.width ?? Math.max(g.minNodeWidth ?? 120, t.w + 32),
    height: n.height ?? Math.max(g.minNodeHeight ?? 44, t.h + 20),
    layoutOptions: n.layoutOptions || {},
  };
};
const mkGroup = (x) => {
  const s = st(x.style || 'group');
  const t = textSize(x.label ?? x.id, s.fontSize);
  return {
    id: x.id,
    labels: [{ text: String(x.label ?? x.id), width: t.w, height: t.h }],
    layoutOptions: {
      'elk.padding': `[top=${t.h + 24},left=16,bottom=16,right=16]`,
      'elk.nodeLabels.placement': 'INSIDE V_TOP H_LEFT',
      ...(x.layoutOptions || {}),
    },
    children: [],
  };
};
for (const x of groups) elkNode[x.id] = mkGroup(x);
for (const n of nodes) elkNode[n.id] = mkNode(n);
const root = { id: '__root__', layoutOptions: { ...DEFAULT_LAYOUT, ...(g.layoutOptions || {}) }, children: [] };
for (const x of [...groups, ...nodes]) (x.group ? elkNode[x.group].children : root.children).push(elkNode[x.id]);
root.edges = edges.map((e) => {
  const s = st(e.style);
  const out = { id: e.id, sources: [e.source], targets: [e.target] };
  if (e.label) {
    const t = textSize(e.label, Math.round(s.fontSize * 0.85));
    out.labels = [{ text: String(e.label), width: t.w, height: t.h }];
  }
  return out;
});

// ---------- layout ----------
const res = await new ELK().layout(root);

// ---------- absolute coördinaten verzamelen ----------
const abs = {}; // id -> {x,y}
const out = { width: Math.ceil(res.width), height: Math.ceil(res.height), groups: [], nodes: [], edges: [] };
const meta = Object.fromEntries([...nodes, ...groups].map((x) => [x.id, x]));
(function walk(n, ox, oy, depth) {
  for (const c of n.children || []) {
    const x = ox + c.x, y = oy + c.y;
    abs[c.id] = { x, y };
    const rec = { id: c.id, x: Math.round(x), y: Math.round(y), width: Math.round(c.width), height: Math.round(c.height), label: meta[c.id].label ?? c.id, style: meta[c.id].style ?? null, group: meta[c.id].group ?? null };
    if (groupIds.has(c.id)) out.groups.push({ ...rec, depth });
    else out.nodes.push(rec);
    walk(c, x, y, depth + 1);
  }
})(res, 0, 0, 0);
abs.__root__ = { x: 0, y: 0 };
const emeta = Object.fromEntries(edges.map((e) => [e.id, e]));
(function walkEdges(n) {
  for (const e of n.edges || []) {
    const o = abs[e.container] || abs[n.id] || { x: 0, y: 0 };
    const pts = [];
    for (const s of e.sections || []) {
      for (const p of [s.startPoint, ...(s.bendPoints || []), s.endPoint]) pts.push({ x: Math.round(o.x + p.x), y: Math.round(o.y + p.y) });
    }
    const lab = (e.labels || [])[0];
    out.edges.push({
      id: e.id, source: emeta[e.id].source, target: emeta[e.id].target, style: emeta[e.id].style ?? null,
      points: pts,
      label: lab ? { text: lab.text, x: Math.round(o.x + lab.x), y: Math.round(o.y + lab.y), width: Math.round(lab.width), height: Math.round(lab.height) } : null,
    });
  }
  for (const c of n.children || []) walkEdges(c);
})(res);

// ---------- SVG tekenen ----------
const svg = [];
const textBlock = (label, cx, y, s, anchor = 'middle') => {
  const ls = lines(label, '');
  const lh = s.fontSize * FONT.lineH;
  return ls.map((l, i) => `<text x="${cx}" y="${(y + (i + 0.8) * lh).toFixed(1)}" font-size="${s.fontSize}"${s.bold ? ' font-weight="600"' : ''} text-anchor="${anchor}" fill="${s.textColor}">${esc(l)}</text>`).join('');
};
for (const gr of out.groups.sort((a, b) => a.depth - b.depth)) {
  const s = st(meta[gr.id].style || 'group');
  svg.push(`<rect x="${gr.x}" y="${gr.y}" width="${gr.width}" height="${gr.height}" rx="10" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`);
  svg.push(textBlock(gr.label, gr.x + 14, gr.y + 8, s, 'start'));
}
const curved = String((g.layoutOptions || {})['elk.edgeRouting'] || '').toUpperCase() === 'SPLINES';
for (const e of out.edges) {
  const s = st(e.style);
  if (!e.points.length) continue;
  let d = `M${e.points[0].x},${e.points[0].y}`;
  if (curved && e.points.length >= 4 && (e.points.length - 1) % 3 === 0) {
    for (let i = 1; i < e.points.length; i += 3) d += ` C${e.points[i].x},${e.points[i].y} ${e.points[i + 1].x},${e.points[i + 1].y} ${e.points[i + 2].x},${e.points[i + 2].y}`;
  } else {
    for (const p of e.points.slice(1)) d += ` L${p.x},${p.y}`;
  }
  svg.push(`<path d="${d}" fill="none" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} marker-end="url(#arrow)"/>`);
}
for (const e of out.edges.filter((x) => x.label)) {
  const s = st(e.style);
  const ls = { ...s, fontSize: Math.round(s.fontSize * 0.85), bold: false, textColor: '#333333' };
  svg.push(`<rect x="${e.label.x - 3}" y="${e.label.y - 1}" width="${e.label.width + 6}" height="${e.label.height + 2}" rx="3" fill="#FFFFFF" fill-opacity="0.9"/>`);
  svg.push(textBlock(e.label.text, e.label.x, e.label.y, ls, 'start'));
}
for (const n of out.nodes) {
  const s = st(meta[n.id].style);
  svg.push(`<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="8" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`);
  const th = lines(n.label, '').length * s.fontSize * FONT.lineH;
  svg.push(textBlock(n.label, n.x + n.width / 2, n.y + (n.height - th) / 2, s));
}
const M = 20, W = out.width + 2 * M, H = out.height + 2 * M;
const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-M} ${-M} ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>
<rect x="${-M}" y="${-M}" width="${W}" height="${H}" fill="#FFFFFF"/>
${svg.join('\n')}
</svg>`;

const svgPath = path.join(OUTDIR, 'diagram.svg');
const jsonPath = path.join(OUTDIR, 'diagram.layout.json');
fs.writeFileSync(svgPath, doc);
fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));

// ---------- controle op overlappende knopen ----------
const ov = [];
for (let i = 0; i < out.nodes.length; i++) for (let j = i + 1; j < out.nodes.length; j++) {
  const a = out.nodes[i], b = out.nodes[j];
  if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) ov.push(`${a.id}/${b.id}`);
}
console.log(`OK knopen=${out.nodes.length} groepen=${out.groups.length} verbindingen=${out.edges.length} grootte=${W}x${H} overlap=${ov.length ? ov.join(',') : 0}`);
console.log(`-> ${svgPath}\n-> ${jsonPath}`);
