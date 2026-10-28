(() => {
  'use strict';

  const C = window.PROMTDIRECTOR_CONFIG || {};
  const prompt_conflictPolicy = C.conflictPolicy || {reference:true,project:false,overrides:false,semantic:false};
  const defaultEngine = C.defaultEngine === 'standard' ? 'standard' : 'direct';
  // Optional, session-only diagnostic: only server-confirmed HTTP attempts.
  // No storage and no generated prompt text or credentials in the counter.
  let prompt_aiRequestStatsLast = null;
  function prompt_renderAiRequestStats(stats=null) {
    if (!C.aiRequestStatsEnabled) return;
    prompt_aiRequestStatsLast = stats && typeof stats === 'object' ? stats : null;
    const toggle=document.getElementById('pdir_aiRequestStatsToggle');
    const visible=!!prompt_aiRequestStatsLast && (!toggle || toggle.checked);
    for(const id of ['pdir_aiRequestStats','pdir_aiRequestStatsRevision']) {
      const el=document.getElementById(id);
      if(!el)continue;
      el.classList.toggle('prompt_hidden',!visible);
      if(!visible){el.textContent='';continue;}
      const stats=prompt_aiRequestStatsLast;
      const value=(k)=>Number.isFinite(Number(stats[k])) ? Math.max(0,Math.floor(Number(stats[k]))) : 0;
      el.textContent=`OpenRouter-Anfragen (Versuche) · Generierung: ${value('generation')} · KI-Prüfung: ${value('audit')} · Korrektur: ${value('repair')} · Gesamt: ${value('total')}`;
    }
  }

  let prompt_semanticLastHash='';
  let prompt_semanticProjectId='';
  let prompt_semanticChecked=false;
  let prompt_lastVisibleInputHash='';
  const prompt_refDefaults = C.referenceDefaults || {description:'reference',format:'combined'};
  const root = document.getElementById('prompt_root');
  if (!root) return;
  // DOM lookup helper must be initialized before its first use.
  const $ = (id) => document.getElementById(id);

  // SEC-01: no password is ever persisted by this client. Clear fields
  // rehydrated by browser history / bfcache as an additional safeguard.
  window.addEventListener('pageshow', () => {
    const field = document.getElementById('prompt_masterPassword');
    if (field) field.value = '';
  });

  // Keep this browser's manual engine choice across reloads; backend default applies otherwise.
  const prompt_engineStorageKey = 'pdir_generation_engine_choice_v1';
  let prompt_selectedEngine = defaultEngine;
  try {
    const stored = window.localStorage.getItem(prompt_engineStorageKey);
    if (stored === 'standard' || stored === 'direct') prompt_selectedEngine = stored;
  } catch (_) {}
  if ($('prompt_generationEngine')) {
    $('prompt_generationEngine').value = prompt_selectedEngine;
    $('prompt_generationEngine').addEventListener('change', (event) => {
      const value = event.target.value === 'standard' ? 'standard' : 'direct';
      try { window.localStorage.setItem(prompt_engineStorageKey, value); } catch (_) {}
    });
  }
  let prompt_apiMode = 'llm';
  let prompt_inputMode = 'llm';
  let prompt_unlocked = false;
  let prompt_expiryTimer = null;
  let prompt_expiryInterval = null;
  let prompt_expiresAt = 0;
  let prompt_modelProfiles = {};
  let prompt_complexityMode = 'advanced';
  let prompt_referenceSeq = 0;
  let prompt_restoringReferences = false;
  let prompt_creativityMode = 'balanced';
  let prompt_workflow = 'choose';
  function prompt_applyWorkflow(mode) {
    prompt_workflow = mode==='customer' ? 'customer' : mode==='free' ? 'free' : 'choose';
    root.dataset.pdirWorkflow = prompt_workflow;
    const main=$('prompt_mainInterface');
    if(main)main.dataset.pdirFlow=prompt_workflow;
    $('pdir_flowChooser')?.classList.toggle('prompt_hidden',prompt_workflow!=='choose');
    $('pdir_flowEditor')?.classList.toggle('prompt_hidden',prompt_workflow==='choose');
    if($('pdir_flowLabel'))$('pdir_flowLabel').textContent=prompt_workflow==='customer'?'Kundenprojekt · Kunde → Projekt → Shot':'Freie / schnelle Idee';
    if($('pdir_workspaceSubtitle'))$('pdir_workspaceSubtitle').textContent=prompt_workflow==='customer'?'Kunde · Projekt · Shot':'Freie Projekte · Consistency Locks';
    if($('pdir_workspaceDesc'))$('pdir_workspaceDesc').textContent=prompt_workflow==='customer'?'Kundenprojekte und Promptversionen verwalten.':'Freie Projekte und Promptversionen verwalten.';
    if($('pdir_shotIdeaHint'))$('pdir_shotIdeaHint').hidden=prompt_workflow!=='customer';
    // Without Project Workspace, the free workflow starts directly at 01.
    const numbering={prompt_ideaAccordion:['01','02'],prompt_referenceAccordion:['02','03'],prompt_production:['04','04'],prompt_revisionModule:['03','05'],prompt_checkAccordion:['04','06']};
    Object.entries(numbering).forEach(([id,values])=>{const number=$(id)?.querySelector(':scope > summary .prompt_accordion-number');if(number)number.textContent=values[prompt_workflow==='free'?0:1];});
    pdir_updateShotHeading();
    pdir_restoreShotTargetModel();
    customer_renderBriefingEditor();
    if($('prompt_projectDirection'))$('prompt_projectDirection').readOnly=prompt_workflow==='customer';
    if(prompt_workflow==='free'){$('prompt_ideaAccordion')?.setAttribute('open','');}
    if(prompt_workflow==='customer'){
      prompt_setInputMode('llm');
      $('prompt_projectDirectionAccordion')?.setAttribute('open','');
    }
  }
  async function prompt_switchWorkflow(mode) {
    if(prompt_busy)return;
    if(prompt_workflow !== 'free' && !await prompt_guardUnsaved())return;
    clearTimeout(prompt_autosaveTimer);prompt_autosaveTimer=null;
    prompt_liveRequest=null; // Discard transient request details when changing workflows.
    prompt_activeProjectId='';prompt_customerFilter='';prompt_projectHistory=[];
    prompt_resetWorkspace();
    prompt_applyWorkflow(mode);
    customer_render();prompt_renderProjects();prompt_renderProjectHistory();prompt_markSaved();
  }

  let prompt_projects = {};
  let prompt_activeProjectId = '';
  let prompt_projectHistory = [];
  // The API request details are available only for the newly generated version in this tab.
  // Do not write this object to WordPress, cookies, browser storage or console.
  let prompt_liveRequest = null;
  function prompt_requestTextFor(item) {
    const current = prompt_liveRequest;
    if (current && item &&
        current.project === prompt_activeProjectId &&
        current.shot === String(item.shot_id || '') &&
        current.version === Number(item.version) &&
        current.version > 0) {
      return current.text;
    }
    return 'Request Summary für diese historische Promptversion nicht gespeichert.';
  }
  let pdir_historyScope='shot';
  let prompt_toastTimer = null;
  let prompt_toastError = false;

  let prompt_customers = {}, prompt_customerFilter = '', prompt_workspaceCustomer = '', prompt_customerSnapshot = {};
  let prompt_savedFingerprint = '', prompt_busy = false;
  let prompt_activePresetAuditTicket = '';
  // The visible version and the still-running audit requests are kept distinct.
  // An older HTTP response must never repaint a different project, shot or version.
  let prompt_displayedAuditContext = null;
  const prompt_runningPresetAudits = new Map();
  const prompt_presetRetryBusy = new Set();
  let prompt_currentQualityAudit = null;
  const prompt_presetRetryKey=(context,kind)=>[context?.project||'',Number(context?.version||0),context?.ticket||'',kind].join('|');
  function prompt_setDisplayedAuditContext(project,version,shot,ticket='') {
    prompt_displayedAuditContext = {project:String(project||''),version:Number(version||0),shot:String(shot||''),ticket:String(ticket||'')};
  }
  function prompt_auditContextMatches(a,b) {
    return !!a && !!b && a.project===b.project && a.version===b.version && a.shot===b.shot &&
      (a.version>0 || (a.ticket!=='' && a.ticket===b.ticket));
  }
  function prompt_livePresetAuditForDisplayedVersion() {
    for(const context of prompt_runningPresetAudits.values()) {
      if(prompt_auditContextMatches(context,prompt_displayedAuditContext))return true;
    }
    return false;
  }
  let prompt_outputReviewTarget = null;
  let prompt_outputReviewBusy = false;
  let prompt_autosaveTimer = null, prompt_autosaveFlight = null, prompt_autosaveBlocked = false;
  let prompt_autosaveError = '';
  const prompt_autosaveDelay = 1100;
  const customer_ruleText = c => [c.rules, c.features ? 'Unveränderliche Merkmale: '+c.features : '', c.exclusions ? 'Grundsätzliche Ausschlüsse: '+c.exclusions : ''].filter(Boolean).join('\n\n');
  const customer_briefKeys=['name','brand','rules','features','exclusions'];
  function customer_briefFields(c={}){return Object.fromEntries(customer_briefKeys.map(k=>[k,String(c[k]||'')]));}
  function customer_briefSnapshot(c={}){return {...customer_briefFields(c),id:c.id||'',revision:Number(c.revision||0),brief_version:Number(c.brief_version||0)};}
  function customer_briefChanged(c,snapshot){return customer_briefKeys.some(k=>String(c?.[k]||'')!==String(snapshot?.[k]||''));}
  function customer_briefDisplay(c){return customer_briefKeys.map(k=>k+': '+(c?.[k]||'—')).join('\n\n');}
  function customer_renderBriefingEditor(){
    const c=prompt_customers[prompt_customerFilter];
    const form=$('pdir_customerBriefingEditor');if(!form)return;
    const enabled=prompt_workflow==='customer' && !!c;
    form.hidden=!enabled;
    customer_briefKeys.forEach(k=>{const el=$('pdir_brief_'+k);if(el)el.value=c?.[k]||'';});
    const label=$('pdir_customerBriefVersion');if(label)label.textContent=c?'Kundenbriefing V'+(c.brief_version||1)+' · Profilrevision '+c.revision:'Kein Kunde ausgewählt';
    const button=$('pdir_customerBriefSave');if(button)button.disabled=!enabled;
    const panel=$('pdir_customerBriefingPanel');if(panel)panel.hidden=prompt_workflow!=='customer';
  }
  function customer_briefDirty(){
    const form=$('pdir_customerBriefingEditor'), c=prompt_customers[prompt_customerFilter];
    if(!form || form.hidden || !c)return false;
    return customer_briefKeys.some(k=>($('pdir_brief_'+k)?.value||'')!==(c[k]||''));
  }
  async function customer_saveBriefing(){
    const c=prompt_customers[prompt_customerFilter];if(!c)throw new Error('Bitte zuerst einen Kunden auswählen.');
    const values=Object.fromEntries(customer_briefKeys.map(k=>[k,$('pdir_brief_'+k)?.value||'']));
    if(!values.name.trim())throw new Error('Kundenname fehlt.');
    if(customer_ruleText(values).length>4000)throw new Error('Die zusammengefassten Kundenvorgaben dürfen höchstens 4000 Zeichen enthalten.');
    if(!customer_briefChanged(c,values)){prompt_showToast('Keine Briefingänderung vorhanden.');return;}
    const ok=await window.PDIRDialog.confirm('Neuen Kundenbriefing-Stand speichern? Bereits angelegte Projekte und ihre bisherigen Promptversionen bleiben unverändert. Neue Projekte erhalten die neue Version.',{title:'Kundenbriefing versionieren',accept:'Neue Version speichern'});
    if(!ok)return;
    const data=await prompt_api('/customers',{method:'POST',body:{customer_id:c.id,expected_revision:c.revision,customer:{...values,archived:Boolean(c.archived)}}});
    prompt_customers[c.id]=data.customer;
    customer_render();prompt_showToast('Kundenbriefing V'+(data.customer.brief_version||1)+' gespeichert. Bestehende Projekte bleiben unverändert.');
  }
  function prompt_setSaveStatus(state, detail='') {
    const el=$('prompt_autosaveStatus');
    if (!el) return;
    if(prompt_workflow==='free'){el.textContent='Temporäre Idee · wird nicht gespeichert';el.dataset.state='idle';return;}
    const labels={idle:'Kein Projekt ausgewählt · Änderungen noch nicht gespeichert',saved:'Alle Änderungen gespeichert',dirty:'Änderungen noch nicht gespeichert',saving:'Speichert …',error:'Speichern fehlgeschlagen',conflict:'Speicherkonflikt – Projekt neu prüfen'};
    el.textContent=(labels[state] || labels.dirty)+(detail ? ' · '+detail : '');
    const prev = el.dataset.state || 'idle';
    el.dataset.state=state;
    if ((state==='error'||state==='conflict') && (prev!==state || detail!==el.dataset.lastError)) {
      el.dataset.lastError=detail;
      prompt_showToast(el.textContent,true);
    }
    // Toasts are emitted by prompt_flushAutosave() only after the
    // matching workspace snapshot has been acknowledged by the server.
  }
  function prompt_updateRuleStatus(){
    const el=$('prompt_rulesStatus');if(!el)return;
    const c=prompt_customers[prompt_workspaceCustomer], snapshot=prompt_customerSnapshot;
    const project=prompt_projects[prompt_activeProjectId];
    const outdated=Boolean(c&&project&&customer_briefChanged(c,snapshot));
    const sync=!c?'Kein Kundenprofil':!project?'Noch kein Projekt ausgewählt':!snapshot?.id?'Noch nicht übernommen':outdated?'Neue Kundenbriefing-Version verfügbar':'Kundenbriefing V'+(snapshot.brief_version||'Bestandsstand')+' aktiv';
    el.textContent='Kunde: '+sync+' · Projektregeln: '+($('pdir_projectRules')?.value.trim()?'aktiv':'leer')+' · Consistency Locks: '+prompt_getConsistencyLocks().length+' aktiv';
    el.dataset.outdated=outdated?'true':'false';
    const apply=$('prompt_customerApply');if(apply){apply.hidden=!outdated;apply.disabled=!outdated;}
    const info=$('pdir_projectBriefVersion');if(info)info.textContent=project&&snapshot?.id?'Für dieses Projekt bestätigt: Kundenbriefing '+(snapshot.brief_version?'V'+snapshot.brief_version:'historischer Bestandsstand')+(outdated?' · Neu: V'+(c.brief_version||1):''):'Noch kein bestätigter Kundenbriefing-Stand im Projekt.';
  }
  function prompt_markSaved(snapshot=prompt_workspaceSnapshot()){
    prompt_savedFingerprint=JSON.stringify(snapshot);
    prompt_autosaveError='';prompt_autosaveBlocked=false;
    prompt_setSaveStatus(prompt_activeProjectId?'saved':'idle');prompt_updateRuleStatus();
  }
  function prompt_isDirty(){return prompt_savedFingerprint!==JSON.stringify(prompt_workspaceSnapshot());}
  function prompt_scheduleAutosave(){
    if(prompt_workflow==='free')return;
    prompt_updateRuleStatus();
    if(!prompt_isDirty()){if(!prompt_autosaveFlight)prompt_setSaveStatus(prompt_activeProjectId?'saved':'idle');return;}
    if(!prompt_activeProjectId || !prompt_projects[prompt_activeProjectId]){prompt_setSaveStatus('idle');return;}
    if(prompt_autosaveBlocked){prompt_setSaveStatus('conflict','Bitte manuell prüfen');return;}
    prompt_setSaveStatus('dirty');
    clearTimeout(prompt_autosaveTimer);
    prompt_autosaveTimer=setTimeout(()=>{void prompt_flushAutosave();},prompt_autosaveDelay);
  }
  async function prompt_flushAutosave(){
    if(prompt_workflow==='free')return true;
    clearTimeout(prompt_autosaveTimer);prompt_autosaveTimer=null;
    if(prompt_autosaveFlight){await prompt_autosaveFlight;return !prompt_isDirty();}
    if(!prompt_activeProjectId || !prompt_projects[prompt_activeProjectId] || !prompt_isDirty())return true;
    if(prompt_autosaveBlocked)return false;
    const id=prompt_activeProjectId,project=prompt_projects[id];
    const snapshot=prompt_workspaceSnapshot(project.name), fingerprint=JSON.stringify(snapshot);
    prompt_setSaveStatus('saving');
    prompt_autosaveFlight=(async()=>{
      try{
        const data=await prompt_api('/projects',{method:'POST',body:{project_id:id,expected_revision:project.revision,workspace:snapshot}});
        prompt_projects[id]=data.project;
        // Mark only the transmitted snapshot as stored: never mark newer keystrokes saved.
        if(id===prompt_activeProjectId){
          prompt_savedFingerprint=fingerprint;prompt_autosaveError='';
          if(!prompt_isDirty()){
            prompt_setSaveStatus('saved');
            prompt_showToast('Projekt gespeichert');
          }else{
            // Newer edits are still pending: do not claim they have been saved.
            prompt_setSaveStatus('dirty');
          }
        }
        return true;
      }catch(error){
        if(id===prompt_activeProjectId){
          prompt_autosaveError=error.message || 'Server nicht erreichbar';
          prompt_autosaveBlocked=String(prompt_autosaveError).includes('409') || /konflikt|geändert|neu laden/i.test(prompt_autosaveError);
          prompt_setSaveStatus(prompt_autosaveBlocked?'conflict':'error',prompt_autosaveError);
        }
        return false;
      }
    })();
    const ok=await prompt_autosaveFlight;prompt_autosaveFlight=null;
    if(ok&&id===prompt_activeProjectId&&prompt_isDirty())prompt_scheduleAutosave();
    return ok;
  }
  async function prompt_guardUnsaved(){
    // Free ideas are intentionally disposable and have no persistent project.
    if(prompt_workflow === 'free') return true;
    if(customer_briefDirty()){
      const answer=await window.PDIRDialog.open({title:'Kundenbriefing noch nicht gespeichert',message:'Nicht gespeicherte Änderungen am Kundenbriefing vorhanden. Als neue Version speichern oder bewusst verwerfen?',choices:[{value:'save',label:'Neue Briefing-Version speichern',primary:true},{value:'discard',label:'Änderungen verwerfen'}]});
      if(!answer)return false;
      if(answer.choice==='save'){
        await customer_saveBriefing();
        if(customer_briefDirty())return false;
      } else customer_renderBriefingEditor();
    }
    clearTimeout(prompt_autosaveTimer);prompt_autosaveTimer=null;
    if(prompt_autosaveFlight)await prompt_autosaveFlight;
    if(!prompt_isDirty())return true;
    if(prompt_activeProjectId&&!prompt_autosaveBlocked){
      if(await prompt_flushAutosave())return true;
    }
    const answer=await window.PDIRDialog.open({title:'Nicht gespeicherte Änderungen',message:'Automatisches Speichern war nicht möglich. Erneut speichern oder Änderungen bewusst verwerfen?',choices:[{value:'save',label:'Erneut speichern',primary:true},{value:'discard',label:'Änderungen verwerfen'}]});
    if(!answer)return false;
    if(answer.choice==='save')return await prompt_saveProject();
    return true;
  }
  function prompt_guardAction(fn){return async(...args)=>{if(prompt_busy){prompt_showToast('Bitte laufenden Vorgang abschließen.',true);return;}prompt_busy=true;try{return await fn(...args);}catch(e){prompt_showToast(e.message,true);}finally{prompt_busy=false;}};}
  function customer_render(){
    const selected=prompt_customerFilter, showArchived=$('prompt_customerArchived')?.checked;
    const select=$('prompt_customerFilter');
    if(select){select.replaceChildren(new Option('Freie Projekte',''));
      Object.values(prompt_customers).filter(c=>showArchived||!c.archived||c.id===selected).sort((a,b)=>a.name.localeCompare(b.name)).forEach(c=>select.add(new Option(c.name+(c.archived?' · archiviert':''),c.id)));
      select.value=selected;
    }
    customer_assignmentOptions();
    const c=prompt_customers[selected];
    $('prompt_customerEdit').disabled=!c;
    $('prompt_customerArchive').disabled=!c;
    $('prompt_customerDelete').disabled=!c;
    $('prompt_customerArchive').textContent=c?.archived?'Kunde reaktivieren':'Kunde archivieren';
    customer_renderBriefingEditor();
  }
  function customer_assignmentOptions(){
    const el=$('prompt_projectCustomer');if(!el)return;
    el.replaceChildren(new Option('Ohne Kundenzuordnung',''));
    Object.values(prompt_customers).filter(c=>!c.archived||c.id===prompt_workspaceCustomer).sort((a,b)=>a.name.localeCompare(b.name)).forEach(c=>el.add(new Option(c.name+(c.archived?' · archiviert':''),c.id)));
    el.value=prompt_workspaceCustomer;
    const source=prompt_customerSnapshot, current=prompt_customers[prompt_workspaceCustomer];
    const outdated=Boolean(current&&customer_briefChanged(current,source));
    $('prompt_customerSnapshotInfo').textContent=source.id ? source.name+' · Kundenbriefing '+(source.brief_version?'V'+source.brief_version:'historischer Bestandsstand')+(outdated?' · Neue Version V'+(current.brief_version||1)+' verfügbar. Übernahme nur nach Vergleich.':' · übernommen und geschützt.') : 'Keine Kundenvorgaben im Projekt übernommen.';
    if($('prompt_projectCustomer'))$('prompt_projectCustomer').disabled=prompt_workflow==='customer';
    $('prompt_customerApply').disabled=!current || !outdated || !prompt_activeProjectId;
    prompt_updateRuleStatus();
  }
  async function customer_load(){
    const data=await prompt_api('/customers');prompt_customers=data.customers || {};customer_render();
  }
  async function customer_edit(create=false){
    const old=create?null:prompt_customers[prompt_customerFilter];if(!create&&!old)return;
    if(!create && prompt_workflow==='customer'){
      $('prompt_production')?.setAttribute('open','');
      $('pdir_customerBriefingPanel')?.setAttribute('open','');
      $('pdir_customerBriefingEditor')?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    const fields=[['name','Kundenname',120],['brand','Marke',200],['rules','Marken- und Gestaltungsregeln',2400],['features','Unveränderliche Merkmale',800],['exclusions','Grundsätzliche Ausschlüsse',600]].map(([key,label,maxLength])=>({key,label,maxLength,required:key==='name',type:['rules','features','exclusions'].includes(key)?'textarea':'text',value:old?.[key] || ''}));
    const answer=await window.PDIRDialog.open({title:create?'Kunde anlegen':'Kundenprofil bearbeiten',message:'Kundenprofil speichern. Bestehende Projektkopien werden nicht automatisch verändert.',fields,accept:'Kundenprofil speichern',validate:values=>customer_ruleText(values).length>4000?'Die zusammengefassten Vorgaben dürfen höchstens 4000 Zeichen enthalten.':''});
    if(!answer)return;
    if(create&&!await prompt_guardUnsaved())return;
    const data=await prompt_api('/customers',{method:'POST',body:{customer_id:old?.id || '',expected_revision:old?.revision || 0,customer:{...answer.values,archived:Boolean(old?.archived)}}});
    prompt_customers[data.customer_id]=data.customer;
    if(create){prompt_customerFilter=data.customer_id;prompt_activeProjectId='';prompt_resetWorkspace();prompt_renderProjects();prompt_markSaved();}
    customer_render();prompt_updateRuleStatus();prompt_showToast('Kundenprofil gespeichert. Projekte übernehmen Änderungen erst nach Bestätigung.');
  }
  async function customer_archive(){
    const c=prompt_customers[prompt_customerFilter];if(!c)return;
    if(!await window.PDIRDialog.confirm(c.archived?'Kunde wieder für neue Projekte verfügbar machen?':'Kundenprofil archivieren? Vorhandene Projekte, Vorgaben und Versionen bleiben erhalten.',{title:c.archived?'Kunde reaktivieren':'Kunde archivieren',accept:c.archived?'Reaktivieren':'Archivieren'}))return;
    const data=await prompt_api('/customers',{method:'POST',body:{customer_id:c.id,expected_revision:c.revision,customer:{...c,archived:!c.archived}}});
    prompt_customers[c.id]=data.customer;customer_render();prompt_showToast(c.archived?'Kunde reaktiviert.':'Kunde archiviert.');
  }
  async function customer_delete(){
    const c=prompt_customers[prompt_customerFilter];if(!c)return;
    // Never allow removal of a customer associated with a project.
    const attached=Object.values(prompt_projects).filter(p=>p.customer_id===c.id).length;
    if(attached){prompt_showToast('Kunde ist '+attached+' Projekt(en) zugeordnet. Erst Projekte bewusst entkoppeln oder Kunden archivieren.',true);return;}
    if(!await prompt_guardUnsaved())return;
    const answer=await window.PDIRDialog.open({
      title:'Kundenprofil endgültig löschen',danger:true,
      message:'Das Profil „'+c.name+'“ wird unwiderruflich gelöscht. Zugeordnete Projekte dürfen nicht existieren. Zum Bestätigen LÖSCHEN eingeben.',
      fields:[{key:'confirmation',label:'Sicherheitsbestätigung',required:true,maxLength:20}],
      accept:'Endgültig löschen',validate:values=>values.confirmation==='LÖSCHEN'?'':'Bitte exakt LÖSCHEN eingeben.'
    });
    if(!answer)return;
    await prompt_api('/customers',{method:'DELETE',body:{customer_id:c.id,expected_revision:c.revision,confirmation:'LÖSCHEN'}});
    delete prompt_customers[c.id];prompt_customerFilter='';customer_render();prompt_renderProjects();prompt_showToast('Kundenprofil endgültig gelöscht.');
  }
  async function customer_select(){
    const next=$('prompt_customerFilter').value;
    if(!await prompt_guardUnsaved()){$('prompt_customerFilter').value=prompt_customerFilter;return;}
    prompt_customerFilter=next;prompt_activeProjectId='';prompt_resetWorkspace();prompt_renderProjects();customer_render();prompt_markSaved();
  }
  async function customer_assign(){
    const next=$('prompt_projectCustomer').value;
    if(next===prompt_workspaceCustomer)return;
    if(!await window.PDIRDialog.confirm('Die Zuordnung ändern? Vorhandene Projektregeln bleiben erhalten. Neue Kundenvorgaben übernehmen Sie separat nach einem Vergleich.',{title:'Kundenzuordnung ändern',accept:'Zuordnen'})){$('prompt_projectCustomer').value=prompt_workspaceCustomer;return;}
    prompt_workspaceCustomer=next;
    const c=prompt_customers[next];prompt_customerSnapshot=c?{id:c.id,name:c.name,brand:c.brand,revision:0,brief_version:0}:{};
    customer_assignmentOptions();prompt_scheduleAutosave();prompt_showToast('Kundenzuordnung geändert.');
  }
  async function customer_apply(){
    const c=prompt_customers[prompt_workspaceCustomer],project=prompt_projects[prompt_activeProjectId];
    if(!c||!project)throw new Error('Bitte zuerst ein Kundenprojekt auswählen.');
    if(!await prompt_guardUnsaved())return;
    const current=prompt_projects[prompt_activeProjectId];
    if(!customer_briefChanged(c,current.customer_snapshot||{})){prompt_showToast('Projekt verwendet bereits dieselben Kundenvorgaben.');return;}
    const answer=await window.PDIRDialog.open({
      title:'Kundenbriefing V'+(c.brief_version||1)+' übernehmen',
      message:'Nur dieses Projekt wird aktualisiert. Andere Projekte, Shots und bereits generierte Promptversionen bleiben unverändert. Die Änderungen werden vor der Übernahme verglichen.',
      diff:{before:customer_briefDisplay(current.customer_snapshot),after:customer_briefDisplay(c)},
      accept:'Änderungen übernehmen'
    });
    if(!answer)return;
    const data=await prompt_api('/projects/customer-briefing/apply',{method:'POST',body:{
      project_id:prompt_activeProjectId,expected_revision:current.revision,
      expected_customer_version:Number(c.brief_version||1),expected_customer_revision:c.revision,
      confirmation:'ÜBERNEHMEN'
    }});
    prompt_projects[prompt_activeProjectId]=data.project;
    prompt_restoreWorkspace(data.project);
    prompt_markSaved();prompt_markSemanticDirty();
    prompt_showToast('Kundenbriefing V'+data.applied_brief_version+' für dieses Projekt übernommen. Alte Prompts unverändert.');
  }
  function prompt_resetWorkspace(){
    prompt_displayedAuditContext=null;
    prompt_workspaceCustomer='';prompt_customerSnapshot={};
    prompt_restoreWorkspace({target_model:Object.keys(prompt_modelProfiles)[0] || 'flux',creativity:'balanced'});
    prompt_projectHistory=[];prompt_renderProjectHistory();
    ['prompt_originalPrompt','prompt_experimentOutput','production_change'].forEach(id=>{if($(id))$(id).value='';});pdir_setPositive('');prompt_updateNegativeResult('');
    $('production_revision').value='';$('production_qualityAck').checked=false;production_qualityFingerprint='';
    if($('pdir_revisionOverride'))$('pdir_revisionOverride').checked=false;
    $('production_quality').replaceChildren();$('prompt_resultArea')?.classList.add('prompt_hidden');
    production_diff({});prompt_setComplexityMode('advanced');
  }
  async function prompt_createProject(duplicate=false){
    const original=prompt_workspaceSnapshot();
    if(!duplicate&&!await prompt_guardUnsaved())return false;
    const c=prompt_customers[duplicate?original.customer_id:(prompt_workflow==='customer'?prompt_customerFilter:'')];
    if(!duplicate && prompt_workflow==='customer' && !c){prompt_showToast('Bitte zuerst einen Kunden auswählen oder anlegen.',true);return false;}
    if(c?.archived){prompt_showToast('Archivierten Kunden zuerst reaktivieren.',true);return false;}
    const answer=await window.PDIRDialog.open({title:duplicate==='save'?'Arbeitsstand als Projekt speichern':duplicate?'Projekt duplizieren':'Neues Projekt',message:duplicate?'Kopiert den aktuellen Arbeitsstand. Der alte Verlauf und Ergebnislinks werden nicht kopiert.':'Startet mit leeren Eingaben, Briefing, Shots und Referenzen. Nur die Kundenvorgaben werden übernommen.',fields:[{key:'name',label:'Projektname',required:true,maxLength:80,value:duplicate==='save'?'':duplicate?original.name+' – Kopie':''}],accept:duplicate?'Kopie anlegen':'Projekt anlegen'});
    if(!answer)return false;
    const workspace=duplicate?{...original,name:answer.values.name}:{
      name:answer.values.name,target_model:Object.keys(prompt_modelProfiles)[0] || 'flux',
      workflow_mode:prompt_workflow==='customer'?'customer':'free',
      customer_id:c?.id || '',customer_snapshot:c?customer_briefSnapshot(c):{},direction:c?customer_ruleText(c):'',
      project_rules:'',project_priority_override:false,production:{},creativity:'balanced'
    };
    const data=await prompt_api('/projects',{method:'POST',body:{workspace}});
    prompt_projects[data.project_id]=data.project;prompt_customerFilter=data.project.customer_id || '';prompt_activeProjectId=data.project_id;
    customer_render();prompt_renderProjects(data.project_id);prompt_restoreWorkspace(data.project);prompt_projectHistory=[];prompt_renderProjectHistory();
    ['prompt_originalPrompt','prompt_experimentOutput','production_change'].forEach(id=>{if($(id))$(id).value='';});pdir_setPositive('');prompt_updateNegativeResult('');$('prompt_resultArea')?.classList.add('prompt_hidden');production_diff({});prompt_markSaved();
    prompt_showToast(duplicate?'Projekt dupliziert.':'Frisches Projekt angelegt.');return true;
  }
  async function prompt_renameProject(){
    const p=prompt_projects[prompt_activeProjectId];if(!p)return;
    const answer=await window.PDIRDialog.open({title:'Projekt umbenennen',fields:[{key:'name',label:'Projektname',value:p.name,required:true,maxLength:80}],accept:'Projekt speichern'});
    if(!answer)return;
    const snapshot=prompt_workspaceSnapshot(answer.values.name);
    const data=await prompt_api('/projects',{method:'POST',body:{project_id:prompt_activeProjectId,expected_revision:p.revision,workspace:snapshot}});
    prompt_projects[prompt_activeProjectId]=data.project;prompt_customerFilter=data.project.customer_id || '';prompt_renderProjects(prompt_activeProjectId);customer_render();prompt_markSaved(snapshot);
  }
  function customer_init(){
    $('pdir_customerBriefSave')?.addEventListener('click',prompt_guardAction(customer_saveBriefing));
    [['prompt_customerNew',()=>customer_edit(true)],['prompt_customerEdit',()=>customer_edit(false)],['prompt_customerArchive',customer_archive],['prompt_customerDelete',customer_delete],['prompt_customerRefresh',customer_load],['prompt_customerApply',customer_apply],['prompt_projectDuplicate',()=>prompt_createProject(true)],['prompt_projectRename',prompt_renameProject]].forEach(([id,fn])=>$(id)?.addEventListener('click',prompt_guardAction(fn)));
    $('prompt_customerFilter')?.addEventListener('change',prompt_guardAction(customer_select));
    $('prompt_projectCustomer')?.addEventListener('change',prompt_guardAction(customer_assign));
    $('prompt_customerArchived')?.addEventListener('change',customer_render);
    window.addEventListener('beforeunload',e=>{if(prompt_workflow!=='free'&&prompt_savedFingerprint&&prompt_isDirty()){e.preventDefault();e.returnValue='';}});
  }

  const prompt_isVideo = (key) => prompt_modelProfiles[key]?.type === 'video';
  const PROMPT_GLOBAL_NEGATIVE = 'low quality, worst quality, blurry, out of focus, distorted, deformed, bad anatomy, jpeg artifacts';
  const PROMPT_VIDEO_NEGATIVE = 'flickering, temporal inconsistency, glitchy';

  function prompt_showToast(msg, err = false) {
    const t=$('prompt_toast');if(!t)return;
    // #prompt_root is translated for Oxygen's responsive width. A fixed
    // descendant of a transformed element is positioned relative to that
    // element instead of the viewport, which hid the toast below the fold.
    // Portaling to <body> restores actual viewport-fixed positioning.
    if(document.body && t.parentNode!==document.body)document.body.appendChild(t);
    clearTimeout(prompt_toastTimer);prompt_toastTimer=null;
    prompt_toastError=err===true;
    t.replaceChildren();
    const label=document.createElement('span');label.textContent=msg;
    t.append(label);
    if(err){
      const close=document.createElement('button');close.type='button';close.className='prompt_toast-close';close.textContent='×';close.setAttribute('aria-label','Meldung schließen');
      close.addEventListener('click',()=>{t.className='prompt_toast';prompt_toastError=false;});t.append(close);
    }
    t.className='prompt_toast prompt_show'+(err===true?' prompt_error':err==='warning'?' prompt_warning':' prompt_success');
    t.setAttribute('role',err===true?'alert':'status');
    if(err!==true)prompt_toastTimer=setTimeout(()=>{t.className='prompt_toast';},3500);
  }

  function prompt_setInfo(title, message) {
    const box = $('prompt_sessionInfoBox');
    if (!box) return;
    const strong = document.createElement('strong');
    strong.textContent = title;
    box.replaceChildren(strong, document.createTextNode(' \u00a0' + message));
  }

  async function prompt_api(path, options = {}) {
    const response = await fetch(C.restUrl.replace(/\/$/, '') + path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': C.nonce || '',
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      const error = new Error(data?.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = data?.code || '';
      error.aiRequestStats = data?.data?.ai_requests || null;
      throw error;
    }
    return data;
  }

  function prompt_clearExpiry() {
    window.clearTimeout(prompt_expiryTimer);
    window.clearInterval(prompt_expiryInterval);
    prompt_expiryTimer = null;
    prompt_expiryInterval = null;
    prompt_expiresAt = 0;
  }

  function prompt_scheduleExpiry(seconds) {
    prompt_clearExpiry();
    const s = Math.max(0, Number(seconds || 0));
    if (!s) return;
    prompt_expiresAt = Date.now() + s * 1000;
    prompt_expiryTimer = window.setTimeout(() => {
      prompt_unlocked = false;
      prompt_showLock('API-Freigabe abgelaufen. Bitte erneut freischalten.');
      prompt_showToast('API automatisch gesperrt');
    }, s * 1000 + 250);
    prompt_expiryInterval = window.setInterval(prompt_updateExpiryDisplay, 30000);
    prompt_updateExpiryDisplay();
  }

  function prompt_updateExpiryDisplay() {
    if (!prompt_unlocked || !prompt_expiresAt) return;
    const sec = Math.max(0, Math.ceil((prompt_expiresAt - Date.now()) / 1000));
    const min = Math.max(1, Math.ceil(sec / 60));
    prompt_setInfo('API freigeschaltet.', `Der API-Key verbleibt auf dem Server. Freigabe noch ca. ${min} Min.`);
  }

  function prompt_showMain(seconds = 0) {
    prompt_unlocked = true;
    $('prompt_lockScreen')?.classList.add('prompt_hidden');
    $('prompt_mainInterface')?.classList.remove('prompt_hidden');
    prompt_apiMode = 'llm';
    if ($('prompt_btnText')) $('prompt_btnText').innerText = 'Generate prompt →';
    if ($('prompt_outputLabel')) $('prompt_outputLabel').innerText = 'Ready to paste into the selected model';
    prompt_scheduleExpiry(seconds);
  }

  function prompt_showLock(message) {
    prompt_clearExpiry();
    prompt_unlocked = false;
    $('prompt_mainInterface')?.classList.add('prompt_hidden');
    $('prompt_lockScreen')?.classList.remove('prompt_hidden');
    if ($('prompt_masterPassword')) $('prompt_masterPassword').value = '';
    if ($('prompt_lockMessage') && message) $('prompt_lockMessage').innerText = message;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function prompt_init() {
    // Authentication must initialize independently from optional workspace requests.
    prompt_bindEvents();
    try { prompt_bindAutosave(); } catch (error) { console.warn('PDIR autosave initialization:', error); }
    try { prompt_initGroupToggles(); } catch (error) { console.warn('PDIR group initialization:', error); }
    try { prompt_setCreativityMode('balanced'); } catch (error) { console.warn('PDIR creative mode:', error); }
    try {
      const status = await prompt_api('/status');
      if (!status.configured) {
        $('prompt_configNotice')?.classList.remove('prompt_hidden');
        if ($('prompt_unlockBtn')) $('prompt_unlockBtn').disabled = true;
        if ($('prompt_lockMessage')) $('prompt_lockMessage').innerText = 'Einrichtung im WordPress-Backend erforderlich.';
      } else if (status.unlocked) {
        prompt_showMain(status.expires_in || 0);
      } else {
        $('prompt_configNotice')?.classList.add('prompt_hidden');
        if ($('prompt_unlockBtn')) $('prompt_unlockBtn').disabled = false;
      }
    } catch (error) {
      // The unlock endpoint remains available even if the status request fails.
      if ($('prompt_lockMessage')) $('prompt_lockMessage').innerText = 'Statusabruf fehlgeschlagen: ' + (error.message || 'Unbekannter Fehler') + '. Freischaltung kann erneut versucht werden.';
      if ($('prompt_unlockBtn')) $('prompt_unlockBtn').disabled = false;
    }
    // Optional resources cannot block the API unlock flow or prompt generation.
    const optionalLoads = [
      ['Modelle', () => prompt_loadModels()],
      ['Lokale Presets', () => prompt_migrateLocalPresets()],
      ['Kunden', () => customer_load()],
      ['Projekte', () => prompt_loadProjects()]
    ];
    for (const [label, load] of optionalLoads) {
      try { await load(); } catch (error) { console.warn('PDIR ' + label + ':', error); }
    }
    try { customer_init(); } catch (error) { console.warn('PDIR customer controls:', error); }
    try { prompt_markSaved(); } catch (error) { console.warn('PDIR saved state:', error); }
    try { prompt_setComplexityMode('simple'); } catch (error) { console.warn('PDIR complexity:', error); }
  }

  function prompt_conflictHash(){
    const brief=production_snapshot();
    const selectedShot=brief.shots?.find(x=>x.id===brief.selected_shot_id) || null;
    return JSON.stringify({idea:$('prompt_idea')?.value || '',selectedShot,model:$('prompt_targetModel')?.value || '',groups:prompt_collectManualGroups(),briefing:brief.briefing || {},series_rules:brief.series_rules || '',projectRules:$('pdir_projectRules')?.value || '',direction:$('prompt_projectDirection')?.value || '',customer:prompt_customerSnapshot,exceptions:$('prompt_customerExceptions')?.value || '',references:prompt_collectReferences(),technical:{distance:$('prompt_distance')?.value || '',angle:$('prompt_angle')?.value || '',style:$('prompt_style')?.value || '',lighting:$('prompt_lighting')?.value || ''}});
  }
  function prompt_updateConflictStatus(){
    const note=$('production_conflictDefaults');
    const selectA=$('production_conflictReference'),selectB=$('production_conflictProject');
    if(selectA)selectA.disabled=!prompt_conflictPolicy.overrides;
    if(selectB)selectB.disabled=!prompt_conflictPolicy.overrides;
    if(note)note.textContent='Backend: Referenzen '+(prompt_conflictPolicy.reference?'blockieren':'nur warnen')+' · Projekt '+(prompt_conflictPolicy.project?'blockieren':'nur warnen')+(prompt_conflictPolicy.overrides?'':' · Frontend-Überschreibung gesperrt');
  }
  function prompt_setCheckBadge(state){
    const badge=$('production_checkAccordionStatus');
    if(!badge)return;
    const labels={pending:'Prüfung ausstehend',clear:'Geprüft',warning:'Prüfung empfohlen',blocked:'Konflikt'};
    badge.textContent=labels[state] || labels.pending;
    badge.dataset.state=state in labels ? state : 'pending';
  }
  function prompt_openCheckAccordion(){
    const panel=$('prompt_checkAccordion');
    if(!panel)return;
    panel.open=true;
    panel.scrollIntoView({behavior:'smooth',block:'start'});
    $('production_checkStatus')?.setAttribute('tabindex','-1');
  }
  function prompt_resetCheckDisplay(){
    // Old findings are never a current approval for changed inputs or another project.
    const quality=$('production_quality');if(quality)quality.replaceChildren();
    const status=$('production_checkStatus');if(status)status.textContent='Prüfung ausstehend – Eingaben prüfen.';
    const ack=$('production_qualityAck');if(ack){ack.checked=false;ack.disabled=true;}
    production_qualityFingerprint='';
    prompt_setCheckBadge('pending');
  }
  function prompt_resetSemanticProject(){
    prompt_semanticLastHash='';prompt_semanticProjectId='';prompt_semanticChecked=false;
    prompt_lastVisibleInputHash='';
    prompt_resetCheckDisplay();
    prompt_markSemanticDirty();
  }
  function prompt_markSemanticDirty(){
    const hash=prompt_conflictHash(),identity=prompt_activeProjectId || '';
    const combined=JSON.stringify([identity,hash]);
    const changed=prompt_lastVisibleInputHash!=='' && prompt_lastVisibleInputHash!==combined;
    if(changed)prompt_resetCheckDisplay();
    prompt_lastVisibleInputHash=combined;
    const note=$('production_semanticNote'),btn=$('production_semanticCheck');
    if(btn)btn.hidden=!prompt_conflictPolicy.semantic;
    if(note){
      note.hidden=!prompt_conflictPolicy.semantic;
      if(prompt_conflictPolicy.semantic){
        note.textContent=!prompt_semanticChecked
          ? 'KI-Prüfung für dieses Projekt noch nicht durchgeführt.'
          : (hash===prompt_semanticLastHash && identity===prompt_semanticProjectId
            ? 'KI-Prüfung für diese Eingaben durchgeführt.'
            : 'KI-Prüfung veraltet – relevante Eingaben wurden geändert. Erneute KI-Prüfung optional.');
      }
    }
    if(changed)prompt_setCheckBadge('pending');
  }
  function prompt_bindAutosave(){
    // Event delegation also covers dynamically created reference fields and shot controls.
    const onEdit=e=>{
      if(!e.target?.closest || !e.target.closest('#prompt_root'))return;
      // Never autosave generated output, login, or controls used to select another project.
      if(e.target.closest('#prompt_resultArea, #prompt_lockScreen, #pdir_customerBriefingEditor') ||
         ['prompt_projectWorkspace','prompt_customerFilter','prompt_projectCustomer'].includes(e.target.id) ||
         e.target.matches('button,[data-export-version]'))return;
      prompt_scheduleAutosave();
      prompt_markSemanticDirty();
    };
    root.addEventListener('input',onEdit);
    root.addEventListener('change',onEdit);
    root.addEventListener('click',e=>{
      if(e.target.closest('[data-consistency-lock],#prompt_creativityStrict,#prompt_creativityBalanced,#prompt_creativityCreative,#prompt_modeLlm,#prompt_modeManual,#prompt_complexitySimple,#prompt_complexityAdvanced,#prompt_addReference,[data-reference-remove]')){
        queueMicrotask(prompt_scheduleAutosave);
      }
    });
    window.addEventListener('beforeunload',e=>{
      if(prompt_workflow!=='free' && (customer_briefDirty() || (prompt_activeProjectId && prompt_isDirty()))){
        e.preventDefault();e.returnValue='';
      }
    });
  }

  function prompt_updatePresetControls() {
    for(const kind of ['positive','negative']){
      const neg=kind==='negative', prefix=neg?'prompt_negative_preset':'prompt_preset';
      const enabled=Boolean($(prefix+'_active')?.checked);
      const group=$(prefix+'_dependent');
      group?.classList.toggle('is-disabled',!enabled);
      if(group){for(const el of group.querySelectorAll('select,input'))el.disabled=!enabled;}
      const chosen=$(prefix)?.selectedOptions?.[0];
      const bytes=Number(chosen?.dataset?.bytes||0), max=neg?2998:12998;
      const status=$(prefix+'_status');
      if(status){
        status.classList.toggle('is-warning',enabled&&(bytes>max||!chosen?.value||chosen?.dataset?.missingPreset==='1'));
        status.textContent=!enabled?'Preset ausgeschaltet – Auswahl und KI-Prüfung bleiben gespeichert.'
          :!chosen?.value||chosen?.dataset?.missingPreset==='1'?'Bitte ein gespeichertes Preset der passenden Kategorie auswählen.'
          :bytes>max?`Preset mit ${bytes.toLocaleString('de-DE')} Bytes ist zu lang (max. ${max.toLocaleString('de-DE')} Bytes).`
          :`${bytes.toLocaleString('de-DE')} Bytes Preset. Die KI-Konfliktprüfung ist optional.`;
      }
    }
  }

  function prompt_bindEvents() {
    $('prompt_enhancer')?.addEventListener('change', prompt_scheduleAutosave);
    ['prompt_preset','prompt_preset_active','prompt_preset_audit','prompt_negative_preset','prompt_negative_preset_active','prompt_negative_preset_audit'].forEach(id => $(id)?.addEventListener('change',()=>{prompt_updatePresetControls();prompt_scheduleAutosave();}));
    prompt_updatePresetControls();
    document.querySelectorAll('input[name="prompt_preset_position"],input[name="prompt_negative_preset_position"]').forEach(el=>el.addEventListener('change',prompt_scheduleAutosave));
    $('prompt_unlockBtn')?.addEventListener('click', prompt_unlock);
    $('prompt_offlineBtn')?.addEventListener('click', prompt_continueOffline);
    $('pdir_flowCustomer')?.addEventListener('click',()=>{void prompt_switchWorkflow('customer');});
    $('pdir_flowFree')?.addEventListener('click',()=>{void prompt_switchWorkflow('free');});
    $('pdir_flowSwitch')?.addEventListener('click',()=>{void prompt_switchWorkflow('choose');});
    $('prompt_generateBtn')?.addEventListener('click', prompt_generatePrompt);
    $('prompt_generateRevisionBtn')?.addEventListener('click', prompt_generatePrompt);
    $('pdir_aiRequestStatsToggle')?.addEventListener('change',()=>prompt_renderAiRequestStats(prompt_aiRequestStatsLast));
    $('pdir_priorityOverride')?.addEventListener('change',()=>{
      prompt_scheduleAutosave();prompt_showToast($('pdir_priorityOverride').checked?'Projektvorrang aktiviert – betrifft nur direkte Widersprüche.':'Kundenvorrang wiederhergestellt.');
    });
    root.querySelectorAll('[data-prompt-generate]').forEach(button => button.addEventListener('click', prompt_generatePrompt));
    // UI-15: scroll opened native accordions into view only after user activation.
    // Capturing the summary click also supports activation with Enter/Space.
    const pdirUserOpened = new WeakSet();
    root.addEventListener('click', (event) => {
      const summary = event.target.closest('summary');
      if (!summary || summary.parentElement?.tagName !== 'DETAILS') return;
      const panel = summary.parentElement;
      if (!panel.open) pdirUserOpened.add(panel);
    }, true);
    root.addEventListener('toggle', (event) => {
      const panel = event.target;
      if (!(panel instanceof HTMLDetailsElement) || !pdirUserOpened.has(panel)) return;
      pdirUserOpened.delete(panel);
      if (!panel.open) return;
      // Allow a mutually exclusive parent accordion to close before computing layout.
      window.setTimeout(() => {
        if (!panel.isConnected || !panel.open || !panel.getClientRects().length) return;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        panel.scrollIntoView({behavior: reduce ? 'auto' : 'smooth', block: 'start'});
      }, 75);
    }, true);
    const mainAccordions = [...root.querySelectorAll('#pdir_flowEditor > details.prompt_section-accordion')];
    mainAccordions.forEach(panel=>panel.addEventListener('toggle',()=>{
      if(panel.open)mainAccordions.forEach(other=>{if(other!==panel)other.open=false;});
    }));
    // Normalize the initial state as well (older versions opened multiple sections).
    const opened = mainAccordions.filter(panel=>panel.open);
    opened.slice(1).forEach(panel=>panel.open=false);
    const accordions = [...root.querySelectorAll('#prompt_production > .prompt_production-accordion')];
    accordions.forEach(panel => panel.addEventListener('toggle', () => {
      if (panel.open) accordions.forEach(other => { if (other !== panel) other.open = false; });
    }));
    $('prompt_lockAgainBtn')?.addEventListener('click', prompt_lockAgain);
    $('prompt_modeLlm')?.addEventListener('click', () => prompt_setInputMode('llm'));
    $('prompt_modeManual')?.addEventListener('click', () => prompt_setInputMode('manual'));
    $('prompt_targetModel')?.addEventListener('change', () => {
      const profile=prompt_selectedProfile();
      const shot=production_shots.find(x=>x.id===production_selected);
      if(prompt_workflow==='customer' && shot && (profile.type==='image' || profile.type==='video')){
        shot.media_type=profile.type;
        shot.target_model=profile.key;
        shot['model_'+profile.type]=profile.key;
      }
      if(profile.type==='image' || profile.type==='video')pdir_lastModelByType[profile.type]=profile.key;
      prompt_modelChanged();
    });
    $('pdir_shotMediaImage')?.addEventListener('click', () => pdir_selectShotMedia('image'));
    $('pdir_shotMediaVideo')?.addEventListener('click', () => pdir_selectShotMedia('video'));
    $('prompt_complexitySimple')?.addEventListener('click', () => prompt_setComplexityMode('simple'));
    $('prompt_complexityAdvanced')?.addEventListener('click', () => prompt_setComplexityMode('advanced'));
    $('prompt_modelOptions')?.addEventListener('change', prompt_modelOptionChanged);
    $('prompt_advancedModelOptions')?.addEventListener('change', prompt_modelOptionChanged);
    $('prompt_addReference')?.addEventListener('click', () => prompt_addReference());
    $('prompt_creativityStrict')?.addEventListener('click', () => prompt_setCreativityMode('strict'));
    $('prompt_creativityBalanced')?.addEventListener('click', () => prompt_setCreativityMode('balanced'));
    $('prompt_creativityCreative')?.addEventListener('click', () => prompt_setCreativityMode('creative'));
    $('prompt_projectNew')?.addEventListener('click', prompt_guardAction(prompt_newProject));
    $('prompt_projectSave')?.addEventListener('click', prompt_guardAction(prompt_saveProject));
    $('prompt_projectDelete')?.addEventListener('click', prompt_guardAction(prompt_deleteProject));
    $('pdir_workspaceExport')?.addEventListener('click',prompt_guardAction(prompt_exportWorkspace));
    $('pdir_workspaceResetBtn')?.addEventListener('click',prompt_guardAction(prompt_resetAllTestData));
    $('prompt_projectWorkspace')?.addEventListener('change', prompt_guardAction(prompt_applyProject));
    $('prompt_historyRefresh')?.addEventListener('click', prompt_guardAction(async()=>{if(!await prompt_guardUnsaved())return;await prompt_loadProjects(prompt_activeProjectId);if(prompt_projects[prompt_activeProjectId])prompt_restoreWorkspace(prompt_projects[prompt_activeProjectId]);prompt_showLatestForSelectedShot();prompt_markSaved();}));
    $('prompt_historyClear')?.addEventListener('click', prompt_guardAction(prompt_clearProjectHistory));
    $('prompt_experimentClear')?.addEventListener('click', () => {
      $('prompt_experimentOutput').value = '';
      prompt_showToast('Experiment field cleared');
    });
    document.querySelectorAll('[data-copy-target]').forEach((button) => {
      button.addEventListener('click', () => prompt_copyField(button.dataset.copyTarget));
    });
    $('prompt_masterPassword')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') prompt_unlock();
    });
  }


  function prompt_setCreativityMode(mode) {
    prompt_creativityMode = ['strict','balanced','creative'].includes(mode) ? mode : 'balanced';
    $('prompt_creativityStrict')?.classList.toggle('active', prompt_creativityMode === 'strict');
    $('prompt_creativityBalanced')?.classList.toggle('active', prompt_creativityMode === 'balanced');
    $('prompt_creativityCreative')?.classList.toggle('active', prompt_creativityMode === 'creative');
  }

  function prompt_getConsistencyLocks() {
    return [...document.querySelectorAll('[data-consistency-lock]:checked')].map((el) => el.value);
  }

  // Test-data reset: explicit archive first, typed confirmation second.
  // Never deletes API settings, model catalog, or data owned by another plugin.
  let prompt_resetBackup=null;
  function prompt_clearLocalTestData(){
    try{
      localStorage.removeItem('promtdirector_project_presets_v1');
      const prefix='pdir_preflight_1614_'+String(C.userId||'anonymous')+'_';
      Object.keys(localStorage).filter(k=>k.startsWith(prefix)).forEach(k=>localStorage.removeItem(k));
    }catch(_){/* Browser storage can be disabled; server reset remains authoritative. */}
  }
  async function prompt_exportWorkspace(){
    const backup=await prompt_api('/workspace/export');
    if(!backup?.ok||!backup.fingerprint)throw new Error('Datensicherung konnte nicht vorbereitet werden.');
    const content=JSON.stringify(backup,null,2);
    const blob=new Blob([content],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    a.download='PromtDirector-TESTDATEN-BACKUP-'+stamp+'.json';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    prompt_resetBackup=backup;
    prompt_showToast('Backup heruntergeladen. Bitte die JSON-Datei sicher aufbewahren.');
  }
  async function prompt_resetAllTestData(){
    if(!prompt_resetBackup){prompt_showToast('Bitte zuerst „Daten sichern (JSON)“ benutzen.',true);return;}
    const counts=prompt_resetBackup.counts||{};
    const answer=await window.PDIRDialog.open({
      title:'ALLE PromtDirector-Testdaten endgültig löschen',danger:true,
      message:'Löscht für DEINEN WordPress-Benutzer '+(counts.customers||0)+' Kunden, '+(counts.projects||0)+' Projekte (mit Shots und Prompt-Historien) und '+(counts.presets||0)+' Presets. Andere Plugins, API-Key und Einstellungen bleiben unverändert. Das Backup ist ein JSON-Archiv, kein automatischer Wiederherstellungsassistent. Bitte exakt ALLE TESTDATEN LÖSCHEN eingeben.',
      fields:[{key:'confirmation',label:'Sicherheitsbestätigung',required:true,maxLength:40}],
      accept:'Endgültig alle Testdaten löschen',
      validate:values=>values.confirmation==='ALLE TESTDATEN LÖSCHEN'?'':'Bitte exakt ALLE TESTDATEN LÖSCHEN eingeben.'
    });
    if(!answer)return;
    // Autosave must not recreate a just-deleted workspace.
    clearTimeout(prompt_autosaveTimer);prompt_autosaveTimer=null;
    if(prompt_autosaveFlight)await prompt_autosaveFlight;
    prompt_autosaveBlocked=true;
    try{
      await prompt_api('/workspace/reset',{method:'POST',body:{confirmation:'ALLE TESTDATEN LÖSCHEN',expected_fingerprint:prompt_resetBackup.fingerprint}});
      prompt_clearLocalTestData();prompt_resetBackup=null;
      window.location.reload();
    }catch(error){prompt_autosaveBlocked=false;prompt_resetBackup=null;throw error;}
  }

  async function prompt_migrateLocalPresets() {
    const key = 'promtdirector_project_presets_v1';
    if(C.dataResetAt){prompt_clearLocalTestData();return;}
    try {
      const local = JSON.parse(localStorage.getItem(key) || '{}');
      if (!local || typeof local !== 'object' || Array.isArray(local) || !Object.keys(local).length) return;
      const result = await prompt_api('/projects/import', {method:'POST', body:{presets:local}});
      (result.accepted || []).forEach((name) => { delete local[name]; });
      if (Object.keys(local).length) {
        localStorage.setItem(key, JSON.stringify(local));
        prompt_showToast('Einige lokale Presets wurden nicht übernommen und bleiben im Browser erhalten.', true);
      } else localStorage.removeItem(key);
    } catch (_) { prompt_showToast('Lokale Presets bleiben erhalten; Übertragung derzeit nicht möglich.', true); }
  }

  function prompt_restoreWorkspace(project) {
    prompt_workspaceCustomer=project.customer_id || '';
    prompt_customerSnapshot=JSON.parse(JSON.stringify(project.customer_snapshot || {}));
    if($('prompt_customerExceptions'))$('prompt_customerExceptions').value=project.exceptions || '';
    if($('pdir_projectRules'))$('pdir_projectRules').value=project.project_rules || '';
    if($('pdir_priorityOverride'))$('pdir_priorityOverride').checked=Boolean(project.project_priority_override);
    if($('pdir_revisionOverride'))$('pdir_revisionOverride').checked=false;
    customer_assignmentOptions();
    if ($('prompt_enhancer')) {
      const select = $('prompt_enhancer');
      // Keep a missing saved identifier visible; never silently replace it with Original.
      [...select.options].filter(o => o.dataset.missingEnhancer === '1').forEach(o => o.remove());
      const value = typeof project.enhancer_id === 'string' ? project.enhancer_id : '';
      if (value && ![...select.options].some(o => o.value === value)) {
        const missing = document.createElement('option');
        missing.value = value;
        missing.textContent = 'Nicht mehr verfügbar: ' + value + ' – bitte neu wählen';
        missing.dataset.missingEnhancer = '1';
        select.appendChild(missing);
      }
      select.value = value;
    }
    if ($('prompt_preset')) {
      const select=$('prompt_preset');
      [...select.options].filter(o=>o.dataset.missingPreset==='1').forEach(o=>o.remove());
      const value=typeof project.preset_id==='string'?project.preset_id:'';
      if(value && ![...select.options].some(o=>o.value===value)){
        const missing=document.createElement('option'); missing.value=value;
        missing.textContent='Nicht mehr verfügbar: '+value+' – bitte neu wählen';
        missing.dataset.missingPreset='1';select.appendChild(missing);
      }
      select.value=value;
    }
    if ($('prompt_negative_preset')) {
      const select=$('prompt_negative_preset');
      [...select.options].filter(o=>o.dataset.missingPreset==='1').forEach(o=>o.remove());
      const value=typeof project.negative_preset_id==='string'?project.negative_preset_id:'';
      if(value && ![...select.options].some(o=>o.value===value)){
        const missing=document.createElement('option');missing.value=value;
        missing.textContent='Nicht mehr verfügbar: '+value+' – bitte neu wählen';
        missing.dataset.missingPreset='1';select.appendChild(missing);
      }
      select.value=value;
    }
    if($('prompt_negative_preset_active'))$('prompt_negative_preset_active').checked=Boolean(project.negative_preset_active);
    if($('prompt_negative_preset_audit'))$('prompt_negative_preset_audit').checked=Boolean(project.negative_preset_audit);
    const negativePresetPosition=project.negative_preset_position==='start'?'start':'end';
    const negativePresetRadio=document.querySelector('input[name="prompt_negative_preset_position"][value="'+negativePresetPosition+'"]');
    if(negativePresetRadio)negativePresetRadio.checked=true;
    if($('prompt_preset_active'))$('prompt_preset_active').checked=Boolean(project.preset_active);
    if($('prompt_preset_audit'))$('prompt_preset_audit').checked=project.preset_audit!==false;
    const presetPosition=project.preset_position==='start'?'start':'end';
    const presetRadio=document.querySelector('input[name="prompt_preset_position"][value="'+presetPosition+'"]');
    if(presetRadio)presetRadio.checked=true;
    prompt_updatePresetControls();
    production_restore(project.production || {});
    const choices=project.conflict_overrides || {};
    if($('production_conflictReference'))$('production_conflictReference').value=['default','block','warn'].includes(choices.reference)?choices.reference:'default';
    if($('production_conflictProject'))$('production_conflictProject').value=['default','block','warn'].includes(choices.project)?choices.project:'default';
    prompt_updateConflictStatus();
    prompt_restoreStrength(project.strength || {});
    if($('prompt_referenceFormat'))$('prompt_referenceFormat').value=['combined','inline','mapping','default'].includes(project.reference_format)?project.reference_format:'default';
    if($('prompt_referenceDescriptionMode'))$('prompt_referenceDescriptionMode').value=['reference','description','default'].includes(project.reference_description_mode)?project.reference_description_mode:'default';
    prompt_showReferenceDefaults();
    if ($('prompt_idea')) $('prompt_idea').value = project.idea || '';
    document.querySelectorAll('#prompt_manualMode textarea[data-prompt-field]').forEach((el) => { el.value = ''; });
    (project.groups || []).forEach((group) => {
      document.querySelectorAll('#prompt_manualMode .prompt_field-group').forEach((el) => {
        if (el.dataset.promptGroup !== group.title) return;
        (group.lines || []).forEach((line) => el.querySelectorAll('textarea[data-prompt-field]').forEach((field) => {
          if (field.dataset.promptField === line.label) field.value = line.value || '';
        }));
        prompt_updateGroupCount(el);
      });
    });
    prompt_setInputMode(project.input_mode === 'manual' ? 'manual' : 'llm');
    if ($('prompt_projectDirection')) $('prompt_projectDirection').value = project.direction || '';
    if ($('prompt_negativeInput')) $('prompt_negativeInput').value = project.negative_input || '';
    prompt_setCreativityMode(project.creativity || 'balanced');
    document.querySelectorAll('[data-consistency-lock]').forEach((el) => { el.checked = (project.locks || []).includes(el.value); });
    $('prompt_referenceList')?.replaceChildren();
    if (project.target_model && prompt_modelProfiles[project.target_model]) {
      pdir_populateTargetModels('', project.target_model);
      prompt_modelChanged();
    }
    pdir_restoreShotTargetModel();
    prompt_setModelOptions(project.model_options || {});
    const tech = project.technical || {};
    ['distance','angle','style','lighting'].forEach((key) => { if ($('prompt_' + key)) $('prompt_' + key).value = tech[key] || ''; });
    if ($('prompt_clipOnly')) $('prompt_clipOnly').checked = Boolean(tech.clip_only);
    prompt_setReferences(project.references || []);
    prompt_resetSemanticProject();
  }

  function prompt_renderProjects(selectId = '') {
    const select = $('prompt_projectWorkspace');
    if (!select) return;
    select.replaceChildren();
    const none = document.createElement('option'); none.value = ''; none.textContent = 'No project selected'; select.append(none);
    Object.entries(prompt_projects).filter(([,p])=>(p.customer_id || '')===prompt_customerFilter).sort((a,b) => String(a[1]?.name || '').localeCompare(String(b[1]?.name || ''))).forEach(([id, project]) => {
      const opt = document.createElement('option'); opt.value = id; opt.textContent = project.name || id; select.append(opt);
    });
    const chosen = prompt_projects[selectId] && (prompt_projects[selectId].customer_id || '')===prompt_customerFilter ? selectId : '';
    select.value = chosen;
    prompt_activeProjectId = chosen;
    prompt_updateHistoryHeader();
  }

  async function prompt_loadProjects(selectId = '') {
    try {
      const data = await prompt_api('/projects');
      prompt_projects = data?.projects && typeof data.projects === 'object' ? data.projects : {};
      prompt_renderProjects(selectId || prompt_activeProjectId);
      if (prompt_activeProjectId) await prompt_loadProjectHistory();
    } catch (error) {
      prompt_projects = {};
      prompt_renderProjects();
      prompt_showToast(error.message || 'Projects konnten nicht geladen werden', true);
    }
  }

  function prompt_updateHistoryHeader() {
    const title = $('prompt_historyTitle');
    if (title) title.textContent = prompt_activeProjectId && prompt_projects[prompt_activeProjectId] ? `${prompt_projects[prompt_activeProjectId].name} · versions` : 'No active project';
    const clear = $('prompt_historyClear');
    const refresh = $('prompt_historyRefresh');
    if (clear) clear.disabled = !prompt_activeProjectId;
    if (refresh) refresh.disabled = !prompt_activeProjectId;
    if (!prompt_activeProjectId) prompt_projectHistory = [];
  }

  const prompt_strengthDefaults={idea:90,customer:70,project:85,references:70,creative:50};
  function prompt_strengthValues(){const out={};for(const [key,base] of Object.entries(prompt_strengthDefaults)){const el=$('prompt_strength_'+key);out[key]=el?Math.max(0,Math.min(100,Number(el.value)||0)):base;}return out;}
  function prompt_restoreStrength(values={}){for(const [key,base] of Object.entries(prompt_strengthDefaults)){const el=$('prompt_strength_'+key);if(!el)continue;const val=Object.prototype.hasOwnProperty.call(values,key)?Number(values[key]):base;el.value=String(Number.isFinite(val)?Math.max(0,Math.min(100,val)):base);const label=$('prompt_strength_'+key+'Value');if(label)label.textContent=el.value+'%';}}
  function prompt_showReferenceDefaults(){
    const a=$('prompt_referenceFormatDefaultNote'),b=$('prompt_referenceDescriptionDefaultNote');
    if(a)a.textContent='Backend-Standard: '+({combined:'Kombiniert',inline:'Nur Inline',mapping:'Nur Mapping'}[prompt_refDefaults.format]||'Kombiniert');
    if(b)b.textContent='Backend-Standard: '+(prompt_refDefaults.description==='description'?'Beschreibungsgeführt':'Referenzgeführt');
  }
  function prompt_initStrength(){root.querySelectorAll('[data-strength]').forEach(el=>el.addEventListener('input',()=>{const label=$('prompt_strength_'+el.dataset.strength+'Value');if(label)label.textContent=el.value+'%';prompt_scheduleAutosave();}));$('prompt_strengthReset')?.addEventListener('click',()=>{prompt_restoreStrength();prompt_scheduleAutosave();});$('prompt_referenceFormat')?.addEventListener('change',prompt_scheduleAutosave);$('prompt_referenceDescriptionMode')?.addEventListener('change',prompt_scheduleAutosave);prompt_showReferenceDefaults();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',prompt_initStrength);else prompt_initStrength();
  function prompt_workspaceSnapshot(name = '') {
    const storedMode=prompt_projects[prompt_activeProjectId]?.workflow_mode;
    return {
      workflow_mode:storedMode==='legacy'?'legacy':prompt_workflow==='customer'?'customer':'free',
      project_rules:$('pdir_projectRules')?.value || '',
      project_priority_override:Boolean($('pdir_priorityOverride')?.checked),
      customer_id:prompt_workspaceCustomer,
      customer_snapshot:JSON.parse(JSON.stringify(prompt_customerSnapshot)),
      exceptions:$('prompt_customerExceptions')?.value || '',
      enhancer_id: $('prompt_enhancer')?.value || '',
      preset_id: $('prompt_preset')?.value || '',
      preset_active: Boolean($('prompt_preset_active')?.checked),
      preset_audit: Boolean($('prompt_preset_audit')?.checked),
      preset_position: document.querySelector('input[name="prompt_preset_position"]:checked')?.value || 'end',
      negative_preset_id: $('prompt_negative_preset')?.value || '',
      negative_preset_active: Boolean($('prompt_negative_preset_active')?.checked),
      negative_preset_audit: Boolean($('prompt_negative_preset_audit')?.checked),
      negative_preset_position: document.querySelector('input[name="prompt_negative_preset_position"]:checked')?.value || 'end',
      production: production_snapshot(),
      strength: prompt_strengthValues(),
      idea: $('prompt_idea')?.value || '',
      groups: prompt_collectManualGroups(),
      input_mode: prompt_workflow==='customer'?'llm':prompt_inputMode,
      name: name || prompt_projects[prompt_activeProjectId]?.name || 'Untitled Project',
      direction: $('prompt_projectDirection')?.value || '',
      creativity: prompt_creativityMode,
      locks: prompt_getConsistencyLocks(),
      target_model: $('prompt_targetModel')?.value || 'flux',
      model_options: prompt_collectModelOptions(),
      references: prompt_collectReferences(),
      conflict_overrides: {reference:$('production_conflictReference')?.value || 'default',project:$('production_conflictProject')?.value || 'default'},
      reference_format: $('prompt_referenceFormat')?.value || 'default',
      reference_description_mode: $('prompt_referenceDescriptionMode')?.value || 'default',
      negative_input: $('prompt_negativeInput')?.value || '',
      technical: {
        distance: $('prompt_distance')?.value || '',
        angle: $('prompt_angle')?.value || '',
        style: $('prompt_style')?.value || '',
        lighting: $('prompt_lighting')?.value || '',
        clip_only: Boolean($('prompt_clipOnly')?.checked)
      }
    };
  }

  async function prompt_newProject() {return await prompt_createProject(false);}
  async function prompt_saveProject() {
    if (!prompt_activeProjectId) return await prompt_createProject('save');
    const hadPendingSave=Boolean(prompt_autosaveFlight)||prompt_isDirty();
    if(prompt_autosaveFlight)await prompt_autosaveFlight;
    prompt_autosaveBlocked=false;
    try{
      const ok=await prompt_flushAutosave();
      if(ok){if(!hadPendingSave)prompt_showToast('Projekt gespeichert.');return true;}
      prompt_showToast(prompt_autosaveError || 'Projekt konnte nicht gespeichert werden.',true);return false;
    }catch(error){prompt_setSaveStatus('error',error.message);prompt_showToast(error.message,true);return false;}
  }
  async function prompt_syncActiveProject(){
    if(!prompt_activeProjectId || !prompt_projects[prompt_activeProjectId])return;
    if(prompt_autosaveFlight)await prompt_autosaveFlight;
    if(prompt_isDirty()&&!await prompt_flushAutosave())throw new Error(prompt_autosaveError||'Projekt konnte nicht gespeichert werden.');
  }

  function prompt_setModelOptions(values = {}) {
    document.querySelectorAll('[data-model-option]').forEach((el) => {
      const key = el.dataset.modelOption;
      if (!Object.prototype.hasOwnProperty.call(values, key)) return;
      if (el.type === 'checkbox') el.checked = Boolean(values[key]);
      else el.value = String(values[key]);
    });
    prompt_modelOptionChanged();
  }

  function prompt_setReferences(refs = []) {
    const list = $('prompt_referenceList');
    if (!list) return;
    list.replaceChildren();
    const valid = Array.isArray(refs) ? refs : [];
    prompt_restoringReferences = true;
    valid.forEach((ref) => {
      prompt_addReference(true);
      const cards = list.querySelectorAll('[data-reference-card]');
      const card = cards[cards.length - 1];
      if (!card) return;
      const map = {
        '[data-reference-kind]': ref.kind,
        '[data-reference-role]': ref.role,
        '[data-reference-description]': ref.description,
        '[data-reference-purpose]': ref.purpose,
        '[data-reference-timing]': ref.timing
      };
      Object.entries(map).forEach(([sel,val]) => { const el=card.querySelector(sel); if (el && val != null) el.value=String(val); });
      if (ref.kind) card.dataset.userKindChanged='1';
      prompt_updateReferenceCard(card);
      prompt_updateReferenceSubtitle(card);
    });
    prompt_restoringReferences = false;
    prompt_updateReferenceUI(prompt_selectedProfile());
    prompt_reindexReferences();
  }

  async function prompt_applyProject() {
    const id=$('prompt_projectWorkspace').value;
    if(!await prompt_guardUnsaved()){$('prompt_projectWorkspace').value=prompt_activeProjectId;return;}
    $('prompt_projectWorkspace').value=id;prompt_activeProjectId=id;prompt_projectHistory=[];prompt_clearShotResult();prompt_renderProjectHistory();production_diff({});
    if(!id||!prompt_projects[id]){prompt_resetWorkspace();prompt_markSaved();return;}
    prompt_restoreWorkspace(prompt_projects[id]);await prompt_loadProjectHistory();prompt_markSaved();
    prompt_showToast('Projektarbeitsstand geladen.');
  }

  async function prompt_deleteProject() {
    if (!prompt_activeProjectId) { prompt_showToast('Select a project first', true); return; }
    if (!await window.PDIRDialog.confirm('Projekt einschließlich Promptverlauf und Ergebnisverknüpfungen endgültig löschen? Ungespeicherte Änderungen dieses Projekts werden ebenfalls verworfen.',{title:'Projekt löschen',accept:'Endgültig löschen',danger:true})) return;
    try {
      await prompt_api('/projects', { method:'DELETE', body:{ project_id:prompt_activeProjectId, expected_revision:prompt_projects[prompt_activeProjectId]?.revision || 0 } });
      prompt_activeProjectId=''; prompt_projectHistory=[];
      await prompt_loadProjects();prompt_resetWorkspace();prompt_markSaved();
      prompt_showToast('Project deleted');
    } catch (error) { prompt_showToast(error.message || 'Projekt konnte nicht gelöscht werden', true); }
  }

  async function prompt_loadProjectHistory() {
    if (!prompt_activeProjectId) { prompt_projectHistory=[]; prompt_renderProjectHistory(); return; }
    try {
      const requestedId = prompt_activeProjectId;
      const data = await prompt_api(`/projects/history?project_id=${encodeURIComponent(requestedId)}`);
      if (requestedId !== prompt_activeProjectId) return;
      prompt_projectHistory = Array.isArray(data?.history) ? data.history : [];
      prompt_renderProjectHistory();
      prompt_showLatestForSelectedShot();
      if (prompt_projects[prompt_activeProjectId]) prompt_projects[prompt_activeProjectId].history_count = prompt_projectHistory.length;
    } catch (error) { prompt_showToast(error.message || 'History konnte nicht geladen werden', true); }
  }

  function prompt_renderProjectHistory() {
    prompt_updateHistoryHeader();
    production_versions();
    const list = $('prompt_historyList');
    if (!list) return;
    if (!prompt_activeProjectId) { list.innerHTML='<div class="prompt_history-empty">Select or create a project to store prompt versions.</div>'; return; }
    if (!prompt_projectHistory.length) { list.innerHTML='<div class="prompt_history-empty">Noch keine Promptversionen vorhanden.</div>'; return; }
    const visibleHistory=prompt_projectHistory.map((item,index)=>({item,index})).filter(({item})=>pdir_historyScope==='project'||(production_selected&&item.shot_id===production_selected));
    if(!visibleHistory.length){list.innerHTML='<div class="prompt_history-empty">Für diesen Shot gibt es noch keine gespeicherten Prompts. „Gesamtes Projekt“ zeigt alle Versionen.</div>';return;}
    list.innerHTML = visibleHistory.map(({item,index}) => {
      const preview = String(item.prompt || '').replace(/\s+/g,' ').trim().slice(0,110);
      const model = prompt_modelProfiles[item.target_model]?.label || item.target_model || '';
      const storedShot = (prompt_projects[prompt_activeProjectId]?.production?.shots || []).find(shot => shot.id === item.shot_id);
      const shotTitle = item.shot_id ? (storedShot?.title || item.shot_title || 'Shot nicht mehr vorhanden') : 'Projektweite Version (ohne Shot)';
      const isCurrentShot = Boolean(item.shot_id) && item.shot_id === production_selected && prompt_workflow === 'customer';
      const isDraft=item.semantic_audit?.status==='draft';
      return `<div class="prompt_history-item${isCurrentShot?' prompt_history-item-active':''}" data-history-index="${index}">
        <div class="prompt_history-version">V${Number(item.version || 0)}${isDraft?' · ENTWURF':''}</div>
        <div class="prompt_history-meta"><strong>${prompt_escapeHtml(preview || 'Prompt version')}</strong><span>${prompt_escapeHtml(shotTitle)} · ${prompt_escapeHtml(model)} · ${prompt_escapeHtml(item.created_at || '')}</span></div>
        <div class="prompt_history-actions">${isDraft?`<button class="prompt_btn prompt_btn-small" type="button" data-history-review="${index}">KI-Prüfung fortsetzen</button>`:''}<button class="prompt_btn prompt_btn-small" type="button" data-history-view="${index}">View</button><button class="prompt_btn prompt_btn-small" type="button" data-history-copy="${index}">Copy</button></div>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-history-review]').forEach(btn=>btn.addEventListener('click',()=>{
      const item=prompt_projectHistory[Number(btn.dataset.historyReview)];if(!item || item.semantic_audit?.status!=='draft')return;
      prompt_outputReviewTarget={project_id:prompt_activeProjectId,version:Number(item.version)};
      prompt_setDisplayedAuditContext(prompt_activeProjectId,item.version,item.shot_id||'');
      pdir_setPositive(String(item.prompt||''));
      prompt_updateNegativeResult(item.negative_prompt||'');
      prompt_renderQualityReport(item.semantic_audit||null);
      prompt_renderAdjustment(item.adjustment_note||'');
      $('prompt_resultArea')?.classList.remove('prompt_hidden');
      $('prompt_qualityReport')?.scrollIntoView({behavior:'smooth',block:'center'});
    }));
    list.querySelectorAll('[data-history-view]').forEach((btn) => btn.addEventListener('click', () => prompt_openHistoryModal(Number(btn.dataset.historyView))));
    list.querySelectorAll('[data-history-copy]').forEach((btn) => btn.addEventListener('click', async () => {
      const item = prompt_projectHistory[Number(btn.dataset.historyCopy)]; if (!item) return;
      try { await navigator.clipboard.writeText(item.prompt || ''); prompt_showToast(`V${item.version} copied`); } catch (_) { prompt_showToast('Clipboard access denied', true); }
    }));
  }

  // A project owns the history and its global V1, V2, ... numbers; each
  // customer-shot result is retrieved strictly by the stored shot ID.
  // Never fall back to a prompt from a different shot or use title matching.
  function prompt_showLatestForSelectedShot() {
    if (prompt_workflow !== 'customer' || !prompt_activeProjectId) return;
    const project=prompt_projects[prompt_activeProjectId];
    if(!project || !production_selected){prompt_clearShotResult();return;}
    const item=prompt_projectHistory.find(entry => Boolean(entry.shot_id) && entry.shot_id === production_selected);
    if (!item) {prompt_clearShotResult();return;}
    const generated=String(item.prompt || '');
    if($('prompt_output'))pdir_setPositive(generated);
    if($('prompt_experimentOutput'))$('prompt_experimentOutput').value=generated;
    if($('prompt_originalPrompt'))$('prompt_originalPrompt').value=prompt_requestTextFor(item);
    prompt_updateNegativeResult(item.negative_prompt || '');
    prompt_renderBreakdown(item.breakdown || [],item.references || []);
    prompt_renderAdjustment(item.adjustment_note || '');
    prompt_outputReviewTarget = (item.semantic_audit?.status==='draft')
      ? {project_id:prompt_activeProjectId,version:Number(item.version)} : null;
    prompt_setDisplayedAuditContext(prompt_activeProjectId,item.version,item.shot_id||'');
    prompt_renderQualityReport(item.semantic_audit || null);
    prompt_renderLicenseNotice(item.license_notice || '');
    prompt_renderMeta({target_model:item.target_model,model_options:item.model_options || {},profile_metadata:item.profile_metadata}, {model_options:item.model_options || {}});
    $('prompt_resultArea')?.classList.remove('prompt_hidden');
  }
  function prompt_clearShotResult() {
    prompt_displayedAuditContext=null;
    prompt_outputReviewTarget=null;
    ['prompt_experimentOutput','prompt_originalPrompt'].forEach(id=>{if($(id))$(id).value='';});pdir_setPositive('');
    prompt_updateNegativeResult('');
    prompt_renderBreakdown([]);
    prompt_renderAdjustment('');
    prompt_renderQualityReport(null);
    prompt_renderLicenseNotice('');
    $('prompt_resultArea')?.classList.add('prompt_hidden');
  }

  function prompt_openHistoryModal(index) {
    const item=prompt_projectHistory[index], dialog=$('prompt_historyModal');
    if(!item || !dialog)return;
    $('prompt_historyModalTitle').textContent='PROMPT PREVIEW · V'+item.version+(item.shot_id?' · '+(item.shot_title || 'Shot'):'');
    $('prompt_historyModalText').value=String(item.prompt || '');
    dialog.showModal();
  }
  function prompt_initHistoryModal(){
    $('pdir_historyScope')?.addEventListener('change', e=>{pdir_historyScope=e.target.value==='project'?'project':'shot';prompt_renderProjectHistory();});
    const dialog=$('prompt_historyModal');if(!dialog)return;
    $('prompt_historyModalClose')?.addEventListener('click',()=>dialog.close());
    $('prompt_historyModalCopy')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('prompt_historyModalText').value);prompt_showToast('Prompt kopiert');}catch(e){prompt_showToast('Kopieren fehlgeschlagen',true);}});
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',prompt_initHistoryModal);else prompt_initHistoryModal();
  async function prompt_viewHistory(index) {
    if(prompt_busy)return false;
    if(!await prompt_guardUnsaved())return false;
    const item = prompt_projectHistory[index];
    if (!item) return;
    production_diff(item);
    if (item.workspace) prompt_restoreWorkspace(item.workspace);
    if ($('prompt_originalPrompt')) $('prompt_originalPrompt').value = prompt_requestTextFor(item);
    prompt_updateNegativeResult(item.negative_prompt || '');
    prompt_renderLicenseNotice(item.license_notice || '');
    if ($('prompt_output')) pdir_setPositive(item.prompt || '');
    prompt_renderBreakdown(item.breakdown || [],item.references || []);
    prompt_renderAdjustment(item.adjustment_note || '');
    prompt_renderMeta({target_model:item.target_model,model_options:item.model_options || {},profile_metadata:item.profile_metadata},{model_options:item.model_options || {}});
    if ($('prompt_experimentOutput')) $('prompt_experimentOutput').value = item.prompt || '';
    $('prompt_resultArea')?.classList.remove('prompt_hidden');
    $('prompt_resultArea')?.scrollIntoView({behavior:'smooth',block:'start'});
    return true;
  }

  async function prompt_clearProjectHistory() {
    if (!prompt_activeProjectId) return;
    if (!await window.PDIRDialog.confirm('Alle Promptversionen und deren Ergebnisverknüpfungen endgültig löschen? Der aktuelle Projektarbeitsstand bleibt erhalten.',{title:'Verlauf löschen',accept:'Verlauf löschen',danger:true})) return;
    try {
      await prompt_api('/projects/history',{method:'DELETE',body:{project_id:prompt_activeProjectId, expected_revision:prompt_projects[prompt_activeProjectId]?.revision || 0}});
      prompt_projectHistory=[]; await prompt_loadProjects(prompt_activeProjectId); prompt_renderProjectHistory(); prompt_showLatestForSelectedShot(); prompt_showToast('Prompt history cleared');
    } catch (error) { prompt_showToast(error.message || 'History konnte nicht gelöscht werden', true); }
  }

  async function prompt_unlock() {
    const password = $('prompt_masterPassword')?.value || '';
    if ($('prompt_masterPassword')) $('prompt_masterPassword').value = '';
    if (!password) { prompt_showToast('Bitte Freigabe-Passwort eingeben', true); return; }
    const btn = $('prompt_unlockBtn');
    if (btn) btn.disabled = true;
    try {
      const data = await prompt_api('/unlock', { method: 'POST', body: { password } });
      $('prompt_masterPassword').value = '';
      prompt_showMain(data.expires_in || 0);
      prompt_showToast('API freigeschaltet');
    } catch (error) {
      $('prompt_masterPassword').value = '';
      prompt_showToast(error.message || 'Freigabe fehlgeschlagen', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function prompt_lockAgain() {
    try { await prompt_api('/lock', { method: 'POST', body: {} }); } catch (_) {}
    prompt_showLock('Gib dein Freigabe-Passwort ein. Der OpenRouter API-Key bleibt auf dem Server.');
    prompt_showToast('API gesperrt');
  }

  function prompt_continueOffline() {
    prompt_apiMode = 'offline';
    prompt_unlocked = false;
    prompt_clearExpiry();
    $('prompt_lockScreen')?.classList.add('prompt_hidden');
    $('prompt_mainInterface')?.classList.remove('prompt_hidden');
    prompt_setInfo('Offline-Modus.', 'Nur regelbasierte Generierung – keine API-Anfrage und keine Übersetzung.');
    if ($('prompt_btnText')) $('prompt_btnText').innerText = 'Generate prompt (rule-based) →';
    if ($('prompt_outputLabel')) $('prompt_outputLabel').innerText = 'Offline prompt (no AI rewrite)';
    prompt_showToast('Offline-Modus aktiv');
  }

  function prompt_setInputMode(mode) {
    prompt_inputMode = mode;
    const llmBtn = $('prompt_modeLlm');
    const manualBtn = $('prompt_modeManual');
    const llmMode = $('prompt_llmMode');
    const manualMode = $('prompt_manualMode');
    const dropdowns = $('prompt_dropdownSections');
    if (mode === 'llm') {
      llmBtn?.classList.add('active');
      manualBtn?.classList.remove('active');
      llmMode?.classList.remove('prompt_hidden');
      manualMode?.classList.add('prompt_hidden');
      dropdowns?.classList.remove('prompt_hidden');
    } else {
      manualBtn?.classList.add('active');
      llmBtn?.classList.remove('active');
      manualMode?.classList.remove('prompt_hidden');
      llmMode?.classList.add('prompt_hidden');
      dropdowns?.classList.add('prompt_hidden');
    }
  }

  function prompt_initGroupToggles() {
    document.querySelectorAll('#prompt_manualMode [data-prompt-toggle-group]').forEach((head) => {
      head.addEventListener('click', () => {
        const group = head.closest('.prompt_field-group');
        const tree = group.querySelector('[data-prompt-tree]');
        const ind = head.querySelector('.prompt_field-ind');
        const isOpen = !tree.classList.contains('prompt_hidden');
        tree.classList.toggle('prompt_hidden', isOpen);
        head.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
        if (ind) ind.textContent = isOpen ? '+' : '–';
      });
    });
    $('prompt_manualMode')?.addEventListener('input', (event) => {
      const field = event.target.closest('textarea[data-prompt-field]');
      if (field) prompt_updateGroupCount(field.closest('.prompt_field-group'));
    });
    document.querySelectorAll('#prompt_manualMode .prompt_field-group').forEach(prompt_updateGroupCount);
  }

  function prompt_updateGroupCount(groupEl) {
    if (!groupEl) return;
    let filled = 0;
    groupEl.querySelectorAll('textarea[data-prompt-field]').forEach((field) => { if (field.value.trim()) filled++; });
    const counter = groupEl.querySelector('[data-prompt-count]');
    if (counter) counter.textContent = filled > 0 ? String(filled).padStart(2, '0') : '';
  }

  function prompt_normalizeNegativeList(raw) {
    return String(raw || '').split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean).join(', ');
  }


  async function prompt_loadModels() {
    try {
      const data = await prompt_api('/models');
      prompt_modelProfiles = {};
      (data.models || []).forEach((profile) => { prompt_modelProfiles[profile.key] = profile; });
      pdir_populateTargetModels('', $('prompt_targetModel')?.value || '');
    } catch (_) {
      prompt_modelProfiles = {};
    }
    prompt_modelChanged();
  }

  function prompt_renderProfileInfo(profile) {
    const box = $('prompt_profileInfo');
    if (!box) return;
    const statuses = {verified:'Geprüft',unverified:'Ungeprüft',generic:'Generisch',custom:'Eigenes Profil'};
    const title = document.createElement('strong');
    title.textContent = `${profile.family || ''} · Modellversion ${profile.version || 'generic'} · Profil ${profile.profile_version || ''}`;
    const details = document.createElement('div');
    details.textContent = `${statuses[profile.review_status] || 'Ungeprüft'}${profile.reviewed_on ? ' · geprüft am ' + profile.reviewed_on : ''}${profile.origin === 'custom' ? ' · eigene Anpassung' : ''}${profile.next_review_on ? ' · nächste Prüfung: '+profile.next_review_on : ' · Prüfung ausstehend'}${profile.review_due ? ' · ⚠ Prüfung fällig' : ''}`;
    box.replaceChildren(title,details);
    if (profile.review_note) { const note=document.createElement('div');note.textContent=profile.review_note;box.append(note); }
    (profile.sources || []).forEach((source) => {
      try { const url=new URL(source.url);if(url.protocol!=='https:')return; } catch (_) { return; }
      const link=document.createElement('a');link.href=source.url;link.textContent=source.title || source.url;link.target='_blank';link.rel='noopener noreferrer';box.append(link,document.createTextNode(' '));
    });
  }

  function prompt_selectedProfile() {
    const key = $('prompt_targetModel')?.value || 'flux';
    return prompt_modelProfiles[key] || { key, label: key, type: prompt_isVideo(key) ? 'video' : 'image', capabilities: {}, ui_schema: [] };
  }

  function prompt_setComplexityMode(mode) {
    prompt_complexityMode = mode === 'advanced' ? 'advanced' : 'simple';
    $('prompt_complexitySimple')?.classList.toggle('active', prompt_complexityMode === 'simple');
    $('prompt_complexityAdvanced')?.classList.toggle('active', prompt_complexityMode === 'advanced');
    $('prompt_advancedControls')?.classList.remove('prompt_hidden');
    const hint = $('prompt_complexityHint');
    if (hint) hint.textContent = prompt_complexityMode === 'advanced'
      ? 'Advanced adds camera, light, style, exclusions and technical model controls.'
      : 'Simple keeps only the model settings that materially affect the result.';
    const advanced = $('prompt_advancedModelOptionsWrap');
    if (advanced) advanced.classList.toggle('prompt_hidden', prompt_complexityMode !== 'advanced' || !$('prompt_advancedModelOptions')?.children.length);
  }

  function prompt_modelChanged() {
    const profile = prompt_selectedProfile();
    prompt_renderModelOptions(profile);
    prompt_renderProfileInfo(profile);
    const clipWrap = $('prompt_clipOnlyWrap');
    if (clipWrap) clipWrap.classList.toggle('prompt_hidden', !profile.capabilities?.clip_only);
    prompt_updateNegativeUI(profile);
    prompt_updateReferenceUI(profile);
    pdir_updateShotMediaUI();
    prompt_markSemanticDirty();
  }

  function prompt_renderModelOptions(profile) {
    const wrap = $('prompt_modelOptionsWrap');
    const box = $('prompt_modelOptions');
    const advancedWrap = $('prompt_advancedModelOptionsWrap');
    const advancedBox = $('prompt_advancedModelOptions');
    const title = $('prompt_modelOptionsTitle');
    const note = $('prompt_modelCapabilityNote');
    if (!wrap || !box || !advancedWrap || !advancedBox) return;
    box.replaceChildren();
    advancedBox.replaceChildren();
    const schema = Array.isArray(profile.ui_schema) ? profile.ui_schema : [];
    if (!schema.length) {
      wrap.classList.add('prompt_hidden');
      advancedWrap.classList.add('prompt_hidden');
      return;
    }
    if (title) title.textContent = `${profile.label || profile.key} essentials`;
    if (note) {
      const c = profile.capabilities || {};
      const bits = [];
      if (c.edit) bits.push('Edit');
      if (c.multi_reference) bits.push(`Multi-ref ≤ ${c.max_reference_images || 10}`);
      if (c.rgba) bits.push('RGBA');
      if (c.local_edit) bits.push('Local edit');
      if (c.native_audio) bits.push('Native audio');
      if (c.first_last_frame) bits.push('First/last frame');
      if (c.up_to_4k) bits.push('≤ 4K');
      note.textContent = bits.join(' · ');
    }

    const buildField = (field) => {
      const holder = document.createElement('div');
      holder.className = 'prompt_model-option';
      holder.dataset.modelFieldWrap = field.key;
      if (Array.isArray(field.show_for_modes)) holder.dataset.showForModes = field.show_for_modes.join(',');
      const id = `prompt_model_${field.key}`;
      if (field.type === 'checkbox') {
        holder.classList.add('prompt_model-option-checkbox');
        const input = document.createElement('input');
        input.type = 'checkbox'; input.id = id; input.dataset.modelOption = field.key; input.checked = Boolean(field.default);
        const label = document.createElement('label'); label.htmlFor = id; label.textContent = field.label || field.key;
        holder.append(input, label);
        if (field.help) { const help = document.createElement('div'); help.className = 'prompt_model-option-help'; help.textContent = field.help; holder.append(help); }
      } else {
        const label = document.createElement('label'); label.htmlFor = id; label.textContent = field.label || field.key; holder.append(label);
        let input;
        if (field.type === 'select') {
          input = document.createElement('select');
          Object.entries(field.options || {}).forEach(([value, labelText]) => {
            const opt = document.createElement('option'); opt.value = value; opt.textContent = labelText; input.append(opt);
          });
          input.value = field.default ?? '';
        } else {
          input = document.createElement('input'); input.type = field.type === 'number' ? 'number' : 'text';
          if (field.min !== undefined) input.min = field.min;
          if (field.max !== undefined) input.max = field.max;
          input.value = field.default ?? '';
        }
        input.id = id; input.dataset.modelOption = field.key; holder.append(input);
        if (field.help) { const help = document.createElement('div'); help.className = 'prompt_model-option-help'; help.textContent = field.help; holder.append(help); }
      }
      return holder;
    };

    schema.forEach((field) => {
      if (field.key === 'reference_count') return; // Reference Guidance is the single source of truth.
      const holder = buildField(field);
      (field.advanced ? advancedBox : box).append(holder);
    });

    wrap.classList.toggle('prompt_hidden', box.children.length === 0);
    advancedWrap.classList.toggle('prompt_hidden', prompt_complexityMode !== 'advanced' || advancedBox.children.length === 0);
    prompt_modelOptionChanged();
  }

  function prompt_modelOptionChanged() {
    const mode = $('prompt_model_mode')?.value || '';
    document.querySelectorAll('[data-show-for-modes]').forEach((el) => {
      const modes = String(el.dataset.showForModes || '').split(',').filter(Boolean);
      el.classList.toggle('prompt_hidden', modes.length > 0 && !modes.includes(mode));
    });
    prompt_updateReferenceUI(prompt_selectedProfile());
  }

  function prompt_referenceConfig(profile) {
    const caps = profile?.capabilities || {};
    const schema = Array.isArray(profile?.ui_schema) ? profile.ui_schema : [];
    const refField = schema.find((field) => field.key === 'reference_count') || null;
    const mode = $('prompt_model_mode')?.value || '';
    const isVideo = profile?.type === 'video' || Boolean(caps.video);
    const nativeSupports = Boolean(caps.multi_reference || caps.edit || caps.i2v || caps.first_last_frame || caps.video_extension || Number(caps.max_reference_images || 0) > 0);
    const guidanceSupports = Boolean(caps.image_reference_guidance || caps.temporal_reference_guidance || caps.reference_video_guidance || caps.frame_reference_guidance || Number(caps.max_reference_guidance || 0) > 0);
    const allowedModes = Array.isArray(refField?.show_for_modes) ? refField.show_for_modes : [];
    const modeAllowsNative = !allowedModes.length || allowedModes.includes(mode);
    const visible = guidanceSupports || (nativeSupports && modeAllowsNative);
    let max = Number((guidanceSupports ? caps.max_reference_guidance : 0) || refField?.max || caps.max_reference_images || (visible ? 1 : 0));
    let min = 0;
    if (mode === 'multi_reference') min = 2;
    if (['edit','i2v','reference','transparent','cutout'].includes(mode)) min = 1;
    if (mode === 'first_last') min = 2;
    if (['t2i'].includes(mode)) min = 0;
    if (isVideo && mode === 't2v') min = 0; // temporal guidance is optional in T2V
    const workflow = profile?.workflows?.[mode];
    if (workflow) min = (workflow.min_images || 0) + (workflow.min_videos || 0);
    return { visible: visible && max > 0, min, max, isVideo, mode, minImages:workflow?.min_images || 0, minVideos:workflow?.min_videos || 0, requiresFirstLast:workflow ? Boolean(workflow.requires_first_last) : mode === 'first_last', nativeKinds:workflow?.native_image_kinds || ['image'] };
  }

  function prompt_referenceTypeOptions(isVideo) {
    return [
      ['image','Image reference'],
      ['reference_video','Reference video'],
      ['first_frame','First frame'],
      ['last_frame','Last frame'],
      ['key_frame','Key frame'],
      ['frame_sequence','Frame sequence']
    ];
  }

  function prompt_referencePlaceholders(kind) {
    const map = {
      image: {
        shown: 'e.g. face of the character',
        purpose: 'e.g. preserve facial identity',
        timing: 'e.g. whole shot'
      },
      reference_video: {
        shown: 'e.g. slow orbit around the car',
        purpose: 'e.g. match camera path and timing',
        timing: 'e.g. 00:00–00:06'
      },
      first_frame: {
        shown: 'e.g. front view in dark studio',
        purpose: 'e.g. use as opening composition',
        timing: 'start'
      },
      last_frame: {
        shown: 'e.g. close-up with rim light',
        purpose: 'e.g. use as final composition',
        timing: 'end'
      },
      key_frame: {
        shown: 'e.g. hand reaches the door',
        purpose: 'e.g. match this motion beat',
        timing: 'e.g. 00:03'
      },
      frame_sequence: {
        shown: 'e.g. 4 frames of turntable motion',
        purpose: 'e.g. follow pose progression',
        timing: 'e.g. frames 1–4'
      }
    };
    return map[kind] || map.image;
  }

  function prompt_updateReferenceCard(card) {
    const kind = card.querySelector('[data-reference-kind]')?.value || 'image';
    const ph = prompt_referencePlaceholders(kind);
    const desc = card.querySelector('[data-reference-description]');
    const purpose = card.querySelector('[data-reference-purpose]');
    const timing = card.querySelector('[data-reference-timing]');
    if (desc) desc.placeholder = ph.shown;
    if (purpose) purpose.placeholder = ph.purpose;
    if (timing) timing.placeholder = ph.timing;
    card.querySelector('[data-reference-timing-wrap]')?.classList.toggle('prompt_hidden', kind === 'image' && prompt_selectedProfile()?.type !== 'video');
  }

  function prompt_renderReferenceSupport(profile, cfg) {
    const box = $('prompt_referenceSupport');
    if (!box) return;
    const support = profile?.reference_support || {};
    const workflow = profile?.workflows?.[cfg.mode];
    const items = [
      ...(workflow ? [['Native inputs', `${workflow.min_images}–${workflow.max_images} Bilder; ${workflow.min_videos} erforderliche Videoreferenz(en)`]] : []),
      ['Images', support.images || 'native limit not specified'],
      ['Videos', support.videos || 'native limit not specified'],
      ['Frames', support.frames || 'profile dependent'],
      ['Referenzverarbeitung', workflow?.min_videos > 0 ? 'Videodatei im Zieltool bereitstellen; Rolle und Inhalt werden ausdrücklich im Prompt genannt.' : 'Nicht native Referenztypen werden anhand deiner Beschreibung in Textanweisungen umgesetzt.'],
      ['Prompt guidance', cfg?.max ? `up to ${cfg.max} described references` : 'not available']
    ];
    box.replaceChildren();
    const grid = document.createElement('div');
    grid.className = 'prompt_reference-support-grid';
    items.forEach(([label, value]) => {
      const item = document.createElement('div');
      item.className = 'prompt_reference-support-item';
      const key = document.createElement('span');
      key.className = 'prompt_reference-support-key';
      key.textContent = label;
      const val = document.createElement('strong');
      val.textContent = value;
      item.append(key, val);
      grid.append(item);
    });
    box.append(grid);
    if (support.note) {
      const note = document.createElement('div');
      note.className = 'prompt_reference-support-note';
      note.textContent = support.note;
      box.append(note);
    }
  }

  function prompt_updateReferenceUI(profile) {
    if (prompt_restoringReferences) return;
    const section = $('prompt_referenceGuidance');
    const list = $('prompt_referenceList');
    const add = $('prompt_addReference');
    const limit = $('prompt_referenceLimit');
    if (!section || !list || !add) return;
    const cfg = prompt_referenceConfig(profile);
    section.classList.toggle('prompt_hidden', !cfg.visible);
    if (!cfg.visible) return;
    prompt_renderReferenceSupport(profile, cfg);
    if (limit) limit.textContent = cfg.max ? `up to ${cfg.max} guidance references` : '';
    let cards = [...list.querySelectorAll('[data-reference-card]')];
    while (cards.length < cfg.min) { prompt_addReference(true); cards = [...list.querySelectorAll('[data-reference-card]')]; }
    if (cards.length > cfg.max && limit) limit.textContent = `Dieses Profil erlaubt ${cfg.max} Referenzen. Vorhandene Angaben bleiben erhalten; bitte die Auswahl prüfen.`;

    const canAssignKind = (card) => !card.dataset.userKindChanged && !['[data-reference-description]','[data-reference-purpose]','[data-reference-timing]'].some(selector => card.querySelector(selector)?.value.trim());
    // Auto-assign types only on empty cards; filled references keep their meaning.
    if (cfg.requiresFirstLast && cards.length >= 2) {
      const k1 = cards[0].querySelector('[data-reference-kind]');
      const k2 = cards[1].querySelector('[data-reference-kind]');
      if (k1 && canAssignKind(cards[0])) k1.value = 'first_frame';
      if (k2 && canAssignKind(cards[1])) k2.value = 'last_frame';
    }
    if (cfg.mode === 'i2v' && cards.length >= 1) {
      const k1 = cards[0].querySelector('[data-reference-kind]');
      if (k1 && canAssignKind(cards[0]) && !['image','first_frame'].includes(k1.value)) k1.value = 'image';
    }
    cards.forEach((card,index) => {
      const kind = card.querySelector('[data-reference-kind]');
      if (kind && canAssignKind(card) && !cfg.requiresFirstLast && index < cfg.minImages) kind.value = cfg.nativeKinds[0] || 'image';
      if (kind && canAssignKind(card) && cfg.minVideos && index >= cfg.minImages && index < cfg.minImages + cfg.minVideos) kind.value = 'reference_video';
      prompt_updateReferenceCard(card);
    });
    prompt_reindexReferences();
    add.disabled = cards.length >= cfg.max;
  }

  function prompt_setReferenceExpanded(card, expanded) {
    const body = card?.querySelector('.prompt_reference-card-body');
    const toggle = card?.querySelector('.prompt_reference-toggle');
    if (!body || !toggle) return;
    body.hidden = !expanded;
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    card.classList.toggle('prompt_reference-expanded', expanded);
  }

  function prompt_updateReferenceSubtitle(card) {
    const subtitle = card.querySelector('[data-reference-subtitle]');
    const role = card.querySelector('[data-reference-role]');
    if (!subtitle || !role) return;
    const detail = card.querySelector('[data-reference-description]')?.value.trim() || card.querySelector('[data-reference-purpose]')?.value.trim() || '';
    subtitle.textContent = (role.selectedOptions[0]?.textContent || 'Reference') + (detail ? ' · ' + detail.slice(0, 90) : '');
  }

  function prompt_addReference(silent = false) {
    const profile = prompt_selectedProfile();
    const cfg = prompt_referenceConfig(profile);
    const list = $('prompt_referenceList');
    if (!list || !cfg.visible) return;
    const count = list.querySelectorAll('[data-reference-card]').length;
    if (count >= cfg.max) { if (!silent) prompt_showToast(`Maximum ${cfg.max} guidance references for this model`, true); return; }
    prompt_referenceSeq += 1;
    const card = document.createElement('div');
    card.className = 'prompt_reference-card';
    card.dataset.referenceCard = String(prompt_referenceSeq);
    const typeOptions = prompt_referenceTypeOptions(cfg.isVideo).map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
    card.innerHTML = `
      <div class="prompt_reference-card-head">
        <button type="button" class="prompt_reference-toggle" aria-expanded="false" aria-label="Reference ${count + 1} öffnen">
          <span class="prompt_reference-toggle-label"><strong data-reference-title>Reference ${count + 1}</strong><small data-reference-subtitle>Reference details</small></span>
          <span class="prompt_reference-chevron" aria-hidden="true">⌄</span>
        </button>
        <button type="button" class="prompt_reference-remove" aria-label="Remove reference">×</button>
      </div>
      <div class="prompt_reference-card-body" hidden>
      <div class="prompt_reference-grid">
        <div class="prompt_form-group">
          <label>Reference type</label>
          <select data-reference-kind>${typeOptions}</select>
        </div>
        <div class="prompt_form-group">
          <label>Role</label>
          <select data-reference-role>
            <option value="content">Inhalt / dargestellte Szene</option>
            <option value="identity">Identity / character</option>
            <option value="face">Character face</option>
            <option value="clothing">Clothing</option>
            <option value="object">Object / product</option>
            <option value="vehicle">Vehicle</option>
            <option value="environment">Environment</option>
            <option value="lighting">Lighting</option>
            <option value="style">Style</option>
            <option value="composition">Composition</option>
            <option value="text_layout">Text / layout</option>
            <option value="camera_motion">Camera motion</option>
            <option value="object_motion">Object motion</option>
            <option value="character_motion">Character motion</option>
            <option value="timing">Timing / rhythm</option>
            <option value="transition">Transition</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div class="prompt_reference-grid">
        <div class="prompt_form-group prompt_reference-description-full">
          <label>What is shown</label>
          <textarea rows="3" maxlength="500" data-reference-description placeholder="e.g. face of the character"></textarea>
        </div>
        <div class="prompt_form-group" data-reference-timing-wrap>
          <label>When / timing <span class="prompt_optional">optional</span></label>
          <input type="text" maxlength="160" data-reference-timing placeholder="e.g. whole shot" />
        </div>
      </div>
      <div class="prompt_form-group" style="margin-bottom:0;">
        <label>Use this reference for</label>
        <input type="text" maxlength="700" data-reference-purpose placeholder="e.g. preserve facial identity" />
      </div>
      </div>`;
    card.querySelector('.prompt_reference-toggle')?.addEventListener('click', () => {
      const wasOpen = !card.querySelector('.prompt_reference-card-body').hidden;
      list.querySelectorAll('[data-reference-card]').forEach(other => prompt_setReferenceExpanded(other, false));
      if (!wasOpen) prompt_setReferenceExpanded(card, true);
    });
    card.querySelectorAll('[data-reference-role],[data-reference-description],[data-reference-purpose]').forEach(el => { el.addEventListener('input', () => prompt_updateReferenceSubtitle(card)); el.addEventListener('change', () => prompt_updateReferenceSubtitle(card)); });
    card.querySelector('[data-reference-kind]')?.addEventListener('change', () => {
      card.dataset.userKindChanged = '1';
      prompt_updateReferenceCard(card);
      prompt_reindexReferences();
    });
    card.querySelector('.prompt_reference-remove')?.addEventListener('click', () => {
      const currentCfg = prompt_referenceConfig(prompt_selectedProfile());
      const current = list.querySelectorAll('[data-reference-card]').length;
      if (current <= currentCfg.min) { prompt_showToast(`This mode needs at least ${currentCfg.min} reference${currentCfg.min === 1 ? '' : 's'}`, true); return; }
      card.remove(); prompt_reindexReferences(); prompt_updateReferenceUI(prompt_selectedProfile());
    });
    list.append(card);
    prompt_updateReferenceCard(card);
    prompt_updateReferenceSubtitle(card);
    prompt_reindexReferences();
    prompt_updateReferenceUI(profile);
  }

  function prompt_reindexReferences() {
    let imageN = 0, videoN = 0, keyN = 0, seqN = 0;
    document.querySelectorAll('#prompt_referenceList [data-reference-card]').forEach((card, index) => {
      const kind = card.querySelector('[data-reference-kind]')?.value || 'image';
      let label = `Reference ${index + 1}`;
      if (kind === 'image') label = `Image reference ${++imageN}`;
      else if (kind === 'reference_video') label = `Reference video ${++videoN}`;
      else if (kind === 'first_frame') label = 'First frame';
      else if (kind === 'last_frame') label = 'Last frame';
      else if (kind === 'key_frame') label = `Key frame ${++keyN}`;
      else if (kind === 'frame_sequence') label = `Frame sequence ${++seqN}`;
      const title = card.querySelector('[data-reference-title]');
      if (title) title.textContent = label;
      const toggle = card.querySelector('.prompt_reference-toggle');
      if (toggle) toggle.setAttribute('aria-label', label + ' öffnen oder schließen');
      prompt_updateReferenceSubtitle(card);
    });
  }

  function prompt_collectReferences() {
    if ($('prompt_referenceGuidance')?.classList.contains('prompt_hidden')) return [];
    let imageN = 0, videoN = 0, keyN = 0, seqN = 0;
    return [...document.querySelectorAll('#prompt_referenceList [data-reference-card]')].map((card, index) => {
      const kind = card.querySelector('[data-reference-kind]')?.value || 'image';
      let reference = `reference${index + 1}`;
      if (kind === 'image') reference = `image${++imageN}`;
      else if (kind === 'reference_video') reference = `video${++videoN}`;
      else if (kind === 'first_frame') reference = 'first_frame';
      else if (kind === 'last_frame') reference = 'last_frame';
      else if (kind === 'key_frame') reference = `keyframe${++keyN}`;
      else if (kind === 'frame_sequence') reference = `frame_sequence${++seqN}`;
      return {
        reference,
        kind,
        role: card.querySelector('[data-reference-role]')?.value || 'content',
        description: card.querySelector('[data-reference-description]')?.value.trim() || '',
        purpose: card.querySelector('[data-reference-purpose]')?.value.trim() || '',
        timing: card.querySelector('[data-reference-timing]')?.value.trim() || ''
      };
    }).filter((ref) => ref.description || ref.purpose || ref.timing);
  }

  function prompt_nativeReferenceCount(profile, refs) {
    const mode = $('prompt_model_mode')?.value || '';
    const flow = profile?.workflows?.[mode];
    if (flow) {
      if (!flow.max_images) return 0;
      return refs.filter((ref) => (flow.native_image_kinds || []).includes(ref.kind)).length;
    }
    return refs.filter((ref) => ref.kind === 'image').length;
  }

  function prompt_collectModelOptions() {
    const out = {};
    document.querySelectorAll('#prompt_modelOptions [data-model-option], #prompt_advancedModelOptions [data-model-option]').forEach((el) => {
      if (el.type === 'checkbox') out[el.dataset.modelOption] = Boolean(el.checked);
      else if (el.type === 'number') out[el.dataset.modelOption] = Number(el.value || 0);
      else out[el.dataset.modelOption] = el.value;
    });
    return out;
  }

  function prompt_updateNegativeUI(profile) {
    const caps = profile.capabilities || {};
    const externalOnly = Boolean(caps.external_negative_prompt);
    const inlineOnly = caps.negative_prompt === false && !externalOnly;
    if ($('prompt_negativeInputLabel')) $('prompt_negativeInputLabel').textContent = externalOnly ? 'Exclusions / external negative field' : (inlineOnly ? 'Exclusions (rewritten into main prompt)' : 'Negative prompt additions');
    if ($('prompt_negativeOutputLabel')) $('prompt_negativeOutputLabel').textContent = externalOnly ? 'External negative field' : (inlineOnly ? 'Separate negative prompt (not used by this profile)' : 'Negative prompt (auto + your additions)');
    const hint = $('prompt_negativeHint');
    if (hint) {
      if (externalOnly) hint.innerHTML = '<strong>Model profile:</strong> &nbsp;Content exclusions are handled in the main prompt; this separate field is retained only for external tools that expose a negative-prompt input.';
      else if (inlineOnly) hint.innerHTML = '<strong>Model profile:</strong> &nbsp;This model profile does not use a detached negative prompt. Your exclusions are sent to the rewriter and expressed in the main instruction using the model-specific strategy.';
      else hint.innerHTML = '<strong>How it works:</strong> &nbsp;Your entries are normalised to a comma list and appended after the automatic quality negatives.';
    }
  }

  function prompt_buildNegative(isVideo, targetModel) {
    const user = prompt_normalizeNegativeList($('prompt_negativeInput')?.value || '');
    const profile = prompt_modelProfiles[targetModel] || {};
    const caps = profile.capabilities || {};
    if (caps.external_negative_prompt) return user;
    if (caps.negative_prompt === false) return user; // Preserved for separate display/history; model still receives inline exclusions.
    const parts = [PROMPT_GLOBAL_NEGATIVE];
    if (isVideo) parts.push(PROMPT_VIDEO_NEGATIVE);
    if (user) parts.push(user);
    return parts.join(', ');
  }

  function prompt_collectManualGroups() {
    const groups = [];
    document.querySelectorAll('#prompt_manualMode .prompt_field-group').forEach((groupEl) => {
      const title = groupEl.dataset.promptGroup || '';
      const lines = [];
      groupEl.querySelectorAll('textarea[data-prompt-field]').forEach((ta) => {
        const value = ta.value.trim();
        if (value) lines.push({ label: ta.dataset.promptField || '', value });
      });
      if (lines.length) groups.push({ title, lines });
    });
    return groups;
  }

  function prompt_buildManualRuleOutput(groups) {
    return groups.map((g) => `${g.title}:\n` + g.lines.map((l) => l.value).join(', ')).join('\n\n');
  }

  function prompt_requestPayload() {
    const payload = {
      input_mode: prompt_inputMode,
      target_model: $('prompt_targetModel')?.value || 'flux',
      target_media_type: prompt_selectedProfile()?.type === 'video' ? 'video' : 'image',
      clip_only: Boolean($('prompt_clipOnly')?.checked),
      negative_input: $('prompt_negativeInput')?.value || '',
      model_options: prompt_collectModelOptions(),
      references: prompt_collectReferences(),
      reference_format: $('prompt_referenceFormat')?.value || 'default',
      reference_description_mode: $('prompt_referenceDescriptionMode')?.value || 'default',
      project_direction: $('prompt_projectDirection')?.value.trim() || '',
      generation_engine: $('prompt_generationEngine')?.value === 'direct' ? 'direct' : 'standard',
      enhancer_id: $('prompt_enhancer')?.value || '',
      preset_id: $('prompt_preset')?.value || '',
      preset_active: Boolean($('prompt_preset_active')?.checked),
      preset_audit: Boolean($('prompt_preset_audit')?.checked),
      preset_position: document.querySelector('input[name="prompt_preset_position"]:checked')?.value || 'end',
      negative_preset_id: $('prompt_negative_preset')?.value || '',
      negative_preset_active: Boolean($('prompt_negative_preset_active')?.checked),
      negative_preset_audit: Boolean($('prompt_negative_preset_audit')?.checked),
      negative_preset_position: document.querySelector('input[name="prompt_negative_preset_position"]:checked')?.value || 'end',
      direct_quality_check: Boolean($('prompt_directQualityCheck')?.checked),
      direct_extended: Boolean($('prompt_directExtended')?.checked),
      creativity_mode: prompt_creativityMode,
      consistency_locks: prompt_getConsistencyLocks(),
      project_id: prompt_workflow==='customer'?(prompt_activeProjectId || ''):'',
      workspace: prompt_workspaceSnapshot(),
      strength: prompt_strengthValues(),
      negative_prompt: prompt_buildNegative(prompt_isVideo($('prompt_targetModel')?.value), $('prompt_targetModel')?.value)
    };
    payload.model_options.reference_count = prompt_nativeReferenceCount(prompt_selectedProfile(), payload.references);
    if (payload.input_mode === 'manual') {
      payload.groups = prompt_collectManualGroups();
    } else {
      const selectedShot=payload.workspace?.production?.shots?.find(x=>x.id===payload.workspace.production.selected_shot_id);
      payload.idea = prompt_workflow==='customer' ? (selectedShot?.idea || '') : ($('prompt_idea')?.value.trim() || '');
      // The customer workflow uses shot-specific controls only. Retain saved
      // legacy values for compatibility, but do not send hidden duplicates.
      const legacyControls=prompt_workflow!=='customer';
      payload.distance = legacyControls ? ($('prompt_distance')?.value || '') : '';
      payload.angle = legacyControls ? ($('prompt_angle')?.value || '') : '';
      payload.style = legacyControls ? ($('prompt_style')?.value || '') : '';
      payload.lighting = legacyControls ? ($('prompt_lighting')?.value || '') : '';
    }
    return payload;
  }

  function prompt_requestSummary(payload) {
    const chunks = [
      `INPUT MODE: ${payload.input_mode === 'manual' ? 'Structured Fields' : 'Free Idea'}`,
      `TARGET MODEL: ${String(payload.target_model || '').toUpperCase()}`
    ];
    if (payload.project_direction || payload.consistency_locks?.length || payload.creativity_mode) {
      chunks.push('', 'PROJECT DIRECTION:');
      if (payload.project_direction) chunks.push(payload.project_direction);
      if(payload.workspace?.exceptions)chunks.push('Explicit project exceptions: '+payload.workspace.exceptions);
      chunks.push(`INTERPRETATION: ${String(payload.creativity_mode || 'balanced').toUpperCase()}`);
      if (payload.consistency_locks?.length) chunks.push(`CONSISTENCY LOCKS: ${payload.consistency_locks.join(', ')}`);
    }
    if (payload.references?.length) {
      chunks.push('', 'REFERENCE GUIDANCE:');
      payload.references.forEach((ref) => chunks.push(`${ref.reference} [${ref.kind} / ${ref.role}]: ${ref.description || '(not described)'}${ref.timing ? ` | timing: ${ref.timing}` : ''} | use for: ${ref.purpose || '(not specified)'}`));
    }
    if (payload.model_options && Object.keys(payload.model_options).length) {
      chunks.push('', 'MODEL OPTIONS:');
      Object.entries(payload.model_options).forEach(([key, value]) => chunks.push(`${key}: ${value}`));
    }
    if (payload.input_mode === 'manual') {
      chunks.push('', 'STRUCTURED INPUT:');
      (payload.groups || []).forEach((g) => {
        chunks.push(`[${g.title}]`);
        (g.lines || []).forEach((line) => chunks.push(`${line.label}: ${line.value}`));
      });
    } else {
      chunks.push('', 'USER INPUT:', payload.idea || '');
      const tech = [payload.distance, payload.angle, payload.style, payload.lighting].filter(Boolean);
      if (tech.length) chunks.push('', 'TECHNICAL SELECTIONS:', ...tech);
    }
    chunks.push('', 'SECURITY:', 'The OpenRouter API key and server-side system prompt are not exposed to the browser.');
    return chunks.join('\n');
  }

  function prompt_renderMeta(data, payload) {
    const box = $('prompt_resultMeta');
    if (!box) return;
    const profile = prompt_modelProfiles[data.target_model] || prompt_selectedProfile();
    const opts = data.model_options || payload.model_options || {};
    const pills = [];
    pills.push(`<span><strong>MODEL</strong>${prompt_escapeHtml(profile.label || data.target_model || '')}</span>`);
    if (opts.mode) pills.push(`<span><strong>MODE</strong>${prompt_escapeHtml(String(opts.mode).replaceAll('_',' '))}</span>`);
    if (opts.aspect_ratio) pills.push(`<span><strong>FORMAT</strong>${prompt_escapeHtml(String(opts.aspect_ratio))}</span>`);
    if (opts.resolution) pills.push(`<span><strong>RESOLUTION</strong>${prompt_escapeHtml(String(opts.resolution))}</span>`);
    if (opts.duration) pills.push(`<span><strong>DURATION</strong>${prompt_escapeHtml(String(opts.duration))}s</span>`);
    if (Number(opts.reference_count || 0) > 0) pills.push(`<span><strong>REFERENCES</strong>${Number(opts.reference_count)}</span>`);
    const metadata = data.profile_metadata || profile;
    if (metadata.profile_version) pills.push(`<span><strong>PROFILE</strong>${prompt_escapeHtml(metadata.profile_version)}</span>`);
    if (metadata.model_version || metadata.version) pills.push(`<span><strong>VERSION</strong>${prompt_escapeHtml(metadata.model_version || metadata.version)}</span>`);
    box.innerHTML = pills.join('');
  }

  function prompt_escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'\"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','\"':'&quot;'}[ch]));
  }

  function prompt_renderBreakdown(items, references=[]) {
    const grid = $('prompt_breakdownGrid');
    if (!grid) return;
    const safeItems = Array.isArray(items) ? items.filter((x) => x && x.label && x.content && String(x.label).toUpperCase()!=='REFERENCES') : [];
    if(Array.isArray(references)&&references.length){safeItems.push({label:'REFERENCES',content:references.map(r=>String(r.reference||'')+' · '+String(r.role||r.kind||'reference')).join(' | ')});}

    if (!safeItems.length) {
      grid.innerHTML = `<div class="prompt_breakdown-empty">The final prompt is ready below. No reliable component breakdown was returned for this generation.</div>`;
      return;
    }
    grid.innerHTML = safeItems.map((item) => `
      <article class="prompt_breakdown-card">
        <span>${prompt_escapeHtml(item.label)}</span>
        <p>${prompt_escapeHtml(item.content)}</p>
      </article>`).join('');
  }

  function addMissingReport(body) {
    const p=document.createElement('p');
    p.textContent='Die Serverantwort enthält keinen KI-Prüfbericht. Bitte die REST-Antwort und die Plugin-Version prüfen.';
    body.appendChild(p);
  }
  function prompt_renderQualityReport(audit) {
    prompt_currentQualityAudit=audit && typeof audit==='object'?audit:null;
    const wrap=$('prompt_qualityReport'),body=$('prompt_qualityReportBody'),status=$('prompt_qualityStatus');
    if(!wrap || !body || !status)return;
    body.replaceChildren();
    if(!audit || typeof audit!=='object'){
      status.textContent='Nicht verfügbar';wrap.classList.remove('prompt_hidden');addMissingReport(body);return;
    }
    wrap.classList.remove('prompt_hidden');
    wrap.open = true;
    const st=String(audit.status||'unknown');
    const names={pass:'Bestanden',uncertain:'Hinweise',needs_correction:'Korrektur erforderlich',skipped:'Deaktiviert',draft:'ENTWURF – ungeprüft'};
    const presetEntries=[
      {name:'Positives Preset',kind:'positive',report:audit.preset_check},
      {name:'Negatives Preset',kind:'negative',report:audit.negative_preset_check}
    ];
    const presetRows=presetEntries.map(entry=>entry.report).filter(x=>x && typeof x==='object');

    const normalizeQuote=value=>String(value||'').replace(/\s+/g,' ').trim().toLocaleLowerCase();
    const uniquePresetByPair=new Map();
    for(const report of presetRows){
      for(const issue of (Array.isArray(report.issues)?report.issues:[])){
        if(!issue || typeof issue!=='object')continue;
        const pair=[normalizeQuote(issue.expected),normalizeQuote(issue.observed)].sort().join(' | ');
        if(!issue.expected || !issue.observed)continue;
        const previous=uniquePresetByPair.get(pair);
        if(!previous || (previous.severity!=='conflict' && issue.severity==='conflict'))uniquePresetByPair.set(pair,issue);
      }
    }
    const uniquePresetIssues=[...uniquePresetByPair.values()];
    const clearCount=uniquePresetIssues.filter(x=>x.severity==='conflict').length;
    const possibleCount=uniquePresetIssues.filter(x=>x.severity!=='conflict').length;
    const retryIsRunning=(kind)=>prompt_presetRetryBusy.has(prompt_presetRetryKey(prompt_displayedAuditContext,kind));
    const pendingCount=presetEntries.filter(x=>x.report?.status==='pending'||(x.report?.status==='failed'&&retryIsRunning(x.kind))).length;
    const failedCount=presetEntries.filter(x=>x.report?.status==='failed'&&!retryIsRunning(x.kind)).length;
    const activeEntries=presetEntries.filter(x=>x.report && !['skipped','not_applicable'].includes(x.report.status));
    const finishedCount=activeEntries.filter(x=>x.report.status!=='pending'&&!retryIsRunning(x.kind)).length;
    const liveAudit=prompt_livePresetAuditForDisplayedVersion();
    const totalCount=activeEntries.length;
    const incomplete=totalCount-finishedCount;
    const reviewSummary=totalCount?`${finishedCount}/${totalCount} Presets`:'Presets aus';
    status.textContent='Ausgabe: '+(names[st]||'Unbekannt')+' · '+reviewSummary+(clearCount?' · '+clearCount+' Konflikt'+(clearCount===1?'':'e'):'')+(failedCount?' · '+failedCount+' Fehler':'');
    const add=(parent,tag,value)=>{const el=document.createElement(tag);el.textContent=String(value||'');parent.appendChild(el);return el;};
    // Compact permanent overview, independent of the expanded written audit.
    const overview=document.createElement('section');overview.className='pdir-qa-overview';
    overview.setAttribute('aria-label','Aktueller KI-Prüfstatus');
    const overviewHeader=document.createElement('div');overviewHeader.className='pdir-qa-overview-head';
    const h=document.createElement('strong');h.textContent='PRÜFSTATUS';overviewHeader.appendChild(h);
    const completion=document.createElement('span');completion.className='pdir-qa-overview-count';
    completion.textContent=totalCount?`${finishedCount} von ${totalCount} Preset-Prüfungen beendet`:'Keine Preset-Prüfungen aktiviert';
    overviewHeader.appendChild(completion);overview.appendChild(overviewHeader);
    const addStatusRow=(label,state,detail)=>{
      const row=document.createElement('div');row.className='pdir-qa-state-row';row.dataset.state=state;
      const icon=document.createElement('span');icon.className='pdir-qa-state-icon';icon.setAttribute('aria-hidden','true');
      icon.textContent=({running:'◌',pass:'✓',conflict:'!',warning:'!',failed:'×',disabled:'–',interrupted:'!',draft:'…'})[state]||'·';
      const words=document.createElement('div');words.className='pdir-qa-state-words';
      const name=document.createElement('strong');name.textContent=label;
      const meta=document.createElement('span');meta.textContent=detail;
      words.append(name,meta);row.append(icon,words);overview.appendChild(row);
    };
    const regularState=st==='pass'?'pass':st==='draft'?'draft':st==='skipped'?'disabled':st==='uncertain'?'warning':st==='needs_correction'?'conflict':'warning';
    addStatusRow('Reguläre KI-Ausgabeprüfung',regularState,({pass:'Abgeschlossen · keine bestätigten Abweichungen',draft:'Entwurf · noch nicht freigegeben',skipped:'Deaktiviert',uncertain:'Abgeschlossen · Hinweise vorhanden',needs_correction:'Korrektur erforderlich'})[st]||'Status prüfen');
    const unverifiedOf=(report)=>{
      const count=Number(report?.unverifiable_count||0);
      return Number.isFinite(count)?Math.max(0,Math.floor(count)):0;
    };
    const shownStatus=(report)=>{
      const value=String(report?.status||'skipped');
      if(value==='uncertain' && !report?.issues?.length && /originalzitat|textbeleg|überprüfbar|nicht als konflikt übernommen/i.test(String(report?.message||'')))return 'unverifiable';
      return value;
    };
    const rowInfo=(report,kind='')=>{
      if(kind && retryIsRunning(kind))return ['running','KI-Prüfung wird wiederholt …'];
      const state=shownStatus(report);
      const count=(Array.isArray(report?.issues)?report.issues:[]).filter(x=>x?.severity==='conflict').length;
      const unverified=unverifiedOf(report);
      if(state==='pending')return liveAudit?['running','KI-Prüfung läuft …']:['interrupted','Prüfung ausstehend · möglicherweise unterbrochen'];
      if(state==='conflict')return ['conflict','Abgeschlossen · '+count+' klar'+(count===1?'er Konflikt':'e Konflikte')+(unverified?' · '+unverified+' unbelegte Hinweise':'')];
      if(state==='uncertain')return ['warning','Abgeschlossen · möglicher Konflikt'+(unverified?' · unbelegte Hinweise':'')];
      if(state==='unverifiable')return ['warning','Abgeschlossen · KI-Hinweis nicht auswertbar'];
      if(state==='failed')return ['failed','Beendet · technischer Prüfungsfehler'];
      if(state==='pass')return ['pass','Abgeschlossen · kein Konflikt erkannt'];
      if(state==='not_applicable')return ['disabled','Nicht erforderlich'];
      if(state==='skipped')return ['disabled','Deaktiviert'];
      return ['warning','Status nicht eindeutig'];
    };
    for(const entry of presetEntries){const [state,detail]=rowInfo(entry.report,entry.kind);addStatusRow(entry.name,state,detail);}
    const track=document.createElement('div');track.className='pdir-qa-progress-track';
    track.setAttribute('role','progressbar');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(totalCount));track.setAttribute('aria-valuenow',String(finishedCount));
    track.setAttribute('aria-label','Abgeschlossene Preset-Prüfungen');
    const fill=document.createElement('div');fill.className='pdir-qa-progress-fill';fill.style.width=(totalCount?Math.round(100*finishedCount/totalCount):100)+'%';track.appendChild(fill);overview.appendChild(track);
    const closing=document.createElement('p');closing.className='pdir-qa-progress-caption';
    closing.textContent=!totalCount?'Keine optionalen Preset-Prüfungen vorgesehen.':incomplete
      ?(liveAudit?`${incomplete} von ${totalCount} Preset-Prüfungen laufen noch. Der Prompt ist bereits verfügbar.`:`${incomplete} Preset-Prüfung(en) ausstehend; möglicherweise durch Verlassen der Seite unterbrochen.`)
      :(failedCount?`Alle Prüfversuche beendet · ${failedCount} technisch fehlgeschlagen. Der Prompt bleibt erhalten.`:'Alle Preset-Prüfungen abgeschlossen'+(clearCount?' · '+clearCount+' klarer Konflikt erkannt.':'.'));
    overview.appendChild(closing);body.appendChild(overview);
    add(body,'p',st==='draft'?'Reguläre KI-Ausgabeprüfung: Entwurf gesichert, aber NICHT freigegeben. Bitte die Prüfung manuell fortsetzen.':st==='pass'?'Reguläre KI-Ausgabeprüfung: keine bestätigten Abweichungen. Das bewertet die separaten Preset-Prüfungen NICHT und garantiert keine Fehlerfreiheit.':st==='skipped'?'Reguläre KI-Ausgabeprüfung: deaktiviert.':st==='uncertain'?'Reguläre KI-Ausgabeprüfung: mögliche Abweichungen gemeldet.':'Reguläre KI-Ausgabeprüfung: Abweichungen gemeldet; Details stehen unten.');
    if(st==='draft') {
      if(audit.message)add(body,'p',audit.message);
      if(audit.provider_status)add(body,'p','OpenRouter HTTP '+String(audit.provider_status));
      if(audit.retry_after)add(body,'p','Empfohlene Wartezeit vor erneutem Prüfen: '+String(audit.retry_after)+' Sekunden.');
      if(prompt_outputReviewTarget){
        const button=document.createElement('button');button.type='button';button.className='prompt_btn';
        button.textContent=prompt_outputReviewBusy?'KI-Ausgabeprüfung läuft …':'KI-Ausgabeprüfung / Korrektur fortsetzen';
        button.disabled=prompt_outputReviewBusy;
        button.addEventListener('click',()=>void prompt_retryOutputReview());
        body.appendChild(button);
      } else add(body,'p','Kein Prüfticket verfügbar. Der Entwurf bleibt ungeprüft.');
    }
    const issues=Array.isArray(audit.issues)?audit.issues:[];
    add(body,'p','Hinweise der regulären Ausgabeprüfung: '+issues.length);
    if(presetRows.some(x=>['pass','conflict','uncertain'].includes(x.status)))add(body,'p','Preset-Konflikte (nur abgeschlossene Prüfungen, ohne doppelte Fundstellen): '+clearCount+' klare, '+possibleCount+' mögliche.');
    for(const item of issues){
      if(!item || typeof item!=='object')continue;
      const section=document.createElement('div');section.className='prompt_qa-issue pdir-qa-issue--'+(item.severity==='conflict'?'conflict':'warning');
      add(section,'strong',(item.category||'Vorgabe')+' · '+(item.severity||'Hinweis'));
      for(const [k,label] of [['subject','Motiv'],['property','Eigenschaft'],['expected','Erwartet'],['observed','Ausgabe'],['evidence','Beleg'],['reason','Begründung']]){
        if(item[k])add(section,'p',label+': '+String(item[k]));
      }
      body.appendChild(section);
    }
    const displayedPresetPairs=new Set();
    for(const [field,title,presetLabel] of [
      ['preset_check','Positives Preset','Positive Preset-Vorgabe'],
      ['negative_preset_check','Negatives Preset','Negative Preset-Vorgabe']
    ]){
      if(!audit[field])continue;
      const heading=add(body,'strong',title+' – KI-Konfliktprüfung (nur Hinweise, keine Korrektur)');
      heading.className='pdir-qa-section-title';
      const pc=audit[field];
      const presetNames={pending:liveAudit?'Prüfung läuft …':'Prüfung ausstehend oder unterbrochen – bitte Verlauf kontrollieren.',pass:'Kein Konflikt erkannt.',uncertain:'Möglicher Konflikt – manuell prüfen.',unverifiable:'KI-Hinweis nicht auswertbar – kein bestätigter Konflikt.',conflict:'Klarer Konflikt mit überprüften Textbelegen – manuell prüfen.',skipped:'Konfliktprüfung deaktiviert.',not_applicable:'Keine Preset-Prüfung erforderlich.',failed:'Technischer Prüfungsfehler: Keine Aussage über Konflikte möglich. Der generierte Prompt bleibt erhalten.'};
      const currentStatus=shownStatus(pc);
      const kind=field==='preset_check'?'positive':'negative';
      const retryContext=prompt_displayedAuditContext;
      const retryKey=prompt_presetRetryKey(retryContext,kind);
      const isRetrying=prompt_presetRetryBusy.has(retryKey);
      const resultLine=add(body,'p',isRetrying?'KI-Konfliktprüfung wird erneut ausgeführt …':(presetNames[currentStatus]||'Unbekannter Prüfstatus.'));
      resultLine.className='pdir-qa-result pdir-qa-result--'+(isRetrying?'running':rowInfo(pc,kind)[0]);
      if(currentStatus==='failed') {
        const panel=document.createElement('div');panel.className='pdir-qa-retry';
        const tries=Number(pc.retry_attempts||0);
        const available=!!retryContext && (Boolean(retryContext.project && retryContext.version>0) || Boolean(retryContext.ticket));
        const btn=document.createElement('button');btn.type='button';btn.className='prompt_btn prompt_btn-small pdir-qa-retry-button';
        btn.textContent=isRetrying?'KI-Prüfung läuft …':(tries>=2?'Wiederholungen ausgeschöpft':'KI-Prüfung erneut starten');
        btn.disabled=isRetrying||tries>=2||!available||!prompt_unlocked;
        btn.addEventListener('click',()=>void prompt_retryPresetAudit(kind));
        panel.appendChild(btn);
        const helper=document.createElement('span');helper.className='pdir-qa-retry-note';
        helper.textContent=tries>=2?'Maximal zwei manuelle Wiederholungen möglich.':(!available?'Für diese unspeicherte Version ist kein gültiges Prüfticket verfügbar.':
          (pc.error_type==='timeout'?'Zeitlimit erreicht. Die Generierung ist weiterhin gespeichert.':
          (pc.error_type==='rate_limit'?'OpenRouter-Anfragelimit. Vor dem erneuten Versuch die Wartezeit beachten.':
          (pc.error_type==='invalid_response'?'KI-Antwort war nicht vollständig oder nicht auswertbar.':
          (pc.error_type==='provider'?'KI-Anbieter hat eine Fehlermeldung zurückgegeben.':'Wiederholt nur diese Preset-Prüfung, nicht die Generierung.')))));
        panel.appendChild(helper);body.appendChild(panel);
        if(pc.provider_status)add(body,'p','OpenRouter HTTP '+pc.provider_status);
        if(pc.retry_after)add(body,'p','Empfohlene Wartezeit: '+pc.retry_after+' Sekunden.');
      }
      if(pc.message){const message=add(body,'p',pc.message);if(unverifiedOf(pc)>0 || currentStatus==='unverifiable')message.className='pdir-qa-warning';}
      if(unverifiedOf(pc)>0 && currentStatus!=='unverifiable') {
        const warning=add(body,'p',unverifiedOf(pc)+' KI-Hinweis(e) mit nicht überprüfbaren Originalzitaten – nicht als Konflikt übernommen.');
        warning.className='pdir-qa-warning';
      }
      let duplicates=0;
      for(const item of (Array.isArray(pc.issues)?pc.issues:[])){
        if(!item || typeof item!=='object')continue;
        const pair=[normalizeQuote(item.expected),normalizeQuote(item.observed)].sort().join(' | ');
        if(displayedPresetPairs.has(pair) || uniquePresetByPair.get(pair)!==item){duplicates++;continue;}
        displayedPresetPairs.add(pair);
        const section=document.createElement('div');section.className='prompt_qa-issue pdir-qa-issue--'+(item.severity==='conflict'?'conflict':'warning');
        add(section,'strong',item.severity==='uncertain'?'Möglicher Konflikt':'Klarer Konflikt');
        for(const [k,label] of [['expected',presetLabel],['observed','Widersprechende Vorgabe'],['reason','Begründung'],['recommendation','Manuell prüfen']])if(item[k])add(section,'p',label+': '+String(item[k]));
        body.appendChild(section);
      }
      if(duplicates)add(body,'p',duplicates+' identische Konfliktmeldung(en) bereits oben aufgeführt.');
    }
    if(audit.repaired)add(body,'p','Die Korrektur wurde ausgeführt und anschließend erneut KI-geprüft.');
    if(audit.initial_status && audit.initial_status !== st) add(body,'p','Erster Prüflauf: '+audit.initial_status);
    if(Array.isArray(audit.initial_issues) && audit.initial_issues.length) {
      const heading=add(body,'strong','Ursprünglich erkannte Abweichungen: '+audit.initial_issues.length);
      for(const item of audit.initial_issues){
        if(!item || typeof item!=='object')continue;
        const section=document.createElement('div');section.className='prompt_qa-issue';
        add(section,'strong',String(item.category||'Vorgabe'));
        for(const [k,label] of [['expected','Erwartet'],['observed','Ausgabe'],['reason','Begründung']]) if(item[k])add(section,'p',label+': '+String(item[k]));
        body.appendChild(section);
      }
    }
  }

  async function prompt_retryOutputReview() {
    if(prompt_outputReviewBusy || !prompt_outputReviewTarget)return;
    const target={...prompt_outputReviewTarget};
    const projectAtStart=prompt_activeProjectId;
    prompt_outputReviewBusy=true;
    const report=$('prompt_qualityReportBody');
    const b=report?.querySelector('button');if(b){b.disabled=true;b.textContent='KI-Ausgabeprüfung läuft …';}
    try {
      const data=await prompt_api('/output-review',{method:'POST',body:target});
      const active=projectAtStart===prompt_activeProjectId &&
        prompt_outputReviewTarget && JSON.stringify(prompt_outputReviewTarget)===JSON.stringify(target);
      if(active){
        if(data.prompt!==null && data.prompt!==undefined){
          pdir_setPositive(data.prompt);
          if($('prompt_experimentOutput'))$('prompt_experimentOutput').value=data.prompt;
        }
        if(data.adjustment_note!==null && data.adjustment_note!==undefined)prompt_renderAdjustment(data.adjustment_note);
        if(!data.output_review_required)prompt_outputReviewTarget=null;
        prompt_renderQualityReport(data.semantic_audit);
        prompt_showToast(data.output_review_required?'Entwurf erhalten. Nächsten Prüfschritt bei Bedarf manuell starten.':'KI-Ausgabeprüfung abgeschlossen.',data.output_review_required?'warning':undefined);
      }
      if(target.project_id && target.version && target.project_id===prompt_activeProjectId){
        await prompt_loadProjectHistory();
      }
    }catch(e){
      prompt_showToast('KI-Ausgabeprüfung nicht abgeschlossen: '+String(e.message||'Unbekannter Fehler')+'. Entwurf bleibt erhalten.','warning');
    }finally{
      prompt_outputReviewBusy=false;
      if(prompt_outputReviewTarget && projectAtStart===prompt_activeProjectId){
        const button=$('prompt_qualityReportBody')?.querySelector('button');
        if(button){button.disabled=false;button.textContent='KI-Ausgabeprüfung / Korrektur fortsetzen';}
      }
    }
  }

  function prompt_renderAdjustment(text) {
    const el = $('prompt_adjustmentNote');
    if (!el) return;
    const value = String(text || '').trim();
    el.textContent = value;
    el.classList.toggle('prompt_hidden', !value);
  }

  function prompt_renderLicenseNotice(text) {
    const el = $('prompt_licenseNotice');
    if (!el) return;
    const value = String(text || '').trim();
    el.textContent = value;
    el.classList.toggle('prompt_hidden', !value);
  }

  // Keep the canonical prompts separate; the checkbox changes presentation only.
  let pdir_positiveCanonical = '';
  let pdir_negativeCanonical = '';
  function pdir_renderPromptOutput() {
    const inline = Boolean($('pdir_negativeInline')?.checked);
    const positive = $('prompt_output');
    const negative = $('prompt_negativeOutput');
    if (positive) positive.value = pdir_positiveCanonical + (inline && pdir_negativeCanonical ?
      (pdir_positiveCanonical ? '\n\n' : '') + 'Negative prompt: ' + pdir_negativeCanonical : '');
    if (negative) negative.value = pdir_negativeCanonical;
    $('prompt_negativeResultWrap')?.classList.toggle('prompt_hidden', inline || !pdir_negativeCanonical.trim());
  }
  function pdir_setPositive(value) {
    pdir_positiveCanonical = String(value || '');
    pdir_renderPromptOutput();
  }
  function prompt_updateNegativeResult(value) {
    pdir_negativeCanonical = String(value || '');
    pdir_renderPromptOutput();
  }
  $('pdir_negativeInline')?.addEventListener('change', () => {
    try { localStorage.setItem('pdir_negative_inline', $('pdir_negativeInline').checked ? '1' : '0'); } catch (_) {}
    pdir_renderPromptOutput();
  });
  try { if ($('pdir_negativeInline')) $('pdir_negativeInline').checked = localStorage.getItem('pdir_negative_inline') === '1'; } catch (_) {}

  // The result is committed/rendered BEFORE any advisory audit starts. Each
  // follow-up HTTP request checks only one preset; even a gateway timeout
  // affects its report, never the already successful generation or prompt.
  /** Retry ONLY one failed advisory audit. Immutable snapshots are read by the server. */
  async function prompt_retryPresetAudit(kind) {
    if(kind!=='positive'&&kind!=='negative')return;
    const context=prompt_displayedAuditContext?{...prompt_displayedAuditContext}:null;
    if(!context){prompt_showToast('Keine zugehörige Prompt-Version gewählt.',true);return;}
    const field=kind==='positive'?'preset_check':'negative_preset_check';
    const previous=prompt_currentQualityAudit?.[field];
    if(!previous || previous.status!=='failed')return;
    if(Number(previous.retry_attempts||0)>=2){prompt_showToast('Maximale Anzahl an Wiederholungen erreicht.','warning');return;}
    const key=prompt_presetRetryKey(context,kind);
    if(prompt_presetRetryBusy.has(key))return;
    const body=context.project&&context.version>0
      ? {project_id:context.project,version:context.version,kind}
      : {ticket:context.ticket,kind};
    if(!body.project_id&&!body.ticket){prompt_showToast('Prüfticket nicht mehr verfügbar.',true);return;}
    prompt_presetRetryBusy.add(key);
    if(prompt_currentQualityAudit)prompt_renderQualityReport(prompt_currentQualityAudit);
    try {
      const result=await prompt_api('/preset-audit/retry',{method:'POST',body});
      const report=result.report&&typeof result.report==='object'?result.report:{status:'failed',issues:[],message:'Prüfbericht unvollständig.'};
      if(prompt_auditContextMatches(context,prompt_displayedAuditContext)) {
        prompt_renderQualityReport({...prompt_currentQualityAudit,[field]:report});
        if(report.status==='failed')prompt_showToast('Wiederholte Preset-Prüfung fehlgeschlagen; der Prompt bleibt erhalten.','warning');
        else prompt_showToast('Preset-Prüfung abgeschlossen. Ergebnis im KI-Prüfbericht.');
        if(result.history_warning)prompt_showToast('Prüfbericht konnte nicht gespeichert werden: '+result.history_warning,'warning');
      }
      if(result.history_saved&&context.project&&context.version>0&&prompt_activeProjectId===context.project&&prompt_auditContextMatches(context,prompt_displayedAuditContext))await prompt_loadProjectHistory();
    } catch(error) {
      if(prompt_auditContextMatches(context,prompt_displayedAuditContext))prompt_showToast('Wiederholung nicht gestartet: '+String(error.message||'Fehler'),true);
    } finally {
      prompt_presetRetryBusy.delete(key);
      if(prompt_auditContextMatches(context,prompt_displayedAuditContext)&&prompt_currentQualityAudit)
        prompt_renderQualityReport(prompt_currentQualityAudit);
    }
  }

  async function prompt_runDeferredPresetChecks(data, expectedProjectId, expectedVersion) {
    const ticket=String(data.preset_audit_ticket||'');
    const kinds=Array.isArray(data.preset_audit_kinds) ? data.preset_audit_kinds.filter(k=>k==='positive'||k==='negative') : [];
    if (!ticket || !kinds.length) return;
    const audit={...(data.semantic_audit||{})};
    const initialStats=data.ai_requests && typeof data.ai_requests==='object' ? {...data.ai_requests} : null;
    const context={project:String(expectedProjectId||''),version:Number(expectedVersion||0),shot:String(data.shot_id||production_selected||''),ticket};
    prompt_runningPresetAudits.set(ticket,context);
    const active=()=>prompt_activePresetAuditTicket===ticket && prompt_activeProjectId===expectedProjectId &&
      prompt_auditContextMatches(context,prompt_displayedAuditContext);

    for (const kind of kinds) {
      const field=kind==='positive'?'preset_check':'negative_preset_check';
      let report;
      try {
        const response=await prompt_api('/preset-audit',{method:'POST',body:{ticket,kind}});
        report=response.report && typeof response.report==='object' ? response.report : {status:'failed',issues:[],message:'Kein gültiger Preset-Prüfbericht zurückgegeben.'};
        if (initialStats && response.ai_requests) {
          for(const key of ['generation','audit','repair','total']) initialStats[key]=Number(initialStats[key]||0)+Number(response.ai_requests[key]||0);
        }
        if(response.history_warning && active())prompt_showToast('Prüfbericht nicht im Verlauf gespeichert: '+response.history_warning,'warning');
      } catch(error) {
        // 502/504 are NOT generation failures; retain the generated text.
        report={status:'failed',issues:[],message:'Optionale KI-Konfliktprüfung fehlgeschlagen ('+String(error.message||'Netzwerkfehler')+'). Der generierte Prompt bleibt erhalten.'};
      }
      audit[field]=report;
      if (active()) {
        // Another advisory retry may have finished while this request ran.
        // Apply only this kind's result to the current version's live report.
        prompt_renderQualityReport({...prompt_currentQualityAudit,[field]:report});
        if(initialStats)prompt_renderAiRequestStats(initialStats);
        if(report.status==='failed')prompt_showToast('Preset-Konfliktprüfung fehlgeschlagen; Prompt bleibt erhalten.','warning');
        else if(report.status==='conflict'||report.status==='uncertain')prompt_showToast('Preset-Prüfhinweise im KI-Prüfbericht beachten.','warning');
      }
    }
    prompt_runningPresetAudits.delete(ticket);
    if(active() && prompt_currentQualityAudit)prompt_renderQualityReport(prompt_currentQualityAudit); // Completion state.
    // Refresh the matching persisted version without changing another project's report.
    if(active() && expectedVersion>0 && prompt_activeProjectId){
      await prompt_loadProjectHistory();
    }
  }

  async function prompt_generatePrompt(event) {
    if (prompt_busy || $('prompt_generateBtn')?.disabled) return;
    if (prompt_apiMode === 'offline') { if(prompt_workflow==='customer'){prompt_showToast('Kunden-Shots werden im API-Modus generiert.',true);return;} if($('production_revision')?.value){prompt_showToast('Gezielte Revision benötigt die KI-Freigabe.',true);return;} prompt_generateSimple(); return; }
    if (!prompt_unlocked) { prompt_showToast('Bitte API zuerst freischalten', true); return; }

    const payload = prompt_requestPayload();
    const hasShot=Boolean(payload.workspace?.production?.selected_shot_id);
    if(prompt_workflow==='customer'){
      if(!prompt_activeProjectId || !prompt_workspaceCustomer){prompt_showToast('Kundenprojekt: erst Kunde und Projekt auswählen.',true);return;}
      const shot=payload.workspace.production.shots.find(x=>x.id===payload.workspace.production.selected_shot_id);
      if(!shot?.idea?.trim()){prompt_showToast('Bitte in Section 01 einen Shot wählen und seine Idee unter 02 eingeben.',true);$('prompt_ideaAccordion')?.setAttribute('open','');$('pdir_shotEditor')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
    }
    if (payload.input_mode === 'manual' && !(payload.groups || []).length && !hasShot && !$('production_revision')?.value) {
      prompt_showToast('Please fill at least one field', true); return;
    }
    if (payload.input_mode === 'llm' && !payload.idea && !hasShot && !$('production_revision')?.value) {
      prompt_showToast('Please enter an idea', true); return;
    }

    const buttons = ['prompt_generateBtn', 'prompt_generateRevisionBtn'].map($).filter(Boolean);
    const spinners = ['prompt_spinner', 'prompt_revisionSpinner'].map($).filter(Boolean);
    const buttonTexts = ['prompt_btnText', 'prompt_revisionBtnText'].map($).filter(Boolean);
    const projectControls = ['prompt_projectWorkspace','prompt_projectNew','prompt_projectSave','prompt_projectDelete','prompt_historyClear','prompt_historyRefresh'].map($).filter(Boolean).concat([...document.querySelectorAll('#prompt_production input,#prompt_production textarea,#prompt_production select,#prompt_production button')].filter(el=>!el.disabled));
    const isRevisionAction=event?.currentTarget?.id==='prompt_generateRevisionBtn';
    const revisionVersion=isRevisionAction ? Number($('production_revision')?.value || 0) : 0;
    const requestedChange=$('production_change')?.value || '';
    if(isRevisionAction&&!revisionVersion){prompt_showToast('Für die Überarbeitung eine Ausgangsversion wählen.',true);return;}
    if(revisionVersion&&!requestedChange.trim()){prompt_showToast('Änderungswunsch eingeben.',true);return;}
    const negativeOnly=isRevisionAction&&$('pdir_revisionTarget')?.value==='negative';
    const positiveOnly=isRevisionAction&&$('pdir_revisionTarget')?.value==='positive';
    if(payload.preset_active&&!negativeOnly){
      const choice=$('prompt_preset')?.selectedOptions?.[0];
      if(!payload.preset_id||choice?.dataset?.missingPreset==='1'){prompt_showToast('Bitte ein gültiges positives Preset auswählen.',true);return;}
      if(Number(choice?.dataset?.bytes||0)>12998){prompt_showToast('Positives Preset ist zu lang (max. 12.998 Bytes).',true);return;}
    }
    if(payload.negative_preset_active&&!positiveOnly){
      const choice=$('prompt_negative_preset')?.selectedOptions?.[0];
      if(!payload.negative_preset_id||choice?.dataset?.missingPreset==='1'){prompt_showToast('Bitte ein gültiges negatives Preset auswählen.',true);return;}
      if(Number(choice?.dataset?.bytes||0)>2998){prompt_showToast('Negatives Preset ist zu lang (max. 2.998 Bytes).',true);return;}
    }
    if($('pdir_revisionOverride')?.checked && !revisionVersion){prompt_showToast('Zuerst eine Version zur Überarbeitung auswählen.',true);return;}
    prompt_renderAiRequestStats(null);
    prompt_liveRequest=null; // A new attempt must not inherit the previous request.
    prompt_activePresetAuditTicket='';
    prompt_busy=true;
    projectControls.push(...[...root.querySelectorAll('input,textarea,select,button')].filter(el=>!el.disabled&&!projectControls.includes(el)));
    projectControls.forEach((control) => { control.disabled = true; });
    buttons.forEach(button => { button.disabled = true; button.setAttribute('aria-busy', 'true'); });
    spinners.forEach(spinner => { spinner.style.display = 'block'; });
    buttonTexts.forEach(text => { text.innerText = 'AI synthesizing...'; });
    ['prompt_generationStatus', 'prompt_generationStatusMain'].forEach(id => $(id)?.classList.remove('prompt_hidden'));
    $('prompt_originalPrompt').value = 'OpenRouter-Anfrage wird gesendet …';

    try {
      if(revisionVersion){payload.revision={base_version:revisionVersion,requested_change:requestedChange,allow_mandatory_override:Boolean($('pdir_revisionOverride')?.checked),target:$('pdir_revisionTarget')?.value || 'positive'};}
      if(!await production_check(payload)){prompt_openCheckAccordion();prompt_showToast('Eingabehinweise unter 06 – Eingabeprüfung prüfen und gegebenenfalls bestätigen.','warning');return;}
      payload.quality_ack=true;
      if (prompt_workflow==='customer' && prompt_activeProjectId) {
        await prompt_syncActiveProject();
      }
      if(revisionVersion){payload.revision={base_version:revisionVersion,requested_change:requestedChange,allow_mandatory_override:Boolean($('pdir_revisionOverride')?.checked),target:$('pdir_revisionTarget')?.value || 'positive'};}
      const data = await prompt_api('/generate', { method: 'POST', body: payload });
      prompt_renderAiRequestStats(data.ai_requests || null);
      // Display the actual request received from the API for this invocation.
      // The project/history refresh below may repaint the result area: it must
      // recover these in-memory details ONLY for the matching saved version.
      const currentRequestText = data.openrouter_request?.body
        ? JSON.stringify(data.openrouter_request, null, 2)
        : 'Keine serverseitige Request-Aufzeichnung verfügbar.';
      if ($('prompt_originalPrompt')) $('prompt_originalPrompt').value = currentRequestText;
      const createdVersion = Number(data.history_version || 0);
      if (prompt_workflow === 'customer' && prompt_activeProjectId && createdVersion > 0) {
        prompt_liveRequest = {
          project: prompt_activeProjectId,
          shot: String(production_selected || ''),
          version: createdVersion,
          text: currentRequestText
        };
      }
      if($('pdir_revisionOverride'))$('pdir_revisionOverride').checked=false; // approval is one revision only
      const generated = String(data.prompt || '').trim();
      const isVideo = Boolean(data.is_video) || prompt_isVideo(payload.target_model);
      pdir_setPositive(generated);
      prompt_updateNegativeResult(data.negative_prompt ?? payload.negative_prompt ?? '');
      if ($('prompt_experimentOutput')) $('prompt_experimentOutput').value = generated;
      prompt_renderMeta(data, payload);
      prompt_renderBreakdown(data.breakdown || [],payload.references || []);
      prompt_renderAdjustment(data.adjustment_note || '');
      prompt_outputReviewTarget=data.output_review_required
        ? (createdVersion>0 && data.project_id
           ? {project_id:String(data.project_id),version:createdVersion}
           : (data.output_review_ticket ? {ticket:String(data.output_review_ticket)} : null))
        : null;
      prompt_setDisplayedAuditContext(prompt_activeProjectId,createdVersion,String(production_selected||''),String(data.preset_audit_ticket||''));
      if(data.preset_audit_ticket)prompt_runningPresetAudits.set(String(data.preset_audit_ticket),{...prompt_displayedAuditContext});
      prompt_renderQualityReport(data.semantic_audit || null);
      if (data.semantic_audit?.status === 'pass') {
        prompt_showToast(data.semantic_audit.repaired ? 'KI-Inhaltsprüfung: Prompt korrigiert und erneut geprüft.' : 'KI-Inhaltsprüfung bestanden.');
      } else if (data.semantic_audit?.status === 'draft') {
        prompt_showToast('Prompt als UNGEPRÜFTER ENTWURF erhalten. KI-Ausgabeprüfung im Prüfbericht fortsetzen.','warning');
      } else if (data.semantic_audit?.status === 'uncertain') {
        prompt_showToast('KI-Prüfhinweis: uneindeutige Angaben unter Anpassungen beachten.', 'warning');
      }
      prompt_renderLicenseNotice(data.license_notice || '');
      if (prompt_workflow==='customer' && prompt_activeProjectId && Number(data.history_version || 0) > 0) {
        await prompt_loadProjects(payload.project_id);
        const entry=prompt_projectHistory.find(e=>Number(e.version)===Number(data.history_version)); if(entry) production_diff(entry);
        if(revisionVersion && $('production_revision')){$('production_revision').value=String(data.history_version);production_updateRevisionPreview();}
        prompt_showToast(`Saved as V${Number(data.history_version)}`+(data.output_review_required?' · ungeprüfter Entwurf':''),data.output_review_required?'warning':undefined);
      }
      if (data.history_warning) prompt_showToast('Prompt erstellt, Verlauf nicht gespeichert: ' + data.history_warning, true);
      $('prompt_resultArea').classList.remove('prompt_hidden');
      if (data.expires_in) prompt_scheduleExpiry(data.expires_in);
      const revisionDiff=$('pdir_revisionDiffWrap');
      if(revisionVersion && revisionDiff && !revisionDiff.hidden){
        $('prompt_revisionModule')?.setAttribute('open','');
        revisionDiff.scrollIntoView({behavior:'smooth',block:'center'});
      }else{ $('prompt_resultArea').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      // Fire the advisory checks only after the generated prompt is visible.
      // The method catches individual request failures itself; do not await it
      // inside this generation try/catch or its errors could mislabel success.
      prompt_activePresetAuditTicket=String(data.preset_audit_ticket||'');
      if (prompt_activePresetAuditTicket) {
        void prompt_runDeferredPresetChecks(data,prompt_activeProjectId,createdVersion)
          .catch(()=>{ if(prompt_activePresetAuditTicket===data.preset_audit_ticket)prompt_showToast('Preset-Prüfbericht konnte nicht aktualisiert werden. Der Prompt bleibt erhalten.','warning'); });
      }
    } catch (error) {
      if (error.aiRequestStats) prompt_renderAiRequestStats(error.aiRequestStats);
      if (error.status === 409 && /konflikt|eingabehinweise|prüfen und bestätigen/i.test(String(error.message || ''))) {
        prompt_setCheckBadge('blocked');
        prompt_openCheckAccordion();
        const status=$('production_checkStatus');if(status)status.textContent='Generierung gesperrt – bitte Konflikte unter 06 – Eingabeprüfung beheben.';
      }
      if (error.status === 423) {
        prompt_showLock('API-Freigabe abgelaufen. Bitte erneut freischalten.');
      }
      if ($('prompt_originalPrompt')) $('prompt_originalPrompt').value = 'Request fehlgeschlagen oder nicht verfügbar. Kein verifizierter Request-Body zurückgegeben.';
      prompt_showToast(`Error: ${error.message}`, true);
    } finally {
      projectControls.forEach((control) => { control.disabled = false; });
      prompt_busy=false;customer_render();production_renderShots();
      prompt_updateHistoryHeader();
      buttons.forEach(button => { button.disabled = false; button.removeAttribute('aria-busy'); });
      spinners.forEach(spinner => { spinner.style.display = 'none'; });
      buttonTexts.forEach(text => { text.innerText = 'Generate prompt →'; });
      ['prompt_generationStatus', 'prompt_generationStatusMain'].forEach(id => $(id)?.classList.add('prompt_hidden'));
    }
  }

  function prompt_generateSimple() {
    const targetModel = $('prompt_targetModel')?.value || 'flux';
    const isVideo = prompt_isVideo(targetModel);
    const production=production_snapshot();
    let positive = '';
    if (prompt_inputMode === 'manual') {
      const groups = prompt_collectManualGroups();
      if (!groups.length) { prompt_showToast('Please fill at least one field', true); return; }
      positive = prompt_buildManualRuleOutput(groups);
    } else {
      const selectedShot=production.shots.find(x=>x.id===production.selected_shot_id);
      const idea = prompt_workflow==='customer' ? (selectedShot?.idea?.trim() || '') : ($('prompt_idea')?.value.trim() || '');
      if (!idea) { prompt_showToast(prompt_workflow==='customer'?'Bitte einen Shot mit Idee auswählen.':'Please enter an idea', true); return; }
      const distance = $('prompt_distance')?.value || '';
      const angle = $('prompt_angle')?.value || '';
      const style = $('prompt_style')?.value || '';
      const lighting = $('prompt_lighting')?.value || '';
      const parts = [idea];
      if (distance) parts.push(distance);
      if (angle) parts.push(angle);
      if (style) parts.push(`${style} style`);
      if (lighting) parts.push(lighting);

      positive = parts.join(', ');
    }
    const brief=Object.entries(production.briefing).filter(([,v])=>v.trim()).map(([k,v])=>k+': '+v);
    if(brief.length)positive+='\nCustomer brief: '+brief.join('; ');
    if(production.series_rules)positive+='\nSeries rules: '+production.series_rules;
    const shot=production.shots.find(x=>x.id===production.selected_shot_id);
    if(shot){
      const videoOnly=new Set(['start','action','camera_motion','end','duration','transition']);
      positive+='\nShot: '+production_shotKeys.filter(k=>shot[k] && k!=='title' && (!videoOnly.has(k) || isVideo) && k!=='transition' && (k!=='duration' || !shot.timing_structured)).map(k=>k+': '+(k==='duration' && isVideo ? pdir_renderTiming(shot[k],false,false) : shot[k])).join('; ');
      if(isVideo && shot.duration?.trim() && (shot.timing_structured || shot.timing_freeze)){
        const extra=pdir_renderTiming(shot.duration,Boolean(shot.timing_structured),Boolean(shot.timing_freeze));
        if(shot.timing_structured){positive+='\n\n'+extra;}
        else if(shot.timing_freeze && pdir_parseTiming(shot.duration).last!==null){positive+='\n\n'+extra.split('\n').slice(-1)[0];}
      }
    }
    const direction = $('prompt_projectDirection')?.value.trim() || '';
    if (direction) positive += `\nProject direction: ${direction}`;
    const locks = prompt_getConsistencyLocks();
    if (locks.length) positive += `\nPreserve established ${locks.map((key) => key.replaceAll('_',' ')).join(', ')}.`;
    const exclusions = $('prompt_negativeInput')?.value.trim() || '';
    if (exclusions && prompt_selectedProfile().capabilities?.negative_prompt === false) positive += `\nExclusions: ${exclusions}`;
    const refs = prompt_collectReferences();
    if (refs.length) {
      const flow = prompt_selectedProfile()?.workflows?.[$('prompt_model_mode')?.value || ''];
      const guidance = refs.map((ref) => {
        const native = (ref.kind === 'reference_video' && flow?.min_videos > 0) || (flow?.max_images > 0 && (flow.native_image_kinds || []).includes(ref.kind));
        const traits = new Set([ref.role]);
        Object.entries(C.referencePurposePatterns || {}).forEach(([trait, pattern]) => {
          if (new RegExp('\\b(?:' + pattern + ')\\b', 'iu').test(ref.purpose || '')) traits.add(trait);
        });
        const camera = traits.has('camera_motion') || /\b(camera|camra|kamera|kamerafahrt|schwenk|dolly|zoom)\b/i.test(ref.purpose || '');
        const fidelity = native ? [...traits].map(trait => C.referenceFidelityRules?.[trait] || '').filter(Boolean).join(' ') : 'Preserve only the explicitly described details; this workflow does not receive this reference as a native input. Do not invent unseen properties.';
        if (native && camera) {
          const detail = !/^(motion|movement|camera movement|camera motion|bewegung|kamerabewegung)$/i.test(ref.description || '') && ref.description ? ` Preserve the supplied camera description: ${ref.description}.` : '';
          return `Follow the camera movement from ${ref.reference}, including its direction, speed and rhythm.${detail}${ref.timing ? ` Apply the supplied timing: ${ref.timing}.` : ''} Do not add a different camera move.${ref.purpose ? ` Apply the stated purpose of ${ref.reference}: ${ref.purpose}.` : ''} ${fidelity}`;
        }
        return `${native ? 'Use ' : 'Use the described content of '}${ref.reference} only for ${ref.role.replaceAll('_',' ')}${ref.description ? `: ${ref.description}` : ''}${ref.purpose ? `; apply the stated purpose: ${ref.purpose}` : ''}${ref.timing ? `; preserve the timing: ${ref.timing}` : ''}. ${fidelity}${native ? ' Keep this reference’s assigned properties separate from other references. General style instructions must not redesign protected details; modify only properties explicitly requested by the user.' : ''}`;
      }).join(' ');
      positive = `${positive} ${guidance}`.trim();
    }
    {
      const o = prompt_collectModelOptions();
      if (['rgba','transparent'].includes(o.mode)) {
        positive = `This is an RGBA image with transparency. ${positive}. The image has alpha channel and the background is transparent.`;
      } else if (o.mode === 'cutout') {
        positive = prompt_selectedProfile().capabilities?.rgba ? `Extract the subject from the described image as an RGBA image with transparent background. ${positive}` : `Isolate the subject for downstream background removal. ${positive}`;
      }
    }
    pdir_setPositive(positive);
    prompt_updateNegativeResult(prompt_buildNegative(isVideo, targetModel));
    if ($('prompt_experimentOutput')) $('prompt_experimentOutput').value = positive;
    const payload = prompt_requestPayload();
    if ($('prompt_originalPrompt')) $('prompt_originalPrompt').value = prompt_requestSummary(payload);
    prompt_renderMeta({ target_model: targetModel, model_options: payload.model_options || {} }, payload);
    prompt_renderBreakdown([]);
    prompt_renderAdjustment('Rule-based mode preserves your entries without creative additions or translation. Prompt history is saved only for AI generations.');
    prompt_renderLicenseNotice('');
    $('prompt_resultArea').classList.remove('prompt_hidden');
  }

  async function prompt_copyField(id) {
    const f = $(id);
    if (!f) return;
    try {
      await navigator.clipboard.writeText(f.value || '');
      prompt_showToast('Copied');
    } catch (_) {
      f.select();
      try { document.execCommand('copy'); prompt_showToast('Copied'); }
      catch (e) { prompt_showToast('Clipboard access denied', true); }
    }
  }

  // v3.0.0 Timing_01: deterministic MMSS parsing shared by previews and rule-based output.
  const pdir_freezeText='ABSOLUTE FREEZE FRAME. Completely static image, zero motion, no morphing, no camera movement, no liquid dripping. The scene holds the exact final frame without any changes or alterations for the remainder of the video.';
  const pdir_timecode=seconds=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  function pdir_parseTiming(raw){
    const items=[];let last=null;
    String(raw||'').split(/\r\n|\r|\n/).forEach(text=>{
      const line=text.trim();if(!line)return;
      const match=line.match(/^\[?(\d{2}:?\d{2})(?:\s*-\s*(\d{2}:?\d{2}))?\]?\s+(.+)$/u);
      if(match){
        const toSeconds=value=>{const t=value.replace(':','');const sec=Number(t.slice(2));return sec<60 ? Number(t.slice(0,2))*60+sec : null;};
        const start=toSeconds(match[1]);const end=match[2]?toSeconds(match[2]):start;
        if(start!==null && end!==null && end>=start){
          items.push({tag:`[${pdir_timecode(start)}${end!==start?' - '+pdir_timecode(end):''}]`,start,end,action:match[3].trim()});
          last=end;return;
        }
      }
      items.push({tag:'',start:null,end:null,action:line});
    });
    return {items,last};
  }
  function pdir_renderTiming(raw,structured,freeze){
    const {items,last}=pdir_parseTiming(raw);
    if(!items.length)return '';
    const asProse=item=>item.start===null?item.action:`${item.start===item.end?'At '+pdir_timecode(item.start):'From '+pdir_timecode(item.start)+' to '+pdir_timecode(item.end)}: ${item.action}`;
    const lines=structured?['[TIMING & SEQUENCE]',...items.map(item=>(item.tag?item.tag+' ':'')+item.action)]:[items.map(asProse).join(' ')];
    if(freeze && last!==null)lines.push(`[${pdir_timecode(last+1)}] ${pdir_freezeText}`);
    return lines.join('\n');
  }
  function pdir_updateTimingPreview(){
    const shot=production_shots.find(x=>x.id===production_selected);
    const field=$('shot_duration'), preview=$('pdir_timingPreview'),hint=$('pdir_timingHint');
    if(!field || !preview || !hint)return;
    const raw=field.value || '';
    const structured=Boolean($('shot_timing_structured')?.checked);
    const freeze=Boolean($('shot_timing_freeze')?.checked);
    const parsed=pdir_parseTiming(raw);
    preview.hidden=!shot || !raw.trim();
    if(!preview.hidden)preview.textContent=pdir_renderTiming(raw,structured,freeze);
    if(!raw.trim())hint.textContent='Kurzformat: 0001 Aktion oder 0003-0004 Aktion. Beide Optionen sind pro Shot speicherbar.';
    else if((structured||freeze) && parsed.last===null)hint.textContent='Kein gültiger MMSS-Zeitcode erkannt. Für den Freeze Frame ist mindestens ein Zeitcode erforderlich.';
    else if(freeze && parsed.last!==null)hint.textContent=`Freeze Frame beginnt bei [${pdir_timecode(parsed.last+1)}]. Die Videodauer wird dadurch nicht automatisch geändert.`;
    else hint.textContent=structured?'Strukturierte Zeitcodes werden unten als Prompt-Vorschau angezeigt.':'Zeitangaben werden als Fließtext übernommen.';
  }
  let production_shots=[]; let production_selected='';
  const production_briefKeys=['brand','audience','message','effect','mandatory','exclusions'];
  const production_shotKeys=['title','idea','change','start','action','camera','lighting','composition','look','features','camera_motion','end','duration','transition'];
  // The selected Shot has its own model. Legacy Shots without target_model inherit
  // the project's target model until the user changes them.
  const pdir_lastModelByType={image:'',video:''};
  function pdir_populateTargetModels(mediaType='',preferred=''){
    const select=$('prompt_targetModel');
    if(!select)return '';
    const profiles=Object.values(prompt_modelProfiles);
    if(!profiles.length)return select.value;
    const existing=select.value;
    const allowed=profiles.filter(p=>!mediaType || p.type===mediaType);
    if(!allowed.length)return '';
    const selected=[preferred,existing,pdir_lastModelByType[mediaType]].find(key=>allowed.some(p=>p.key===key)) || allowed[0].key;
    select.replaceChildren();
    (mediaType?[mediaType]:['image','video']).forEach(type=>{
      const group=document.createElement('optgroup');group.label=type==='video'?'VIDEO MODELS':'IMAGE MODELS';
      allowed.filter(p=>p.type===type).forEach(p=>{
        const option=document.createElement('option');option.value=p.key;option.textContent=p.label;group.append(option);
      });
      if(group.children.length)select.append(group);
    });
    select.value=selected;
    return selected;
  }
  function pdir_restoreShotTargetModel(){
    const shot=prompt_workflow==='customer' ? production_shots.find(s=>s.id===production_selected) : null;
    const selectedModel=shot?.target_model && prompt_modelProfiles[shot.target_model] ? shot.target_model : $('prompt_targetModel')?.value || '';
    const type=shot?.media_type==='video' || shot?.media_type==='image'
      ? shot.media_type : (prompt_modelProfiles[selectedModel]?.type || 'image');
    const remembered=shot?.['model_'+type];
    const preferred=prompt_modelProfiles[selectedModel]?.type===type ? selectedModel
      : prompt_modelProfiles[remembered]?.type===type ? remembered : '';
    pdir_populateTargetModels(shot?type:'',preferred);
    prompt_modelChanged();
  }
  function pdir_selectShotMedia(type){
    const shot=production_shots.find(s=>s.id===production_selected);
    if(prompt_busy || prompt_workflow!=='customer' || !shot)return;
    const models=Object.values(prompt_modelProfiles).filter(p=>p.type===type);
    if(!models.length){prompt_showToast('Für diesen Medientyp ist kein aktives Modell verfügbar.',true);return;}
    const old=$('prompt_targetModel')?.value || '';
    const oldType=prompt_modelProfiles[old]?.type;
    if(oldType==='image' || oldType==='video')shot['model_'+oldType]=old;
    const prior=shot['model_'+type] || '';
    const preferred=prompt_modelProfiles[old]?.type===type ? old
      : prompt_modelProfiles[prior]?.type===type ? prior : (pdir_lastModelByType[type] || '');
    const selected=pdir_populateTargetModels(type,preferred);
    if(!selected)return;
    shot.media_type=type;
    shot.target_model=selected;
    shot['model_'+type]=selected;
    pdir_lastModelByType[type]=selected;
    prompt_modelChanged();
    prompt_scheduleAutosave();
  }
  function pdir_updateShotMediaUI(){
    const profile=prompt_selectedProfile();
    const isVideo=profile.type==='video';
    // Examples follow the selected media type. Placeholders are UI-only, never prompt input.
    const shotIdea=$('shot_idea');
    if(shotIdea)shotIdea.placeholder=isVideo
      ? 'z. B. Ein Radfahrer fährt eine kurvige Bergstraße hinauf. Ein Vogel fliegt auf Augenhöhe neben ihm, während ein Löwe hinter ihm läuft. Eine durchgehende Einstellung.'
      : 'z. B. Ein Radfahrer auf einem roten Rennrad fährt eine kurvige Bergstraße hinauf. Neben ihm fliegt ein Vogel, hinter ihm rennt ein Löwe.';
    const badge=$('pdir_shotTypeText');if(badge)badge.textContent=isVideo?'VIDEO':'IMAGE';
    root.querySelectorAll('#pdir_shotDetails .pdir-video-only').forEach(el=>{el.hidden=!isVideo;});
    const enabled=prompt_workflow==='customer' && !!production_shots.find(s=>s.id===production_selected);
    [['pdir_shotMediaImage','image'],['pdir_shotMediaVideo','video']].forEach(([id,type])=>{
      const btn=$(id);if(!btn)return;
      const active=profile.type===type;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-pressed',active?'true':'false');
      btn.disabled=!enabled || !Object.values(prompt_modelProfiles).some(p=>p.type===type);
    });
    const hint=$('pdir_shotModelHint');if(hint)hint.textContent=enabled
      ? 'Aktives Zielmodell: '+(profile.label || profile.key)+'. Weitere Optionen unter „Modell & technische Optionen“.'
      : 'Zuerst einen Shot im Project Workspace auswählen.';
  }
  function production_commitShot(){
    const shot=production_shots.find(x=>x.id===production_selected);
    if(!shot)return;
    production_shotKeys.forEach(k=>{const el=$('shot_'+k);if(el)shot[k]=el.value || '';});
    shot.timing_structured=Boolean($('shot_timing_structured')?.checked);
    shot.timing_freeze=Boolean($('shot_timing_freeze')?.checked);
  }
  function production_snapshot(){production_commitShot();return {briefing:Object.fromEntries(production_briefKeys.map(k=>[k,$('production_'+k)?.value || ''])),series_rules:$('production_series')?.value || '',shots:production_shots,selected_shot_id:production_selected};}
  function production_restore(data){production_shots=JSON.parse(JSON.stringify(data.shots || []));production_selected=data.selected_shot_id || '';production_briefKeys.forEach(k=>{if($('production_'+k))$('production_'+k).value=data.briefing?.[k] || '';});if($('production_series'))$('production_series').value=data.series_rules || '';production_renderShots(false);}
  function production_options(el,items,first){if(!el)return;const old=el.value;el.replaceChildren(new Option(first,''));items.forEach(([v,l])=>el.add(new Option(l,String(v))));if([...el.options].some(x=>x.value===old))el.value=old;}
  // UI-21: section heading always follows the current Shot; no stale title in free mode.
  function pdir_updateShotHeading(){
    const heading=$('pdir_activeShotHeading');
    if(!heading)return;
    const shot=prompt_workflow==='customer' && production_selected
      ? production_shots.find(item=>item.id===production_selected)
      : null;
    const title=shot?String(shot.title || '').trim():'';
    heading.textContent=shot?' – '+(title || 'Shot'):'';
    heading.hidden=!shot;
  }
  function production_renderShots(syncModel=true){production_options($('production_shot'),production_shots.map(x=>[x.id,x.title || 'Shot']),'Kein Shot');if($('production_shot'))$('production_shot').value=production_selected;const shot=production_shots.find(x=>x.id===production_selected);const duplicateButton=$('production_duplicate');if(duplicateButton)duplicateButton.disabled=!shot || prompt_workflow!=='customer' || !prompt_activeProjectId;production_shotKeys.forEach(k=>{const el=$('shot_'+k);if(el){el.value=shot?.[k] || '';el.disabled=!shot;}});[['shot_timing_structured','timing_structured'],['shot_timing_freeze','timing_freeze']].forEach(([id,key])=>{const el=$(id);if(el){el.checked=Boolean(shot?.[key]);el.disabled=!shot;}});pdir_updateTimingPreview();const deviation=$('pdir_shotDeviation');if(deviation)deviation.open=Boolean(shot?.change?.trim());pdir_updateShotHeading();if(syncModel)pdir_restoreShotTargetModel();else pdir_updateShotMediaUI();}
  // Copy only the persisted Shot data. Prompt versions/results are keyed by the
  // original Shot ID in project history and must never be cloned or re-linked.
  function production_duplicateShot(){
    if(prompt_busy || prompt_workflow!=='customer' || !prompt_activeProjectId)return;
    production_commitShot(); // Capture the last unsaved field edits first.
    const index=production_shots.findIndex(x=>x.id===production_selected);
    if(index<0){prompt_showToast('Bitte zuerst einen Shot auswählen.',true);return;}
    if(production_shots.length>=50){prompt_showToast('Maximal 50 Shots.',true);return;}
    const source=production_shots[index];
    const copy=JSON.parse(JSON.stringify(source));
    let id;
    do { id='shot_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }
    while(production_shots.some(x=>x.id===id));
    copy.id=id;
    const suffix=' – Kopie';
    copy.title=String(source.title || 'Shot').slice(0,120-suffix.length)+suffix;
    production_shots.splice(index+1,0,copy);
    production_selected=id;
    production_renderShots();
    prompt_renderProjectHistory();
    prompt_showLatestForSelectedShot(); // New ID has no prompt history/results.
    prompt_scheduleAutosave();
    prompt_showToast('Shot dupliziert: '+copy.title);
  }
  let production_revisionProject='';
  function production_updateRevisionPreview(){
    const item=prompt_projectHistory.find(x=>Number(x.version)===Number($('production_revision')?.value));
    if($('production_revisionPreview'))$('production_revisionPreview').value=($('pdir_revisionTarget')?.value==='negative' ? item?.negative_prompt : item?.prompt) || '';
    if($('production_revisionPreviewWrap'))$('production_revisionPreviewWrap').hidden=!item;
    if(item)production_diff(item);
    if($('pdir_revisionOverride'))$('pdir_revisionOverride').checked=false;
  }
  function production_versions(){
    const shots=prompt_projects[prompt_activeProjectId]?.production?.shots||production_shots;
    const items=prompt_projectHistory.map(x=>{
      const shot=shots.find(s=>s.id===x.shot_id);
      const title=shot?.title || x.shot_title || (x.shot_id?'Ehemaliger Shot':'Projektweite Version');
      const model=prompt_modelProfiles[x.target_model]?.label || x.target_model || 'Unbekanntes Modell';
      return [x.version,'V'+x.version+(x.parent_version?' · Revision aus V'+x.parent_version:'')+' · '+title+' · '+model];
    }).filter(([version])=>prompt_workflow!=='customer' || !production_selected || prompt_projectHistory.some(x=>Number(x.version)===Number(version)&&x.shot_id===production_selected));
    production_options($('production_revision'),items,'Neue Generierung');
    if(production_revisionProject!==prompt_activeProjectId){production_revisionProject=prompt_activeProjectId;if($('production_revision'))$('production_revision').value='';}
    const selector=$('production_revision');
    if(selector && items.length && !selector.value)selector.value=String(items[0][0]);
    production_updateRevisionPreview();
  }
  function production_diff(item){
    production_revision_quality(item);
    const el=$('production_diff'), wrap=$('pdir_revisionDiffWrap');
    if(!el)return;
    el.replaceChildren();
    if(wrap)wrap.hidden=!(item?.parent_version && item?.base_prompt);
    if(!item?.parent_version || !item?.base_prompt)return;
    const versions=$('pdir_revisionDiffVersions');
    if(versions)versions.textContent='V'+item.parent_version+' → V'+item.version;
    el.hidden=false;
    $('pdir_revisionDiffToggle')?.setAttribute('aria-expanded','true');
    if($('pdir_revisionDiffCaret'))$('pdir_revisionDiffCaret').textContent='−';const title=document.createElement('h3');title.textContent='V'+item.version+' aus V'+item.parent_version+' · '+item.requested_change;el.append(title);const isNeg=item.revision_target==='negative';const a=String(isNeg ? (item.base_negative_prompt || '') : (item.base_prompt || '')).split(/(\s+)/),b=String(isNeg ? (item.negative_prompt || '') : (item.prompt || '')).split(/(\s+)/);const operations=[];if(a.length*b.length<=1000000){const matrix=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)matrix[i][j]=a[i]===b[j]?matrix[i+1][j+1]+1:Math.max(matrix[i+1][j],matrix[i][j+1]);let i=0,j=0;while(i<a.length || j<b.length){if(i<a.length&&j<b.length&&a[i]===b[j]){operations.push(['same',a[i]]);i++;j++;}else if(j<b.length&&(i===a.length||matrix[i][j+1]>=matrix[i+1][j])){operations.push(['ins',b[j++]]);}else operations.push(['del',a[i++]]);}}else{operations.push(['del',a.join('')],['ins',b.join('')]);}let type='',node=null;for(const [kind,text] of operations){if(kind!==type){type=kind;node=kind==='same'?document.createTextNode(''):document.createElement(kind);el.append(node);}node.textContent+=text;}}
  function production_init(){
    if(!$('production_shot'))return;
    $('shot_duration')?.addEventListener('input',pdir_updateTimingPreview);
    ['shot_timing_structured','shot_timing_freeze'].forEach(id=>$(id)?.addEventListener('change',()=>{production_commitShot();pdir_updateTimingPreview();}));
    $('pdir_revisionDiffToggle')?.addEventListener('click',()=>{
      const diff=$('production_diff');if(!diff)return;
      diff.hidden=!diff.hidden;
      $('pdir_revisionDiffToggle').setAttribute('aria-expanded',diff.hidden?'false':'true');
      if($('pdir_revisionDiffCaret'))$('pdir_revisionDiffCaret').textContent=diff.hidden?'+':'−';
    });
    // The only Shot-title editor lives in Section 01; reuse the existing Shot data and autosave.
    $('shot_title')?.addEventListener('input',()=>{
      const shot=production_shots.find(x=>x.id===production_selected);
      if(!shot)return;
      shot.title=$('shot_title').value;
      const option=Array.from($('production_shot').options).find(x=>x.value===shot.id);
      if(option)option.textContent=shot.title || 'Shot';
      pdir_updateShotHeading();
    });
    $('shot_title')?.addEventListener('change',()=>prompt_renderProjectHistory());
    $('production_shot').addEventListener('change',()=>{production_commitShot();production_selected=$('production_shot').value;production_renderShots();prompt_renderProjectHistory();prompt_showLatestForSelectedShot();prompt_scheduleAutosave();});$('production_duplicate')?.addEventListener('click',production_duplicateShot);$('production_add').addEventListener('click',()=>{production_commitShot();if(production_shots.length>=50){prompt_showToast('Maximal 50 Shots.',true);return;}production_selected='shot_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);production_shots.push({id:production_selected,title:'Shot '+(production_shots.length+1),idea:'',change:'',media_type:prompt_selectedProfile().type,target_model:$('prompt_targetModel')?.value || '',['model_'+prompt_selectedProfile().type]:$('prompt_targetModel')?.value || ''});production_renderShots();prompt_renderProjectHistory();prompt_showLatestForSelectedShot();prompt_scheduleAutosave();});$('production_remove').addEventListener('click',prompt_guardAction(async()=>{if(!production_selected)return;if(!await window.PDIRDialog.confirm('Ausgewählten Shot aus diesem Arbeitsstand entfernen?',{title:'Shot entfernen',accept:'Entfernen',danger:true}))return;production_shots=production_shots.filter(x=>x.id!==production_selected);production_selected='';production_renderShots();prompt_renderProjectHistory();prompt_showLatestForSelectedShot();prompt_scheduleAutosave();}));$('production_revision').addEventListener('change',()=>{if(prompt_busy)return;production_updateRevisionPreview();});$('pdir_revisionTarget')?.addEventListener('change',production_updateRevisionPreview);$('production_check').addEventListener('click',async()=>{try{await production_check(prompt_requestPayload(),{manual:true});}catch(e){prompt_showToast(e.message,true);}});prompt_updateConflictStatus();
    $('production_conflictReference')?.addEventListener('change',prompt_markSemanticDirty);
    $('production_conflictProject')?.addEventListener('change',prompt_markSemanticDirty);
    const semanticButton=$('production_semanticCheck');
    if(semanticButton){semanticButton.hidden=!prompt_conflictPolicy.semantic;semanticButton.addEventListener('click',async()=>{
      if(!prompt_conflictPolicy.semantic)return;
      semanticButton.disabled=true;
      const note=$('production_semanticNote');if(note){note.hidden=false;note.textContent='KI-Prüfung läuft …';}
      const checkedHash=prompt_conflictHash(),checkedProject=prompt_activeProjectId || '';
      try{
        await prompt_api('/semantic-check',{method:'POST',body:prompt_requestPayload()});
        if(checkedHash!==prompt_conflictHash() || checkedProject!==(prompt_activeProjectId || '')){
          prompt_markSemanticDirty();
          prompt_showToast('Eingaben wurden während der KI-Prüfung verändert. Erneute Prüfung erforderlich.','warning');
          return;
        }
        prompt_semanticLastHash=checkedHash;prompt_semanticProjectId=checkedProject;prompt_semanticChecked=true;
        prompt_markSemanticDirty();
        await production_check(prompt_requestPayload(),{manual:true});
      }
      catch(e){prompt_markSemanticDirty();if(note)note.textContent='KI-Prüfung fehlgeschlagen: '+e.message;prompt_showToast(e.message,true);}
      finally{semanticButton.disabled=false;}
    });}
    prompt_markSemanticDirty();$('production_qualityAck').addEventListener('change',()=>{if($('production_qualityAck').checked&&production_qualityFingerprint)production_storeAcceptance(production_qualityFingerprint);else production_revokeAcceptance(production_qualityFingerprint);});production_renderShots();}
  // H: Preflight acceptance is scoped to the current project, inputs and the
  // exact warnings returned by the server. Never accept a new warning silently.
  let production_qualityFingerprint='';
  const production_acceptedChecks=new Map();
  function production_acceptStorageKey(key){
    // Include WordPress user and origin to avoid cross-account acknowledgements.
    let hash=2166136261;
    for(let i=0;i<key.length;i++){hash^=key.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return 'pdir_preflight_1614_'+String(C.userId || 'anonymous')+'_'+(hash>>>0).toString(16);
  }
  function production_isPreviouslyAccepted(key){
    if(production_acceptedChecks.get(key)===true)return true;
    if(production_acceptedChecks.get(key)===false)return false;
    try { return localStorage.getItem(production_acceptStorageKey(key))===key; }
    catch(_) { return false; }
  }
  function production_storeAcceptance(key){
    if(!key)return;
    production_acceptedChecks.set(key,true);
    try{localStorage.setItem(production_acceptStorageKey(key),key);}catch(_){}
  }
  function production_revokeAcceptance(key){
    if(!key)return;
    production_acceptedChecks.set(key,false);
    try{localStorage.removeItem(production_acceptStorageKey(key));}catch(_){}
  }
  function production_checkKey(payload){
    const w=payload.workspace||{},production=w.production||{};
    return JSON.stringify({
      project:payload.project_id || '',
      input_mode:payload.input_mode || '',
      idea:payload.idea || '',groups:payload.groups || [],
      distance:payload.distance || '',angle:payload.angle || '',
      style:payload.style || '',lighting:payload.lighting || '',
      negative_input:payload.negative_input || '',
      briefing:production.briefing || {},series:production.series_rules || '',
      shots:production.shots || [],selected_shot_id:production.selected_shot_id || '',
      direction:payload.project_direction || '',exceptions:w.exceptions || '',
      customer:w.customer_snapshot || {},references:payload.references || [],
      conflict_overrides:w.conflict_overrides || {},
      revision:payload.revision || null,model_options:payload.model_options || {}
    });
  }
  function production_warningList(el,quality){
    if(!el)return;el.replaceChildren();
    for(const warning of quality?.warnings || []){
      const p=document.createElement('p');
      p.textContent='⚠ '+warning.message+(warning.fix?' Vorschlag: '+warning.fix:'');el.append(p);
    }
    const note=document.createElement('p');note.textContent=quality?.notice || '';el.append(note);
  }
  async function production_check(payload,{manual=false}={}){
    const fingerprint=production_checkKey(payload),ack=$('production_qualityAck');
    const checkButton=$('production_check');
    const status=$('production_checkStatus');
    if(manual&&checkButton){checkButton.disabled=true;checkButton.setAttribute('aria-busy','true');}
    if(status&&manual)status.textContent='Eingaben werden geprüft …';
    try{
      const data=await prompt_api('/preflight',{method:'POST',body:payload});
      // Include the precise warning code and content, not merely their count.
      const warningsList=data.quality?.warnings || [];
      const warnings=JSON.stringify(warningsList.map(x=>[x.code || '',x.message || '',x.fix || '']));
      const key=fingerprint+'|'+warnings;
      const hasWarnings=warningsList.length>0;
      const hasBlocking=Array.isArray(data.quality?.blocking)&&data.quality.blocking.length>0;
      if(production_qualityFingerprint!==key){
        ack.checked=hasWarnings&&!hasBlocking&&production_isPreviouslyAccepted(key);
      }
      production_qualityFingerprint=key;
      if(hasBlocking)ack.checked=false;
      if(hasWarnings&&!hasBlocking&&ack.checked)production_storeAcceptance(key);
      if(!hasWarnings)ack.checked=false;
      ack.disabled=!hasWarnings||hasBlocking;
      production_warningList($('production_quality'),data.quality);
      const message=hasBlocking
        ? 'Generierung gesperrt: Blockierende Eingabekonflikte unter 06 – Eingabeprüfung beheben.'
        : hasWarnings
        ? 'Prüfung abgeschlossen: '+warningsList.length+' Hinweis(e) · '+(ack.checked?'bereits bestätigt.':'Bestätigung erforderlich.')
        : 'Prüfung abgeschlossen: keine Hinweise.';
      if(status)status.textContent=message+' · '+new Date().toLocaleTimeString('de-DE');
      prompt_setCheckBadge(hasBlocking?'blocked':hasWarnings?'warning':'clear');
      if(manual)prompt_showToast(message,hasWarnings&&!ack.checked?'warning':'success');
      return !hasBlocking&&(!hasWarnings || ack.checked);
    }catch(e){
      if(status)status.textContent='Prüfung fehlgeschlagen: '+e.message;
      prompt_setCheckBadge('pending');
      throw e;
    }finally{
      if(manual&&checkButton){checkButton.disabled=false;checkButton.removeAttribute('aria-busy');}
    }
  }
  function production_revision_quality(item){$('production_revisionQuality')?.replaceChildren();if(!item.parent_version)return;production_warningList($('production_revisionQuality'),item.revision_quality || {notice:'Für diese ältere Version wurde noch keine Wortlautprüfung gespeichert.'});}
  // Register both startup routines only after all top-level const/let bindings
  // have been initialized; also safe when injected after DOMContentLoaded.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prompt_init, { once: true });
    document.addEventListener('DOMContentLoaded', production_init, { once: true });
  } else {
    void prompt_init();
    production_init();
  }
})();
