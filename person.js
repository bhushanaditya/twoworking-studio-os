window.authReady.then(function () {
    // Which person this page is showing comes from the link that opened it,
    // e.g. person.html?person=nabh — set by the Home screen's person cards.
    // No real routing/login yet (that's Stage 3) — this just reads the URL.
    const urlParams = new URLSearchParams(window.location.search);
    const currentPerson = (urlParams.get('person') || 'nabh').toUpperCase();
    document.getElementById('personNameLabel').textContent = currentPerson;
    document.title = 'Studio OS — ' + currentPerson + ' (preview)';

    // Tapping LOG TODAY swaps the button for the type/mic input, in the
    // same spot — per your confirmation that these are two states of one
    // control, not two separate screens.
    const logBar = document.querySelector('.log-bar');
    const logTodayBtn = document.getElementById('logTodayBtn');
    const logInputRow = document.getElementById('logInputRow');
    const typeFieldInput = logInputRow.querySelector('.type-field-input');
    const logStatusText = document.getElementById('logStatusText');
    const logEntryRows = document.getElementById('logEntryRows');

    // Grows the text box as you type or as voice text is inserted, instead
    // of scrolling inside a fixed-height box — makes longer entries easy
    // to read back before you save them.
    function autoGrowTypeField() {
      typeFieldInput.style.height = 'auto';
      typeFieldInput.style.height = typeFieldInput.scrollHeight + 'px';
    }
    typeFieldInput.addEventListener('input', autoGrowTypeField);

    function setLogStatus(text) {
      if (text) {
        logStatusText.textContent = text;
        logStatusText.hidden = false;
      } else {
        logStatusText.hidden = true;
      }
    }

    // ============ FIRESTORE (real shared database) ============
    // One document per person, e.g. people/NABH — holds their daily log and
    // their months/weeks/tasks. `db` and `firebase` come from firebase-config.js.
    const personDocRef = db.collection('people').doc(currentPerson);

    // ============ CROSS-ASSIGNED TASKS (real fix for "Assign" not working) ============
    // Previously, picking someone else as the assignee just wrote a label
    // onto a task that still lived only in the assigning person's own
    // document — it never actually appeared anywhere on the assignee's own
    // page. This reads the *other two* people's documents too (read-only)
    // and, for whichever tasks they've assigned to whoever's page this is,
    // shows those tasks here as well — tagged with who assigned them — so
    // assigning actually means something.
    const ALL_PEOPLE = ['NABH', 'AVI', 'ADI'];
    const otherPeople = ALL_PEOPLE.filter((p) => p !== currentPerson);
    const otherPersonDocRefs = {};
    let otherPeopleMonthsData = {};
    otherPeople.forEach((p) => {
      otherPersonDocRefs[p] = db.collection('people').doc(p);
      otherPeopleMonthsData[p] = {};
    });

    // Local (not UTC) YYYY-MM-DD, so it lines up with calendar days the way
    // a person actually experiences them, not shifted by timezone.
    function formatISODate(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + d;
    }

    // ============ DAILY LOG ============
    // Typing something and hitting Enter saves it straight to Firestore, in
    // this person's `dailyLog` array (newest first) — visible to everyone,
    // and to the Home screen. `onSnapshot` below re-renders automatically
    // whenever this changes, whether from this tab, another tab, or another
    // device entirely.
    let logEntries = []; // kept in sync by the Firestore listener, not written to directly

    function showLogTodayCta() {
      logBar.hidden = false;
      logInputRow.hidden = true;
      logTodayBtn.hidden = false;
    }
    function showAlreadyLoggedCta() {
      // Whole eye + button disappears once today's log is in — comes back
      // on its own the next real calendar day.
      logBar.hidden = true;
    }

    logTodayBtn.addEventListener('click', () => {
      logTodayBtn.hidden = true;
      logInputRow.hidden = false;
      typeFieldInput.focus();
    });

    function formatLogDate(dateISOString) {
      return new Date(dateISOString).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // Only today's entry can be edited — once the day is over it's locked
    // in as history, same as everything else in this app.
    function saveDailyLog(updatedLog) {
      personDocRef.set({ dailyLog: updatedLog }, { merge: true });
    }

    function renderLogHistory() {
      logEntryRows.innerHTML = '';
      if (logEntries.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'log-entry-empty';
        empty.textContent = 'Nothing logged yet — whatever you type into LOG TODAY will show up here.';
        logEntryRows.appendChild(empty);
        return;
      }
      const todayISOForRender = formatISODate(new Date());
      logEntries.forEach((entry, index) => {
        const row = document.createElement('div');
        row.className = 'log-entry';
        const isToday = entry.dateISO === todayISOForRender;
        row.innerHTML =
          '<div class="log-entry-top">' +
            '<p class="log-entry-date"></p>' +
            (isToday ? '<button class="log-entry-edit-btn">EDIT</button>' : '') +
          '</div>' +
          '<p class="log-entry-text"></p>' +
          '<div class="log-entry-edit-row" hidden>' +
            '<textarea class="log-entry-edit-input" rows="2"></textarea>' +
            '<button class="log-entry-save-btn">SAVE</button>' +
          '</div>';
        row.querySelector('.log-entry-date').textContent = formatLogDate(entry.timestamp);
        row.querySelector('.log-entry-text').textContent = entry.text;

        if (isToday) {
          const editBtn = row.querySelector('.log-entry-edit-btn');
          const textEl = row.querySelector('.log-entry-text');
          const editRow = row.querySelector('.log-entry-edit-row');
          const editInput = row.querySelector('.log-entry-edit-input');
          const saveBtn = row.querySelector('.log-entry-save-btn');

          editBtn.addEventListener('click', () => {
            editInput.value = entry.text;
            textEl.hidden = true;
            editBtn.hidden = true;
            editRow.hidden = false;
            editInput.focus();
          });
          saveBtn.addEventListener('click', () => {
            const newText = editInput.value.trim();
            if (!newText) return; // don't let an edit blank it out
            const updatedLog = logEntries.slice();
            updatedLog[index] = { ...entry, text: newText };
            saveDailyLog(updatedLog);
            // The onSnapshot listener re-renders once this write lands.
          });
        }
        logEntryRows.appendChild(row);
      });
      if (logEntries.some(e => e.dateISO === todayISOForRender)) showAlreadyLoggedCta(); else showLogTodayCta();
    }

    function submitLogEntry() {
      const text = typeFieldInput.value.trim();
      if (!text) return; // nothing typed — don't add an empty entry
      const entry = { text, dateISO: formatISODate(new Date()), timestamp: new Date().toISOString() };
      const updatedLog = [entry, ...logEntries];
      typeFieldInput.value = '';
      autoGrowTypeField(); // shrink the box back down now that it's empty
      saveDailyLog(updatedLog);
      // No manual re-render here — the onSnapshot listener below will pick
      // this write up (usually within a fraction of a second) and redraw.
    }
    typeFieldInput.addEventListener('keydown', (e) => {
      // Enter submits (like before); Shift+Enter still adds a new line,
      // since this is now a growing text box rather than a single-line one.
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitLogEntry();
      }
    });

    // ============ VOICE LOGGING (free, runs inside the browser) ============
    // Some browsers your team uses (Dia, Arc, Brave) don't have a working
    // built-in speech-to-text engine, so instead of relying on the
    // browser's own transcription we do it ourselves: record your voice as
    // audio, then run it through a small free AI transcription model
    // (Whisper) that downloads once and runs entirely on your own device
    // from then on — no account, no API key, no per-use cost, and it works
    // identically in every browser because it doesn't depend on anything
    // browser-specific. Tradeoff: the very first time anyone uses it, the
    // browser downloads that model (a one-time ~40-75MB download, then
    // cached), and transcribing takes a few seconds after you stop
    // talking rather than being instant.
    const micBtn = logInputRow.querySelector('.btn-mic');

    if (!navigator.mediaDevices || !window.MediaRecorder) {
      // Can't record audio at all here — hide rather than show something broken.
      micBtn.hidden = true;
    } else {
      let mediaRecorder = null;
      let audioChunks = [];
      let isRecording = false;
      let transcriberPromise = null; // loaded once, then reused for every recording
      const originalPlaceholder = typeFieldInput.placeholder;

      // Loads the transcription model the first time it's needed (or
      // earlier, in the background, once you start talking) and reuses it
      // after that — so only your very first voice log on this device is slow.
      function getTranscriber() {
        if (!transcriberPromise) {
          transcriberPromise = import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2')
            .then(({ pipeline, env }) => {
              env.allowLocalModels = false;
              return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
            });
        }
        return transcriberPromise;
      }

      function pickMimeType() {
        const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg'];
        return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      }

      // The AI model expects plain mono audio at 16kHz — this decodes
      // whatever format the browser recorded (webm/mp4/etc.) and resamples
      // it into that exact shape.
      async function blobToMonoFloat32(blob) {
        const arrayBuffer = await blob.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        const targetRate = 16000;
        const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = decoded;
        source.connect(offlineCtx.destination);
        source.start(0);
        const rendered = await offlineCtx.startRendering();
        audioCtx.close();
        return rendered.getChannelData(0);
      }

      async function startRecording() {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
          alert('Voice logging needs microphone access — check your browser/site permissions and try again.');
          setLogStatus('');
          return;
        }

        const mimeType = pickMimeType();
        audioChunks = [];
        mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

        mediaRecorder.addEventListener('dataavailable', (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        });

        mediaRecorder.addEventListener('stop', async () => {
          stream.getTracks().forEach((track) => track.stop());
          isRecording = false;
          micBtn.classList.remove('listening');
          micBtn.classList.add('transcribing');
          setLogStatus('Transcribing…');
          try {
            const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
            const samples = await blobToMonoFloat32(blob);
            const transcriber = await getTranscriber();
            const result = await transcriber(samples);
            const heard = (result.text || '').trim();
            if (heard) {
              // Append rather than overwrite, in case they'd already typed
              // part of the entry before switching to voice.
              typeFieldInput.value = (typeFieldInput.value.trim() + ' ' + heard).trim();
              autoGrowTypeField();
            }
          } catch (err) {
            console.error(err);
            alert('Could not transcribe that — check your connection (the first time, it needs to download a small speech model) and try again.');
          }
          micBtn.classList.remove('transcribing');
          setLogStatus('');
          typeFieldInput.placeholder = originalPlaceholder;
        });

        mediaRecorder.start();
        isRecording = true;
        micBtn.classList.add('listening');
        // Swap out the static placeholder while listening — the status
        // text below already says "Listening…", so leaving the old
        // "TYPE OR TAP THE MIC" hint showing at the same time just reads
        // like nothing happened when you tapped the mic.
        typeFieldInput.placeholder = '';
        setLogStatus('Listening… tap the mic again when you\'re done');
        // Start loading the model in the background while they're still
        // talking, so it's more likely to already be ready by the time
        // they stop and we need it.
        getTranscriber();
      }

      micBtn.addEventListener('click', () => {
        if (isRecording) {
          mediaRecorder.stop();
          return;
        }
        typeFieldInput.focus();
        startRecording();
      });
    }

    // ADD WORK opens the modal empty (Add mode). Clicking an existing task
    // row opens the same modal pre-filled (Edit mode) — one modal, two
    // states, matching how Figma's Add Work / Edit Work frames are really
    // the same design with different data.
    const dimOverlay = document.getElementById('dimOverlay');
    const modalWrap = document.getElementById('modalWrap');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalTitle = document.getElementById('modalTitle');
    const fieldWork = document.getElementById('fieldWork');
    const fieldDue = document.getElementById('fieldDue');
    const fieldNotes = document.getElementById('fieldNotes');
    const btnSave = document.querySelector('.btn-save');
    const btnDelete = document.querySelector('.btn-delete');
    const weeksListEl = document.getElementById('weeksList');
    const monthChevronBtn = document.getElementById('monthChevronBtn');
    const monthPickerPanel = document.getElementById('monthPickerPanel');
    const screenHeaderTitle = document.getElementById('screenHeaderTitle');

    // ============ REAL DATES ============
    // The current month is read from the device's real clock, and "Week N"
    // boundaries are real calendar weeks of that month (Week 1 = days 1-7,
    // Week 2 = days 8-14, etc).
    const today = new Date();
    const CURRENT_YEAR = today.getFullYear();
    const CURRENT_MONTH_INDEX = today.getMonth(); // 0 = January
    const CURRENT_MONTH = today.toLocaleString('en-US', { month: 'long' }).toUpperCase();
    const TODAY_DAY = today.getDate();

    function daysInMonth(year, monthIndex) {
      return new Date(year, monthIndex + 1, 0).getDate();
    }
    function weekCountForMonth(year, monthIndex) {
      return Math.ceil(daysInMonth(year, monthIndex) / 7);
    }
    function weekLabelsForMonth(year, monthIndex) {
      const count = weekCountForMonth(year, monthIndex);
      return Array.from({ length: count }, (_, i) => 'WEEK ' + (i + 1));
    }
    // Which week (0-indexed) today's date falls into, within the current month.
    const CURRENT_WEEK_INDEX = Math.floor((TODAY_DAY - 1) / 7);

    // Seed data for a brand-new person doc (first time this person's page
    // is ever opened) — a couple of sample tasks in whichever week contains
    // today, so there's something to look at on day one. Firestore can't
    // store an array of arrays, so weeks are a map keyed by "0", "1", etc.
    // instead of a real array — same idea, just a shape Firestore allows.
    function buildSeedMonths() {
      const weeks = {};
      for (let i = 0; i < weekCountForMonth(CURRENT_YEAR, CURRENT_MONTH_INDEX); i++) weeks[i] = [];
      weeks[CURRENT_WEEK_INDEX] = [
        { work: 'Task One that i have to finish', due: '12 August', notes: 'I will first try to do it using claude and if the expected result not achieved then move to After effects', assignee: 'AVI', state: 'Not Started' },
        { work: 'Task One that i have to finish', due: '12 August', notes: '', assignee: 'NONE', state: 'Started' },
        { work: 'Task One that i have to finish', due: '12 August', notes: '', assignee: 'NONE', state: 'Not Started' },
        { work: 'Task One that i have to finish', due: '12 August', notes: '', assignee: 'NONE', state: 'Full Completed' },
      ];
      const months = {};
      months[CURRENT_MONTH] = weeks;
      return months;
    }

    // Populated live from Firestore by the onSnapshot listener further down
    // — this is the single source of truth the whole page renders from.
    let monthsData = {};
    let currentMonth = CURRENT_MONTH;
    // While the modal is open: which week/task it's editing. taskIndex is
    // null in Add mode (a new task, not yet saved).
    let editingContext = null;

    function selectChip(person) {
      document.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('selected', c.dataset.person === person);
      });
    }
    function getSelectedChipPerson() {
      const selected = document.querySelector('.chip.selected');
      return selected ? selected.dataset.person : 'NONE';
    }

    // ============ SUBTASKS (inside the Add/Edit Work modal) ============
    // A subtask is just { text, done }. In Add mode (brand-new task, not
    // saved yet) these only live in this local array and get bundled in
    // with everything else when SAVE is pressed. In Edit mode, every
    // add/check/remove writes straight back to Firestore immediately —
    // same "instant" feel as the state icon — instead of waiting for you
    // to also hit SAVE on the whole task.
    const subtaskListEl = document.getElementById('subtaskList');
    const subtaskInput = document.getElementById('subtaskInput');
    const subtaskAddBtn = document.getElementById('subtaskAddBtn');
    const subtaskCheckSVG = '<svg viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 5L4.5 8.5L11 1" stroke="#212121" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    let editingSubtasks = [];

    function renderSubtaskList() {
      subtaskListEl.innerHTML = '';
      editingSubtasks.forEach((subtask, subtaskIndex) => {
        const row = document.createElement('div');
        row.className = 'subtask-row';

        const checkbox = document.createElement('button');
        checkbox.type = 'button';
        checkbox.className = 'subtask-checkbox' + (subtask.done ? ' done' : '');
        checkbox.innerHTML = subtaskCheckSVG;
        checkbox.addEventListener('click', () => {
          editingSubtasks[subtaskIndex] = { ...subtask, done: !subtask.done };
          persistSubtasksIfEditing();
          renderSubtaskList();
        });

        const text = document.createElement('p');
        text.className = 'subtask-text';
        text.textContent = subtask.text;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'subtask-remove-btn';
        remove.textContent = '×';
        remove.setAttribute('aria-label', 'Remove subtask');
        remove.addEventListener('click', () => {
          editingSubtasks.splice(subtaskIndex, 1);
          persistSubtasksIfEditing();
          renderSubtaskList();
        });

        row.appendChild(checkbox);
        row.appendChild(text);
        row.appendChild(remove);
        subtaskListEl.appendChild(row);
      });
    }

    // Only writes to Firestore in Edit mode (a real, already-saved task to
    // attach subtasks to) — in Add mode there's nothing to write to yet.
    function persistSubtasksIfEditing() {
      if (!editingContext || editingContext.taskIndex === null) return;
      const { weekIndex, taskIndex } = editingContext;
      const weekTasks = monthsData[currentMonth][weekIndex].slice();
      weekTasks[taskIndex] = { ...weekTasks[taskIndex], subtasks: editingSubtasks };
      saveWeekTasks(weekIndex, weekTasks);
    }

    function addSubtaskFromInput() {
      const text = subtaskInput.value.trim();
      if (!text) return;
      editingSubtasks.push({ text, done: false });
      subtaskInput.value = '';
      persistSubtasksIfEditing();
      renderSubtaskList();
    }
    subtaskAddBtn.addEventListener('click', addSubtaskFromInput);
    subtaskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addSubtaskFromInput();
      }
    });

    function openAddModal(weekIndex) {
      editingContext = { weekIndex, taskIndex: null };
      modalTitle.textContent = 'Add Work';
      fieldWork.value = '';
      fieldDue.value = '';
      fieldNotes.value = '';
      selectChip('NONE'); // default Assign selection is "No one" for a brand-new task
      editingSubtasks = [];
      renderSubtaskList();
      btnDelete.style.display = 'none'; // nothing to delete yet in Add mode
      dimOverlay.hidden = false;
      modalWrap.hidden = false;
    }
    function openEditModal(weekIndex, taskIndex) {
      editingContext = { weekIndex, taskIndex };
      const task = monthsData[currentMonth][weekIndex][taskIndex];
      modalTitle.textContent = 'EDIT Work';
      fieldWork.value = task.work;
      fieldDue.value = task.due;
      fieldNotes.value = task.notes;
      selectChip(task.assignee);
      editingSubtasks = (task.subtasks || []).slice();
      renderSubtaskList();
      btnDelete.style.display = '';
      dimOverlay.hidden = false;
      modalWrap.hidden = false;
    }
    function closeModal() {
      dimOverlay.hidden = true;
      modalWrap.hidden = true;
      editingContext = null;
    }

    // Writes one week's task list back to Firestore, at
    // months.<MONTH>.<weekIndex> — the onSnapshot listener picks this up
    // and re-renders, so there's no manual renderMonth() call needed here.
    function saveWeekTasks(weekIndex, tasks) {
      const fieldPath = 'months.' + currentMonth + '.' + weekIndex;
      personDocRef.update({ [fieldPath]: tasks });
    }

    btnSave.addEventListener('click', () => {
      const work = fieldWork.value.trim();
      if (!work) {
        fieldWork.focus();
        return; // a task needs at least a name
      }
      const due = fieldDue.value.trim();
      const notes = fieldNotes.value.trim();
      const assignee = getSelectedChipPerson();
      const { weekIndex, taskIndex } = editingContext;
      const weekTasks = monthsData[currentMonth][weekIndex].slice(); // copy — don't mutate in place

      if (taskIndex === null) {
        weekTasks.push({ work, due, notes, assignee, state: 'Not Started', subtasks: editingSubtasks });
      } else {
        weekTasks[taskIndex] = { work, due, notes, assignee, state: weekTasks[taskIndex].state, subtasks: editingSubtasks };
      }
      saveWeekTasks(weekIndex, weekTasks);
      closeModal();
    });

    btnDelete.addEventListener('click', () => {
      if (editingContext && editingContext.taskIndex !== null) {
        const { weekIndex, taskIndex } = editingContext;
        const weekTasks = monthsData[currentMonth][weekIndex].slice();
        weekTasks.splice(taskIndex, 1);
        saveWeekTasks(weekIndex, weekTasks);
      }
      closeModal();
    });

    closeModalBtn.addEventListener('click', closeModal);

    // Month Picker — opens under the header, dims the rest of the page
    // (reusing the same dim overlay the modal uses), toggles the chevron
    // between pointing down (closed) and up (open).
    function openMonthPicker() {
      dimOverlay.hidden = false;
      monthPickerPanel.hidden = false;
      monthChevronBtn.classList.add('open');
    }
    function closeMonthPicker() {
      dimOverlay.hidden = true;
      monthPickerPanel.hidden = true;
      monthChevronBtn.classList.remove('open');
    }
    // Clicking the dim background closes whichever of modal/month-picker is open.
    dimOverlay.addEventListener('click', () => { closeModal(); closeMonthPicker(); });

    monthChevronBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (monthPickerPanel.hidden) openMonthPicker(); else closeMonthPicker();
    });

    function switchMonth(month) {
      document.querySelectorAll('.month-row').forEach(r => r.classList.toggle('current', r.dataset.month === month));
      closeMonthPicker();
      renderMonth(month);
    }

    // Month picker rows are built from whichever months actually exist in
    // Firestore for this person — right now just this month, since we're
    // starting fresh. Past months will show up here automatically as they
    // happen and get saved.
    const monthPickerInner = document.getElementById('monthPickerInner');
    function renderMonthPickerRows() {
      monthPickerInner.innerHTML = '';
      Object.keys(monthsData).forEach(month => {
        const row = document.createElement('button');
        row.className = 'month-row' + (month === currentMonth ? ' current' : '');
        row.dataset.month = month;
        row.innerHTML =
          month +
          '<span class="row-chevron"><svg viewBox="0 0 19 25" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2L15 12.5L2 23" stroke="currentColor" stroke-width="1.5"/></svg></span>';
        row.addEventListener('click', () => switchMonth(month));
        monthPickerInner.appendChild(row);
      });
    }

    // Work state icons — clicking an icon cycles it through its 4 states.
    // These are the exact SVGs exported from the real Figma components
    // (Component / State Icon), not hand-drawn stand-ins.
    const stateIconSVGs = {
      'Not Started': '<svg width="52" height="28" viewBox="0 0 52 28" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M25.8682 0.557617C36.3513 0.557673 45.5926 5.85753 51.0605 13.9209C45.5927 21.9846 36.3515 27.2851 25.8682 27.2852C15.3844 27.2852 6.14174 21.9851 0.673828 13.9209C6.1418 5.85704 15.3846 0.557642 25.8682 0.557617Z" stroke="#F0F0F0" stroke-width="1.115"/></svg>',
      'Started': '<svg width="52" height="28" viewBox="0 0 52 28" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M25.8682 0.557617C36.3513 0.557673 45.5926 5.85753 51.0605 13.9209C45.5927 21.9847 36.3515 27.2851 25.8682 27.2852C15.3844 27.2852 6.14174 21.9851 0.673828 13.9209C6.1418 5.85704 15.3846 0.557642 25.8682 0.557617Z" stroke="#F0F0F0" stroke-width="1.115"/><path d="M25.8369 4.74243C30.667 4.74245 34.5819 8.65312 34.582 13.4758C34.582 18.2987 30.667 22.2102 25.8369 22.2102C21.0069 22.21 17.0927 18.2986 17.0927 13.4758C17.0928 8.6532 21.007 4.74262 25.8369 4.74243Z" stroke="#F0F0F0" stroke-width="1.115"/></svg>',
      'Half Completed': '<svg width="52" height="28" viewBox="0 0 52 28" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M25.868 0C36.6797 0 46.1973 5.53428 51.736 13.9212C46.1973 22.3083 36.6797 27.8424 25.868 27.8424C15.0563 27.8424 5.53872 22.3083 0 13.9212C5.53874 5.53426 15.0563 2.5843e-05 25.868 0ZM25.837 4.63051C20.6996 4.63051 16.5349 8.7903 16.5349 13.9216C16.5349 19.0529 20.6996 23.213 25.837 23.213C30.9745 23.213 35.1392 19.0529 35.1392 13.9216C35.1392 8.79033 30.9745 4.63053 25.837 4.63051Z" fill="#1AFF55"/></svg>',
      'Full Completed': '<svg width="56" height="28" viewBox="0 0 56 28" fill="none" xmlns="http://www.w3.org/2000/svg"><g filter="url(#glow-full)"><path d="M29.8682 0.557617C40.3513 0.557673 49.5926 5.85753 55.0605 13.9209C49.5927 21.9846 40.3515 27.2851 29.8682 27.2852C19.3844 27.2852 10.1417 21.9851 4.67383 13.9209C10.1418 5.85704 19.3846 0.557642 29.8682 0.557617ZM29.8369 4.07324C24.3923 4.07329 19.9776 8.48209 19.9775 13.9219C19.9777 19.3616 24.3924 23.7705 29.8369 23.7705C35.2816 23.7705 39.6961 19.3616 39.6963 13.9219C39.6963 8.48207 35.2817 4.07327 29.8369 4.07324Z" fill="#1AFF55" stroke="#1AFF55" stroke-width="1.115"/><path d="M20.502 13.9235C20.502 8.75089 24.6953 4.55762 29.8679 4.55762C35.0407 4.55764 39.234 8.75091 39.234 13.9235C39.234 19.0961 35.0407 23.2896 29.8679 23.2896C24.6953 23.2896 20.502 19.0961 20.502 13.9235Z" fill="white"/></g><defs><filter id="glow-full" x="0" y="-4" width="59.736" height="35.8424" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset/><feGaussianBlur stdDeviation="2"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0.101961 0 0 0 0 1 0 0 0 0 0.333333 0 0 0 1 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow"/><feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape"/></filter></defs></svg>'
    };
    const stateOrder = ['Not Started', 'Started', 'Half Completed', 'Full Completed'];

    function paintStateIcon(el) {
      el.innerHTML = stateIconSVGs[el.dataset.state];
    }

    // ============ HOME PAGE ACTIVITY BANNER ============
    // Whenever a task's state actually moves forward (not when it wraps
    // back around to "Not Started"), we write a message onto whoever OWNS
    // that task's document — index.js reads this and shows it as a
    // highlighted banner on that person's home screen card for the rest
    // of that day.
    function buildActivityMessage(ownerName, work) {
      return function (state) {
        if (state === 'Started') return ownerName + ' has started "' + work + '"';
        if (state === 'Half Completed') return ownerName + ' has completed half of "' + work + '"';
        if (state === 'Full Completed') return ownerName + ' has completed "' + work + '"';
        return null; // "Not Started" isn't worth announcing
      };
    }
    function writeLastActivity(docRef, ownerName, work, state) {
      const text = buildActivityMessage(ownerName, work)(state);
      if (!text) return;
      writeActivityText(docRef, text);
    }
    function writeActivityText(docRef, text) {
      docRef.update({
        lastActivity: { text, dateISO: formatISODate(new Date()), timestamp: new Date().toISOString() },
      });
    }
    // Ticking subtasks off is real progress too, so it also shows up on the
    // home screen — e.g. "NABH finished 2/3 subtasks of ..." (or a plain
    // "completed" message once they're all done).
    function announceSubtaskProgress(docRef, ownerName, work, subtasks) {
      const doneCount = subtasks.filter((s) => s.done).length;
      const total = subtasks.length;
      const text = doneCount === total
        ? ownerName + ' finished all subtasks of "' + work + '"'
        : ownerName + ' finished ' + doneCount + '/' + total + ' subtasks of "' + work + '"';
      writeActivityText(docRef, text);
    }

    // weekIndex/taskIndex let a click on the icon save the new state to
    // Firestore, not just repaint the on-screen SVG — so it survives a
    // month switch, a refresh, and shows up on anyone else viewing this
    // person's page too.
    function attachStateIconListener(el, weekIndex, taskIndex) {
      paintStateIcon(el);
      el.addEventListener('click', (e) => {
        e.stopPropagation(); // don't also open the Edit Work modal via the row's own click handler
        const current = stateOrder.indexOf(el.dataset.state);
        const next = stateOrder[(current + 1) % stateOrder.length];
        el.dataset.state = next; // paint immediately, don't wait on the round-trip to Firestore
        paintStateIcon(el);
        const weekTasks = monthsData[currentMonth][weekIndex].slice();
        const task = weekTasks[taskIndex];
        weekTasks[taskIndex] = { ...task, state: next };
        saveWeekTasks(weekIndex, weekTasks);
        writeLastActivity(personDocRef, currentPerson, task.work, next);
      });
    }

    // Same as attachStateIconListener above, but for a task that lives in
    // someone ELSE's document (they assigned it to you) — so marking it
    // Started/Done writes back to the actual owner's doc, not your own
    // (writing to your own would just silently create a duplicate that
    // never syncs back to them). The activity banner still credits the
    // actual owner, not whoever tapped the icon.
    function attachForeignStateIconListener(el, owner, weekIndex, taskIndex) {
      paintStateIcon(el);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const current = stateOrder.indexOf(el.dataset.state);
        const next = stateOrder[(current + 1) % stateOrder.length];
        el.dataset.state = next;
        paintStateIcon(el);
        const ownerMonthsForThisMonth = (otherPeopleMonthsData[owner] && otherPeopleMonthsData[owner][currentMonth]) || {};
        const weekTasks = (ownerMonthsForThisMonth[weekIndex] || []).slice();
        const task = weekTasks[taskIndex];
        weekTasks[taskIndex] = { ...task, state: next };
        const fieldPath = 'months.' + currentMonth + '.' + weekIndex;
        otherPersonDocRefs[owner].update({ [fieldPath]: weekTasks });
        writeLastActivity(otherPersonDocRefs[owner], owner, task.work, next);
      });
    }

    // Looks across the other two people's data for anything they've
    // assigned to whoever's page this is, for one specific week.
    function getAssignedToMeTasks(weekIndex) {
      const result = [];
      otherPeople.forEach((owner) => {
        const monthWeeks = (otherPeopleMonthsData[owner] && otherPeopleMonthsData[owner][currentMonth]) || {};
        const tasks = monthWeeks[weekIndex] || [];
        tasks.forEach((task, taskIndex) => {
          if (task.assignee === currentPerson) {
            result.push({ owner, taskIndex, task });
          }
        });
      });
      return result;
    }

    // Chip selection (single-select) — clicking a chip in the modal just
    // changes which one looks selected; getSelectedChipPerson() reads it
    // back when Save is pressed.
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => selectChip(chip.dataset.person));
    });

    // ============ RENDERING ============
    // "2/4 subtasks" hint, or null if this task has no subtasks — used
    // under the task name so progress is visible without opening it.
    function subtaskProgressText(task) {
      const subtasks = task.subtasks || [];
      if (subtasks.length === 0) return null;
      const doneCount = subtasks.filter((s) => s.done).length;
      return doneCount + '/' + subtasks.length + ' subtasks';
    }

    // Builds the list of subtasks shown directly under a task on the week
    // list, so they can be ticked off without opening the Edit modal.
    // `onToggle(subtaskIndex)` is what actually writes the change — it
    // differs for your own tasks vs ones assigned to you (different docs).
    function buildInlineSubtasks(task, onToggle) {
      const subtasks = task.subtasks || [];
      if (subtasks.length === 0) return null;
      const wrap = document.createElement('div');
      wrap.className = 'inline-subtasks';
      subtasks.forEach((subtask, subtaskIndex) => {
        const row = document.createElement('div');
        row.className = 'inline-subtask-row';

        const checkbox = document.createElement('button');
        checkbox.type = 'button';
        checkbox.className = 'subtask-checkbox inline' + (subtask.done ? ' done' : '');
        checkbox.innerHTML = subtaskCheckSVG;
        checkbox.setAttribute('aria-label', (subtask.done ? 'Mark incomplete: ' : 'Mark complete: ') + subtask.text);
        checkbox.addEventListener('click', (e) => {
          // Don't also open the Edit modal via the task row's click handler.
          e.stopPropagation();
          onToggle(subtaskIndex);
        });

        const text = document.createElement('p');
        text.className = 'inline-subtask-text' + (subtask.done ? ' done' : '');
        text.textContent = subtask.text;

        row.appendChild(checkbox);
        row.appendChild(text);
        wrap.appendChild(row);
      });
      return wrap;
    }

    // Builds one task row from a monthsData entry, wired to open the Edit
    // modal on click and to cycle its state icon. Returns a block: the row
    // itself plus (if it has any) its subtasks listed underneath.
    function buildTaskRow(weekIndex, taskIndex, task) {
      const block = document.createElement('div');
      block.className = 'task-block';

      const row = document.createElement('div');
      row.className = 'task-row';

      const icon = document.createElement('span');
      icon.className = 'state-icon';
      icon.dataset.state = task.state;
      attachStateIconListener(icon, weekIndex, taskIndex);

      const textWrap = document.createElement('div');
      textWrap.className = 'task-label-wrap';
      const label = document.createElement('p');
      label.className = 'task-label';
      label.textContent = task.work;
      textWrap.appendChild(label);
      const progressText = subtaskProgressText(task);
      if (progressText) {
        const progress = document.createElement('p');
        progress.className = 'subtask-progress';
        progress.textContent = progressText;
        textWrap.appendChild(progress);
      }

      row.appendChild(icon);
      row.appendChild(textWrap);
      row.addEventListener('click', () => openEditModal(weekIndex, taskIndex));
      block.appendChild(row);

      const subtasksEl = buildInlineSubtasks(task, (subtaskIndex) => {
        const weekTasks = monthsData[currentMonth][weekIndex].slice();
        const current = weekTasks[taskIndex];
        const updatedSubtasks = (current.subtasks || []).slice();
        updatedSubtasks[subtaskIndex] = {
          ...updatedSubtasks[subtaskIndex],
          done: !updatedSubtasks[subtaskIndex].done,
        };
        weekTasks[taskIndex] = { ...current, subtasks: updatedSubtasks };
        saveWeekTasks(weekIndex, weekTasks);
        announceSubtaskProgress(personDocRef, currentPerson, current.work, updatedSubtasks);
      });
      if (subtasksEl) block.appendChild(subtasksEl);

      return block;
    }

    // Same idea as buildTaskRow, but for a task someone else assigned to
    // you — it lives in their document, so it's tagged with who assigned
    // it and highlighted, and tapping the row doesn't open the Edit modal
    // (you can't rename/retime a task you don't own — only mark it Started
    // /Done via the state icon, which writes back to the assigner's doc).
    function buildAssignedTaskRow(owner, weekIndex, taskIndex, task) {
      const block = document.createElement('div');
      block.className = 'task-block';

      const row = document.createElement('div');
      row.className = 'task-row assigned-row';

      const icon = document.createElement('span');
      icon.className = 'state-icon';
      icon.dataset.state = task.state;
      attachForeignStateIconListener(icon, owner, weekIndex, taskIndex);

      const textWrap = document.createElement('div');
      textWrap.className = 'task-label-wrap';
      const label = document.createElement('p');
      label.className = 'task-label';
      label.textContent = task.work;
      const tag = document.createElement('p');
      tag.className = 'assigned-tag';
      tag.textContent = 'ASSIGNED BY ' + owner;
      textWrap.appendChild(label);
      textWrap.appendChild(tag);
      const progressText = subtaskProgressText(task);
      if (progressText) {
        const progress = document.createElement('p');
        progress.className = 'subtask-progress';
        progress.textContent = progressText;
        textWrap.appendChild(progress);
      }

      row.appendChild(icon);
      row.appendChild(textWrap);
      block.appendChild(row);

      // Subtasks on an assigned task are tickable too — the write goes to
      // the owner's document, same as its state icon does.
      const subtasksEl = buildInlineSubtasks(task, (subtaskIndex) => {
        const ownerMonthWeeks = (otherPeopleMonthsData[owner] && otherPeopleMonthsData[owner][currentMonth]) || {};
        const weekTasks = (ownerMonthWeeks[weekIndex] || []).slice();
        const current = weekTasks[taskIndex];
        const updatedSubtasks = (current.subtasks || []).slice();
        updatedSubtasks[subtaskIndex] = {
          ...updatedSubtasks[subtaskIndex],
          done: !updatedSubtasks[subtaskIndex].done,
        };
        weekTasks[taskIndex] = { ...current, subtasks: updatedSubtasks };
        const fieldPath = 'months.' + currentMonth + '.' + weekIndex;
        otherPersonDocRefs[owner].update({ [fieldPath]: weekTasks });
        announceSubtaskProgress(otherPersonDocRefs[owner], owner, current.work, updatedSubtasks);
      });
      if (subtasksEl) block.appendChild(subtasksEl);

      return block;
    }

    // Builds an unlocked/expanded week: header + its tasks. The ADD WORK
    // button only shows up for the one week that's actually happening right
    // now — a week that's already passed only makes sense to review/edit,
    // not add new work to, so it's left out for those (canAddWork = false).
    // assignedTasks are tasks from OTHER people's pages that they assigned
    // to whoever's page this is, for this same week.
    function buildExpandedWeek(label, weekIndex, tasks, canAddWork, assignedTasks) {
      const wrap = document.createElement('div');
      wrap.innerHTML =
        '<div class="week-header">' +
          '<div class="week-header-line"></div>' +
          '<div class="week-header-content">' +
            '<p class="week-label">' + label + '</p>' +
            (canAddWork ?
              '<button class="btn-add-work">' +
                '<span class="icon-plus">' +
                  '<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    '<line x1="8.05598" y1="0" x2="8.05598" y2="13.7236" stroke="#212121" stroke-width="1.78973"/>' +
                    '<line x1="13.7236" y1="7.75424" x2="0" y2="7.75424" stroke="#212121" stroke-width="1.78973"/>' +
                  '</svg>' +
                '</span>' +
                'ADD WORK' +
              '</button>'
            : '') +
          '</div>' +
          '<div class="week-header-line"></div>' +
        '</div>' +
        '<div class="task-rows"></div>';
      if (canAddWork) {
        wrap.querySelector('.btn-add-work').addEventListener('click', (e) => {
          e.stopPropagation();
          openAddModal(weekIndex);
        });
      }
      const rowsEl = wrap.querySelector('.task-rows');
      if (tasks.length === 0 && assignedTasks.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'week-empty-hint';
        empty.textContent = 'Kaam karle Bhadwe';
        rowsEl.appendChild(empty);
      } else {
        tasks.forEach((task, taskIndex) => rowsEl.appendChild(buildTaskRow(weekIndex, taskIndex, task)));
        assignedTasks.forEach(({ owner, taskIndex, task }) => rowsEl.appendChild(buildAssignedTaskRow(owner, weekIndex, taskIndex, task)));
      }
      return wrap;
    }

    // Builds a locked week: just the header + lock icon, nothing clickable —
    // this is a future week in the current month that hasn't started yet.
    function buildLockedWeek(label) {
      const wrap = document.createElement('div');
      wrap.className = 'week-collapsed';
      wrap.innerHTML =
        '<div class="week-header-line"></div>' +
        '<div class="week-header-content">' +
          '<p class="week-label">' + label + '</p>' +
          '<span class="icon-chevron-collapse">' +
            '<svg width="19" height="25" viewBox="0 0 19 25" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18.0586 8.77237V24.2519H0.515625V8.77237H18.0586Z" stroke="#1AFF55" stroke-width="1.03195" stroke-linejoin="round"/><path d="M16.5101 8.25535C16.5101 8.25535 16.5111 0.515961 9.29161 0.515961C2.07214 0.515961 2.06421 8.25535 2.06421 8.25535" stroke="#1AFF55" stroke-width="1.03195"/></svg>' +
          '</span>' +
        '</div>' +
        '<div class="week-header-line"></div>';
      return wrap;
    }

    // Redraws the whole weeks list for a given month from monthsData.
    // Called on load, after switching months, and by the Firestore listener
    // every time the underlying data changes (from this tab or any other).
    function renderMonth(month) {
      currentMonth = month;
      screenHeaderTitle.textContent = month;
      weeksListEl.innerHTML = '';
      const isCurrentMonth = (month === CURRENT_MONTH);
      const labels = weekLabelsForMonth(CURRENT_YEAR, CURRENT_MONTH_INDEX);
      const weeksForMonth = monthsData[month] || {};
      Object.keys(weeksForMonth).sort((a, b) => a - b).map(k => weeksForMonth[k]).forEach((tasks, weekIndex) => {
        // Locked = a future week of the CURRENT month (hasn't happened yet).
        // Everything up to and including today's week is unlocked, same as
        // every week of a past month would be.
        const locked = isCurrentMonth && weekIndex > CURRENT_WEEK_INDEX;
        // Only the week actually happening right now gets ADD WORK — a
        // week that's already passed is just for review/editing, not for
        // adding new tasks to.
        const canAddWork = isCurrentMonth && weekIndex === CURRENT_WEEK_INDEX;
        weeksListEl.appendChild(
          locked
            ? buildLockedWeek(labels[weekIndex])
            : buildExpandedWeek(labels[weekIndex], weekIndex, tasks, canAddWork, getAssignedToMeTasks(weekIndex))
        );
      });
      renderMonthPickerRows();
    }

    // Tells update-checker.js whether now is a safe moment to auto-reload
    // this page. It's NOT safe while the Add/Edit Work modal, the month
    // picker, or the log type/mic box is open — reloading then would wipe
    // out whatever you were in the middle of typing, which is exactly the
    // bug this exists to prevent.
    window.isSafeToAutoReload = function () {
      return dimOverlay.hidden && logInputRow.hidden;
    };

    // ============ LOAD + LIVE SYNC ============
    // First: make sure this person's document exists (create it with the
    // seed data if this is genuinely the first time). Then: listen for any
    // change to it, forever — that's what makes edits show up live on
    // other tabs/devices without anyone hitting refresh.
    personDocRef.get().then(snap => {
      if (!snap.exists) {
        return personDocRef.set({ months: buildSeedMonths(), dailyLog: [] });
      }
    }).then(() => {
      personDocRef.onSnapshot(snap => {
        const data = snap.data() || {};
        monthsData = data.months || {};
        logEntries = data.dailyLog || [];
        renderMonth(currentMonth);
        renderLogHistory();
      });
    }).catch(err => {
      console.error('Could not connect to Firestore:', err);
    });

    // Read-only live listeners on the other two people's docs, purely to
    // pick up anything they've assigned to whoever's page this is. This is
    // what makes the Assign feature actually work — without this, an
    // assignment was just a label nobody but the assigner ever saw.
    otherPeople.forEach((owner) => {
      otherPersonDocRefs[owner].onSnapshot((snap) => {
        const data = snap.data() || {};
        otherPeopleMonthsData[owner] = data.months || {};
        renderMonth(currentMonth);
      });
    });
  
});
