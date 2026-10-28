<?php if ( ! defined( 'ABSPATH' ) ) { exit; } ?>
<div class="prompt_wrap" id="prompt_root">
  <div class="prompt_inner">
    <!-- TOPBAR -->
    <header class="prompt_topbar">
      <div class="prompt_brand">
        <strong>PromtDirector</strong>
        <span>Editor / AI Creative Production</span>
      </div>
      <div class="prompt_topbar-right">
        <span class="prompt_sec-badge">Protected</span>
        <span>Server / Encrypted</span>
      </div>
    </header>

    <!-- HERO -->
    <section class="prompt_hero">
      <div>
        <div class="prompt_kicker">
          Ideas &nbsp;Constraints &nbsp;Syntax &nbsp;New Worlds
        </div>
        <h1>Promt<br />Director.</h1>
        <div class="prompt_sub">
          Flux &nbsp;Nano Banana &nbsp;Veo &nbsp;Seedance &nbsp;And Beyond.
        </div>
      </div>
      <div class="prompt_hero-side">
        Input: DE / VN.<br />Output: EN forced.<br />Better images.
        <div class="prompt_rule prompt_rule-accent"></div>
      </div>
    </section>

    <!-- LOCK SCREEN -->
    <div id="prompt_lockScreen">
      <div class="prompt_lock-box">
        <div class="prompt_kicker" style="margin-bottom:12px;">01 / API Access</div>
        <h2>API freischalten.</h2>
        <p id="prompt_lockMessage">Gib dein Freigabe-Passwort ein. Der OpenRouter API-Key bleibt auf dem Server.</p>
        <div id="prompt_configNotice" class="prompt_setup-notice prompt_hidden">
          <strong>Einrichtung erforderlich</strong>
          API-Key und Freigabe-Passwort müssen zuerst im WordPress-Backend unter „PromtDirector“ eingerichtet werden.
        </div>
        <div class="prompt_form-group">
          <label for="prompt_masterPassword">Freigabe-Passwort</label>
          <input type="password" id="prompt_masterPassword" placeholder="Freigabe-Passwort eingeben" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" maxlength="1024" />
        </div>
        <div class="prompt_actions" style="flex-direction:column;">
          <button class="prompt_btn prompt_btn-primary" id="prompt_unlockBtn" type="button">
            <span id="prompt_lockBtnText">API freischalten →</span>
          </button>
          <button class="prompt_btn" id="prompt_offlineBtn" type="button">Ohne AI-API fortfahren</button>
        </div>
      </div>
    </div>

    <!-- MAIN INTERFACE -->
    <div id="prompt_mainInterface" class="prompt_hidden" data-pdir-flow="choose">
      <div class="prompt_info-box" id="prompt_sessionInfoBox">
        <strong>API freigeschaltet.</strong> &nbsp;Der API-Key verbleibt sicher auf dem Server.
      </div>

      <div class="pdir-flow-chooser" id="pdir_flowChooser">
        <div class="prompt_kicker">Produktionsworkflow</div>
        <h2>Wie möchtest du starten?</h2>
        <p>Wähle zuerst deinen Workflow. Beide Varianten nutzen dieselben KI-Modelle und deine bestehenden Projekte bleiben erhalten.</p>
        <div class="pdir-flow-choices">
          <button class="pdir-flow-choice" type="button" id="pdir_flowCustomer">
            <strong>Kundenprojekt</strong><span>Kunde → Projekt → Shot. Verbindliche Vorgaben und einzelne Generierungen.</span>
          </button>
          <button class="pdir-flow-choice" type="button" id="pdir_flowFree">
            <strong>Freie / schnelle Idee</strong><span>Temporär arbeiten, ohne Projektanlage oder Autosave. Prompt bei Bedarf kopieren.</span>
          </button>
        </div>
      </div>
      <div id="pdir_flowEditor" class="prompt_hidden">
        <div class="pdir-flow-bar"><span id="pdir_flowLabel"></span><button class="prompt_btn prompt_btn-small" type="button" id="pdir_flowSwitch">Workflow wechseln</button></div>
      <!-- PROJECT WORKSPACE -->
      <details class="prompt_project-direction prompt_section-accordion" id="prompt_projectDirectionAccordion">
        <summary><span class="prompt_accordion-number">01</span> Project Workspace <span id="pdir_workspaceSubtitle">Kunde · Projekt · Consistency Locks</span></summary>
        <div class="prompt_section-accordion-body">
        <div class="prompt_customer-toolbar">
          <label for="prompt_customerFilter">Kunde auswählen</label>
          <select id="prompt_customerFilter"><option value="">Freie Projekte</option></select>
          <label class="pdir-show-archived"><input type="checkbox" id="prompt_customerArchived"><span>Archivierte Kunden anzeigen</span></label>
          <div class="prompt_project-preset-actions">
            <button class="prompt_btn prompt_btn-small" id="prompt_customerNew" type="button">Kunde anlegen</button>
            <button class="prompt_btn prompt_btn-small" id="prompt_customerEdit" type="button">Kundenprofil bearbeiten</button>
            <button class="prompt_btn prompt_btn-small" id="prompt_customerArchive" type="button">Kunde archivieren</button>
            <button class="prompt_btn prompt_btn-small" id="prompt_customerDelete" type="button">Kunde endgültig löschen</button>
            <button class="prompt_btn prompt_btn-small" id="prompt_customerRefresh" type="button">Kunden neu laden</button>
          </div>
        </div>
        <div class="prompt_project-head">
          <div>
            <span class="prompt_result-kicker">Project Workspace</span>
            <strong id="pdir_workspaceDesc">Kunden, Projekte und Promptversionen verwalten.</strong>
            <p class="prompt_hint-note">Gespeichert pro WordPress-Benutzer; auf dessen Geräten verfügbar.</p>
          </div>
          <div class="prompt_project-preset-actions">
            <select id="prompt_projectWorkspace" aria-label="Project workspace">
              <option value="">No project selected</option>
            </select>
            <button class="prompt_btn prompt_btn-small" id="prompt_projectNew" type="button">Neues Projekt</button>
            <button class="prompt_btn prompt_btn-small" id="prompt_projectSave" type="button">Jetzt speichern</button>
            <button class="prompt_btn prompt_btn-small" id="prompt_projectDuplicate" type="button">Projekt duplizieren</button>
            <button class="prompt_btn prompt_btn-small" id="prompt_projectRename" type="button">Projekt umbenennen</button>
            <button class="prompt_btn prompt_btn-small" id="prompt_projectDelete"  type="button">Delete</button>
          </div>
        </div>
        <div class="pdir-shot-selector" id="pdir_shotSelector">
          <label for="production_shot">SHOT – eigenständige Bild- oder Videogenerierung</label>
          <div class="pdir-shot-selector-actions"><select id="production_shot"><option value="">Kein Shot</option></select> <button type="button" class="prompt_btn" id="production_add">Shot hinzufügen</button> <button type="button" class="prompt_btn" id="production_duplicate" disabled title="Ausgewählten Shot mit allen Einstellungen kopieren">Shot duplizieren</button> <button type="button" class="prompt_btn" id="production_remove">Shot entfernen</button></div>
          <div class="pdir-shot-title-row"><label for="shot_title">Shot-Titel</label><input id="shot_title" type="text" maxlength="120" autocomplete="off" placeholder="z. B. SH03 – Radfahrer in der Blauen Stunde" disabled></div>
          <p class="prompt_hint-note">Jeder Shot gehört zum ausgewählten Projekt. Den Shot-Titel hier bearbeiten; die Shot-Idee unter 02 – Prompt erstellen.</p>
        </div>
        <div class="prompt_autosave-bar" role="status" aria-live="polite"><span id="prompt_autosaveStatus" data-state="idle">Kein Projekt ausgewählt</span><span id="prompt_rulesStatus">Kundenregeln und Locks werden geladen …</span></div>
        <div class="prompt_project-grid">
          <div>
            <label class="prompt_project-label">Konstante Merkmale (Consistency Locks)</label>
            <div class="prompt_consistency-locks">
              <label><input type="checkbox" value="identity" data-consistency-lock> Identität</label>
              <label><input type="checkbox" value="wardrobe" data-consistency-lock> Kleidung</label>
              <label><input type="checkbox" value="product_design" data-consistency-lock> Produktdesign</label>
              <label><input type="checkbox" value="environment" data-consistency-lock> Umgebung</label>
              <label><input type="checkbox" value="color_palette" data-consistency-lock> Farbpalette</label>
              <label><input type="checkbox" value="lighting_style" data-consistency-lock> Lichtstil</label>
            </div>
          </div>
        </div>
        <details class="prompt_project-history prompt_history-accordion" id="prompt_historyAccordion"><summary>Prompt History <span>Verlauf ein-/ausklappen</span></summary><div class="prompt_history-content">
          <div class="prompt_project-history-head">
            <div><span class="prompt_result-kicker">PROMPT-HISTORIE</span><strong id="prompt_historyTitle">Kein Projekt ausgewählt</strong></div>
            <div class="prompt_project-preset-actions">
              <button class="prompt_btn prompt_btn-small" id="prompt_historyRefresh" type="button">Refresh</button>
              <button class="prompt_btn prompt_btn-small" id="prompt_historyClear" type="button">Clear history</button>
            </div>
          </div>
          <div class="pdir-history-scope"><label for="pdir_historyScope">Anzeigen</label><select id="pdir_historyScope"><option value="shot">Nur aktiver Shot</option><option value="project">Gesamtes Projekt</option></select></div>
          <div id="prompt_historyList" class="prompt_history-list"><div class="prompt_history-empty">Select or create a project to store prompt versions.</div></div>
        </div></details>
        <div class="pdir-workspace-reset" id="pdir_workspaceReset" aria-label="Testdaten bereinigen">
          <strong>TESTDATEN-VERWALTUNG</strong>
          <p class="prompt_hint-note">Sichert oder entfernt Kunden, Projekte, Shots, Promptversionen und Presets dieses WordPress-Benutzers. API-Key, Backend-Einstellungen und Daten anderer Plugins bleiben erhalten.</p>
          <div class="prompt_project-preset-actions">
            <button class="prompt_btn prompt_btn-small" id="pdir_workspaceExport" type="button">Daten sichern (JSON)</button>
            <button class="prompt_btn prompt_btn-danger" id="pdir_workspaceResetBtn" type="button">Alle Testdaten löschen</button>
          </div>
        </div>
        </div>
      </details>

      <details class="prompt_section-accordion prompt_studio-primary" id="prompt_ideaAccordion" open>
        <summary><span class="prompt_accordion-number">02</span><span class="pdir-idea-heading">Prompt erstellen<span id="pdir_activeShotHeading" class="pdir-active-shot-heading" hidden></span></span><span class="pdir-idea-note">Idee, Ausschlüsse und Modell</span></summary>
        <div class="prompt_section-accordion-body">


      <div class="prompt_mode-toggle" id="pdir_inputModeChoice">
        <button
          class="prompt_mode-btn active"
          id="prompt_modeLlm"
          type="button"
        >
          Free Idea
        </button>
        <button class="prompt_mode-btn" id="prompt_modeManual" type="button">
          Structured Fields
        </button>
      </div>

      <p class="prompt_hint-note" id="pdir_shotIdeaHint" hidden>Wähle in Section 01 einen Shot. Hier bearbeitest du seine konkrete Idee. Kunden- und Projektregeln findest du in Section 04.</p>
      <div id="pdir_shotEditor" class="pdir-shot-editor">
        <div class="pdir-shot-media-picker" aria-label="Medientyp des ausgewählten Shots">
          <div class="pdir-shot-media-picker-head"><strong>SHOT-TYP</strong><span>Pro Shot separat auswählbar</span></div>
          <div class="prompt_mode-toggle pdir-shot-media-buttons" role="group" aria-label="Shot-Typ wählen">
            <button type="button" class="prompt_mode-btn active" id="pdir_shotMediaImage" aria-pressed="true">IMAGE</button>
            <button type="button" class="prompt_mode-btn" id="pdir_shotMediaVideo" aria-pressed="false">VIDEO</button>
          </div>
          <p class="prompt_hint-note" id="pdir_shotModelHint" aria-live="polite">Das Zielmodell passt sich der Auswahl an.</p>
        </div>
        <label for="shot_idea">SHOT-IDEE / BESCHREIBUNG</label>
        <textarea id="shot_idea" maxlength="8000" rows="5" aria-describedby="pdir_shotIdeaHelp" placeholder="z. B. Ein Radfahrer fährt mit einem roten Rennrad eine kurvige Bergstraße hinauf. Neben ihm fliegt ein Vogel; hinter ihm rennt ein Löwe."></textarea>
        <p class="prompt_hint-note" id="pdir_shotIdeaHelp">Das zentrale Beschreibungsfeld: Was ist im Shot zu sehen oder was passiert? Die gemeinsame Projektszene und die Projektvorgaben werden berücksichtigt. Hier nicht dieselben Inhalte wie in SHOT DETAILS erneut eintragen.</p>
        <details class="prompt_details-panel" id="pdir_shotDetails">
          <summary>SHOT DETAILS <span class="pdir-shot-type" id="pdir_shotTypeText" aria-live="polite">IMAGE</span><span class="pdir-shot-optional">Alle Angaben optional</span></summary>
          <div class="prompt_production-accordion-body">
            <div class="prompt_production-grid" id="production_shotFields">
              <details class="pdir-shot-main-field pdir-shot-deviation" id="pdir_shotDeviation">
                <summary>ABWEICHUNG ZUR PROJEKTSZENE <span>(nur bei Bedarf)</span></summary>
                <label for="shot_change">Was soll in diesem Shot anders sein?</label>
                <textarea id="shot_change" maxlength="2000" rows="2" aria-describedby="pdir_shotChangeHelp" placeholder="z. B. In diesem Shot ist das sonst blaue Rennrad rot; der Hintergrund bleibt unverändert."></textarea>
                <p class="pdir-shot-field-help" id="pdir_shotChangeHelp">Nur ausfüllen, wenn dieser Shot bewusst von der gemeinsamen Projektszene abweicht. Die <strong>SHOT-IDEE</strong> bleibt die einzige Hauptbeschreibung. Ohne Abweichung leer lassen; Projektregeln und Consistency Locks weiterhin beachten.</p>
              </details>
              <label>KAMERA &amp; PERSPEKTIVE<textarea id="shot_camera" maxlength="2000" rows="2" placeholder="z. B. 35-mm-Objektiv, niedrige Kameraposition (Low Angle), leichte Neigung (Dutch Angle)."></textarea></label>
              <label>LICHT &amp; BELEUCHTUNG<textarea id="shot_lighting" maxlength="2000" rows="2" placeholder="z. B. Blaue Stunde, kühles Umgebungslicht, warmes Gegenlicht auf dem Radfahrer."></textarea></label>
              <label>BILDAUSSCHNITT &amp; KOMPOSITION<textarea id="shot_composition" maxlength="2000" rows="2" placeholder="z. B. Totale: Fahrer im rechten Bilddrittel, Bergstraße und Landschaft links sichtbar."></textarea></label>
              <label>LOOK &amp; ATMOSPHÄRE<textarea id="shot_look" maxlength="2000" rows="2" placeholder="z. B. cinematisch-realistisch, entsättigte Blau- und Grüntöne, feines Filmkorn."></textarea></label>
              <label class="pdir-shot-main-field">BESONDERE MERKMALE<textarea id="shot_features" maxlength="2000" rows="2" placeholder="z. B. Schriftzug „TEST BIKE“ gut lesbar am Rahmen; Staub auf Reifen; auffälliger Vogel."></textarea></label>
              <div class="pdir-video-only pdir-video-heading">VIDEO – BEWEGUNG &amp; ABLAUF <span>optional</span></div>
              <label class="pdir-video-only">AKTION &amp; BEWEGUNG<textarea id="shot_action" maxlength="2000" rows="2" placeholder="z. B. Der Radfahrer beschleunigt; ein Vogel hält neben ihm die Flughöhe."></textarea></label>
              <label class="pdir-video-only">KAMERABEWEGUNG<textarea id="shot_camera_motion" maxlength="2000" rows="2" placeholder="z. B. Seitlicher Tracking Shot auf gleicher Höhe, gleichmäßige Fahrt ohne Schnitt."></textarea></label>
              <label class="pdir-video-only">STARTZUSTAND<textarea id="shot_start" maxlength="2000" rows="2" placeholder="z. B. Zu Beginn fährt der Radfahrer links im Bild; der Vogel ist noch nicht sichtbar."></textarea></label>
              <label class="pdir-video-only">ENDZUSTAND<textarea id="shot_end" maxlength="2000" rows="2" placeholder="z. B. Am Ende fährt der Radfahrer aus dem Bild; der Vogel bleibt im Vordergrund."></textarea></label>
              <div class="pdir-video-only pdir-shot-main-field pdir-timing-editor">
                <label for="shot_duration">TIMING &amp; DAUER</label>
                <textarea id="shot_duration" maxlength="2000" rows="4" spellcheck="false" placeholder="0001 Aktion A und B über C.&#10;0002 Aktion C und Farbe.&#10;0003-0004 D kommt und frisst E."></textarea>
                <div class="pdir-timing-options" role="group" aria-label="Timing-Ausgabe">
                  <label class="pdir-timing-option" for="shot_timing_structured"><input type="checkbox" id="shot_timing_structured" /><span>Strukturierte Zeitangaben <small>MMSS → [MM:SS]</small></span></label>
                  <label class="pdir-timing-option" for="shot_timing_freeze"><input type="checkbox" id="shot_timing_freeze" /><span>Automatischer Freeze Frame <small>letzte Endzeit + 1 Sekunde</small></span></label>
                </div>
                <p class="pdir-timing-hint" id="pdir_timingHint" aria-live="polite">Kurzformat: 0001 Aktion oder 0003-0004 Aktion. Beide Optionen sind pro Shot speicherbar.</p>
                <pre class="pdir-timing-preview" id="pdir_timingPreview" hidden aria-label="Timing-Vorschau"></pre>
              </div>
            </div>
          </div>
        </details>
      </div>
      <!-- FREE IDEA MODE -->
      <div id="prompt_llmMode">
        <div class="prompt_lang-note">
          <strong>Multilingual input active.</strong> &nbsp;Write in German,
          Vietnamese, or mixed — the output is always in English, optimised for
          image and video models.
        </div>

        <div class="prompt_form-group" id="pdir_freeIdeaField">
          <label for="prompt_idea">Describe the image or video</label>
          <textarea
            id="prompt_idea"
            maxlength="4000"
            placeholder="z. B. Ein roter Sportwagen fährt nachts bei Regen durch Tokio; Neonreklamen spiegeln sich auf der nassen Straße."
          ></textarea>
        </div>
      </div>

      <!-- STRUCTURED FIELDS MODE (ACCORDION) -->
      <div id="prompt_manualMode" class="prompt_hidden">
        <div class="prompt_lang-note">
          <strong>Structured field mode.</strong> &nbsp;Click a group header to
          expand it. The number on the right shows how many fields inside are
          filled. Empty fields are ignored; multilingual input (DE / VN / mixed)
          works everywhere.
        </div>

        <div class="prompt_field-group" data-prompt-group="CHARACTER">
          <button
            class="prompt_field-group-head"
            type="button"
            aria-expanded="false"
            data-prompt-toggle-group
          >
            <span class="prompt_field-ind" aria-hidden="true">+</span>
            <span>Character</span>
            <span class="prompt_field-count" data-prompt-count></span>
          </button>
          <div class="prompt_field-tree prompt_hidden" data-prompt-tree>
            <div class="prompt_field-node">
              <label for="prompt_mf_character_subject">Subject</label>
              <textarea
                id="prompt_mf_character_subject"
                data-prompt-field="Subject"
                maxlength="1000"
                placeholder="e.g. a professional cyclist on a red racing bike"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_character_appearance">Appearance</label>
              <textarea
                id="prompt_mf_character_appearance"
                data-prompt-field="Appearance"
                maxlength="1000"
                placeholder="e.g. 30-year-old athletic rider, short dark hair, light stubble"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_character_wardrobe">Wardrobe</label>
              <textarea
                id="prompt_mf_character_wardrobe"
                data-prompt-field="Wardrobe"
                maxlength="1000"
                placeholder="e.g. black cycling jersey, red helmet, mirrored sunglasses"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_character_pose">Pose</label>
              <textarea
                id="prompt_mf_character_pose"
                data-prompt-field="Pose"
                maxlength="1000"
                placeholder="e.g. leaning forward, hands gripping the lower handlebars"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_character_expression">Expression</label>
              <textarea
                id="prompt_mf_character_expression"
                data-prompt-field="Expression"
                maxlength="1000"
                placeholder="e.g. focused expression, gaze directed down the road"
              ></textarea>
            </div>
          </div>
        </div>

        <div class="prompt_field-group" data-prompt-group="SCENE">
          <button
            class="prompt_field-group-head"
            type="button"
            aria-expanded="false"
            data-prompt-toggle-group
          >
            <span class="prompt_field-ind" aria-hidden="true">+</span>
            <span>Scene</span>
            <span class="prompt_field-count" data-prompt-count></span>
          </button>
          <div class="prompt_field-tree prompt_hidden" data-prompt-tree>
            <div class="prompt_field-node">
              <label for="prompt_mf_scene_environment">Environment</label>
              <textarea
                id="prompt_mf_scene_environment"
                data-prompt-field="Environment"
                maxlength="1000"
                placeholder="e.g. winding alpine road at dusk, damp tarmac, clear mountain air"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_scene_props">Props</label>
              <textarea
                id="prompt_mf_scene_props"
                data-prompt-field="Props"
                maxlength="1000"
                placeholder="e.g. red racing bicycle, white water bottle on the frame"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_scene_background">Background</label>
              <textarea
                id="prompt_mf_scene_background"
                data-prompt-field="Background"
                maxlength="1000"
                placeholder="e.g. rugged grey mountains, pine trees fading into the distance"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_scene_materials">Materials</label>
              <textarea
                id="prompt_mf_scene_materials"
                data-prompt-field="Materials"
                maxlength="1000"
                placeholder="e.g. wet reflective asphalt, matte carbon frame, textured jersey"
              ></textarea>
            </div>
          </div>
        </div>

        <div class="prompt_field-group" data-prompt-group="PHOTOGRAPHY">
          <button
            class="prompt_field-group-head"
            type="button"
            aria-expanded="false"
            data-prompt-toggle-group
          >
            <span class="prompt_field-ind" aria-hidden="true">+</span>
            <span>Photography</span>
            <span class="prompt_field-count" data-prompt-count></span>
          </button>
          <div class="prompt_field-tree prompt_hidden" data-prompt-tree>
            <div class="prompt_field-node">
              <label for="prompt_mf_photography_composition">Composition</label>
              <textarea
                id="prompt_mf_photography_composition"
                data-prompt-field="Composition"
                maxlength="1000"
                placeholder="e.g. wide shot, rider in right third, mountain road leading into frame"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_photography_cameraangle"
                >Camera Angle</label
              >
              <textarea
                id="prompt_mf_photography_cameraangle"
                data-prompt-field="Camera Angle"
                maxlength="1000"
                placeholder="e.g. low-angle view from the cyclist’s left, slight Dutch angle"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_photography_lens">Lens</label>
              <textarea
                id="prompt_mf_photography_lens"
                data-prompt-field="Lens"
                maxlength="1000"
                placeholder="e.g. 35 mm prime lens, natural perspective, minimal distortion"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_photography_dof">DOF</label>
              <textarea
                id="prompt_mf_photography_dof"
                data-prompt-field="DOF"
                maxlength="1000"
                placeholder="e.g. deep focus: rider and mountains both sharp"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_photography_lighting">Lighting</label>
              <textarea
                id="prompt_mf_photography_lighting"
                data-prompt-field="Lighting"
                maxlength="1000"
                placeholder="e.g. blue-hour ambient light with a warm rim light from behind"
              ></textarea>
            </div>
          </div>
        </div>

        <div class="prompt_field-group" data-prompt-group="ART DIRECTION">
          <button
            class="prompt_field-group-head"
            type="button"
            aria-expanded="false"
            data-prompt-toggle-group
          >
            <span class="prompt_field-ind" aria-hidden="true">+</span>
            <span>Art Direction</span>
            <span class="prompt_field-count" data-prompt-count></span>
          </button>
          <div class="prompt_field-tree prompt_hidden" data-prompt-tree>
            <div class="prompt_field-node">
              <label for="prompt_mf_art_colorpalette">Color Palette</label>
              <textarea
                id="prompt_mf_art_colorpalette"
                data-prompt-field="Color Palette"
                maxlength="1000"
                placeholder="e.g. muted slate blue, deep forest green, red as the accent"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_art_mood">Mood</label>
              <textarea
                id="prompt_mf_art_mood"
                data-prompt-field="Mood"
                maxlength="1000"
                placeholder="e.g. tense but adventurous, sense of speed and concentration"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_art_style">Style</label>
              <textarea
                id="prompt_mf_art_style"
                data-prompt-field="Style"
                maxlength="1000"
                placeholder="e.g. cinematic photorealism with subtle 35 mm film grain"
              ></textarea>
            </div>
            <div class="prompt_field-node">
              <label for="prompt_mf_art_quality">Quality</label>
              <textarea
                id="prompt_mf_art_quality"
                data-prompt-field="Quality"
                maxlength="1000"
                placeholder="e.g. sharp fabric and carbon-fiber textures, clean realistic details"
              ></textarea>
            </div>
          </div>
        </div>

        <div class="prompt_field-group" data-prompt-group="CONSTRAINTS">
          <button
            class="prompt_field-group-head"
            type="button"
            aria-expanded="false"
            data-prompt-toggle-group
          >
            <span class="prompt_field-ind" aria-hidden="true">+</span>
            <span>Constraints</span>
            <span class="prompt_field-count" data-prompt-count></span>
          </button>
          <div class="prompt_field-tree prompt_hidden" data-prompt-tree>
            <div class="prompt_field-node">
              <label for="prompt_mf_constraints_requirements"
                >Requirements</label
              >
              <textarea
                id="prompt_mf_constraints_requirements"
                data-prompt-field="Requirements"
                maxlength="2000"
                placeholder="e.g. exact text “TEST BIKE” visible on frame; one cyclist; no brand logos"
              ></textarea>
            </div>
          </div>
        </div>
      </div>


      <!-- NEGATIVE / EXCLUSIONS: visually paired with the positive prompt input -->
      <div class="prompt_negative-primary">
        <div class="prompt_form-group">
          <label for="prompt_negativeInput" id="prompt_negativeInputLabel">Exclusions / negative input</label>
          <textarea id="prompt_negativeInput" maxlength="2000" style="min-height:80px;" placeholder="z. B. Wasserzeichen, deformierte Hände, zusätzliche Räder, Comic-Look."></textarea>
          <div class="prompt_hint-note" id="prompt_negativeHint"></div>
        </div>
      </div>

