(() => {
  'use strict';
  let queue = Promise.resolve(), sequence = 0;
  function open(config) {
    return new Promise(resolve => {
      const previous = document.activeElement;
      const overlay = document.createElement('div'); overlay.className = 'pdir-dialog-overlay';
      const themeSource=document.getElementById('prompt_root');
      if(themeSource){const theme=getComputedStyle(themeSource);for(const [target,source] of Object.entries({'--ts-bg-panel':'--prompt-card','--ts-bg-secondary':'--prompt-bg-2','--ts-text-primary':'--prompt-text','--ts-text-secondary':'--prompt-dim','--ts-border':'--prompt-border','--ts-accent':'--prompt-accent','--ts-font-body':'--prompt-font-body','--ts-font-display':'--prompt-font-head'})){const value=theme.getPropertyValue(source).trim();if(value)overlay.style.setProperty(target,value);}}

      const form = document.createElement('form'); form.className = 'pdir-dialog'; form.noValidate=true;
      form.setAttribute('role','dialog'); form.setAttribute('aria-modal','true');
      const id = 'pdir-dialog-' + (++sequence);
      form.setAttribute('aria-labelledby',id);
      const title = document.createElement('h2'); title.id=id; title.textContent=config.title || 'Bestätigung';
      const description = document.createElement('p'); description.id=id+'-description'; description.textContent=config.message || '';
      form.setAttribute('aria-describedby',description.id); form.append(title,description);
      if(config.diff){
        const wrap=document.createElement('div');wrap.className='pdir-customer-diff';
        const before=String(config.diff.before || '');const after=String(config.diff.after || '');
        // Bounded word-level LCS: no user-generated string is ever interpreted as HTML.
        // Extremely long texts use a linear prefix/suffix preview to keep dialogs responsive.
        const tokenize=text=>text.match(/\s+|[^\s]+/gu)||[];
        const a=tokenize(before),b=tokenize(after);
        const oldFlags=new Uint8Array(a.length),newFlags=new Uint8Array(b.length);
        if(a.length*b.length<=240000){
          const cols=b.length+1,table=new Uint16Array((a.length+1)*cols);
          for(let i=a.length-1;i>=0;i--){for(let j=b.length-1;j>=0;j--){const pos=i*cols+j;table[pos]=a[i]===b[j]?1+table[(i+1)*cols+j+1]:Math.max(table[(i+1)*cols+j],table[i*cols+j+1]);}}
          let i=0,j=0;
          while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(table[(i+1)*cols+j]>=table[i*cols+j+1])oldFlags[i++]=1;else newFlags[j++]=1;}
          while(i<a.length)oldFlags[i++]=1;while(j<b.length)newFlags[j++]=1;
        }else{
          let i=0,j=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;
          while(j<a.length-i&&j<b.length-i&&a[a.length-1-j]===b[b.length-1-j])j++;
          for(let k=i;k<a.length-j;k++)oldFlags[k]=1;
          for(let k=i;k<b.length-j;k++)newFlags[k]=1;
        }
        const pane=(heading,tokens,flags,kind)=>{
          const col=document.createElement('section');col.className='pdir-customer-diff-pane';
          const headingEl=document.createElement('strong');headingEl.textContent=heading;col.append(headingEl);
          const content=document.createElement('div');content.className='pdir-customer-diff-text';
          if(!tokens.length)content.textContent='Keine Vorgaben';
          else tokens.forEach((word,i)=>{
            if(flags[i]){const mark=document.createElement('mark');mark.className='pdir-diff-'+kind;mark.textContent=word;content.append(mark);}
            else content.append(document.createTextNode(word));
          });
          col.append(content);return col;
        };
        wrap.append(pane('Bisheriger Projektstand · Entfernt (rot)',a,oldFlags,'removed'),pane('Aktuelles Kundenprofil · Neu (grün)',b,newFlags,'added'));
        form.append(wrap);
      }

      const inputs = {};
      for (const field of config.fields || []) {
        const label=document.createElement('label');label.textContent=field.label;
        const input=document.createElement(field.type==='textarea'?'textarea':field.type==='select'?'select':'input');
        input.id=id+'-'+field.key;label.htmlFor=input.id;input.name=field.key;
        if(field.type==='select') for(const [value,text] of field.options || []){const opt=document.createElement('option');opt.value=value;opt.textContent=text;input.append(opt);}
        if(input.tagName==='INPUT')input.type='text';
        input.value=field.value || ''; input.required=Boolean(field.required);
        if(field.maxLength)input.maxLength=field.maxLength;
        if(field.type==='textarea')input.rows=field.rows || 3;
        inputs[field.key]=input;label.append(input);form.append(label);
      }
      const error=document.createElement('p');error.className='pdir-dialog-error';error.setAttribute('role','alert');form.append(error);
      const actions=document.createElement('div');actions.className='pdir-dialog-actions';form.append(actions);
      let settled=false;
      const inerted=[...document.body.children].filter(el=>el!==overlay&&!el.hasAttribute('inert'));
      const oldOverflow=document.body.style.overflow;
      function finish(value){if(settled)return;settled=true;document.removeEventListener('keydown',keydown,true);overlay.remove();inerted.forEach(el=>el.removeAttribute('inert'));document.body.style.overflow=oldOverflow;if(previous?.isConnected)previous.focus();resolve(value);}
      const choices=config.choices || [{value:'accept',label:config.accept || 'Bestätigen',primary:true}];
      for(const choice of choices){
        const button=document.createElement('button');button.type='button';button.textContent=choice.label;button.dataset.dialogChoice=choice.value;
        if(choice.primary)button.className='pdir-dialog-primary';
        if(config.danger&&choice.primary)button.classList.add('pdir-dialog-danger');
        button.addEventListener('click',()=>{
          const values=Object.fromEntries(Object.entries(inputs).map(([k,el])=>[k,el.value.trim()]));
          if(choice.primary&&!form.checkValidity()){error.textContent='Bitte die Pflichtfelder und Eingabegrenzen prüfen.';return;}
          if(choice.primary&&Object.entries(inputs).some(([k,el])=>el.required&&!values[k])){error.textContent='Bitte alle Pflichtfelder ausfüllen.';return;}
          const problem=choice.primary&&config.validate?.(values);
          if(problem){error.textContent=problem;return;}
          finish({choice:choice.value,values});
        });actions.append(button);
      }
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent=config.cancel || 'Abbrechen';cancel.dataset.dialogCancel='1';cancel.addEventListener('click',()=>finish(null));actions.append(cancel);
      form.addEventListener('submit',event=>{event.preventDefault();actions.querySelector('.pdir-dialog-primary')?.click();});
      function keydown(event){
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(null);}
        if(event.key==='Tab'){
          const list=[...form.querySelectorAll('input,select,textarea,button')].filter(el=>!el.disabled);
          const first=list[0],last=list.at(-1);
          if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
          else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
        }
      }
      overlay.addEventListener('click',event=>{if(event.target===overlay)finish(null);});
      overlay.append(form);document.body.append(overlay);inerted.forEach(el=>el.setAttribute('inert',''));document.body.style.overflow='hidden';
      document.addEventListener('keydown',keydown,true);(Object.values(inputs)[0] || (config.danger?cancel:actions.querySelector('button'))).focus();
    });
  }
  window.PDIRDialog={
    open(config){const next=queue.then(()=>open(config));queue=next.catch(()=>null);return next;},
    async confirm(message,options={}){return Boolean(await this.open({title:options.title || 'Bitte bestätigen',message,accept:options.accept || 'Bestätigen',danger:options.danger}));},
    async prompt(message,value=''){const result=await this.open({title:message,fields:[{key:'value',label:'Eingabe',value,required:true,maxLength:200}],accept:'Übernehmen'});return result?.values.value ?? null;}
  };
})();
