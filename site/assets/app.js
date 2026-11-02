const CONTENT_URL = "https://content.fullpsych.com/content/current.json";
const slug = document.body.dataset.page;
const status = document.querySelector(".status");

document.querySelector(".menu")?.addEventListener("click", (event) => {
  const menu = document.querySelector(".nav-links");
  const open = menu.classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(open));
});

const safeHref = (value) => {
  try {
    const url = new URL(value, location.origin);
    return ["https:", "http:", "tel:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
};

function addSpans(parent, spans = []) {
  for (const span of spans) {
    let node = document.createTextNode(String(span.text || ""));
    if (span.bold) { const strong = document.createElement("strong"); strong.append(node); node = strong; }
    if (span.italic) { const em = document.createElement("em"); em.append(node); node = em; }
    if (span.href && safeHref(span.href)) {
      const a = document.createElement("a"); a.href = safeHref(span.href); a.append(node);
      if (a.protocol === "http:" || a.protocol === "https:") { a.target = "_blank"; a.rel = "noopener noreferrer"; }
      node = a;
    }
    parent.append(node);
  }
}

function element(tag, className, spans) {
  const node = document.createElement(tag); if (className) node.className = className; addSpans(node, spans); return node;
}

function renderBlocks(target, blocks, pageSlug) {
  target.replaceChildren(); let list = null; let principles = null;
  const flush = () => { list = null; principles = null; };
  for (const block of blocks || []) {
    if (block.type === "listItem") {
      principles = null;
      if (!list) { list = document.createElement("ul"); list.className = "list"; target.append(list); }
      list.append(element("li", "", block.spans)); continue;
    }
    list = null;
    if (block.type === "principle") {
      if (!principles) { principles = document.createElement("div"); principles.className = "principles"; target.append(principles); }
      const card = document.createElement("article"); card.className = "principle";
      card.append(element("h3", "", [{text:block.title}]), element("p", "", [{text:block.text}])); principles.append(card); continue;
    }
    principles = null;
    if (block.type === "paragraph") target.append(element("p", "", block.spans));
    else if (block.type === "heading") target.append(element(block.level === 3 ? "h3" : "h2", "", block.spans));
    else if (block.type === "link") { const a = element("a", "content-link", block.spans); a.append(" ↗"); target.append(a); }
    else if (block.type === "timeline") {
      const row = document.createElement("article"); row.className = "timeline";
      const detail = document.createElement("div"); detail.append(element("h3", "", [{text:block.title}]), element("p", "", [{text:block.text}]));
      row.append(element("div", "timeline-year", [{text:block.year}]), detail); target.append(row);
    } else if (block.type === "faq") {
      const item = document.createElement("article"); item.className = "faq";
      item.append(element("h3", "", [{text:block.question}]), element("p", "", block.spans)); target.append(item);
    }
  }
  flush();
}

function render(data) {
  const pages = data.pages || [];
  const page = pages.find((item) => item.slug === slug || (slug === "resources" && item.slug === "faqs"));
  if (!page) return;
  document.querySelector("[data-content=eyebrow]").textContent = page.eyebrow || "";
  document.querySelector("[data-content=title]").textContent = page.title || "";
  document.querySelector("[data-content=summary]").textContent = page.summary || "";
  const main = document.querySelector("[data-content=blocks]");
  if (slug === "resources") {
    const medication = pages.find((item) => item.slug === "medication-guide");
    const wrapper = document.createElement("div"); wrapper.className = "resources-grid";
    const card = document.createElement("section"); card.className = "resource-card";
    card.append(element("h2", "", [{text: medication?.title || "Medication guide"}]));
    const inner = document.createElement("div"); renderBlocks(inner, medication?.blocks || [], "medication-guide"); card.append(inner); wrapper.append(card);
    const note = document.createElement("aside"); note.className = "resource-card";
    note.append(element("h2", "", [{text:"A helpful starting point"}]), element("p", "", [{text:"Medication decisions are individual. We’ll review benefits, risks, alternatives, and monitoring together before making a plan."}])); wrapper.append(note);
    main.replaceChildren(wrapper); const faqTarget = document.createElement("div"); main.append(faqTarget); renderBlocks(faqTarget, page.blocks, "faqs");
  } else renderBlocks(main, page.blocks, page.slug);
  document.documentElement.dataset.contentVersion = data.version || "unknown";
}

async function refreshContent() {
  try {
    const response = await fetch(CONTENT_URL, {cache:"no-cache", headers:{Accept:"application/json"}});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json(); render(data);
    status.textContent = "Latest published content loaded"; status.classList.add("show"); setTimeout(() => status.classList.remove("show"), 2200);
  } catch (error) {
    console.info("Using the site’s deployed content snapshot.", error);
  }
}

refreshContent();