<div class="prompt_creativity-row">
          <div>
            <label class="prompt_project-label">Kreativitätsmodus</label>
            <div class="prompt_mode-toggle prompt_project-mode">
              <button class="prompt_mode-btn" id="prompt_creativityStrict" type="button">Strict</button>
              <button class="prompt_mode-btn active" id="prompt_creativityBalanced" type="button">Balanced</button>
              <button class="prompt_mode-btn" id="prompt_creativityCreative" type="button">Creative</button>
            </div>
            <div class="prompt_hint-note">Strict = no invention · Balanced = sensible additions · Creative = stronger art direction.</div>
          </div>
</div>
      <div class="prompt_form-group" style="margin:12px 0 20px">
        <label for="prompt_generationEngine" class="prompt_project-label">Generierungs-Engine</label>
        <select id="prompt_generationEngine" style="max-width:440px;width:100%">
          <option value="direct">Direct Generation</option>
          <option value="standard">PromptDirector – bisherige Engine</option>
        </select>
        <div class="prompt_hint-note">Direct: kurze KI-Anweisungen und strukturierter Produktionskontext. Einstellungen gelten für neue Direct-Prompts.</div>
        <div style="display:flex;flex-wrap:wrap;gap:20px;margin-top:12px">
          <label><input id="prompt_directQualityCheck" type="checkbox" checked> KI-Qualitätscheck (zusätzliche OpenRouter-Aufrufe)</label>
          <label><input id="prompt_directExtended" type="checkbox"> Ausführlicher Prompt (höheres Tokenlimit)</label>
        </div>
        <div class="prompt_hint-note">Qualitätscheck: vergleicht Original und Ergebnis, korrigiert bestätigte Abweichungen und prüft erneut. Ausführlich: bis zu 4.000 Ausgabetokens statt 1.600; keine Garantie gegen Modell- oder Providerlimits.</div>
      </div>
      <!-- Optional supplementary AI instruction catalogue; original always available. -->
      <div class="prompt_form-group" style="margin:0 0 20px">
        <label for="prompt_enhancer" class="prompt_project-label">Prompt Enhancer</label>
        <select id="prompt_enhancer" style="max-width:440px;width:100%">
          <option value="">Original – ohne Enhancer (unverändert)</option>
          <?php foreach ( PDIR_Enhancers::choices() as $pdir_enhancer_choice ) : ?>
            <option value="<?php echo esc_attr($pdir_enhancer_choice['id']); ?>"><?php echo esc_html($pdir_enhancer_choice['name']); ?></option>
          <?php endforeach; ?>
        </select>
        <div class="prompt_hint-note">Optional: Nur die ausgewählte gespeicherte Zusatzanweisung wird an die KI übergeben. „Original“ bleibt die unveränderte Generierung. Enhancer werden im WordPress-Backend unter PromtDirector → Prompt Enhancer verwaltet.</div>
      </div>
      <!-- Optional post-generation text presets (no effect on AI generation instructions). -->
      <div class="prompt_form-group prompt_preset-panel">
        <div class="prompt_preset-heading">Prompt Presets <span>(nach der Generierung)</span></div>
        <div class="prompt_preset-subhead">Positiver Prompt</div>
        <label class="prompt_preset-check" for="prompt_preset_active">
          <input type="checkbox" id="prompt_preset_active"><span>Preset aktivieren</span>
        </label>
        <div class="prompt_preset-dependent" id="prompt_preset_dependent">
        <div class="prompt_preset-select-wrap">
          <label class="prompt_preset-caption" for="prompt_preset">Gespeichertes Preset</label>
          <select id="prompt_preset">
            <option value="">Kein Preset</option>
            <?php foreach ( PDIR_Presets::choices() as $pdir_preset_choice ) : ?>
              <?php if ($pdir_preset_choice['type'] !== 'positive') { continue; } ?>
              <option value="<?php echo esc_attr($pdir_preset_choice['id']); ?>" data-bytes="<?php echo esc_attr($pdir_preset_choice['bytes']); ?>"><?php echo esc_html($pdir_preset_choice['name']); ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <fieldset class="prompt_preset-position">
          <legend>Einfügen</legend>
          <div class="prompt_preset-position-options">
            <label for="prompt_preset_position_start"><input id="prompt_preset_position_start" type="radio" name="prompt_preset_position" value="start"><span>Am Anfang</span></label>
            <label for="prompt_preset_position_end"><input id="prompt_preset_position_end" type="radio" name="prompt_preset_position" value="end" checked><span>Am Ende</span></label>
          </div>
        </fieldset>
        <label class="prompt_preset-check prompt_preset-audit-toggle" for="prompt_preset_audit">
          <input type="checkbox" id="prompt_preset_audit" checked><span>KI-Konfliktprüfung für Preset aktivieren</span>
        </label>
        <p class="prompt_preset-status" id="prompt_preset_status" role="status" aria-live="polite"></p>
        </div>
        <div class="prompt_hint-note">Positives Preset: nach der Generierung wortgetreu eingefügt; bei Video vor dem abschließenden Timing-Block. Die Prüfung ändert keinen Text.</div>
        <div class="prompt_preset-subhead prompt_preset-subhead-negative">Negativer Prompt</div>
        <label class="prompt_preset-check" for="prompt_negative_preset_active">
          <input type="checkbox" id="prompt_negative_preset_active"><span>Negatives Preset aktivieren</span>
        </label>
        <div class="prompt_preset-dependent" id="prompt_negative_preset_dependent">
          <div class="prompt_preset-select-wrap">
            <label class="prompt_preset-caption" for="prompt_negative_preset">Gespeichertes negatives Preset</label>
            <select id="prompt_negative_preset">
              <option value="">Kein Preset</option>
              <?php foreach ( PDIR_Presets::choices() as $pdir_preset_choice ) : ?>
                <?php if ($pdir_preset_choice['type'] !== 'negative') { continue; } ?>
                <option value="<?php echo esc_attr($pdir_preset_choice['id']); ?>" data-bytes="<?php echo esc_attr($pdir_preset_choice['bytes']); ?>"><?php echo esc_html($pdir_preset_choice['name']); ?></option>
              <?php endforeach; ?>
            </select>
          </div>
          <fieldset class="prompt_preset-position">
            <legend>Einfügen</legend>
            <div class="prompt_preset-position-options">
              <label for="prompt_negative_preset_position_start"><input id="prompt_negative_preset_position_start" type="radio" name="prompt_negative_preset_position" value="start"><span>Am Anfang</span></label>
              <label for="prompt_negative_preset_position_end"><input id="prompt_negative_preset_position_end" type="radio" name="prompt_negative_preset_position" value="end" checked><span>Am Ende</span></label>
            </div>
          </fieldset>
          <label class="prompt_preset-check prompt_preset-audit-toggle" for="prompt_negative_preset_audit">
            <input type="checkbox" id="prompt_negative_preset_audit"><span>KI-Konfliktprüfung für negatives Preset aktivieren</span>
          </label>
          <p class="prompt_preset-status" id="prompt_negative_preset_status" role="status" aria-live="polite"></p>
        </div>
        <div class="prompt_hint-note">Negatives Preset: wird ausschließlich dem separaten Negative Prompt hinzugefügt. Die optionale KI-Prüfung vergleicht ihn auch mit dem positiven Prompt. Modelle ohne separates Negativfeld müssen den Negative Prompt gegebenenfalls extern verarbeiten. Verwaltung: PromtDirector → Prompt Presets.</div>
      </div>
      <!-- MODEL -->
      <details class="prompt_section-accordion prompt_model-accordion" id="prompt_modelAccordion">
        <summary>Modell &amp; technische Optionen <span>Zielmodell, Workflow und Einstellungen</span></summary>
        <div class="prompt_section-accordion-body">
      <div class="prompt_sec-head prompt_primary-head prompt_hidden">
        <span class="prompt_sec-num">02</span>
        <span class="prompt_sec-title">Model</span>
        <span class="prompt_sec-note">Choose the destination</span>
      </div>
      <div class="prompt_form-group prompt_model-picker">
        <label for="prompt_targetModel">Target AI model</label>
        <select id="prompt_targetModel">
          <?php
          $pdir_profiles = PDIR_Model_Registry::all_public();
          foreach ( array( 'image' => 'IMAGE MODELS', 'video' => 'VIDEO MODELS' ) as $pdir_type => $pdir_group_label ) :
          ?>
            <optgroup label="<?php echo esc_attr( $pdir_group_label ); ?>">
              <?php foreach ( $pdir_profiles as $pdir_profile ) : ?>
                <?php if ( $pdir_profile['type'] !== $pdir_type ) { continue; } ?>
                <option value="<?php echo esc_attr( $pdir_profile['key'] ); ?>">
                  <?php echo esc_html( $pdir_profile['label'] ); ?>
                </option>
              <?php endforeach; ?>
            </optgroup>
          <?php endforeach; ?>
        </select>
        <div id="prompt_profileInfo" class="prompt_hint-note" style="margin-top:10px"></div>
      </div>

            <!-- ADVANCED CONTROLS -->
      <?php if (defined('PDIR_AI_REQUEST_STATS_ENABLED') && PDIR_AI_REQUEST_STATS_ENABLED) : ?>
      <label class="pdir-ai-stats-choice" for="pdir_aiRequestStatsToggle"><input type="checkbox" id="pdir_aiRequestStatsToggle" checked /><span>KI-Anfragen nach der Generierung anzeigen <small>Diagnose · jederzeit ausblendbar</small></span></label>
      <?php endif; ?>
      <details class="prompt_details-panel" id="prompt_advancedControls">
        <summary>Technische Modelloptionen <span>Optional · nur bei Bedarf</span></summary>
        <div class="prompt_details-body">
          <div id="prompt_advancedModelOptionsWrap" class="prompt_model-options prompt_hidden">
            <div class="prompt_model-options-head">
              <strong>Erweiterte Modellparameter</strong>
              <span>Nur modellabhängige technische Parameter</span>
            </div>
            <div id="prompt_advancedModelOptions" class="prompt_model-options-grid"></div>
          </div>
          <div id="prompt_dropdownSections" class="pdir-free-only-controls">
            <div class="prompt_mini-head">Camera</div>
            <div class="prompt_tech-grid">
              <div class="prompt_form-group" style="margin-bottom:0;">
                <label for="prompt_distance">Distance</label>
                <select id="prompt_distance">
                  <option value="">No specification</option>
                  <option value="extreme close-up shot, macro detail, intimate framing">Extreme close-up (macro)</option>
                  <option value="close-up shot, tight framing, detailed focus">Close-up (face/object)</option>
                  <option value="medium close-up shot, chest framing">Medium close-up (chest)</option>
                  <option value="medium shot, waist framing, natural perspective">Medium shot (half body)</option>
                  <option value="full shot, complete subject, full body view">Full shot (full body/object)</option>
                  <option value="wide shot, subject with environment, contextual framing">Wide shot (with environment)</option>
                  <option value="extreme wide shot, panoramic view, expansive landscape">Extreme wide shot (panorama)</option>
                </select>
              </div>
              <div class="prompt_form-group" style="margin-bottom:0;">
                <label for="prompt_angle">Angle</label>
                <select id="prompt_angle">
                  <option value="">No specification</option>
                  <option value="eye level view, neutral perspective, natural viewpoint">Eye level</option>
                  <option value="low angle shot, looking up, powerful perspective">Low angle</option>
                  <option value="high angle shot, looking down, diminished perspective">High angle</option>
                  <option value="bird's eye view, directly from above, top-down perspective">Bird's eye view</option>
                  <option value="worm's eye view, extreme low angle, dramatic upward view">Worm's eye view</option>
                  <option value="dutch angle, tilted frame, dynamic composition">Dutch angle</option>
                </select>
              </div>
            </div>

            <div class="prompt_mini-head">Style & light</div>
            <div class="prompt_tech-grid">
              <div class="prompt_form-group" style="margin-bottom:0;">
                <label for="prompt_style">Style</label>
                <select id="prompt_style">
                  <option value="">No specific style</option>
                  <option value="hyperrealistic">Hyperrealistic</option>
                  <option value="photorealistic">Photorealistic</option>
                  <option value="editorial">Editorial fashion</option>
                  <option value="product">Product photography</option>
                  <option value="cinematic">Cinematic</option>
                  <option value="dark_moody">Dark & moody</option>
                  <option value="bright_air">Bright & airy</option>
                  <option value="vintage">Vintage / retro</option>
                  <option value="cyberpunk">Cyberpunk</option>
                  <option value="fantasy">Dark fantasy</option>
                  <option value="anime">Anime</option>
                </select>
              </div>
              <div class="prompt_form-group" style="margin-bottom:0;">
                <label for="prompt_lighting">Lighting preset</label>
                <select id="prompt_lighting">
                  <option value="">No specific lighting</option>
                  <optgroup label="Natural light">
                    <option value="golden hour dramatic low sun">Golden hour</option>
                    <option value="blue hour deep cinematic">Blue hour</option>
                    <option value="moonlit night full moon clear">Moonlight</option>
                    <option value="heavy overcast flat soft">Heavy overcast</option>
                  </optgroup>
                  <optgroup label="Studio light">
                    <option value="studio low key dramatic">Studio low key</option>
                    <option value="studio high key catalogue">Studio high key</option>
                    <option value="studio rim light hero">Studio rim light</option>
                    <option value="studio striplight automotive">Studio strip-light</option>
                    <option value="studio cinematic mixed accents">Studio cinematic mixed</option>
                  </optgroup>
                </select>
              </div>
            </div>
          </div>

          <div class="prompt_checkbox-group" id="prompt_clipOnlyWrap" style="margin-bottom:0;">
            <input type="checkbox" id="prompt_clipOnly" />
            <label for="prompt_clipOnly">ComfyUI CLIP-only workflow (Flux / SD3.5)</label>
          </div>
        </div>
      </details>

      <div id="prompt_modelOptionsWrap" class="prompt_model-options prompt_hidden">
        <div class="prompt_model-options-head">
          <strong id="prompt_modelOptionsTitle">Relevant model options</strong>
          <span id="prompt_modelCapabilityNote"></span>
        </div>
        <div id="prompt_modelOptions" class="prompt_model-options-grid"></div>
      </div>

        </div>
      </details>
      <!-- v1.6.15: Strength Control inside prompt creation; optional and collapsed -->
      <details class="prompt_details-panel prompt_strength-panel" id="prompt_strengthPanel">
        <summary>Advanced – Strength Control <span>Einfluss der Eingabebereiche</span></summary>
        <div class="prompt_details-body">
          <p class="prompt_strength-note">Der Kreativitätsmodus (Strict / Balanced / Creative) bestimmt den Spielraum. Strength priorisiert nur frei gestaltbare Aspekte innerhalb dieses Rahmens. Feste Angaben, Referenzzuordnungen, Ausschlüsse und Consistency Locks bleiben geschützt. Prozentwerte sind Steuerungsrichtlinien, keine mathematischen Garantien.</p>
          <div class="prompt_strength-grid">
            <label class="prompt_strength-control"><span class="prompt_strength-header"><span>Free Idea</span><output id="prompt_strength_ideaValue">90%</output></span><input id="prompt_strength_idea" data-strength="idea" type="range" min="0" max="100" step="5" value="90"></label>
            <label class="prompt_strength-control"><span class="prompt_strength-header"><span>Kundenstil / Briefing</span><output id="prompt_strength_customerValue">70%</output></span><input id="prompt_strength_customer" data-strength="customer" type="range" min="0" max="100" step="5" value="70"></label>
            <label class="prompt_strength-control"><span class="prompt_strength-header"><span>Projektauftrag</span><output id="prompt_strength_projectValue">85%</output></span><input id="prompt_strength_project" data-strength="project" type="range" min="0" max="100" step="5" value="85"></label>
            <label class="prompt_strength-control"><span class="prompt_strength-header"><span>Referenzen</span><output id="prompt_strength_referencesValue">70%</output></span><input id="prompt_strength_references" data-strength="references" type="range" min="0" max="100" step="5" value="70"></label>
            <label class="prompt_strength-control"><span class="prompt_strength-header"><span>Kreative Ergänzungen</span><output id="prompt_strength_creativeValue">50%</output></span><input id="prompt_strength_creative" data-strength="creative" type="range" min="0" max="100" step="5" value="50"></label>
          </div>
          <button type="button" class="prompt_btn" id="prompt_strengthReset">Standardwerte wiederherstellen</button>
        </div>
      </details>
      <details class="prompt_details-panel prompt_reference-format-panel" id="prompt_referenceFormatPanel">
        <summary>Advanced – Referenzdarstellung <span>Ausgabeformat im Final Prompt</span></summary>
        <div class="prompt_details-body">
          <div class="prompt_form-group prompt_reference-format-control">
            <label for="prompt_referenceFormat">Referenzdarstellung im Final Prompt</label>
            <select id="prompt_referenceFormat">
              <option value="default">Backend-Standard verwenden</option>
              <option value="combined">Kombiniert – im Fließtext + Mapping</option>
              <option value="inline">Nur im Fließtext</option>
              <option value="mapping">Nur Mapping am Ende</option>
            </select>
            <p class="prompt_reference-format-note" id="prompt_referenceFormatDefaultNote"></p>
            <p class="prompt_reference-format-note">Eine Referenz wird nur dann direkt an ein Motiv gebunden, wenn die Zuordnung aus deinen Angaben eindeutig ist.</p>
          </div>
          <div class="prompt_form-group prompt_reference-format-control">
            <label for="prompt_referenceDescriptionMode">Verarbeitung von „What is shown“</label>
            <select id="prompt_referenceDescriptionMode">
              <option value="default">Backend-Standard verwenden</option>
              <option value="reference">Referenzgeführt – Beschreibung als Zuordnungskontext</option>
              <option value="description">Beschreibungsgeführt – Merkmale in den Prompt übernehmen</option>
            </select>
            <p class="prompt_reference-format-note" id="prompt_referenceDescriptionDefaultNote"></p>
          </div>
        </div>
      </details>
        </div>
      </details>
      <details class="prompt_section-accordion prompt_reference-accordion" id="prompt_referenceAccordion">
        <summary><span class="prompt_accordion-number">03</span> Referenzen <span>Vorlagen und Verwendungszweck</span></summary>
        <div class="prompt_section-accordion-body">
      <!-- REFERENCE GUIDANCE: no uploads; semantic image/video/frame guidance for later target-model use -->
      <section id="prompt_referenceGuidance" class="prompt_reference-guidance prompt_hidden">
        <div class="prompt_model-options-head">
          <div>
            <strong>Referenzen: Inhalt und Verwendungszweck</strong>
            <span class="prompt_reference-sub">Beschreibe den Inhalt jeder Vorlage und wofür sie verwendet werden soll.</span>
          </div>
          <span id="prompt_referenceLimit"></span>
        </div>
        <div class="prompt_reference-note">Die Prompt-KI liest keine Mediendateien. Beschreibe Inhalt und Zweck. Unterstützte Dateien stellst du anschließend im gewählten Zieltool bereit. Andere Referenztypen werden als beschriebene Vorlagen in Textanweisungen umgesetzt. Rolle, Beschreibung und Verwendungszweck gelten gemeinsam. Ein ausdrücklicher Kamera- oder Lichtzweck wird auch bei der Rolle Inhalt berücksichtigt. Die Referenzen erhalten eigene Übernahme- und Erhaltungsanweisungen im Prompt. Allgemeine Stilvorgaben dürfen geschützte Identität, Kleidung, Objektgestaltung oder Umgebung nicht verändern. Ausdrückliche Änderungen an diesen Eigenschaften bleiben möglich. Exakte visuelle Übereinstimmung hängt vom Zielmodell ab. Eine unbeschriebene Kamerabewegung wird der nativen Videovorlage überlassen; Schwenk, Zoom oder Geschwindigkeit werden nicht erfunden.</div>
        <div id="prompt_referenceSupport" class="prompt_reference-support" aria-live="polite"></div>
        <div id="prompt_referenceList" class="prompt_reference-list"></div>
        <button class="prompt_btn prompt_btn-small" id="prompt_addReference" type="button">+ Add reference</button>
      </section>



        </div>
      </details>
      <details class="prompt_production prompt_section-accordion" id="prompt_production">
        <summary><span class="prompt_accordion-number">04</span> Kunden- &amp; Projektbriefing <span>Verbindliche Vorgaben · getrennt bearbeitbar</span></summary>
        <div class="prompt_section-accordion-body">
        <p>Kundenvorgaben werden versioniert. Projektangaben gelten nur für das ausgewählte Projekt. Die Shot-Idee befindet sich in Section 02.</p>
    <details class="prompt_details-panel prompt_production-accordion" id="pdir_customerBriefingPanel" open>
      <summary>01 – KUNDENORIENTIERTE ANGABEN</summary>
      <div class="prompt_production-accordion-body">
        <p class="prompt_hint-note">Diese Vorgaben gelten für neue Projekte des Kunden. Bestehende Projekte behalten den bestätigten Kundenstand, bis du eine Aktualisierung ausdrücklich übernimmst.</p>
        <div id="pdir_customerBriefingEditor" hidden>
          <p class="pdir-brief-version" id="pdir_customerBriefVersion" aria-live="polite"></p>
          <div class="prompt_production-grid">
            <label>Kundenname<input type="text" id="pdir_brief_name" maxlength="120" placeholder="z. B. Musterkunde GmbH"></label>
            <label>Marke<input type="text" id="pdir_brief_brand" maxlength="200" placeholder="z. B. VeloMotion – Premium-Rennräder"></label>
            <label class="pdir-span-all">Marken- und Gestaltungsregeln<textarea id="pdir_brief_rules" maxlength="4000" rows="4" placeholder="z. B. Hochwertige, glaubwürdige Produktfotografie. Markenfarbe Dunkelrot (#8C1622). Keine übertriebenen Effekte."></textarea></label>
            <label class="pdir-span-all">Unveränderliche Merkmale<textarea id="pdir_brief_features" maxlength="2000" rows="3" placeholder="z. B. Originales Rahmendesign, Markenlogo und Produktproportionen müssen in jedem Motiv gleich bleiben."></textarea></label>
            <label class="pdir-span-all">Grundsätzliche Ausschlüsse<textarea id="pdir_brief_exclusions" maxlength="2000" rows="3" placeholder="z. B. Keine Logos anderer Hersteller, keine Comic-Ästhetik, keine erfundenen Produktdetails."></textarea></label>
          </div>
          <button type="button" class="prompt_btn" id="pdir_customerBriefSave">Kundenbriefing als neue Version speichern</button>
        </div>
        <p class="prompt_hint-note" id="prompt_customerSnapshotInfo">Bitte zuerst in Section 01 einen Kunden und ein Projekt auswählen.</p>
        <p class="pdir-brief-version" id="pdir_projectBriefVersion" aria-live="polite"></p>
        <button type="button" class="prompt_btn" id="prompt_customerApply" hidden>Kundenänderungen vergleichen und für dieses Projekt übernehmen</button>
        <div id="pdir_legacyCustomerAssignment">
          <label for="prompt_projectCustomer">Kundenzuordnung dieses Projekts (Bestandsprojekte)</label>
          <select id="prompt_projectCustomer"><option value="">Ohne Kundenzuordnung</option></select>
          <label for="prompt_projectDirection">Übernommene Kundenvorgaben (Bestandsprojekt)</label>
          <textarea id="prompt_projectDirection" maxlength="4000" placeholder="z. B. Übernommene Markenregeln: rotes Rennrad, dunkle Farbpalette, realistischer Bildstil."></textarea>
          <label id="pdir_legacyExceptionsLabel" for="prompt_customerExceptions">Ausnahmen für dieses Projekt (Bestandsprojekte)</label>
          <textarea id="prompt_customerExceptions" maxlength="2000" rows="3" placeholder="z. B. Für diese Kampagne statt weißem Studiohintergrund alpine Bergkulisse verwenden."></textarea>
        </div>
      </div>
    </details>
    <details class="prompt_details-panel prompt_production-accordion" id="pdir_projectBriefingPanel" open>
      <summary>02 – PROJEKTORIENTIERTE ANGABEN</summary>
      <div class="prompt_production-accordion-body">
