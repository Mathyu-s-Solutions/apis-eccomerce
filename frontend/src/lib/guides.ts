import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';
import type { SiteId } from './brands';
import { slugify } from './directory';

/**
 * Guías (/guias): artículos en Markdown en content/guias/<slug>.md, con frontmatter.
 * Los escribe el motor de contenido (scripts/seo/write-guide.mjs, cada semana desde
 * GitHub Actions) y llegan como PR: se publican cuando alguien los revisa y hace merge.
 * Cada guía vive en el dominio de su sitio (`site`).
 */

const DIR = path.join(process.cwd(), 'content', 'guias');

export interface Guide {
  slug: string;
  site: SiteId;
  title: string;
  description: string;
  /** AAAA-MM-DD */
  date: string;
  updated: string;
  keywords: string[];
  draft: boolean;
  readingMinutes: number;
  html: string;
  /** Los H2, para el índice de la guía. */
  headings: { id: string; text: string }[];
}

const SITES: SiteId[] = ['hub', 'shalom', 'olva', 'sunat'];

/** Frontmatter `clave: valor`, con los valores en JSON (así los escribe el motor) o texto plano. */
function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { data: {}, body: raw };
  const data: Record<string, unknown> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const value = kv[2].trim();
    try {
      data[kv[1]] = JSON.parse(value);
    } catch {
      data[kv[1]] = value;
    }
  }
  return { data, body: raw.slice(m[0].length) };
}

const stripTags = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function render(markdown: string): { html: string; headings: Guide['headings'] } {
  const headings: Guide['headings'] = [];
  const used = new Set<string>();
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        let id = slugify(stripTags(text)) || 'seccion';
        while (used.has(id)) id += '-2';
        used.add(id);
        if (depth === 2) headings.push({ id, text: stripTags(text) });
        // El título de la guía ya es el H1 de la página.
        const level = Math.max(2, depth);
        return `<h${level} id="${id}">${text}</h${level}>\n`;
      },
      // Sin HTML crudo: el Markdown viene de un modelo y solo pasa por revisión humana.
      html() {
        return '';
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        // Solo links web, relativos o anclas.
        if (!/^(https?:\/\/|\/|#)/.test(href)) return text;
        const safe = href.replace(/"/g, '%22');
        const t = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
        return /^https?:\/\//.test(href)
          ? `<a href="${safe}"${t} target="_blank" rel="noopener">${text}</a>`
          : `<a href="${safe}"${t}>${text}</a>`;
      },
    },
  });
  return { html: marked.parse(markdown, { async: false }), headings };
}

function load(file: string): Guide | null {
  const slug = file.replace(/\.md$/, '');
  const { data, body } = parseFrontmatter(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const site = String(data.site ?? '') as SiteId;
  if (!SITES.includes(site) || !data.title || !data.description || !data.date) {
    console.warn(`[guias] ${file}: falta site, title, description o date; se omite.`);
    return null;
  }
  const { html, headings } = render(body);
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    site,
    title: String(data.title),
    description: String(data.description),
    date: String(data.date),
    updated: String(data.updated ?? data.date),
    keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : [],
    draft: data.draft === true,
    readingMinutes: Math.max(1, Math.round(words / 200)),
    html,
    headings,
  };
}

let cache: Guide[] | null = null;

function all(): Guide[] {
  if (cache && process.env.NODE_ENV === 'production') return cache;
  let files: string[] = [];
  try {
    files = fs.readdirSync(DIR).filter((f) => f.endsWith('.md'));
  } catch {
    // Sin carpeta de guías todavía.
  }
  const today = new Date().toISOString().slice(0, 10);
  cache = files
    .map(load)
    .filter((g): g is Guide => !!g)
    // Los borradores y las guías con fecha futura solo se ven en desarrollo.
    .filter((g) => process.env.NODE_ENV !== 'production' || (!g.draft && g.date <= today))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'es'));
  return cache;
}

/** Guías de un sitio, de la más nueva a la más antigua. */
export function guidesFor(site: SiteId): Guide[] {
  return all().filter((g) => g.site === site);
}

/** Todas las guías publicadas (para el índice del sitio central). */
export function allGuides(): Guide[] {
  return all();
}

export function findGuide(site: SiteId, slug: string): Guide | undefined {
  return guidesFor(site).find((g) => g.slug === slug);
}

export const guidePath = (g?: { slug: string }) => (g ? `/guias/${g.slug}` : '/guias');
