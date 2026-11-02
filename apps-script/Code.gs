const FULLPSYCH = Object.freeze({
  sourceDocumentId: '1NA7cSprKUmmTDUERJcAbye3LJ5qal98SfzzZI8JEJM0',
  pageMap: {
    'Home': {slug:'home', title:'Nathan Puls, PMHNP-BC', eyebrow:'Psychiatric medication management'},
    'About Me': {slug:'about', title:'About Nathan', eyebrow:'Collaborative, evidence-based care'},
    'My Approach': {slug:'approach', title:'My approach', eyebrow:'Care that starts with understanding'},
    'Your First Visit': {slug:'first-visit', title:'Your first visit', eyebrow:'Comfortable, straightforward, productive'},
    'Medication Guide': {slug:'medication-guide', title:'Medication guide', eyebrow:'Topics we may discuss'},
    'FAQs': {slug:'faqs', title:'Questions & resources', eyebrow:'Practical information'}
  }
});

function onOpen() {
  DocumentApp.getUi().createMenu('FullPsych')
    .addItem('Preview publish', 'previewPublish')
    .addItem('Publish website', 'publishWebsite')
    .addSeparator().addItem('Publisher setup', 'showSetup').addToUi();
}

function showSetup() {
  const props = PropertiesService.getScriptProperties();
  const configured = Boolean(props.getProperty('PUBLISH_URL') && props.getProperty('PUBLISH_SECRET'));
  DocumentApp.getUi().alert('FullPsych publisher', configured ? 'Publisher credentials are configured for this document.' : 'Setup required: add PUBLISH_URL and PUBLISH_SECRET in Apps Script → Project Settings → Script Properties. See DEPLOYMENT.md in the fullpsych repository.');
}

function previewPublish() {
  try {
    const payload = buildPayload_();
    const count = payload.pages.reduce((n, page) => n + page.blocks.length, 0);
    DocumentApp.getUi().alert('Ready to publish', payload.pages.length + ' source tabs and ' + count + ' content blocks passed validation.\n\nReview the document carefully. It must contain only public professional information—never patient names, messages, appointment details, diagnoses, recordings, or other PHI.');
  } catch (error) { DocumentApp.getUi().alert('Cannot publish', error.message); }
}

function publishWebsite() {
  const ui = DocumentApp.getUi();
  if (ui.alert('Publish FullPsych.com?', 'Confirm that this document contains only public professional information and no patient-specific or protected health information.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('PUBLISH_URL'); const secret = props.getProperty('PUBLISH_SECRET');
    if (!url || !secret) throw new Error('Publisher setup is incomplete. Choose FullPsych → Publisher setup.');
    const body = JSON.stringify(buildPayload_()); const timestamp = String(Date.now());
    const signature = toHex_(Utilities.computeHmacSha256Signature(timestamp + '.' + body, secret));
    const response = UrlFetchApp.fetch(url, {method:'post', contentType:'application/json', payload:body, muteHttpExceptions:true, headers:{'X-FullPsych-Timestamp':timestamp,'X-FullPsych-Signature':signature}});
    const result = JSON.parse(response.getContentText() || '{}');
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !result.ok) throw new Error(result.error || 'Publisher returned HTTP ' + response.getResponseCode());
    ui.alert('Published', 'Version ' + result.version + ' is live. Refresh FullPsych.com in a few seconds.', ui.ButtonSet.OK);
  } catch (error) { ui.alert('Publish failed', error.message, ui.ButtonSet.OK); }
}