<div id="pdir_projectPriority" class="pdir-priority-panel">
<label for="pdir_projectRules">Eigene Projektvorgaben (zusätzlich zu den Kundenregeln)</label>
<textarea id="pdir_projectRules" maxlength="4000" rows="4" placeholder="z. B. Kampagne „Mountain Ride“: Alle Shots auf derselben alpinen Straße; identischer Radfahrer und identisches Rennrad."></textarea>
<label class="pdir-inline-check"><input id="pdir_priorityOverride" type="checkbox"> Projektvorgaben bei direktem Widerspruch gegenüber Kundenregeln priorisieren</label>
<p class="prompt_hint-note">Standard: Kunde hat Vorrang. Mit Schalter EIN dürfen nur ausdrücklich widersprechende Projektvorgaben die jeweils betroffene Kundenregel ersetzen; andere Kundenregeln bleiben gültig.</p>
</div>
<h3 class="prompt_production-subtitle">Auftrag dieses Projekts</h3>
<div class="prompt_production-grid"><label>Marke / Produkt<textarea id="production_brand" maxlength="2000" rows="3" placeholder="z. B. VeloMotion – Carbon-Rennrad Modell R7."></textarea></label><label>Zielgruppe<textarea id="production_audience" maxlength="2000" rows="3" placeholder="z. B. Ambitionierte Rennradfahrer zwischen 25 und 45 Jahren in Europa."></textarea></label><label>Kernbotschaft<textarea id="production_message" maxlength="2000" rows="3" placeholder="z. B. Das Rennrad vereint Präzision, Geschwindigkeit und Fahrgefühl."></textarea></label><label>Gewünschte Wirkung<textarea id="production_effect" maxlength="2000" rows="3" placeholder="z. B. Hochwertig, dynamisch und glaubwürdig; Lust auf eine Probefahrt erzeugen."></textarea></label><label>Pflichtdetails<textarea id="production_mandatory" maxlength="2000" rows="3" placeholder="z. B. Original-Rahmengeometrie, Schriftzug „TEST BIKE“ und rote Rahmenfarbe erhalten."></textarea></label><label>Ausschlüsse<textarea id="production_exclusions" maxlength="2000" rows="3" placeholder="z. B. Keine fremden Marken, keine Fantasielogos, keine sichtbaren Bildartefakte."></textarea></label></div><label>Gemeinsame Serienregeln<textarea id="production_series" maxlength="4000" rows="3" placeholder="z. B. In allen Shots dieselbe Bergstraße, derselbe Fahrer und die gleiche Farbdramaturgie."></textarea></label>

      </div>
    </details>

        </div>
      </details>
      <details class="prompt_section-accordion prompt_revision-module" id="prompt_revisionModule">
        <summary><span class="prompt_accordion-number">05</span> Gezielte Überarbeitung <span>Bestehende Promptversion ändern</span></summary>
        <div class="prompt_section-accordion-body prompt_revision-content">
<select id="production_revision"><option value="">Neue Generierung</option></select><label for="pdir_revisionTarget">Bereich der Überarbeitung<select id="pdir_revisionTarget"><option value="positive">Nur Positive Prompt</option><option value="negative">Nur Negative Prompt</option><option value="both">Positive und Negative Prompt</option></select></label><div id="production_revisionPreviewWrap" class="prompt_revision-preview" hidden><label>Ausgewählter Prompt · Nur lesen<textarea id="production_revisionPreview" rows="6" readonly></textarea></label></div><label>Änderungswunsch<textarea id="production_change" maxlength="2000" rows="3" placeholder="z. B. Ändere ausschließlich die Fahrradfarbe von Blau zu Rot; Kamera und Landschaft beibehalten."></textarea></label>
<label class="pdir-inline-check pdir-revision-override"><input type="checkbox" id="pdir_revisionOverride"> Verbindliche Vorgaben für diese Überarbeitung gezielt überschreiben</label>
<p class="prompt_hint-note">Standard AUS: Pflichtangaben bleiben geschützt. EIN: Nur ausdrücklich benannte Vorgaben dürfen in der neuen Promptversion geändert werden. Originalversion und Kunden-/Projekteinstellungen bleiben unverändert.</p><p>Ausgangsversion wählen, Änderungswunsch eingeben und „Generate“ nutzen. Modell und Ausgangseinstellungen werden geladen.</p>
    <div id="pdir_revisionDiffWrap" class="pdir-revision-diff" hidden>
      <button type="button" id="pdir_revisionDiffToggle" class="pdir-revision-diff-toggle" aria-expanded="true" aria-controls="production_diff"><span>ÄNDERUNGEN ZUR AUSGANGSVERSION</span><span id="pdir_revisionDiffVersions"></span><span id="pdir_revisionDiffCaret">−</span></button>
      <div class="pdir-revision-diff-legend"><span class="pdir-diff-old">− Entfernt</span><span class="pdir-diff-new">+ Hinzugefügt</span><span>Unverändert</span></div>
      <div id="production_diff"></div>
    </div><div id="production_revisionQuality" role="status"></div>
    <div class="prompt_actions"><button class="prompt_btn prompt_btn-primary" id="prompt_generateRevisionBtn" type="button"><span class="prompt_spinner" id="prompt_revisionSpinner" aria-hidden="true"></span><span id="prompt_revisionBtnText">Generate prompt →</span></button></div>
    <p id="prompt_generationStatus" class="prompt_generation-status prompt_hidden" role="status">Generierung läuft – bitte warten.</p>
    <?php if (defined('PDIR_AI_REQUEST_STATS_ENABLED') && PDIR_AI_REQUEST_STATS_ENABLED) : ?>
    <div id="pdir_aiRequestStatsRevision" class="pdir-ai-request-stats prompt_hidden" role="status" aria-live="polite"></div>
    <?php endif; ?>

        </div>
      </details>
      <details class="prompt_section-accordion prompt_check-module" id="prompt_checkAccordion">
        <summary><span class="prompt_accordion-number">06</span> Eingabeprüfung <span id="production_checkAccordionStatus" class="prompt_check-state" role="status" aria-live="polite">Prüfung ausstehend</span></summary>
        <div class="prompt_section-accordion-body">
      <div class="prompt_check-content">