function buildPayload_() {
  const doc = DocumentApp.getActiveDocument();
  if (doc.getId() !== FULLPSYCH.sourceDocumentId) throw new Error('This script is bound to the wrong document.');
  const pages = doc.getTabs().map(function(tab) {
    const config = FULLPSYCH.pageMap[tab.getTitle()]; if (!config) return null;
    const blocks = serializeBody_(tab.asDocumentTab().getBody(), config.slug);
    const firstParagraph = blocks.find(function(b){ return b.type === 'paragraph'; });
    return {sourceTab:tab.getTitle(), slug:config.slug, title:config.title, eyebrow:config.eyebrow, summary:firstParagraph ? plainText_(firstParagraph.spans) : '', blocks:blocks};
  }).filter(Boolean);
  if (pages.length !== Object.keys(FULLPSYCH.pageMap).length) throw new Error('All six named source tabs are required.');
  return {schemaVersion:1, sourceDocumentId:doc.getId(), publishedAt:new Date().toISOString(), version:'pending', pages:pages};
}

function serializeBody_(body, slug) {
  const blocks = []; let pendingTimeline = null; let faqQuestion = null;
  for (let i = 0; i < body.getNumChildren(); i++) {
    const child = body.getChild(i); const type = child.getType();
    if (type !== DocumentApp.ElementType.PARAGRAPH && type !== DocumentApp.ElementType.LIST_ITEM) continue;
    const paragraph = type === DocumentApp.ElementType.LIST_ITEM ? child.asListItem() : child.asParagraph();
    const text = paragraph.getText().trim(); if (!text) continue;
    const heading = String(paragraph.getHeading()); const spans = serializeSpans_(paragraph);
    if (type === DocumentApp.ElementType.LIST_ITEM) { blocks.push({type:'listItem', spans:spans}); continue; }
    const level = heading.indexOf('HEADING') === 0 ? Number(heading.split('_')[1] || 2) : null;
    if (slug === 'about' && !level && /^(2010|2020|2020–25|2025|Today)$/.test(text)) { pendingTimeline = text; continue; }
    if (slug === 'about' && pendingTimeline && level === 3) { blocks.push({type:'timeline', year:pendingTimeline, title:text, text:''}); pendingTimeline = null; continue; }
    if (slug === 'about' && blocks.length && blocks[blocks.length-1].type === 'timeline' && !blocks[blocks.length-1].text) { blocks[blocks.length-1].text = text; continue; }
    if (slug === 'approach' && level === 3) { blocks.push({type:'principle', title:text, text:''}); continue; }
    if (slug === 'approach' && blocks.length && blocks[blocks.length-1].type === 'principle' && !blocks[blocks.length-1].text) { blocks[blocks.length-1].text = text; continue; }
    if (slug === 'faqs' && level === 3) { faqQuestion = text; continue; }
    if (slug === 'faqs' && faqQuestion) { blocks.push({type:'faq', question:faqQuestion, spans:spans}); faqQuestion = null; continue; }
    if (level) blocks.push({type:'heading', level:Math.min(3, Math.max(2, level)), spans:spans});
    else if (spans.length === 1 && spans[0].href) blocks.push({type:'link', spans:spans});
    else blocks.push({type:'paragraph', spans:spans});
  }
  return blocks;
}

function serializeSpans_(paragraph) {
  const text = paragraph.editAsText(); const raw = text.getText(); if (!raw) return [];
  const indices = text.getTextAttributeIndices(); const spans = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i], end = (i + 1 < indices.length ? indices[i + 1] : raw.length) - 1;
    const value = raw.substring(start, end + 1); if (!value) continue;
    const attrs = text.getAttributes(start); const span = {text:value};
    if (attrs[DocumentApp.Attribute.BOLD]) span.bold = true;
    if (attrs[DocumentApp.Attribute.ITALIC]) span.italic = true;
    const href = text.getLinkUrl(start); if (href && /^(https?:|tel:|mailto:)/i.test(href)) span.href = href;
    spans.push(span);
  }
  return spans;
}

function plainText_(spans) { return spans.map(function(span){return span.text;}).join(''); }
function toHex_(bytes) { return bytes.map(function(byte){const value=(byte<0?byte+256:byte).toString(16);return value.length===1?'0'+value:value;}).join(''); }