<details id="production_conflictAdvanced" class="prompt_details-panel"><summary>Erweiterte Einstellungen – Konflikte</summary><div class="prompt_production-accordion-body"><label>Referenzkonflikte <select id="production_conflictReference"><option value="default">Backend-Standard verwenden</option><option value="block">Generierung blockieren</option><option value="warn">Nur warnen</option></select></label><label>Projektkonflikte <select id="production_conflictProject"><option value="default">Backend-Standard verwenden</option><option value="block">Generierung blockieren</option><option value="warn">Nur warnen</option></select></label><p id="production_conflictDefaults" class="prompt_hint-note"></p></div></details>
<button id="production_check" class="prompt_btn" type="button">Eingaben prüfen</button> <button id="production_semanticCheck" class="prompt_btn" type="button" hidden>KI-Konfliktprüfung starten</button><p id="production_semanticNote" class="prompt_hint-note" hidden>Projekt- oder Kundendaten geändert: Die optionale KI-Konfliktprüfung kann erneut ausgeführt werden.</p><p id="production_checkStatus" role="status" class="prompt_hint-note"></p><div id="production_quality" role="status"></div><label><input id="production_qualityAck" type="checkbox"> Hinweise geprüft; mit diesen Eingaben generieren</label>
      </div>
        </div>
      </details>
      <dialog id="prompt_historyModal" class="prompt_history-modal" aria-labelledby="prompt_historyModalTitle"><h3 id="prompt_historyModalTitle">PROMPT PREVIEW</h3><textarea id="prompt_historyModalText" rows="13" readonly aria-label="Prompttext"></textarea><div class="prompt_history-modal-actions"><button type="button" class="prompt_btn" id="prompt_historyModalClose">CLOSE</button><button type="button" class="prompt_btn prompt_btn-primary" id="prompt_historyModalCopy">COPY</button></div></dialog>
      <div class="prompt_actions prompt_main-actions">
        <button class="prompt_btn prompt_btn-primary" id="prompt_generateBtn" type="button">
          <span class="prompt_spinner" id="prompt_spinner"></span>
          <span id="prompt_btnText">Generate prompt →</span>
        </button>
        <button class="prompt_btn" id="prompt_lockAgainBtn" type="button">Lock</button>
      </div>
      <p id="prompt_generationStatusMain" class="prompt_generation-status prompt_hidden" role="status">Generierung läuft – bitte warten.</p>
      <?php if (defined('PDIR_AI_REQUEST_STATS_ENABLED') && PDIR_AI_REQUEST_STATS_ENABLED) : ?>
      <div id="pdir_aiRequestStats" class="pdir-ai-request-stats prompt_hidden" role="status" aria-live="polite"></div>
      <?php endif; ?>

      <!-- RESULTS -->
      <div id="prompt_resultArea" class="prompt_hidden">
        <div class="prompt_sec-head prompt_primary-head">
          <span class="prompt_sec-num">RESULT</span>
          <span class="prompt_sec-title">Prompt</span>
          <span class="prompt_sec-note">Breakdown + final copy</span>
        </div>

        <div class="prompt_result-meta" id="prompt_resultMeta"></div>
        <div class="prompt_license-notice prompt_hidden" id="prompt_licenseNotice"></div>

        <section class="prompt_final-section">
          <div class="prompt_output-label">
            <div>
              <span class="prompt_result-kicker">Final prompt</span>
              <label for="prompt_output" id="prompt_outputLabel">Ready to paste into the selected model</label>
            </div>
            <div class="prompt_output-actions">
              <button class="prompt_copy-btn prompt_copy-primary" type="button" data-copy-target="prompt_output">Copy prompt</button>
            </div>
          </div>
          <textarea id="prompt_output" class="prompt_output-field prompt_final-prompt" readonly></textarea>
          <label class="pdir-inline-check"><input type="checkbox" id="pdir_negativeInline"> Negative Prompt im Hauptfenster integrieren</label>
        </section>
        <!-- Visible directly under the completed prompt, independently of Details & Workspace. -->
        <details class="prompt_details-panel prompt_qa-panel" id="prompt_qualityReport" open>
          <summary><span class="pdir-qa-summary-label">KI-PRÜFBERICHT</span><span id="prompt_qualityStatus">Nicht geprüft</span></summary>
          <div class="prompt_details-body" id="prompt_qualityReportBody" aria-live="polite"><p>Der Bericht erscheint nach der Generierung.</p></div>
        </details>

        <div class="prompt_form-group prompt_negative-result prompt_hidden" id="prompt_negativeResultWrap">
          <div class="prompt_output-label">
            <label for="prompt_negativeOutput" id="prompt_negativeOutputLabel">Negative / external field</label>
            <div class="prompt_output-actions">
              <button class="prompt_copy-btn" type="button" data-copy-target="prompt_negativeOutput">Copy</button>
            </div>
          </div>
          <textarea id="prompt_negativeOutput" class="prompt_output-field" readonly style="min-height:80px;"></textarea>
        </div>

        <section class="prompt_breakdown-section">
          <div class="prompt_result-heading">
            <div>
              <span class="prompt_result-kicker">Prompt breakdown</span>
              <h3>See the building blocks at a glance.</h3>
            </div>
          </div>
          <div class="prompt_breakdown-grid" id="prompt_breakdownGrid"></div>
          <div class="prompt_adjustment-note prompt_hidden" id="prompt_adjustmentNote"></div>
        </section>

        <details class="prompt_details-panel prompt_result-details">
          <summary>Details & workspace <span>request summary, editable prompt</span></summary>
          <div class="prompt_details-body">
            <div class="prompt_original-prompt-box">
              <div class="prompt_output-label">
                <label for="prompt_originalPrompt">Request summary</label>
                <div class="prompt_output-actions"><button class="prompt_copy-btn" type="button" data-copy-target="prompt_originalPrompt">Copy</button></div>
              </div>
              <textarea id="prompt_originalPrompt" class="prompt_output-field" readonly></textarea>
              <p class="prompt_request-debug-note">Online: tatsächlicher OpenRouter-Request-Body der letzten erfolgreichen Generierung, ohne API-Key und HTTP-Header. Offline: lokale Eingabezusammenfassung. Nicht dauerhaft gespeichert.</p>
            </div>

            <div class="prompt_form-group prompt_experiment-box" style="margin-bottom:0;">
              <div class="prompt_output-label">
                <label for="prompt_experimentOutput">Editable workspace</label>
                <div class="prompt_output-actions">
                  <button class="prompt_copy-btn" type="button" id="prompt_experimentClear">Clear</button>
                  <button class="prompt_copy-btn" type="button" data-copy-target="prompt_experimentOutput">Copy</button>
                </div>
              </div>
              <textarea id="prompt_experimentOutput" class="prompt_output-field" placeholder="z. B. Formuliere den Prompt präziser: stärkere Tiefenstaffelung und weicheres Abendlicht."></textarea>
            </div>
          </div>
        </details>
      </div>

      <div class="prompt_quote-block">
        "Prompts are not about words. They are about intention."
        <span class="prompt_attr">AI Lab — PromtDirector</span>
      </div>
      </div><!-- /pdir_flowEditor -->
    </div>



    <footer class="prompt_footer">
      <span>PromtDirector — AI Creative Production</span>
      <span>Input DE/VN — Output EN · API server-side</span>
      <span>© 2026</span>
    </footer>
  </div>

  <div class="prompt_toast" id="prompt_toast">Copied</div>
</div>